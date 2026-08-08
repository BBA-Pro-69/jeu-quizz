-- ============================================================
-- Quiz Famille · 01 · table de test de la liaison front <-> back
-- Exécuté le 08/08/2026 sur le projet quiz-famille. Validé.
-- Correspond aux champs envoyés par tools/test-backend.html
-- ============================================================

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  joueur      text        not null,
  mode        text,
  score       int         not null default 0,
  bonnes      int         not null default 0,
  posees      int         not null default 0
);

create index if not exists scores_created_at_idx on public.scores (created_at desc);

alter table public.scores enable row level security;

create policy "scores_select_anon"
  on public.scores for select
  to anon
  using (true);

create policy "scores_insert_anon"
  on public.scores for insert
  to anon
  with check (
    length(joueur) between 1 and 40
    and score  between -1000 and 100000
    and bonnes >= 0
    and posees >= 0
    and bonnes <= posees
  );

-- Volontairement : aucune policy update, aucune policy delete.
-- Sans policy, l'action est refusée : personne ne peut modifier
-- ni effacer une ligne avec la clé publiable.
