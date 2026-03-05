const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { Marked } = require('marked');
const hljs = require('highlight.js/lib/common');

const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      const escaped = lang ? lang.replace(/"/g, '&quot;') : 'plaintext';
      return `<div class="code-block"><div class="code-header"><span class="code-lang">${escaped}</span><button class="copy-btn" data-copy>Copy</button></div><pre><code class="hljs language-${escaped}">${highlighted}</code></pre></div>`;
    },
    link({ href, text }) {
      return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
    },
  },
  gfm: true,
  breaks: false,
});

contextBridge.exposeInMainWorld('api', {
  sendMessage: (text, imagePaths, model, cwd) => ipcRenderer.invoke('send-message', { text, imagePaths, model, cwd }),
  newConversation: () => ipcRenderer.invoke('new-conversation'),
  abortResponse: () => ipcRenderer.invoke('abort-response'),
  saveImage: (dataURL) => ipcRenderer.invoke('save-image', dataURL),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  setModel: (model) => ipcRenderer.invoke('set-model', model),
  setCwd: () => ipcRenderer.invoke('set-cwd'),
  exportConversation: (md) => ipcRenderer.invoke('export-conversation', md),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  screenCapture: () => ipcRenderer.invoke('screen-capture'),

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

  onClaudeEvent: (cb) => ipcRenderer.on('claude-event', (_e, data) => cb(data)),
  onClaudeDone: (cb) => ipcRenderer.on('claude-done', (_e, data) => cb(data)),
  onClaudeError: (cb) => ipcRenderer.on('claude-error', (_e, msg) => cb(msg)),
  onInitState: (cb) => ipcRenderer.on('init-state', (_e, data) => cb(data)),

  renderMarkdown: (text) => marked.parse(text),

  // TTS
  ttsGetVoices: () => ipcRenderer.invoke('tts-get-voices'),
  ttsSpeak: (text, voice) => ipcRenderer.invoke('tts-speak', { text, voice }),
  ttsStop: () => ipcRenderer.invoke('tts-stop'),

  // Get file path from dropped file (Electron webUtils)
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (e) { return null; }
  },
});
