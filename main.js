const { app, BrowserWindow, ipcMain, shell, dialog, Notification, desktopCapturer } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEMP_DIR = path.join(os.tmpdir(), 'claude-chat-images');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

let mainWindow;
let activeProcess = null;
let sessionId = null;
// Read default model from Claude Code config
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

// Load saved CWD from app config if available
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
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d0d14',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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

  // Send init state on every page load (including Ctrl+R reload)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('init-state', { cwd: currentCwd, model: currentModel });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'r') {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
    if (input.control && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

// Single instance lock — prevent multiple windows
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
app.on('window-all-closed', () => app.quit());

// Save pasted image to temp file, return path
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

// New conversation
ipcMain.handle('new-conversation', () => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
  sessionId = null;
  return true;
});

// Abort current response
ipcMain.handle('abort-response', () => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
  return true;
});

// Set model
ipcMain.handle('set-model', (_event, model) => {
  currentModel = model;
  return true;
});

// Set working directory
ipcMain.handle('set-cwd', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentCwd,
  });
  if (result.filePaths && result.filePaths[0]) {
    currentCwd = result.filePaths[0];
    // Persist to app config
    const config = loadAppConfig();
    config.cwd = currentCwd;
    saveAppConfig(config);
    return currentCwd;
  }
  return null;
});

// Export conversation as markdown
ipcMain.handle('export-conversation', async (_event, markdown) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `claude-chat-${new Date().toISOString().slice(0, 10)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }],
  });
  if (result.filePath) {
    fs.writeFileSync(result.filePath, markdown, 'utf-8');
    return result.filePath;
  }
  return null;
});

// Desktop notification
ipcMain.handle('notify', (_event, { title, body }) => {
  if (Notification.isSupported() && !mainWindow.isFocused()) {
    const n = new Notification({ title, body });
    n.on('click', () => { mainWindow.show(); mainWindow.focus(); });
    n.show();
  }
  return true;
});

// Screen capture
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

// Send message to Claude CLI
ipcMain.handle('send-message', async (event, { text, imagePaths, model, cwd }) => {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }

  // Build the prompt
  let prompt = '';
  if (imagePaths && imagePaths.length > 0) {
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    const images = imagePaths.filter(p => imageExts.some(ext => p.toLowerCase().endsWith(ext)));
    const files = imagePaths.filter(p => !imageExts.some(ext => p.toLowerCase().endsWith(ext)));

    if (images.length > 0) {
      prompt += 'I am sharing images with you. Please use the Read tool to view each one:\n';
      for (const p of images) prompt += `- ${p}\n`;
      prompt += '\n';
    }
    if (files.length > 0) {
      prompt += 'I am sharing files with you. Please use the Read tool to view each one:\n';
      for (const p of files) prompt += `- ${p}\n`;
      prompt += '\n';
    }
  }
  prompt += text;

  const useModel = model || currentModel;
  const useCwd = cwd || currentCwd;

  const args = ['-p', '--output-format', 'stream-json', '--model', useModel];
  if (sessionId) {
    args.push('--resume', sessionId);
  }

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = spawn('claude', args, {
    env,
    shell: true,
    cwd: useCwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  activeProcess = proc;
  let lineBuffer = '';

  proc.stdin.write(prompt);
  proc.stdin.end();

  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.session_id) sessionId = obj.session_id;
        mainWindow.webContents.send('claude-event', obj);
      } catch (e) {}
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) mainWindow.webContents.send('claude-error', text);
  });

  proc.on('close', (code) => {
    if (lineBuffer.trim()) {
      try {
        const obj = JSON.parse(lineBuffer);
        if (obj.session_id) sessionId = obj.session_id;
        mainWindow.webContents.send('claude-event', obj);
      } catch (e) {}
    }
    activeProcess = null;
    mainWindow.webContents.send('claude-done', { code, sessionId });
  });

  return true;
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

// Known Claude Code config keys with metadata
const CLAUDE_CONFIG_SCHEMA = [
  { key: 'autoCompact', label: 'Auto-compact', type: 'boolean', default: true },
  { key: 'showTips', label: 'Show tips', type: 'boolean', default: true },
  { key: 'reduceMotion', label: 'Reduce motion', type: 'boolean', default: false },
  { key: 'thinkingMode', label: 'Thinking mode', type: 'boolean', default: true },
  { key: 'rewindCode', label: 'Rewind code (checkpoints)', type: 'boolean', default: true },
  { key: 'verbose', label: 'Verbose output', type: 'boolean', default: true },
  { key: 'terminalProgressBar', label: 'Terminal progress bar', type: 'boolean', default: true },
  { key: 'respectGitignore', label: 'Respect .gitignore in file picker', type: 'boolean', default: true },
  { key: 'copyFullResponse', label: 'Always copy full response (skip /copy picker)', type: 'boolean', default: false },
  { key: 'autoConnect', label: 'Auto-connect to IDE (external terminal)', type: 'boolean', default: false },
  { key: 'showPRStatusFooter', label: 'Show PR status footer', type: 'boolean', default: true },
  { key: 'permissions.defaultMode', label: 'Default permission mode', type: 'enum', options: ['default', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan'], default: 'acceptEdits' },
  { key: 'autoUpdateChannel', label: 'Auto-update channel', type: 'enum', options: ['latest', 'stable', 'none'], default: 'latest' },
  { key: 'theme', label: 'Theme', type: 'enum', options: ['Dark mode', 'Light mode', 'Auto'], default: 'Dark mode' },
  { key: 'notifications', label: 'Notifications', type: 'enum', options: ['Auto', 'Always', 'Never'], default: 'Auto' },
  { key: 'outputStyle', label: 'Output style', type: 'enum', options: ['default', 'concise', 'verbose', 'markdown'], default: 'default' },
  { key: 'language', label: 'Language', type: 'enum', options: ['Default (English)', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Korean'], default: 'Default (English)' },
  { key: 'editorMode', label: 'Editor mode', type: 'enum', options: ['normal', 'vim', 'emacs'], default: 'normal' },
  { key: 'model', label: 'Model', type: 'enum', options: ['Default (recommended)', 'opus', 'sonnet', 'haiku'], default: 'Default (recommended)' },
  { key: 'effortLevel', label: 'Effort level', type: 'enum', options: ['low', 'medium', 'high'], default: 'high' },
];

function readClaudeConfig() {
  const result = {};
  // Read both settings files (local overrides global)
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
    // Handle nested keys like 'permissions.defaultMode'
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
    console.error('[Config] Write error:', e);
    return false;
  }
});

// === Setup Wizard ===
ipcMain.handle('check-setup', () => {
  const config = loadAppConfig();
  const claudeInstalled = (() => {
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
  if (setupData.model) {
    currentModel = setupData.model;
  }
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
      // Skip hidden/system files
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push({
        name: entry.name,
        path: path.join(target, entry.name),
        isDir: entry.isDirectory(),
      });
    }
    // Sort: dirs first, then files, alphabetical
    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { dir: target, entries: results };
  } catch (e) {
    return { dir: target, entries: [], error: e.message };
  }
});

// === Edge Neural TTS ===
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
let ttsInstance = null;

ipcMain.handle('tts-get-voices', async () => {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
    // Filter English voices
    return voices
      .filter(v => v.Locale.startsWith('en-'))
      .map(v => ({ name: v.ShortName, friendly: v.FriendlyName, locale: v.Locale, gender: v.Gender }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('tts-speak', async (_event, { text, voice }) => {
  try {
    // Cancel any existing speech
    if (ttsInstance) {
      try { ttsInstance.close(); } catch (e) {}
    }

    ttsInstance = new MsEdgeTTS();
    await ttsInstance.setMetadata(voice || 'en-AU-NatashaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // toFile expects a directory and outputs audio.mp3 inside it
    const outDir = path.join(TEMP_DIR, `tts_${Date.now()}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const result = await ttsInstance.toFile(outDir, text);
    const filePath = result.audioFilePath || path.join(outDir, 'audio.mp3');

    if (!fs.existsSync(filePath)) {
      console.error('[TTS] Audio file not created:', filePath);
      return { error: 'Audio file not created' };
    }

    const stat = fs.statSync(filePath);
    console.log('[TTS] Wrote', stat.size, 'bytes to', filePath);

    if (stat.size === 0) {
      console.error('[TTS] Empty audio file');
      return { error: 'Empty audio file' };
    }

    return filePath;
  } catch (e) {
    console.error('[TTS] Exception:', e.message, e.stack);
    return { error: e.message };
  }
});

ipcMain.handle('tts-stop', () => {
  if (ttsInstance) {
    try { ttsInstance.close(); } catch (e) {}
    ttsInstance = null;
  }
  return true;
});

// Open file dialog for any files
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
