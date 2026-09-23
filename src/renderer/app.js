const webviewStack = document.querySelector('#webviewStack');
const tabStrip = document.querySelector('#tabStrip');
const address = document.querySelector('#address');
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
const studyRail = document.querySelector('#studyRail');
const studyRailStatus = document.querySelector('#studyRailStatus');
let voiceEngine = null;
let experienceMode = 'explorer';
let studentMode = false;
let contextByTab = new Map();
let ghostTimerByTab = new Map();
let tabs = [];
let activeTabId = null;
let webviewPreload = '';
const { normalizeUrl, parseIntent } = window.NexaNavigation;

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function activeWebview() {
  return activeTab()?.webview || null;
}

function activeContext() {
  return contextByTab.get(activeTabId) || null;
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
  tabStrip.innerHTML = tabs.map((tab) => `<div class="tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}" data-tab="${tab.id}"><button class="tab-title" data-tab="${tab.id}" title="${escapeHtml(tab.title)}">${escapeHtml(tab.pinned ? '◆' : tab.title || 'Nouvel onglet')}</button><button class="tab-close" data-close-tab="${tab.id}" aria-label="Fermer l’onglet">×</button></div>`).join('');
  tabs.forEach((tab) => tab.webview.classList.toggle('active', tab.id === activeTabId));
  const tab = activeTab();
  if (tab) {
    address.value = tab.url || '';
    currentUrl.textContent = tab.url || 'about:blank';
    tab.webview.send('student-mode', studentMode);
  }
}

function createTab(url = 'https://www.google.com/') {
  const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const webview = document.createElement('webview');
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('preload', webviewPreload);
  webview.src = normalizeUrl(url);
  webview.dataset.tabId = id;
  webviewStack.appendChild(webview);

  const tab = { id, title: 'Chargement…', url: webview.src, webview, pinned: false };
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
    window.semanticBrowser.browser.recordHistory({ url: event.url, title: tab.title });
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
  document.querySelector('#aiProxyUrlInput').value = settings.aiProxyUrl || 'https://nexaccount.alwaysdata.net/ai.php';
  studentMode = Boolean(settings.studentMode || settings.experienceMode === 'student');
  experienceMode = studentMode ? 'student' : 'explorer';
  shell.dataset.studentMode = String(studentMode);
  studyRail.hidden = !studentMode;
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
  document.title = runtime.brand?.name || 'Nexa Browser';
  createTab(runtime.brand?.homeUrl || 'https://www.google.com/');
}

async function updateContext(tabId, snapshot) {
  try {
    const contextState = await window.semanticBrowser.context.update(snapshot);
    contextByTab.set(tabId, contextState);
    if (tabId === activeTabId) {
      contextStateLabel.textContent = contextState.activeFragment ? `Contexte: zone active ${Math.round((contextState.activeDwellMs || 0) / 1000)}s` : 'Contexte: page observée';
      if (studentMode) studyRailStatus.textContent = contextState.activeFragment ? 'Zone de cours prête : Qgen cible le texte sous vos yeux.' : 'Défilez sur un passage de cours pour le cibler.';
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

async function executeIntent(transcript) {
  const webview = activeWebview();
  if (!webview) return;
  const intent = parseIntent(transcript);
  if (intent.type === 'navigate') return webview.src = normalizeUrl(intent.target);
  if (intent.type === 'new-tab') return createTab();
  if (intent.type === 'new-window') return window.semanticBrowser.newWindow(webview.src);
  if (intent.type === 'scroll') return webview.executeJavaScript(`window.scrollBy({ top: ${intent.direction === 'down' ? 620 : -620}, behavior: 'smooth' })`);
  if (intent.type === 'settings') return settingsDialog.showModal();
  if (intent.type === 'summarize') return summarizeActivePage('voice');
  if (intent.type === 'translate') return explainActivePassage('Traduis ce passage en français naturel, sans ajouter d’information.');
  if (intent.type === 'explain') return explainActivePassage('Explique ce passage simplement, comme à un élève, avec un exemple court.');
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

async function summarizeActivePage(trigger = 'button') {
  const tab = activeTab();
  const context = activeContext();
  if (!tab || !context?.visibleText) {
    studyRailStatus.textContent = 'Attendez qu’un passage de la page soit analysé.';
    return;
  }
  setMode('thinking', 'Micro: synthèse de cours');
  studyRailStatus.textContent = 'Qgen prépare une synthèse courte…';
  try {
    const summary = await window.semanticBrowser.ai.chat([
      { role: 'system', content: 'Tu es Qgen, un assistant de révision. Résume le texte fourni en français, avec un titre et 3 à 5 puces courtes. N’invente aucune information.' },
      { role: 'user', content: `Page : ${tab.title}\nURL : ${tab.url}\nTexte à réviser : ${(context.activeFragment || context.visibleText).slice(0, 5500)}` }
    ], { temperature: 0.15, maxTokens: 500 });
    tab.webview.send('ghost-suggestion', summary);
    studyRailStatus.textContent = trigger === 'voice' ? 'Synthèse affichée à la voix.' : 'Synthèse affichée sur la page.';
  } catch (error) {
    studyRailStatus.textContent = `Synthèse indisponible : ${error.message}`;
  } finally {
    setMode('idle', studentMode ? 'Micro: veille étudiant' : 'Micro: veille');
  }
}

async function explainActivePassage(instruction) {
  const tab = activeTab();
  const context = activeContext();
  if (!tab || !context?.visibleText) return;
  setMode('thinking', 'Micro: aide sur le passage');
  try {
    const answer = await window.semanticBrowser.ai.chat([
      { role: 'system', content: instruction },
      { role: 'user', content: (context.activeFragment || context.visibleText).slice(0, 4000) }
    ], { temperature: 0.2, maxTokens: 600 });
    tab.webview.send('ghost-suggestion', answer);
  } catch (error) {
    tab.webview.send('ghost-suggestion', `Aide indisponible : ${error.message}`);
  } finally { setMode('idle', 'Micro: veille'); }
}


async function syncNexAccountSettings() {
  return window.semanticBrowser.nexAccount.updateSettings({ studentMode });
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

quizButton.addEventListener('click', () => generateGhostQuiz('button'));
document.querySelector('#summaryButton').addEventListener('click', () => summarizeActivePage());
document.querySelector('#openQgenButton').addEventListener('click', () => window.semanticBrowser.external.open(document.querySelector('#quizGenEndpointInput').value.trim() || 'https://quizzgen.alwaysdata.net'));
document.querySelector('#voiceButton').addEventListener('click', () => voiceEngine?.listenNow());
document.querySelector('#newTabButton').addEventListener('click', () => createTab());
document.querySelector('#backButton').addEventListener('click', () => activeWebview()?.goBack());
document.querySelector('#forwardButton').addEventListener('click', () => activeWebview()?.goForward());
document.querySelector('#reloadButton').addEventListener('click', () => activeWebview()?.reload());
document.querySelector('#homeButton').addEventListener('click', () => activeWebview().src = 'https://www.google.com/');
document.querySelector('#loginButton').addEventListener('click', () => loginNexAccount().catch((error) => { authState.textContent = error.message; }));
document.querySelector('#registerButton').addEventListener('click', () => registerNexAccount().catch((error) => { authState.textContent = error.message; }));
document.querySelector('#logoutButton').addEventListener('click', async () => { await window.semanticBrowser.nexAccount.logout(); await loadSettings(); });
tabStrip.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close-tab]');
  if (close) {
    const id = close.dataset.closeTab;
    const index = tabs.findIndex((tab) => tab.id === id);
    const [removed] = tabs.splice(index, 1);
    removed?.webview.remove();
    activeTabId = tabs[Math.max(0, index - 1)]?.id || null;
    if (!tabs.length) createTab(); else renderTabs();
    return;
  }
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  activeTabId = button.dataset.tab;
  renderTabs();
});
document.querySelector('#menuButton').addEventListener('click', () => {
  const menu = document.querySelector('#browserMenu');
  menu.hidden = !menu.hidden;
});
document.querySelector('#browserMenu').addEventListener('click', async (event) => {
  const action = event.target.dataset.menuAction;
  if (!action) return;
  const tab = activeTab();
  if (action === 'bookmark' && tab) await window.semanticBrowser.browser.toggleBookmark({ url: tab.url, title: tab.title });
  if (action === 'downloads') { const downloads = await window.semanticBrowser.browser.downloads(); quizWhisper.textContent = downloads.length ? `${downloads.length} téléchargement(s)` : 'Aucun téléchargement'; }
  if (action === 'private') window.semanticBrowser.newPrivateWindow('https://www.google.com/');
  if (action === 'fullscreen') document.documentElement.requestFullscreen?.();
  if (action === 'settings') settingsDialog.showModal();
  event.currentTarget.hidden = true;
});
document.querySelector('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = address.value.trim();
  if (value.startsWith('/')) executeIntent(value.slice(1));
  else activeWebview().src = normalizeUrl(value);
  address.value = '';
});
address.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === ',') settingsDialog.showModal();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'q') executeIntent('quiz');
});
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 't') { event.preventDefault(); createTab(); }
  if (key === 'w') { event.preventDefault(); document.querySelector(`.tab-close[data-close-tab="${activeTabId}"]`)?.click(); }
  if (key === 'l') { event.preventDefault(); address.focus(); address.select(); }
  if (key === 'tab') { event.preventDefault(); const index = tabs.findIndex((tab) => tab.id === activeTabId); activeTabId = tabs[(index + 1) % tabs.length]?.id; renderTabs(); }
  if (key === 'r') { event.preventDefault(); activeWebview()?.reload(); }
  if (key === 'f') { event.preventDefault(); activeWebview()?.findInPage(address.value || ''); address.focus(); }
  if (key === 'd') { event.preventDefault(); const tab = activeTab(); if (tab) window.semanticBrowser.browser.toggleBookmark({ url: tab.url, title: tab.title }); }
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
    nexAccountBaseUrl: document.querySelector('#nexAccountBaseUrlInput').value,
    aiProxyUrl: document.querySelector('#aiProxyUrlInput').value
  });
  const value = document.querySelector('#keyValue').value.trim();
  if (value) await window.semanticBrowser.keys.add({ label: document.querySelector('#keyLabel').value, value });
  if (studentMode) await syncNexAccountSettings().catch(() => null);
  document.querySelector('#keyValue').value = '';
  settingsDialog.close();
  loadSettings();
});
document.querySelector('#testKeyButton').addEventListener('click', async () => {
  authState.textContent = 'Test de l’assistant…';
  try { const result = await window.semanticBrowser.keys.test(); authState.textContent = result.ok ? 'Assistant prêt.' : 'Réponse inattendue.'; } catch (error) { authState.textContent = `Assistant indisponible : ${error.message}`; }
});

keyList.addEventListener('click', async (event) => {
  if (event.target.dataset.activate) await window.semanticBrowser.keys.activate(event.target.dataset.activate);
  if (event.target.dataset.remove) await window.semanticBrowser.keys.remove(event.target.dataset.remove);
  loadSettings();
});

window.semanticBrowser.onInitialUrl((url) => activeWebview() ? activeWebview().src = normalizeUrl(url) : createTab(url));
configureRuntime().then(loadSettings).then(async () => {
  const settings = await window.semanticBrowser.settings.get();
  if (!settings.onboardingCompleted) document.querySelector('#onboardingDialog').showModal();
  try {
    voiceEngine = new window.VoiceIntentEngine({
      onTranscript: executeIntent,
      onState: (state) => setMode(state, state === 'listening' ? 'Micro: écoute' : state === 'thinking' ? 'Micro: réflexion' : 'Micro: veille')
    });
    await voiceEngine.start();
  } catch (error) {
    setMode('idle', 'Micro: indisponible · Ctrl+Q');
    contextStateLabel.textContent = `Voix désactivée: ${error.message}`;
  }
});

let onboardingStep = 1;
function renderOnboarding() {
  document.querySelectorAll('.onboarding-step').forEach((step) => { step.hidden = Number(step.dataset.step) !== onboardingStep; });
  document.querySelector('#onboardingPrevious').hidden = onboardingStep === 1;
  document.querySelector('#onboardingNext').textContent = onboardingStep === 3 ? 'Commencer' : 'Continuer';
}
document.querySelector('#onboardingPrevious').addEventListener('click', () => { onboardingStep -= 1; renderOnboarding(); });
document.querySelector('#onboardingNext').addEventListener('click', async () => {
  if (onboardingStep < 3) { onboardingStep += 1; renderOnboarding(); return; }
  const enabled = document.querySelector('#onboardingStudentMode').checked;
  await window.semanticBrowser.onboarding.complete({ studentMode: enabled });
  if (enabled) await window.semanticBrowser.settings.setModels({ studentMode: true, experienceMode: 'student' });
  document.querySelector('#onboardingDialog').close();
  loadSettings();
});
