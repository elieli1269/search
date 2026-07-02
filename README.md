# Semantic AI Browser

Semantic AI Browser est un prototype de navigateur Electron **Zero‑UI**: l’interface disparaît progressivement au profit de la voix, de la conscience contextuelle et de suggestions fantômes injectées dans la page active.

## Vision produit

- **Zero‑UI**: plus de panneau latéral permanent ni de boutons d’analyse; l’omnibox est discrète et l’IA apparaît sous forme d’aura ou de bulle fantôme.
- **Push‑to‑talk avancé**: le micro reste coupé par défaut; l’utilisateur maintient l’orbe micro ou `Ctrl+Espace` pour parler, relâche pour envoyer, et peut annuler avec `Échap`.
- **Contexte temps réel**: un preload de webview observe le texte visible, les images visibles, le scroll, la souris et les mutations DOM.
- **Ghost UI**: les suggestions sont injectées dans la page via Shadow DOM pour éviter les conflits CSS.
- **Index prédictif local**: un worker Node.js enrichit les fragments lus, calcule des mots‑clés/vecteurs légers et croise le contexte actuel avec la mémoire locale.

## Architecture

```text
src/main.js                       Processus principal Electron, IPC, Groq, safeStorage, worker
src/preload.js                    API sécurisée exposée au renderer
src/renderer/app.js               Orchestration Zero‑UI, intentions, contexte, suggestions
src/renderer/voice-engine.js      Push-to-talk audio, timer, annulation, transcription
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

Sans microphone ou sans clé Groq, l’application reste utilisable avec l’omnibox: tape `/résume cette page`, `/va sur wikipedia`, `/scrolle vers le bas`. Le navigateur ne demande l’accès au micro qu’après une action explicite sur le bouton micro ou le raccourci `Ctrl+Espace`.

## Créer le `.exe` Windows

```bash
npm install
npm run dist
```

Le fichier d’installation est généré dans `release/Semantic-AI-Browser-Setup-0.1.0.exe` sur Windows ou dans le workflow GitHub Actions.

## Build GitHub Actions

Le workflow `.github/workflows/windows-release.yml` exécute `npm install`, `npm run lint`, `npm run dist` sur `windows-latest`, puis publie l’installateur `.exe` comme artefact.

## Mode étudiant et QuizGen

La version étudiant se sélectionne dans **Paramètres invisibles → Version → Étudiant · QuizGen**. Dans ce mode, l’utilisateur peut maintenir le micro ou `Ctrl+Espace` pour dire une commande, ou taper `/génère un quiz` pour transformer le contexte visible de la page en QCM. L’intégration tente d’abord d’utiliser `https://quizzgen.alwaysdata.net`; si aucun endpoint JSON public n’est disponible, le navigateur ouvre le site QuizGen et génère un QCM local de secours à partir du worker sémantique.

> Important: la clé Groq ne doit jamais être rendue visible dans le code public. Utilise `GROQ_API_KEY` ou l’écran local des paramètres. Le **Mode privé IA** désactive l’indexation locale, les suggestions Groq automatiques et les quiz automatiques pour éviter l’envoi du contexte visible.

## Aura Contextuelle Éducative

En mode **Étudiant · QuizGen**, le navigateur suit le bloc textuel central du viewport avec un suivi d’attention local. Si l’utilisateur reste plus de 45 secondes sur un fragment informatif, l’Aura peut déclencher un quiz fantôme sans bouton. L’utilisateur peut aussi maintenir le micro puis dire une commande, ou taper `/teste-moi`, `/interroge-moi` ou `/fais-moi un quiz sur cette page`.

Le quiz est généré à partir du fragment actuellement regardé, pas depuis toute la page, afin de réduire la latence et d’éviter d’envoyer trop de contexte. Si Groq est configuré, `quiz:flash` demande un JSON strict avec une question QCM et une explication. Sinon, le worker sémantique local crée un QCM de secours. La réponse peut se faire au clic dans le Shadow DOM ou en push-to-talk avec une phrase comme `réponse B`.

La barre Zero‑UI contient aussi un champ **Clé Groq locale**. Appuie sur Entrée après collage: la clé est enregistrée durablement dans le stockage local Electron, chiffrée avec `safeStorage` lorsque la plateforme le permet, mais elle n’est jamais écrite dans le code source.

## Contrôle vocal et confidentialité

- Maintiens le bouton micro ou `Ctrl+Espace` pour enregistrer; relâche pour envoyer.
- `Échap` annule l’enregistrement vocal courant sans transcription.
- Le compteur vocal affiche la durée restante avant l’arrêt automatique de sécurité.
- Le tableau de bord confidentialité rappelle si le micro est coupé et si le Mode privé IA est actif.
- L’historique local affiche les cinq dernières commandes pour garder le fil sans ouvrir de panneau lourd.
