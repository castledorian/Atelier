# Atelier — jeux pour apprendre

Site de petits jeux éducatifs pour l'école primaire (CP → CM2), gratuit, **sans publicité, sans cookie et sans traceur**. Les élèves jouent seuls (scores gardés sur l'appareil) ou avec le code que leur donne leur enseignant (séances, classements de classe).

> Site indépendant : il n'est ni édité, ni validé, ni labellisé par le ministère de l'Éducation nationale. Il s'appuie sur les programmes des cycles 2 et 3.

## Les jeux

| Jeu | Domaine | Classes | Principe |
|---|---|---|---|
| **Frappe !** | Clavier | CE1 → CM2 | Taper les mots avant qu'ils n'atteignent la marge |
| **Course à l'encre** | Calcul mental | CP → CM2 | Viser la bonne réponse avant que l'encre ne rattrape la plume |
| **Chasse aux fautes** | Orthographe | CE1 → CM2 | Repérer puis corriger la faute dans une phrase |
| **Mémoire d'encre** | Mémoire | CP → CM2 | Retenir une suite (La Suite) ou des places (Les Cases) |

Chaque jeu propose trois difficultés (**Apprenti**, **Standard**, **Expert**) réglées pour chaque classe. La difficulté dépend du temps, jamais de la taille de l'écran. Seuls les jeux adaptés à la classe choisie s'affichent.

## Fonctionnement

- **Espace enseignant** : école, classes, élèves (codes de connexion), séances à essais limités, niveau de classe, résultats, export CSV.
- **Espace élève** : connexion par code, séances à faire, scores et classements (masquables).
- **Espace administrateur** : vue d'ensemble en lecture seule, chaque consultation est journalisée.
- **Hors connexion** : le site s'installe comme une application ; les parties jouées sans réseau sont gardées puis envoyées au retour du réseau, sans doublon (même `client_id`).

Guides : [`enseignant/GUIDE-ENSEIGNANT.md`](enseignant/GUIDE-ENSEIGNANT.md) (pour les enseignants), [`serveur/GUIDE-SERVEUR.md`](serveur/GUIDE-SERVEUR.md) (mise en place du serveur, mises à jour SQL, publication des nouveautés).

## Technique

React 19, TypeScript, Vite 7, Tailwind CSS 4 (+ feuille de style « cahier » dans `src/index.css`). Le site est assemblé en **un seul fichier** (`vite-plugin-singlefile`), publié par GitHub Pages. Les scripts sont autorisés par empreinte dans une politique de sécurité du contenu (CSP) ajoutée à la construction ; la page ne peut contacter que son propre serveur.

```
src/
  Shell.tsx            navigation entre accueil, connexion, espaces et jeux
  App.tsx              Frappe !
  games/               Course à l'encre, Mémoire d'encre, Chasse aux fautes
  game/                moteurs et réglages (difficultés, classes, scores, sons, séances)
  pages/               accueil, connexion, espaces enseignant / administrateur, pages d'information
  content/             Nouveautés (changelog), crédits, présentation des jeux
  server/              appels au serveur (RPC), file d'envoi hors ligne
  legal.ts             éditeur, contact, hébergement affichés dans les pages légales
serveur/               schema.sql + mises à jour SQL, guide, tests SQL
enseignant/            guide de l'enseignant
tests/                 tests automatiques (node:test)
public/                icônes, manifeste, service worker (sw.js)
```

**Serveur** : Supabase (Postgres). Aucune table n'est accessible directement : le site appelle des fonctions `security definer` (connexion, envoi de partie, classements, administration) protégées par RLS. Chaque partie est revérifiée côté serveur ; les codes d'élèves ne sont jamais renvoyés. Détails dans `serveur/GUIDE-SERVEUR.md`.

## Développer

Prérequis : Node.js 22.

```bash
npm ci
npm run dev      # serveur de développement
npm run check    # vérification TypeScript + tests automatiques
npm run build    # site complet dans dist/
```

À chaque publication (la CI refait `tsc`, les tests et le build) :

1. Ajouter une entrée en tête de `src/content/changelog.ts` (numéro de version affiché en bas des pages).
2. Incrémenter le cache dans `public/sw.js` (`atelier-vNN`).
3. `npm run check`, `npm run build`, puis pousser sur `main`.

## Confidentialité

Pas de publicité, de cookie ni de statistique d'audience. Sans connexion, rien ne quitte l'appareil. Avec un code d'élève : prénom ou pseudo, classe et résultats uniquement, supprimables par l'enseignant. Voir la page *Confidentialité* du site et `src/legal.ts`.

## Licence

© 2026 Dorian Peglion — tous droits réservés pour les textes, illustrations et le code propres à Atelier. Les bibliothèques et polices utilisées restent sous leurs licences d'origine (voir la page *Crédits et licences* du site).
