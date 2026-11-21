# Commission Trésorerie et Capacitation (CTC) — Section UIDT-EPT

Application web de gestion des membres, des participations annuelles, des cotisations, des projets de vente et de la caisse de la **Commission Trésorerie et Capacitation (CTC)** de la **Section UIDT-EPT**, au sein du **Comité inter-universitaire DMWM** (Moustarchidine Junior), Conseil des établissements supérieurs de Thiès. Aucune dépendance : seulement Node.js 22.5 ou plus.

## Lancer chez vous
    npm start
Ouvrez http://localhost:3000. À la première visite, créez le compte administrateur (mot de passe : 8 caractères minimum). Le port d’écoute par défaut est `3000` ; la variable `PORT` peut le remplacer par un nombre compris entre 1 et 65535.
Après une mise à jour de `server.js`, arrêtez le serveur en cours avec `Ctrl+C`, puis relancez-le avec la même commande et la même configuration `DB_PATH` afin de conserver la base de données existante.

## Rôles
- **Administrateur** : tout, plus les comptes et le journal des modifications (onglet Équipe).
- **Trésorier** : saisit et modifie les données.
- **Lecteur** : consulte seulement.
- Chaque utilisateur connecté peut modifier son mot de passe depuis le bouton **Mon mot de passe** en haut de page. Le mot de passe actuel est vérifié, le nouveau doit compter 8 à 128 caractères et les autres sessions du compte sont déconnectées.

## Règles de saisie
- Les champs marqués d’un astérisque sont obligatoires. Les montants sont saisis en FCFA, en nombres entiers.
- Les noms des membres, événements et projets doivent contenir entre 2 et 80 ou 100 caractères selon le champ. Le téléphone du membre est facultatif ; s’il est renseigné, il doit comporter 9 chiffres et correspondre à un numéro sénégalais : mobile commençant par 70, 75, 76, 77 ou 78, ou téléphone fixe commençant par 33. Les formats avec indicatif `+221`, `221` ou `00221` sont acceptés, avec ou sans espaces, tirets ou parenthèses ; le numéro est enregistré au format `+221 77 123 45 67`. La date d’adhésion est demandée lors de la création d’un profil. La fonction est facultative et, si elle est renseignée, doit contenir 2 à 80 caractères.
- Le montant d’une cotisation et le prix de vente doivent être supérieurs à zéro. Un règlement ne peut pas dépasser la cotisation. Le coût d’achat peut être nul.
- Une participation annuelle est définie une seule fois par année, avec un montant commun à tous les membres. Les règlements partiels sont datés, leur historique est conservé et ils sont comptabilisés dans la caisse. Tous les membres enregistrés apparaissent dans le suivi.
- Une vente doit indiquer un membre, une quantité entière d’au moins un article et une date. Un mouvement de caisse doit préciser son type, son motif, sa date et un montant positif.
- Les comptes utilisent un nom de 2 à 80 caractères et un mot de passe de 8 à 128 caractères. Les rôles déterminent les droits d’accès.

## Profils des membres
L’onglet **Membres** sert d’annuaire : vous pouvez rechercher une personne par nom ou téléphone, puis ouvrir sa fiche. Lors de la création, renseignez le nom et la date réelle d’adhésion ; le téléphone et la fonction dans l’organisation sont facultatifs.
Le tableau de bord affiche les derniers profils ajoutés et permet d’ouvrir leur fiche directement. Chaque profil présente les coordonnées, la fonction et la date d’adhésion, ainsi que les cotisations et participations réglées ou restant dues, les présences aux événements et les ventes associées. Ces informations d’activité sont calculées à partir des enregistrements existants ; elles ne modifient pas les montants ni l’historique financier.

## Utiliser le suivi annuel des participations
1. Ajoutez et vérifiez les membres de la commission dans l’onglet **Membres**.
2. Ouvrez **Participation annuelle**, choisissez l’année et saisissez le montant décidé par membre. Le montant s’applique à tous les membres enregistrés, et une participation ne peut être créée qu’une seule fois par année.
3. Dans le tableau de l’année, indiquez pour chaque membre le montant effectivement reçu et la date du versement. Vous pouvez enregistrer plusieurs versements partiels ; le solde restant est calculé automatiquement.
4. Les versements apparaissent comme recettes datées dans l’onglet **Caisse**. Consultez l’historique pour vérifier un règlement ; les administrateurs et trésoriers peuvent retirer un versement enregistré par erreur.
5. Utilisez **Imprimer / enregistrer en PDF** pour obtenir une liste mise en page, avec le récapitulatif financier, le téléphone, les versements, les soldes et des espaces de signature. Dans la fenêtre d’impression, choisissez **Enregistrer au format PDF**. Le bouton **Télécharger la liste CSV** permet d’ouvrir les données dans Excel ou un tableur similaire.

## Sauvegarde
Dans l’onglet **Sauvegarde**, le JSON est la copie technique à conserver pour restaurer les données ; seuls les administrateurs et trésoriers peuvent l’importer, et la restauration remplace les données enregistrées. Les CSV de l’annuaire et de la caisse sont prêts pour un tableur (colonnes séparées, titres clairs et encodage compatible avec les accents). Le CSV de participation annuelle reste disponible depuis le suivi de chaque année. Le **rapport PDF** regroupe un résumé financier, l’annuaire, les participations, les cotisations, les ventes et le journal de caisse ; choisissez **Enregistrer au format PDF** dans la fenêtre d’impression. Copiez aussi régulièrement le fichier `commission.db` (dossier `data/` ou `/data`).
