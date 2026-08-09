-- =====================================================================
-- Quiz Famille · sql/03-auth-et-classement.sql
--
-- L'identité vient de Supabase Auth (email + mot de passe). L'email vit
-- dans auth.users et n'est JAMAIS recopié ici : aucune donnée du jeu ne
-- contient d'adresse. Les joueurs se voient par leur prénom.
--
-- Toutes les tables ont RLS activé SANS AUCUNE POLICY. Autrement dit,
-- personne ne lit ni n'écrit en direct : tout passe par les fonctions
-- SECURITY DEFINER ci-dessous, qui vérifient auth.uid() elles-mêmes.
-- Une table sans policy renvoie [] et non une erreur — c'est voulu.
-- =====================================================================

-- ---------------------------------------------------------------- tables

create table if not exists public.profils (
  id        uuid primary key references auth.users(id) on delete cascade,
  prenom    text not null check (char_length(prenom) between 1 and 24),
  naissance date not null check (naissance > '1900-01-01' and naissance <= current_date),
  avatar    text,
  couleur   text not null default '#D8A94B',
  cree_le   timestamptz not null default now()
);

create table if not exists public.parties (
  id       bigint generated always as identity primary key,
  mode     text not null,
  salon    text,
  jouee_le timestamptz not null default now(),
  cree_par uuid references public.profils(id) on delete set null
);

create table if not exists public.resultats (
  id        bigint generated always as identity primary key,
  partie    bigint not null references public.parties(id) on delete cascade,
  profil    uuid references public.profils(id) on delete cascade,
  prenom    text not null,          -- figé : le prénom du jour de la partie
  age_alors int,                    -- figé : l'âge du jour de la partie
  score     int  not null default 0,
  bonnes    int  not null default 0,
  posees    int  not null default 0,
  rang      int
);

create table if not exists public.reponses (
  id         bigint generated always as identity primary key,
  partie     bigint not null references public.parties(id) on delete cascade,
  profil     uuid references public.profils(id) on delete cascade,
  question   text not null,         -- l'id de la question, ex. nat-0007
  categorie  text,
  difficulte int,
  juste      boolean,
  ms         int,
  points     int
);

create index if not exists resultats_profil_idx on public.resultats(profil);
create index if not exists reponses_profil_idx  on public.reponses(profil);
create index if not exists parties_date_idx     on public.parties(jouee_le desc);

alter table public.profils   enable row level security;
alter table public.parties   enable row level security;
alter table public.resultats enable row level security;
alter table public.reponses  enable row level security;

-- ------------------------------------------------------------- utilitaires

create or replace function public.age_le(p_naissance date, p_le date default current_date)
returns int language sql immutable as $$
  select extract(year from age(p_le, p_naissance))::int;
$$;

create or replace function public.handicap_pour(p_age int)
returns text language sql immutable as $$
  select case when p_age <= 7 then 'enfant'
              when p_age <= 10 then 'decouverte'
              else 'normal' end;
$$;

-- ------------------------------------------------------------- mon profil

create or replace function public.mon_profil()
returns table (id uuid, prenom text, naissance date, avatar text,
               couleur text, age int, handicap text)
language sql security definer set search_path = public as $$
  select p.id, p.prenom, p.naissance, p.avatar, p.couleur,
         age_le(p.naissance), handicap_pour(age_le(p.naissance))
  from profils p where p.id = auth.uid();
$$;

create or replace function public.creer_profil(
  p_prenom text, p_naissance date,
  p_avatar text default null, p_couleur text default '#D8A94B')
returns table (id uuid, prenom text, naissance date, avatar text,
               couleur text, age int, handicap text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'non_connecte'; end if;
  insert into profils (id, prenom, naissance, avatar, couleur)
  values (v_id, trim(p_prenom), p_naissance, p_avatar, coalesce(p_couleur,'#D8A94B'))
  on conflict (id) do update
    set prenom = excluded.prenom, naissance = excluded.naissance,
        avatar = coalesce(excluded.avatar, profils.avatar),
        couleur = excluded.couleur;
  return query select * from mon_profil();
end $$;

create or replace function public.maj_profil(
  p_prenom text default null, p_naissance date default null,
  p_avatar text default null, p_couleur text default null)
returns table (id uuid, prenom text, naissance date, avatar text,
               couleur text, age int, handicap text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'non_connecte'; end if;
  update profils set
    prenom    = coalesce(nullif(trim(p_prenom),''), prenom),
    naissance = coalesce(p_naissance, naissance),
    avatar    = coalesce(p_avatar, avatar),
    couleur   = coalesce(p_couleur, couleur)
  where id = v_id;
  if not found then raise exception 'profil_inconnu'; end if;
  return query select * from mon_profil();
end $$;

-- --------------------------------------------------- écriture d'une partie
-- p_lignes   : [{"profil":"uuid|null","prenom":"Chris","age":41,
--                "score":120,"bonnes":8,"posees":10,"rang":1}, ...]
-- p_reponses : [{"profil":"uuid","question":"nat-0007","categorie":"...",
--                "difficulte":3,"juste":true,"ms":2400,"points":39}, ...]

create or replace function public.enregistrer_partie(
  p_mode text, p_salon text default null,
  p_lignes jsonb default '[]'::jsonb, p_reponses jsonb default '[]'::jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_partie bigint;
begin
  insert into parties (mode, salon, cree_par)
  values (p_mode, p_salon, auth.uid())
  returning id into v_partie;

  insert into resultats (partie, profil, prenom, age_alors, score, bonnes, posees, rang)
  select v_partie,
         nullif(l->>'profil','')::uuid,
         coalesce(l->>'prenom','?'),
         (l->>'age')::int,
         coalesce((l->>'score')::int, 0),
         coalesce((l->>'bonnes')::int, 0),
         coalesce((l->>'posees')::int, 0),
         (l->>'rang')::int
  from jsonb_array_elements(p_lignes) l;

  insert into reponses (partie, profil, question, categorie, difficulte, juste, ms, points)
  select v_partie,
         nullif(r->>'profil','')::uuid,
         r->>'question', r->>'categorie',
         (r->>'difficulte')::int, (r->>'juste')::boolean,
         (r->>'ms')::int, (r->>'points')::int
  from jsonb_array_elements(p_reponses) r;

  return v_partie;
end $$;

-- ------------------------------------------------------------ statistiques
-- Publiques entre joueurs : on peut regarder les stats d'un copain.
-- Rien d'identifiant n'y transite, jamais d'email.

create or replace function public.stats_global(p_profil uuid)
returns table (parties bigint, posees bigint, bonnes bigint,
               points bigint, indice numeric, reussite numeric, ms_median int)
language sql security definer set search_path = public as $$
  with r as (select * from resultats where profil = p_profil),
       q as (select * from reponses  where profil = p_profil)
  select count(distinct r.partie),
         coalesce(sum(r.posees),0), coalesce(sum(r.bonnes),0),
         coalesce(sum(r.score),0),
         round(coalesce(sum(r.score),0)::numeric / greatest(sum(r.posees),1), 1),
         round(100.0 * coalesce(sum(r.bonnes),0) / greatest(sum(r.posees),1), 0),
         (select percentile_cont(0.5) within group (order by ms)::int
          from q where ms is not null)
  from r;
$$;

create or replace function public.stats_categories(p_profil uuid)
returns table (categorie text, posees bigint, bonnes bigint,
               reussite numeric, points bigint, ms_median int)
language sql security definer set search_path = public as $$
  select categorie, count(*), count(*) filter (where juste),
         round(100.0 * count(*) filter (where juste) / greatest(count(*),1), 0),
         coalesce(sum(points),0),
         percentile_cont(0.5) within group (order by ms)::int
  from reponses where profil = p_profil and categorie is not null
  group by categorie order by count(*) desc;
$$;

create or replace function public.stats_difficulte(p_profil uuid)
returns table (difficulte int, posees bigint, bonnes bigint, reussite numeric)
language sql security definer set search_path = public as $$
  select difficulte, count(*), count(*) filter (where juste),
         round(100.0 * count(*) filter (where juste) / greatest(count(*),1), 0)
  from reponses where profil = p_profil and difficulte is not null
  group by difficulte order by difficulte;
$$;

create or replace function public.stats_periode(p_profil uuid, p_grain text default 'week')
returns table (debut date, posees bigint, bonnes bigint, indice numeric)
language sql security definer set search_path = public as $$
  select date_trunc(case when p_grain in ('day','week','month') then p_grain else 'week' end,
                    p.jouee_le)::date,
         count(*), count(*) filter (where q.juste),
         round(coalesce(sum(q.points),0)::numeric / greatest(count(*),1), 1)
  from reponses q join parties p on p.id = q.partie
  where q.profil = p_profil
  group by 1 order by 1;
$$;

-- -------------------------------------------------------------- classement
-- Ouvert à tous, y compris hors connexion : c'est le tableau d'honneur.
-- Indice = points par question posée. Plancher de 20 questions.

create or replace function public.classement(
  p_jours int default 90, p_minimum int default 20)
returns table (profil uuid, prenom text, avatar text, couleur text,
               parties bigint, posees bigint, bonnes bigint,
               points bigint, indice numeric, reussite numeric)
language sql security definer set search_path = public as $$
  select pr.id, pr.prenom, pr.avatar, pr.couleur,
         count(distinct r.partie),
         sum(r.posees), sum(r.bonnes), sum(r.score),
         round(sum(r.score)::numeric / greatest(sum(r.posees),1), 1),
         round(100.0 * sum(r.bonnes) / greatest(sum(r.posees),1), 0)
  from resultats r
  join parties  p  on p.id = r.partie
  join profils  pr on pr.id = r.profil
  where p.jouee_le > now() - make_interval(days => greatest(p_jours,1))
  group by pr.id, pr.prenom, pr.avatar, pr.couleur
  having sum(r.posees) >= p_minimum
  order by 9 desc;
$$;

-- --------------------------------------------------- questions douteuses
-- Un taux de réussite au ras du sol sur un gros volume = question fausse,
-- mal formulée, ou mal calibrée. Utile pour la montée à 100 questions.

create or replace function public.qualite_questions(p_minimum int default 5)
returns table (question text, categorie text, difficulte int,
               posees bigint, reussite numeric)
language sql security definer set search_path = public as $$
  select question, min(categorie), min(difficulte), count(*),
         round(100.0 * count(*) filter (where juste) / count(*), 0)
  from reponses group by question
  having count(*) >= p_minimum
  order by 5 asc;
$$;

-- ------------------------------------------------------------------ droits

grant execute on function
  public.mon_profil, public.creer_profil, public.maj_profil,
  public.enregistrer_partie, public.stats_global, public.stats_categories,
  public.stats_difficulte, public.stats_periode
to authenticated;

grant execute on function
  public.classement(int,int), public.qualite_questions(int),
  public.age_le(date,date), public.handicap_pour(int)
to anon, authenticated;
