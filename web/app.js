(() => {
  const { ethers } = window;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const preferredNetwork = params.get('network') === 'localhost' || params.get('chainId') === '31337' ? 'localhost' : 'sepolia';
  const state = { network: preferredNetwork, networkChosen:params.has('network')||params.has('chainId'), address: params.get('address') || '', provider: null, readProvider: null, readContract: null, signer: null, contract: null, account: '', abi: null, phase: null, auction: null, clockOffset: 0, refreshTimer: null, countdownTimer: null, events: [] };
  const NETWORKS = {
    sepolia: { chainId: 11155111, hexChainId: '0xaa36a7', name: 'Sepolia', currency: 'SepoliaETH', rpc: 'https://rpc.sepolia.org', explorer: 'https://sepolia.etherscan.io' },
    localhost: { chainId: 31337, hexChainId: '0x7a69', name: 'Local Hardhat', currency: 'ETH', rpc: `${location.protocol}//${location.hostname || '127.0.0.1'}:8545`, explorer: '' }
  };
  const secretKey = () => `cloudauction:v1:${NETWORKS[state.network].chainId}:${state.address.toLowerCase()}:${state.account.toLowerCase()}`;
  const secretIdentityKey = (address) => `cloudauction:v1:${NETWORKS[state.network].chainId}:${state.address.toLowerCase()}:${address.toLowerCase()}`;
  const participantKey = () => `cloudauction:participant:v1:${NETWORKS[state.network].chainId}:${state.address.toLowerCase()}`;
  const shorten = (s, a = 6, b = 4) => s ? `${s.slice(0, a)}…${s.slice(-b)}` : '—';
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function toast(message, kind = '', duration = 4200) {
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = message; $('toastRegion').append(el); setTimeout(() => el.remove(), duration);
  }
  function notice(message, kind = '') {
    const el = $('globalNotice'); el.textContent = message; el.className = `notice ${kind}`;
  }
  function hideNotice() { $('globalNotice').className = 'notice hidden'; }
  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) { button.dataset.original = button.innerHTML; button.disabled = true; button.innerHTML = `<span class="spinner"></span>${escapeHtml(label || 'Waiting for wallet…')}`; }
    else { button.disabled = false; if (button.dataset.original) button.innerHTML = button.dataset.original; }
  }
  function currentInviteUrl() {
    const url = new URL(location.href); url.search = ''; url.hash = '';
    url.searchParams.set('network', state.network);
    if (state.address) url.searchParams.set('address', state.address);
    url.hash = 'bidCard';
    return url.toString();
  }
  function participantProfile() {
    return { name: $('participantName').value.trim(), identifier: $('participantId').value.trim() };
  }
  function participantReady(profile = participantProfile()) {
    return profile.name.length >= 2 && profile.name.length <= 50 && profile.identifier.length >= 1 && profile.identifier.length <= 32;
  }
  function updateParticipantProfile() {
    const profile = participantProfile();
    let stored = false;
    try {
      if (state.address) { localStorage.setItem(participantKey(), JSON.stringify(profile)); stored = true; }
    } catch {}
    if (participantReady(profile) && stored) $('participantStatus').textContent = 'Details saved only in this browser. The organizer and other bidders do not receive them; the public chain shows your wallet address.';
    else if (participantReady(profile)) $('participantStatus').textContent = 'Details are complete, but browser storage is unavailable. Enable local storage before bidding.';
    else $('participantStatus').textContent = 'Enter your name and class / roll ID to enable bidding. These details stay in this browser.';
    updateBidMeter();
  }
  function loadParticipantProfile() {
    let profile = {};
    try { profile = JSON.parse(localStorage.getItem(participantKey()) || '{}'); } catch {}
    $('participantName').value = typeof profile.name === 'string' ? profile.name.slice(0, 50) : '';
    $('participantId').value = typeof profile.identifier === 'string' ? profile.identifier.slice(0, 32) : '';
    updateParticipantProfile();
  }
  function updateQr() {
    const target = currentInviteUrl(); $('shareUrlLabel').textContent = state.address ? target : 'Choose a contract address to create an invite';
    $('copyLink').disabled = !state.address;
    const host = $('qrCode'); host.replaceChildren();
    if (!state.address) { host.innerHTML = '<div class="qr-placeholder"><span>⌁</span><small>Choose an auction to create<br>your classroom invite</small></div>'; return; }
    const image=document.createElement('img'); image.alt='QR code linking to this public classroom auction'; image.width=132; image.height=132; image.referrerPolicy='no-referrer';
    image.src=`https://api.qrserver.com/v1/create-qr-code/?size=264x264&margin=8&data=${encodeURIComponent(target)}`;
    image.onerror=()=>{host.innerHTML='<div class="qr-placeholder"><span>↗</span><small>QR service unavailable.<br>Copy the invite link below.</small></div>';}; host.append(image);
  }
  function parseAbiPayload(payload) {
    const abi=Array.isArray(payload)?payload:payload?.abi;
    if(!Array.isArray(abi)||abi.length===0) throw new Error('The auction ABI is missing or invalid. Recompile the contract and refresh the app.');
    return abi;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Invite link copied.', 'success'); }
    catch { const el = document.createElement('textarea'); el.value = text; document.body.append(el); el.select(); document.execCommand('copy'); el.remove(); toast('Invite link copied.', 'success'); }
  }
  function showShare() {
    if (!state.address) { $('auctionDialog').showModal(); return; }
    const url = currentInviteUrl(); $('dialogUrl').textContent = url; $('shareDialog').showModal();
  }
  function openAuctionDialog() { $('auctionAddressInput').value = state.address; $('auctionDialog').showModal(); }
  function saveAddress() {
    const value = $('auctionAddressInput').value.trim();
    if (!ethers.isAddress(value)) { toast('Enter a valid 0x contract address.', 'error'); return; }
    state.address = ethers.getAddress(value); localStorage.setItem(`cloudauction:address:${state.network}`, state.address); loadParticipantProfile();
    const url = new URL(location.href); url.searchParams.set('address', state.address); url.searchParams.set('network', state.network); history.replaceState({}, '', url);
    $('auctionDialog').close(); updateQr(); resetConnection(); loadReadOnly();
  }
  function loadAddress() {
    if (!state.address) state.address = localStorage.getItem(`cloudauction:address:${state.network}`) || '';
    if (state.address && ethers.isAddress(state.address)) state.address = ethers.getAddress(state.address); else state.address = '';
    if(state.address) localStorage.setItem(`cloudauction:address:${state.network}`,state.address);
    loadParticipantProfile(); updateQr();
    if(state.address) loadReadOnly();
  }
  async function loadDeploymentDefault() {
    if(state.address) return;
    try {
      const response=await fetch('/deployments.json'); if(!response.ok) return;
      const deployments=await response.json();
      const host=location.hostname;
      const localHost=host==='localhost'||host==='127.0.0.1'||/^192\.168\./.test(host)||/^10\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if(!state.networkChosen&&localHost&&deployments.localhost?.address){state.network='localhost';$('networkSelect').value='localhost';}
      const entry=deployments[state.network];
      if(!entry?.address || !ethers.isAddress(entry.address)) return;
      state.address=ethers.getAddress(entry.address); localStorage.setItem(`cloudauction:address:${state.network}`,state.address);
      loadParticipantProfile();
      const url=new URL(location.href); url.searchParams.set('address',state.address); url.searchParams.set('network',state.network); history.replaceState({},'',url);
      updateQr(); await loadReadOnly();
    } catch {}
  }
  async function loadReadOnly() {
    try {
      const response=await fetch('/auction-abi.json'); if(!response.ok) throw new Error('Contract ABI is unavailable. Recompile the contract and refresh the app.');
      const artifact=await response.json(); state.abi=parseAbiPayload(artifact);
      const target=NETWORKS[state.network]; state.readProvider=new ethers.JsonRpcProvider(target.rpc,target.chainId,{staticNetwork:true});
      state.readContract=new ethers.Contract(state.address,state.abi,state.readProvider); state.contract=state.readContract; state.provider=null;
      $('chainLabel').textContent=`${target.name} · read only`; await refreshAuction(); startPolling();
    } catch(err) { $('chainLabel').textContent=`${NETWORKS[state.network].name} · offline`; notice(`Could not read this auction. Check its address and selected network. ${friendlyError(err)}`,'error'); }
  }
  async function ensureNetwork() {
    const target = NETWORKS[state.network];
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (parseInt(current, 16) === target.chainId) return;
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target.hexChainId }] }); }
    catch (err) {
      if (err.code !== 4902) throw err;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: target.hexChainId, chainName: target.name, nativeCurrency: { name: target.currency, symbol: 'ETH', decimals: 18 }, rpcUrls: [target.rpc], ...(target.explorer ? { blockExplorerUrls: [target.explorer] } : {}) }] });
    }
  }
  async function connectWallet(ask = true) {
    if (!window.ethereum) { notice('No browser wallet was detected. Install a compatible wallet, or open this link inside your wallet browser.', 'error'); toast('Wallet provider not found.', 'error'); return; }
    if (!state.address) { openAuctionDialog(); return; }
    const button = $('connectButton'); if (ask) setBusy(button, true, 'Connecting…');
    try {
      await ensureNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = ask ? await provider.send('eth_requestAccounts', []) : await provider.send('eth_accounts', []);
      if (!accounts.length) { if (ask) throw new Error('No wallet account was selected.'); return; }
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== NETWORKS[state.network].chainId) throw new Error(`Please connect to ${NETWORKS[state.network].name}.`);
      const response = await fetch('/auction-abi.json'); if (!response.ok) throw new Error('Could not load the auction interface. Refresh the static app files.');
      const artifact = await response.json(); state.abi = parseAbiPayload(artifact);
      state.provider = provider; state.signer = await provider.getSigner(); state.account = ethers.getAddress(accounts[0]);
      state.contract = new ethers.Contract(state.address, state.abi, state.signer);
      button.classList.add('connected'); $('walletLabel').textContent = shorten(state.account, 6, 4);
      $('walletPrompt').classList.add('hidden'); $('chainLabel').textContent = `${NETWORKS[state.network].name} · ${shorten(state.address, 6, 4)}`;
      hideNotice(); await refreshAuction(); startPolling();
      toast(`Connected to ${NETWORKS[state.network].name}.`, 'success');
    } catch (err) {
      resetConnection(); const message = friendlyError(err); notice(message, 'error'); if (ask) toast(message, 'error');
    } finally { setBusy(button, false); }
  }
  function resetConnection() {
    if (state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer = null;
    state.contract = state.readContract; state.provider = null; state.signer = null; state.account = ''; state.auction = null;
    $('connectButton').classList.remove('connected'); $('walletLabel').textContent = 'Connect wallet'; $('walletPrompt').classList.remove('hidden');
    $('chainLabel').textContent = 'Not connected'; $('commitButton').disabled = true; renderStatus(null); renderParticipation(null); renderResult(null); renderActivity([]);
  }
  function friendlyError(err) {
    const raw = err?.shortMessage || err?.reason || err?.message || 'Something went wrong.';
    if (/user rejected|user denied|rejected the request/i.test(raw)) return 'Wallet request cancelled. You can try again when ready.';
    if (/could not coalesce|missing revert data/i.test(raw)) return 'The transaction was rejected by the auction. Check the phase, bid limit, and whether this wallet already committed.';
    if (/network|chain|RPC/i.test(raw) && /wrong|unsupported|failed|disconnected/i.test(raw)) return `Check your wallet network and RPC connection for ${NETWORKS[state.network].name}.`;
    return raw.length > 180 ? `${raw.slice(0,177)}…` : raw;
  }
  async function refreshAuction() {
    if (!state.contract || !(state.provider || state.readProvider)) return;
    try {
      const c = state.contract, p = state.provider || state.readProvider;
      const [phase, commitEnd, revealEnd, maxBid, count, resource, result, latest] = await Promise.all([
        c.phase(), c.commitEnd(), c.revealEnd(), c.maxBid(), c.committedBidderCount(), c.getResource(), c.getAuctionResult(), p.getBlock('latest')
      ]);
      state.phase = Number(phase); state.commitEnd = Number(commitEnd); state.revealEnd = Number(revealEnd); state.maxBid = maxBid; state.clockOffset = Number(latest.timestamp) * 1000 - Date.now();
      state.resource = resource; state.result = result;
      const bidder = state.account ? await c.bidders(state.account) : { committed:false, revealed:false, commitment:ethers.ZeroHash, bid:0n };
      state.myBidder = bidder;
      renderStatus({ phase: state.phase, count: Number(count), maxBid, commitEnd: state.commitEnd, revealEnd: state.revealEnd });
      renderResource(resource, result);
      renderParticipation(bidder);
      renderResult(result);
      renderOrganizer();
      await refreshEvents();
      $('lastUpdated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      renderCountdown();
    } catch (err) {
      const message = friendlyError(err); $('chainLabel').textContent = 'Auction unavailable'; notice(`Could not read this contract. Check the address and selected network. ${message}`, 'error');
    }
  }
  function renderStatus(data) {
    const pill = $('phasePill');
    if (!data) { pill.className = 'phase-pill offline'; $('phaseLabel').textContent = 'Not connected'; $('countdown').textContent = '--:--'; $('bidderCount').innerHTML = '— <small>participants</small>'; $('limitLabel').innerHTML = '— <small>demo units</small>'; $('limitMeter').style.width = '0%'; return; }
    pill.className = `phase-pill ${data.phase === 1 ? 'reveal' : data.phase === 2 ? 'finalized' : ''}`;
    $('phaseLabel').textContent = ['Commit open', 'Reveal open', 'Finalized'][data.phase] || 'Unknown';
    $('bidderCount').innerHTML = `${data.count} <small>${data.count === 1 ? 'wallet' : 'wallets'}</small>`;
    $('limitLabel').innerHTML = `${formatAmount(data.maxBid)} <small>demo units</small>`;
    $('maxBidInline').textContent = `${formatAmount(data.maxBid)} units`;
    const input = $('bidInput'); input.max = ethers.formatEther(data.maxBid);
    updateBidMeter();
  }
  function formatAmount(value, maxFraction = 2) {
    try { return Number(ethers.formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: maxFraction }); } catch { return '—'; }
  }
  function renderCountdown() {
    if (state.phase == null) return;
    let remain = state.phase === 0 ? state.commitEnd * 1000 - (Date.now() + state.clockOffset) : state.phase === 1 ? state.revealEnd * 1000 - (Date.now() + state.clockOffset) : 0;
    remain = Math.max(0, remain); const total = Math.floor(remain / 1000);
    $('countdown').textContent = state.phase === 2 ? 'Complete' : `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  }
  function renderResource(resource, result) {
    const [id, description, allocated] = resource;
    $('resourceName').textContent = String(description).split('|')[0].trim() || `Resource ${String(id).padStart(3,'0')}`;
    $('resourceDescription').textContent = description;
    $('specCpu').textContent=(String(description).match(/\b\d+\s*(?:v?CPU|cores?)\b/i)||[])[0]||'—';
    $('specMemory').textContent=(String(description).match(/\b\d+\s*(?:GB|TB)\s*RAM\b/i)||[])[0]||'—';
    $('specStorage').textContent=(String(description).match(/\b\d+\s*(?:GB|TB)\s*(?:storage|disk)\b/i)||[])[0]||'—';
    $('specDuration').textContent=(String(description).match(/\b\d+\s*(?:hours?|hrs?)\b/i)||[])[0]||'—';
    $('resourceId').textContent = `RESOURCE / ${String(id).padStart(3,'0')}`;
    $('allocationDot').classList.toggle('allocated', allocated);
    $('allocationLabel').textContent = allocated ? 'Allocated to winning bidder' : 'Waiting for allocation';
  }
  function loadSavedSecret() {
    try { return JSON.parse(localStorage.getItem(secretKey()) || 'null'); } catch { return null; }
  }
  function saveSecret(secret) { localStorage.setItem(secretKey(), JSON.stringify(secret)); }
  function renderParticipation(bidder) {
    const committed = Boolean(bidder?.committed), revealed = Boolean(bidder?.revealed);
    $('participantFields').classList.toggle('hidden', !state.address || committed || state.phase !== 0);
    $('commitPanel').classList.toggle('hidden', committed || !state.account || state.phase !== 0);
    $('committedPanel').classList.toggle('hidden', !committed);
    $('walletPrompt').classList.toggle('hidden', Boolean(state.account));
    $('stepNumber').textContent = state.phase === 0 ? '01' : '02';
    if (!state.account) { $('commitPanel').classList.add('hidden'); $('committedPanel').classList.add('hidden'); $('walletPrompt').classList.remove('hidden'); $('bidHeading').textContent = 'Place a sealed bid'; $('bidSubheading').textContent = 'Connect a wallet to participate in this auction.'; return; }
    if (state.phase === 1 && !committed) { $('commitPanel').classList.add('hidden'); $('committedPanel').classList.add('hidden'); $('bidHeading').textContent = 'Reveal phase is open'; $('bidSubheading').textContent = 'A commitment is required before the reveal phase begins.'; $('walletPrompt').classList.remove('hidden'); $('walletPrompt').querySelector('span:nth-child(2)').textContent = 'Your connected wallet did not commit in this auction.'; $('promptConnect').classList.add('hidden'); return; }
    if (state.phase === 2 && !committed) { $('commitPanel').classList.add('hidden'); $('committedPanel').classList.add('hidden'); $('bidHeading').textContent = 'Auction finalized'; $('bidSubheading').textContent = 'The final allocation is recorded on-chain.'; $('walletPrompt').classList.add('hidden'); return; }
    $('bidHeading').textContent = committed ? 'Your sealed bid' : state.phase === 0 ? 'Place a sealed bid' : 'Reveal your bid';
    $('bidSubheading').textContent = committed ? 'Your commitment is on-chain. Keep your recovery file safe.' : 'Set your maximum value. No one can see it during the commit phase.';
    if (committed) {
      const saved = loadSavedSecret();
      $('commitHashLabel').textContent = saved?.commitment ? `Commitment ${shorten(saved.commitment, 12, 8)}` : 'Commitment detected. Restore your bid secret from the recovery file.';
      $('revealReady').classList.toggle('hidden', state.phase !== 1 || revealed);
      $('revealedState').classList.toggle('hidden', !revealed);
      $('downloadSecret').disabled = !saved;
      $('importSecretButton').textContent = saved ? 'Replace recovery file' : 'Restore a bid';
      if (state.phase === 2 && !revealed) { $('revealReady').classList.add('hidden'); $('commitHashLabel').textContent = 'Reveal phase closed. This wallet did not reveal a valid bid.'; }
    }
    $('walletPrompt').classList.add('hidden');
  }
  function updateBidMeter() {
    const max = state.maxBid ? Number(ethers.formatEther(state.maxBid)) : 0; const val = Number($('bidInput').value || 0);
    const pct = max > 0 ? Math.max(0, Math.min(100, val / max * 100)) : 0;
    $('limitMeter').style.width = `${pct}%`; $('limitMeter').classList.toggle('near-limit', pct > 80);
    const valid = state.phase === 0 && Number.isFinite(val) && val > 0 && val <= max && participantReady();
    $('commitButton').disabled = !valid || !state.account;
  }
  function renderResult(result) {
    const finalized = Number(result?.[0]) === 2;
    $('resultPlaceholder').classList.toggle('hidden', finalized);
    $('resultDetails').classList.toggle('hidden', !finalized || result[1] === ethers.ZeroAddress);
    $('resultStamp').textContent = finalized ? 'FINAL' : 'SEALED'; $('resultStamp').classList.toggle('done', finalized);
    $('finalizeButton').classList.toggle('hidden', !state.account || state.phase !== 1 || Date.now() + state.clockOffset < state.revealEnd * 1000);
    if (finalized) {
      $('resultPlaceholder').classList.toggle('hidden', result[1] !== ethers.ZeroAddress);
      $('winningBid').textContent = `${formatAmount(result[2])} demo units`;
      $('winnerAddress').textContent = result[1];
    }
  }
  async function renderActivityFromChain() {
    if (!state.contract) return [];
    const latest = await (state.provider || state.readProvider).getBlockNumber(); const from = Math.max(0, latest - 9000); const c = state.contract;
    const [commits, reveals, starts, finishes] = await Promise.all([
      c.queryFilter(c.filters.BidCommitted(), from, latest), c.queryFilter(c.filters.BidRevealed(), from, latest),
      c.queryFilter(c.filters.RevealPhaseStarted(), from, latest), c.queryFilter(c.filters.AuctionFinalized(), from, latest)
    ]);
    const events = [];
    for (const e of commits) events.push({ kind:'commit', address:e.args.bidder, block:e.blockNumber, hash:e.args.commitment });
    for (const e of reveals) events.push({ kind:'reveal', address:e.args.bidder, block:e.blockNumber });
    for (const e of starts) events.push({ kind:'phase', address:'Auctioneer', block:e.blockNumber });
    for (const e of finishes) events.push({ kind:'final', address:'Auctioneer', block:e.blockNumber });
    return events.sort((a,b)=>b.block-a.block).slice(0,8);
  }
  async function refreshEvents() {
    try { state.events = await renderActivityFromChain(); } catch { state.events = []; }
    renderActivity(state.events);
  }
  function renderActivity(events) {
    const host = $('activityList');
    if (!state.contract) { host.innerHTML = '<div class="activity-empty"><span>◷</span><p>Connect to the auction to see live activity.</p></div>'; return; }
    if (!events?.length) { host.innerHTML = '<div class="activity-empty"><span>◷</span><p>No auction activity yet. Be the first to commit.</p></div>'; return; }
    host.innerHTML = events.map(e => {
      const labels = { commit:['⌑','Bid committed','commit-event'], reveal:['↗','Bid revealed','reveal-event'], phase:['◷','Reveal phase opened',''], final:['✓','Auction finalized',''] };
      const [icon,label,cl] = labels[e.kind];
      return `<div class="activity-row ${cl}"><span class="activity-icon">${icon}</span><span><strong>${label}</strong><small>${e.address === 'Auctioneer' ? 'Organizer' : escapeHtml(shorten(e.address))}${e.kind === 'commit' ? ` · ${escapeHtml(shorten(e.hash,8,6))}` : ''}</small></span><time>#${e.block}</time></div>`;
    }).join('');
  }
  async function renderOrganizer() {
    if (!state.contract) return;
    try {
      const owner = ethers.getAddress(await state.contract.auctioneer()); const isOwner = owner === state.account;
      const revealAvailable = state.phase === 0 && Date.now()+state.clockOffset >= state.commitEnd*1000;
      $('startRevealButton').classList.toggle('hidden', !isOwner || !revealAvailable);
      $('organizerHint').textContent = isOwner ? revealAvailable ? 'Commit window ended. You can open the reveal phase.' : state.phase === 0 ? 'Reveal opens after the commit deadline.' : state.phase === 1 ? 'Reveal is open. Finalization is permissionless after its deadline.' : 'This auction is finalized.' : `Organizer wallet: ${shorten(owner)}. Connect with this wallet to open reveal.`;
    } catch {}
  }
  async function commitBid() {
    const profile = participantProfile();
    if (!participantReady(profile)) { toast('Enter your name and class / roll ID before bidding.', 'error'); return; }
    const amount = $('bidInput').value;
    let bid; try { bid = ethers.parseEther(amount); } catch { toast('Enter a valid decimal bid amount.', 'error'); return; }
    if (bid <= 0n || bid > state.maxBid) { toast('Your bid must be positive and within the on-chain maximum.', 'error'); return; }
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const commitment = ethers.solidityPackedKeccak256(['uint256','bytes32'],[bid,nonce]);
    const secret = { version:1, network:state.network, chainId:NETWORKS[state.network].chainId, auctionAddress:state.address, bidder:state.account, bid:bid.toString(), displayBid:amount, nonce, commitment, createdAt:new Date().toISOString() };
    try { saveSecret(secret); } catch { toast('This browser cannot save the bid secret. Allow local storage or use another browser before bidding.', 'error'); return; }
    const button=$('commitButton'); setBusy(button,true,'Confirm in your wallet…');
    try {
      const tx = await state.contract.commitBid(commitment); toast('Commit submitted. Waiting for confirmation…');
      await tx.wait();
      $('bidInput').value=''; await refreshAuction(); toast('Bid committed. Download your recovery file now.', 'success', 6500);
    } catch(err) { toast(`${friendlyError(err)} The saved recovery secret is still on this device if your transaction is pending.`,'error'); }
    finally { setBusy(button,false); updateBidMeter(); }
  }
  function downloadSecret() {
    const secret=loadSavedSecret(); if(!secret) { toast('No saved recovery secret. Import your recovery JSON.', 'error'); return; }
    const blob=new Blob([JSON.stringify(secret,null,2)+'\n'],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`cloudauction-${secret.auctionAddress.slice(2,8)}-bid-secret.json`; a.click(); URL.revokeObjectURL(url); toast('Recovery file downloaded. Keep it private until reveal.', 'success');
  }
  async function importSecret(file) {
    try {
      const obj=JSON.parse(await file.text());
      if(obj.version!==1 || !ethers.isAddress(obj.auctionAddress) || !ethers.isAddress(obj.bidder) || obj.auctionAddress.toLowerCase()!==state.address.toLowerCase() || Number(obj.chainId)!==NETWORKS[state.network].chainId) throw new Error('This recovery file belongs to another auction or network.');
      const computed=ethers.solidityPackedKeccak256(['uint256','bytes32'],[BigInt(obj.bid),obj.nonce]);
      if(computed.toLowerCase()!==obj.commitment.toLowerCase()) throw new Error('The recovery file does not match its bid and secret.');
      localStorage.setItem(secretIdentityKey(obj.bidder),JSON.stringify(obj));
      if(obj.bidder.toLowerCase()===state.account.toLowerCase()) await refreshAuction();
      toast('Recovery file imported on this device.', 'success');
    } catch(err) { toast(friendlyError(err), 'error'); }
    $('secretFileInput').value='';
  }
  async function revealBid() {
    const saved=loadSavedSecret(); if(!saved) { $('secretFileInput').click(); toast('Import your bid recovery file to reveal.', 'error'); return; }
    if(saved.bidder.toLowerCase()!==state.account.toLowerCase()) { toast('Connect the wallet that made this commitment.', 'error'); return; }
    const button=$('revealButton'); setBusy(button,true,'Confirm reveal…');
    try { const tx=await state.contract.revealBid(BigInt(saved.bid),saved.nonce); toast('Reveal submitted. Waiting for confirmation…'); await tx.wait(); await refreshAuction(); toast('Your bid is revealed and entered in the final result.', 'success'); }
    catch(err) { toast(friendlyError(err),'error'); }
    finally { setBusy(button,false); }
  }
  async function startReveal() {
    const button=$('startRevealButton'); setBusy(button,true,'Opening reveal…');
    try { const tx=await state.contract.startReveal(); await tx.wait(); await refreshAuction(); toast('Reveal phase is now open.', 'success'); }
    catch(err) { toast(friendlyError(err),'error'); }
    finally { setBusy(button,false); }
  }
  async function finalizeAuction() {
    const button=$('finalizeButton'); setBusy(button,true,'Finalizing…');
    try { const tx=await state.contract.finalizeAuction(); await tx.wait(); await refreshAuction(); toast('Auction finalized. The result is now public.', 'success'); }
    catch(err) { toast(friendlyError(err),'error'); }
    finally { setBusy(button,false); }
  }
  function startPolling() {
    if(state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer=setInterval(refreshAuction,12000);
  }
  function switchNetwork(value) {
    state.network=value; state.networkChosen=true; const url=new URL(location.href); url.searchParams.set('network',value); url.searchParams.delete('address'); history.replaceState({},'',url); updateQr(); resetConnection(); state.address=''; state.readProvider=null; state.readContract=null; state.contract=null; state.phase=null; loadAddress(); loadDeploymentDefault(); $('chainLabel').textContent=`Selected ${NETWORKS[value].name}`;
  }
  function init() {
    $('networkSelect').value=state.network; loadAddress();
    $('connectButton').addEventListener('click',()=>connectWallet(true)); $('promptConnect').addEventListener('click',()=>connectWallet(true));
    $('configureAuction').addEventListener('click',openAuctionDialog); $('shareButton').addEventListener('click',showShare);
    $('saveAuction').addEventListener('click',saveAddress); $('closeAuction').addEventListener('click',()=>$('auctionDialog').close());
    $('participantName').addEventListener('input',updateParticipantProfile); $('participantId').addEventListener('input',updateParticipantProfile);
    $('copyLink').addEventListener('click',()=>copyText(currentInviteUrl())); $('dialogCopy').addEventListener('click',()=>copyText(currentInviteUrl())); $('closeShare').addEventListener('click',()=>$('shareDialog').close());
    $('networkSelect').addEventListener('change',e=>switchNetwork(e.target.value)); $('bidInput').addEventListener('input',updateBidMeter);
    $('commitButton').addEventListener('click',commitBid); $('downloadSecret').addEventListener('click',downloadSecret); $('importSecretButton').addEventListener('click',()=>$('secretFileInput').click());
    $('secretFileInput').addEventListener('change',e=>{if(e.target.files?.[0]) importSecret(e.target.files[0]);}); $('revealButton').addEventListener('click',revealBid);
    $('startRevealButton').addEventListener('click',startReveal); $('finalizeButton').addEventListener('click',finalizeAuction); $('refreshButton').addEventListener('click',refreshAuction);
    $('auctionAddressInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveAddress();});
    $('shareDialog').addEventListener('click',e=>{if(e.target===$('shareDialog')) $('shareDialog').close();});
    state.countdownTimer=setInterval(()=>{renderCountdown(); if(state.phase===0 && state.commitEnd*1000<=Date.now()+state.clockOffset) renderOrganizer(); if(state.phase===1 && state.revealEnd*1000<=Date.now()+state.clockOffset) renderResult(state.result);},1000);
    if(window.ethereum){window.ethereum.on?.('accountsChanged',()=>location.reload());window.ethereum.on?.('chainChanged',()=>location.reload());}
    if(state.address){$('chainLabel').textContent=`Selected ${NETWORKS[state.network].name}`;} else { $('resourceName').textContent='Choose an auction'; $('resourceDescription').textContent='Paste a deployed auction address, or scan a class invite QR code.'; $('chainLabel').textContent='Select an auction'; notice('Start by choosing a deployed CloudAuction contract. Organizers can paste the address here, then share the QR invite.', ''); loadDeploymentDefault(); }
    updateQr();
  }
  function renderTimerOnly(){renderCountdown();}
  init();
})();
