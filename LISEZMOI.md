# Amicale Albaraka — application Android de gestion du bureau

Application réservée au bureau (Président, Secrétaire général, Trésorier), avec connexion par email et mot de passe.
Pour chaque projet : adhérents et paiements, chèques, factures et dépenses, suivi des travaux, documents.
Les données sont enregistrées dans votre projet Firebase et partagées entre toutes les personnes à qui vous créez un compte.

## 1. Créer le projet Firebase (une seule fois)

1. Allez sur https://console.firebase.google.com et créez un projet (ex. `amicale-albaraka`).
2. **Authentication** > Commencer > activez **Adresse e-mail/Mot de passe**.
3. **Authentication > Users > Ajouter un utilisateur** : créez un compte pour chaque membre du bureau
   (son adresse email + un mot de passe que vous choisissez).
4. **Authentication > Paramètres > Actions de l'utilisateur** : décochez **Autoriser la création (inscription)**.
5. **Firestore Database** > Créer une base de données (mode production), puis onglet **Règles** :
   collez le contenu de `firestore.rules` et publiez.
6. **Paramètres du projet > Vos applications > Ajouter une application Web** (`</>`). Copiez les valeurs
   de `firebaseConfig` dans le fichier `app/src/main/assets/firebase-config.js`.

Fichiers joints : ils sont gardés dans Firestore, sans Storage ni forfait payant. Les photos sont réduites
automatiquement ; un PDF doit faire moins de 900 Ko.

## 2. Obtenir l'APK

À chaque modification envoyée sur la branche `main`, GitHub construit l'APK tout seul :
onglet **Actions** > dernière tâche « Construire l'APK » > téléchargez `amicale-albaraka-apk`
(un zip qui contient `app-debug.apk`). Copiez l'APK sur le téléphone et installez-le.

Cet APK est une version « debug ». Pour installer une mise à jour, désinstallez d'abord l'ancienne version
(les données restent dans Firebase).

## Assistant IA (bouton « Assistant »)

L'assistant répond aux questions sur les projets (en darija, français ou arabe) et peut enregistrer un paiement,
attribuer un lot, ajouter un chèque ou une facture, changer le statut d'un chèque, ou créer un fichier Excel.
Il montre toujours un résumé et n'enregistre rien sans que vous appuyiez sur « Confirmer ».
Il utilise Gemini via Firebase AI Logic (gratuit avec le forfait Spark, avec des limites d'utilisation).

À activer une seule fois dans la console Firebase :
1. **AI Logic** (menu Services d'IA) > Commencer > choisissez **Gemini Developer API**.
2. App Check est imposé par Firebase pour AI Logic, et reCAPTCHA classique n'accepte plus de nouvelle clé.
   L'application utilise donc un **jeton de débogage App Check** : console Firebase > **App Check** >
   **Applications** > menu ⋮ de l'application Web « amicale » > **Gérer les jetons de débogage** >
   **Ajouter un jeton de débogage** > **Générer** > copiez le jeton > **Enregistrer**.
3. Collez ce jeton dans l'assistant quand il le demande. Il est gardé dans Firestore (lisible seulement par les
   comptes connectés du bureau) et sert à tous les téléphones. Ne le publiez nulle part.

Les modèles essayés, dans l'ordre, sont listés dans `AI_MODELS` dans `index.html`.

## Importer une liste Excel

Dans « Adhérents », le bouton « Importer Excel » lit un fichier .xlsx dont une ligne d'en-tête contient au moins
« Appartement » et « Prix total » (ou « Surface »). Colonnes reconnues : Étage, Immeuble, Appartement, Surface,
Prix/m², Prix total, Avance, Montant payé, Nom / Coordonnées, Téléphone, Commentaire.
Les lots sans nom sont importés comme « Disponible ». Réimporter met à jour les lots existants (même appartement),
sans doublon et sans toucher aux paiements saisis dans l'application.
L'export Excel des adhérents reprend ces mêmes colonnes : il peut être réimporté.

## Exports Excel

Chaque écran a un bouton vert « Excel » : liste des adhérents (avec tous les paiements), fiche d'un adhérent,
chèques, factures et dépenses, travaux, documents. Le bouton vert en haut exporte tout le projet sélectionné.
Le fichier est enregistré dans Téléchargements > Amicale Albaraka puis ouvert avec Excel ou Google Sheets.

## Connecteur MCP pour Claude (lecture seule)

Le dossier `mcp/` contient un petit serveur MCP. Une fois ajouté dans Claude (claude.ai ou l'application Claude), on peut demander à Claude la situation des projets, la liste des adhérents, les paiements, les chèques, les factures, les travaux et les documents. Le connecteur **ne modifie jamais** les données.

Outils : `resume_general`, `lister_adherents`, `fiche_adherent`, `lister_paiements`, `lister_cheques`, `lister_factures`, `suivi_travaux`, `lister_documents`.

Mise en place (une seule fois) :

1. **Cloudflare (gratuit)** : créer un compte sur dash.cloudflare.com, ouvrir *Workers & Pages* une fois (pour activer l'adresse `workers.dev`).
2. *Profil > My Profile > API Tokens > Create Token >* modèle **Edit Cloudflare Workers** > *Use template > Continue to summary > Create Token* → copier le jeton.
3. **GitHub** : dépôt > *Settings > Secrets and variables > Actions > New repository secret* : nom `CLOUDFLARE_API_TOKEN`, valeur = le jeton.
4. GitHub > *Actions* > **Déployer le connecteur MCP** > *Run workflow*. Le déploiement crée tout seul le compte Firebase `claude-mcp@amicale-albaraka.ma`, son mot de passe et le jeton de l'adresse.
5. Dans l'application : **Tableau de bord > Connecteur Claude** > *Copier l'adresse*. Dans Claude : *Paramètres > Connecteurs > Ajouter un connecteur personnalisé*, nom « Amicale Albaraka », coller l'adresse.
6. **Sécurité** : ensuite, dans Firebase > Authentication > *Settings > User actions*, décocher **Enable create (sign-up)**, pour que personne d'autre ne puisse créer un compte.

Options : les secrets `MCP_TOKEN`, `FB_EMAIL`, `FB_PASSWORD` et `CLOUDFLARE_ACCOUNT_ID` ne sont plus obligatoires (ils remplacent les valeurs automatiques s'ils existent).

L'adresse complète donne accès aux données : ne la partagez pas. Elle n'est jamais affichée sur GitHub (dépôt public). Pour la changer, créez un nouveau jeton Cloudflare (ou un secret `MCP_TOKEN`), remplacez le secret puis relancez le déploiement.

## 3. Donner ou retirer l'accès à quelqu'un

- Donner : Authentication > Users > Ajouter un utilisateur, puis envoyez-lui l'APK, son email et son mot de passe.
- Retirer : Authentication > Users > menu de la ligne > Désactiver ou Supprimer le compte.
- Mot de passe oublié : bouton « Mot de passe oublié ? » sur l'écran de connexion.

Toute personne connectée peut tout voir et tout modifier.

## Où modifier quoi

- `mcp/worker.js` : le connecteur MCP pour Claude.
- `app/src/main/assets/index.html` : toute l'application (écrans, catégories, textes).
- `app/src/main/assets/xlsx.min.js` : bibliothèque xlsx-js-style (licence Apache 2.0) pour lire les fichiers Excel importés.
- `app/src/main/assets/exceljs.min.js` : bibliothèque ExcelJS (licence MIT) pour créer les fichiers Excel (vrais tableaux Excel, comme le fichier d'origine).
- `app/src/main/assets/firebase.js` : SDK Firebase 13.4.0 (connexion, base de données, IA) regroupé en un seul fichier.
- `app/src/main/assets/firebase-config.js` : la liaison avec votre projet Firebase.
- `app/src/main/java/ma/albaraka/amicale/MainActivity.kt` : l'enveloppe Android.
