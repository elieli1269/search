const webview = document.querySelector('#webview');
const address = document.querySelector('#address');
const quickKey = document.querySelector('#quickKey');
const voiceButton = document.querySelector('#voiceButton');
const shell = document.querySelector('.zero-shell');
const stateLabel = document.querySelector('#stateLabel');
const lastCommand = document.querySelector('#lastCommand');
const voiceTimer = document.querySelector('#voiceTimer');
const privacyDashboard = document.querySelector('#privacyDashboard');
const commandHistory = document.querySelector('#commandHistory');
const memoryWhisper = document.querySelector('#memoryWhisper');
const quizWhisper = document.querySelector('#quizWhisper');
let experienceMode = 'explorer';
let privacyMode = false;
const historyEntries = [];
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

function renderPrivacyDashboard() {
  privacyDashboard.textContent = privacyMode
    ? 'Mode privé IA actif · index local, suggestions Groq et quiz automatiques désactivés'
    : 'Confidentialité · micro coupé par défaut · contexte local actif';
}

function pushHistory(entry) {
  historyEntries.unshift({ entry, at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
  historyEntries.splice(5);
  commandHistory.innerHTML = historyEntries.map((item) => `<div><strong>${escapeHtml(item.at)}</strong> ${escapeHtml(item.entry)}</div>`).join('');
}

function updateVoiceTimer({ elapsedMs = 0, maxDurationMs = 20000, recording = false } = {}) {
  if (!recording) {
    voiceTimer.textContent = '';
    return;
  }
  voiceTimer.textContent = `${Math.ceil(elapsedMs / 1000)}s / ${Math.ceil(maxDurationMs / 1000)}s`;
}

async function loadSettings() {
  const settings = await window.semanticBrowser.settings.get();
  document.querySelector('#modelInput').value = settings.groqModel;
  document.querySelector('#transcriptionModelInput').value = settings.transcriptionModel;
  document.querySelector('#experienceModeInput').value = settings.experienceMode || 'explorer';
  document.querySelector('#quizGenEndpointInput').value = settings.quizGenEndpoint || 'https://quizzgen.alwaysdata.net';
  document.querySelector('#privacyModeInput').checked = Boolean(settings.privacyMode);
  privacyMode = Boolean(settings.privacyMode);
  renderPrivacyDashboard();
  experienceMode = settings.experienceMode || 'explorer';
  quizWhisper.textContent = experienceMode === 'student' ? 'Mode étudiant actif · appuie sur le micro puis dis “génère un quiz”.' : '';
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
  if (privacyMode) {
    contextState = { ...snapshot, privacyMode: true, matches: [] };
    memoryWhisper.textContent = 'Mode privé: contexte non indexé et suggestions IA automatiques coupées.';
    return;
  }
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
  const answerMatch = lower.match(/(?:réponse|reponse|choix)\s*([abcd])/i);
  if (answerMatch) return { type: 'quiz-answer', answer: answerMatch[1].toUpperCase() };
  if (lower.includes('quiz') || lower.includes('qcm') || lower.includes('étudiant') || lower.includes('teste-moi') || lower.includes('test moi') || lower.includes('interroge-moi') || lower.includes('vérifie si')) return { type: 'quiz' };
  if (lower.includes('compare') || lower.includes('résume') || lower.includes('analyse') || lower.includes('trouve')) return { type: 'ask', prompt: transcript };
  return { type: 'ask', prompt: transcript };
}

async function executeIntent(transcript) {
  lastCommand.textContent = `Commande: ${transcript}`;
  pushHistory(transcript);
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
  if (intent.type === 'quiz') {
    await generateGhostQuiz('voice');
    return;
  }
  if (intent.type === 'quiz-answer') {
    webview.send('ghost-quiz-answer', intent.answer);
    return;
  }
  setMode('thinking', privacyMode ? 'IA répond sans mémoire ni index…' : 'IA fusionne page, mémoire et intention…');
  const screenshot = transcript.toLowerCase().includes('visuel') || transcript.toLowerCase().includes('écran') ? await window.semanticBrowser.context.capture() : null;
  try {
    const answer = await window.semanticBrowser.ai.chat([
      { role: 'system', content: 'Tu es un navigateur IA zero-ui. Réponds en français, directement, avec actions concrètes. Utilise le contexte visible et la mémoire locale.' },
      { role: 'user', content: `Intention: ${transcript}\nContexte temps réel: ${privacyMode ? 'Mode privé: contexte masqué' : JSON.stringify(contextState).slice(0, 6000)}\nCapture disponible: ${Boolean(screenshot)}` }
    ], { temperature: 0.25, maxTokens: 700 });
    webview.send('ghost-suggestion', answer);
  } catch (error) {
    webview.send('ghost-suggestion', `Erreur IA: ${error.message}`);
  } finally {
    setMode('idle', 'IA en veille contextuelle');
  }
}

quickKey.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
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
});

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
    transcriptionModel: document.querySelector('#transcriptionModelInput').value,
    experienceMode: document.querySelector('#experienceModeInput').value,
    quizGenEndpoint: document.querySelector('#quizGenEndpointInput').value,
    privacyMode: document.querySelector('#privacyModeInput').checked
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


async function generateGhostQuiz(trigger = 'manual', fragment = contextState?.activeFragment || contextState?.visibleText || '') {
  if (privacyMode) {
    webview.send('ghost-suggestion', 'Mode privé IA actif: quiz IA désactivé pour ne pas envoyer le fragment de page.');
    return;
  }
  setMode('thinking', trigger === 'attention' ? 'Aura éducative: quiz fantôme…' : 'Je prépare une question ciblée…');
  try {
    const result = await window.semanticBrowser.quiz.flash({
      fragment,
      sourceUrl: contextState?.url,
      sourceTitle: contextState?.title,
      trigger
    });
    webview.send('ghost-quiz', result);
    quizWhisper.textContent = `${result.provider === 'groq' ? 'Quiz Groq' : 'Quiz local'} · fragment actif`;
  } catch (error) {
    webview.send('ghost-suggestion', `Impossible de créer le quiz fantôme: ${error.message}`);
  } finally {
    setMode('idle', experienceMode === 'student' ? 'Mode étudiant · Aura prête' : 'IA en veille contextuelle');
  }
}

async function generateStudentQuiz() {
  if (privacyMode) {
    webview.send('ghost-suggestion', 'Mode privé IA actif: QuizGen désactivé pour ne pas envoyer le contexte visible.');
    return;
  }
  setMode('thinking', 'QuizGen prépare un QCM étudiant…');
  try {
    const text = contextState?.visibleText || '';
    const result = await window.semanticBrowser.quiz.generate({
      course: text,
      mode: 'qcm',
      questions: 5,
      sourceUrl: contextState?.url,
      sourceTitle: contextState?.title
    });
    const quiz = Array.isArray(result.quiz) ? result.quiz : result.quiz?.questions || result.quiz;
    const rendered = Array.isArray(quiz) ? quiz.map((item, index) => `${index + 1}. ${item.question}\nRéponse: ${item.answer}`).join('\n\n') : String(quiz).slice(0, 1200);
    quizWhisper.textContent = `${result.provider === 'quizzgen' ? 'QuizGen' : 'Quiz local'} · ${result.openUrl ? 'site disponible' : 'généré'} `;
    webview.send('ghost-suggestion', `Quiz étudiant prêt:\n${rendered}`);
    if (result.openUrl) window.semanticBrowser.external.open(result.openUrl);
  } catch (error) {
    webview.send('ghost-suggestion', `Impossible de générer le quiz: ${error.message}`);
  } finally {
    setMode('idle', experienceMode === 'student' ? 'Mode étudiant · prêt pour QuizGen' : 'IA en veille contextuelle');
  }
}

webview.addEventListener('ipc-message', (event) => {
  if (event.channel === 'context-snapshot') updateContext(event.args[0]);
  if (event.channel === 'active-content-stable' && experienceMode === 'student' && !privacyMode) generateGhostQuiz('attention', event.args[0].fragment);
  if (event.channel === 'quiz-answer') {
    quizWhisper.textContent = event.args[0].correct ? 'Réponse correcte · mémoire renforcée' : 'Réponse à revoir · explication affichée';
  }
});
webview.addEventListener('did-navigate', (event) => { lastCommand.textContent = event.url; });

configureRuntime().then(loadSettings).then(() => {
  const voice = new window.VoiceIntentEngine({
    onTranscript: executeIntent,
    onTick: updateVoiceTimer,
    onState: (state) => {
      const label = state === 'listening' ? 'Micro actif · relâche pour envoyer · Échap annule' : state === 'thinking' ? 'Je transcris…' : 'IA en veille · micro coupé';
      setMode(state, label);
      voiceButton.setAttribute('aria-pressed', state === 'listening' ? 'true' : 'false');
    }
  });

  const startVoice = async () => {
    try {
      await voice.startPushToTalk();
    } catch (error) {
      setMode('idle', 'Micro indisponible · utilise /commande');
      lastCommand.textContent = `Voix désactivée: ${error.message}`;
    }
  };

  voiceButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startVoice();
  });
  voiceButton.addEventListener('pointerup', () => voice.stopPushToTalk());
  voiceButton.addEventListener('pointerleave', () => voice.stopPushToTalk());
  voiceButton.addEventListener('click', async (event) => {
    if (event.detail !== 0) return;
    if (voice.recording) voice.stopPushToTalk();
    else await startVoice();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      voice.cancelPushToTalk();
      updateVoiceTimer();
      setMode('idle', 'Commande vocale annulée · micro coupé');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      startVoice();
    }
  });
  window.addEventListener('keyup', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      voice.stopPushToTalk();
    }
  });
  setMode('idle', 'IA en veille · maintiens le micro ou Ctrl+Espace pour parler');
});
