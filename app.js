// App State
const state = {
  mode: 'idle', // idle | send | retrieve
  inputType: 'text', // text | file
  theme: localStorage.getItem('clipboard_theme') || 'light',
  text: '',
  file: null,
  code: ''
};

const els = {
  text: document.getElementById('text-area'),
  fileIn: document.getElementById('file-input'),
  copy: document.getElementById('copy-btn'),
  download: document.getElementById('download-btn'),
  code: document.getElementById('code-input'),
  send: document.getElementById('send-btn'),
  theme: document.getElementById('theme-toggle'),
  status: document.getElementById('status-message'),
  modal: document.getElementById('about-modal'),
  modes: document.querySelectorAll('input[name="mode"]')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-theme', state.theme);
  els.theme.querySelector('.theme-icon').textContent = state.theme === 'dark' ? '☀️' : '🌙';
  updateUI();

  // Listeners
  els.text.addEventListener('input', (e) => {
    state.text = e.target.value;
    checkSendState();
  });

  els.fileIn.addEventListener('change', (e) => {
    state.file = e.target.files[0];
    checkSendState();
  });

  els.modes.forEach(rb => rb.addEventListener('change', (e) => {
    state.inputType = e.target.value;
    updateUI();
    checkSendState();
  }));

  els.code.addEventListener('input', handleCodeInput);
  els.send.addEventListener('click', handleSend);
  els.copy.addEventListener('click', handleCopy);
  els.theme.addEventListener('click', toggleTheme);

  document.getElementById('about-btn').addEventListener('click', () => els.modal.classList.remove('hidden'));
  els.modal.querySelectorAll('.modal-close, .modal-overlay').forEach(el =>
    el.addEventListener('click', () => els.modal.classList.add('hidden'))
  );
});

function checkSendState() {
  if (state.code.length === 3) return; // Keep in retrieve mode or partial

  const hasContent = state.inputType === 'text' ? !!state.text.trim() : !!state.file;
  state.mode = hasContent ? 'send' : 'idle';
  updateUI();
}

function handleCodeInput(e) {
  let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 3);
  e.target.value = val;
  state.code = val;

  if (val.length === 3) retrieveContent(val);
  else checkSendState();
}

// Supabase Logic
async function handleSend() {
  if (!navigator.onLine) {
    showStatus('Offline—check connection!', 'error');
    return;
  }

  els.send.disabled = true;
  els.send.textContent = 'Sending...';

  try {
    const code = await generateUniqueCode();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    let insertData = {
      code,
      type: state.inputType,
      timestamp: now,
      expires: expires
    };

    if (state.inputType === 'text') {
      insertData.content = state.text;
    } else {
      const file = state.file;
      const { error: upErr } = await supabase.storage.from('files').upload(`${code}/${file.name}`, file);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('files').getPublicUrl(`${code}/${file.name}`);
      insertData.url = publicUrl;
      insertData.filename = file.name;
    }

    const { error } = await supabase.from('clips').insert(insertData);
    if (error) throw error;

    els.code.value = code;
    showStatus(`Saved! Code: ${code}`, 'success');
    state.mode = 'idle'; // Reset after send


    // Clear inputs
    if (state.inputType === 'text') {
      state.text = '';
      els.text.value = '';
    } else {
      state.file = null;
      els.fileIn.value = '';
    }


    if (state.inputType === 'text') {
      state.text = '';
      els.text.value = '';
    } else {
      state.file = null;
      els.fileIn.value = '';
    }
  } catch (err) {
    console.error(err);
    showStatus('Upload failed: ' + err.message, 'error');
  } finally {
    els.send.disabled = false;
    els.send.textContent = 'Send';
    updateUI();
  }
}

async function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  while (true) {
    code = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    const { data } = await supabase.from('clips').select('id').eq('code', code).maybeSingle();
    if (!data) break;
  }
  return code;
}

async function retrieveContent(code) {
  state.mode = 'retrieve';
  updateUI(); // Lock inputs
  showStatus('Retrieving...', 'info');

  try {
    const { data, error } = await supabase.from('clips').select('*').eq('code', code).maybeSingle();

    if (error || !data) throw new Error('Code not found or expired');

    if (new Date() > new Date(data.expires)) {
      await supabase.from('clips').delete().eq('code', code); // Cleanup expired
      throw new Error('Code expired');
    }

    // Display Content
    if (data.type === 'text') {
      els.text.value = data.content;
      state.text = data.content;
      state.inputType = 'text'; // Switch to text view
    } else {
      state.inputType = 'file'; // Switch to file view
      els.download.href = data.url;
      els.download.download = data.filename || 'download';
      els.download.textContent = `Download ${data.filename}`;
      state.file = { name: data.filename }; // Mock for UI state
    }

    // Delete after retrieve (Burn on read)
    await supabase.from('clips').delete().eq('code', code);

    // Cleanup storage if file
    if (data.type === 'file') {
      // Note: Storage cleanup might be needed but Supabase doesn't auto-delete storage on row delete.
      // We'll leave it for now or implement a cleanup triggers. 
      // For a simple app, we can try to delete the folder/file.
      const path = `${code}/${data.filename}`;
      supabase.storage.from('files').remove([path]);
    }

    updateUI();
    showStatus('Content retrieved!', 'success');

  } catch (err) {
    showStatus(err.message, 'error');
    els.code.value = '';
    state.code = '';
    updateUI();
  }
}

async function handleCopy() {
  if (!els.text.value) return;
  try {
    await navigator.clipboard.writeText(els.text.value);
    showStatus('Copied!', 'success');
  } catch {
    els.text.select();
    document.execCommand('copy');
    showStatus('Copied!', 'success');
  }
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', state.theme);
  els.theme.querySelector('.theme-icon').textContent = state.theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('clipboard_theme', state.theme);
}

function updateUI() {
  // Input Visibility
  if (state.inputType === 'text') {
    els.text.style.display = 'block';
    els.fileIn.style.display = 'none';
    els.download.style.display = 'none';
    els.copy.style.display = 'block'; // Show copy btn for text
    els.modes[0].checked = true;
  } else {
    els.text.style.display = 'none';
    els.fileIn.style.display = state.mode === 'retrieve' ? 'none' : 'block';
    els.download.style.display = state.mode === 'retrieve' ? 'block' : 'none';
    els.copy.style.display = 'none'; // Hide copy btn for file
    els.modes[1].checked = true;
  }

  // Button States
  const isSend = state.mode === 'send';
  els.send.disabled = !isSend;

  // Copy button enabled only if text content exists and we are in text mode
  els.copy.disabled = !state.text && state.inputType === 'text';
}

function showStatus(msg, type) {
  els.status.textContent = msg;
  els.status.className = `${type} visible`;
  if (type === 'success') setTimeout(() => els.status.classList.remove('visible'), 3000);
}
