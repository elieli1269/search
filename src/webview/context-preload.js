const { ipcRenderer } = require('electron');

let lastScrollY = 0;
let lastMouse = { x: 0, y: 0 };
let dwellStart = Date.now();
let ghostRoot;

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
    .bubble{position:fixed;right:28px;bottom:28px;max-width:360px;padding:14px 16px;border:1px solid rgba(116,246,199,.28);border-radius:20px;background:rgba(7,10,18,.82);color:#eef3ff;font:500 13px/1.45 Inter,system-ui,sans-serif;backdrop-filter:blur(18px);box-shadow:0 18px 60px rgba(0,0,0,.34);opacity:0;transform:translateY(8px);transition:all .24s ease}
    .bubble.show{opacity:1;transform:translateY(0)}
  </style><div class="aura"></div><div class="bubble"></div>`;
  return ghostRoot;
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
  ipcRenderer.sendToHost('context-snapshot', {
    reason,
    url: location.href,
    title: document.title,
    visibleText: visibleText(),
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

new MutationObserver(() => emitContext('mutation')).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
setInterval(() => emitContext('heartbeat'), 4200);
window.addEventListener('DOMContentLoaded', () => { ensureGhostRoot(); emitContext('ready'); });

ipcRenderer.on('ghost-suggestion', (_event, message) => showGhost(message));
ipcRenderer.on('ghost-aura', (_event, state) => setAura(state));
