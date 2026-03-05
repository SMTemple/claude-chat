// === Setup Wizard ===
(async () => {
  const setup = await window.api.checkSetup();
  if (setup.setupComplete) return; // Already set up

  const wizard = document.getElementById('setup-wizard');
  const appEl = document.getElementById('app');
  wizard.classList.remove('hidden');
  appEl.style.display = 'none';

  const totalSteps = 4;
  let currentStep = 1;
  const wizardData = { cwd: setup.cwd, model: 'opus' };

  // Build dots
  const dotsEl = document.getElementById('wizard-dots');
  for (let i = 1; i <= totalSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'wizard-dot' + (i === 1 ? ' active' : '');
    dot.dataset.step = i;
    dotsEl.appendChild(dot);
  }

  function showStep(n) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    document.querySelector(`.wizard-step[data-step="${n}"]`).classList.remove('hidden');
    dotsEl.querySelectorAll('.wizard-dot').forEach(d => d.classList.toggle('active', +d.dataset.step === n));
    document.getElementById('wizard-back').classList.toggle('hidden', n === 1);
    document.getElementById('wizard-next').textContent = n === totalSteps ? 'Get Started' : 'Next';
  }

  // Step 1: Prerequisites
  const cliCheck = document.getElementById('wizard-cli-check');
  const apiCheck = document.getElementById('wizard-api-check');
  const prereqHint = document.getElementById('wizard-prereq-hint');

  cliCheck.classList.add(setup.claudeInstalled ? 'pass' : 'fail');
  // API key — we can't check directly, but if CLI is installed it likely has one
  apiCheck.classList.add(setup.claudeInstalled ? 'pass' : 'warn');

  if (!setup.claudeInstalled) {
    prereqHint.textContent = 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code';
  }

  // Step 2: Working Directory
  const wizardCwd = document.getElementById('wizard-cwd');
  wizardCwd.textContent = wizardData.cwd;
  wizardCwd.title = wizardData.cwd;

  document.getElementById('wizard-pick-dir').addEventListener('click', async () => {
    const dir = await window.api.pickDirectory();
    if (dir) {
      wizardData.cwd = dir;
      wizardCwd.textContent = dir;
      wizardCwd.title = dir;
    }
  });

  // Navigation
  document.getElementById('wizard-next').addEventListener('click', async () => {
    if (currentStep === 3) {
      // Capture model selection
      const selected = document.querySelector('input[name="wizard-model"]:checked');
      if (selected) wizardData.model = selected.value;
    }
    if (currentStep === totalSteps) {
      // Complete setup
      await window.api.completeSetup(wizardData);
      wizard.classList.add('hidden');
      appEl.style.display = '';
      return;
    }
    currentStep++;
    showStep(currentStep);
  });

  document.getElementById('wizard-back').addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      showStep(currentStep);
    }
  });
})();

// === Toast ===
// === Debug error log ===
const debugErrors = [];
function logDebugError(context, error) {
  const entry = { time: new Date().toLocaleTimeString(), context, error: String(error) };
  debugErrors.push(entry);
  console.error(`[${context}]`, error);
}

function showToast(msg, duration = 2000, isError = false) {
  const t = document.createElement('div');
  Object.assign(t.style, {
    position: 'fixed', top: '12px', right: '16px',
    background: isError ? '#dc2626' : '#6366f1', color: '#fff', padding: '8px 20px', borderRadius: '6px',
    fontSize: '13px', fontWeight: '500', zIndex: '9999', opacity: '0',
    transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
    maxWidth: '400px',
  });
  t.textContent = msg;
  if (isError && debugErrors.length > 0) {
    const bugBtn = document.createElement('button');
    bugBtn.innerHTML = '&#128027;';
    Object.assign(bugBtn.style, {
      background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
      padding: '0', pointerEvents: 'auto', flexShrink: '0',
    });
    bugBtn.title = 'Show error details';
    bugBtn.onclick = () => showDebugPanel();
    t.appendChild(bugBtn);
    t.style.pointerEvents = 'auto';
    duration = 5000;
  } else {
    t.style.pointerEvents = 'none';
  }
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = '1');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, duration);
}

function showDebugPanel() {
  let panel = document.getElementById('debug-panel');
  if (panel) { panel.remove(); return; }
  panel = document.createElement('div');
  panel.id = 'debug-panel';
  Object.assign(panel.style, {
    position: 'fixed', top: '50px', right: '16px', width: '420px', maxHeight: '400px',
    background: '#1a1a2e', border: '1px solid #6366f1', borderRadius: '8px',
    padding: '12px', zIndex: '10000', overflow: 'auto', fontFamily: 'monospace',
    fontSize: '11px', color: '#e2e8f0',
  });
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' });
  header.innerHTML = '<strong style="color:#f87171">Debug Errors</strong>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  Object.assign(closeBtn.style, { background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '16px' });
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (debugErrors.length === 0) {
    panel.innerHTML += '<div style="color:#94a3b8">No errors logged</div>';
  } else {
    for (const err of debugErrors.slice(-20)) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:6px;padding:4px 6px;background:#0d0d14;border-radius:4px;word-break:break-all;';
      row.innerHTML = `<span style="color:#94a3b8">${err.time}</span> <span style="color:#f87171">[${err.context}]</span><br>${err.error}`;
      panel.appendChild(row);
    }
  }
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy All';
  Object.assign(copyBtn.style, {
    marginTop: '8px', background: '#6366f1', color: '#fff', border: 'none',
    borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px',
  });
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(debugErrors.map(e => `[${e.time}] [${e.context}] ${e.error}`).join('\n'));
    showToast('Copied to clipboard');
  };
  panel.appendChild(copyBtn);
  document.body.appendChild(panel);
}

if (performance.navigation?.type === 1 || performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  showToast('Refreshed');
}

// === State ===
const state = {
  pendingImages: [],
  pendingFiles: [],
  isStreaming: false,
  currentAssistantText: '',
  messages: [],          // { role, text, images, files, time }
  totalCost: 0,
  sessionModel: 'sonnet',
  cwd: '',
};

// === DOM ===
const messagesEl = document.getElementById('messages');
const welcome = document.getElementById('welcome');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const imageStrip = document.getElementById('image-strip');
const sessionInfo = document.getElementById('session-info');
const modelSelect = document.getElementById('model-select');
const cwdBtn = document.getElementById('cwd-btn');
const exportBtn = document.getElementById('export-btn');
const captureBtn = document.getElementById('capture-btn');
const statusModel = document.getElementById('status-model');
const statusCost = document.getElementById('status-cost');
const statusTokens = document.getElementById('status-tokens');
const statusDuration = document.getElementById('status-duration');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchCount = document.getElementById('search-count');
const searchClose = document.getElementById('search-close');

// === Init state from main process ===
window.api.onInitState(({ cwd, model }) => {
  state.cwd = cwd;
  state.sessionModel = model;
  cwdBtn.textContent = shortenPath(cwd);
  cwdBtn.title = cwd;
  modelSelect.value = model;
});

function shortenPath(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

// === Copy code (delegated) ===
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const code = copyBtn.closest('.code-block').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1500);
    });
  }

  // Collapsible tool blocks
  const toolHeader = e.target.closest('.tool-block-header');
  if (toolHeader) {
    toolHeader.closest('.tool-block').classList.toggle('open');
  }

  // Copy message
  const msgCopy = e.target.closest('.msg-copy');
  if (msgCopy) {
    const msg = msgCopy.closest('.message');
    const content = msg.querySelector('.message-content').textContent;
    navigator.clipboard.writeText(content).then(() => showToast('Copied'));
  }
});

// === Lightbox ===
const lightbox = document.createElement('div');
lightbox.id = 'lightbox';
lightbox.innerHTML = '<img>';
document.body.appendChild(lightbox);
lightbox.addEventListener('click', () => lightbox.classList.remove('active'));

window.openLightbox = function(src) {
  lightbox.querySelector('img').src = src;
  lightbox.classList.add('active');
};

// === Drop overlay ===
const dropOverlay = document.createElement('div');
dropOverlay.id = 'drop-overlay';
dropOverlay.textContent = 'Drop files here';
document.body.appendChild(dropOverlay);

// === File icon helper ===
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icons = {
    pdf: '\u{1F4C4}', doc: '\u{1F4DD}', docx: '\u{1F4DD}', xls: '\u{1F4CA}', xlsx: '\u{1F4CA}',
    csv: '\u{1F4CA}', txt: '\u{1F4C3}', json: '\u{2699}', js: '\u{2699}', ts: '\u{2699}',
    py: '\u{1F40D}', html: '\u{1F310}', css: '\u{1F3A8}', zip: '\u{1F4E6}', rar: '\u{1F4E6}',
  };
  return icons[ext] || '\u{1F4CE}';
}

// === Image/File handling ===
function addImagePreview(dataURL, filePath) {
  state.pendingImages.push({ dataURL, path: filePath });
  renderImageStrip();
  showToast('Image added');
}

function addFilePreview(name, filePath) {
  state.pendingFiles.push({ name, path: filePath });
  renderImageStrip();
  showToast(`File added: ${name}`);
}

function renderImageStrip() {
  imageStrip.innerHTML = '';
  const hasItems = state.pendingImages.length > 0 || state.pendingFiles.length > 0;
  imageStrip.classList.toggle('hidden', !hasItems);

  state.pendingImages.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'image-preview';
    div.innerHTML = `<img src="${img.dataURL}"><button class="remove-img" data-type="image" data-index="${i}">&times;</button>`;
    imageStrip.appendChild(div);
  });

  state.pendingFiles.forEach((file, i) => {
    const div = document.createElement('div');
    div.className = 'image-preview';
    div.innerHTML = `<div class="file-preview-tag"><span title="${file.name}">${fileIcon(file.name)} ${file.name}</span></div><button class="remove-img" data-type="file" data-index="${i}">&times;</button>`;
    imageStrip.appendChild(div);
  });

  imageStrip.querySelectorAll('.remove-img').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const idx = parseInt(btn.dataset.index);
      if (type === 'image') state.pendingImages.splice(idx, 1);
      else state.pendingFiles.splice(idx, 1);
      renderImageStrip();
    });
  });
}

// === Paste handler (Ctrl+V) ===
document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = async () => {
        const dataURL = reader.result;
        const filePath = await window.api.saveImage(dataURL);
        if (filePath) addImagePreview(dataURL, filePath);
      };
      reader.readAsDataURL(blob);
    }
  }
});

// === Drag & drop ===
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('active');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); }
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('active');

  const files = e.dataTransfer?.files;
  if (!files) return;

  for (const file of files) {
    const filePath = window.api.getPathForFile(file) || file.path;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

    if (imageExts.includes(ext) || file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataURL = reader.result;
        const savedPath = await window.api.saveImage(dataURL);
        if (savedPath) addImagePreview(dataURL, savedPath);
      };
      reader.readAsDataURL(file);
    } else if (filePath) {
      addFilePreview(file.name, filePath);
    }
  }
});

// === Attach button ===
attachBtn.addEventListener('click', async () => {
  const paths = await window.api.pickImages();
  for (const p of paths) {
    const ext = p.split('.').pop().toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
    if (imageExts.includes(ext)) {
      const dataURL = `file://${p.replace(/\\/g, '/')}`;
      addImagePreview(dataURL, p);
    } else {
      const name = p.split(/[/\\]/).pop();
      addFilePreview(name, p);
    }
  }
});

// === Model selector ===
modelSelect.addEventListener('change', () => {
  state.sessionModel = modelSelect.value;
  window.api.setModel(modelSelect.value);
  showToast(`Model: ${modelSelect.value}`);
});

// === CWD selector ===
cwdBtn.addEventListener('click', async () => {
  const newCwd = await window.api.setCwd();
  if (newCwd) {
    state.cwd = newCwd;
    cwdBtn.textContent = shortenPath(newCwd);
    cwdBtn.title = newCwd;
    showToast(`Directory: ${shortenPath(newCwd)}`);
  }
});

// === Export ===
exportBtn.addEventListener('click', async () => {
  if (state.messages.length === 0) { showToast('Nothing to export'); return; }
  let md = `# Claude Chat Export\n_${new Date().toLocaleString()}_\n\n`;
  for (const m of state.messages) {
    md += `## ${m.role === 'user' ? 'You' : 'Claude'} (${m.time})\n\n${m.text}\n\n---\n\n`;
  }
  md += `\n_Total cost: $${state.totalCost.toFixed(4)}_\n`;
  const path = await window.api.exportConversation(md);
  if (path) showToast('Exported!');
});

// === Screen capture ===
captureBtn.addEventListener('click', async () => {
  const result = await window.api.screenCapture();
  if (result) {
    addImagePreview(result.dataURL, result.filepath);
  } else {
    showToast('Capture failed');
  }
});

// === Slash Command Handler ===
function handleSlashCommand(text) {
  const cmd = text.split(/\s+/)[0].toLowerCase();
  const arg = text.slice(cmd.length).trim();

  const commands = {
    '/help': () => {
      return `**GUI Commands**\n
| Command | Description |
|---|---|
| \`/help\` | Show this help |
| \`/cost\` | Show session cost & token usage |
| \`/model [name]\` | Show or switch model (opus/sonnet/haiku) |
| \`/voice\` | Toggle voice readback |
| \`/clear\` | Clear chat (keeps session) |
| \`/new\` | New conversation (resets session) |
| \`/export\` | Export conversation as markdown |
| \`/cwd\` | Show current working directory |
| \`/capture\` | Take a screen capture |
| \`/prompts\` | List saved prompts |
| \`/config\` | Show configuration info |

**CLI Skills** _(sent to Claude)_\n
| Command | Description |
|---|---|
| \`/vivi\` | Vivi AI assistant for Epic Web Studios |
| \`/simplify\` | Review code for reuse & quality |
| \`/interview\` | Interview about the plan |
| \`/claude-api\` | Build apps with Claude API |
| \`/ssa-tool\` | SEO Audit tool guide |
| \`/frontend-design\` | Create production-grade frontend |
| \`/compact\` | Compact conversation context |`;
    },
    '/cost': () => {
      return `**Session Cost:** $${state.totalCost.toFixed(4)}\n**Tokens:** ${statusTokens.textContent || 'No messages yet'}\n**Last response:** ${statusDuration.textContent || 'N/A'}`;
    },
    '/model': () => {
      if (arg && ['opus', 'sonnet', 'haiku'].includes(arg)) {
        modelSelect.value = arg;
        state.sessionModel = arg;
        window.api.setModel(arg);
        return `Model switched to **${arg}**`;
      }
      return `Current model: **${modelSelect.value}**\nUsage: \`/model opus\`, \`/model sonnet\`, \`/model haiku\``;
    },
    '/voice': () => {
      voiceToggle.checked = !voiceToggle.checked;
      localStorage.setItem('claude-chat-voice-on', voiceToggle.checked);
      return `Voice readback **${voiceToggle.checked ? 'enabled' : 'disabled'}**`;
    },
    '/clear': () => {
      messagesEl.innerHTML = '';
      state.messages = [];
      return null; // No response message needed
    },
    '/new': () => {
      newChatBtn.click();
      return null;
    },
    '/export': () => {
      exportBtn.click();
      return null;
    },
    '/cwd': () => `Working directory: \`${state.cwd}\``,
    '/capture': () => {
      captureBtn.click();
      return null;
    },
    '/prompts': () => {
      const items = promptsList.querySelectorAll('.prompt-item-name');
      if (items.length === 0) return 'No saved prompts. Use the **+** button in the sidebar to add one.';
      let list = '**Saved Prompts:**\n';
      items.forEach(el => { list += `- ${el.textContent}\n`; });
      return list;
    },
    '/config': () => {
      openConfig();
      return null;
    },
    '/compact': () => `Context compaction happens automatically in the CLI backend. Each message via this GUI is a separate \`claude -p\` call with \`--resume\`, so context is managed per-session.`,
    '/debug': () => {
      showDebugPanel();
      return null;
    },
  };

  const handler = commands[cmd];
  // CLI skills — send as message to Claude backend
  const cliSkill = cliSkillCommands.find(c => c.cmd === cmd);
  if (cliSkill) return false; // Let it pass through as a normal message to Claude
  if (!handler) return false; // Not a known command, send as normal message

  if (welcome) welcome.style.display = 'none';
  const now = new Date().toLocaleTimeString();

  // Show user command
  const userDiv = createMessageDiv('user', text, [], [], now);
  messagesEl.appendChild(userDiv);
  state.messages.push({ role: 'user', text, images: [], files: [], time: now });

  const result = handler();
  if (result) {
    const assistantDiv = createMessageDiv('assistant', result, [], [], now);
    messagesEl.appendChild(assistantDiv);
    state.messages.push({ role: 'assistant', text: result, images: [], files: [], time: now });
  }

  input.value = '';
  input.style.height = 'auto';
  scrollToBottom();
  return true;
}

// === Send message ===
async function sendMessage() {
  const text = input.value.trim();
  if (!text && state.pendingImages.length === 0 && state.pendingFiles.length === 0) return;
  if (state.isStreaming) return;

  // Check for slash commands first
  if (text.startsWith('/') && state.pendingImages.length === 0 && state.pendingFiles.length === 0) {
    if (handleSlashCommand(text)) return;
  }

  if (welcome) welcome.style.display = 'none';

  const imagePaths = state.pendingImages.map(img => img.path);
  const filePaths = state.pendingFiles.map(f => f.path);
  const allPaths = [...imagePaths, ...filePaths];
  const now = new Date().toLocaleTimeString();

  // Track message
  state.messages.push({
    role: 'user', text, images: state.pendingImages.map(i => i.dataURL),
    files: state.pendingFiles.map(f => f.name), time: now,
  });

  const userDiv = createMessageDiv('user', text, state.pendingImages.map(i => i.dataURL), state.pendingFiles.map(f => f.name), now);
  messagesEl.appendChild(userDiv);

  input.value = '';
  input.style.height = 'auto';
  state.pendingImages = [];
  state.pendingFiles = [];
  renderImageStrip();

  const assistantDiv = createMessageDiv('assistant', '', [], [], '');
  const contentEl = assistantDiv.querySelector('.message-content');
  contentEl.innerHTML = '<span class="thinking-indicator">Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>';
  messagesEl.appendChild(assistantDiv);
  scrollToBottom();

  state.isStreaming = true;
  state.currentAssistantText = '';
  state.responseStartTime = Date.now();
  sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

  await window.api.sendMessage(text, allPaths, state.sessionModel, state.cwd);
}

// === Create message div ===
function createMessageDiv(role, text, imageSrcs = [], fileNames = [], time = '') {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  let imagesHTML = '';
  if (imageSrcs.length > 0) {
    imagesHTML = '<div class="message-images">' +
      imageSrcs.map(src => `<img src="${src}" onclick="openLightbox('${src.replace(/'/g, "\\'")}')">`).join('') +
      '</div>';
  }

  let filesHTML = '';
  if (fileNames.length > 0) {
    filesHTML = '<div class="message-files">' +
      fileNames.map(n => `<span class="file-tag"><span class="file-tag-icon">${fileIcon(n)}</span>${n}</span>`).join('') +
      '</div>';
  }

  const label = role === 'user' ? 'You' : 'Claude';
  const contentHTML = role === 'user' ? escapeHtml(text) : window.api.renderMarkdown(text);

  div.innerHTML = `
    <div class="message-header">
      <span class="message-role">${label}</span>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-actions">
      <button class="msg-action-btn msg-copy" title="Copy message">Copy</button>
    </div>
    ${imagesHTML}${filesHTML}
    <div class="message-content">${contentHTML}</div>
  `;
  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// === Claude event handlers ===
window.api.onClaudeEvent((data) => {
  // Init event — show model & connected servers
  if (data.type === 'system' && data.subtype === 'init') {
    if (data.model) {
      statusModel.textContent = data.model;
      // Sync model dropdown with actual model from CLI
      if (data.model.includes('opus')) modelSelect.value = 'opus';
      else if (data.model.includes('haiku')) modelSelect.value = 'haiku';
      else modelSelect.value = 'sonnet';
    }
    // Populate CLI slash commands from init event
    if (data.slash_commands && Array.isArray(data.slash_commands)) {
      const guiCmdNames = guiCommands.map(c => c.cmd.slice(1));
      cliSkillCommands = data.slash_commands
        .filter(name => !guiCmdNames.includes(name))
        .map(name => ({ cmd: '/' + name, desc: 'CLI skill', cli: true }));
    }
  }

  // Assistant content (text + tool use + thinking)
  if (data.type === 'assistant' && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === 'thinking' && block.thinking) {
        appendThinking(block.thinking, false);
      }
      if (block.type === 'text') {
        collapseThinking();
        state.currentAssistantText += block.text;
        updateAssistantMessage();
      }
      if (block.type === 'tool_use') {
        collapseThinking();
        appendToolActivity(block);
      }
    }
  }

  // Tool results
  if (data.type === 'user' && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === 'tool_result' || block.tool_use_id) {
        updateToolResult(block);
      }
    }
  }

  // Result — extract cost, tokens, duration
  if (data.type === 'result') {
    if (data.result && state.currentAssistantText === '') {
      state.currentAssistantText = data.result;
      updateAssistantMessage();
    }
    if (data.total_cost_usd != null) {
      state.totalCost += data.total_cost_usd;
      statusCost.innerHTML = `<span class="status-cost">$${state.totalCost.toFixed(4)}</span>`;
    }
    if (data.usage) {
      const inp = data.usage.input_tokens || 0;
      const out = data.usage.output_tokens || 0;
      const cached = data.usage.cache_read_input_tokens || 0;
      statusTokens.textContent = `${inp + cached}in / ${out}out`;
    }
    if (data.duration_ms) {
      statusDuration.textContent = `${(data.duration_ms / 1000).toFixed(1)}s`;
    }
  }

  if (data.session_id) {
    sessionInfo.textContent = `Session: ${data.session_id.slice(0, 8)}...`;
  }
});

window.api.onClaudeDone(({ code, sessionId }) => {
  state.isStreaming = false;
  collapseThinking();
  sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const now = new Date().toLocaleTimeString();

  if (code !== 0 && state.currentAssistantText === '') {
    updateAssistantMessage('An error occurred. Check that the Claude CLI is working.');
  }

  // Update time on assistant message
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  const lastMsg = allMsgs[allMsgs.length - 1];
  if (lastMsg) {
    const timeEl = lastMsg.querySelector('.message-time');
    if (timeEl) timeEl.textContent = now;
  }

  // Track message
  state.messages.push({ role: 'assistant', text: state.currentAssistantText, images: [], files: [], time: now });

  // Desktop notification for long responses
  if (settings.notifications) {
    window.api.notify('Claude Chat', state.currentAssistantText.slice(0, 100) + (state.currentAssistantText.length > 100 ? '...' : ''));
  }

  // Voice readback
  speakText(state.currentAssistantText);
});

window.api.onClaudeError((msg) => {
  console.error('Claude stderr:', msg);
});

function updateAssistantMessage(override) {
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  const lastMsg = allMsgs[allMsgs.length - 1];
  if (!lastMsg) return;

  const content = lastMsg.querySelector('.message-content');
  const text = override || state.currentAssistantText;
  content.innerHTML = window.api.renderMarkdown(text);
  scrollToBottom();
}

function getToolIcon(name) {
  const n = name.toLowerCase();
  if (n === 'read') return '\u{1F4D6}';
  if (n === 'edit' || n === 'write') return '\u270F\uFE0F';
  if (n === 'bash') return '\u{1F4BB}';
  if (n === 'grep') return '\u{1F50D}';
  if (n === 'glob') return '\u{1F4C1}';
  if (n.includes('search') || n === 'websearch') return '\u{1F50E}';
  if (n === 'webfetch') return '\u{1F310}';
  if (n.startsWith('mcp__')) return '\u{1F50C}';
  return '\u2699\uFE0F';
}

function formatToolInput(name, input) {
  if (!input) return '';
  const n = name.toLowerCase();
  if (n === 'read' && input.file_path) return input.file_path.replace(/.*[/\\]/, '');
  if ((n === 'edit' || n === 'write') && input.file_path) return input.file_path.replace(/.*[/\\]/, '');
  if (n === 'bash' && input.command) return input.command.length > 60 ? input.command.slice(0, 60) + '...' : input.command;
  if (n === 'bash' && input.description) return input.description;
  if (n === 'grep' && input.pattern) return `/${input.pattern}/`;
  if (n === 'glob' && input.pattern) return input.pattern;
  if (input.query) return input.query;
  if (input.file_path) return input.file_path.replace(/.*[/\\]/, '');
  return '';
}

function appendThinking(text, collapsed) {
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  const lastMsg = allMsgs[allMsgs.length - 1];
  if (!lastMsg) return;

  // Clear thinking indicator
  const thinkingEl = lastMsg.querySelector('.thinking-indicator');
  if (thinkingEl) thinkingEl.remove();

  let thinkingBlock = lastMsg.querySelector('.thinking-block');
  if (!thinkingBlock) {
    thinkingBlock = document.createElement('details');
    thinkingBlock.className = 'thinking-block';
    thinkingBlock.open = true; // open while streaming
    const summary = document.createElement('summary');
    summary.className = 'thinking-summary';
    summary.innerHTML = '<span class="thinking-label">Thinking</span><span class="thinking-spinner"></span>';
    thinkingBlock.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'thinking-body';
    thinkingBlock.appendChild(body);
    const content = lastMsg.querySelector('.message-content');
    content.parentNode.insertBefore(thinkingBlock, content);
  }

  const body = thinkingBlock.querySelector('.thinking-body');
  body.textContent = text;
  scrollToBottom();
}

function collapseThinking() {
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  const lastMsg = allMsgs[allMsgs.length - 1];
  if (!lastMsg) return;

  const thinkingBlock = lastMsg.querySelector('.thinking-block');
  if (thinkingBlock && thinkingBlock.open) {
    thinkingBlock.open = false;
    // Remove spinner, add duration
    const spinner = thinkingBlock.querySelector('.thinking-spinner');
    if (spinner) spinner.remove();
  }
}

function appendToolActivity(block) {
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  const lastMsg = allMsgs[allMsgs.length - 1];
  if (!lastMsg) return;

  // Clear thinking indicator
  const thinkingEl = lastMsg.querySelector('.thinking-indicator');
  if (thinkingEl) thinkingEl.remove();

  let activityZone = lastMsg.querySelector('.tool-activity');
  if (!activityZone) {
    activityZone = document.createElement('div');
    activityZone.className = 'tool-activity';
    const content = lastMsg.querySelector('.message-content');
    content.parentNode.insertBefore(activityZone, content);
  }

  const item = document.createElement('div');
  item.className = 'tool-item running';
  item.dataset.toolId = block.id;

  const icon = getToolIcon(block.name);
  const detail = formatToolInput(block.name, block.input);
  const shortName = block.name.replace(/^mcp__[^_]+__/, '');

  item.innerHTML = `<span class="tool-icon">${icon}</span><span class="tool-name">${shortName}</span><span class="tool-detail">${escapeHtml(detail)}</span><span class="tool-spinner"></span>`;

  // Click to expand/collapse input
  if (block.input) {
    item.style.cursor = 'pointer';
    const expanded = document.createElement('pre');
    expanded.className = 'tool-expanded hidden';
    expanded.textContent = JSON.stringify(block.input, null, 2);
    item.appendChild(expanded);
    item.addEventListener('click', () => expanded.classList.toggle('hidden'));
  }

  activityZone.appendChild(item);
  scrollToBottom();
}

function updateToolResult(block) {
  const toolId = block.tool_use_id;
  if (!toolId) return;
  const item = document.querySelector(`.tool-item[data-tool-id="${toolId}"]`);
  if (!item) return;

  item.classList.remove('running');
  item.classList.add('done');
  const spinner = item.querySelector('.tool-spinner');
  if (spinner) spinner.remove();

  // Add a checkmark
  const check = document.createElement('span');
  check.className = 'tool-check';
  check.textContent = '\u2713';
  item.appendChild(check);
}

// === Command Palette ===
const commandPalette = document.getElementById('command-palette');
let paletteIndex = -1;

// GUI-only commands
const guiCommands = [
  { cmd: '/help', desc: 'Show all available commands' },
  { cmd: '/cost', desc: 'Show session cost & token usage' },
  { cmd: '/model', desc: 'Show or switch model (opus/sonnet/haiku)' },
  { cmd: '/voice', desc: 'Toggle voice readback on/off' },
  { cmd: '/clear', desc: 'Clear chat (keeps session)' },
  { cmd: '/new', desc: 'New conversation (resets session)' },
  { cmd: '/export', desc: 'Export conversation as markdown' },
  { cmd: '/cwd', desc: 'Show current working directory' },
  { cmd: '/capture', desc: 'Take a screen capture' },
  { cmd: '/prompts', desc: 'List saved prompts' },
  { cmd: '/config', desc: 'Open settings panel' },
  { cmd: '/debug', desc: 'Show debug error log' },
];

// CLI skills — dynamically populated from init event
let cliSkillCommands = [];

// Combined list for palette
function getCommandList() {
  return [...guiCommands, ...cliSkillCommands];
}

function showPalette(filter) {
  const query = filter.toLowerCase();
  const allCommands = getCommandList();
  const matches = allCommands.filter(c => c.cmd.includes(query) || c.desc.toLowerCase().includes(query));

  if (matches.length === 0) {
    commandPalette.classList.add('hidden');
    return;
  }

  paletteIndex = 0;
  commandPalette.innerHTML = matches.map((c, i) =>
    `<div class="cmd-item${i === 0 ? ' active' : ''}" data-cmd="${c.cmd}">
      <span class="cmd-name">${c.cmd}</span>
      <span class="cmd-desc">${c.desc}</span>
    </div>`
  ).join('');

  commandPalette.classList.remove('hidden');

  commandPalette.querySelectorAll('.cmd-item').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.cmd + ' ';
      input.focus();
      hidePalette();
    });
    el.addEventListener('mouseenter', () => {
      commandPalette.querySelectorAll('.cmd-item').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      paletteIndex = [...commandPalette.children].indexOf(el);
    });
  });
}

function hidePalette() {
  commandPalette.classList.add('hidden');
  paletteIndex = -1;
}

function navigatePalette(dir) {
  const items = commandPalette.querySelectorAll('.cmd-item');
  if (items.length === 0) return;
  items[paletteIndex]?.classList.remove('active');
  paletteIndex = (paletteIndex + dir + items.length) % items.length;
  items[paletteIndex]?.classList.add('active');
  items[paletteIndex]?.scrollIntoView({ block: 'nearest' });
}

function selectPaletteItem() {
  const items = commandPalette.querySelectorAll('.cmd-item');
  if (paletteIndex >= 0 && items[paletteIndex]) {
    input.value = items[paletteIndex].dataset.cmd + ' ';
    input.focus();
    hidePalette();
    return true;
  }
  return false;
}

// === Input handling ===
input.addEventListener('keydown', (e) => {
  const paletteVisible = !commandPalette.classList.contains('hidden');

  if (paletteVisible) {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigatePalette(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigatePalette(-1); return; }
    if (e.key === 'Tab') { e.preventDefault(); selectPaletteItem(); return; }
    if (e.key === 'Escape') { e.preventDefault(); hidePalette(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hidePalette();
      sendMessage();
      return;
    }
  }

  if (settings.enterSend) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (state.isStreaming) window.api.abortResponse();
      else sendMessage();
    }
  } else {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (state.isStreaming) window.api.abortResponse();
      else sendMessage();
    }
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';

  const text = input.value;
  if (text.startsWith('/') && !text.includes('\n')) {
    showPalette(text);
  } else {
    hidePalette();
  }
});

sendBtn.addEventListener('click', () => {
  if (state.isStreaming) window.api.abortResponse();
  else sendMessage();
});

// === New chat ===
newChatBtn.addEventListener('click', async () => {
  await window.api.newConversation();
  messagesEl.innerHTML = '';
  if (welcome) { messagesEl.appendChild(welcome); welcome.style.display = ''; }
  sessionInfo.textContent = '';
  state.currentAssistantText = '';
  state.pendingImages = [];
  state.pendingFiles = [];
  state.messages = [];
  state.totalCost = 0;
  statusCost.textContent = '';
  statusTokens.textContent = '';
  statusDuration.textContent = '';
  statusModel.textContent = '';
  renderImageStrip();
  showToast('New conversation');
});

// === Search (Ctrl+F) ===
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    searchBar.classList.remove('hidden');
    searchInput.focus();
  }
  if (e.key === 'Escape') {
    searchBar.classList.add('hidden');
    searchInput.value = '';
    clearSearchHighlights();
  }
});

searchClose.addEventListener('click', () => {
  searchBar.classList.add('hidden');
  searchInput.value = '';
  clearSearchHighlights();
});

searchInput.addEventListener('input', () => {
  clearSearchHighlights();
  const query = searchInput.value.trim().toLowerCase();
  if (!query) { searchCount.textContent = ''; return; }

  const msgs = messagesEl.querySelectorAll('.message-content');
  let count = 0;
  msgs.forEach(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.toLowerCase().includes(query)) {
        count++;
        // Highlight first occurrence per text node (simple approach)
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(
          new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
          '<mark class="search-highlight">$1</mark>'
        );
        node.parentNode.replaceChild(span, node);
      }
    }
  });
  searchCount.textContent = count > 0 ? `${count} found` : 'No results';
});

function clearSearchHighlights() {
  messagesEl.querySelectorAll('.search-highlight').forEach(el => {
    const text = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(text, el);
  });
  // Clean up wrapper spans
  messagesEl.querySelectorAll('.message-content span:not([class])').forEach(span => {
    if (span.parentNode) {
      while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
      span.remove();
    }
  });
}

// === Saved Prompts ===
const promptsList = document.getElementById('prompts-list');
const addPromptBtn = document.getElementById('add-prompt-btn');
const promptModal = document.getElementById('prompt-modal');
const promptModalTitle = document.getElementById('prompt-modal-title');
const promptNameInput = document.getElementById('prompt-name-input');
const promptTextInput = document.getElementById('prompt-text-input');
const promptCancel = document.getElementById('prompt-cancel');
const promptSave = document.getElementById('prompt-save');

let editingPromptId = null;

async function renderPrompts() {
  const prompts = await window.api.getPrompts();
  promptsList.innerHTML = '';
  if (prompts.length === 0) {
    promptsList.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:4px 8px;">No saved prompts</div>';
    return;
  }
  for (const p of prompts) {
    const div = document.createElement('div');
    div.className = 'prompt-item';
    div.title = p.text;
    div.innerHTML = `
      <span class="prompt-item-name">${escapeHtml(p.name)}</span>
      <span class="prompt-item-actions">
        <button class="prompt-item-btn edit" data-id="${p.id}" title="Edit">&#9998;</button>
        <button class="prompt-item-btn del" data-id="${p.id}" title="Delete">&times;</button>
      </span>
    `;
    // Click to insert into input
    div.addEventListener('click', (e) => {
      if (e.target.closest('.prompt-item-btn')) return;
      input.value = p.text;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      input.focus();
      showToast(`Loaded: ${p.name}`);
    });
    promptsList.appendChild(div);
  }

  // Edit/delete handlers
  promptsList.querySelectorAll('.prompt-item-btn.edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const prompts = await window.api.getPrompts();
      const p = prompts.find(x => x.id === btn.dataset.id);
      if (!p) return;
      editingPromptId = p.id;
      promptModalTitle.textContent = 'Edit Prompt';
      promptNameInput.value = p.name;
      promptTextInput.value = p.text;
      promptModal.classList.remove('hidden');
      promptNameInput.focus();
    });
  });

  promptsList.querySelectorAll('.prompt-item-btn.del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.deletePrompt(btn.dataset.id);
      renderPrompts();
      showToast('Prompt deleted');
    });
  });
}

addPromptBtn.addEventListener('click', () => {
  editingPromptId = null;
  promptModalTitle.textContent = 'Save Prompt';
  promptNameInput.value = '';
  promptTextInput.value = input.value || '';
  promptModal.classList.remove('hidden');
  promptNameInput.focus();
});

promptCancel.addEventListener('click', () => promptModal.classList.add('hidden'));

promptSave.addEventListener('click', async () => {
  const name = promptNameInput.value.trim();
  const text = promptTextInput.value.trim();
  if (!name || !text) { showToast('Name and text required'); return; }

  if (editingPromptId) {
    await window.api.updatePrompt({ id: editingPromptId, name, text });
  } else {
    await window.api.savePrompt({ name, text });
  }
  promptModal.classList.add('hidden');
  renderPrompts();
  showToast('Prompt saved');
});

// Close modal on Escape
promptModal.addEventListener('click', (e) => {
  if (e.target === promptModal) promptModal.classList.add('hidden');
});

renderPrompts();

// === File Explorer ===
const explorerPanel = document.getElementById('explorer-panel');
const explorerList = document.getElementById('explorer-list');
const explorerPath = document.getElementById('explorer-path');
const explorerUp = document.getElementById('explorer-up');
const explorerRefresh = document.getElementById('explorer-refresh');
const explorerClose = document.getElementById('explorer-close');
const toggleExplorer = document.getElementById('toggle-explorer');

let explorerCurrentDir = '';

function explorerFileIcon(name, isDir) {
  if (isDir) return '\u{1F4C1}';
  return fileIcon(name);
}

async function loadExplorer(dirPath) {
  const result = await window.api.readDir(dirPath || undefined);
  explorerCurrentDir = result.dir;
  explorerPath.textContent = result.dir;
  explorerPath.title = result.dir;
  explorerList.innerHTML = '';

  if (result.error) {
    explorerList.innerHTML = `<div style="padding:8px 10px;font-size:12px;color:var(--danger);">${result.error}</div>`;
    return;
  }

  if (result.entries.length === 0) {
    explorerList.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-muted);">Empty directory</div>';
    return;
  }

  for (const entry of result.entries) {
    const div = document.createElement('div');
    div.className = `explorer-item${entry.isDir ? ' dir' : ''}`;
    div.innerHTML = `<span class="explorer-item-icon">${explorerFileIcon(entry.name, entry.isDir)}</span>${entry.name}`;
    div.title = entry.path;

    div.addEventListener('click', () => {
      if (entry.isDir) {
        loadExplorer(entry.path);
      } else {
        // Attach file
        const ext = entry.name.split('.').pop().toLowerCase();
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
        if (imageExts.includes(ext)) {
          const dataURL = `file://${entry.path.replace(/\\/g, '/')}`;
          addImagePreview(dataURL, entry.path);
        } else {
          addFilePreview(entry.name, entry.path);
        }
      }
    });

    explorerList.appendChild(div);
  }
}

toggleExplorer.addEventListener('click', () => {
  const isHidden = explorerPanel.classList.toggle('hidden');
  if (!isHidden) loadExplorer(state.cwd || undefined);
});

explorerClose.addEventListener('click', () => explorerPanel.classList.add('hidden'));

explorerUp.addEventListener('click', () => {
  if (!explorerCurrentDir) return;
  const parent = explorerCurrentDir.replace(/[\\/][^\\/]+$/, '');
  if (parent && parent !== explorerCurrentDir) loadExplorer(parent);
});

explorerRefresh.addEventListener('click', () => loadExplorer(explorerCurrentDir));

// === Voice Readback (Edge Neural TTS) ===
const voiceToggle = document.getElementById('voice-toggle');
const voiceSelect = document.getElementById('voice-select');
const voiceControls = document.getElementById('voice-controls');
const voiceStop = document.getElementById('voice-stop');

let currentAudio = null;

const preferredVoices = [
  'en-AU-NatashaNeural',   // Australian female (warm, natural)
  'en-GB-SoniaNeural',     // British female
  'en-GB-LibbyNeural',     // British female
  'en-GB-MaisieNeural',    // British female (younger)
  'en-AU-ElsieNeural',     // Australian female
];

async function loadTTSVoices() {
  voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
  const voices = await window.api.ttsGetVoices();

  if (!voices || voices.length === 0) {
    voiceSelect.innerHTML = '<option value="">No voices available</option>';
    return;
  }

  // Sort: preferred first, then female, then alphabetical
  const sorted = [...voices].sort((a, b) => {
    const idxA = preferredVoices.indexOf(a.name);
    const idxB = preferredVoices.indexOf(b.name);
    const sa = idxA >= 0 ? idxA : (a.gender === 'Female' ? 50 : 100);
    const sb = idxB >= 0 ? idxB : (b.gender === 'Female' ? 50 : 100);
    if (sa !== sb) return sa - sb;
    return a.friendly.localeCompare(b.friendly);
  });

  voiceSelect.innerHTML = '';
  for (const v of sorted) {
    const opt = document.createElement('option');
    opt.value = v.name;
    const flag = v.locale.includes('AU') ? '\u{1F1E6}\u{1F1FA}' :
                 v.locale.includes('GB') ? '\u{1F1EC}\u{1F1E7}' :
                 v.locale.includes('US') ? '\u{1F1FA}\u{1F1F8}' : '';
    opt.textContent = `${flag} ${v.friendly}`;
    voiceSelect.appendChild(opt);
  }

  // Restore saved preference
  const saved = localStorage.getItem('claude-chat-voice');
  if (saved && sorted.find(v => v.name === saved)) {
    voiceSelect.value = saved;
  } else {
    // Default to first preferred voice that exists
    const defaultVoice = preferredVoices.find(pv => sorted.find(v => v.name === pv));
    if (defaultVoice) voiceSelect.value = defaultVoice;
  }
}

loadTTSVoices();

// Persist preferences
voiceToggle.checked = localStorage.getItem('claude-chat-voice-on') === 'true';
voiceSelect.addEventListener('change', () => localStorage.setItem('claude-chat-voice', voiceSelect.value));
voiceToggle.addEventListener('change', () => localStorage.setItem('claude-chat-voice-on', voiceToggle.checked));

voiceStop.addEventListener('click', () => {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.api.ttsStop();
  voiceControls.classList.add('hidden');
});

async function speakText(text) {
  if (!voiceToggle.checked || !text) return;

  // Stop any current playback
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  // Strip markdown/code for cleaner speech
  let clean = text
    .replace(/```[\s\S]*?```/g, '. Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 3) return;

  voiceControls.classList.remove('hidden');
  showToast('Generating speech...');

  try {
    const audioResult = await window.api.ttsSpeak(clean, voiceSelect.value);
    if (!audioResult || (typeof audioResult === 'object' && audioResult.error)) {
      const errMsg = audioResult?.error || 'ttsSpeak returned null';
      logDebugError('TTS', `Backend error: ${errMsg}\nVoice: ${voiceSelect.value}\nText length: ${clean.length}`);
      voiceControls.classList.add('hidden');
      showToast('TTS failed', 3000, true);
      return;
    }
    const audioPath = audioResult;

    const audioUrl = `file://${audioPath.replace(/\\/g, '/')}`;
    logDebugError('TTS-info', `Audio file: ${audioPath}\nURL: ${audioUrl}\nVoice: ${voiceSelect.value}`);
    currentAudio = new Audio(audioUrl);
    currentAudio.playbackRate = settings.speechRate;
    currentAudio.onended = () => { voiceControls.classList.add('hidden'); currentAudio = null; };
    currentAudio.onerror = (ev) => {
      const mediaErr = currentAudio?.error;
      const detail = mediaErr ? `code=${mediaErr.code} message=${mediaErr.message}` : 'unknown';
      logDebugError('TTS-playback', `Audio playback error: ${detail}\nURL: ${audioUrl}`);
      voiceControls.classList.add('hidden');
      showToast('Audio playback failed', 3000, true);
    };
    currentAudio.play().catch(playErr => {
      logDebugError('TTS-play', `play() rejected: ${playErr.message}\nURL: ${audioUrl}`);
      voiceControls.classList.add('hidden');
      showToast('Audio play failed', 3000, true);
    });
  } catch (e) {
    logDebugError('TTS', `Exception: ${e.message}\nStack: ${e.stack}`);
    voiceControls.classList.add('hidden');
    showToast('TTS failed', 3000, true);
  }
}

// === Config Panel ===
const configModal = document.getElementById('config-modal');
const configCwd = document.getElementById('config-cwd');
const configCwdBtn = document.getElementById('config-cwd-btn');
const configVoiceToggle = document.getElementById('config-voice-toggle');
const configVoiceSelect = document.getElementById('config-voice-select');
const configSpeechRate = document.getElementById('config-speech-rate');
const configRateLabel = document.getElementById('config-rate-label');
const configFontSize = document.getElementById('config-font-size');
const configFontLabel = document.getElementById('config-font-label');
const configEnterSend = document.getElementById('config-enter-send');
const configNotifications = document.getElementById('config-notifications');
const configSessionId = document.getElementById('config-session-id');
const configClose = document.getElementById('config-close');
const configSearch = document.getElementById('config-search');
const claudeConfigList = document.getElementById('claude-config-list');

// Tab switching
document.querySelectorAll('.config-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.config-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('config-tab-' + tab.dataset.tab).style.display = '';
  });
});

// Load persisted settings
const settings = {
  speechRate: parseFloat(localStorage.getItem('claude-chat-speech-rate') || '1.1'),
  fontSize: parseInt(localStorage.getItem('claude-chat-font-size') || '14'),
  enterSend: localStorage.getItem('claude-chat-enter-send') !== 'false',
  notifications: localStorage.getItem('claude-chat-notifications') !== 'false',
};

// Apply font size on load
document.documentElement.style.setProperty('--msg-font-size', settings.fontSize + 'px');

async function renderClaudeConfig(filter = '') {
  const { schema, values } = await window.api.getClaudeConfig();
  claudeConfigList.innerHTML = '';

  for (const item of schema) {
    if (filter && !item.label.toLowerCase().includes(filter) && !item.key.toLowerCase().includes(filter)) continue;

    // Resolve current value
    const parts = item.key.split('.');
    let currentVal;
    if (parts.length === 2) {
      currentVal = values[parts[0]]?.[parts[1]];
    } else {
      currentVal = values[item.key];
    }
    if (currentVal === undefined) currentVal = item.default;

    const row = document.createElement('div');
    row.className = 'claude-config-row';

    const label = document.createElement('span');
    label.className = 'claude-config-label';
    label.textContent = item.label;
    row.appendChild(label);

    const valSpan = document.createElement('span');
    valSpan.className = 'claude-config-value';

    if (item.type === 'boolean') {
      valSpan.textContent = currentVal ? 'true' : 'false';
      valSpan.style.color = currentVal ? 'var(--success)' : 'var(--text-secondary)';
      valSpan.addEventListener('click', async () => {
        const newVal = !currentVal;
        await window.api.setClaudeConfig(item.key, newVal);
        showToast(`${item.label}: ${newVal}`);
        renderClaudeConfig(filter);
      });
    } else if (item.type === 'enum') {
      const select = document.createElement('select');
      for (const opt of item.options) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (String(currentVal) === String(opt)) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener('change', async () => {
        await window.api.setClaudeConfig(item.key, select.value);
        showToast(`${item.label}: ${select.value}`);
      });
      valSpan.appendChild(select);
    }

    row.appendChild(valSpan);
    claudeConfigList.appendChild(row);
  }
}

async function openConfig() {
  configCwd.textContent = state.cwd || 'Not set';
  configCwd.title = state.cwd || '';
  configVoiceToggle.checked = voiceToggle.checked;
  configSpeechRate.value = settings.speechRate;
  configRateLabel.textContent = settings.speechRate + 'x';
  configFontSize.value = settings.fontSize;
  configFontLabel.textContent = settings.fontSize + 'px';
  configEnterSend.checked = settings.enterSend;
  configNotifications.checked = settings.notifications;
  configSessionId.textContent = state.sessionId || 'No active session';
  configSearch.value = '';

  // Populate voice dropdown
  configVoiceSelect.innerHTML = voiceSelect.innerHTML;
  configVoiceSelect.value = voiceSelect.value;

  // Load Claude Code config
  await renderClaudeConfig();

  configModal.classList.remove('hidden');
  configSearch.focus();
}

// Search filter
configSearch.addEventListener('input', () => {
  const filter = configSearch.value.toLowerCase();
  renderClaudeConfig(filter);
  // Also filter app settings sections
  document.querySelectorAll('#config-tab-app .config-section').forEach(section => {
    const label = section.querySelector('.config-label')?.textContent || '';
    section.style.display = label.toLowerCase().includes(filter) || !filter ? '' : 'none';
  });
});

configClose.addEventListener('click', () => {
  // Save app settings
  voiceToggle.checked = configVoiceToggle.checked;
  localStorage.setItem('claude-chat-voice-on', voiceToggle.checked);
  if (configVoiceSelect.value !== voiceSelect.value) {
    voiceSelect.value = configVoiceSelect.value;
    localStorage.setItem('claude-chat-voice', voiceSelect.value);
  }
  settings.speechRate = parseFloat(configSpeechRate.value);
  localStorage.setItem('claude-chat-speech-rate', settings.speechRate);
  settings.fontSize = parseInt(configFontSize.value);
  localStorage.setItem('claude-chat-font-size', settings.fontSize);
  document.documentElement.style.setProperty('--msg-font-size', settings.fontSize + 'px');
  settings.enterSend = configEnterSend.checked;
  localStorage.setItem('claude-chat-enter-send', settings.enterSend);
  settings.notifications = configNotifications.checked;
  localStorage.setItem('claude-chat-notifications', settings.notifications);

  configModal.classList.add('hidden');
  showToast('Settings saved');
});

configModal.addEventListener('click', (e) => {
  if (e.target === configModal) configModal.classList.add('hidden');
});

configCwdBtn.addEventListener('click', async () => {
  const newCwd = await window.api.setCwd();
  if (newCwd) {
    state.cwd = newCwd;
    cwdBtn.textContent = shortenPath(newCwd);
    cwdBtn.title = newCwd;
    configCwd.textContent = newCwd;
    configCwd.title = newCwd;
  }
});

configSpeechRate.addEventListener('input', () => {
  configRateLabel.textContent = parseFloat(configSpeechRate.value).toFixed(1) + 'x';
});

configFontSize.addEventListener('input', () => {
  configFontLabel.textContent = configFontSize.value + 'px';
});

// Focus input on load
input.focus();
