# Amicale Albaraka — guide pour Claude

Application de gestion interne du bureau de l'Amicale Albaraka (Président, Secrétaire général, Trésorier) : projets immobiliers, adhérents et paiements, chèques, factures, travaux, documents, export/import Excel, assistant IA, connecteur MCP pour Claude.

## Avec l'utilisateur

- Il écrit en **darija** (lettres latines) ou en français. Réponds dans la même langue, simplement, avec des étapes numérotées et des noms de boutons exacts. Il travaille surtout **sur téléphone**.
- Chaque nouvelle version : il doit **désinstaller l'ancienne app** avant d'installer le nouvel APK (GitHub > Actions > « Construire l'APK » > artefact `amicale-albaraka-apk`).
- Le dépôt est **public** : ne jamais committer de secret, ni ses vrais fichiers Excel (noms, téléphones, montants des adhérents).

## Où est le code

| Chemin | Rôle |
|---|---|
| `dev/src.html` | **Source principale** : une seule page (HTML + CSS + JS dans une IIFE). C'est ici qu'on modifie l'app. |
| `dev/build.py` | Transforme `src.html` en version Android (`app/src/main/assets/index.html`, Firebase, connexion) et en version web (`dev/out/web.html`). Les remplacements sont stricts (`rep` échoue si le texte cherché change) : si tu modifies un passage que `build.py` remplace, adapte `build.py`. |
| `dev/tests/smoke.js` | Test de bout en bout (jsdom, Firebase et Gemini simulés, import d'un Excel d'exemple inventé). |
| `dev/fb-entry.js` | Entrée du bundle Firebase. Après ajout d'un export : `npm run firebase-bundle`. |
| `app/` | Coquille Android (WebView, `MainActivity.kt`, `app/build.gradle.kts` pour la version). Ne pas modifier `app/src/main/assets/index.html` à la main : il est régénéré. |
| `mcp/worker.js` | Connecteur MCP (lecture seule) sur Cloudflare Workers. Déployé par `.github/workflows/deploy-mcp.yml` à chaque push dans `mcp/`. |
| `firestore.rules` | Règles Firestore (accès aux comptes connectés). L'inscription publique est désactivée dans Firebase : les comptes sont créés à la main. |

## Faire une modification

1. Modifier `dev/src.html` (et `dev/build.py` si besoin).
2. `python3 dev/build.py`
3. `cd dev && npm ci && npm test` → doit finir par `OK : test réussi`. Ajoute des vérifications dans `smoke.js` pour les nouvelles fonctions.
4. Augmenter la version : `versionCode` / `versionName` dans `app/build.gradle.kts` et `APP_VERSION` dans `dev/src.html`.
5. Commit + push sur `main` : GitHub Actions reconstruit, teste et produit l'APK. Vérifier avec `gh run list`.
6. Expliquer à l'utilisateur ce qui a changé, en darija, et comment installer.

## Modèle de données (Firestore, collections préfixées `am_`)

- `projets` : `nom`, `sections` (« Appartements, Résidence 1, … »), `ordre`, `modele` (fichier Excel d'origine importé).
- `adherents` : `projet`, `section`, `lot`, `etage`, `immeuble`, `nom` (vide = lot DISPONIBLE), `tel`, `surface`, `prixM2`, `prix`, `avance`, `dejaPaye`, `tranches`, `refCheque`, `banque`, `note`, `src` (lien vers la ligne du fichier Excel d'origine : ne jamais le perdre).
- `paiements` : `adherentId`, `projet`, `date`, `montant`, `tranche`, `mode`, `reference`, `banque`, `note`.
- `cheques`, `factures` (`valP`/`valT` = validations), `phases`, `journal`, `documents`, `fichiers` (pièces jointes en Bytes ≤ 950 Ko), `meta` (`config` : jeton App Check ; `mcp` : adresse du connecteur).
- Montant payé = `dejaPaye` + somme des paiements. Projets « Casino » = bungalows (pas d'étage ni d'immeuble) ; étage/immeuble seulement pour Sid El Abed et la partie Appartements de Val d'Or (`showEtage`).

## Points sensibles

- **Excel** : export avec ExcelJS (tableaux `TableStyleMedium2`, look « Liste par étage »). Le bouton Excel des adhérents réécrit **le fichier d'origine** de l'utilisateur (`buildFromModel`) : on ne change que les cellules modifiées, on insère les nouveaux adhérents à leur place en gardant formules, tableaux et fusions. Toute modification ici doit être testée sur un vrai fichier (demander à l'utilisateur de l'envoyer, ne pas le committer).
- **Assistant IA** : Gemini via Firebase AI Logic, App Check par jeton de débogage stocké dans `am_meta/config`. Liste de modèles avec repli (`AI_MODELS`).
- **Design** : glassmorphism, bleu du logo, blanc, touches de vert ; ne pas modifier le logo (`dev/logo.b64`).
- Accessibilité : vrais `<button>`, labels, `aria-*`, zones tactiles ≥ 44 px.
