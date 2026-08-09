-- =====================================================================
-- Quiz Famille · sql/04-correctif-ambiguite.sql
--
-- Corrige « column reference "id" is ambiguous ».
--
-- Cause : dans une fonction « returns table (id uuid, prenom text, ...) »,
-- les noms de colonnes de sortie deviennent des variables. Toute
-- référence non qualifiée à une colonne du même nom devient ambiguë.
--
-- Deux parades :
--   · PL/pgSQL  -> #variable_conflict use_column
--   · SQL pur   -> alias de table sur chaque colonne
-- =====================================================================

create or replace function public.creer_profil(
  p_prenom text, p_naissance date,
  p_avatar text default null, p_couleur text default '#D8A94B')
returns table (id uuid, prenom text, naissance date, avatar text,
               couleur text, age int, handicap text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'non_connecte'; end if;
  insert into profils (id, prenom, naissance, avatar, couleur)
  values (v_id, trim(p_prenom), p_naissance, p_avatar, coalesce(p_couleur,'#D8A94B'))
  on conflict (id) do update
    set prenom    = excluded.prenom,
        naissance = excluded.naissance,
        avatar    = coalesce(excluded.avatar, profils.avatar),
        couleur   = excluded.couleur;
  return query select * from mon_profil();
end $$;

create or replace function public.maj_profil(
  p_prenom text default null, p_naissance date default null,
  p_avatar text default null, p_couleur text default null)
returns table (id uuid, prenom text, naissance date, avatar text,
               couleur text, age int, handicap text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
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

-- Les trois suivantes n'ont pas encore échoué faute de données, mais
-- elles portent exactement le même défaut : colonnes non qualifiées
-- portant le nom d'une colonne de sortie.

create or replace function public.stats_categories(p_profil uuid)
returns table (categorie text, posees bigint, bonnes bigint,
               reussite numeric, points bigint, ms_median int)
language sql security definer set search_path = public as $$
  select r.categorie,
         count(*),
         count(*) filter (where r.juste),
         round(100.0 * count(*) filter (where r.juste) / greatest(count(*),1), 0),
         coalesce(sum(r.points),0),
         percentile_cont(0.5) within group (order by r.ms)::int
  from reponses r
  where r.profil = p_profil and r.categorie is not null
  group by r.categorie
  order by count(*) desc;
$$;

create or replace function public.stats_difficulte(p_profil uuid)
returns table (difficulte int, posees bigint, bonnes bigint, reussite numeric)
language sql security definer set search_path = public as $$
  select r.difficulte,
         count(*),
         count(*) filter (where r.juste),
         round(100.0 * count(*) filter (where r.juste) / greatest(count(*),1), 0)
  from reponses r
  where r.profil = p_profil and r.difficulte is not null
  group by r.difficulte
  order by r.difficulte;
$$;

create or replace function public.qualite_questions(p_minimum int default 5)
returns table (question text, categorie text, difficulte int,
               posees bigint, reussite numeric)
language sql security definer set search_path = public as $$
  select r.question, min(r.categorie), min(r.difficulte), count(*),
         round(100.0 * count(*) filter (where r.juste) / count(*), 0)
  from reponses r
  group by r.question
  having count(*) >= p_minimum
  order by 5 asc;
$$;

grant execute on function public.creer_profil, public.maj_profil,
                          public.stats_categories, public.stats_difficulte
to authenticated;
grant execute on function public.qualite_questions(int) to anon, authenticated;
