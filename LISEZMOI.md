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

## 3. Donner ou retirer l'accès à quelqu'un

- Donner : Authentication > Users > Ajouter un utilisateur, puis envoyez-lui l'APK, son email et son mot de passe.
- Retirer : Authentication > Users > menu de la ligne > Désactiver ou Supprimer le compte.
- Mot de passe oublié : bouton « Mot de passe oublié ? » sur l'écran de connexion.

Toute personne connectée peut tout voir et tout modifier.

## Où modifier quoi

- `app/src/main/assets/index.html` : toute l'application (écrans, catégories, textes).
- `app/src/main/assets/xlsx.mini.min.js` : bibliothèque SheetJS (licence Apache 2.0) pour créer les fichiers Excel.
- `app/src/main/assets/firebase-config.js` : la liaison avec votre projet Firebase.
- `app/src/main/java/ma/albaraka/amicale/MainActivity.kt` : l'enveloppe Android.
