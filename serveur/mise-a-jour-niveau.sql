-- Mise à jour « niveau de la classe » : l'enseignant fixe le niveau (CP, CE1, CE2, CM1, CM2) de sa classe.
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger : aucune donnée n'est modifiée ; on ajoute une colonne (vide au départ) et on complète une fonction.
-- Tant qu'elle n'est pas lancée, le site fonctionne : le choix du niveau n'apparaît pas côté enseignant,
-- et chaque élève choisit sa classe lui-même sur l'accueil.

alter table public.classes add column if not exists grade text;
alter table public.classes drop constraint if exists classes_grade_check;
alter table public.classes add constraint classes_grade_check
  check (grade is null or grade in ('cp', 'ce1', 'ce2', 'cm1', 'cm2'));
grant update (grade) on public.classes to authenticated;

create or replace function public.my_sessions(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'grade', (select c.grade from public.classes c where c.id = v_s.class_id),
    'sessions', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created desc) from (
      select x.id, x.title, x.game, x.config, x.max_attempts, x.active,
             (select count(*) from public.runs r where r.session_id = x.id and r.student_id = v_sid)::integer as attempts_used,
             (select max(r.score) from public.runs r where r.session_id = x.id and r.student_id = v_sid) as best_score,
             (extract(epoch from x.created_at) * 1000)::bigint as created
      from public.class_sessions x
      where x.class_id = v_s.class_id
    ) t), '[]'::jsonb));
end $$;

grant execute on function public.my_sessions(text) to anon, authenticated;

-- Résumés anonymes d'équilibrage : accepter aussi les niveaux du cycle 2 (CP, CE1, CE2).
alter table public.balance_runs drop constraint if exists balance_runs_level_check;
alter table public.balance_runs add constraint balance_runs_level_check
  check (level is null or level in ('cp', 'ce1', 'ce2', 'cm1', 'cm2'));
