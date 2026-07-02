const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const { Worker } = require('worker_threads');
const Store = require('electron-store');

const store = new Store({
  name: 'semantic-ai-browser',
  defaults: {
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
    experienceMode: 'explorer',
    quizGenEndpoint: process.env.QUIZZGEN_ENDPOINT || 'https://quizzgen.alwaysdata.net',
    privacyMode: false,
    apiKeys: [],
    vaultItems: [],
    activeApiKeyId: null,
    pages: [],
    contextState: {
      url: '',
      title: '',
      visibleText: '',
      signals: [],
      updatedAt: null
    }
  }
});

let mainWindow;
const semanticWorker = new Worker(path.join(__dirname, 'workers', 'semantic-indexer.js'));
const pendingWorkerJobs = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    title: 'Semantic AI Browser',
    backgroundColor: '#05070d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  semanticWorker.terminate();
  if (process.platform !== 'darwin') app.quit();
});

semanticWorker.on('message', (message) => {
  const pending = pendingWorkerJobs.get(message.jobId);
  if (!pending) return;
  pendingWorkerJobs.delete(message.jobId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.payload);
});

function runWorker(type, payload) {
  const jobId = `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  semanticWorker.postMessage({ jobId, type, payload });
  return new Promise((resolve, reject) => {
    pendingWorkerJobs.set(jobId, { resolve, reject });
    setTimeout(() => {
      if (!pendingWorkerJobs.has(jobId)) return;
      pendingWorkerJobs.delete(jobId);
      reject(new Error('Le worker sémantique n’a pas répondu à temps.'));
    }, 8000);
  });
}

function encryptSecret(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return { scheme: 'safeStorage', value: safeStorage.encryptString(value).toString('base64') };
  }
  return { scheme: 'plain-local', value };
}

function decryptSecret(secret) {
  if (!secret) return '';
  if (secret.scheme === 'safeStorage') return safeStorage.decryptString(Buffer.from(secret.value, 'base64'));
  return secret.value || '';
}

function safeKeyDescriptor(key) {
  const value = decryptSecret(key.secret);
  return {
    id: key.id,
    label: key.label,
    provider: key.provider,
    createdAt: key.createdAt,
    masked: value ? `${value.slice(0, 6)}••••${value.slice(-4)}` : '',
    encrypted: key.secret?.scheme === 'safeStorage'
  };
}


function safeVaultDescriptor(item) {
  let payload = {};
  try {
    payload = JSON.parse(decryptSecret(item.secret) || '{}');
  } catch {
    payload = {};
  }
  const password = payload.password || payload.value || '';
  return {
    id: item.id,
    label: item.label,
    username: payload.username || '',
    url: payload.url || '',
    note: payload.note || '',
    masked: password ? `${String(password).slice(0, 2)}••••${String(password).slice(-2)}` : '',
    encrypted: item.secret?.scheme === 'safeStorage',
    createdAt: item.createdAt
  };
}

function getActiveKeyValue() {
  const envKey = process.env.GROQ_API_KEY;
  if (envKey) return envKey;
  const keys = store.get('apiKeys', []);
  const activeId = store.get('activeApiKeyId');
  const active = keys.find((key) => key.id === activeId) || keys[0] || null;
  return active ? decryptSecret(active.secret) : '';
}


function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('La réponse IA ne contient pas de JSON.');
    return JSON.parse(match[0]);
  }
}

async function groqChat(messages, options = {}) {
  const key = getActiveKeyValue();
  if (!key) throw new Error('Ajoute une clé API Groq dans Paramètres ou GROQ_API_KEY.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || store.get('groqModel'),
      messages,
      temperature: options.temperature ?? 0.25,
      max_tokens: options.maxTokens || 900
    })
  });

  if (!response.ok) throw new Error(`Groq ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

ipcMain.handle('app:runtime', () => ({
  webviewPreload: `file://${path.join(__dirname, 'webview', 'context-preload.js').replace(/\\/g, '/')}`
}));

ipcMain.handle('settings:get', () => ({
  groqModel: store.get('groqModel'),
  transcriptionModel: store.get('transcriptionModel'),
  apiKeys: store.get('apiKeys', []).map(safeKeyDescriptor),
  activeApiKeyId: store.get('activeApiKeyId'),
  envKeyAvailable: Boolean(process.env.GROQ_API_KEY),
  experienceMode: store.get('experienceMode'),
  quizGenEndpoint: store.get('quizGenEndpoint'),
  privacyMode: store.get('privacyMode')
}));

ipcMain.handle('settings:set-models', (_event, payload) => {
  store.set('groqModel', String(payload?.groqModel || '').trim() || 'llama-3.3-70b-versatile');
  store.set('transcriptionModel', String(payload?.transcriptionModel || '').trim() || 'whisper-large-v3-turbo');
  store.set('experienceMode', ['explorer', 'student'].includes(payload?.experienceMode) ? payload.experienceMode : 'explorer');
  store.set('quizGenEndpoint', String(payload?.quizGenEndpoint || '').trim() || 'https://quizzgen.alwaysdata.net');
  store.set('privacyMode', Boolean(payload?.privacyMode));
  return { ok: true };
});

ipcMain.handle('keys:add', (_event, payload) => {
  const value = String(payload?.value || '').trim();
  if (!value.startsWith('gsk_')) throw new Error('La clé Groq doit commencer par gsk_.');
  const apiKeys = store.get('apiKeys', []);
  const key = {
    id: `key_${Date.now()}`,
    label: String(payload?.label || `Groq ${apiKeys.length + 1}`).trim(),
    provider: 'groq',
    secret: encryptSecret(value),
    createdAt: new Date().toISOString()
  };
  store.set('apiKeys', [...apiKeys, key]);
  store.set('activeApiKeyId', key.id);
  return safeKeyDescriptor(key);
});

ipcMain.handle('keys:activate', (_event, id) => {
  if (!store.get('apiKeys', []).some((key) => key.id === id)) throw new Error('Clé introuvable.');
  store.set('activeApiKeyId', id);
  return { ok: true };
});

ipcMain.handle('keys:remove', (_event, id) => {
  const apiKeys = store.get('apiKeys', []).filter((key) => key.id !== id);
  store.set('apiKeys', apiKeys);
  if (store.get('activeApiKeyId') === id) store.set('activeApiKeyId', apiKeys[0]?.id || null);
  return { ok: true };
});

ipcMain.handle('pages:list', () => store.get('pages', []));

ipcMain.handle('vault:list', () => store.get('vaultItems', []).map(safeVaultDescriptor));

ipcMain.handle('vault:add', (_event, payload) => {
  const value = String(payload?.password || payload?.value || '').trim();
  if (!value) throw new Error('Ajoute un mot de passe, une clé ou un secret à enregistrer.');
  const vaultItems = store.get('vaultItems', []);
  const item = {
    id: `vault_${Date.now()}`,
    label: String(payload?.label || `Secret ${vaultItems.length + 1}`).trim(),
    secret: encryptSecret(JSON.stringify({
      username: String(payload?.username || '').trim(),
      password: value,
      url: String(payload?.url || '').trim(),
      note: String(payload?.note || '').trim()
    })),
    createdAt: new Date().toISOString()
  };
  store.set('vaultItems', [item, ...vaultItems].slice(0, 100));
  return safeVaultDescriptor(item);
});

ipcMain.handle('vault:remove', (_event, id) => {
  store.set('vaultItems', store.get('vaultItems', []).filter((item) => item.id !== id));
  return { ok: true };
});

ipcMain.handle('context:update', async (_event, context) => {
  const pages = store.get('pages', []);
  const enriched = await runWorker('enrich-fragment', { context, pages });
  const nextContext = { ...context, ...enriched, updatedAt: new Date().toISOString() };
  store.set('contextState', nextContext);

  if (enriched.shouldIndex) {
    const normalized = {
      id: enriched.id,
      title: context.title || 'Sans titre',
      url: context.url || '',
      text: context.visibleText || '',
      summary: enriched.summary,
      keywords: enriched.keywords,
      vector: enriched.vector,
      dwellMs: context.dwellMs || 0,
      updatedAt: nextContext.updatedAt
    };
    store.set('pages', [normalized, ...pages.filter((item) => item.url !== normalized.url)].slice(0, 700));
  }

  return nextContext;
});

ipcMain.handle('ai:chat', async (_event, payload) => {
  return groqChat(payload.messages, payload.options || {});
});

ipcMain.handle('ai:ghost-suggestion', async (_event, context) => {
  if (!context?.visibleText || context.visibleText.length < 180) return '';
  const localMatches = await runWorker('match', { query: context.visibleText, pages: store.get('pages', []) });
  return groqChat([
    { role: 'system', content: 'Tu es une IA de navigateur invisible. Réponds en français avec une seule suggestion courte, utile et non intrusive. Maximum 22 mots.' },
    { role: 'user', content: `Page: ${context.title}\nURL: ${context.url}\nTexte visible: ${context.visibleText.slice(0, 1800)}\nSouvenirs locaux similaires: ${JSON.stringify(localMatches.slice(0, 3))}` }
  ], { temperature: 0.2, maxTokens: 80 });
});

ipcMain.handle('voice:transcribe', async (_event, audioPayload) => {
  const key = getActiveKeyValue();
  if (!key) throw new Error('Ajoute une clé Groq avant la transcription vocale.');
  const bytes = Buffer.from(audioPayload.base64, 'base64');
  const form = new FormData();
  form.append('model', store.get('transcriptionModel'));
  form.append('file', new Blob([bytes], { type: audioPayload.mimeType || 'audio/webm' }), 'voice.webm');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  if (!response.ok) throw new Error(`Transcription Groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return data.text || '';
});

ipcMain.handle('quiz:generate', async (_event, payload) => {
  const course = String(payload?.course || '').trim();
  if (course.length < 80) throw new Error('Le cours est trop court pour générer un quiz utile.');
  const endpoint = store.get('quizGenEndpoint') || 'https://quizzgen.alwaysdata.net';
  const quizPayload = {
    course: course.slice(0, 12000),
    mode: payload?.mode || 'qcm',
    questions: Number(payload?.questions || 5),
    sourceUrl: payload?.sourceUrl || '',
    sourceTitle: payload?.sourceTitle || ''
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(quizPayload)
    });
    if (response.ok) {
      const text = await response.text();
      try {
        return { provider: 'quizzgen', url: endpoint, quiz: JSON.parse(text) };
      } catch {
        return { provider: 'quizzgen', url: endpoint, quiz: text };
      }
    }
  } catch {
    // The public site may not expose a JSON API; fall back to a local deterministic quiz.
  }

  const localQuiz = await runWorker('quiz', quizPayload);
  return { provider: 'local-fallback', url: endpoint, quiz: localQuiz, openUrl: endpoint };
});


ipcMain.handle('quiz:flash', async (_event, payload) => {
  const fragment = String(payload?.fragment || '').trim();
  if (fragment.length < 120) throw new Error('Fragment trop court pour un quiz contextuel.');

  try {
    const raw = await groqChat([
      {
        role: 'system',
        content: 'Tu génères des quiz de révision. Réponds uniquement en JSON valide, sans markdown. Schéma: {"question":"...","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"answer":"A","explanation":"..."}.'
      },
      {
        role: 'user',
        content: `À partir du fragment de cours suivant, génère une question difficile mais juste avec 4 options plausibles. Fragment:
${fragment.slice(0, 2200)}`
      }
    ], { temperature: 0.15, maxTokens: 420 });
    const quiz = parseJsonObject(raw);
    return {
      provider: 'groq',
      fragment,
      quiz: {
        question: String(quiz.question || 'Question de révision'),
        options: Array.isArray(quiz.options) ? quiz.options.slice(0, 4) : [],
        answer: String(quiz.answer || 'A').toUpperCase().slice(0, 1),
        explanation: String(quiz.explanation || '')
      }
    };
  } catch {
    const [fallback] = await runWorker('quiz', { course: fragment, questions: 1 });
    return {
      provider: 'local-fallback',
      fragment,
      quiz: {
        question: fallback.question,
        options: fallback.choices.map((text, index) => ({ id: String.fromCharCode(65 + index), text })),
        answer: String.fromCharCode(65 + fallback.choices.indexOf(fallback.answer)),
        explanation: fallback.explanation
      }
    };
  }
});

ipcMain.handle('page:capture', async () => {
  if (!mainWindow) return null;
  const image = await mainWindow.webContents.capturePage();
  return image.resize({ width: 960 }).toDataURL();
});

ipcMain.handle('external:open', (_event, url) => shell.openExternal(url));
