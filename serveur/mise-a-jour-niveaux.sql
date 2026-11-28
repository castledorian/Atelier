-- Mise à jour « classes mixtes » (version 1.35) — à exécuter dans Supabase (SQL Editor → New query → Run).
-- Sans danger si exécutée plusieurs fois ; aucune donnée existante n'est perdue. À lancer APRÈS « fiche élève ».
--
-- Une classe peut avoir plusieurs niveaux (ex. CM1 et CM2). L'enseignant les coche dans les réglages de la classe ;
-- chaque élève choisit le sien parmi ceux-là. La colonne « grade » garde le niveau le plus bas (valeur par défaut) :
-- tout ce qui la lit continue de marcher. Les classes qui avaient un niveau passent à une liste d'un seul niveau.

alter table public.classes add column if not exists grades text[];
alter table public.classes drop constraint if exists classes_grades_check;
alter table public.classes add constraint classes_grades_check
  check (grades is null or grades <@ array['cp', 'ce1', 'ce2', 'cm1', 'cm2']::text[]);
grant update (grades) on public.classes to authenticated;
update public.classes set grades = array[grade] where grade is not null and grades is null;

create or replace function public.my_sessions(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token_ro(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'grade', (select c.grade from public.classes c where c.id = v_s.class_id),
    'grades', (select c.grades from public.classes c where c.id = v_s.class_id),
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

revoke all on function public.my_sessions(text) from public;
grant execute on function public.my_sessions(text) to anon, authenticated;
