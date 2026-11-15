const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const webRoot = path.join(root, 'web');
const port = Number(process.env.PORT || 4173);
const storeFile = process.env.ROOM_STORE_FILE || path.join(root, 'data', 'rooms.json');
const rooms = new Map();
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxRequestBytes = 12_000;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.pdf':'application/pdf', '.md':'text/markdown; charset=utf-8' };

function makeCode() { return Array.from(crypto.randomBytes(6), n => codeAlphabet[n % codeAlphabet.length]).join(''); }
function token() { return crypto.randomBytes(32).toString('hex'); }
function saveRooms() {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  const tmp = `${storeFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...rooms.values()]));
  fs.renameSync(tmp, storeFile);
}
try { for (const room of JSON.parse(fs.readFileSync(storeFile, 'utf8'))) rooms.set(room.code, room); } catch {}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type':mime['.json'], 'Content-Length':Buffer.byteLength(body), 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin' });
  res.end(body);
}
function error(res, status, message) { json(res, status, { error: message }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''; req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > maxRequestBytes) { reject(new Error('Request is too large.')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Request body must be valid JSON.')); } });
    req.on('error', reject);
  });
}
function getRoom(code) { return rooms.get(String(code || '').toUpperCase()); }
function phaseUpdate(room) {
  if (room.phase === 'open' && Date.now() >= room.closesAt) { room.phase = 'closed'; saveRooms(); }
}
function ownBid(room, participantToken) { return room.participants.find(p => p.token === participantToken); }
function publicRoom(room, participantToken, hostToken) {
  phaseUpdate(room);
  const owner = Boolean(hostToken && hostToken === room.hostToken);
  const me = participantToken ? ownBid(room, participantToken) : null;
  const data = {
    code:room.code, title:room.title, resource:room.resource, phase:room.phase,
    createdAt:room.createdAt, closesAt:room.closesAt, durationSeconds:room.durationSeconds,
    participantCount:room.participants.length, bidCount:room.participants.filter(p => p.bid !== null).length,
    myParticipant:me ? { name:me.name, studentId:me.studentId, hasBid:me.bid !== null, bid:room.phase === 'finalized' ? me.bid : null, eligible:room.phase === 'finalized' ? me.eligible : null, token:me.token } : null,
    isHost:owner
  };
  if (room.phase === 'finalized') {
    data.results = room.participants.filter(p => p.bid !== null && p.eligible).map(p => ({ name:p.name, bid:p.bid, winner:p.token === room.winnerToken })).sort((a,b) => b.bid-a.bid);
    data.winner = room.participants.find(p => p.token === room.winnerToken)?.name || null;
  }
  if (owner) data.hostSummary = {
    participants:room.participants.map(p => ({ name:p.name, studentId:p.studentId, hasBid:p.bid !== null, bid:room.phase === 'finalized' ? p.bid : null, eligible:room.phase === 'finalized' ? p.eligible : null, winning:p.token === room.winnerToken }))
  };
  return data;
}
function asset(res, file, allowedRoot = webRoot) {
  if (!file.startsWith(path.resolve(allowedRoot) + path.sep)) return error(res, 403, 'Forbidden.');
  fs.readFile(file, (err, data) => err ? error(res, 404, 'Not found.') : (res.writeHead(200, { 'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }), res.end(data)));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const body = await readBody(req);
      const title = String(body.title || '').trim(); const resource = String(body.resource || '').trim();
      const durationSeconds = Number(body.durationSeconds);
      if (title.length < 2 || title.length > 60) return error(res, 400, 'Room name must be 2–60 characters.');
      if (resource.length < 4 || resource.length > 160) return error(res, 400, 'Resource description must be 4–160 characters.');
      if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 1800) return error(res, 400, 'Bidding time must be 1–30 minutes.');
      if (rooms.size >= 1000) return error(res, 503, 'The classroom demo is at its room limit.');
      let code; do { code = makeCode(); } while (rooms.has(code));
      const room = { code, title, resource, durationSeconds, createdAt:Date.now(), closesAt:null, phase:'waiting', hostToken:token(), hiddenCenter:crypto.randomInt(70,131), participants:[], winnerToken:null };
      rooms.set(code, room); saveRooms();
      return json(res, 201, { room:publicRoom(room), hostToken:room.hostToken });
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)(?:\/(join|bid|start|close|finalize))?$/i);
    if (match) {
      const room = getRoom(match[1]); if (!room) return error(res, 404, 'This auction room was not found.');
      const action = match[2];
      if (req.method === 'GET' && !action) return json(res, 200, { room:publicRoom(room, req.headers['x-participant-token'], req.headers['x-host-token']) });
      if (req.method !== 'POST' || !action) return error(res, 405, 'Method not allowed.');
      const body = await readBody(req); phaseUpdate(room);
      if (action === 'join') {
        if (room.phase !== 'waiting' && room.phase !== 'open') return error(res, 409, 'This room is no longer accepting participants.');
        const name = String(body.name || '').trim(); const studentId = String(body.studentId || '').trim();
        if (name.length < 2 || name.length > 50) return error(res, 400, 'Enter a name between 2 and 50 characters.');
        if (studentId.length < 1 || studentId.length > 32) return error(res, 400, 'Enter a class or roll ID (up to 32 characters).');
        if (room.participants.some(p => p.studentId.toLocaleLowerCase() === studentId.toLocaleLowerCase())) return error(res, 409, 'That class / roll ID is already registered in this room. Ask the organizer if you need help.');
        const p = { token:token(), name, studentId, cap:Math.max(1, room.hiddenCenter + crypto.randomInt(-30,31)), bid:null, eligible:null, tie:crypto.randomBytes(8).toString('hex') };
        room.participants.push(p); saveRooms(); return json(res, 201, { participantToken:p.token, room:publicRoom(room,p.token) });
      }
      if (action === 'bid') {
        if (!['waiting','open'].includes(room.phase)) return error(res, 409, 'Bidding is closed.');
        if (room.phase !== 'open') return error(res, 409, 'The organizer has not opened bidding yet.');
        const p = ownBid(room, req.headers['x-participant-token']); if (!p) return error(res, 401, 'Join this room before submitting a bid.');
        if (p.bid !== null) return error(res, 409, 'One bid per classroom entry. Your submitted bid cannot be changed.');
        const bid = Number(body.bid);
        if (!Number.isSafeInteger(bid) || bid < 1 || bid > 1000000) return error(res, 400, 'Enter a whole number between 1 and 1,000,000 demo points.');
        p.bid = bid; saveRooms(); return json(res, 201, { message:'Bid sealed. Its eligibility will be checked when the auction closes.', room:publicRoom(room,p.token) });
      }
      if (req.headers['x-host-token'] !== room.hostToken) return error(res, 403, 'Only this room’s organizer can do that.');
      if (action === 'start') {
        if (room.phase !== 'waiting') return error(res, 409, 'Bidding can only be opened once.');
        room.phase='open'; room.closesAt=Date.now()+room.durationSeconds*1000; saveRooms(); return json(res, 200, { room:publicRoom(room,null,room.hostToken) });
      }
      if (action === 'close') {
        if (room.phase !== 'open') return error(res, 409, 'This auction is not open.');
        room.phase='closed'; saveRooms(); return json(res, 200, { room:publicRoom(room,null,room.hostToken) });
      }
      if (action === 'finalize') {
        if (room.phase !== 'closed') return error(res, 409, 'Close the bidding before revealing results.');
        for (const p of room.participants) p.eligible = p.bid !== null && p.bid <= p.cap;
        const eligible = room.participants.filter(p => p.eligible).sort((a,b) => b.bid-a.bid || a.tie.localeCompare(b.tie));
        room.winnerToken=eligible[0]?.token || null; room.phase='finalized'; saveRooms(); return json(res, 200, { room:publicRoom(room,null,room.hostToken) });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return error(res, 405, 'Method not allowed.');
    if (url.pathname.startsWith('/paper/')) { const paperRoot=path.join(root,'paper'); const target=path.resolve(paperRoot,decodeURIComponent(url.pathname.slice('/paper/'.length))); return asset(res,target,paperRoot); }
    const rel=url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.replace(/^\/+/,''));
    return asset(res,path.resolve(webRoot,rel));
  } catch (err) {
    if (res.headersSent) return res.destroy();
    return error(res, 500, err.message || 'The demo server encountered an error.');
  }
});
server.listen(port,'0.0.0.0',() => console.log(`Classroom auction demo listening on port ${port}`));
