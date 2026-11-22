# Commission Trésorerie et Capacitation (CTC) — Section UIDT-EPT

Application web de gestion des membres, des participations annuelles, des cotisations, des projets de vente et de la caisse de la **Commission Trésorerie et Capacitation (CTC)** de la **Section UIDT-EPT**, au sein du **Comité inter-universitaire DMWM** (Moustarchidine Junior), Conseil des établissements supérieurs de Thiès. Node.js 22.5 ou plus est requis.

## Lancer chez vous
    npm start
Ouvrez http://localhost:3000. À la première visite, créez le compte administrateur (mot de passe : 8 caractères minimum). Le port d’écoute par défaut est `3000` ; la variable `PORT` peut le remplacer par un nombre compris entre 1 et 65535.
Après une mise à jour de `server.js`, arrêtez le serveur en cours avec `Ctrl+C`, puis relancez-le avec la même commande et la même configuration `DB_PATH` afin de conserver la base de données existante.

### Installer l’application depuis Chrome
Ouvrez l’adresse de l’application dans Chrome, puis choisissez **Installer CTC** dans le menu ⋮ (ou utilisez l’icône d’installation dans la barre d’adresse si elle apparaît). L’application s’ouvre ensuite dans sa propre fenêtre. L’installation nécessite une connexion sécurisée HTTPS ; `http://localhost` est accepté pour un usage local. Le serveur doit rester accessible pour se connecter et synchroniser les données ; le mode hors connexion ne permet pas d’effectuer les opérations de gestion.

### Récupérer l’accès administrateur
Si le mot de passe administrateur est oublié, exécutez `node reset-admin-password.js` depuis un terminal dans ce dossier. Le nouveau mot de passe est saisi localement sans être affiché. Par défaut, la commande cible le compte `DIASSY` dans `data/commission.db`. Si le serveur utilise une autre base, lancez la commande avec la même variable `DB_PATH` ; pour cibler un autre administrateur, définissez `ADMIN_NAME`. La récupération ne modifie aucune donnée de gestion et déconnecte les sessions existantes de ce compte.

### Connexion par e-mail et récupération du mot de passe
Les utilisateurs peuvent se connecter avec leur nom d’utilisateur ou l’adresse e-mail associée au compte. Pour les comptes déjà créés, l’administrateur doit enregistrer chaque adresse dans **Équipe** ; les nouveaux comptes demandent une adresse e-mail.

Sous Windows, configurez SMTP sans inscrire de secret dans le code :

1. Ouvrez PowerShell dans le dossier `commission` et lancez `.\configure-smtp.ps1`.
2. Gardez l’hôte Gmail (`smtp.gmail.com`) et le port (`587`) proposés, puis saisissez l’adresse Gmail utilisée pour envoyer les e-mails.
3. Saisissez un **mot de passe d’application Google** lorsqu’il est demandé. La saisie est masquée ; les espaces de présentation éventuellement copiés avec le mot de passe sont retirés automatiquement. Le mot de passe Gmail habituel ne convient pas. Google exige que la validation en deux étapes soit activée pour créer un mot de passe d’application.
4. Gardez l’URL locale proposée, `http://localhost:3000`, pour les essais sur cet ordinateur. Le script crée `.env`, exclu de Git, avec des permissions restreintes.

Le lien construit avec `localhost` ne peut être ouvert que sur l’ordinateur où tourne le serveur ; cette configuration sert uniquement à tester l’envoi et le changement de mot de passe en local. Pour permettre aux autres utilisateurs d’ouvrir les liens, l’application doit ensuite être accessible par HTTPS depuis Internet.

Pour le site hébergé sur Render, le fichier `.env` de votre ordinateur ne configure pas le serveur en ligne. Ouvrez le service Render **commission-cmf0** → **Environment**, puis définissez les variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` et `APP_URL` avec les valeurs ci-dessus et l’URL `https://commission-cmf0.onrender.com`. Ajoutez aussi `TRUST_PROXY=1` : Render termine HTTPS devant Node.js, et ce réglage active le cookie de session sécurisé ainsi qu’une limitation des tentatives par adresse client. N’activez cette option que derrière un proxy de confiance qui définit les en-têtes `X-Forwarded-*`. Enregistrez puis redéployez/redémarrez le service. Saisissez `SMTP_PASS` uniquement dans l’interface sécurisée de Render ; ne le mettez jamais dans le dépôt ou dans un message.

Le script crée ou met à jour le fichier `.env`. Pour une configuration d’hébergement, définissez les variables d’environnement équivalentes :

- `SMTP_HOST` : serveur SMTP.
- `SMTP_PORT` : port SMTP (587 par défaut ; le port 465 active TLS direct).
- `SMTP_SECURE=true` : activer TLS direct si le fournisseur l’exige.
- `SMTP_USER` et `SMTP_PASS` : identifiants SMTP, si requis par le fournisseur. Gardez le mot de passe dans la configuration sécurisée de l’hébergement, jamais dans le code.
- `SMTP_FROM` : adresse d’expédition autorisée par le fournisseur.
- `APP_URL` : URL publique de l’application, en HTTPS en production (par exemple `https://ctc.example.org`).

Variables attendues par le serveur :
```powershell
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=compte-smtp
SMTP_PASS=(secret SMTP, à conserver dans la configuration sécurisée)
SMTP_FROM=CTC <noreply@example.org>
APP_URL=https://ctc.example.org
```

Le port 465 utilise TLS direct (`SMTP_SECURE=true`) ; le port 587 utilise normalement STARTTLS (`SMTP_SECURE=false`). Les demandes de récupération renvoient un lien à usage unique, valable une heure, et invalident les sessions du compte après le changement du mot de passe. Sans configuration SMTP, la connexion par adresse e-mail fonctionne, mais l’envoi des liens de récupération n’est pas disponible.

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
- Chaque compte a un nom de 2 à 80 caractères et une adresse e-mail unique. La connexion accepte l’un ou l’autre ; ils ne sont pas sensibles aux majuscules/minuscules. Le mot de passe doit compter 8 à 128 caractères et reste sensible à la casse. Les rôles déterminent les droits d’accès : le lecteur consulte sans modifier, tandis que le trésorier et l’administrateur peuvent enregistrer les changements.

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
