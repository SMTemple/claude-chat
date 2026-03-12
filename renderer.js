// === Setup Wizard ===
(async () => {
  const setup = await window.api.checkSetup();
  if (setup.setupComplete) return;

  const wizard = document.getElementById('setup-wizard');
  const appEl = document.getElementById('app');
  wizard.classList.remove('hidden');
  appEl.style.display = 'none';

  const totalSteps = 4;
  let currentStep = 1;
  const wizardData = { cwd: setup.cwd, model: 'opus' };

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

  const cliCheck = document.getElementById('wizard-cli-check');
  const apiCheck = document.getElementById('wizard-api-check');
  const prereqHint = document.getElementById('wizard-prereq-hint');
  cliCheck.classList.add(setup.claudeInstalled ? 'pass' : 'fail');
  // If CLI is installed, auth is handled (OAuth or API key)
  apiCheck.classList.add(setup.claudeInstalled ? 'pass' : 'warn');
  if (!setup.claudeInstalled) {
    prereqHint.textContent = 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code';
  } else {
    prereqHint.textContent = 'Authentication is managed by the Claude CLI (OAuth, Claude Max, or API key).';
  }

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

  document.getElementById('wizard-next').addEventListener('click', async () => {
    if (currentStep === 3) {
      const selected = document.querySelector('input[name="wizard-model"]:checked');
      if (selected) wizardData.model = selected.value;
    }
    if (currentStep === totalSteps) {
      await window.api.completeSetup(wizardData);
      wizard.classList.add('hidden');
      appEl.style.display = '';
      initTerminal();
      return;
    }
    currentStep++;
    showStep(currentStep);
  });

  document.getElementById('wizard-back').addEventListener('click', () => {
    if (currentStep > 1) { currentStep--; showStep(currentStep); }
  });
})();

// === Toast ===
function showToast(msg, duration = 2000) {
  const t = document.createElement('div');
  Object.assign(t.style, {
    position: 'fixed', top: '12px', right: '16px',
    background: '#6366f1', color: '#fff', padding: '8px 20px', borderRadius: '6px',
    fontSize: '13px', fontWeight: '500', zIndex: '9999', opacity: '0',
    transition: 'opacity 0.2s', pointerEvents: 'none',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = '1');
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, duration);
}

if (performance.navigation?.type === 1 || performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  showToast('Refreshed');
}

// === State ===
const state = {
  pendingImages: [],
  pendingFiles: [],
  cwd: '',
  sessionModel: 'opus',
  claudeRunning: false,
};

// Completion chime — armed by GUI send, fires once after 5s PTY silence
let chimeArmed = false;
let chimeResponseSeen = false; // true once ●/⏺ detected after send

// === DOM refs ===
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
const configBtn = document.getElementById('config-btn');

// === xterm.js ===
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');

let term;
let fitAddon;

function getTermFontSize() {
  return parseInt(localStorage.getItem('claude-chat-font-size') || '14');
}

function initTerminal() {
  const container = document.getElementById('terminal-container');
  if (term) { term.dispose(); }

  term = new Terminal({
    cursorBlink: true,
    fontSize: getTermFontSize(),
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    theme: {
      background: '#0d0d14',
      foreground: '#e4e4ed',
      cursor: '#6366f1',
      cursorAccent: '#0d0d14',
      selectionBackground: '#6366f140',
      black: '#0d0d14',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#6366f1',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e4e4ed',
      brightBlack: '#5e5e80',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fbbf24',
      brightBlue: '#818cf8',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    },
    allowTransparency: true,
    scrollback: 10000,
    convertEol: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon((event, uri) => {
    window.api.openExternal(uri);
  }));

  term.open(container);
  fitAddon.fit();

  // Copy/paste support for terminal
  term.attachCustomKeyEventHandler((e) => {
    // Ctrl+Shift+A → select all terminal content
    if (e.ctrlKey && e.shiftKey && e.key === 'A' && e.type === 'keydown') {
      term.selectAll();
      showToast('Terminal selected — Ctrl+C to copy');
      return false;
    }
    // Ctrl+Shift+C → copy selection
    if (e.ctrlKey && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel);
      return false;
    }
    // Ctrl+Shift+V or Ctrl+V → paste from clipboard
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V') && e.type === 'keydown') {
      navigator.clipboard.readText().then(text => {
        if (text) window.api.ptyInput(text);
      });
      return false;
    }
    // Ctrl+C with selection → copy (without selection, let it send SIGINT)
    if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
      const sel = term.getSelection();
      if (sel) {
        navigator.clipboard.writeText(sel);
        term.clearSelection();
        return false;
      }
    }
    return true;
  });

  // Right-click → context menu with copy + render options
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const sel = term.getSelection();

    // Remove any existing context menu
    document.querySelectorAll('.term-context-menu').forEach(m => m.remove());

    if (!sel) return;

    const menu = document.createElement('div');
    menu.className = 'term-context-menu';
    menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:10000;
      background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;
      padding:4px 0;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.3);font-size:13px;`;

    function addItem(label, icon, onClick) {
      const item = document.createElement('div');
      item.style.cssText = `padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text-primary);`;
      item.innerHTML = `<span style="width:16px;text-align:center;">${icon}</span>${label}`;
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-hover)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => { menu.remove(); onClick(); });
      menu.appendChild(item);
    }

    addItem('Copy', '&#128203;', () => {
      navigator.clipboard.writeText(sel);
      showToast('Copied to clipboard');
    });

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(divider);

    // Auto-detect content type for render options
    const trimmed = sel.trim();
    const looksHtml = /<!DOCTYPE|<html|<head|<body|<div|<section|<main|<p\b|<h[1-6]\b/i.test(trimmed);
    const looksMd = /^#{1,6}\s|\*\*|^\s*[-*]\s|^\s*\d+\.\s|```/m.test(trimmed);

    if (looksHtml) {
      addItem('Render as HTML', '&#127760;', () => openPreviewModal(trimmed, 'html'));
    }
    if (looksMd) {
      addItem('Render as Markdown', '&#128196;', () => openPreviewModal(trimmed, 'markdown'));
    }
    addItem('Render as Code', '&#128187;', () => openPreviewModal(trimmed, 'code'));

    // Also allow adding to artifacts panel
    const divider2 = document.createElement('div');
    divider2.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
    menu.appendChild(divider2);

    if (looksHtml) {
      addItem('Add as HTML Artifact', '&#128640;', () => { addArtifact(trimmed, 'html', 'Selection'); showToast('HTML artifact added'); });
    }
    if (looksMd) {
      addItem('Add as Markdown Artifact', '&#128640;', () => { addArtifact(trimmed, 'markdown', 'Selection'); showToast('Markdown artifact added'); });
    }
    addItem('Add as Code Artifact', '&#128640;', () => { addArtifact(trimmed, 'code', 'Selection'); showToast('Code artifact added'); });

    document.body.appendChild(menu);

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    // Close on click outside or Escape
    function closeMenu(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closeMenu); }
    }
    function closeMenuKey(ev) {
      if (ev.key === 'Escape') { menu.remove(); document.removeEventListener('keydown', closeMenuKey); }
    }
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu);
      document.addEventListener('keydown', closeMenuKey);
    }, 0);
  });

  // Terminal input → PTY
  term.onData((data) => {
    window.api.ptyInput(data);
  });

  // PTY output → terminal + voice readback
  let responseBuffer = '';
  let isResponding = false;
  let responseTimeout = null;
  let doneNotifyTimeout = null;

  function stripAnsi(str) {
    return str
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // CSI sequences (including ? params)
      .replace(/\x1b\][^\x07]*\x07/g, '')         // OSC sequences
      .replace(/\x1b[()][A-Z0-9]/g, '')           // charset sequences
      .replace(/\x1b[=><!]/g, '')                  // mode sequences
      .replace(/\x1b\[[\d;]*m/g, '')              // SGR leftovers
      .replace(/\r/g, '');                         // carriage returns
  }

  function cleanResponseText(raw) {
    return stripAnsi(raw).trim()
      .split('\n').filter(l => {
        const t = l.trim();
        if (!t) return false;
        if (t.match(/^[❯>]\s*$/)) return false;
        if (t.match(/accept edits/)) return false;
        if (t.match(/\d+\s*tokens/)) return false;
        if (t.match(/current:|latest:/)) return false;
        if (t.match(/shift\+tab/i)) return false;
        return true;
      })
      .join('\n')
      .replace(/^[●⏺]\s*/, '')
      .trim();
  }

  // Extract file content from Write tool output displayed in the terminal.
  // Format: ● Write(path)\n  ⎿  Wrote N lines to path\n       1 line1\n       2 line2\n...
  function extractWriteArtifacts(text) {
    const artifacts = [];
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      // Match Write tool header
      const writeMatch = t.match(/^[●⏺]\s*Write\((.+?)\)/);
      if (!writeMatch) { i++; continue; }
      const filePath = writeMatch[1];
      i++;
      // Skip the "Wrote N lines" status line
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (lt.match(/^[⎿└]\s*Wrote \d+ lines/)) { i++; break; }
        if (lt && !lt.match(/^[⎿└]/)) break; // not part of this tool
        i++;
      }
      // Collect numbered content lines (leading spaces + number + optional content)
      // Empty lines in the file show as just "      18" (number with no trailing content)
      const contentLines = [];
      while (i < lines.length) {
        const line = lines[i];
        const numMatch = line.match(/^\s+(\d+)(?: (.*))?$/);
        if (numMatch) {
          contentLines.push(numMatch[2] || '');
          i++;
        } else if (line.trim() === '' && contentLines.length > 0) {
          // Empty line — peek ahead for more numbered lines before continuing
          let peek = i + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek < lines.length && lines[peek].match(/^\s+(\d+)(?: (.*))?$/)) {
            contentLines.push('');
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      if (contentLines.length < 3) continue;
      const content = contentLines.join('\n').trim();
      // Determine type from file extension
      const ext = filePath.split('.').pop().toLowerCase();
      if (ext === 'html' || ext === 'htm') {
        artifacts.push({ content, type: 'html', label: filePath.split(/[/\\]/).pop() });
      } else if (ext === 'md' || ext === 'markdown') {
        artifacts.push({ content, type: 'markdown', label: filePath.split(/[/\\]/).pop() });
      } else if (['js','ts','jsx','tsx','py','css','json','xml','svg','sh','rb','php','java','c','cpp','go','rs'].includes(ext)) {
        artifacts.push({ content, type: 'code', label: filePath.split(/[/\\]/).pop() });
      }
    }
    return artifacts;
  }

  // Extract code from markdown fences (```lang ... ```) if Claude uses them in text output
  function extractCodeFences(text) {
    const blocks = [];
    const fenceRegex = /```(\w*)\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = fenceRegex.exec(text)) !== null) {
      const lang = match[1];
      const code = match[2].trim();
      if (code.length < 50) continue;
      if (lang === 'html' && (code.match(/<!DOCTYPE|<html|<head|<body/i) || code.length > 200)) {
        blocks.push({ content: code, type: 'html', label: 'HTML' });
      } else if ((lang === 'md' || lang === 'markdown') && code.length > 50) {
        blocks.push({ content: code, type: 'markdown', label: 'Markdown' });
      } else if (code.length > 100) {
        blocks.push({ content: code, type: 'code', label: lang || 'Code' });
      }
    }
    return blocks;
  }

  function flushResponseBuffer() {
    const raw = responseBuffer;
    responseBuffer = '';
    isResponding = false;
    if (!raw.trim()) return;

    const clean = cleanResponseText(raw);

    // 1. Extract artifacts from Write tool output (most reliable source)
    const writeArtifacts = extractWriteArtifacts(clean);
    for (const a of writeArtifacts) {
      addArtifact(a.content, a.type, a.label);
    }

    // 2. Look for code fences in response text (fallback)
    const fenceArtifacts = extractCodeFences(clean);
    for (const a of fenceArtifacts) {
      addArtifact(a.content, a.type, a.label);
    }

  }

  // Show loading spinner until Claude Code's prompt is ready
  const loadingEl = document.getElementById('terminal-loading');
  let startupDone = false;

  window.api.onPtyOutput((data) => {
    term.write(data);

    if (loadingEl && !startupDone) {
      const p = stripAnsi(data);
      if (p.includes('❯') || p.includes('>  ') || p.includes('accept edits')) {
        startupDone = true;
        loadingEl.classList.add('fade-out');
        setTimeout(() => loadingEl.remove(), 500);
      }
    }

    // Buffer response text for content detection
    const plain = stripAnsi(data);
    if (plain.includes('●') || plain.includes('⏺')) {
      isResponding = true;
      responseBuffer = '';
    }
    if (isResponding) {
      responseBuffer += plain;
      if (responseTimeout) clearTimeout(responseTimeout);
      if (plain.includes('❯')) {
        clearTimeout(responseTimeout);
        flushResponseBuffer();
      } else {
        responseTimeout = setTimeout(() => {
          flushResponseBuffer();
        }, 800);
      }
    }

    // Completion chime: armed by GUI send, waits for response start (●/⏺),
    // then fires once after 5s of total PTY silence.
    if (chimeArmed && (plain.includes('●') || plain.includes('⏺'))) {
      chimeResponseSeen = true;
    }
    if (chimeArmed && chimeResponseSeen) {
      if (doneNotifyTimeout) clearTimeout(doneNotifyTimeout);
      doneNotifyTimeout = setTimeout(() => {
        doneNotifyTimeout = null;
        chimeArmed = false;
        chimeResponseSeen = false;
        playDoneChime();
        showToast('Response complete', 1500);
        if (settings.notifications) {
          window.api.notify('Claude Chat', 'Response complete');
        }
      }, 5000);
    }
  });

  // PTY exit
  window.api.onPtyExit((code) => {
    state.claudeRunning = false;
    term.writeln('');
    term.writeln(`\x1b[33m[Claude exited with code ${code}. Press any key or click "New Chat" to restart.]\x1b[0m`);
    sessionInfo.textContent = 'Claude exited';
  });

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon && term) {
      fitAddon.fit();
      window.api.resizePty(term.cols, term.rows);
    }
  });
  resizeObserver.observe(container);

  // Start Claude
  startClaude();
}

async function startClaude() {
  state.claudeRunning = true;
  sessionInfo.textContent = 'Starting Claude...';
  const dims = term ? { cols: term.cols, rows: term.rows } : { cols: 120, rows: 30 };
  await window.api.startClaude(dims);
  sessionInfo.textContent = 'Claude running';
}

// === Init on load (if setup already done) ===
window.api.onInitState(({ cwd, model }) => {
  state.cwd = cwd;
  state.sessionModel = model;
  cwdBtn.textContent = shortenPath(cwd);
  cwdBtn.title = cwd;
  modelSelect.value = model;
});

// Auto-init if setup is complete
(async () => {
  const setup = await window.api.checkSetup();
  if (setup.setupComplete) initTerminal();
})();

function shortenPath(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Simple markdown → HTML renderer for preview/artifacts
function renderMarkdownToHtml(md) {
  // Protect code blocks first
  const codeBlocks = [];
  let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre style="background:#1a1a28;padding:12px;border-radius:6px;overflow-x:auto;margin:8px 0;font-family:var(--font-mono);font-size:12px;"><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });
  // Protect inline code
  html = html.replace(/`([^`]+)`/g, (_, code) =>
    `<code style="background:#1a1a28;padding:2px 6px;border-radius:3px;font-size:12px;font-family:var(--font-mono);">${escapeHtml(code)}</code>`
  );
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:15px;color:#e4e4ed;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:14px 0 8px;font-size:17px;color:#e4e4ed;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:16px 0 10px;font-size:20px;color:#e4e4ed;">$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:20px;">$1</li>');
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px;list-style-type:decimal;">$1</li>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#818cf8;">$1</a>');
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #2a2a44;margin:12px 0;">');
  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p style="margin:8px 0;">');
  // Single newlines → <br>
  html = html.replace(/\n/g, '<br>');
  html = '<p style="margin:8px 0;">' + html + '</p>';
  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`\x00CB${i}\x00`, block);
  });
  return html;
}

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
    div.innerHTML = `<div class="file-preview-tag"><span title="${escapeHtml(file.name)}">${fileIcon(file.name)} ${escapeHtml(file.name)}</span></div><button class="remove-img" data-type="file" data-index="${i}">&times;</button>`;
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

// === Paste handler ===
document.addEventListener('paste', async (e) => {
  // Only handle image pastes when terminal is NOT focused, or always for images
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

const dropOverlay = document.createElement('div');
dropOverlay.id = 'drop-overlay';
dropOverlay.textContent = 'Drop files here';
document.body.appendChild(dropOverlay);

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
        const savedPath = await window.api.saveImage(reader.result);
        if (savedPath) addImagePreview(reader.result, savedPath);
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

// === Send message from GUI input ===
function sendFromGUI() {
  const text = input.value.trim();
  if (!text && state.pendingImages.length === 0 && state.pendingFiles.length === 0) return;
  if (text) pushHistory(text);

  // Build prompt — must be single-line to avoid PTY newline = Enter/submit issues
  const imagePaths = state.pendingImages.map(img => img.path).filter(Boolean);
  const filePaths = state.pendingFiles.map(f => f.path).filter(Boolean);

  const parts = [];
  if (imagePaths.length > 0) {
    parts.push(`Read these images: ${imagePaths.join(' , ')}`);
  }
  if (filePaths.length > 0) {
    parts.push(`Read these files: ${filePaths.join(' , ')}`);
  }
  if (text) parts.push(text);
  const prompt = parts.join(' — ');

  // Write to PTY — collapse multi-line to single line for PTY compatibility,
  // then send Enter separately so Claude Code's TUI processes correctly.
  // Claude Code may detect bulk ptyInput as a paste ("[Pasted text #1]"),
  // requiring a second Enter: first accepts the paste, second submits it.
  chimeArmed = true;
  chimeResponseSeen = false;
  const singleLine = prompt.replace(/[\r\n]+/g, ' ').trim();
  if (singleLine) {
    window.api.ptyInput(singleLine);
    setTimeout(() => window.api.ptyInput('\r'), 50);
    setTimeout(() => window.api.ptyInput('\r'), 200);
  }

  // Clear
  input.value = '';
  input.style.height = 'auto';
  state.pendingImages = [];
  state.pendingFiles = [];
  renderImageStrip();

  // Keep focus on GUI input for quick follow-ups
  input.focus();
}

// === Input history ===
const inputHistory = JSON.parse(localStorage.getItem('claude-chat-input-history') || '[]');
let historyIndex = -1;
let historyDraft = '';

function pushHistory(text) {
  if (!text.trim()) return;
  // Avoid duplicating the last entry
  if (inputHistory.length > 0 && inputHistory[inputHistory.length - 1] === text) return;
  inputHistory.push(text);
  // Keep last 100 entries
  if (inputHistory.length > 100) inputHistory.shift();
  localStorage.setItem('claude-chat-input-history', JSON.stringify(inputHistory));
  historyIndex = -1;
}

// === Settings ===
const settings = {
  enterSend: localStorage.getItem('claude-chat-enter-send') !== 'false',
  notifications: localStorage.getItem('claude-chat-notifications') !== 'false',
  fontSize: parseInt(localStorage.getItem('claude-chat-font-size') || '14'),
  doneChime: localStorage.getItem('claude-chat-done-chime') !== 'false', // on by default
};

// === Completion chime (Web Audio API) ===
let audioCtx = null;
function playDoneChime() {
  if (!settings.doneChime) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    // Two-tone chime: C5 → E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.35);
    });
  } catch (e) { /* audio not available */ }
}

// === Input handling ===
input.addEventListener('keydown', (e) => {
  if (settings.enterSend) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFromGUI();
    }
  } else {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      sendFromGUI();
    }
  }
  // Up/Down arrow for input history
  if (e.key === 'ArrowUp' && inputHistory.length > 0) {
    e.preventDefault();
    if (historyIndex === -1) historyDraft = input.value;
    if (historyIndex < inputHistory.length - 1) {
      historyIndex++;
      input.value = inputHistory[inputHistory.length - 1 - historyIndex];
    }
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = inputHistory[inputHistory.length - 1 - historyIndex];
    } else if (historyIndex === 0) {
      historyIndex = -1;
      input.value = historyDraft;
    }
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
});

sendBtn.addEventListener('click', sendFromGUI);

// === Model selector ===
modelSelect.addEventListener('change', async () => {
  state.sessionModel = modelSelect.value;
  await window.api.setModel(modelSelect.value);
  // Restart claude with new model
  if (term) {
    term.clear();
    const dims = { cols: term.cols, rows: term.rows };
    await window.api.restartClaude(dims);
  }
  showToast(`Restarting with model: ${modelSelect.value}`);
});

// === CWD selector ===
cwdBtn.addEventListener('click', async () => {
  const newCwd = await window.api.setCwd();
  if (newCwd) {
    state.cwd = newCwd;
    cwdBtn.textContent = shortenPath(newCwd);
    cwdBtn.title = newCwd;
    // Restart claude in new directory
    if (term) {
      term.clear();
      const dims = { cols: term.cols, rows: term.rows };
      await window.api.restartClaude(dims);
    }
    showToast(`Directory: ${shortenPath(newCwd)}`);
  }
});

// === New chat ===
newChatBtn.addEventListener('click', async () => {
  if (term) {
    term.clear();
    const dims = { cols: term.cols, rows: term.rows };
    await window.api.restartClaude(dims);
  }
  artifacts.length = 0;
  renderArtifacts();
  showToast('New conversation');
});

// === Export terminal ===
exportBtn.addEventListener('click', async () => {
  if (!term) { showToast('No terminal'); return; }
  // Get terminal buffer content
  const buffer = term.buffer.active;
  let text = '';
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) text += line.translateToString(true) + '\n';
  }
  if (!text.trim()) { showToast('Nothing to export'); return; }
  const path = await window.api.exportConversation(text);
  if (path) showToast('Exported!');
});

// === Copy All Output ===
const copyAllBtn = document.getElementById('copy-all-btn');
copyAllBtn.addEventListener('click', () => {
  if (!term) { showToast('No terminal'); return; }
  const buffer = term.buffer.active;
  let text = '';
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) text += line.translateToString(true) + '\n';
  }
  text = text.trimEnd();
  if (!text) { showToast('Nothing to copy'); return; }
  navigator.clipboard.writeText(text);
  showToast('All output copied to clipboard');
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
    // Click to insert into input field (user can review/edit before sending)
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
    div.innerHTML = `<span class="explorer-item-icon">${entry.isDir ? '\u{1F4C1}' : fileIcon(entry.name)}</span>${escapeHtml(entry.name)}`;
    div.title = entry.path;

    div.addEventListener('click', () => {
      if (entry.isDir) {
        loadExplorer(entry.path);
      } else {
        const ext = entry.name.split('.').pop().toLowerCase();
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
        if (imageExts.includes(ext)) {
          addImagePreview(`file://${entry.path.replace(/\\/g, '/')}`, entry.path);
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

// === Artifacts Panel ===
const artifactsPanel = document.getElementById('artifacts-panel');
const artifactsList = document.getElementById('artifacts-list');
const artifactsCount = document.getElementById('artifacts-count');
const artifactsClear = document.getElementById('artifacts-clear');
const artifactsClose = document.getElementById('artifacts-close');
const toggleArtifacts = document.getElementById('toggle-artifacts');
const artifacts = [];

function addArtifact(content, type, fileLabel) {
  // Deduplicate — skip if the new content is substantially similar to the last artifact
  if (artifacts.length > 0) {
    const last = artifacts[artifacts.length - 1];
    // Compare normalized content (strip whitespace) to catch reformatted duplicates
    const normalize = (s) => s.replace(/\s+/g, '').slice(0, 500);
    if (last.type === type && normalize(last.content) === normalize(content)) return;
  }

  const id = 'artifact-' + Date.now();
  // Use file label if provided, otherwise try to extract from content
  let label = fileLabel || (type === 'html' ? 'HTML' : type === 'markdown' ? 'Markdown' : 'Code');
  if (type === 'html' && !fileLabel) {
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) label = titleMatch[1];
  }
  artifacts.push({ id, content, type, label });
  renderArtifacts();
  // Auto-show the panel when artifact is added
  artifactsPanel.classList.remove('hidden');
}

function renderArtifacts() {
  artifactsCount.textContent = artifacts.length;
  artifactsCount.dataset.count = artifacts.length;
  artifactsList.innerHTML = '';

  if (artifacts.length === 0) {
    artifactsList.innerHTML = '<div id="artifacts-empty">No artifacts yet. Claude\'s HTML, markdown, and code outputs will appear here.</div>';
    return;
  }

  for (let i = artifacts.length - 1; i >= 0; i--) {
    const a = artifacts[i];
    const card = document.createElement('div');
    card.className = 'artifact-card';
    card.dataset.id = a.id;

    const icon = a.type === 'html' ? '&#127760;' : a.type === 'markdown' ? '&#128221;' : '&#128196;';
    card.innerHTML = `
      <div class="artifact-card-header">
        <span class="artifact-card-icon">${icon}</span>
        <span class="artifact-card-title">${escapeHtml(a.label)} #${i + 1}</span>
        <span class="artifact-card-type">${a.type}</span>
        <button class="artifact-card-delete" title="Delete artifact">&times;</button>
        <span class="artifact-card-chevron">&#9654;</span>
      </div>
      <div class="artifact-card-body"></div>
    `;

    // Delete button
    card.querySelector('.artifact-card-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = artifacts.findIndex(x => x.id === a.id);
      if (idx >= 0) {
        artifacts.splice(idx, 1);
        renderArtifacts();
        showToast('Artifact deleted');
      }
    });

    // Click header to toggle expand/collapse
    const header = card.querySelector('.artifact-card-header');
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasExpanded = card.classList.contains('expanded');
      // Collapse all others
      artifactsList.querySelectorAll('.artifact-card.expanded').forEach(c => c.classList.remove('expanded'));
      if (!wasExpanded) {
        card.classList.add('expanded');
        renderArtifactBody(card, a);
      }
    });

    artifactsList.appendChild(card);
  }
}

function renderArtifactBody(card, artifact) {
  const body = card.querySelector('.artifact-card-body');
  if (body.dataset.rendered) return; // already rendered
  body.dataset.rendered = '1';

  if (artifact.type === 'html') {
    const html = artifact.content;

    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.srcdoc = html;
    body.appendChild(iframe);

    const actions = document.createElement('div');
    actions.className = 'artifact-card-actions';
    actions.innerHTML = `<button class="copy-src">Copy Source</button><button class="open-preview">Open Full Preview</button>`;
    actions.querySelector('.copy-src').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(html);
      showToast('HTML copied');
    });
    actions.querySelector('.open-preview').addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(html, artifact.type);
    });
    body.appendChild(actions);
  } else if (artifact.type === 'markdown') {
    const rendered = document.createElement('div');
    rendered.style.cssText = 'padding:10px;font-size:13px;color:var(--text-primary);line-height:1.6;';
    rendered.innerHTML = renderMarkdownToHtml(artifact.content);
    body.appendChild(rendered);

    const actions = document.createElement('div');
    actions.className = 'artifact-card-actions';
    actions.innerHTML = `<button class="copy-src">Copy Source</button><button class="copy-clean">Copy Clean Text</button><button class="open-preview">Open Full Preview</button>`;
    actions.querySelector('.copy-src').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(artifact.content);
      showToast('Markdown source copied');
    });
    actions.querySelector('.copy-clean').addEventListener('click', (e) => {
      e.stopPropagation();
      // Copy rendered text without markdown syntax
      const tmp = document.createElement('div');
      tmp.innerHTML = renderMarkdownToHtml(artifact.content);
      navigator.clipboard.writeText(tmp.innerText);
      showToast('Clean text copied');
    });
    actions.querySelector('.open-preview').addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(artifact.content, artifact.type);
    });
    body.appendChild(actions);
  } else {
    // Code artifact — content is already the extracted code
    const codeText = artifact.content;
    const pre = document.createElement('pre');
    pre.textContent = codeText.slice(0, 2000) + (codeText.length > 2000 ? '\n...(truncated)' : '');
    body.appendChild(pre);

    const actions = document.createElement('div');
    actions.className = 'artifact-card-actions';
    actions.innerHTML = `<button class="copy-src">Copy Code</button><button class="open-preview">Open Full Preview</button>`;
    actions.querySelector('.copy-src').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(codeText);
      showToast('Code copied');
    });
    actions.querySelector('.open-preview').addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(artifact.content, artifact.type);
    });
    body.appendChild(actions);
  }
}

// Click outside to collapse expanded artifacts
document.addEventListener('click', (e) => {
  if (!e.target.closest('.artifact-card') && !e.target.closest('.artifact-card-actions')) {
    artifactsList.querySelectorAll('.artifact-card.expanded').forEach(c => c.classList.remove('expanded'));
  }
});

toggleArtifacts.addEventListener('click', () => {
  artifactsPanel.classList.toggle('hidden');
});

artifactsClose.addEventListener('click', () => artifactsPanel.classList.add('hidden'));

artifactsClear.addEventListener('click', () => {
  artifacts.length = 0;
  renderArtifacts();
  showToast('Artifacts cleared');
});

renderArtifacts();

// === Voice Readback ===
const voiceToggle = document.getElementById('voice-toggle');
const voiceSelect = document.getElementById('voice-select');
const voiceControls = document.getElementById('voice-controls');
const voiceStop = document.getElementById('voice-stop');
let currentAudio = null;

const preferredVoices = [
  'en-AU-NatashaNeural', 'en-GB-SoniaNeural', 'en-GB-LibbyNeural',
  'en-GB-MaisieNeural', 'en-AU-ElsieNeural',
];

async function loadTTSVoices() {
  voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
  const voices = await window.api.ttsGetVoices();
  if (!voices || voices.length === 0) {
    voiceSelect.innerHTML = '<option value="">No voices available</option>';
    return;
  }

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

  const saved = localStorage.getItem('claude-chat-voice');
  if (saved && sorted.find(v => v.name === saved)) {
    voiceSelect.value = saved;
  } else {
    const defaultVoice = preferredVoices.find(pv => sorted.find(v => v.name === pv));
    if (defaultVoice) voiceSelect.value = defaultVoice;
  }
}

// Load voices — retry after 5s if initial load returns empty (main process may still be starting)
loadTTSVoices().then(() => {
  if (voiceSelect.value === '' || voiceSelect.options.length <= 1) {
    setTimeout(loadTTSVoices, 5000);
  }
});

voiceToggle.checked = localStorage.getItem('claude-chat-voice-on') === 'true';
voiceSelect.addEventListener('change', () => localStorage.setItem('claude-chat-voice', voiceSelect.value));
voiceToggle.addEventListener('change', () => localStorage.setItem('claude-chat-voice-on', voiceToggle.checked));

voiceStop.addEventListener('click', () => {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.api.ttsStop();
  voiceControls.classList.add('hidden');
});

// === Content Preview Modal ===
const previewModal = document.getElementById('preview-modal');
const previewRendered = document.getElementById('preview-rendered');
const previewSourceCode = document.getElementById('preview-source-code');
const previewCopy = document.getElementById('preview-copy');
const previewCopyRendered = document.getElementById('preview-copy-rendered');
const previewClose = document.getElementById('preview-close');
const previewTitle = document.getElementById('preview-title');
let previewRawContent = '';

function openPreviewModal(content, type) {
  previewRawContent = content;

  if (type === 'html') {
    // Extract HTML — try to get content from code fences first, fallback to raw
    let html = content;
    const fenceMatch = content.match(/```(?:html)?\n([\s\S]*?)```/);
    if (fenceMatch) html = fenceMatch[1].trim();

    previewTitle.textContent = 'HTML Preview';
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.srcdoc = html;
    previewRendered.innerHTML = '';
    previewRendered.appendChild(iframe);
    previewSourceCode.textContent = html;
    previewRawContent = html;
  } else if (type === 'markdown') {
    previewTitle.textContent = 'Markdown Preview';
    previewRendered.innerHTML = `<div style="line-height:1.6;font-size:14px;color:var(--text-primary);">${renderMarkdownToHtml(content)}</div>`;
    previewSourceCode.textContent = content;
    previewRawContent = content;
  } else {
    // Code — show source, extract code blocks
    previewTitle.textContent = 'Content Preview';
    const blocks = [];
    const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = fenceRegex.exec(content)) !== null) {
      blocks.push({ lang: match[1], code: match[2].trim() });
    }
    if (blocks.length > 0) {
      previewRendered.innerHTML = blocks.map((b, i) =>
        `<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${b.lang || 'code'} (block ${i + 1})</div><pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;overflow-x:auto;"><code>${escapeHtml(b.code)}</code></pre></div>`
      ).join('');
      previewSourceCode.textContent = blocks.map(b => b.code).join('\n\n');
      previewRawContent = blocks.map(b => b.code).join('\n\n');
    } else {
      previewRendered.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
      previewSourceCode.textContent = content;
    }
  }

  previewModal.classList.remove('hidden');
}

document.querySelectorAll('.preview-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    previewRendered.style.display = tab.dataset.view === 'rendered' ? '' : 'none';
    document.getElementById('preview-source').style.display = tab.dataset.view === 'source' ? '' : 'none';
  });
});

previewCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(previewRawContent);
  showToast('Source copied');
});

previewCopyRendered.addEventListener('click', () => {
  // Copy the visible rendered text (or rendered HTML for pasting into rich editors)
  const rendered = previewRendered.innerText || previewRendered.textContent;
  navigator.clipboard.writeText(rendered);
  showToast('Rendered text copied');
});

previewClose.addEventListener('click', () => previewModal.classList.add('hidden'));
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.classList.add('hidden');
});

// === Config Panel ===
const configModal = document.getElementById('config-modal');
const configCwd = document.getElementById('config-cwd');
const configCwdBtn = document.getElementById('config-cwd-btn');
const configVoiceToggle = document.getElementById('config-voice-toggle');
const configVoiceSelect = document.getElementById('config-voice-select');
const configFontSize = document.getElementById('config-font-size');
const configFontLabel = document.getElementById('config-font-label');
const configEnterSend = document.getElementById('config-enter-send');
const configNotifications = document.getElementById('config-notifications');
const configClose = document.getElementById('config-close');
const configSearch = document.getElementById('config-search');
const claudeConfigList = document.getElementById('claude-config-list');

document.querySelectorAll('.config-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.config-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('config-tab-' + tab.dataset.tab).style.display = '';
  });
});

async function renderClaudeConfig(filter = '') {
  const { schema, values } = await window.api.getClaudeConfig();
  claudeConfigList.innerHTML = '';

  for (const item of schema) {
    if (filter && !item.label.toLowerCase().includes(filter) && !item.key.toLowerCase().includes(filter)) continue;

    const parts = item.key.split('.');
    let currentVal;
    if (parts.length === 2) currentVal = values[parts[0]]?.[parts[1]];
    else currentVal = values[item.key];
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
  configFontSize.value = settings.fontSize;
  configFontLabel.textContent = settings.fontSize + 'px';
  configEnterSend.checked = settings.enterSend;
  configNotifications.checked = settings.notifications;
  document.getElementById('config-done-chime').checked = settings.doneChime;
  configSearch.value = '';
  // Reload voices if sidebar has none yet
  if (voiceSelect.options.length <= 1 && voiceSelect.value === '') {
    await loadTTSVoices();
  }
  configVoiceSelect.innerHTML = voiceSelect.innerHTML;
  configVoiceSelect.value = voiceSelect.value;
  await renderClaudeConfig();
  configModal.classList.remove('hidden');
  configSearch.focus();
}

configBtn.addEventListener('click', openConfig);

configSearch.addEventListener('input', () => {
  const filter = configSearch.value.toLowerCase();
  renderClaudeConfig(filter);
  document.querySelectorAll('#config-tab-app .config-section').forEach(section => {
    const label = section.querySelector('.config-label')?.textContent || '';
    section.style.display = label.toLowerCase().includes(filter) || !filter ? '' : 'none';
  });
});

configClose.addEventListener('click', () => {
  voiceToggle.checked = configVoiceToggle.checked;
  localStorage.setItem('claude-chat-voice-on', voiceToggle.checked);
  if (configVoiceSelect.value !== voiceSelect.value) {
    voiceSelect.value = configVoiceSelect.value;
    localStorage.setItem('claude-chat-voice', voiceSelect.value);
  }
  settings.fontSize = parseInt(configFontSize.value);
  localStorage.setItem('claude-chat-font-size', settings.fontSize);
  if (term) term.options.fontSize = settings.fontSize;
  if (fitAddon) fitAddon.fit();
  settings.enterSend = configEnterSend.checked;
  localStorage.setItem('claude-chat-enter-send', settings.enterSend);
  settings.notifications = configNotifications.checked;
  localStorage.setItem('claude-chat-notifications', settings.notifications);
  settings.doneChime = document.getElementById('config-done-chime').checked;
  localStorage.setItem('claude-chat-done-chime', settings.doneChime);
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

configFontSize.addEventListener('input', () => {
  configFontLabel.textContent = configFontSize.value + 'px';
});

// === Debug / Test UI ===
const debugModal = document.getElementById('debug-modal');
const debugLog = document.getElementById('debug-log');
const debugTestBtn = document.getElementById('debug-test-btn');
const debugClose = document.getElementById('debug-close');
const debugClearLog = document.getElementById('debug-clear-log');

function dlog(msg) {
  const ts = new Date().toLocaleTimeString();
  debugLog.textContent += `[${ts}] ${msg}\n`;
  debugLog.scrollTop = debugLog.scrollHeight;
}

function dlogPass(name) { dlog(`PASS: ${name}`); }
function dlogFail(name, err) { dlog(`FAIL: ${name} — ${err}`); }

const debugTests = {
  toast() {
    showToast('Debug toast test!');
    dlogPass('Toast displayed');
  },

  'artifact-html'() {
    const html = `<!DOCTYPE html><html><head><title>Test Page</title></head><body style="font-family:sans-serif;padding:20px;"><h1>Test HTML Artifact</h1><p>Generated by debug mode at ${new Date().toLocaleTimeString()}</p></body></html>`;
    addArtifact(html, 'html', 'test-page.html');
    dlogPass('HTML artifact added');
  },

  'artifact-md'() {
    const md = `# Test Markdown\n\nThis is a **test** markdown artifact.\n\n## Features\n- Bold text\n- Code blocks\n- Lists\n\n\`\`\`js\nconsole.log('hello');\n\`\`\`\n\nGenerated at ${new Date().toLocaleTimeString()}`;
    addArtifact(md, 'markdown', 'test.md');
    dlogPass('Markdown artifact added');
  },

  'artifact-code'() {
    const code = `function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\n// Test\nfor (let i = 0; i < 10; i++) {\n  console.log(fibonacci(i));\n}`;
    addArtifact(code, 'code', 'fibonacci.js');
    dlogPass('Code artifact added');
  },

  preview() {
    const md = `# Preview Test\n\nThis tests the preview modal with **markdown** content.\n\n## Code Example\n\`\`\`python\ndef hello():\n    print("Hello, world!")\n\`\`\`\n\n- Item 1\n- Item 2\n- Item 3`;
    openPreviewModal(md, 'markdown');
    dlogPass('Preview modal opened with markdown');
  },

  'copy-all'() {
    if (!term) { dlogFail('Copy All', 'No terminal'); return; }
    const buffer = term.buffer.active;
    let lineCount = 0;
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line && line.translateToString(true).trim()) lineCount++;
    }
    dlog(`Terminal buffer: ${buffer.length} total lines, ${lineCount} non-empty`);
    dlogPass('Copy All — buffer readable');
  },

  'select-all'() {
    if (!term) { dlogFail('Select All', 'No terminal'); return; }
    term.selectAll();
    const sel = term.getSelection();
    dlog(`Selected ${sel.length} chars`);
    term.clearSelection();
    dlogPass('Select All works');
  },

  state() {
    dlog(`State: ${JSON.stringify({
      cwd: state.cwd,
      model: state.sessionModel,
      running: state.claudeRunning,
      pendingImages: state.pendingImages.length,
      pendingFiles: state.pendingFiles.length,
      artifacts: artifacts.length,
      settings: { enterSend: settings.enterSend, fontSize: settings.fontSize, notifications: settings.notifications },
    }, null, 2)}`);
    dlogPass('State dumped');
  },

  'term-info'() {
    if (!term) { dlogFail('Terminal Info', 'No terminal'); return; }
    dlog(`Terminal: cols=${term.cols} rows=${term.rows} bufLen=${term.buffer.active.length} fontSize=${term.options.fontSize}`);
    dlogPass('Terminal info retrieved');
  },

  chime() {
    playDoneChime();
    dlogPass('Completion chime played');
  },

  'run-all'() {
    dlog('--- Running all tests ---');
    const testOrder = ['toast', 'chime', 'state', 'term-info', 'select-all', 'copy-all', 'artifact-html', 'artifact-md', 'artifact-code'];
    let i = 0;
    function next() {
      if (i >= testOrder.length) { dlog('--- All tests complete ---'); return; }
      const name = testOrder[i++];
      try { debugTests[name](); } catch (e) { dlogFail(name, e.message); }
      setTimeout(next, 300);
    }
    next();
  },
};

debugTestBtn.addEventListener('click', () => {
  debugLog.textContent = '';
  dlog('Debug mode opened. Click buttons to test UI components.');
  debugModal.classList.remove('hidden');
});

debugModal.addEventListener('click', (e) => {
  if (e.target === debugModal) debugModal.classList.add('hidden');
});

debugClose.addEventListener('click', () => debugModal.classList.add('hidden'));
debugClearLog.addEventListener('click', () => { debugLog.textContent = ''; });

document.querySelectorAll('.debug-action').forEach(btn => {
  btn.addEventListener('click', () => {
    const testName = btn.dataset.test;
    if (debugTests[testName]) {
      try { debugTests[testName](); } catch (e) { dlogFail(testName, e.message); }
    }
  });
});
