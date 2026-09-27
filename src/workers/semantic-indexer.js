const { parentPort } = require('worker_threads');

const stopWords = new Set('alors aussi avec dans des donc elle elles être fait font mais nous pour que qui sans ses sont sur une vous votre leurs leur this that with have into from about pour dans avec sans plus moins very were been and are the les une des de du un le la en to in of is a an'.split(' '));

function keywordsFrom(text, limit = 16) {
  const counts = new Map();
  String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).forEach((word) => {
    if (word.length < 4 || stopWords.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function vectorize(text) {
  const vector = new Map();
  keywordsFrom(text, 64).forEach((term, index) => vector.set(term, 1 / (index + 1)));
  return Object.fromEntries(vector);
}

function cosine(a, b) {
  const left = typeof a === 'string' ? vectorize(a) : (a || {});
  const right = typeof b === 'string' ? vectorize(b) : (b || {});
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let dot = 0; let magA = 0; let magB = 0;
  keys.forEach((key) => {
    const x = left[key] || 0;
    const y = right[key] || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  });
  return magA && magB ? dot / Math.sqrt(magA * magB) : 0;
}

function summarize(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 3).join(' ').slice(0, 700);
}

function enrichFragment({ context, pages }) {
  const text = context?.visibleText || '';
  const vector = vectorize(text);
  const matches = match({ query: text, pages });
  return {
    id: `fragment_${Date.now()}`,
    shouldIndex: text.length > 500 && (context?.dwellMs || 0) > 3500,
    keywords: keywordsFrom(text),
    summary: summarize(text),
    vector,
    matches,
    signals: [
      text.length > 500 ? 'lecture-significative' : 'fragment-court',
      matches[0]?.score > 0.22 ? 'souvenir-similaire' : 'nouveau-contexte'
    ]
  };
}


function generateQuiz({ course, questions }) {
  const sentences = String(course || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 60);
  const keywords = keywordsFrom(course, 24);
  const count = Math.max(3, Math.min(Number(questions || 5), 12));
  return Array.from({ length: count }, (_, index) => {
    const basis = sentences[index % Math.max(sentences.length, 1)] || String(course).slice(0, 220);
    const answer = keywords[index % Math.max(keywords.length, 1)] || 'concept clé';
    const distractors = keywords.filter((word) => word !== answer).slice(index, index + 3);
    while (distractors.length < 3) distractors.push(['définition', 'exemple', 'contexte'][distractors.length]);
    return {
      question: `Quel concept résume le mieux cet extrait: « ${basis.slice(0, 150)}… » ?`,
      choices: [answer, ...distractors].sort(),
      answer,
      explanation: `La réponse est liée aux signaux dominants détectés dans le cours: ${keywords.slice(0, 6).join(', ')}.`
    };
  });
}

function match({ query, pages }) {
  const queryVector = vectorize(query);
  return (pages || [])
    .map((page) => ({ title: page.title, url: page.url, summary: page.summary, score: cosine(queryVector, page.vector || page.text || '') }))
    .filter((item) => item.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

parentPort.on('message', (message) => {
  try {
    const payload = message.type === 'enrich-fragment' ? enrichFragment(message.payload) : message.type === 'quiz' ? generateQuiz(message.payload) : match(message.payload);
    parentPort.postMessage({ jobId: message.jobId, payload });
  } catch (error) {
    parentPort.postMessage({ jobId: message.jobId, error: error.message });
  }
});
