const { app, BrowserWindow, ipcMain, shell, safeStorage, session } = require('electron');
const path = require('path');
const { Worker } = require('worker_threads');
const Store = require('electron-store');
const { BRAND } = require('./config/brand');

const store = new Store({
  name: BRAND.packageName,
  defaults: {
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
    experienceMode: 'explorer',
    quizGenEndpoint: process.env.QUIZZGEN_ENDPOINT || 'https://quizzgen.alwaysdata.net',
    studentMode: false,
    nexAccountBaseUrl: process.env.NEXACCOUNT_BASE_URL || 'https://nexaccount.alwaysdata.net',
    aiProxyUrl: process.env.NEXA_AI_PROXY_URL || 'https://nexaccount.alwaysdata.net/ai.php',
    nexAccountToken: null,
    apiKeys: [],
    activeApiKeyId: null,
    bookmarks: [],
    history: [],
    downloads: [],
    onboardingCompleted: false,
    trackerBlockingEnabled: true,
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

function createWindow(initialUrl = null, options = {}) {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    title: options.private ? `${BRAND.name} · Navigation privée` : BRAND.name,
    backgroundColor: '#05070d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (initialUrl) {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('open-initial-url', initialUrl);
    });
  }
  mainWindow = window;
  return window;
}

app.whenReady().then(() => {
  app.setName(BRAND.name);
  configureSessionGuards();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function configureSessionGuards() {
  const trackerHosts = ['doubleclick.net', 'googlesyndication.com', 'google-analytics.com', 'facebook.net', 'scorecardresearch.com'];
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'notifications', 'geolocation'].includes(permission));
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const host = new URL(details.url).hostname;
    const blocked = store.get('trackerBlockingEnabled') && trackerHosts.some((tracker) => host === tracker || host.endsWith(`.${tracker}`));
    callback({ cancel: blocked });
  });
  session.defaultSession.on('will-download', (_event, item) => {
    const downloads = store.get('downloads', []);
    const entry = { id: `download_${Date.now()}`, filename: item.getFilename(), url: item.getURL(), receivedAt: new Date().toISOString(), state: 'in-progress' };
    store.set('downloads', [entry, ...downloads].slice(0, 100));
    item.once('done', (_downloadEvent, state) => {
      const updated = store.get('downloads', []).map((download) => download.id === entry.id ? { ...download, state, path: item.getSavePath() } : download);
      store.set('downloads', updated);
    });
  });
}

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

function apiUrl(path) {
  const base = String(store.get('nexAccountBaseUrl') || 'https://nexaccount.alwaysdata.net').replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

async function nexFetch(path, options = {}) {
  const token = store.get('nexAccountToken');
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(apiUrl(path), { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.error || data?.message || `NexAccount ${response.status}`);
  return data;
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
  if (!key) return proxyChat(messages, options);

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

async function proxyChat(messages, options = {}) {
  const endpoint = String(store.get('aiProxyUrl') || '').trim();
  if (!endpoint) throw new Error('L’assistant n’est pas disponible pour le moment. Vous pouvez continuer à naviguer normalement.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'chat', messages, model: options.model || store.get('groqModel'), temperature: options.temperature, maxTokens: options.maxTokens })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'L’assistant est momentanément indisponible.');
  return data?.content || data?.choices?.[0]?.message?.content || '';
}

ipcMain.handle('app:runtime', () => ({
  webviewPreload: `file://${path.join(__dirname, 'webview', 'context-preload.js').replace(/\\/g, '/')}`,
  brand: BRAND
}));

ipcMain.handle('settings:get', () => ({
  groqModel: store.get('groqModel'),
  transcriptionModel: store.get('transcriptionModel'),
  apiKeys: store.get('apiKeys', []).map(safeKeyDescriptor),
  activeApiKeyId: store.get('activeApiKeyId'),
  envKeyAvailable: Boolean(process.env.GROQ_API_KEY),
  experienceMode: store.get('experienceMode'),
  quizGenEndpoint: store.get('quizGenEndpoint'),
  studentMode: Boolean(store.get('studentMode')),
  nexAccountBaseUrl: store.get('nexAccountBaseUrl'),
  nexAccountAuthenticated: Boolean(store.get('nexAccountToken')),
  aiProxyUrl: store.get('aiProxyUrl'),
  onboardingCompleted: Boolean(store.get('onboardingCompleted')),
  trackerBlockingEnabled: Boolean(store.get('trackerBlockingEnabled'))
}));

ipcMain.handle('settings:set-models', (_event, payload) => {
  store.set('groqModel', String(payload?.groqModel || '').trim() || 'llama-3.3-70b-versatile');
  store.set('transcriptionModel', String(payload?.transcriptionModel || '').trim() || 'whisper-large-v3-turbo');
  const studentMode = Boolean(payload?.studentMode) || payload?.experienceMode === 'student';
  store.set('studentMode', studentMode);
  store.set('experienceMode', studentMode ? 'student' : 'explorer');
  store.set('quizGenEndpoint', String(payload?.quizGenEndpoint || '').trim() || 'https://quizzgen.alwaysdata.net');
  store.set('nexAccountBaseUrl', String(payload?.nexAccountBaseUrl || '').trim() || 'https://nexaccount.alwaysdata.net');
  if (payload?.aiProxyUrl) store.set('aiProxyUrl', String(payload.aiProxyUrl).trim());
  return { ok: true };
});

ipcMain.handle('onboarding:complete', (_event, payload) => {
  store.set('onboardingCompleted', true);
  if (typeof payload?.studentMode !== 'undefined') store.set('studentMode', Boolean(payload.studentMode));
  return { ok: true };
});

ipcMain.handle('browser:bookmarks', () => store.get('bookmarks', []));
ipcMain.handle('browser:toggle-bookmark', (_event, payload) => {
  const url = String(payload?.url || '').trim();
  if (!url) throw new Error('Adresse introuvable.');
  const bookmarks = store.get('bookmarks', []);
  const existing = bookmarks.find((bookmark) => bookmark.url === url);
  store.set('bookmarks', existing ? bookmarks.filter((bookmark) => bookmark.url !== url) : [{ url, title: String(payload?.title || url), createdAt: new Date().toISOString() }, ...bookmarks].slice(0, 100));
  return { bookmarked: !existing };
});
ipcMain.handle('browser:history', () => store.get('history', []));
ipcMain.handle('browser:record-history', (_event, payload) => {
  const url = String(payload?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false };
  const history = store.get('history', []);
  store.set('history', [{ url, title: String(payload?.title || url), visitedAt: new Date().toISOString() }, ...history.filter((entry) => entry.url !== url)].slice(0, 1000));
  return { ok: true };
});
ipcMain.handle('browser:downloads', () => store.get('downloads', []));
ipcMain.handle('browser:set-tracker-blocking', (_event, enabled) => { store.set('trackerBlockingEnabled', Boolean(enabled)); return { ok: true }; });


ipcMain.handle('nexaccount:register', async (_event, payload) => {
  const data = await nexFetch('auth.php?action=register', { method: 'POST', body: JSON.stringify(payload || {}) });
  if (data?.token) store.set('nexAccountToken', data.token);
  return data;
});

ipcMain.handle('nexaccount:login', async (_event, payload) => {
  const data = await nexFetch('auth.php?action=login', { method: 'POST', body: JSON.stringify(payload || {}) });
  if (data?.token) store.set('nexAccountToken', data.token);
  return data;
});

ipcMain.handle('nexaccount:logout', () => {
  store.set('nexAccountToken', null);
  return { ok: true };
});

ipcMain.handle('nexaccount:profile', async () => {
  const data = await nexFetch('auth.php?action=profile');
  const profile = data?.user || data?.profile || data;
  if (typeof profile?.student_mode_enabled !== 'undefined') {
    const enabled = Boolean(Number(profile.student_mode_enabled));
    store.set('studentMode', enabled);
    store.set('experienceMode', enabled ? 'student' : 'explorer');
  }
  return data;
});

ipcMain.handle('nexaccount:update-settings', async (_event, payload) => {
  const data = await nexFetch('auth.php?action=update_settings', { method: 'POST', body: JSON.stringify(payload || {}) });
  if (typeof payload?.studentMode !== 'undefined') {
    store.set('studentMode', Boolean(payload.studentMode));
    store.set('experienceMode', payload.studentMode ? 'student' : 'explorer');
  }
  return data;
});

ipcMain.handle('nexaccount:conversations', () => nexFetch('chat.php?action=conversations'));
ipcMain.handle('nexaccount:create-conversation', (_event, payload) => nexFetch('chat.php?action=create_conversation', { method: 'POST', body: JSON.stringify(payload || {}) }));
ipcMain.handle('nexaccount:messages', (_event, id) => nexFetch(`chat.php?action=messages&id=${encodeURIComponent(id)}`));
ipcMain.handle('nexaccount:delete-conversation', (_event, id) => nexFetch(`chat.php?action=delete_conversation&id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
ipcMain.handle('nexaccount:send-message', (_event, payload) => nexFetch('chat.php?action=send_message', { method: 'POST', body: JSON.stringify(payload || {}) }));

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
ipcMain.handle('keys:test', async () => {
  const answer = await groqChat([{ role: 'user', content: 'Réponds uniquement: OK' }], { maxTokens: 8, temperature: 0 });
  return { ok: /^ok/i.test(answer.trim()), answer };
});

ipcMain.handle('pages:list', () => store.get('pages', []));

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

ipcMain.handle('app:new-window', (_event, url) => {
  createWindow(url || null);
  return { ok: true };
});

ipcMain.handle('app:new-private-window', (_event, url) => {
  createWindow(url || BRAND.homeUrl, { private: true });
  return { ok: true };
});

ipcMain.handle('external:open', (_event, url) => shell.openExternal(url));
