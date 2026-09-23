(function exposeNavigation(root) {
  function normalizeUrl(input) {
    const value = String(input || '').trim();
    if (!value) return 'https://www.google.com/';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/i.test(value)) return `http://${value}`;
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[:/]\S*)?$/i.test(value) && !/\s/.test(value)) return `https://${value}`;
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }

  function parseIntent(transcript) {
    const source = String(transcript || '').trim();
    const lower = source.toLowerCase();
    if (/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/.test(lower)) return { type: 'navigate', target: source.replace(/^(va|ouvre|navigue)\s+(sur|à|a)?\s*/i, '') };
    if (lower.includes('nouvel onglet')) return { type: 'new-tab' };
    if (lower.includes('nouvelle fenêtre') || lower.includes('nouvelle fenetre')) return { type: 'new-window' };
    if (lower.includes('scrolle') || lower.includes('descends')) return { type: 'scroll', direction: 'down' };
    if (lower.includes('remonte')) return { type: 'scroll', direction: 'up' };
    if (lower.includes('paramètre') || lower.includes('parametre') || lower.includes('configuration')) return { type: 'settings' };
    if (lower.includes('résume') || lower.includes('resume') || lower.includes('synthèse') || lower.includes('synthese')) return { type: 'summarize' };
    if (lower.includes('traduis') || lower.includes('traduire')) return { type: 'translate' };
    if (lower.includes('explique')) return { type: 'explain' };
    const answerMatch = lower.match(/(?:réponse|reponse|choix)\s*([abcd])/i);
    if (answerMatch) return { type: 'quiz-answer', answer: answerMatch[1].toUpperCase() };
    if (lower.includes('quiz') || lower.includes('qcm') || lower.includes('teste-moi') || lower.includes('interroge-moi') || lower.includes('vérifie si')) return { type: 'quiz' };
    return { type: 'ask', prompt: source };
  }

  const api = { normalizeUrl, parseIntent };
  if (typeof module !== 'undefined') module.exports = api;
  if (root) root.NexaNavigation = api;
}(typeof window === 'undefined' ? null : window));
