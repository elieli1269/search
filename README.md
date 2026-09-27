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
src/webview/context-preload.js    Observation DOM, attention, zones de cours et Shadow DOM Ghost UI
src/webview/cleaner.js            Nettoyage visuel en Mode Étudiant
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

## Mode étudiant et QuizGen

Le Mode Étudiant se sélectionne dans **Paramètres invisibles → Activer le Mode Étudiant**. Dans ce mode, l’utilisateur peut dire ou taper `/génère un quiz` pour transformer le contexte visible de la page en QCM. L’intégration tente d’abord d’utiliser `https://quizzgen.alwaysdata.net`; si aucun endpoint JSON public n’est disponible, le navigateur ouvre le site QuizGen et génère un QCM local de secours à partir du worker sémantique.

> Important: la clé Groq ne doit jamais être rendue visible dans le code public. Utilise `GROQ_API_KEY` ou l’écran local des paramètres.

## Aura Contextuelle Éducative

En mode **Étudiant · QuizGen**, le navigateur suit le bloc textuel central du viewport avec un suivi d’attention local. Si l’utilisateur reste plus de 45 secondes sur un fragment informatif, l’Aura peut déclencher un quiz fantôme sans bouton. L’utilisateur peut aussi dire ou taper `/teste-moi`, `/interroge-moi` ou `/fais-moi un quiz sur cette page`.

Le quiz est généré à partir du fragment actuellement regardé, pas depuis toute la page, afin de réduire la latence et d’éviter d’envoyer trop de contexte. Si Groq est configuré, `quiz:flash` demande un JSON strict avec une question QCM et une explication. Sinon, le worker sémantique local crée un QCM de secours. La réponse peut se faire au clic dans le Shadow DOM ou à la voix avec une phrase comme `réponse B`.

La barre supérieure Zero‑UI contient aussi un champ **Clé Groq locale**. Appuie sur Entrée après collage: la clé est enregistrée durablement dans le stockage local Electron, chiffrée avec `safeStorage` lorsque la plateforme le permet, mais elle n’est jamais écrite dans le code source.


## Navigation et ergonomie

La barre supérieure sépare les onglets, la recherche Google/URL, les indicateurs IA et le champ de clé locale. Les textes d’état ont été déplacés dans une barre inférieure fixe afin d’éviter les chevauchements entre URL, confidentialité, micro et contexte local. Les recherches non‑URL sont automatiquement envoyées vers Google.

Le navigateur prend en charge plusieurs onglets dans la même fenêtre et peut ouvrir une nouvelle fenêtre indépendante. Chaque onglet garde son propre contexte d’attention temps réel, tandis que l’index sémantique local reste partagé par l’application. Le bouton **Quiz** est masqué par défaut et n’apparaît que lorsque le Mode Étudiant est activé.

## Intégration NexAccount / Alwaysdata

Le navigateur sait se connecter au backend `https://nexaccount.alwaysdata.net` via les endpoints fournis: `auth.php?action=register`, `auth.php?action=login`, `auth.php?action=profile`, `auth.php?action=update_settings` et les routes `chat.php` pour conversations/messages. Le token est conservé dans le stockage local Electron, puis envoyé en `Authorization: Bearer <token>` via le processus principal.

En mode invité, le navigateur continue de fonctionner localement. En mode connecté, il peut synchroniser le Mode Étudiant et déléguer les conversations au backend MySQL. L’URL du backend est configurable avec `NEXACCOUNT_BASE_URL` ou depuis les paramètres.

Un template SPA PHP autonome est disponible dans `web/nexaccount-spa/index.php` pour déploiement Alwaysdata. Il implémente le layout 3 panneaux demandé: rail de navigation, sidebar de conversations et zone de chat centrale avec paramètres/authentification.
