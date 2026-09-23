# Nexa Browser

**Nexa Browser** est un navigateur Electron simple, conçu pour rechercher, naviguer et réviser sans afficher l’IA en permanence. La barre du haut reste familière : saisissez une recherche ou une URL, puis appuyez sur Entrée.

## Ce qui est inclus

- Navigation Google/URL, précédent, suivant, rechargement, accueil, onglets fermables et nouvelle fenêtre.
- Raccourcis : `Ctrl+T`, `Ctrl+W`, `Ctrl+L`, `Ctrl+Tab`, `Ctrl+R`, `Ctrl+F`, `Ctrl+D` et `Ctrl+Q`.
- Favoris, historique local, téléchargements suivis, plein écran, bloqueur léger de traqueurs et garde-fous de permissions Electron.
- Mode Étudiant : rail Qgen discret, résumé du passage visible, QCM Ghost UI, réponse à la voix/clic et secours local par worker sémantique.
- Commandes naturelles : « résume cette page », « explique ce passage », « traduis cette page », « fais-moi un quiz », « va sur Wikipédia » et « scrolle vers le bas ».
- Onboarding en trois écrans et intégration NexAccount optionnelle.

## Architecture

```text
src/config/brand.js              Identité centralisée de Nexa Browser
src/shared/navigation.js          URL/recherche et intentions, testé sans Electron
src/main.js                       Processus principal, clés, proxy IA, stockage et IPC
src/renderer/                     Interface, barre de navigation, voix et Qgen
src/webview/                      Contexte de page, Shadow DOM et nettoyage étudiant
src/workers/semantic-indexer.js   Mémoire locale et quiz de secours
web/alwaysdata/ai.php             Proxy Groq PHP à déployer sur Alwaysdata
```

## IA sans clé dans l’application

Au premier lancement, Nexa tente d’appeler `https://nexaccount.alwaysdata.net/ai.php`. Déployez `web/alwaysdata/ai.php` sur Alwaysdata et définissez `GROQ_API_KEY` dans les **variables d’environnement Alwaysdata**. Le proxy contient une limite de 20 requêtes/minute par session et ne révèle jamais la clé au navigateur.

L’utilisateur peut aussi ajouter ou remplacer une clé personnelle dans **Menu → Paramètres Nexa**. Elle est chiffrée par Electron `safeStorage` lorsque le système le permet. Aucune clé réelle ne doit être ajoutée au dépôt, à l’installateur ou à GitHub Actions.

## Développement et vérification

```bash
npm install
npm run lint
npm test
npm start
```

## Installer Windows et Microsoft Store

```bash
npm run dist
```

L’installateur est créé sous `release/Nexa-Browser-Setup-<version>.exe`. Le workflow GitHub Actions **Nexa Browser Windows EXE** publie le même `.exe` en artefact.

Pour le Microsoft Store, l’éditeur doit ensuite signer le paquet et le soumettre depuis son compte Partner Center : cette publication ne peut pas être automatisée par le dépôt ni effectuée sans les identifiants, certificats et validation du propriétaire. Configurez l’identité éditeur et la signature de code avant toute distribution publique.

## Étapes de cette évolution

1. **Renommage** — identité Nexa centralisée dans `src/config/brand.js` et appliquée au build Windows.
2. **Barre du haut** — contrôles de navigateur standard et omnibox centrale, sans panneau IA permanent.
3. **Navigation** — onglets, favoris, historique, téléchargements, permissions et filtrage basique de traqueurs.
4. **IA et études** — Qgen, résumé, traduction, explication, voix et QCM de secours local.
5. **Clé et proxy** — proxy Alwaysdata optionnel en premier, clé locale chiffrée en second.
6. **Design** — thèmes clair/sombre, animations courtes, rail étudiant et onboarding.
