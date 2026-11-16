-- Mise à jour « Classement masquable et objectif collectif de classe ».
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger pour les données : elle ajoute une colonne et une fonction, et remplace class_leaderboard.
--
-- 1. L'enseignant peut masquer les classements de sa classe (case dans l'onglet de la classe).
-- 2. Les élèves voient un objectif collectif : le nombre de parties jouées par la classe cette semaine.

alter table public.classes add column if not exists hide_board boolean not null default false;

grant update (hide_board) on public.classes to authenticated;

create or replace function public.class_leaderboard(
  p_token text, p_game text, p_mode text, p_scope text default 'class', p_limit integer default 10
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select * into v_s from public.students where id = v_sid;
  -- l'enseignant peut masquer les classements de sa classe
  if (select c.hide_board from public.classes c where c.id = v_s.class_id) then
    return jsonb_build_object('ok', true, 'hidden', true, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.rank) from (
      select row_number() over (order by b.score desc, b.played_at asc) as rank,
             st.name, b.score, b.wave, b.wpm, b.acc, (b.student_id = v_sid) as is_me
      from (
        select distinct on (r.student_id) r.*
        from public.runs r
        where r.game = p_game and r.mode = p_mode and r.mode <> 'perso' and r.session_id is null and r.kind = 'game'
          and ((p_scope = 'school' and r.school_id = v_s.school_id)
            or (p_scope <> 'school' and r.class_id = v_s.class_id))
        order by r.student_id, r.score desc, r.played_at asc
      ) b
      join public.students st on st.id = b.student_id
      order by 1
      limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) t), '[]'::jsonb));
end $$;

-- Objectif collectif : parties jouées par la classe depuis 7 jours (aucun nom, aucun classement individuel).
create or replace function public.class_week(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_c   uuid;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  select class_id into v_c from public.students where id = v_sid;
  return jsonb_build_object('ok', true,
    'games', (select count(*) from public.runs r
              where r.class_id = v_c and r.kind = 'game' and r.played_at > now() - interval '7 days'),
    'players', (select count(distinct r.student_id) from public.runs r
                where r.class_id = v_c and r.kind = 'game' and r.played_at > now() - interval '7 days'));
end $$;

grant execute on function public.class_week(text) to anon, authenticated;
