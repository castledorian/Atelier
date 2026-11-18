# Politique de sécurité

Ce site est utilisé par des enfants et des enseignants : une faille de sécurité est prise très au sérieux, même mineure.

## Signaler une faille

Écrivez à **pegliondorian@gmail.com** (objet : « Sécurité Atelier »), ou ouvrez un signalement privé dans l'onglet **Security** du dépôt GitHub (« Report a vulnerability »).

**Merci de ne pas publier la faille avant qu'elle soit corrigée.** Indiquez, si possible : la page ou la fonction concernée, les étapes pour reproduire, et ce que la faille permettrait de faire. N'accédez pas aux données réelles d'élèves et ne les copiez pas : une démonstration sur un compte de test suffit.

Délais visés : accusé de réception sous 7 jours, correction ou plan de correction sous 30 jours. Les personnes qui signalent de bonne foi ne seront pas poursuivies.

## Ce qui est protégé

- **Aucun contenu tiers** : pas de traceur, pas de police ou script externe ; une politique de sécurité du contenu (CSP) limite la page à elle-même et à son serveur de données.
- **Connexion enseignant** : compte à e-mail confirmé ; la connexion et l'espace enseignant refusent de s'ouvrir dans une page intégrée d'un autre site.
- **Élèves** : un code personnel ; le serveur n'en garde qu'une empreinte (jamais le code), la session expire après 30 jours sans partie, les essais répétés sont bloqués.
- **Serveur (Supabase / PostgreSQL)** : accès aux données contrôlé ligne par ligne (RLS) ; chaque enseignant ne voit que son école ; les parties sont vérifiées et limitées côté serveur ; l'inscription des enseignants se fait sur invitation ; les données d'élèves sont effacées après 13 mois.

## Hors périmètre

Les failles d'un navigateur ou d'un système obsolète, l'ingénierie sociale, et les services de l'hébergeur (GitHub Pages, Supabase) relèvent de leurs propres politiques.

## Pour les administrateurs de l'installation

- N'exposez jamais la clé « service role » de Supabase : seule la clé publique (« anon ») figure dans `src/server/config.ts`.
- Sauvegardez le schéma `private` avec le schéma `public` (il contient le secret qui protège les codes élèves) : voir `serveur/GUIDE-SERVEUR.md`, section « Sauvegardes ».
- Gardez les dépendances à jour (`npm audit`) et vérifiez le bandeau de l'espace administrateur après chaque mise à jour du serveur.
