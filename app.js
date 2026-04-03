// Configuration
const WORKER_URL = 'https://brocode-worker.prolast1225.workers.dev'; // Replace with your Cloudflare Worker URL
const ROOM_ID = 'default-room';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// State
let mode = 'receiver'; // 'receiver' or 'sender'
let peerId = generateId();
let peerConnection = null;
let dataChannel = null;
let scanInterval = null;

// DOM Elements
const modeToggle = document.getElementById('modeToggle');
const modeIndicator = document.getElementById('modeText');
const receiverView = document.getElementById('receiverView');
const senderView = document.getElementById('senderView');
const peerList = document.getElementById('peerList');
const sendClipboard = document.getElementById('sendClipboard');
const sendFile = document.getElementById('sendFile');
const sendMessage = document.getElementById('sendMessage');
const messageInput = document.getElementById('messageInput');
const fileInput = document.getElementById('fileInput');
const connectionStatus = document.getElementById('connectionStatus');
const dataView = document.getElementById('dataView');
const receivedData = document.getElementById('receivedData');
const themeToggle = document.getElementById('themeToggle');

// Initialize
initTheme();
startScanning();

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

themeToggle.addEventListener('click', toggleTheme);

// Mode Toggle
modeToggle.addEventListener('click', () => {
    if (mode === 'receiver') {
        switchToSender();
    } else {
        switchToReceiver();
    }
});

function switchToSender() {
    mode = 'sender';
    modeToggle.textContent = 'Switch to Receiver';
    modeIndicator.textContent = 'You are in Sender Mode';
    receiverView.classList.add('hidden');
    senderView.classList.remove('hidden');
    stopScanning();
    registerAsSender();
}

function switchToReceiver() {
    mode = 'receiver';
    modeToggle.textContent = 'Become Sender';
    modeIndicator.textContent = 'You are in Receiver Mode';
    senderView.classList.add('hidden');
    receiverView.classList.remove('hidden');
    dataView.classList.add('hidden');
    unregisterAsSender();
    startScanning();
    closePeerConnection();
}

// Peer Discovery
async function startScanning() {
    if (scanInterval) return;
    
    scanPeers();
    scanInterval = setInterval(scanPeers, 3000);
}

function stopScanning() {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
}

async function scanPeers() {
    try {
        const response = await fetch(`${WORKER_URL}/peers/${ROOM_ID}`);
        const peers = await response.json();
        
        displayPeers(peers.filter(p => p.id !== peerId));
    } catch (error) {
        console.error('Scan error:', error);
        peerList.innerHTML = '<div class="scanning">Connection error. Retrying...</div>';
    }
}

function displayPeers(peers) {
    if (peers.length === 0) {
        peerList.innerHTML = '<div class="scanning">No peers detected</div>';
        return;
    }
    
    peerList.innerHTML = peers.map(peer => `
        <div class="peer-item" data-peer-id="${peer.id}">
            <div>
                <div class="peer-name">Sender ${peer.id.substring(0, 8)}</div>
                <div class="peer-status">Click to connect</div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.peer-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetPeerId = item.dataset.peerId;
            connectToPeer(targetPeerId);
        });
    });
}

// Sender Registration
async function registerAsSender() {
    try {
        await fetch(`${WORKER_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: ROOM_ID, peerId })
        });
        
        startListeningForOffers();
    } catch (error) {
        console.error('Registration error:', error);
    }
}

async function unregisterAsSender() {
    try {
        await fetch(`${WORKER_URL}/unregister`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: ROOM_ID, peerId })
        });
    } catch (error) {
        console.error('Unregistration error:', error);
    }
}

// WebRTC Connection
async function connectToPeer(targetPeerId) {
    stopScanning();
    peerList.innerHTML = '<div class="scanning">Connecting...</div>';
    
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    dataChannel = peerConnection.createDataChannel('data');
    setupDataChannel();
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    const iceCandidates = [];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            iceCandidates.push(event.candidate);
        }
    };
    
    await new Promise(resolve => {
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
        } else {
            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    resolve();
                }
            };
        }
    });
    
    try {
        const response = await fetch(`${WORKER_URL}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: ROOM_ID,
                from: peerId,
                to: targetPeerId,
                type: 'offer',
                offer: peerConnection.localDescription,
                candidates: iceCandidates
            })
        });
        
        const { answer, candidates } = await response.json();
        
        await peerConnection.setRemoteDescription(answer);
        for (const candidate of candidates) {
            await peerConnection.addIceCandidate(candidate);
        }
    } catch (error) {
        console.error('Connection error:', error);
        peerList.innerHTML = '<div class="scanning">Connection failed. Retrying...</div>';
        startScanning();
    }
}

async function startListeningForOffers() {
    const checkInterval = setInterval(async () => {
        if (mode !== 'sender') {
            clearInterval(checkInterval);
            return;
        }
        
        try {
            const response = await fetch(`${WORKER_URL}/poll/${ROOM_ID}/${peerId}`);
            const signal = await response.json();
            
            if (signal && signal.type === 'offer') {
                clearInterval(checkInterval);
                await handleOffer(signal);
            }
        } catch (error) {
            // Ignore polling errors
        }
    }, 1000);
}

async function handleOffer(signal) {
    connectionStatus.textContent = 'Receiver connecting...';
    
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };
    
    await peerConnection.setRemoteDescription(signal.offer);
    
    for (const candidate of signal.candidates) {
        await peerConnection.addIceCandidate(candidate);
    }
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    const iceCandidates = [];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            iceCandidates.push(event.candidate);
        }
    };
    
    await new Promise(resolve => {
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
        } else {
            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    resolve();
                }
            };
        }
    });
    
    await fetch(`${WORKER_URL}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            roomId: ROOM_ID,
            from: peerId,
            to: signal.from,
            answer: peerConnection.localDescription,
            candidates: iceCandidates
        })
    });
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        if (mode === 'sender') {
            connectionStatus.className = 'status-success';
            connectionStatus.textContent = 'Connected to receiver!';
            enableSenderControls();
        } else {
            peerList.innerHTML = '<div class="scanning status-success">Connected to sender!</div>';
            dataView.classList.remove('hidden');
        }
    };
    
    dataChannel.onclose = () => {
        if (mode === 'sender') {
            connectionStatus.className = 'status-info';
            connectionStatus.textContent = 'Receiver disconnected';
            disableSenderControls();
        } else {
            peerList.innerHTML = '<div class="scanning">Connection closed</div>';
            startScanning();
        }
    };
    
    dataChannel.onmessage = (event) => {
        handleReceivedData(event.data);
    };
}

function closePeerConnection() {
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

// Sender Controls
function enableSenderControls() {
    sendClipboard.disabled = false;
    sendFile.disabled = false;
    sendMessage.disabled = false;
}

function disableSenderControls() {
    sendClipboard.disabled = true;
    sendFile.disabled = true;
    sendMessage.disabled = true;
}

sendClipboard.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        sendData({ type: 'clipboard', content: text });
    } catch (error) {
        alert('Failed to read clipboard. Please grant permission.');
    }
});

sendFile.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            sendData({
                type: 'file',
                name: file.name,
                content: e.target.result
            });
        };
        reader.readAsDataURL(file);
    }
});

sendMessage.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (text) {
        sendData({ type: 'message', content: text });
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage.click();
    }
});

function sendData(data) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
    }
}

// Receiver Data Handling
function handleReceivedData(dataStr) {
    const data = JSON.parse(dataStr);
    
    const item = document.createElement('div');
    item.className = 'data-item';
    
    const typeLabel = document.createElement('div');
    typeLabel.className = 'data-type';
    typeLabel.textContent = `${data.type.toUpperCase()}`;
    
    const content = document.createElement('div');
    content.className = 'data-content';
    
    if (data.type === 'file') {
        const link = document.createElement('a');
        link.href = data.content;
        link.download = data.name;
        link.textContent = `📎 ${data.name}`;
        link.style.color = 'var(--btn-primary-bg)';
        content.appendChild(link);
    } else {
        content.textContent = data.content;
    }
    
    item.appendChild(typeLabel);
    item.appendChild(content);
    receivedData.insertBefore(item, receivedData.firstChild);
}

// Utilities
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (mode === 'sender') {
        unregisterAsSender();
    }
    closePeerConnection();
});

disableSenderControls();
