const fs = require('fs');
const path = require('path');

const files = [
  'src/main.js',
  'src/preload.js',
  'src/renderer/app.js',
  'src/renderer/voice-engine.js',
  'src/webview/context-preload.js',
  'src/workers/semantic-indexer.js'
];
let failed = false;
for (const file of files) {
  const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  if (/gsk_[A-Za-z0-9_\-]{12,}/.test(content)) {
    console.error(`Secret-looking Groq key found in ${file}`);
    failed = true;
  }
  new Function(content);
}
if (failed) process.exit(1);
console.log('Static checks passed.');
