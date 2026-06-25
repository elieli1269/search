# Semantic AI Browser

Semantic AI Browser est un prototype de navigateur web IA construit avec Electron. Il combine navigation classique, index sémantique local et copilote Groq pour transformer les pages visitées en mémoire exploitable.

## Fonctionnalités

- Navigation web avec barre d'adresse et recherche.
- Panneau IA latéral pour résumer, analyser et explorer la page active.
- Index sémantique local des pages capturées: titre, résumé, mots-clés et recherche de similarité légère.
- Gestion de plusieurs clés API Groq depuis l'interface.
- Packaging Windows `.exe` avec `electron-builder`.

## Sécurité des clés API

Aucune clé API réelle n'est intégrée au code source. Pour utiliser Groq, ajoute une clé dans l'écran **Paramètres** ou configure `GROQ_API_KEY` localement dans ton environnement. Ne publie jamais une clé dans GitHub.

## Développement

```bash
npm install
npm start
```

## Créer le `.exe` Windows

```bash
npm install
npm run dist
```

Le fichier d'installation sera généré dans `release/Semantic-AI-Browser-Setup-0.1.0.exe` quand la commande est exécutée sur Windows ou dans une CI compatible Windows.

## Build GitHub Actions

Le workflow `.github/workflows/windows-release.yml` construit l'installateur Windows et publie l'artefact téléchargeable pour chaque push ou pull request.
