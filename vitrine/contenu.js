/*
  Contenu du site public de l'Amicale Albaraka.
  Pour modifier le site : changez ce fichier (sur GitHub : crayon ✏️ > « Commit changes »).
  Le site se met à jour tout seul quelques minutes après.

  ⚠️ Ce site est PUBLIC : ne jamais mettre ici de noms d'adhérents, téléphones privés ou montants.

  - Une annonce : { date:"AAAA-MM-JJ", titre:"…", texte:"…", projet:"Val d'Or", tag:"Nouveau" }
  - Un document : déposez le PDF dans le dossier vitrine/documents/ puis ajoutez
      { titre:"…", description:"…", fichier:"documents/nom-du-fichier.pdf", categorie:"Officiel", date:"AAAA-MM-JJ" }
    Sans « fichier », le document s'affiche « Bientôt en ligne ».
  - Photos : déposez l'image dans vitrine/photos/ puis mettez photo:"photos/mon-image.jpg".
  - accueil : les photos qui défilent en grand sur la page d'accueil.
  - Laissez un champ vide ("") pour qu'il ne s'affiche pas.
*/
window.CONTENU = {
  amicale: {
    nom: "Amicale Albaraka",
    nomArabe: "ودادية البركة",
    slogan: "Bâtir ensemble, habiter mieux.",
    intro: "L'Amicale Albaraka réunit des familles autour d'un même projet : accéder à un logement de qualité, à un prix juste, en toute transparence. Le bureau suit chaque chantier, chaque paiement et chaque document, du terrain jusqu'à la remise des clés.",
    ville: "",
    adresse: "",
    telephone: "",
    whatsapp: "",
    email: ""
  },

  accueil: [
    "photos/panorama-jour.jpg",
    "photos/facade-commerces.jpg",
    "photos/panorama-nuit.jpg"
  ],
  photoAmicale: "photos/panorama-nuit.jpg",
  photoContact: "photos/facade-commerces.jpg",

  chiffres: [
    { valeur: 4, suffixe: "", label: "projets immobiliers" },
    { valeur: 190, suffixe: "+", label: "familles adhérentes" },
    { valeur: 39, suffixe: "", label: "lots encore disponibles" },
    { valeur: 100, suffixe: " %", label: "suivi transparent" }
  ],

  projets: [
    {
      nom: "Val d'Or",
      statut: "En cours",
      lieu: "",
      resume: "Un ensemble complet : appartements, deux résidences et des locaux commerciaux.",
      parties: ["Appartements", "Résidence 1", "Résidence 2", "Commerce"],
      lotsDisponibles: 13,
      photo: "photos/facade-commerces.jpg"
    },
    {
      nom: "Sid El Abed",
      statut: "En cours",
      lieu: "",
      resume: "Des appartements répartis sur plusieurs immeubles et étages.",
      parties: ["Appartements"],
      lotsDisponibles: 26,
      photo: "photos/panorama-jour.jpg"
    },
    {
      nom: "Casino 1",
      statut: "Bientôt",
      lieu: "",
      resume: "Des bungalows pensés pour la détente.",
      parties: ["Bungalows"],
      lotsDisponibles: null,
      photo: ""
    },
    {
      nom: "Casino 2",
      statut: "Bientôt",
      lieu: "",
      resume: "La suite du projet Casino : de nouveaux bungalows.",
      parties: ["Bungalows"],
      lotsDisponibles: null,
      photo: ""
    }
  ],

  annonces: [
    {
      date: "2026-11-22",
      titre: "Lancement du site de l'Amicale",
      texte: "Retrouvez ici les projets, les nouvelles annonces et les documents de l'Amicale.",
      projet: "",
      tag: "Nouveau"
    },
    {
      date: "2026-11-22",
      titre: "Val d'Or : 13 lots disponibles",
      texte: "Des lots sont encore disponibles dans le projet Val d'Or. Contactez le bureau pour plus d'informations.",
      projet: "Val d'Or",
      tag: "Disponibilité"
    },
    {
      date: "2026-11-22",
      titre: "Sid El Abed : 26 appartements disponibles",
      texte: "Des appartements sont encore disponibles dans le projet Sid El Abed. Contactez le bureau pour plus d'informations.",
      projet: "Sid El Abed",
      tag: "Disponibilité"
    }
  ],

  documents: [
    { titre: "Statuts de l'Amicale", description: "Les règles de fonctionnement de l'Amicale.", fichier: "", categorie: "Officiel", date: "" },
    { titre: "Règlement intérieur", description: "Droits et obligations des adhérents.", fichier: "", categorie: "Officiel", date: "" },
    { titre: "Récépissé de dépôt", description: "Reconnaissance officielle de l'Amicale.", fichier: "", categorie: "Officiel", date: "" },
    { titre: "Dossier d'adhésion", description: "Les pièces à fournir pour devenir adhérent.", fichier: "", categorie: "Adhésion", date: "" }
  ]
};
