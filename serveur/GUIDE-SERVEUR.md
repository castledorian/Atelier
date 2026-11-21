# Guide serveur — comptes d'école, élèves et classements partagés

Ce guide explique **exactement** comment mettre en place le serveur qui garde les comptes, les élèves et les scores, et répond à vos deux questions : *« un serveur stable à vie ? »* et *« puis-je garder le site sur GitHub ? »*.

---

## 0. Les réponses courtes

**Peut-on garder le site sur GitHub ? Oui, pour le site. Non, pour les données.**
GitHub Pages ne sait servir que des fichiers (le jeu). Il ne peut pas enregistrer de scores ni de comptes. Les données vivent donc ailleurs, sur un petit serveur de base de données. Le site reste sur GitHub (comme aujourd'hui), le serveur est **Supabase**.

**Un serveur « stable à vie » ? Aucun service gratuit ne peut le promettre, mais on peut s'en rapprocher honnêtement :**

| | Gratuit (test) | Payant (usage réel en classe) |
|---|---|---|
| Offre Supabase | Free | Pro (≈ 25 $ / mois, soit ≈ 23 €) |
| Mise en pause | **Oui : le projet s'endort après 1 semaine sans activité** (vacances scolaires !) | Non, jamais |
| Sauvegardes automatiques | **Non** | Oui, quotidiennes (7 jours) |
| Nombre de projets actifs | 2 | selon l'organisation |
| À utiliser pour | essayer avec quelques élèves | une vraie école, toute l'année |

Ce qui rend le projet **durable malgré tout** :
- tout le « cerveau » du serveur tient dans **un seul fichier SQL** (`serveur/schema.sql`) : du Postgres standard, sans verrou propriétaire ;
- vos données s'exportent en un clic (CSV) ou en une commande (`pg_dump`, §9) ;
- si Supabase disparaissait ou changeait ses prix, vous pouvez recréer la même base ailleurs (autre hébergeur Postgres, ou Supabase auto-hébergé) et changer **deux lignes** dans `src/server/config.ts`.

Recommandation : **gratuit pour tester, Pro dès que de vraies classes s'en servent** (vous ne voulez pas qu'un serveur s'endorme pendant les vacances de la Toussaint et que les élèves trouvent un site cassé à la rentrée).

---

## 1. Comment ça marche (schéma)

```
Élèves / enseignants (navigateur, PC, tablette, téléphone)
        │  le jeu = fichiers statiques
        ▼
   GitHub Pages ───────────────  (gratuit, déjà en place)

        │  comptes, scores, classements (HTTPS)
        ▼
     Supabase  (base de données Postgres, région Europe)
```

- **Enseignants** : vrai compte (email + mot de passe), géré par le service d'authentification de Supabase. Un enseignant crée une **école**, des **classes**, des **élèves**.
- **Élèves** : pas d'email, pas de mot de passe. Chacun reçoit un **code personnel de 8 caractères** (imprimable). Aucune donnée personnelle sauf un prénom ou pseudo.
- **Cloisonnement** : une école ne voit jamais les données d'une autre. C'est garanti par la base elle-même (règles « RLS »), pas seulement par l'application. Ces règles sont couvertes par ~50 tests automatiques (voir §11).
- Plusieurs écoles, plusieurs enseignants par école : chaque enseignant crée son compte et son école. (Inviter un collègue dans la même école n'est pas encore dans l'interface : voir §11.)

---

## 2. Créer le projet Supabase (10 minutes)

1. Allez sur **supabase.com** → **Start your project** → connectez-vous avec votre compte GitHub (le plus simple).
2. Créez une **organisation** (nom libre, type « Personal » ou « Education », plan **Free** pour commencer).
3. **New project** :
   - *Name* : `atelier` (libre) ;
   - *Database password* : cliquez **Generate a password**, **copiez-le dans un gestionnaire de mots de passe** (vous en aurez besoin pour les sauvegardes, §9) ;
   - *Region* : **Europe — Paris (eu-west-3)** si proposée, sinon **Frankfurt (eu-central-1)**. Important pour le RGPD : les données d'élèves doivent rester dans l'Union européenne. **La région ne peut plus être changée après la création.**
4. Attendez 1 à 2 minutes que le projet soit prêt.

## 3. Installer la base (2 minutes)

1. Menu de gauche → **SQL Editor** → **New query**.
2. Ouvrez le fichier **`serveur/schema.sql`** de ce projet, copiez **tout** son contenu, collez-le dans l'éditeur, cliquez **Run**.
3. Vous devez voir **« Success. No rows returned »**. Si une erreur apparaît, ne relancez pas à moitié : envoyez-moi le message.
4. Vérification : **Table Editor** → vous voyez les tables `schools`, `school_members`, `classes`, `students`, `student_sessions`, `runs`, chacune marquée **RLS enabled**.

> Ce script se lance **une seule fois** (il crée les tables). Si vous voulez tout recommencer sur un projet de test : SQL Editor → `drop schema public cascade; create schema public;` puis relancez `schema.sql`. **N'utilisez jamais cette commande sur un projet avec de vraies données.**

## 4. Régler l'authentification des enseignants (10 minutes)

Menu **Authentication**.

1. **URL Configuration**
   - *Site URL* : l'adresse publique de votre site, par exemple `https://votrenom.github.io/votre-depot/`.
   - *Redirect URLs* : ajoutez la même adresse (avec `/**` à la fin si demandé). Pendant vos essais, ajoutez aussi `http://localhost:5173/**`.
   Sans cela, les liens des emails de confirmation renvoient vers une mauvaise adresse.
2. **Sign In / Providers → Email** : *Enable Email provider* activé ; *Confirm email* **activé** (recommandé : ainsi, il faut posséder l'adresse pour créer un compte) ; longueur minimale du mot de passe : **8**.
3. **Emails — serveur d'envoi (SMTP personnalisé)** : *Authentication → Emails → SMTP Settings* (ou *Project Settings → Authentication*).
   Le serveur d'envoi par défaut de Supabase est **fait pour les tests** : très peu d'emails par heure, et il peut se limiter aux membres de votre projet. **Dès que d'autres enseignants s'inscrivent, il faut votre propre service d'envoi.** Options gratuites ou peu chères (offre gratuite suffisante) : Brevo, Resend, Mailjet… Créez un compte, validez votre domaine ou votre adresse d'expéditeur, puis recopiez *hôte, port, identifiant, mot de passe, adresse d'expéditeur* dans Supabase.
4. **Email Templates** (facultatif mais utile) : traduisez en français les modèles « Confirm signup » et « Reset password ». Gardez la variable `{{ .ConfirmationURL }}` : c'est le lien.
5. **Ne pas activer pour l'instant** : « Enable CAPTCHA protection » (le site ne sait pas encore le gérer : les inscriptions échoueraient) ni « Disable sign ups ».

## 5. Relier le site au serveur (2 minutes)

1. Supabase → **Project Settings → API** (ou *API Keys*).
2. Copiez :
   - **Project URL** (`https://xxxxxxxx.supabase.co`) ;
   - la clé **publishable** (`sb_publishable_…`). Si votre projet n'en propose pas, utilisez la clé **anon** (longue, commence par `eyJ`).
3. Ouvrez **`src/server/config.ts`** et collez-les :
   ```ts
   export const SERVER_URL: string = 'https://xxxxxxxx.supabase.co';
   export const SERVER_KEY: string = 'sb_publishable_xxxxxxxxxxxxxxxx';
   ```
4. **Ces deux valeurs ne sont pas secrètes** : elles sont faites pour être dans le site (tout le monde peut les lire dans le navigateur). La sécurité vient des règles de la base.
5. 🚫 **Ne collez JAMAIS** la clé **secret** ou **service_role** : elle ouvre toutes les données.

## 6. Publier le site sur GitHub Pages

Vous l'avez déjà fait une fois ; c'est la même chose. Deux options.

**Option A — comme avant (manuelle)** : `npm install` puis `npm run build` ; le dossier `dist/` contient le site ; envoyez son contenu sur la branche de publication.

**Option B — automatique (recommandée)** : le fichier `.github/workflows/deploy.yml` est fourni.
1. Envoyez tout le projet sur GitHub (branche `main`).
2. Dépôt → **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. À chaque envoi sur `main`, le site est reconstruit et publié (onglet **Actions** pour suivre).

Adresse du site : `https://votrenom.github.io/nom-du-depot/` (c'est cette adresse qu'il faut mettre dans *Site URL*, §4).

## 7. Test de bout en bout (10 minutes) — à faire avant de l'annoncer

1. Ouvrez votre site → **Je suis enseignant → Créer un compte** → email + mot de passe.
2. Cliquez le lien reçu par email (vérifiez les courriers indésirables) → vous arrivez dans l'espace enseignant.
3. **Créer mon école**, **Créer la classe**, ajoutez 3 prénoms → 3 codes apparaissent.
4. Sur un autre appareil (ou fenêtre privée) : **Je suis élève** → tapez un code → jouez à **Frappe !** et à **Course à l’encre**.
5. Retour enseignant → **Actualiser** : les parties apparaissent. Essayez **Exporter (CSV)** et **Imprimer les codes**.
6. Créez une 2ᵉ école avec un autre email, vérifiez qu'elle ne voit rien de la première.
7. Mode avion sur le téléphone de l'élève : jouez, remettez le réseau : le score doit arriver tout seul.

### 7 bis. Mise à jour « Mémoire d'encre » (si votre base est déjà installée)

Le 3ᵉ jeu envoie ses scores sans rien changer côté serveur. Pour afficher sa colonne « Record mémoire » dans le tableau de bord enseignant : **SQL Editor → New query**, collez le contenu de **`serveur/mise-a-jour-memoire.sql`**, **Run**. Elle ne touche à aucune donnée et peut être relancée sans risque. (Une installation neuve avec `schema.sql` l'inclut déjà.)

## 8. Installer sur PC et téléphone

Le site est une **application installable (PWA)**, sans magasin d'applications :
- **PC / Mac / Android (Chrome, Edge)** : bouton **« Installer l'application sur cet appareil »** sur l'accueil (ou icône d'installation dans la barre d'adresse).
- **iPhone / iPad (Safari)** : **Partager → Sur l'écran d'accueil**.
- Elle s'ouvre ensuite en plein écran avec son icône, et le jeu fonctionne **sans réseau** ; les scores joués hors ligne partent au retour du réseau.

Une vraie application des **magasins** (App Store, Google Play) est possible plus tard (emballage Capacitor), mais coûte : compte Apple Developer ≈ 99 $/an, Google Play ≈ 25 $ une fois, et passage en validation. Ce n'est pas nécessaire pour l'usage en classe ; je ne l'ai pas fait.

## 9. Sauvegardes et sortie de secours

- **Free** : aucune sauvegarde automatique → faites la vôtre ci-dessous.
- **Pro** : sauvegardes quotidiennes conservées 7 jours (*Database → Backups*).
- **Sauvegarde à vous (recommandée, 1 fois par mois)** : *Project Settings → Database → Connection string* (mode « Session pooler ») puis, sur un ordinateur où PostgreSQL est installé :
  ```
  pg_dump "postgresql://postgres.xxxx:MOTDEPASSE@aws-0-eu-west-3.pooler.supabase.com:5432/postgres" --schema=public --schema=private --no-owner -f sauvegarde-AAAA-MM.sql
  ```
  Gardez le fichier hors de Supabase (disque, cloud personnel). Il contient des données d'élèves **et le secret qui protège les codes** (schéma `private`, d'où le second `--schema`) : traitez-le comme un mot de passe. Sans ce secret, une restauration rendrait tous les codes élèves inutilisables (il faudrait les renouveler).
- **Export enseignant** : bouton *Exporter (CSV)* de chaque classe.
- **Changer d'hébergeur** : créez un nouveau projet, relancez `schema.sql`, importez la sauvegarde, changez `config.ts`. Les codes élèves (leurs empreintes) et les scores sont conservés, à condition que la sauvegarde contienne le schéma `private` (secret `code_pepper`) ; la sauvegarde recrée tout elle-même : restaurez-la dans un projet vide, sans lancer `schema.sql` avant.

## 10. Protection des données (RGPD) — à lire si le site sert à de vraies écoles

*Je ne suis pas juriste : ceci est une liste de contrôle, pas un avis juridique.*

- **Données collectées** : prénom ou pseudo de l'élève, scores, dates. Email de l'enseignant. **Aucun nom de famille, aucun email d'élève, aucun suivi publicitaire, aucun cookie de traçage.**
- **Consigne aux enseignants** (déjà rappelée dans l'espace école) : prénoms ou pseudos uniquement.
- **Hébergement dans l'UE** : région Paris ou Francfort (§2). Supabase propose un **accord de traitement des données (DPA)** à signer en ligne : *supabase.com/legal/dpa*. Faites-le.
- **Mineurs** : les données d'enfants demandent une vigilance particulière. Informez les familles (courte note : quoi, pourquoi, qui y accède, durée) et, pour une école publique, rapprochez-vous du **délégué à la protection des données** de votre rectorat / collectivité avant un déploiement officiel.
- **Si vous faites payer des écoles** : vous devenez *sous-traitant* ; il faudra une entité légale, des CGU, un DPA avec chaque école et un registre des traitements.
- **Conservation** : un enseignant peut supprimer un élève, une classe ou toute l'école (suppression définitive en cascade). Prévoyez un nettoyage annuel (nouvelle année = nouvelles classes).
- **Droit d'accès / d'effacement** : l'enseignant (responsable côté école) peut exporter ou supprimer les données d'un élève.

## 11. Ce qui est protégé, et ce qui a été vérifié

**Vérifié automatiquement (sur un vrai PostgreSQL 16)** : ~50 contrôles — un enseignant ne voit que ses écoles ; un visiteur anonyme ne peut lire aucune table ni appeler les fonctions réservées ; un code élève s'accepte en minuscules/avec espace, les essais ratés sont freinés ; une partie envoyée deux fois n'est comptée qu'une fois ; les valeurs absurdes (score négatif…) sont refusées ; les classements ne mélangent pas les classes/écoles ; changer un code coupe les anciennes connexions ; supprimer une école efface tout.

**Vérifié dans un navigateur, avec un faux serveur** : inscription et connexion enseignant, création école/classe/élèves, connexion élève, deux jeux, classements classe/école, file d'attente hors ligne sans doublon, export CSV, mot de passe oublié, absence de fuite entre écoles.

**⚠ Non vérifié** : le site n'a **pas** pu être essayé contre un **vrai** projet Supabase (je n'y ai pas accès). Les routes utilisées sont celles de la documentation officielle, mais d'éventuels détails (libellés de menus, réglages d'emails, forme exacte de certaines réponses) peuvent différer. **Faites le test du §7 avant d'annoncer quoi que ce soit** et dites-moi ce qui coince.

**Limites actuelles à connaître**
- N'importe qui peut créer un compte enseignant (on ne vérifie pas le métier). Chaque compte est limité à 3 écoles, 60 classes par école, 1 500 élèves par école. En cas d'abus, Supabase permet de désactiver les inscriptions ou d'ajouter un captcha (demande un petit développement).
- Le code élève est la seule clé : il faut le garder privé comme un mot de passe. 8 caractères parmi 31 → ~850 milliards de combinaisons, avec frein sur les essais ratés. Le serveur n'en garde que l'empreinte. L'enseignant peut le renouveler en un clic.
- Un élève sur un appareil partagé reste connecté tant qu'il joue (la session expire après 30 jours sans partie) : **« Changer d'élève »** (accueil) le déconnecte.
- Pas encore : inviter un second enseignant dans la même école (chacun voit ses propres écoles), changement d'adresse email depuis l'interface, statistiques d'école globales.

## 12. Coûts et hébergement du site

| Poste | Prix indicatif |
|---|---|
| Site (GitHub Pages) | 0 € |
| Supabase Free | 0 € (pause après 1 semaine d'inactivité, pas de sauvegarde) |
| Supabase Pro | ≈ 25 $/mois (vérifiez la grille sur supabase.com/pricing) |
| Envoi d'emails (Brevo, Resend…) | 0 € à quelques euros |
| Nom de domaine (facultatif, ex. `monatelier.fr`) | ≈ 8–15 €/an |

**GitHub Pages et usage commercial** : GitHub Pages est prévu pour des sites personnels, associatifs, de projet ; ses conditions **interdisent d'en faire un service commercial** (vendre un abonnement, par exemple). Tant que le jeu est gratuit pour les écoles, c'est bon. Le jour où vous faites payer un abonnement, déplacez simplement le site (fichiers statiques) chez **Cloudflare Pages**, **Netlify** ou **Vercel** — les données n'ont pas à bouger, car elles sont chez Supabase. Un nom de domaine à vous rend ce déménagement invisible pour les utilisateurs.

**Nom de domaine** : achetez-le chez un registrar (OVH, Gandi…), ajoutez-le dans *GitHub → Settings → Pages → Custom domain*, puis **mettez à jour *Site URL* et *Redirect URLs* dans Supabase** (§4).

## 13. Entretien

- Surveillez *Supabase → Reports* (stockage, utilisateurs actifs). Le stockage est minime : une partie = une ligne de quelques dizaines d'octets.
- Si vous modifiez la base plus tard (nouveau jeu avec de nouvelles colonnes, etc.), faites-le par un nouveau script SQL daté (dans `serveur/`) et gardez `schema.sql` à jour.
- Nouveau jeu : le serveur accepte déjà n'importe quel identifiant de jeu (`game`) et de mode ; **le classement, l'export et le tableau de bord sont déjà prêts pour le suivant**.

## Mise à jour « suppression de compte »

Supabase → **SQL Editor** → **New query** → collez le contenu de `serveur/mise-a-jour-compte.sql` → **Run**. À faire une seule fois ; aucune donnée existante n'est modifiée.

## Mise à jour « séances de classe et équilibrage »

Supabase → **SQL Editor** → **New query** → collez le contenu de `serveur/mise-a-jour-seances.sql` → **Run**. À faire une seule fois, **avant** d'utiliser les séances ; aucune donnée existante n'est modifiée. Tant qu'elle n'est pas appliquée, l'onglet « Séances » affiche une erreur et les parties libres ne sont plus enregistrées (la fonction d'envoi change) : appliquez-la en même temps que la mise en ligne.

### Statistiques d'équilibrage

`serveur/stats-equilibrage.sql` contient trois requêtes de lecture (taux de réussite par jeu / niveau / difficulté, réussite page par page, précision de Frappe !). Lancez-les dans le SQL Editor et transmettez les résultats : ils ne contiennent aucune donnée personnelle. Objectif : environ 95 % de réussite en Apprenti, 85 % en Standard, 65 % en Expert.

## Mise à jour « classement masquable et objectif collectif »

Supabase → **SQL Editor** → **New query** → collez le contenu de `serveur/mise-a-jour-classement.sql` → **Run**. À faire une seule fois ; aucune donnée n'est modifiée. Elle ajoute :

- une case **« Masquer les classements aux élèves »** par classe (onglet Résultats de la classe) : les élèves voient alors « Ton enseignant a masqué le classement de la classe » ;
- l'**objectif collectif** : sur « Mes séances », les élèves voient combien de parties la classe a jouées cette semaine, sans aucun nom ni classement individuel.

Tant qu'elle n'est pas appliquée, le site continue de fonctionner : la case n'apparaît pas et l'objectif collectif reste caché.

## Mise à jour « Chasse aux fautes » (4ᵉ jeu, orthographe)

Supabase → **SQL Editor** → **New query** → collez le contenu de `serveur/mise-a-jour-orthographe.sql` → **Run**. À faire une seule fois ; aucune donnée n'est modifiée. Elle autorise « Chasse aux fautes » dans les **séances de classe**.

Sans elle, le jeu fonctionne en jeu libre (scores et classement de classe compris) ; seule la création d'une séance « Chasse aux fautes » est refusée. Les fautes rangées par créature (le bestiaire) restent sur l'appareil de l'élève : le serveur ne les reçoit jamais.

## Mise à jour « niveau de la classe »

Supabase → **SQL Editor** → **New query** → collez le contenu de `serveur/mise-a-jour-niveau.sql` → **Run**. À faire une seule fois ; aucune donnée n'est modifiée (une colonne vide est ajoutée).

Ensuite, dans l'espace enseignant, chaque classe a un réglage **« Niveau de la classe »** (CP, CE1, CE2, CM1, CM2). Les élèves de la classe voient alors seulement les jeux de leur niveau, sans rien choisir, au bout de quelques secondes après leur connexion. Tant que le niveau n'est pas fixé, chaque élève choisit sa classe sur l'accueil.

Sans cette mise à jour, le site fonctionne : le réglage n'apparaît pas et les élèves choisissent leur classe eux-mêmes.

## Mise à jour « sécurité des scores » (anti-triche)

**À faire une fois** : dans Supabase → SQL Editor, collez et exécutez `serveur/mise-a-jour-securite.sql` (sans danger si répété). À exécuter **après** les autres mises à jour : ne rejouez pas `mise-a-jour-seances.sql` ensuite, il remettrait l'ancienne version de l'envoi des parties (sans contrôle). Une installation neuve avec `schema.sql` est déjà à jour.

**Principe.** Tout ce que le navigateur envoie peut être falsifié par un élève qui ouvre les outils de développement : on ne peut pas rendre un site « infalsifiable » côté navigateur. La vraie protection est donc sur le serveur, qui connaît les règles des jeux :

- chaque partie est comparée aux maxima réels : 200 mots/min en Frappe, 60 points par lettre, 0,25 s minimum par réponse en Course, 30 manches en Mémoire, 10 phrases et 25 points par phrase en Orthographe, durée cohérente avec le nombre de réponses ;
- le temps de jeu cumulé est contrôlé : pas plus de 2 h de parties dans une même heure ;
- une partie impossible **n'est pas enregistrée** ; l'élève voit le message « Félicitations, tu as triché ! » et la partie est notée dans `private.cheat_log` (illisible depuis le navigateur, effacée après 90 jours) ;
- les bornes sont larges : elles écartent ce qu'aucun joueur ne peut obtenir, jamais un très bon joueur. Une triche « plausible » (un score élevé mais réaliste) reste possible : c'est la limite de toute vérification sans rejouer la partie.

Côté navigateur, la page porte une politique de sécurité du contenu (CSP) : un script injecté ne s'exécute pas et aucune donnée ne peut être envoyée ailleurs que vers le serveur de l'école.

**Voir les tentatives** (SQL Editor) :

```sql
select c.at, s.name as eleve, c.game, c.reason, c.values_
from private.cheat_log c left join public.students s on s.id = c.student_id
order by c.at desc limit 50;
```

Si un élève très honnête apparaît par erreur (cas rare : deux appareils en même temps), dites-le moi avec les valeurs de la ligne : on desserre la borne concernée.

## Espace administrateur (voir toutes les écoles, classes, élèves et journaux)

**À faire une fois** : dans Supabase → SQL Editor, collez et exécutez `serveur/mise-a-jour-admin.sql` (sans danger si répété ; à exécuter après les autres mises à jour). Puis **nommez-vous administrateur** : créez d'abord un compte enseignant avec votre adresse sur le site, puis, dans le SQL Editor, exécutez cette ligne seule en remplaçant l'adresse :

```sql
insert into public.site_admins (user_id) select id from auth.users where email = 'votre@adresse.fr' on conflict do nothing;
```

Reconnectez-vous sur le site : un bouton **Administration** apparaît sur l'accueil, à côté de « Mon espace école ». Retirer l'accès : `delete from public.site_admins where user_id = (select id from auth.users where email = 'votre@adresse.fr');`

**Ce que vous voyez** : chiffres clés (écoles, enseignants, classes, élèves, parties, activité des 7 derniers jours), courbe des parties sur 14 jours, liste des écoles (avec e-mails des enseignants, recherche), détail d'une école (classes, élèves avec nombre de parties, temps de jeu et dernière partie, dernières parties), journal de toutes les parties (export CSV), inscriptions d'enseignants, parties refusées par l'anti-triche, et la liste des consultations de cet espace.

**Garde-fous** : réservé aux comptes de `public.site_admins` (vérifié par le serveur, pas par le site) ; **lecture seule** ; les codes d'accès des élèves ne sont **jamais** renvoyés ; chaque consultation est notée dans `private.admin_audit` (effacée après 1 an). La page « Confidentialité » du site en informe les familles et enseignants. Si vous donnez ce rôle à une autre personne, tenez-en compte dans votre registre des traitements.

## Suivi des exercices et onglet « Équilibrage » (régler la difficulté avec de vraies données)

**À faire une fois** : dans Supabase → SQL Editor, collez et exécutez `serveur/mise-a-jour-exercices.sql` (sans danger si répété ; à exécuter **après** `mise-a-jour-admin.sql`). Une installation neuve avec `schema.sql` est déjà à jour. Tant qu'elle n'est pas faite, le site fonctionne normalement : les compteurs ne sont simplement pas enregistrés, et l'onglet « Équilibrage » l'indique.

**Ce que ça enregistre** : à la fin d'une partie libre d'un élève connecté (Course à l'encre, Chasse aux fautes), des **compteurs anonymes** : pour chaque famille de calcul, règle d'orthographe, calcul précis ou phrase, « posé N fois, raté E fois, avec telles mauvaises réponses ». Rien n'indique quel élève, quelle classe ou quelle école. Ne sont pas comptés : séances de classe, entraînements, réglages personnalisés, et tout texte tapé par l'élève (Expert). La table `public.item_stats` est illisible depuis le navigateur ; seule la lecture réservée à l'administrateur y accède (et chaque consultation est notée dans `private.admin_audit`).

**Où le lire** : site → Administration → onglet **Équilibrage** :
- *Réussite par niveau* : le taux de manches réussies du premier coup, comparé à l'objectif (Apprenti ≈ 95 %, Standard ≈ 85 %, Expert ≈ 65 %, tolérance ± 5 points), avec un verdict écrit (« Trop facile », « Bien réglé », « Trop difficile »). Un niveau n'est jugé qu'à partir de 150 manches ; le tableau signale aussi les niveaux dont presque toutes les parties sont gagnées ou perdues.
- *Ce qui fait échouer* : par jeu, niveau et difficulté, les familles de calculs (tables, × et ÷ par 10, fractions…) ou les règles d'orthographe, puis les calculs et phrases les plus ratés, avec les mauvaises réponses les plus choisies. Les exercices posés moins de 5 fois sont masqués.
- *Exports* : « Exporter en CSV » (niveaux, ou tous les exercices) et « Copier le bilan complet (texte) », à coller dans une conversation pour régler les niveaux.

**Quand les exercices changent** : augmentez `ITEM_STATS_VERSION` dans `src/game/itemstats.ts` pour que les nouveaux compteurs ne se mélangent pas aux anciens. Pour tout remettre à zéro : `truncate public.item_stats;`.

**Garde-fous** : l'envoi exige un élève connecté qui vient de jouer une partie libre du même jeu (30 minutes), est limité à 60 envois par heure et par élève, 120 entrées et 12 000 caractères par envoi, et 3 000 exercices précis par jeu et niveau. Les entrées mal formées sont ignorées une à une.

## Mise à jour « fiabilité » (version 1.11) : limites d'envoi, invitations, nettoyage, vérification de la base

**À faire une fois** (puis, juste après, `mise-a-jour-codes.sql` : voir plus bas) : dans Supabase → SQL Editor, collez et exécutez `serveur/mise-a-jour-fiabilite.sql` (sans danger si répété). Ne rejouez jamais `mise-a-jour-seances.sql` ou `mise-a-jour-securite.sql` après elle : ils remettraient une ancienne version de l'envoi des parties. Une installation neuve avec `schema.sql` est déjà à jour.

**Ordre des mises à jour d'une base déjà installée** (chacune une seule fois) : `seances` → `classement` → `orthographe` → `niveau` → `securite` → `admin` → `exercices` → `memoire` → `compte` → `fiabilite` → **`codes`**. Le site vous le dit lui-même : dans l'espace administrateur, un bandeau rouge liste les fichiers qui manquent et l'ordre à suivre (la base répond toute seule à la question « qu'est-ce qui est installé ? »). Il vérifie même que les fonctions d'envoi des parties contrôlent bien les parties, au cas où une ancienne mise à jour aurait été rejouée.

**Ce que ça change.**

- **Limites d'envoi fiables.** Elles se comptent sur l'heure de **réception** par le serveur (`runs.received_at`), pas sur l'heure annoncée par le navigateur : au plus 60 parties par minute, 200 par heure, 1 500 par jour et par élève. L'heure du navigateur est gardée pour l'affichage (parties jouées hors ligne).
- **Inscription sur invitation.** N'importe qui peut encore créer un compte (e-mail confirmé), mais **ne peut pas créer d'école** sans code d'invitation : il ne peut donc ni enregistrer de données ni créer d'élèves. Espace administrateur → onglet **Invitations** : « Créer un code » (nombre d'utilisations, durée), à transmettre à l'enseignant, qui le saisit à sa première connexion. Les enseignants déjà installés ne sont pas touchés. Interrupteur « Désactiver » dans le même onglet pour ouvrir à nouveau l'inscription. Aucun service extérieur (pas de CAPTCHA) : le site garde sa promesse « aucun contenu d'un autre site ».
- **Conservation limitée (RGPD).** Chaque nuit, `private.purge_old_data()` efface les parties de plus de 13 mois (400 jours) et les élèves créés depuis plus de 13 mois qui n'ont plus de partie. La programmation utilise l'extension **pg_cron** : si le fichier affiche l'avis « pg_cron indisponible », activez-la (Supabase → Database → Extensions → `pg_cron`), puis relancez le fichier ; le bandeau de l'espace administrateur reste affiché tant que le nettoyage n'est pas programmé. Pour lancer un nettoyage tout de suite : `select private.purge_old_data();`.
- **Codes élèves non stockés en clair (version 1.13).** Fichier `mise-a-jour-codes.sql`, à lancer APRÈS `mise-a-jour-fiabilite.sql`. Le serveur ne garde plus qu'une **empreinte** (SHA-256 du code mêlé à un secret du serveur, `private.app_settings` clé `code_pepper`) : une copie de la table des élèves ne livre pas les codes. Le code n'est affiché qu'à la création de l'élève ou à son renouvellement (« Nouveau »), et la classe entière peut être renouvelée d'un coup (« Nouveaux codes pour la classe ») pour réimprimer les fiches. **Transition sans risque :** les codes distribués avant la mise à jour continuent de fonctionner et restent lisibles tant que vous n'avez pas lancé `select private.wipe_plain_codes();` (SQL Editor) — à faire quand les enseignants ont imprimé leurs fiches ; irréversible. Honnêteté sur la limite : le secret est dans la même base ; un vol de la base ENTIÈRE (sauvegarde complète) permettrait donc encore une attaque par force brute sur les empreintes. La protection est réelle contre les fuites partielles (table seule, export, erreur de droits), pas contre la perte de tout le projet Supabase.
- **Grotte par classe et observation en lecture seule (version 1.18).** Fichier `mise-a-jour-grotte.sql`, à lancer en DERNIER (après `mise-a-jour-codes.sql`), sans danger si répété. (1) Les fautes et réussites des parties libres sont ajoutées à la ligne de la partie (`runs.cave_ink`, `runs.cave_power`) ; le serveur calcule le monstre de chaque classe depuis le 1er août (`public.cave_get`, `teacher_cave`) et l'enseignant peut le remettre à zéro (`class_cave`). Les parties sans bonne réponse et les règles revues en duel passent par `public.cave_drop` (table `public.cave_drops`, un envoi par identifiant, nettoyée au-delà de 400 jours). Sans ce fichier, la grotte reste locale à l'appareil. (2) L'administrateur peut, depuis Administration → École, observer l'espace enseignant d'une école, la grotte d'une classe ou celle d'un élève. **Lecture seule garantie par le serveur** : l'administrateur n'est membre d'aucune école, donc toutes les fonctions qui modifient (`assert_member`) le refusent ; il n'a qu'un droit de LECTURE (politiques `*_admin_read`, `private.assert_reader`) et un jeton « obs: » accepté uniquement par les fonctions de lecture. Chaque début d'observation est inscrit dans `private.admin_audit` (action `observe_school` / `observe_student`). (3) Les colonnes `access_code` et `code_hash` des élèves ne sont plus lisibles depuis le navigateur par personne. Les tests `serveur/tests/dbtest.sql` vérifient qu'un administrateur ne peut ni modifier un élève, ni supprimer une partie, ni remettre une grotte à zéro, ni renouveler des codes.
- **Statistiques détaillées (version 1.27).** Fichier `mise-a-jour-stats.sql`, à lancer EN DERNIER (après `mise-a-jour-facteur.sql`), sans danger si répété ; aucune donnée modifiée. Il ajoute `public.admin_game_stats(jours)` (administrateur seulement, chaque consultation journalisée) : réussite, scores, durées et abandons par jeu, mode et niveau de la classe ; résultats par classe (seulement les groupes d'au moins 3 élèves) ; activité par semaine et par heure ; fidélité ; parties refusées. Il accepte aussi « Le facteur » dans le suivi anonyme des exercices (mots ratés, boîtes touchées à tort). `server_version()` passe à 17 (fonctionnalité `stats`). Sans ce fichier, l'onglet Équilibrage garde l'ancien affichage.
- **Reprise de la grotte (version 1.26).** Fichier `mise-a-jour-grotte-reprise.sql`, sans danger si répété, à lancer APRÈS `mise-a-jour-grotte.sql`. Les compteurs de la grotte n'existent que depuis la version 1.18 : les parties plus anciennes n'avaient ni fautes ni réussites enregistrées, donc la créature d'une classe qui joue depuis longtemps restait à 10 points de vie. Ce fichier les reconstitue (estimation depuis les réussites et la précision de chaque partie, depuis le 1er août, parties de séance et parties de moins de 10 minutes exclues). Les tests SQL le vérifient.
- **Nouveau jeu « Mots en orbite » (version 1.20).** Fichier `mise-a-jour-lexique.sql`, à lancer en DERNIER (après `mise-a-jour-grotte.sql`), sans danger si répété. Il autorise le jeu `lexique` dans les séances de classe et les résumés d’équilibrage, ajoute son contrôle anti-triche (`private.run_violation` : au plus 1 manche gagnée par 1,2 s de jeu, 1 300 points au maximum par manche), son record au tableau de bord enseignant (`best_lexique`) et passe `server_version()` à la version 14 (fonctionnalité `lexique`). Sans ce fichier, le jeu se joue en local, mais le serveur refuse ses parties (« jeu inconnu ») et les séances « Mots en orbite » ne peuvent pas être créées. Ne rejouez pas d’anciennes mises à jour après celle-ci (elles remettraient d’anciennes versions des fonctions) : si c’est arrivé, relancez simplement ce fichier.
- **Nouveau jeu « Le facteur » (version 1.24).** Fichier `mise-a-jour-facteur.sql`, à lancer en DERNIER, sans danger si répété (testé : mise à jour depuis l’ancien `schema.sql`, double exécution, puis `mise-a-jour-bareme.sql` ensuite). Il autorise le jeu `facteur` dans les séances de classe et les résumés d’équilibrage, ajoute son contrôle anti-triche (`private.run_violation` : 16 colis au plus, au moins 1 colis par seconde, 600 points au plus par colis), son record au tableau de bord (`best_facteur`) et passe `server_version()` à la version 16. Le contrôle du facteur figure aussi dans `mise-a-jour-bareme.sql` et `schema.sql` : l’ordre des deux fichiers n’a donc pas d’importance. Sans ce fichier, le jeu se joue en local, mais le serveur refuse ses parties (« jeu inconnu »).
- **Registre des mises à jour.** `private.schema_migrations` liste les fichiers récents appliqués (`2026-11-codes`…) ; `public.server_version()` les renvoie avec le nombre de codes encore lisibles (`plain_codes`).
- **Fin d'année.** À partir du 15 juin, l'espace enseignant affiche un rappel (exporter en CSV, puis « Effacer les résultats » : les élèves gardent leur code). Le même bouton existe toute l'année dans l'onglet « Supprimer » de la classe.

## Niveaux de classe et difficultés (CP → CM2) : comment c'est réglé

- **Les 3 difficultés (Apprenti, Standard, Expert) existent maintenant dans les 4 jeux.** Apprenti = initiation (beaucoup de temps ou de vies, erreurs peu coûteuses), Standard = référence de la classe, Expert = les plus rapides ou les plus sûrs d'eux.
- **Mémoire d'encre** : Apprenti 5 vies et rythme plus lent, Expert départ à une suite de 3 et rythme serré. Les classements sont séparés par difficulté (`suite`, `suite-apprenti`, `suite-expert`, `cases`…) : **aucune mise à jour SQL n'est nécessaire**.
- **Chasse aux fautes** : disponible dès le CE1 (phrases de 5 mots au plus) et au CE2 (7 mots au plus). Avant le CM1, Expert propose quatre réponses sans indice (on n'écrit pas le mot).
- **Course à l'encre** : temps, montée de l'encre et pénalité d'erreur recalibrés pour que chaque classe ait la même courbe (Apprenti ≈ 9 élèves sur 10 finissent le cahier, Standard ≈ 2 sur 3 des élèves moyens, Expert = les plus rapides).
- Ces réglages viennent de **simulations d'élèves fragiles / moyens / à l'aise** (hypothèses, pas de mesures). Après quelques semaines d'usage, comparez avec les vraies parties anonymes : `serveur/stats-equilibrage.sql`.


## Publier une nouveauté (page « Nouveautés » et numéro de version)

À chaque mise en ligne qui change quelque chose pour les enseignants ou les élèves :

1. Ouvrir `src/content/changelog.ts` et ajouter une entrée **en tête** de `RELEASES` (version, date, titre, changements « Nouveau / Amélioré / Corrigé »).
2. Le numéro de cette première entrée s'affiche tout seul en bas de chaque page, et un repère « nouveau » apparaît à l'accueil jusqu'à ce que la page soit lue sur l'appareil.
3. Rien d'autre à faire pour que les appareils récupèrent la nouvelle version : le numéro du cache du service worker est calculé à la construction (empreinte de la page, voir `scripts/sw-version.ts`).

Les adresses de contact et le nom de l'éditeur affichés dans les pages Contact, Crédits et Confidentialité viennent de `src/legal.ts`. Les bibliothèques citées dans « Crédits et licences » sont listées dans `src/content/credits.ts` : à mettre à jour quand une dépendance est ajoutée.
