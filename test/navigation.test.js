'use strict';

const assert = require('assert');
const { normalizeUrl, parseIntent } = require('../src/shared/navigation');

assert.equal(normalizeUrl('exemple.com'), 'https://exemple.com');
assert.equal(normalizeUrl('meilleures fiches de révision'), 'https://www.google.com/search?q=meilleures%20fiches%20de%20r%C3%A9vision');
assert.equal(normalizeUrl('localhost:3000'), 'http://localhost:3000');
assert.deepEqual(parseIntent('résume cette page'), { type: 'summarize' });
assert.deepEqual(parseIntent('réponse B'), { type: 'quiz-answer', answer: 'B' });
assert.deepEqual(parseIntent('va sur wikipedia'), { type: 'navigate', target: 'wikipedia' });
console.log('Navigation tests passed.');
