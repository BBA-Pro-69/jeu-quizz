# Quiz Famille

Un jeu de société de type Trivial Pursuit, revisité en **application web statique**.
Pas de serveur, pas de build, pas d'installation : des fichiers ouvrables en double-clic
et servables tels quels par GitHub Pages.

**Sa particularité :** le jeu s'adapte à l'âge de chaque joueur, pour qu'un enfant de
7 ans et son grand-père puissent jouer la même partie sans que l'un s'ennuie ni que
l'autre s'écrase.

---

## État du projet

| | |
|---|---|
| Bibliothèques de questions | ✅ 11 catégories, 218 questions |
| Liaison backend (banc de test) | ✅ `tools/test-backend.html` |
| Écran de configuration | 🔜 |
| Moteur de pioche | 🔜 |
| Modes de jeu | 🔜 |
| Base de données Supabase | 🔜 |

## Arborescence

```
data/
  categories.json          Index : catégories, types, difficultés, handicaps
  questions/*.json         Une bibliothèque par catégorie
js/
  drawer.js                Moteur de pioche anti-répétition        (à venir)
  engine.js                Moteur de partie : tours, scores        (à venir)
  transport.js             Couche réseau isolée                    (à venir)
  modes/                   Un fichier par mode de jeu              (à venir)
tools/
  test-backend.html        Banc de test de la liaison front ↔ Supabase
docs/
  AGENT-PROMPT.md          Instructions de l'agent du projet
  design-reference-*.html  Référence de charte graphique
assets/                    Images, icônes
.github/workflows/         Automatisations (anti-mise-en-veille Supabase)
```

## Les catégories

| Catégorie | Questions | Âge min | Particularité |
|---|---|---|---|
| Nature & Animaux | 18 | 4 | |
| Insolite & Records | 20 | 6 | 8 estimations : tous les âges à égalité |
| Défis & Mimes | 20 | 4 | Aucune connaissance requise |
| Jeux vidéo, BD & Manga | 20 | 5 | La revanche des enfants |
| Cinéma & Séries | 20 | 5 | |
| Musique & Chansons | 20 | 5 | |
| Géo & Voyages | 20 | 6 | |
| Histoire | 20 | 9 | |
| Sciences & Corps humain | 20 | 6 | |
| Sport | 20 | 6 | |
| Bouffe & Boissons | 20 | 5 | |

Objectif à terme : **100 questions par catégorie**.
« Entre nous » (questions personnalisées sur les joueurs) est prévue en extension.

## Format d'une question

```json
{
  "id": "nat-0007",
  "type": "estimation",
  "difficulty": 2,
  "minAge": 6,
  "q": "Quelle est la vitesse de pointe du guépard, en km/h ?",
  "answer": 115,
  "unit": "km/h",
  "tol": { "pct": 12 },
  "fun": "Il ne la tient que 20 à 30 secondes, sinon il risque l'hyperthermie.",
  "tags": ["records"]
}
```

Types : `qcm` · `libre` · `vraifaux` · `estimation` · `defi`.
Le contrat complet des champs est décrit dans `docs/AGENT-PROMPT.md`, section 4.

⚠️ **Un `id` ne doit jamais être réaffecté** : l'historique anti-répétition en dépend.

## L'équité entre les âges

Chaque question porte un `minAge` **et** une `difficulty`, indépendants : une question
peut être accessible à 8 ans tout en étant difficile.

Chaque joueur reçoit en plus un **niveau de handicap** qui élargit la tolérance sur les
estimations :

```
écart accepté = réponse × (tol.pct + handicap.pct) / 100
```

Sur le guépard, l'Expert doit répondre entre 101 et 129 km/h, l'Enfant entre 49 et 181.
Même question pour tout le monde, vraie chance pour chacun.
Les niveaux sont définis dans `data/categories.json`.

## Backend (optionnel)

Le jeu **fonctionne sans backend** : les scores et l'historique anti-répétition vivent
dans le `localStorage`. Supabase n'ajoute que la persistance entre appareils et les
statistiques.

Mise en route : ouvre `tools/test-backend.html`, colle l'URL du projet et la clé `anon`,
puis suis les trois étapes. Le journal HTTP affiche chaque requête en clair.

```sql
create table public.scores (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  joueur      text not null,
  mode        text,
  score       int  not null default 0,
  bonnes      int  not null default 0,
  posees      int  not null default 0
);

alter table public.scores enable row level security;
create policy "lecture publique"  on public.scores for select using (true);
create policy "ecriture publique" on public.scores for insert with check (true);
```

**Deux pièges connus :**
1. Sans policy RLS, Supabase renvoie une liste vide **sans message d'erreur**. C'est
   l'erreur numéro un.
2. Un projet gratuit est mis en pause après ~7 jours d'inactivité. Le workflow
   `.github/workflows/keep-supabase-awake.yml` le réveille chaque lundi — il faut
   renseigner les deux secrets du dépôt indiqués en tête de fichier.

La clé `anon` est **faite pour être publique**, c'est le RLS qui protège les données.
La clé `service_role`, en revanche, ne doit **jamais** approcher ce dépôt.

## Mise en ligne

Settings → Pages → Source : `main`, dossier `/`.
Le site est publié sur `https://<compte>.github.io/<dépôt>/`.

⚠️ GitHub Pages sert depuis un sous-chemin : **toujours des chemins relatifs**
(`data/questions/geek.json`), jamais de chemin absolu (`/data/...`).

## Contribuer une question

1. Choisir le fichier de la catégorie.
2. Reprendre la numérotation là où elle s'arrête, sans jamais recommencer à `0001`.
3. Vérifier le fait sur **deux sources indépendantes**. Si elles divergent, changer de
   question.
4. Ajouter une anecdote `fun` : courte, vraie, surprenante.
5. Valider le JSON avant de committer.

---

*Projet personnel. Aucun lien avec une charte d'entreprise : le jeu a sa propre identité
visuelle, décrite dans `docs/AGENT-PROMPT.md` section 5.*
