const crypto = require('node:crypto');

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const ROOM_TTL_SECONDS = 60 * 60 * 48;
const LOCK_TTL_MS = 10000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function roomKey(code) { return `cloudauction:room:${code}`; }
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function makeCode() { return Array.from(crypto.randomBytes(6), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(''); }
function requireStore() {
  if (!REST_URL || !REST_TOKEN) throw new HttpError(503, 'Room storage is not connected yet. Refresh later or contact the organizer.');
}
async function redis(...command) {
  requireStore();
  const response = await fetch(REST_URL, {
    method:'POST',
    headers:{ Authorization:`Bearer ${REST_TOKEN}`, 'Content-Type':'application/json' },
    body:JSON.stringify(command),
    cache:'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Room storage returned HTTP ${response.status}.`);
  return payload.result;
}
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { throw new HttpError(400,'Request body must be valid JSON.'); } }
  let raw='';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 12000) throw new HttpError(413,'Request body is too large.');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400,'Request body must be valid JSON.'); }
}
async function readRoom(code) {
  const value = await redis('GET', roomKey(code));
  if (!value) throw new HttpError(404,'This auction room was not found.');
  return typeof value === 'string' ? JSON.parse(value) : value;
}
async function saveRoom(room) {
  await redis('SET', roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}
async function withRoomLock(code, operation) {
  const lockKey=`cloudauction:lock:${code}`, lockToken=makeToken();
  let acquired=false;
  for (let attempt=0; attempt<40; attempt++) {
    const result=await redis('SET',lockKey,lockToken,'NX','PX',LOCK_TTL_MS);
    if (result==='OK') { acquired=true; break; }
    await new Promise(resolve=>setTimeout(resolve,20+attempt*10));
  }
  if (!acquired) throw new HttpError(409,'The room is processing another action. Please try again.');
  try { return await operation(); }
  finally {
    try { await redis('EVAL',"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",1,lockKey,lockToken); } catch {}
  }
}
function normalizedPhase(room) { return room.phase==='open' && Date.now()>=room.closesAt ? 'closed' : room.phase; }
function publicRoom(room,participantToken,hostToken) {
  const phase=normalizedPhase(room), owner=Boolean(hostToken && hostToken===room.hostToken);
  const me=participantToken?room.participants.find(p=>p.token===participantToken):null;
  const result={
    code:room.code,title:room.title,resource:room.resource,phase,
    createdAt:room.createdAt,closesAt:room.closesAt,durationSeconds:room.durationSeconds,
    participantCount:room.participants.length,bidCount:room.participants.filter(p=>p.bid!==null).length,
    myParticipant:me?{name:me.name,studentId:me.studentId,hasBid:me.bid!==null,bid:phase==='finalized'?me.bid:null,eligible:phase==='finalized'?me.eligible:null}:null,
    isHost:owner
  };
  if (phase==='finalized') {
    result.results=room.participants.filter(p=>p.bid!==null&&p.eligible).map(p=>({name:p.name,bid:p.bid,winner:p.token===room.winnerToken})).sort((a,b)=>b.bid-a.bid);
    result.winner=room.participants.find(p=>p.token===room.winnerToken)?.name||null;
  }
  if (owner) result.hostSummary={participants:room.participants.map(p=>({name:p.name,studentId:p.studentId,hasBid:p.bid!==null,bid:phase==='finalized'?p.bid:null,eligible:phase==='finalized'?p.eligible:null,winning:p.token===room.winnerToken}))};
  return result;
}
function send(res,status,value) { res.status(status).setHeader('Cache-Control','no-store'); res.json(value); }
function fail(res,error) {
  if (error instanceof HttpError) return send(res,error.status,{error:error.message});
  console.error('Classroom room API error:',error?.message||'Unknown error');
  return send(res,500,{error:'The room server had a problem. Please try again.'});
}

async function create(req,res) {
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return send(res,405,{error:'Method not allowed.'}); }
  try {
    const body=await parseBody(req), title=String(body.title||'').trim(), resource=String(body.resource||'').trim(), durationSeconds=Number(body.durationSeconds);
    if(title.length<2||title.length>60) throw new HttpError(400,'Room name must be 2-60 characters.');
    if(resource.length<4||resource.length>160) throw new HttpError(400,'Resource description must be 4-160 characters.');
    if(!Number.isSafeInteger(durationSeconds)||durationSeconds<60||durationSeconds>1800) throw new HttpError(400,'Bidding time must be 1-30 minutes.');
    for(let attempt=0;attempt<5;attempt++) {
      const code=makeCode();
      const room={code,title,resource,durationSeconds,createdAt:Date.now(),closesAt:null,phase:'waiting',hostToken:makeToken(),hiddenCenter:crypto.randomInt(70,131),participants:[],winnerToken:null};
      const result=await redis('SET',roomKey(code),JSON.stringify(room),'EX',ROOM_TTL_SECONDS,'NX');
      if(result==='OK') return send(res,201,{room:publicRoom(room),hostToken:room.hostToken});
    }
    throw new HttpError(503,'Could not create a unique room code. Try again.');
  } catch(error) { return fail(res,error); }
}

async function route(req,res,pathParts) {
  const code=String(pathParts[0]||'').toUpperCase(), action=pathParts[1]||'';
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return send(res,400,{error:'The room code is invalid.'});
  if(req.method==='GET'&&!action) {
    try { const room=await readRoom(code); return send(res,200,{room:publicRoom(room,req.headers['x-participant-token'],req.headers['x-host-token'])}); }
    catch(error) { return fail(res,error); }
  }
  if(req.method!=='POST'||!action) { res.setHeader('Allow',action?'POST':'GET, POST'); return send(res,405,{error:'Method not allowed.'}); }
  if(!['join','bid','start','close','finalize'].includes(action)) return send(res,404,{error:'This room action was not found.'});
  try {
    const body=await parseBody(req);
    return await withRoomLock(code,async()=>{
      const room=await readRoom(code); let phase=normalizedPhase(room);
      if(action==='join') {
        if(!['waiting','open'].includes(phase)) throw new HttpError(409,'This room is no longer accepting participants.');
        const name=String(body.name||'').trim(), studentId=String(body.studentId||'').trim();
        if(name.length<2||name.length>50) throw new HttpError(400,'Enter a name between 2 and 50 characters.');
        if(studentId.length<1||studentId.length>32) throw new HttpError(400,'Enter a class or roll ID (up to 32 characters).');
        if(room.participants.some(p=>p.studentId.toLocaleLowerCase()===studentId.toLocaleLowerCase())) throw new HttpError(409,'That class / roll ID is already registered in this room. Ask the organizer if you need help.');
        const participant={token:makeToken(),name,studentId,cap:Math.max(1,room.hiddenCenter+crypto.randomInt(-30,31)),bid:null,eligible:null,tie:crypto.randomBytes(8).toString('hex')};
        room.participants.push(participant); await saveRoom(room);
        return send(res,201,{participantToken:participant.token,room:publicRoom(room,participant.token)});
      }
      if(action==='bid') {
        if(phase!=='open') throw new HttpError(409,phase==='waiting'?'The organizer has not opened bidding yet.':'Bidding is closed.');
        const participant=room.participants.find(p=>p.token===req.headers['x-participant-token']);
        if(!participant) throw new HttpError(401,'Join this room before submitting a bid.');
        if(participant.bid!==null) throw new HttpError(409,'One bid per classroom entry. Your submitted bid cannot be changed.');
        const bid=Number(body.bid);
        if(!Number.isSafeInteger(bid)||bid<1||bid>1000000) throw new HttpError(400,'Enter a whole number between 1 and 1,000,000 demo points.');
        participant.bid=bid; await saveRoom(room);
        return send(res,201,{message:'Bid sealed. Its eligibility will be checked when the auction closes.',room:publicRoom(room,participant.token)});
      }
      if(req.headers['x-host-token']!==room.hostToken) throw new HttpError(403,'Only this room organizer can do that.');
      if(action==='start') {
        if(phase!=='waiting') throw new HttpError(409,'Bidding can only be opened once.');
        if(room.participants.length===0) throw new HttpError(409,'At least one student must join before bidding can open.');
        room.phase='open';room.closesAt=Date.now()+room.durationSeconds*1000;await saveRoom(room);
        return send(res,200,{room:publicRoom(room,null,room.hostToken)});
      }
      if(action==='close') {
        if(phase!=='open') throw new HttpError(409,'This auction is not open.');
        room.phase='closed';await saveRoom(room);return send(res,200,{room:publicRoom(room,null,room.hostToken)});
      }
      if(action==='finalize') {
        if(phase!=='closed') throw new HttpError(409,'Close the bidding before revealing results.');
        for(const participant of room.participants) participant.eligible=participant.bid!==null&&participant.bid<=participant.cap;
        const eligible=room.participants.filter(p=>p.eligible).sort((a,b)=>b.bid-a.bid||a.tie.localeCompare(b.tie));
        room.winnerToken=eligible[0]?.token||null;room.phase='finalized';await saveRoom(room);
        return send(res,200,{room:publicRoom(room,null,room.hostToken)});
      }
    });
  } catch(error) { return fail(res,error); }
}

module.exports={create,route};
