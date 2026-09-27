const webviewStack = document.querySelector('#webviewStack');
const tabStrip = document.querySelector('#tabStrip');
const address = document.querySelector('#address');
const quickKey = document.querySelector('#quickKey');
const shell = document.querySelector('.zero-shell');
const currentUrl = document.querySelector('#currentUrl');
const securityState = document.querySelector('#securityState');
const microState = document.querySelector('#microState');
const contextStateLabel = document.querySelector('#contextStateLabel');
const quizWhisper = document.querySelector('#quizWhisper');
const settingsDialog = document.querySelector('#settingsDialog');
const keyList = document.querySelector('#keyList');
const quizButton = document.querySelector('#quizButton');
const authState = document.querySelector('#authState');
let experienceMode = 'explorer';
let studentMode = false;
let contextByTab = new Map();
let ghostTimerByTab = new Map();
let tabs = [];
let activeTabId = null;
let webviewPreload = '';

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function activeWebview() {
  return activeTab()?.webview || null;
}

function activeContext() {
  return contextByTab.get(activeTabId) || null;
}

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return 'https://www.wikipedia.org';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.') && !value.includes(' ')) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function setMode(mode, label) {
  shell.dataset.mode = mode;
  microState.textContent = label;
  activeWebview()?.send('ghost-aura', mode === 'listening' || mode === 'thinking');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderTabs() {
  tabStrip.innerHTML = tabs.map((tab) => `<button class="tab ${tab.id === activeTabId ? 'active' : ''}" data-tab="${tab.id}">${escapeHtml(tab.title || 'Nouvel onglet')}</button>`).join('');
  tabs.forEach((tab) => tab.webview.classList.toggle('active', tab.id === activeTabId));
  const tab = activeTab();
  if (tab) {
    address.value = tab.url || '';
    currentUrl.textContent = tab.url || 'about:blank';
    tab.webview.send('student-mode', studentMode);
  }
}

function createTab(url = 'https://www.wikipedia.org') {
  const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const webview = document.createElement('webview');
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('preload', webviewPreload);
  webview.src = normalizeUrl(url);
  webview.dataset.tabId = id;
  webviewStack.appendChild(webview);

  const tab = { id, title: 'Chargement…', url: webview.src, webview };
  tabs.push(tab);
  activeTabId = id;
  bindWebview(tab);
  renderTabs();
}

function bindWebview(tab) {
  tab.webview.addEventListener('page-title-updated', (event) => {
    tab.title = event.title || 'Sans titre';
    renderTabs();
  });
  tab.webview.addEventListener('did-navigate', (event) => {
    tab.url = event.url;
    if (tab.id === activeTabId) {
      currentUrl.textContent = event.url;
      address.value = event.url;
    }
  });
  tab.webview.addEventListener('did-navigate-in-page', (event) => {
    tab.url = event.url;
    if (tab.id === activeTabId) currentUrl.textContent = event.url;
  });
  tab.webview.addEventListener('ipc-message', (event) => handleWebviewMessage(tab, event));
}

async function handleWebviewMessage(tab, event) {
  if (event.channel === 'context-snapshot') await updateContext(tab.id, event.args[0]);
  if (event.channel === 'active-content-stable' && studentMode) generateGhostQuiz('attention', event.args[0].fragment, tab.id);
  if (event.channel === 'quiz-answer') {
    quizWhisper.textContent = event.args[0].correct ? 'Quiz: réponse correcte' : 'Quiz: réponse à revoir';
  }
}

async function loadSettings() {
  const settings = await window.semanticBrowser.settings.get();
  document.querySelector('#modelInput').value = settings.groqModel;
  document.querySelector('#transcriptionModelInput').value = settings.transcriptionModel;
  document.querySelector('#studentModeInput').checked = Boolean(settings.studentMode || settings.experienceMode === 'student');
  document.querySelector('#quizGenEndpointInput').value = settings.quizGenEndpoint || 'https://quizzgen.alwaysdata.net';
  document.querySelector('#nexAccountBaseUrlInput').value = settings.nexAccountBaseUrl || 'https://nexaccount.alwaysdata.net';
  studentMode = Boolean(settings.studentMode || settings.experienceMode === 'student');
  experienceMode = studentMode ? 'student' : 'explorer';
  shell.dataset.studentMode = String(studentMode);
  quizButton.hidden = !studentMode;
  quizWhisper.textContent = studentMode ? 'Mode étudiant actif' : '';
  securityState.textContent = settings.nexAccountAuthenticated ? 'Confidentialité: compte NexAccount connecté' : settings.envKeyAvailable ? 'Confidentialité: GROQ_API_KEY détectée' : 'Confidentialité: invité / clé locale';
  authState.textContent = settings.nexAccountAuthenticated ? 'Compte NexAccount connecté' : 'Mode invité';
  keyList.innerHTML = settings.apiKeys.map((key) => `
    <article class="key-card"><strong>${escapeHtml(key.label)}</strong><br><small>${key.masked} ${key.encrypted ? '· chiffrée' : '· locale'}</small><br>
    <button data-activate="${key.id}">${settings.activeApiKeyId === key.id ? 'Active' : 'Activer'}</button>
    <button data-remove="${key.id}">Supprimer</button></article>`).join('') || '<small>Aucune clé locale configurée.</small>';
  tabs.forEach((tab) => tab.webview.send('student-mode', studentMode));
}

async function configureRuntime() {
  const runtime = await window.semanticBrowser.runtime();
  webviewPreload = runtime.webviewPreload;
  createTab('https://www.wikipedia.org');
}

async function updateContext(tabId, snapshot) {
  try {
    const contextState = await window.semanticBrowser.context.update(snapshot);
    contextByTab.set(tabId, contextState);
    if (tabId === activeTabId) {
      contextStateLabel.textContent = contextState.activeFragment ? `Contexte: zone active ${Math.round((contextState.activeDwellMs || 0) / 1000)}s` : 'Contexte: page observée';
      if (contextState.matches?.[0]?.score > 0.2) quizWhisper.textContent = `Déjà vu: ${contextState.matches[0].title}`;
    }
    if (!ghostTimerByTab.get(tabId)) {
      ghostTimerByTab.set(tabId, setTimeout(async () => {
        ghostTimerByTab.delete(tabId);
        const suggestion = await window.semanticBrowser.context.ghostSuggestion(contextState);
        if (suggestion) tabs.find((tab) => tab.id === tabId)?.webview.send('ghost-suggestion', suggestion);
      }, 3200));
    }
  } catch (error) {
    contextStateLabel.textContent = `Contexte: ${error.message}`;
  }
}

function parseIntent(transcript) {
  const lower = transcript.toLowerCase();
  if (/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/.test(lower)) return { type: 'navigate', target: transcript.replace(/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/i, '') };
  if (lower.includes('nouvel onglet')) return { type: 'new-tab' };
  if (lower.includes('nouvelle fenêtre')) return { type: 'new-window' };
  if (lower.includes('scrolle') || lower.includes('descends')) return { type: 'scroll', direction: 'down' };
  if (lower.includes('remonte')) return { type: 'scroll', direction: 'up' };
  if (lower.includes('paramètre') || lower.includes('configuration')) return { type: 'settings' };
  const answerMatch = lower.match(/(?:réponse|reponse|choix)\s*([abcd])/i);
  if (answerMatch) return { type: 'quiz-answer', answer: answerMatch[1].toUpperCase() };
  if (lower.includes('quiz') || lower.includes('qcm') || lower.includes('teste-moi') || lower.includes('interroge-moi') || lower.includes('vérifie si')) return { type: 'quiz' };
  return { type: 'ask', prompt: transcript };
}

async function executeIntent(transcript) {
  const webview = activeWebview();
  if (!webview) return;
  const intent = parseIntent(transcript);
  if (intent.type === 'navigate') return webview.src = normalizeUrl(intent.target);
  if (intent.type === 'new-tab') return createTab();
  if (intent.type === 'new-window') return window.semanticBrowser.newWindow(webview.src);
  if (intent.type === 'scroll') return webview.executeJavaScript(`window.scrollBy({ top: ${intent.direction === 'down' ? 620 : -620}, behavior: 'smooth' })`);
  if (intent.type === 'settings') return settingsDialog.showModal();
  if (intent.type === 'quiz') return generateGhostQuiz('voice');
  if (intent.type === 'quiz-answer') return webview.send('ghost-quiz-answer', intent.answer);

  setMode('thinking', 'Micro: IA en réponse ciblée');
  try {
    const contextState = activeContext();
    const answer = await window.semanticBrowser.ai.chat([
      { role: 'system', content: 'Tu es un navigateur IA zero-ui. Réponds en français en utilisant uniquement le bloc actif quand il existe.' },
      { role: 'user', content: `Intention: ${transcript}\nBloc actif: ${(contextState?.activeFragment || contextState?.visibleText || '').slice(0, 2600)}\nURL: ${contextState?.url || webview.src}` }
    ], { temperature: 0.25, maxTokens: 700 });
    webview.send('ghost-suggestion', answer);
  } catch (error) {
    webview.send('ghost-suggestion', `Erreur IA: ${error.message}`);
  } finally {
    setMode('idle', 'Micro: veille');
  }
}

async function saveQuickKey() {
  const value = quickKey.value.trim();
  if (!value) return;
  try {
    await window.semanticBrowser.keys.add({ label: 'Coffre Groq local', value });
    quickKey.value = '';
    quickKey.placeholder = 'Clé enregistrée localement';
    await loadSettings();
  } catch (error) {
    quickKey.value = '';
    quickKey.placeholder = error.message;
  }
}

async function generateGhostQuiz(trigger = 'manual', fragment = activeContext()?.activeFragment || activeContext()?.visibleText || '', tabId = activeTabId) {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  setMode('thinking', trigger === 'attention' ? 'Micro: aura éducative' : 'Micro: quiz ciblé');
  try {
    const result = await window.semanticBrowser.quiz.flash({ fragment, sourceUrl: tab.url, sourceTitle: tab.title, trigger });
    tab.webview.send('ghost-quiz', result);
    quizWhisper.textContent = `${result.provider === 'groq' ? 'Quiz Groq' : 'Quiz local'} · zone active`;
  } catch (error) {
    tab.webview.send('ghost-suggestion', `Impossible de créer le quiz fantôme: ${error.message}`);
  } finally {
    setMode('idle', studentMode ? 'Micro: veille étudiant' : 'Micro: veille');
  }
}


async function syncNexAccountSettings() {
  return window.semanticBrowser.nexAccount.updateSettings({ studentMode, groqApiKey: quickKey.value.trim() || undefined });
}

async function loginNexAccount() {
  const email = document.querySelector('#authEmail').value.trim();
  const password = document.querySelector('#authPassword').value;
  const data = await window.semanticBrowser.nexAccount.login({ email, password });
  authState.textContent = data?.user?.email ? `Connecté: ${data.user.email}` : 'Compte connecté';
  await window.semanticBrowser.nexAccount.profile().catch(() => null);
  await loadSettings();
}

async function registerNexAccount() {
  const username = document.querySelector('#authUsername').value.trim();
  const email = document.querySelector('#authEmail').value.trim();
  const password = document.querySelector('#authPassword').value;
  const data = await window.semanticBrowser.nexAccount.register({ username, email, password });
  authState.textContent = data?.user?.email ? `Inscrit: ${data.user.email}` : 'Compte créé';
  await loadSettings();
}

quickKey.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveQuickKey(); });
quizButton.addEventListener('click', () => generateGhostQuiz('button'));
document.querySelector('#newTabButton').addEventListener('click', () => createTab());
document.querySelector('#loginButton').addEventListener('click', () => loginNexAccount().catch((error) => { authState.textContent = error.message; }));
document.querySelector('#registerButton').addEventListener('click', () => registerNexAccount().catch((error) => { authState.textContent = error.message; }));
document.querySelector('#logoutButton').addEventListener('click', async () => { await window.semanticBrowser.nexAccount.logout(); await loadSettings(); });
document.querySelector('#newWindowButton').addEventListener('click', () => window.semanticBrowser.newWindow(activeWebview()?.src || 'https://www.wikipedia.org'));
tabStrip.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  activeTabId = button.dataset.tab;
  renderTabs();
});
address.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const value = address.value.trim();
    if (value.startsWith('/')) executeIntent(value.slice(1));
    else activeWebview().src = normalizeUrl(value);
    address.value = '';
  }
  if ((event.metaKey || event.ctrlKey) && event.key === ',') settingsDialog.showModal();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'q') executeIntent('quiz');
});

document.querySelector('#saveSettings').addEventListener('click', async (event) => {
  event.preventDefault();
  studentMode = document.querySelector('#studentModeInput').checked;
  await window.semanticBrowser.settings.setModels({
    groqModel: document.querySelector('#modelInput').value,
    transcriptionModel: document.querySelector('#transcriptionModelInput').value,
    experienceMode: studentMode ? 'student' : 'explorer',
    studentMode,
    quizGenEndpoint: document.querySelector('#quizGenEndpointInput').value,
    nexAccountBaseUrl: document.querySelector('#nexAccountBaseUrlInput').value
  });
  const value = document.querySelector('#keyValue').value.trim();
  if (value) await window.semanticBrowser.keys.add({ label: document.querySelector('#keyLabel').value, value });
  if (studentMode) await syncNexAccountSettings().catch(() => null);
  document.querySelector('#keyValue').value = '';
  settingsDialog.close();
  loadSettings();
});

keyList.addEventListener('click', async (event) => {
  if (event.target.dataset.activate) await window.semanticBrowser.keys.activate(event.target.dataset.activate);
  if (event.target.dataset.remove) await window.semanticBrowser.keys.remove(event.target.dataset.remove);
  loadSettings();
});

window.semanticBrowser.onInitialUrl((url) => activeWebview() ? activeWebview().src = normalizeUrl(url) : createTab(url));
configureRuntime().then(loadSettings).then(async () => {
  try {
    const voice = new window.VoiceIntentEngine({
      onTranscript: executeIntent,
      onState: (state) => setMode(state, state === 'listening' ? 'Micro: écoute' : state === 'thinking' ? 'Micro: réflexion' : 'Micro: veille')
    });
    await voice.start();
  } catch (error) {
    setMode('idle', 'Micro: indisponible · Ctrl+Q');
    contextStateLabel.textContent = `Voix désactivée: ${error.message}`;
  }
});
