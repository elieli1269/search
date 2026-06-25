const webview = document.querySelector('#webview');
const address = document.querySelector('#address');
const shell = document.querySelector('.zero-shell');
const stateLabel = document.querySelector('#stateLabel');
const lastCommand = document.querySelector('#lastCommand');
const memoryWhisper = document.querySelector('#memoryWhisper');
const settingsDialog = document.querySelector('#settingsDialog');
const keyList = document.querySelector('#keyList');
let contextState = null;
let ghostTimer = null;

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return 'https://www.wikipedia.org';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.') && !value.includes(' ')) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function setMode(mode, label) {
  shell.dataset.mode = mode;
  stateLabel.textContent = label;
  webview.send('ghost-aura', mode === 'listening' || mode === 'thinking');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadSettings() {
  const settings = await window.semanticBrowser.settings.get();
  document.querySelector('#modelInput').value = settings.groqModel;
  document.querySelector('#transcriptionModelInput').value = settings.transcriptionModel;
  keyList.innerHTML = settings.envKeyAvailable ? '<small>GROQ_API_KEY détectée dans l’environnement.</small>' : '';
  keyList.innerHTML += settings.apiKeys.map((key) => `
    <article class="key-card"><strong>${escapeHtml(key.label)}</strong><br><small>${key.masked} ${key.encrypted ? '· chiffrée' : '· locale'}</small><br>
    <button data-activate="${key.id}">${settings.activeApiKeyId === key.id ? 'Active' : 'Activer'}</button>
    <button data-remove="${key.id}">Supprimer</button></article>`).join('') || '<small>Aucune clé locale configurée.</small>';
}

async function configureRuntime() {
  const runtime = await window.semanticBrowser.runtime();
  webview.setAttribute('preload', runtime.webviewPreload);
  webview.src = 'https://www.wikipedia.org';
}

async function updateContext(snapshot) {
  try {
    contextState = await window.semanticBrowser.context.update(snapshot);
    if (contextState.matches?.[0]?.score > 0.2) {
      memoryWhisper.textContent = `Déjà vu: ${contextState.matches[0].title}`;
    }
    if (!ghostTimer) {
      ghostTimer = setTimeout(async () => {
        ghostTimer = null;
        const suggestion = await window.semanticBrowser.context.ghostSuggestion(contextState);
        if (suggestion) webview.send('ghost-suggestion', suggestion);
      }, 3200);
    }
  } catch (error) {
    memoryWhisper.textContent = error.message;
  }
}

function parseIntent(transcript) {
  const lower = transcript.toLowerCase();
  if (/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/.test(lower)) {
    return { type: 'navigate', target: transcript.replace(/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/i, '') };
  }
  if (lower.includes('scrolle') || lower.includes('descends')) return { type: 'scroll', direction: 'down' };
  if (lower.includes('remonte')) return { type: 'scroll', direction: 'up' };
  if (lower.includes('paramètre') || lower.includes('configuration')) return { type: 'settings' };
  if (lower.includes('compare') || lower.includes('résume') || lower.includes('analyse') || lower.includes('trouve')) return { type: 'ask', prompt: transcript };
  return { type: 'ask', prompt: transcript };
}

async function executeIntent(transcript) {
  lastCommand.textContent = `Commande: ${transcript}`;
  const intent = parseIntent(transcript);
  if (intent.type === 'navigate') {
    webview.src = normalizeUrl(intent.target);
    return;
  }
  if (intent.type === 'scroll') {
    webview.executeJavaScript(`window.scrollBy({ top: ${intent.direction === 'down' ? 620 : -620}, behavior: 'smooth' })`);
    return;
  }
  if (intent.type === 'settings') {
    settingsDialog.showModal();
    return;
  }
  setMode('thinking', 'IA fusionne page, mémoire et intention…');
  const screenshot = transcript.toLowerCase().includes('visuel') || transcript.toLowerCase().includes('écran') ? await window.semanticBrowser.context.capture() : null;
  try {
    const answer = await window.semanticBrowser.ai.chat([
      { role: 'system', content: 'Tu es un navigateur IA zero-ui. Réponds en français, directement, avec actions concrètes. Utilise le contexte visible et la mémoire locale.' },
      { role: 'user', content: `Intention: ${transcript}\nContexte temps réel: ${JSON.stringify(contextState).slice(0, 6000)}\nCapture disponible: ${Boolean(screenshot)}` }
    ], { temperature: 0.25, maxTokens: 700 });
    webview.send('ghost-suggestion', answer);
  } catch (error) {
    webview.send('ghost-suggestion', `Erreur IA: ${error.message}`);
  } finally {
    setMode('idle', 'IA en veille contextuelle');
  }
}

address.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const value = address.value.trim();
    if (value.startsWith('/')) executeIntent(value.slice(1));
    else webview.src = normalizeUrl(value);
    address.value = '';
  }
  if ((event.metaKey || event.ctrlKey) && event.key === ',') settingsDialog.showModal();
});

document.querySelector('#saveSettings').addEventListener('click', async (event) => {
  event.preventDefault();
  await window.semanticBrowser.settings.setModels({
    groqModel: document.querySelector('#modelInput').value,
    transcriptionModel: document.querySelector('#transcriptionModelInput').value
  });
  const value = document.querySelector('#keyValue').value.trim();
  if (value) await window.semanticBrowser.keys.add({ label: document.querySelector('#keyLabel').value, value });
  document.querySelector('#keyValue').value = '';
  settingsDialog.close();
  loadSettings();
});

keyList.addEventListener('click', async (event) => {
  if (event.target.dataset.activate) await window.semanticBrowser.keys.activate(event.target.dataset.activate);
  if (event.target.dataset.remove) await window.semanticBrowser.keys.remove(event.target.dataset.remove);
  loadSettings();
});

webview.addEventListener('ipc-message', (event) => {
  if (event.channel === 'context-snapshot') updateContext(event.args[0]);
});
webview.addEventListener('did-navigate', (event) => { lastCommand.textContent = event.url; });

configureRuntime().then(loadSettings).then(async () => {
  try {
    const voice = new window.VoiceIntentEngine({
      onTranscript: executeIntent,
      onState: (state) => setMode(state, state === 'listening' ? 'J’écoute…' : state === 'thinking' ? 'Je réfléchis…' : 'IA en veille contextuelle')
    });
    await voice.start();
  } catch (error) {
    setMode('idle', 'Micro indisponible · utilise /commande');
    lastCommand.textContent = `Voix désactivée: ${error.message}`;
  }
});
