# Frappe ! — guide de l'enseignant

Ce guide explique comment mettre en place le **classement de la classe**, récupérer les **résultats** de vos élèves et faire **installer le jeu** sur leurs appareils. Rien de tout cela n'est obligatoire : sans classement partagé, le jeu fonctionne très bien et garde les scores sur chaque appareil.

---

## 1. Régler une séance pour la classe (mode « Perso »)

1. Sur l'accueil, choisissez **Perso**.
2. Réglez la vitesse, les vies, les lettres autorisées, la longueur des mots, la cible automatique…
3. Dans **Espace enseignant**, cochez « Inclure les réglages de la séance « Perso » » puis **Copier le lien**.
4. Donnez ce lien aux élèves : en l'ouvrant, ils jouent avec vos réglages.

Les parties en mode Perso et les entraînements ne sont pas classés, mais ils apparaissent dans l'historique et dans l'export.

---

## 2. Mettre en place le classement de la classe (une seule fois, ~10 minutes)

Les scores sont enregistrés dans **votre propre feuille Google Sheets** : vous gardez la main sur les données, et vous pouvez les consulter ou les télécharger à tout moment. Il faut un compte Google.

1. Créez une feuille Google Sheets (par exemple « Frappe – classe »).
2. Menu **Extensions → Apps Script**.
3. Supprimez le code présent, collez le contenu du fichier **`Code.gs`** (dossier `enseignant/`), puis enregistrez (icône disquette).
4. Dans la barre du haut, choisissez la fonction **`installer`** et cliquez sur **▶ Exécuter**. Google demande une autorisation : acceptez (« Paramètres avancés » → « Accéder à … »). L'onglet **Parties** est créé dans la feuille.
5. Cliquez sur **Déployer → Nouveau déploiement** :
   - type : **Application Web**
   - *Exécuter en tant que* : **Moi**
   - *Qui a accès* : **Tout le monde**
6. Cliquez sur **Déployer** et **copiez l'URL** de l'application Web (elle se termine par `/exec`).
7. Dans le jeu : **Espace enseignant** → collez l'URL → choisissez un **code de classe** (par exemple `CM2-A`) → **Tester la connexion**.
8. Cliquez sur **Copier le lien** et donnez-le à vos élèves. Le lien contient l'adresse du classement et le code de classe : ils n'ont rien à saisir.

**Plusieurs classes** : utilisez la même feuille et un code différent par classe (`CM1-A`, `CM2-B`…). Chaque classe a son propre classement.

**Nouvelle année** : changez le code de classe (ou supprimez les lignes de l'onglet Parties).

**Modifier le script plus tard** : *Déployer → Gérer les déploiements → ✏️ → Version : nouvelle version*. L'URL ne change pas.

---

## 3. Récupérer les résultats

- **Dans la feuille Google Sheets** (onglet *Parties*) : une ligne par partie classée (date, code de classe, prénom, mode, score, vague, mots/minute, précision). *Fichier → Télécharger → Valeurs séparées par des virgules* pour un CSV.
- **Depuis le jeu** (Espace enseignant) :
  - **Télécharger les résultats de la classe (CSV)** : toutes les parties de la classe, lues depuis votre feuille.
  - **Historique de cet appareil (CSV)** : toutes les parties jouées sur l'appareil (y compris entraînements et séances Perso), utile si les élèves n'utilisent pas le classement partagé.

Les fichiers CSV s'ouvrent directement dans Excel ou LibreOffice.

Chaque élève peut aussi suivre sa progression dans **Mes progrès** (courbe de vitesse et de précision, sur l'appareil).

---

## 4. Installer le jeu sur les appareils

Une fois installé, le jeu s'ouvre comme une application et **fonctionne sans réseau** (le classement de la classe se met à jour dès que la connexion revient ; les scores joués hors ligne sont envoyés plus tard).

- **Android, Chromebook, ordinateur (Chrome ou Edge)** : bouton **Installer l'application** sur l'accueil du jeu (ou icône d'installation dans la barre d'adresse).
- **iPhone / iPad (Safari)** : bouton **Partager**, puis **Sur l'écran d'accueil**.

L'installation demande d'avoir ouvert le jeu au moins une fois **avec du réseau**.

---

## 5. Données personnelles — à lire

Le jeu ne collecte que : un **prénom ou pseudo** saisi par l'élève (12 caractères, lettres et chiffres), le **score**, la **vague**, la **vitesse** et la **précision**.

- Demandez aux élèves de n'utiliser qu'un **prénom ou un pseudo**, jamais de nom de famille.
- Les données sont dans **votre** feuille Google ; elles ne sont envoyées nulle part ailleurs. Vérifiez que cet usage est conforme aux règles de votre établissement (outils autorisés, information des familles) et au RGPD.
- Pensez à **supprimer les données** en fin d'année (supprimez les lignes de l'onglet *Parties*).
- Sur chaque appareil, l'historique est conservé dans le navigateur ; **Espace enseignant → Effacer l'historique de cet appareil** le supprime.

## 6. Limites à connaître

- **Pas d'authentification** : toute personne qui possède l'adresse du classement *et* le code de classe peut envoyer un score. Le code sert à séparer les classes, ce n'est pas un mot de passe. Changez-le si le lien circule trop.
- Les scores sont envoyés par le navigateur de l'élève : un élève motivé peut les falsifier. Le script borne les valeurs (score, vitesse, précision) et neutralise les prénoms piégés, mais ne peut pas prouver qu'une partie a vraiment été jouée.
- Seul le **meilleur score de chaque prénom** apparaît dans le classement (deux élèves portant le même prénom sont confondus : ajoutez une initiale).
- Google limite le nombre d'appels des scripts gratuits ; pour une classe, c'est très largement suffisant.
