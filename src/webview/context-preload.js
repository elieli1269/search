const { ipcRenderer } = require('electron');
const { applyCourseCleaner, markCourseZone } = require('./cleaner');

let lastScrollY = 0;
let lastMouse = { x: 0, y: 0 };
let dwellStart = Date.now();
let activeBlock = null;
let activeBlockSince = Date.now();
let proactiveQuizSentAt = 0;
let ghostRoot;
let currentQuiz = null;
let studentMode = false;

function ensureGhostRoot() {
  if (ghostRoot) return ghostRoot;
  const host = document.createElement('semantic-ai-ghost');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);
  ghostRoot = host.attachShadow({ mode: 'open' });
  ghostRoot.innerHTML = `<style>
    .aura{position:fixed;inset:0;border:1px solid rgba(116,246,199,.16);box-shadow:inset 0 0 46px rgba(116,246,199,.08);opacity:0;transition:opacity .24s ease}.aura.active{opacity:1}
    .bubble,.quiz{position:fixed;right:28px;bottom:28px;max-width:390px;padding:14px 16px;border:1px solid rgba(116,246,199,.28);border-radius:20px;background:rgba(7,10,18,.86);color:#eef3ff;font:500 13px/1.45 Inter,system-ui,sans-serif;backdrop-filter:blur(18px);box-shadow:0 18px 60px rgba(0,0,0,.34);opacity:0;transform:translateY(8px);transition:all .24s ease;pointer-events:auto}.bubble.show,.quiz.show{opacity:1;transform:translateY(0)}
    .quiz h3{margin:0 0 10px;font-size:14px;color:#74f6c7}.quiz button{width:100%;margin:5px 0;padding:9px 10px;border:1px solid rgba(138,167,255,.24);border-radius:12px;background:rgba(255,255,255,.06);color:#eef3ff;text-align:left;cursor:pointer}.quiz button.correct{border-color:#74f6c7;background:rgba(116,246,199,.18)}.quiz button.wrong{border-color:#ff7a9a;background:rgba(255,122,154,.16)}.quiz .explain{margin-top:10px;color:#c5cce0}.quiz .meta{font-size:11px;color:#93a0b8;margin-bottom:8px}
  </style><div class="aura"></div><div class="bubble"></div><div class="quiz"></div>`;
  return ghostRoot;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function elementText(element) {
  return String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function candidateBlocks() {
  return [...document.querySelectorAll('article, main, section, p, li, blockquote, [role="article"], div')]
    .filter((element) => {
      const text = elementText(element);
      if (text.length < 160 || text.length > 2600) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 40) return false;
      return rect.bottom > innerHeight * 0.22 && rect.top < innerHeight * 0.78;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const centerDistance = Math.abs((rect.top + rect.height / 2) - innerHeight / 2);
      return { element, rect, score: centerDistance + Math.max(0, elementText(element).length - 1200) / 8 };
    })
    .sort((a, b) => a.score - b.score);
}

function updateActiveBlock(reason) {
  const [candidate] = candidateBlocks();
  if (!candidate) return null;
  if (candidate.element !== activeBlock) {
    activeBlock = candidate.element;
    activeBlockSince = Date.now();
    if (studentMode) markCourseZone(activeBlock);
  }
  const fragment = elementText(activeBlock).slice(0, 2200);
  const dwellMs = Date.now() - activeBlockSince;
  if (studentMode && dwellMs > 45000 && Date.now() - proactiveQuizSentAt > 90000) {
    proactiveQuizSentAt = Date.now();
    ipcRenderer.sendToHost('active-content-stable', { reason, fragment, dwellMs, url: location.href, title: document.title });
  }
  return { fragment, dwellMs };
}

function visibleText() {
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const rect = parent.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const chunks = [];
  while (walker.nextNode() && chunks.join(' ').length < 5500) chunks.push(walker.currentNode.nodeValue.trim());
  return chunks.join(' ').replace(/\s+/g, ' ');
}

function imageSignals() {
  return [...document.images].filter((img) => {
    const rect = img.getBoundingClientRect();
    return rect.width > 80 && rect.height > 80 && rect.bottom > 0 && rect.top < innerHeight;
  }).slice(0, 8).map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || '', width: img.naturalWidth, height: img.naturalHeight }));
}

function emitContext(reason) {
  const active = updateActiveBlock(reason) || { fragment: '', dwellMs: 0 };
  ipcRenderer.sendToHost('context-snapshot', {
    reason,
    url: location.href,
    title: document.title,
    visibleText: visibleText(),
    activeFragment: active.fragment,
    activeDwellMs: active.dwellMs,
    images: imageSignals(),
    scroll: { x: scrollX, y: scrollY, maxY: document.documentElement.scrollHeight - innerHeight },
    mouse: lastMouse,
    dwellMs: Date.now() - dwellStart,
    capturedAt: new Date().toISOString()
  });
}

function showGhost(message) {
  const root = ensureGhostRoot();
  const bubble = root.querySelector('.bubble');
  bubble.textContent = message;
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 6500);
}

function showQuiz(payload) {
  currentQuiz = payload.quiz;
  const root = ensureGhostRoot();
  const quiz = root.querySelector('.quiz');
  const options = payload.quiz.options || [];
  quiz.innerHTML = `<div class="meta">Aura Contextuelle · ${escapeHtml(payload.provider)}</div><h3>${escapeHtml(payload.quiz.question)}</h3>${options.map((option) => `<button data-answer="${escapeHtml(option.id)}"><strong>${escapeHtml(option.id)}.</strong> ${escapeHtml(option.text)}</button>`).join('')}<div class="explain"></div>`;
  quiz.classList.add('show');
  quiz.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => answerQuiz(button.dataset.answer, payload.quiz.answer, payload.quiz.explanation));
  });
}

function answerQuiz(answer, expected, explanation) {
  const root = ensureGhostRoot();
  const quiz = root.querySelector('.quiz');
  quiz.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
    if (button.dataset.answer === expected) button.classList.add('correct');
    if (button.dataset.answer === answer && answer !== expected) button.classList.add('wrong');
  });
  quiz.querySelector('.explain').textContent = answer === expected ? `Correct. ${explanation}` : `Pas tout à fait. Réponse ${expected}. ${explanation}`;
  ipcRenderer.sendToHost('quiz-answer', { answer, expected, correct: answer === expected });
}

function setAura(state) {
  ensureGhostRoot().querySelector('.aura').classList.toggle('active', Boolean(state));
}

window.addEventListener('mousemove', (event) => { lastMouse = { x: event.clientX, y: event.clientY }; }, { passive: true });
window.addEventListener('scroll', () => {
  if (Math.abs(scrollY - lastScrollY) > 160) {
    lastScrollY = scrollY;
    dwellStart = Date.now();
    emitContext('scroll');
  }
}, { passive: true });

new IntersectionObserver(() => updateActiveBlock('intersection'), { root: null, threshold: [0.35, 0.55, 0.75] })
  .observe(document.documentElement);
new MutationObserver(() => emitContext('mutation')).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
setInterval(() => emitContext('heartbeat'), 4200);
window.addEventListener('DOMContentLoaded', () => { ensureGhostRoot(); emitContext('ready'); });

ipcRenderer.on('ghost-suggestion', (_event, message) => showGhost(message));
ipcRenderer.on('ghost-aura', (_event, state) => setAura(state));
ipcRenderer.on('student-mode', (_event, enabled) => {
  studentMode = Boolean(enabled);
  applyCourseCleaner(studentMode);
  if (!studentMode) markCourseZone(null);
});
ipcRenderer.on('ghost-quiz', (_event, payload) => showQuiz(payload));
ipcRenderer.on('ghost-quiz-answer', (_event, answer) => {
  if (currentQuiz) answerQuiz(answer, currentQuiz.answer, currentQuiz.explanation);
});
