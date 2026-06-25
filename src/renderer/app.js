const webview = document.querySelector('#webview');
const address = document.querySelector('#address');
const chat = document.querySelector('#chat');
const semanticIndex = document.querySelector('#semanticIndex');
const keyList = document.querySelector('#keyList');
const settingsDialog = document.querySelector('#settingsDialog');
const pageSignal = document.querySelector('#pageSignal');
let currentPage = null;
let pages = [];

const stopWords = new Set('alors aussi avec dans des donc elle elles être fait font mais nous pour que qui sans ses sont sur une vous your from this that with have has into the and les de du un le la en to in of is a an'.split(' '));

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return 'https://www.wikipedia.org';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.') && !value.includes(' ')) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function keywordsFrom(text) {
  const counts = new Map();
  text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).forEach((word) => {
    if (word.length < 4 || stopWords.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word);
}

function semanticScore(query, page) {
  const terms = keywordsFrom(query).concat(query.toLowerCase().split(/\s+/));
  const haystack = `${page.title} ${page.summary} ${page.keywords?.join(' ')} ${page.text}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function renderIndex(filter = '') {
  const ranked = [...pages]
    .map((page) => ({ page, score: filter ? semanticScore(filter, page) : 1 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.page.updatedAt) - new Date(a.page.updatedAt))
    .slice(0, 18);
  semanticIndex.innerHTML = ranked.map(({ page }) => `
    <article class="index-card" data-url="${page.url}">
      <strong>${escapeHtml(page.title)}</strong>
      <small>${escapeHtml(page.keywords?.slice(0, 6).join(' · ') || 'aucun tag')}</small>
    </article>`).join('') || '<small>Aucune page indexée. Clique “Indexer cette page”.</small>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function addMessage(role, content) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = content;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

async function loadState() {
  pages = await window.semanticBrowser.pages.list();
  const settings = await window.semanticBrowser.settings.get();
  document.querySelector('#modelInput').value = settings.groqModel;
  keyList.innerHTML = settings.apiKeys.map((key) => `
    <article class="key-card"><strong>${escapeHtml(key.label)}</strong><br><small>${key.masked}</small><br>
    <button data-activate="${key.id}">${settings.activeApiKeyId === key.id ? 'Active' : 'Activer'}</button>
    <button data-remove="${key.id}">Supprimer</button></article>`).join('') || '<small>Aucune clé configurée.</small>';
  renderIndex(address.value);
}

async function capturePage() {
  const text = await webview.executeJavaScript(`({
    title: document.title,
    url: location.href,
    text: document.body ? document.body.innerText : ''
  })`);
  const keywords = keywordsFrom(text.text);
  const summary = text.text.split(/(?<=[.!?])\s+/).slice(0, 4).join(' ').slice(0, 900);
  currentPage = await window.semanticBrowser.pages.save({ ...text, keywords, summary });
  pages = await window.semanticBrowser.pages.list();
  pageSignal.textContent = 'indexé';
  renderIndex(address.value);
  addMessage('ai', `Page indexée avec ${keywords.length} signaux sémantiques: ${keywords.slice(0, 8).join(', ')}`);
}

async function askAi(prompt) {
  addMessage('user', prompt);
  const context = currentPage ? `Page active: ${currentPage.title}\nURL: ${currentPage.url}\nRésumé local: ${currentPage.summary}\nMots-clés: ${currentPage.keywords.join(', ')}` : 'Aucune page active indexée.';
  const related = pages.slice(0, 8).map((page) => `- ${page.title}: ${page.keywords?.join(', ')}`).join('\n');
  try {
    const answer = await window.semanticBrowser.ai.chat([
      { role: 'system', content: 'Tu es le copilote d’un navigateur IA. Réponds en français, sois concis, structuré, utile, et cite les URLs disponibles.' },
      { role: 'user', content: `${context}\n\nIndex local pertinent:\n${related}\n\nQuestion: ${prompt}` }
    ]);
    addMessage('ai', answer);
  } catch (error) {
    addMessage('ai', `Erreur IA: ${error.message}`);
  }
}

document.querySelector('#go').addEventListener('click', () => { webview.src = normalizeUrl(address.value); });
address.addEventListener('keydown', (event) => { if (event.key === 'Enter') webview.src = normalizeUrl(address.value); });
address.addEventListener('input', () => renderIndex(address.value));
document.querySelector('#back').addEventListener('click', () => webview.canGoBack() && webview.goBack());
document.querySelector('#forward').addEventListener('click', () => webview.canGoForward() && webview.goForward());
document.querySelector('#reload').addEventListener('click', () => webview.reload());
document.querySelector('#capture').addEventListener('click', capturePage);
document.querySelector('#newTab').addEventListener('click', () => { webview.src = 'https://www.wikipedia.org'; currentPage = null; pageSignal.textContent = 'non indexé'; });
document.querySelector('#openSettings').addEventListener('click', () => settingsDialog.showModal());

document.querySelector('#askForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = document.querySelector('#prompt');
  if (prompt.value.trim()) askAi(prompt.value.trim());
  prompt.value = '';
});

document.querySelectorAll('.quick-actions button').forEach((button) => button.addEventListener('click', () => askAi(button.dataset.prompt)));
semanticIndex.addEventListener('click', (event) => {
  const card = event.target.closest('[data-url]');
  if (card) webview.src = card.dataset.url;
});
keyList.addEventListener('click', async (event) => {
  if (event.target.dataset.activate) await window.semanticBrowser.keys.activate(event.target.dataset.activate);
  if (event.target.dataset.remove) await window.semanticBrowser.keys.remove(event.target.dataset.remove);
  loadState();
});

document.querySelector('#saveSettings').addEventListener('click', async (event) => {
  event.preventDefault();
  await window.semanticBrowser.settings.setModel(document.querySelector('#modelInput').value);
  const value = document.querySelector('#keyValue').value.trim();
  if (value) await window.semanticBrowser.keys.add({ label: document.querySelector('#keyLabel').value, value });
  document.querySelector('#keyValue').value = '';
  settingsDialog.close();
  loadState();
});

webview.addEventListener('did-navigate', (event) => { address.value = event.url; pageSignal.textContent = 'non indexé'; });
webview.addEventListener('did-navigate-in-page', (event) => { address.value = event.url; });
loadState();
