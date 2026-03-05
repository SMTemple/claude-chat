const { app, BrowserWindow, ipcMain, shell, dialog, Notification, desktopCapturer } = require('electron');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

let mainWindow;
let ptyProcess = null;
let currentModel = 'opus';
try {
  const claudeConfig = path.join(os.homedir(), '.claude', 'settings.local.json');
  if (fs.existsSync(claudeConfig)) {
    const cfg = JSON.parse(fs.readFileSync(claudeConfig, 'utf-8'));
    if (cfg.model) currentModel = cfg.model;
  }
} catch (e) {}
let currentCwd = process.cwd();

const APP_CONFIG_FILE = path.join(os.homedir(), '.claude', 'claude-chat-config.json');
const PROMPTS_FILE = path.join(os.homedir(), '.claude', 'claude-chat-prompts.json');

function loadAppConfig() {
  try {
    if (fs.existsSync(APP_CONFIG_FILE)) return JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf-8'));
  } catch (e) {}
  return {};
}

function saveAppConfig(config) {
  const dir = path.dirname(APP_CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

const appConfig = loadAppConfig();
if (appConfig.cwd && fs.existsSync(appConfig.cwd)) {
  currentCwd = appConfig.cwd;
}

function loadPrompts() {
  try {
    if (fs.existsSync(PROMPTS_FILE)) return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8'));
  } catch (e) {}
  return [];
}

function savePrompts(prompts) {
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8');
}

function createWindow() {
  const { screen } = require('electron');
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.round(screenW * 0.85),
    height: Math.round(screenH * 0.9),
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d0d14',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('init-state', { cwd: currentCwd, model: currentModel });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'r') {
      // Kill PTY silently before reload — suppress exit event
      if (ptyProcess) {
        const p = ptyProcess;
        ptyProcess = null; // null before kill so onExit guard skips the send
        try { p.kill(); } catch (e) {}
      }
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
    if (input.control && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => {
  if (ptyProcess) { try { ptyProcess.kill(); } catch (e) {} }
  app.quit();
});

// === PTY Management ===
function spawnClaude(cols, rows) {
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch (e) {}
    ptyProcess = null;
  }

  const env = { ...process.env };
  delete env.CLAUDECODE;
  // Force color and terminal support
  env.FORCE_COLOR = '1';
  env.TERM = 'xterm-256color';
  // Suppress false-positive PATH warning (known Claude Code bug on Windows)
  env.DISABLE_INSTALLATION_CHECKS = '1';

  // Resolve claude executable path
  let claudeExe = 'claude';
  const localBin = path.join(os.homedir(), '.local', 'bin');
  if (process.platform === 'win32') {
    const localExe = path.join(localBin, 'claude.exe');
    if (fs.existsSync(localExe)) claudeExe = localExe;
    // Ensure localBin is in PATH so Claude Code doesn't warn
    if (env.PATH && !env.PATH.includes(localBin)) {
      env.PATH = localBin + ';' + env.PATH;
    }
  }

  ptyProcess = pty.spawn(claudeExe, ['--model', currentModel], {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 30,
    cwd: currentCwd,
    env,
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty-output', data);
    }
  });

  const thisProcess = ptyProcess;
  ptyProcess.onExit(({ exitCode }) => {
    // Only send exit event if this is still the active PTY (not a silent reload kill)
    if (ptyProcess === thisProcess) {
      ptyProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-exit', exitCode);
      }
    }
  });
}

ipcMain.handle('start-claude', (_event, { cols, rows }) => {
  spawnClaude(cols, rows);
  return true;
});

ipcMain.handle('pty-input', (_event, data) => {
  if (ptyProcess) ptyProcess.write(data);
  return true;
});

ipcMain.handle('resize-pty', (_event, { cols, rows }) => {
  if (ptyProcess) {
    try { ptyProcess.resize(cols, rows); } catch (e) {}
  }
  return true;
});

ipcMain.handle('restart-claude', (_event, { cols, rows }) => {
  spawnClaude(cols, rows);
  return true;
});

// === Image/File Handling ===
ipcMain.handle('save-image', async (_event, dataURL) => {
  const matches = dataURL.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return null;
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const filepath = path.join(TEMP_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
});

ipcMain.handle('set-model', (_event, model) => {
  currentModel = model;
  return true;
});

ipcMain.handle('set-cwd', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentCwd,
  });
  if (result.filePaths && result.filePaths[0]) {
    currentCwd = result.filePaths[0];
    const config = loadAppConfig();
    config.cwd = currentCwd;
    saveAppConfig(config);
    return currentCwd;
  }
  return null;
});

ipcMain.handle('export-conversation', async (_event, text) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `claude-chat-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }, { name: 'Markdown', extensions: ['md'] }],
  });
  if (result.filePath) {
    fs.writeFileSync(result.filePath, text, 'utf-8');
    return result.filePath;
  }
  return null;
});

ipcMain.handle('notify', (_event, { title, body }) => {
  if (Notification.isSupported() && !mainWindow.isFocused()) {
    const n = new Notification({ title, body });
    n.on('click', () => { mainWindow.show(); mainWindow.focus(); });
    n.show();
  }
  return true;
});

ipcMain.handle('screen-capture', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length > 0) {
      const image = sources[0].thumbnail;
      const dataURL = image.toDataURL();
      const buffer = image.toPNG();
      const filename = `capture_${Date.now()}.png`;
      const filepath = path.join(TEMP_DIR, filename);
      fs.writeFileSync(filepath, buffer);
      return { dataURL, filepath };
    }
  } catch (e) {
    console.error('Screen capture failed:', e);
  }
  return null;
});

// === Saved Prompts ===
ipcMain.handle('get-prompts', () => loadPrompts());

ipcMain.handle('save-prompt', (_event, prompt) => {
  const prompts = loadPrompts();
  prompt.id = Date.now().toString(36);
  prompts.push(prompt);
  savePrompts(prompts);
  return prompts;
});

ipcMain.handle('delete-prompt', (_event, id) => {
  let prompts = loadPrompts();
  prompts = prompts.filter(p => p.id !== id);
  savePrompts(prompts);
  return prompts;
});

ipcMain.handle('update-prompt', (_event, updated) => {
  const prompts = loadPrompts();
  const idx = prompts.findIndex(p => p.id === updated.id);
  if (idx >= 0) prompts[idx] = updated;
  savePrompts(prompts);
  return prompts;
});

// === Claude Code Config ===
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_LOCAL_SETTINGS = path.join(os.homedir(), '.claude', 'settings.local.json');

const CLAUDE_CONFIG_SCHEMA = [
  { key: 'autoCompact', label: 'Auto-compact', type: 'boolean', default: true },
  { key: 'showTips', label: 'Show tips', type: 'boolean', default: true },
  { key: 'reduceMotion', label: 'Reduce motion', type: 'boolean', default: false },
  { key: 'thinkingMode', label: 'Thinking mode', type: 'boolean', default: true },
  { key: 'rewindCode', label: 'Rewind code (checkpoints)', type: 'boolean', default: true },
  { key: 'verbose', label: 'Verbose output', type: 'boolean', default: true },
  { key: 'terminalProgressBar', label: 'Terminal progress bar', type: 'boolean', default: true },
  { key: 'respectGitignore', label: 'Respect .gitignore in file picker', type: 'boolean', default: true },
  { key: 'copyFullResponse', label: 'Always copy full response', type: 'boolean', default: false },
  { key: 'autoConnect', label: 'Auto-connect to IDE', type: 'boolean', default: false },
  { key: 'showPRStatusFooter', label: 'Show PR status footer', type: 'boolean', default: true },
  { key: 'permissions.defaultMode', label: 'Default permission mode', type: 'enum', options: ['default', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan'], default: 'acceptEdits' },
  { key: 'autoUpdateChannel', label: 'Auto-update channel', type: 'enum', options: ['latest', 'stable', 'none'], default: 'latest' },
  { key: 'theme', label: 'Theme', type: 'enum', options: ['Dark mode', 'Light mode', 'Auto'], default: 'Dark mode' },
  { key: 'notifications', label: 'Notifications', type: 'enum', options: ['Auto', 'Always', 'Never'], default: 'Auto' },
  { key: 'outputStyle', label: 'Output style', type: 'enum', options: ['default', 'concise', 'verbose', 'markdown'], default: 'default' },
  { key: 'model', label: 'Model', type: 'enum', options: ['Default (recommended)', 'opus', 'sonnet', 'haiku'], default: 'Default (recommended)' },
  { key: 'effortLevel', label: 'Effort level', type: 'enum', options: ['low', 'medium', 'high'], default: 'high' },
];

function readClaudeConfig() {
  const result = {};
  for (const file of [CLAUDE_SETTINGS_FILE, CLAUDE_LOCAL_SETTINGS]) {
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        Object.assign(result, data);
      }
    } catch (e) {}
  }
  return result;
}

ipcMain.handle('get-claude-config', () => {
  return { schema: CLAUDE_CONFIG_SCHEMA, values: readClaudeConfig() };
});

ipcMain.handle('set-claude-config', (_event, { key, value }) => {
  try {
    let data = {};
    if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
      data = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8'));
    }
    const parts = key.split('.');
    if (parts.length === 2) {
      if (!data[parts[0]]) data[parts[0]] = {};
      data[parts[0]][parts[1]] = value;
    } else {
      data[key] = value;
    }
    fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

// === Setup Wizard ===
ipcMain.handle('check-setup', () => {
  const config = loadAppConfig();
  const claudeInstalled = (() => {
    // Check common install location first, then try PATH
    const localBin = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
    if (process.platform === 'win32' && fs.existsSync(localBin)) return true;
    try {
      const { execSync } = require('child_process');
      execSync('claude --version', { stdio: 'pipe', env: { ...process.env, CLAUDECODE: undefined } });
      return true;
    } catch (e) { return false; }
  })();
  return {
    setupComplete: !!config.setupComplete,
    claudeInstalled,
    cwd: config.cwd || currentCwd,
    model: currentModel,
  };
});

ipcMain.handle('complete-setup', (_event, setupData) => {
  const config = loadAppConfig();
  config.setupComplete = true;
  if (setupData.cwd) {
    config.cwd = setupData.cwd;
    currentCwd = setupData.cwd;
  }
  if (setupData.model) currentModel = setupData.model;
  saveAppConfig(config);
  return true;
});

ipcMain.handle('pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentCwd,
  });
  return result.filePaths?.[0] || null;
});

// === File Explorer ===
ipcMain.handle('read-dir', async (_event, dirPath) => {
  const target = dirPath || currentCwd;
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push({
        name: entry.name,
        path: path.join(target, entry.name),
        isDir: entry.isDirectory(),
      });
    }
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { dir: target, entries: results };
  } catch (e) {
    return { dir: target, entries: [], error: e.message };
  }
});

// === Edge Neural TTS (via Python edge-tts + uv) ===
const { execSync, spawn: cpSpawn } = require('child_process');
let ttsChild = null;

const UV_BIN = path.join(os.homedir(), '.local', 'bin', 'uv.exe');
const uvCmd = fs.existsSync(UV_BIN) ? UV_BIN : 'uv';

// Cache voices so subsequent calls are instant
let cachedVoices = null;

ipcMain.handle('tts-get-voices', async () => {
  if (cachedVoices) return cachedVoices;
  try {
    const { execFile } = require('child_process');
    const raw = await new Promise((resolve, reject) => {
      execFile(uvCmd, ['run', '--with', 'edge-tts', 'edge-tts', '--list-voices'], { encoding: 'utf-8', timeout: 30000 }, (err, stdout) => {
        if (err) reject(err); else resolve(stdout);
      });
    });
    const lines = raw.trim().split('\n').slice(2);
    cachedVoices = lines.filter(l => l.match(/^en-/)).map(line => {
      const parts = line.split(/\s{2,}/);
      const name = parts[0]?.trim();
      const gender = parts[1]?.trim() || 'Female';
      const locale = name?.split('-').slice(0, 2).join('-') || 'en-US';
      return { name, friendly: name.replace('Neural', '').replace(/-/g, ' '), locale, gender };
    });
    console.log('[TTS-main] found', cachedVoices.length, 'English voices');
    return cachedVoices;
  } catch (e) {
    console.error('[TTS-main] getVoices error:', e.message);
    return [];
  }
});

ipcMain.handle('tts-speak', async (_event, { text, voice }) => {
  try {
    if (ttsChild) { try { ttsChild.kill(); } catch (e) {} ttsChild = null; }
    const voiceName = voice || 'en-AU-NatashaNeural';
    const outFile = path.join(TEMP_DIR, `tts_${Date.now()}.mp3`);
    // Write text to temp file to avoid shell escaping issues with special chars
    const textFile = path.join(TEMP_DIR, `tts_input_${Date.now()}.txt`);
    fs.writeFileSync(textFile, text, 'utf-8');
    const args = ['run', '--with', 'edge-tts', 'edge-tts', '--voice', voiceName, '--file', textFile, '--rate=+25%', '--write-media', outFile];
    console.log('[TTS-main] speak:', voiceName, 'text length:', text.length);
    ttsChild = cpSpawn(uvCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ttsChild.stderr.on('data', d => { stderr += d.toString(); });
    return new Promise((resolve) => {
      ttsChild.on('exit', (code) => {
        console.log('[TTS-main] exit code:', code, 'stderr:', stderr.slice(0, 200));
        ttsChild = null;
        try { fs.unlinkSync(textFile); } catch (e) {} // clean up temp text file
        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
          console.log('[TTS-main] file created:', outFile, 'size:', fs.statSync(outFile).size);
          resolve(outFile);
        } else {
          console.log('[TTS-main] file not created or empty');
          resolve({ error: 'Audio file not created' });
        }
      });
    });
  } catch (e) {
    console.error('[TTS-main] speak error:', e.message);
    return { error: e.message };
  }
});

ipcMain.handle('tts-stop', () => {
  if (ttsChild) { try { ttsChild.kill(); } catch (e) {} ttsChild = null; }
  return true;
});

ipcMain.handle('pick-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
    ],
  });
  return result.filePaths || [];
});
