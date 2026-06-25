const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  name: 'semantic-ai-browser',
  defaults: {
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    apiKeys: [],
    activeApiKeyId: null,
    pages: [],
    collections: []
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'Semantic AI Browser',
    backgroundColor: '#090b14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function safeKeyDescriptor(key) {
  return {
    id: key.id,
    label: key.label,
    provider: key.provider,
    createdAt: key.createdAt,
    masked: key.value ? `${key.value.slice(0, 6)}••••${key.value.slice(-4)}` : ''
  };
}

function getActiveKey() {
  const keys = store.get('apiKeys', []);
  const activeId = store.get('activeApiKeyId');
  return keys.find((key) => key.id === activeId) || keys[0] || null;
}

ipcMain.handle('settings:get', () => ({
  groqModel: store.get('groqModel'),
  apiKeys: store.get('apiKeys', []).map(safeKeyDescriptor),
  activeApiKeyId: store.get('activeApiKeyId')
}));

ipcMain.handle('settings:set-model', (_event, model) => {
  store.set('groqModel', String(model || '').trim() || 'llama-3.3-70b-versatile');
  return { ok: true, groqModel: store.get('groqModel') };
});

ipcMain.handle('keys:add', (_event, payload) => {
  const value = String(payload?.value || '').trim();
  if (!value.startsWith('gsk_')) {
    throw new Error('La clé Groq doit commencer par gsk_.');
  }

  const apiKeys = store.get('apiKeys', []);
  const key = {
    id: `key_${Date.now()}`,
    label: String(payload?.label || `Groq ${apiKeys.length + 1}`).trim(),
    provider: 'groq',
    value,
    createdAt: new Date().toISOString()
  };

  store.set('apiKeys', [...apiKeys, key]);
  store.set('activeApiKeyId', key.id);
  return safeKeyDescriptor(key);
});

ipcMain.handle('keys:activate', (_event, id) => {
  const exists = store.get('apiKeys', []).some((key) => key.id === id);
  if (!exists) throw new Error('Clé introuvable.');
  store.set('activeApiKeyId', id);
  return { ok: true };
});

ipcMain.handle('keys:remove', (_event, id) => {
  const apiKeys = store.get('apiKeys', []).filter((key) => key.id !== id);
  store.set('apiKeys', apiKeys);
  if (store.get('activeApiKeyId') === id) {
    store.set('activeApiKeyId', apiKeys[0]?.id || null);
  }
  return { ok: true };
});

ipcMain.handle('pages:list', () => store.get('pages', []));

ipcMain.handle('pages:save', (_event, page) => {
  const pages = store.get('pages', []);
  const normalized = {
    id: page.id || `page_${Date.now()}`,
    title: String(page.title || 'Sans titre').slice(0, 180),
    url: String(page.url || ''),
    text: String(page.text || '').slice(0, 30000),
    summary: String(page.summary || '').slice(0, 1200),
    keywords: Array.isArray(page.keywords) ? page.keywords.slice(0, 32) : [],
    visits: Number(page.visits || 1),
    updatedAt: new Date().toISOString()
  };
  const next = [normalized, ...pages.filter((item) => item.url !== normalized.url)].slice(0, 500);
  store.set('pages', next);
  return normalized;
});

ipcMain.handle('ai:chat', async (_event, messages) => {
  const key = getActiveKey();
  if (!key) {
    throw new Error('Ajoute une clé API Groq dans Paramètres avant d’utiliser l’IA.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key.value}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: store.get('groqModel'),
      messages,
      temperature: 0.35,
      max_tokens: 900
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Groq a répondu ${response.status}: ${detail.slice(0, 240)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Aucune réponse.';
});

ipcMain.handle('external:open', (_event, url) => shell.openExternal(url));
