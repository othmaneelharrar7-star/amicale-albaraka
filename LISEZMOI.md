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

## 3. Donner ou retirer l'accès à quelqu'un

- Donner : Authentication > Users > Ajouter un utilisateur, puis envoyez-lui l'APK, son email et son mot de passe.
- Retirer : Authentication > Users > menu de la ligne > Désactiver ou Supprimer le compte.
- Mot de passe oublié : bouton « Mot de passe oublié ? » sur l'écran de connexion.

Toute personne connectée peut tout voir et tout modifier.

## Où modifier quoi

- `app/src/main/assets/index.html` : toute l'application (écrans, catégories, textes).
- `app/src/main/assets/firebase-config.js` : la liaison avec votre projet Firebase.
- `app/src/main/java/ma/albaraka/amicale/MainActivity.kt` : l'enveloppe Android.
