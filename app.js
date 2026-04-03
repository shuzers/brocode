// ─── Configuration ────────────────────────────────────────────────────────────
const WORKER_URL = 'https://brocode-worker.prolast1225.workers.dev';
const ROOM_ID = 'default-room';
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// ─── Codename Generator ────────────────────────────────────────────────────────
const ADJECTIVES = ['Azure', 'Crimson', 'Indigo', 'Amber', 'Neon', 'Silver', 'Obsidian', 'Jade', 'Violet', 'Cobalt', 'Scarlet', 'Teal'];
const ANIMALS    = ['Lion', 'Tiger', 'Falcon', 'Lynx', 'Wolf', 'Raven', 'Fox', 'Owl', 'Bear', 'Hawk', 'Viper', 'Panther'];
const ICONS      = ['laptop_mac', 'smartphone', 'desktop_windows', 'tablet_android', 'phone_iphone', 'computer'];

function generateCodename() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${ani}`;
}
function randomIcon() {
  return ICONS[Math.floor(Math.random() * ICONS.length)];
}

// ─── State ─────────────────────────────────────────────────────────────────────
let mode = 'receiver';
let peerId = generateId();
let myCodename = generateCodename();
let myIcon = randomIcon();
let peerConnection = null;
let dataChannel = null;
let scanInterval = null;
let heartbeatInterval = null;
let connectedPeerName = null;
let answerPollInterval = null;

// ─── DOM References ────────────────────────────────────────────────────────────
const modeToggle       = document.getElementById('modeToggle');
const identityChip     = document.getElementById('identityChip');
const navPeerName      = document.getElementById('navPeerName');
const scanningView     = document.getElementById('scanningView');
const receiverView     = document.getElementById('receiverView');
const senderView       = document.getElementById('senderView');
const transferView     = document.getElementById('transferView');
const allViews         = [scanningView, receiverView, senderView, transferView];
const scanningPeerName = document.getElementById('scanningPeerName');
const peerGrid         = document.getElementById('peerGrid');
const senderNetworkId  = document.getElementById('senderNetworkId');
const senderStatusText = document.getElementById('senderStatusText');
const sendClipboard    = document.getElementById('sendClipboard');
const sendMessage      = document.getElementById('sendMessage');
const messageInput     = document.getElementById('messageInput');
const fileInput        = document.getElementById('fileInput');
const dropZone         = document.getElementById('dropZone');
const transferPeerName = document.getElementById('transferPeerName');
const transferPeerIcon = document.getElementById('transferPeerIcon');
const transferCard     = document.getElementById('transferCard');
const transferFileName = document.getElementById('transferFileName');
const transferMeta     = document.getElementById('transferMeta');
const progressBar      = document.getElementById('progressBar');
const progressLabel    = document.getElementById('progressLabel');
const transferStatus   = document.getElementById('transferStatus');
const receivedDataList = document.getElementById('receivedDataList');
const disconnectBtn    = document.getElementById('disconnectBtn');
const footerPeerName   = document.getElementById('footerPeerName');

// ─── View Management ───────────────────────────────────────────────────────────
function showView(viewEl) {
  allViews.forEach(v => { v.style.display = 'none'; });
  viewEl.style.display = 'flex';
}

// ─── Identity ─────────────────────────────────────────────────────────────────
function applyIdentity() {
  navPeerName.textContent      = myCodename;
  identityChip.classList.remove('hidden');
  identityChip.classList.add('flex');
  scanningPeerName.textContent = myCodename;
  footerPeerName.textContent   = myCodename;
  senderNetworkId.textContent  = myCodename.toUpperCase().replace(' ', '-') + '-' + peerId.substring(0, 4).toUpperCase();
}

// ─── Mode Toggle ───────────────────────────────────────────────────────────────
modeToggle.addEventListener('click', () => {
  mode === 'receiver' ? switchToSender() : switchToReceiver();
});

function switchToSender() {
  mode = 'sender';
  modeToggle.textContent = 'Switch to Receiver';
  stopScanning();
  stopAnswerPoll();
  closePeerConnection();
  showView(senderView);
  setSenderStatus('Waiting for receiver to connect…', false);
  disableSenderControls();
  registerAsSender();
}

function switchToReceiver() {
  mode = 'receiver';
  modeToggle.textContent = 'Become Sender';
  stopAnswerPoll();
  unregisterAsSender();
  closePeerConnection();
  showView(scanningView);
  startScanning();
}

// ─── Sender Status ─────────────────────────────────────────────────────────────
function setSenderStatus(text, isConnected = false) {
  senderStatusText.textContent = text;
  const dot = senderStatusText.previousElementSibling;
  if (dot) dot.style.backgroundColor = isConnected ? '#bdce8b' : '#909284';
}

// ─── Peer Discovery ────────────────────────────────────────────────────────────
function startScanning() {
  if (scanInterval) return;
  scanPeers();
  scanInterval = setInterval(scanPeers, 2000); // 2s for snappier detection
}

function stopScanning() {
  clearInterval(scanInterval);
  scanInterval = null;
}

async function scanPeers() {
  if (mode !== 'receiver') return;
  try {
    const res   = await fetch(`${WORKER_URL}/peers/${ROOM_ID}`);
    const peers = await res.json();
    displayPeers(peers.filter(p => p.id !== peerId));
  } catch (err) {
    // Network error during scan — stay on scanning view, show subtle hint
    if (mode === 'receiver') showScanningWithHint('Network error — retrying…');
  }
}

function displayPeers(peers) {
  if (peers.length === 0) {
    showView(scanningView);
    return;
  }

  showView(receiverView);

  peerGrid.innerHTML = peers.map(peer => {
    const name = peer.codename || ('Peer ' + peer.id.substring(0, 6));
    const icon = peer.icon || 'computer';
    return `
      <div class="glass-card group relative p-10 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer
                  transition-all duration-500 hover:shadow-[0_0_40px_rgba(189,206,139,0.15)] hover:-translate-y-2 border border-outline-variant/10"
           data-peer-id="${peer.id}" data-peer-name="${name}" data-peer-icon="${icon}">
        <div class="absolute inset-0 rounded-xl bg-primary/0 group-hover:bg-primary/[0.03] transition-colors duration-500"></div>
        <div class="mb-6 p-6 rounded-full bg-surface-container-highest/50 relative overflow-hidden">
          <span class="material-symbols-outlined text-4xl text-primary" style="font-variation-settings:'FILL' 1;">${icon}</span>
          <div class="absolute inset-0 rounded-full border-2 border-primary/20 scale-100 group-hover:scale-150 group-hover:opacity-0 transition-all duration-1000"></div>
        </div>
        <h3 class="text-xl font-bold tracking-tight text-on-surface mb-1">${name}</h3>
        <span class="text-primary/60 text-[0.6875rem] uppercase font-bold tracking-widest">Click to Connect</span>
      </div>`;
  }).join('');

  peerGrid.querySelectorAll('[data-peer-id]').forEach(card => {
    card.addEventListener('click', () => {
      connectToPeer(card.dataset.peerId, card.dataset.peerName, card.dataset.peerIcon);
    });
  });
}

function showScanningWithHint(hint) {
  showView(scanningView);
  // Update subtext in scanning view
  const hintEl = document.getElementById('scanningHint');
  if (hintEl) hintEl.textContent = hint;
}

// ─── Sender Registration + Heartbeat ──────────────────────────────────────────
async function registerAsSender() {
  try {
    await fetch(`${WORKER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ROOM_ID, peerId, codename: myCodename, icon: myIcon })
    });
    // Heartbeat: re-register every 60s so we don't expire
    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      if (mode !== 'sender') { clearInterval(heartbeatInterval); return; }
      try {
        await fetch(`${WORKER_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: ROOM_ID, peerId, codename: myCodename, icon: myIcon })
        });
      } catch {}
    }, 60_000);
    startListeningForOffers();
  } catch (err) {
    console.error('Registration error:', err);
    setSenderStatus('Registration failed — check connection', false);
  }
}

async function unregisterAsSender() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  try {
    await fetch(`${WORKER_URL}/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ROOM_ID, peerId })
    });
  } catch {}
}

// ─── WebRTC — Receiver Side ────────────────────────────────────────────────────
async function connectToPeer(targetPeerId, targetName, targetIcon) {
  stopScanning();
  connectedPeerName = targetName;

  // Show transfer view immediately with a "Connecting…" state
  showTransferView(targetName, targetIcon, 'receiver');
  setTransferStatus('Connecting…', '');

  try {
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    dataChannel = peerConnection.createDataChannel('data');
    setupDataChannel();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Gather ICE candidates before sending
    await waitForIce(peerConnection);

    // Queue the offer on the worker
    const res = await fetch(`${WORKER_URL}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: ROOM_ID,
        from: peerId,
        fromCodename: myCodename,
        to: targetPeerId,
        type: 'offer',
        offer: peerConnection.localDescription,
        candidates: []   // already baked into localDescription after waitForIce
      })
    });
    const queued = await res.json();
    if (!queued || queued.error) throw new Error('Failed to queue offer: ' + JSON.stringify(queued));

    setTransferStatus('Waiting for sender…', '');

    // Now poll for the answer
    await pollForAnswer();

  } catch (err) {
    console.error('Connection error:', err);
    setTransferStatus('Connection failed', '⚠');
    closePeerConnection();
    // Return to receiver scanning after 3s
    setTimeout(() => { if (mode === 'receiver') switchToReceiver(); }, 3000);
  }
}

function stopAnswerPoll() {
  clearInterval(answerPollInterval);
  answerPollInterval = null;
}

function pollForAnswer() {
  stopAnswerPoll();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const TIMEOUT = 30_000; // 30s

    answerPollInterval = setInterval(async () => {
      if (Date.now() - started > TIMEOUT) {
        stopAnswerPoll();
        return reject(new Error('Answer timeout — sender did not respond within 30s'));
      }
      if (!peerConnection) {
        stopAnswerPoll();
        return reject(new Error('Connection was closed'));
      }
      try {
        const res    = await fetch(`${WORKER_URL}/poll/${ROOM_ID}/${peerId}`);
        const signal = await res.json();

        if (signal && signal.type === 'answer') {
          stopAnswerPoll();
          try {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(signal.answer)
            );
            // Candidates are baked into the answer SDP — no need to add separately
            resolve();
          } catch (e) {
            reject(new Error('setRemoteDescription (answer) failed: ' + e.message));
          }
        }
      } catch { /* ignore transient network errors */ }
    }, 1000);
  });
}

// ─── WebRTC — Sender Side ──────────────────────────────────────────────────────
async function startListeningForOffers() {
  let offerPollInterval = setInterval(async () => {
    if (mode !== 'sender') { clearInterval(offerPollInterval); return; }
    try {
      const res    = await fetch(`${WORKER_URL}/poll/${ROOM_ID}/${peerId}`);
      const signal = await res.json();
      if (signal && signal.type === 'offer') {
        clearInterval(offerPollInterval);
        setSenderStatus(`Offer received from ${signal.fromCodename || 'receiver'}…`, false);
        await handleOffer(signal);
      }
    } catch { /* ignore */ }
  }, 1000);
}

async function handleOffer(signal) {
  try {
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnection.ondatachannel = e => { dataChannel = e.channel; setupDataChannel(); };

    // Set the remote offer
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(signal.offer)
    );

    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Wait for ICE gathering
    await waitForIce(peerConnection);

    // Send answer back to receiver
    await fetch(`${WORKER_URL}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: ROOM_ID,
        from: peerId,
        to: signal.from,
        answer: peerConnection.localDescription,
        candidates: []   // baked into localDescription
      })
    });

    setSenderStatus(`Answered — waiting for channel…`, false);
  } catch (err) {
    console.error('handleOffer error:', err);
    setSenderStatus('Failed to answer offer: ' + err.message, false);
    closePeerConnection();
    // Resume listening after a moment
    setTimeout(() => { if (mode === 'sender') startListeningForOffers(); }, 3000);
  }
}

// ─── ICE Helper ───────────────────────────────────────────────────────────────
function waitForIce(pc) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const onchange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onchange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onchange);
    // Safety fallback
    setTimeout(resolve, 8000);
  });
}

// ─── Data Channel ─────────────────────────────────────────────────────────────
function setupDataChannel() {
  dataChannel.onopen = () => {
    if (mode === 'sender') {
      setSenderStatus(`Connected to ${connectedPeerName || 'receiver'}!`, true);
      enableSenderControls();
    }
    // Receiver: transfer view already shown, update status
    setTransferStatus('Connected ✓', '');
  };

  dataChannel.onclose = () => {
    if (mode === 'sender') {
      setSenderStatus('Receiver disconnected.', false);
      disableSenderControls();
      startListeningForOffers(); // Ready for next connection
    } else {
      setTransferStatus('Disconnected', '');
      setTimeout(() => { if (mode === 'receiver') switchToReceiver(); }, 2000);
    }
  };

  dataChannel.onerror = e => {
    console.error('DataChannel error:', e);
  };

  dataChannel.onmessage = e => handleReceivedData(e.data);
}

function closePeerConnection() {
  stopAnswerPoll();
  dataChannel?.close();
  dataChannel = null;
  peerConnection?.close();
  peerConnection = null;
}

// ─── Transfer View ─────────────────────────────────────────────────────────────
function showTransferView(peerName, peerIcon, direction) {
  transferPeerName.textContent = peerName;
  transferPeerIcon.textContent = peerIcon || 'laptop_mac';
  document.getElementById('transferDirectionLabel').textContent =
    direction === 'receiver' ? 'Connecting to' : 'Sending to';
  receivedDataList.innerHTML = '<p class="text-on-surface-variant/40 text-sm italic">Nothing received yet…</p>';
  transferCard.classList.add('hidden');
  showView(transferView);
}

function setTransferStatus(label, icon) {
  if (transferStatus) transferStatus.textContent = (icon ? icon + ' ' : '') + label;
}

// ─── Received Data ─────────────────────────────────────────────────────────────
function handleReceivedData(dataStr) {
  let data;
  try { data = JSON.parse(dataStr); }
  catch { data = { type: 'message', content: dataStr }; }

  animateProgress(data);

  const placeholder = receivedDataList.querySelector('.italic');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = 'received-item';

  const badge = document.createElement('span');
  badge.className = 'text-[0.6rem] font-bold text-primary uppercase tracking-widest';
  badge.textContent = data.type;

  const body = document.createElement('div');

  if (data.type === 'file') {
    const link = document.createElement('a');
    link.href = data.content;
    link.download = data.name;
    link.className = 'text-primary font-semibold underline underline-offset-2 hover:opacity-80 flex items-center gap-2';
    link.innerHTML = `<span class="material-symbols-outlined text-sm">download</span>${data.name}`;
    body.appendChild(link);
  } else {
    const row = document.createElement('div');
    row.className = 'flex items-start justify-between gap-4';
    const textNode = document.createElement('p');
    textNode.className = 'text-on-surface/90 leading-relaxed text-sm break-all';
    textNode.textContent = data.content;
    const btn = document.createElement('button');
    btn.className = 'shrink-0 text-primary text-[0.6875rem] font-bold uppercase tracking-widest hover:underline';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.content).catch(() => {});
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
    row.appendChild(textNode);
    row.appendChild(btn);
    body.appendChild(row);
  }

  item.appendChild(badge);
  item.appendChild(body);
  receivedDataList.prepend(item);
}

function animateProgress(data) {
  transferCard.classList.remove('hidden');
  transferFileName.textContent = data.type === 'file' ? (data.name || 'Unknown') : (data.type === 'clipboard' ? 'Clipboard' : 'Message');
  transferMeta.textContent     = data.type === 'file' ? 'Incoming file' : 'Text data';
  progressBar.style.width      = '5%';
  progressLabel.textContent    = 'Receiving…';
  if (transferStatus) transferStatus.textContent = 'Incoming';
  setTimeout(() => {
    progressBar.style.width   = '100%';
    progressLabel.textContent = '100% Complete';
    if (transferStatus) transferStatus.textContent = 'Done ✓';
  }, 500);
}

// ─── Sender Controls ──────────────────────────────────────────────────────────
function enableSenderControls() {
  [sendClipboard, sendMessage].forEach(b => {
    b.disabled = false;
    b.classList.remove('opacity-40', 'cursor-not-allowed');
  });
  dropZone.classList.remove('pointer-events-none', 'opacity-40');
}

function disableSenderControls() {
  [sendClipboard, sendMessage].forEach(b => {
    b.disabled = true;
    b.classList.add('opacity-40', 'cursor-not-allowed');
  });
  dropZone.classList.add('pointer-events-none', 'opacity-40');
}

sendClipboard.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    sendData({ type: 'clipboard', content: text });
  } catch {
    alert('Failed to read clipboard — please grant clipboard permission.');
  }
});

sendMessage.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (text) { sendData({ type: 'message', content: text }); messageInput.value = ''; }
});

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage.click(); }
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('border-primary/60', 'bg-primary/10');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-primary/60', 'bg-primary/10');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('border-primary/60', 'bg-primary/10');
  const file = e.dataTransfer.files[0];
  if (file) readAndSendFile(file);
});
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) readAndSendFile(file);
});

function readAndSendFile(file) {
  const reader = new FileReader();
  reader.onload = e => sendData({ type: 'file', name: file.name, content: e.target.result });
  reader.readAsDataURL(file);
}

function sendData(data) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(data));
  }
}

// ─── Disconnect ────────────────────────────────────────────────────────────────
disconnectBtn.addEventListener('click', () => {
  closePeerConnection();
  mode === 'receiver' ? switchToReceiver() : switchToSender();
});

// ─── Utilities ─────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

window.addEventListener('beforeunload', () => {
  if (mode === 'sender') unregisterAsSender();
  closePeerConnection();
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
allViews.forEach(v => { v.style.display = 'none'; });
scanningView.style.display = 'flex';
applyIdentity();
disableSenderControls();
startScanning();
