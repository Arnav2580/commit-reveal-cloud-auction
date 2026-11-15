(() => {
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const roomCode = (query.get('room') || '').toUpperCase();
  const hostKey = code => `cloudauction:host:${code}`;
  const bidderKey = code => `cloudauction:bidder:${code}`;
  let room = null, hostToken = '', participantToken = '', pollTimer = null, clockTimer = null;

  const headers = (host = false, participant = false) => ({
    ...(host && hostToken ? {'X-Host-Token':hostToken} : {}),
    ...(participant && participantToken ? {'X-Participant-Token':participantToken} : {})
  });
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not contact the classroom server.');
    return data;
  }
  function toast(message, kind = '') {
    const node = document.createElement('div'); node.className = `toast ${kind}`; node.textContent = message; $('toastRegion').append(node); setTimeout(() => node.remove(), 4500);
  }
  function setBusy(button, busy, label) {
    if (busy) { button.disabled = true; button.dataset.old = button.textContent; button.textContent = label; }
    else { button.disabled = false; button.textContent = button.dataset.old || button.textContent; }
  }
  function showNotice(message) { $('notice').textContent = message; $('notice').classList.remove('hidden'); }
  function hideNotice() { $('notice').classList.add('hidden'); }
  function formatTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`;
  }
  function updateCountdown() {
    if (!room || room.phase !== 'open' || !room.closesAt) { $('countdown').textContent=''; return; }
    const remaining = room.closesAt - Date.now(); $('countdown').textContent=`${formatTime(remaining)} remaining`;
    if (remaining <= 0) refreshRoom().catch(() => {});
  }
  function showView() { $('createView').classList.add('hidden'); $('roomView').classList.remove('hidden'); }
  function getInvite() { return `${location.origin}/?room=${encodeURIComponent(room.code)}`; }
  function phaseLabel(value) { return ({waiting:'WAITING FOR ORGANIZER',open:'BIDDING OPEN',closed:'BIDDING CLOSED',finalized:'RESULTS REVEALED'})[value] || value.toUpperCase(); }
  function renderResults(data) {
    $('resultsPanel').classList.remove('hidden');
    $('winnerHeadline').textContent = data.winner ? `${data.winner} wins the resource` : 'No eligible bids this round';
    const results = $('resultsList'); results.replaceChildren();
    for (const [index, item] of (data.results || []).entries()) {
      const row = document.createElement('div'); row.className=`result-row${item.winner?' winner':''}`;
      const rank=document.createElement('span'); rank.className='rank'; rank.textContent=String(index+1).padStart(2,'0');
      const name=document.createElement('strong'); name.textContent=item.name;
      const amount=document.createElement('b'); amount.textContent=`${item.bid} pts`;
      row.append(rank,name,amount); if(item.winner){const badge=document.createElement('small');badge.textContent='WINNER';row.append(badge);} results.append(row);
    }
    if (data.isHost && data.hostSummary) renderHostRoster(data.hostSummary.participants);
  }
  function renderHostRoster(list) {
    const target=$('hostRoster'); target.replaceChildren(); target.classList.remove('hidden');
    const title=document.createElement('div'); title.className='kicker'; title.textContent='ORGANIZER ROSTER'; target.append(title);
    for (const person of list) {
      const line=document.createElement('div'); line.className='roster-row';
      const identity=document.createElement('span'); identity.textContent=`${person.name} · ${person.studentId}`;
      const bid=document.createElement('b'); bid.textContent=person.bid === null ? 'No bid' : person.eligible ? `${person.bid} pts` : 'Outside private limit';
      line.append(identity,bid); target.append(line);
    }
  }
  function render() {
    if (!room) return;
    showView();
    $('roomTitleDisplay').textContent=room.title; $('resourceDisplay').textContent=room.resource; $('roomCode').textContent=room.code;
    $('roomRole').textContent=room.isHost?'ORGANIZER VIEW':'PARTICIPANT VIEW';
    $('phaseBadge').textContent=phaseLabel(room.phase); $('phaseBadge').dataset.phase=room.phase;
    $('participantCount').textContent=room.participantCount; $('bidCount').textContent=room.bidCount;
    $('hostQr').classList.toggle('hidden',!room.isHost);
    $('hostActions').classList.toggle('hidden',!room.isHost);
    $('joinPanel').classList.toggle('hidden',room.isHost || room.phase==='finalized');
    $('hostRoster').classList.add('hidden'); $('resultsPanel').classList.toggle('hidden',room.phase!=='finalized');
    $('startButton').classList.toggle('hidden',room.phase!=='waiting');
    $('closeButton').classList.toggle('hidden',room.phase!=='open');
    $('finalizeButton').classList.toggle('hidden',room.phase!=='closed');
    $('startButton').disabled=room.participantCount===0;
    $('hostHint').textContent=room.phase==='waiting'?'Share the QR, then open bidding when the class is ready.':room.phase==='open'?'Bidding is live. Close it early or wait for the timer.':room.phase==='closed'?'Reveal results to select the highest eligible bid.':'The final result is visible to everyone.';
    $('participantList').replaceChildren();
    if (!room.isHost && room.participantCount>0) {
      const joined=document.createElement('p'); joined.className='muted small'; joined.textContent='Participants are in the room. Names stay private until the auction result.'; $('participantList').append(joined);
    } else if (room.isHost && room.phase!=='finalized') {
      const joined=document.createElement('p'); joined.className='muted small'; joined.textContent=`${room.participantCount} classroom entr${room.participantCount===1?'y':'ies'} registered.`; $('participantList').append(joined);
    }
    if (room.isHost) { $('registerFormWrap').classList.add('hidden'); $('bidFormWrap').classList.add('hidden'); }
    else {
      const mine=room.myParticipant;
      $('registerFormWrap').classList.toggle('hidden',Boolean(mine)); $('bidFormWrap').classList.toggle('hidden',!mine);
      if (mine) {
        $('welcomeName').textContent=`Welcome, ${mine.name}`;
        $('bidButton').disabled=room.phase!=='open'||mine.hasBid;
        $('bidButton').innerHTML=mine.hasBid?'Bid sealed ✓':'Submit sealed bid <span>→</span>';
        if (mine.hasBid && room.phase!=='finalized') { $('bidReceipt').textContent='Your bid is sealed. Your eligibility will be checked after the organizer closes the room.'; $('bidReceipt').classList.remove('hidden'); }
        else if (mine.hasBid && room.phase==='finalized') { $('bidReceipt').textContent=mine.eligible?`Your ${mine.bid} point bid was eligible.`:`Your ${mine.bid} point bid was outside your private limit.`; $('bidReceipt').classList.remove('hidden'); }
        else $('bidReceipt').classList.add('hidden');
      }
    }
    if (room.phase==='finalized') renderResults(room);
    if (room.isHost && room.phase==='finalized' && room.hostSummary) renderHostRoster(room.hostSummary.participants);
    updateCountdown();
  }
  async function refreshRoom() {
    const response=await api(`/api/rooms/${encodeURIComponent(roomCode)}`,{headers:headers(true,true)});
    room=response.room; render();
  }
  async function createRoom(event) {
    event.preventDefault(); const button=$('createButton'); setBusy(button,true,'Creating room…'); hideNotice();
    try {
      const data=await api('/api/rooms',{method:'POST',body:JSON.stringify({title:$('roomTitle').value.trim(),resource:$('resource').value.trim(),durationSeconds:Number($('duration').value)})});
      room=data.room; hostToken=data.hostToken; localStorage.setItem(hostKey(room.code),hostToken);
      history.replaceState({},'',`/?room=${encodeURIComponent(room.code)}`); await loadRoom(); toast('Room created. Share the QR code with your class.','success');
    } catch(err) { showNotice(err.message); }
    finally { setBusy(button,false); }
  }
  async function loadRoom() {
    hostToken=localStorage.getItem(hostKey(roomCode))||'';
    participantToken=localStorage.getItem(bidderKey(roomCode))||'';
    const data=await api(`/api/rooms/${encodeURIComponent(roomCode)}`,{headers:headers(true,true)});
    room=data.room;
    if(room.isHost) hostToken=localStorage.getItem(hostKey(roomCode))||'';
    render();
    const invite=getInvite(); $('qrImage').src=`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(invite)}`;
    if(pollTimer)clearInterval(pollTimer); pollTimer=setInterval(()=>refreshRoom().catch(()=>{}),2500);
    if(clockTimer)clearInterval(clockTimer); clockTimer=setInterval(updateCountdown,1000);
  }
  async function joinRoom(event) {
    event.preventDefault(); const button=$('joinForm').querySelector('button'); setBusy(button,true,'Joining…'); hideNotice();
    try {
      const data=await api(`/api/rooms/${encodeURIComponent(roomCode)}/join`,{method:'POST',body:JSON.stringify({name:$('bidderName').value.trim(),studentId:$('studentId').value.trim()})});
      participantToken=data.participantToken; localStorage.setItem(bidderKey(roomCode),participantToken); room=data.room; render(); toast('You are in. Wait for the organizer to open bidding.','success');
    } catch(err) { showNotice(err.message); }
    finally { setBusy(button,false); }
  }
  async function submitBid(event) {
    event.preventDefault(); const button=$('bidButton'); setBusy(button,true,'Sealing bid…'); hideNotice();
    try {
      const data=await api(`/api/rooms/${encodeURIComponent(roomCode)}/bid`,{method:'POST',headers:headers(false,true),body:JSON.stringify({bid:Number($('bidAmount').value)})});
      room=data.room; render(); toast(data.message,'success',6000);
    } catch(err) { showNotice(err.message); }
    finally { setBusy(button,false); render(); }
  }
  async function hostAction(action) {
    const button=$(action==='start'?'startButton':action==='close'?'closeButton':'finalizeButton'); setBusy(button,true,'Please wait…'); hideNotice();
    try { const data=await api(`/api/rooms/${encodeURIComponent(roomCode)}/${action}`,{method:'POST',headers:headers(true),body:'{}'}); room=data.room; render(); toast(action==='start'?'Bidding is open.':action==='close'?'Bidding is closed.':'Results are revealed.','success'); }
    catch(err) { showNotice(err.message); }
    finally { setBusy(button,false); render(); }
  }
  async function shareInvite() {
    const link=getInvite();
    try { if(navigator.share) await navigator.share({title:`Join ${room.title}`,text:'Scan or open this classroom auction invite.',url:link}); else { await navigator.clipboard.writeText(link); toast('Invite link copied.','success'); } }
    catch(err) { if(err.name!=='AbortError') toast('Could not share automatically. Copy the room URL from your browser.','error'); }
  }
  $('createForm').addEventListener('submit',createRoom);
  $('joinForm').addEventListener('submit',joinRoom);
  $('bidForm').addEventListener('submit',submitBid);
  $('startButton').addEventListener('click',()=>hostAction('start'));
  $('closeButton').addEventListener('click',()=>hostAction('close'));
  $('finalizeButton').addEventListener('click',()=>hostAction('finalize'));
  $('shareButton').addEventListener('click',shareInvite);
  $('copyInvite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(getInvite());toast('Invite link copied.','success');}catch{toast('Copy failed. Copy the room URL from your browser.','error');}});
  if (roomCode) loadRoom().catch(err=>{showNotice(err.message);$('createView').classList.remove('hidden');});
})();
