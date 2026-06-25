# Semantic AI Browser

Semantic AI Browser est un prototype de navigateur Electron **Zero‑UI**: l’interface disparaît progressivement au profit de la voix, de la conscience contextuelle et de suggestions fantômes injectées dans la page active.

## Vision produit

- **Zero‑UI**: plus de panneau latéral permanent ni de boutons d’analyse; l’omnibox est discrète et l’IA apparaît sous forme d’aura ou de bulle fantôme.
- **Voice‑first**: capture micro avec Web Audio, détection d’activité vocale et transcription Groq Whisper pour transformer la parole en intentions.
- **Contexte temps réel**: un preload de webview observe le texte visible, les images visibles, le scroll, la souris et les mutations DOM.
- **Ghost UI**: les suggestions sont injectées dans la page via Shadow DOM pour éviter les conflits CSS.
- **Index prédictif local**: un worker Node.js enrichit les fragments lus, calcule des mots‑clés/vecteurs légers et croise le contexte actuel avec la mémoire locale.

## Architecture

```text
src/main.js                       Processus principal Electron, IPC, Groq, safeStorage, worker
src/preload.js                    API sécurisée exposée au renderer
src/renderer/app.js               Orchestration Zero‑UI, intentions, contexte, suggestions
src/renderer/voice-engine.js      Capture audio, VAD simple, transcription
src/webview/context-preload.js    Observation DOM temps réel et Shadow DOM Ghost UI
src/workers/semantic-indexer.js   Indexation prédictive hors thread UI
```

## Sécurité des clés API

Aucune clé API réelle n’est intégrée au code source. Les clés ajoutées dans l’application sont chiffrées avec `safeStorage` quand Electron le permet; sinon elles restent limitées au stockage local de l’application. La méthode recommandée en production reste la variable d’environnement:

```bash
GROQ_API_KEY=gsk_your_key_here npm start
```

## Développement

```bash
npm install
npm start
```

Sans microphone ou sans clé Groq, l’application reste utilisable avec l’omnibox: tape `/résume cette page`, `/va sur wikipedia`, `/scrolle vers le bas`.

## Créer le `.exe` Windows

```bash
npm install
npm run dist
```

Le fichier d’installation est généré dans `release/Semantic-AI-Browser-Setup-0.1.0.exe` sur Windows ou dans le workflow GitHub Actions.

## Build GitHub Actions

Le workflow `.github/workflows/windows-release.yml` exécute `npm install`, `npm run lint`, `npm run dist` sur `windows-latest`, puis publie l’installateur `.exe` comme artefact.
