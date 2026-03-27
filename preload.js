const { ipcRenderer } = require('electron');
const { webUtils } = require('electron');

// Clean up stale listeners from previous page loads (Ctrl+R reload)
ipcRenderer.removeAllListeners('pty-output');
ipcRenderer.removeAllListeners('pty-exit');
ipcRenderer.removeAllListeners('init-state');

window.api = {
  // PTY (all calls include tabId for multi-tab routing)
  startClaude: (opts) => ipcRenderer.invoke('start-claude', opts),  // { tabId, cols, rows }
  ptyInput: (tabId, data) => ipcRenderer.invoke('pty-input', { tabId, data }),
  resizePty: (tabId, cols, rows) => ipcRenderer.invoke('resize-pty', { tabId, cols, rows }),
  restartClaude: (opts) => ipcRenderer.invoke('restart-claude', opts),  // { tabId, cols, rows }
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', { tabId }),
  onPtyOutput: (cb) => ipcRenderer.on('pty-output', (_e, tabId, data) => cb(tabId, data)),
  onPtyExit: (cb) => ipcRenderer.on('pty-exit', (_e, tabId, code) => cb(tabId, code)),

  // Files & images
  saveImage: (dataURL) => ipcRenderer.invoke('save-image', dataURL),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  screenCapture: () => ipcRenderer.invoke('screen-capture'),

  // Settings
  setModel: (model) => ipcRenderer.invoke('set-model', model),
  setCwd: () => ipcRenderer.invoke('set-cwd'),
  exportConversation: (text) => ipcRenderer.invoke('export-conversation', text),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // Saved prompts
  getPrompts: () => ipcRenderer.invoke('get-prompts'),
  savePrompt: (prompt) => ipcRenderer.invoke('save-prompt', prompt),
  deletePrompt: (id) => ipcRenderer.invoke('delete-prompt', id),
  updatePrompt: (prompt) => ipcRenderer.invoke('update-prompt', prompt),

  // File explorer
  readDir: (dirPath) => ipcRenderer.invoke('read-dir', dirPath),

  // Claude Code config
  getClaudeConfig: () => ipcRenderer.invoke('get-claude-config'),
  setClaudeConfig: (key, value) => ipcRenderer.invoke('set-claude-config', { key, value }),

  // Setup wizard
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  completeSetup: (data) => ipcRenderer.invoke('complete-setup', data),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),

  onInitState: (cb) => ipcRenderer.on('init-state', (_e, data) => cb(data)),

  // TTS
  ttsGetVoices: () => ipcRenderer.invoke('tts-get-voices'),
  ttsSpeak: (text, voice) => ipcRenderer.invoke('tts-speak', { text, voice }),
  ttsStop: () => ipcRenderer.invoke('tts-stop'),

  // Open URL in default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Get file path from dropped file
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (e) { return null; }
  },
};
