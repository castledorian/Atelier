-- Mise à jour « Mémoire d'encre » : ajoute le record du 3e jeu au tableau de bord enseignant.
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger : elle remplace seulement la fonction du tableau de bord ; aucune donnée n'est touchée.
-- Si vous ne l'exécutez pas, le jeu fonctionne quand même ; seule la colonne « Record mémoire » reste vide.

create or replace function public.class_overview(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.classes%rowtype;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by lower(t.name)) from (
      select s.id, s.name, s.access_code,
             count(r.id) filter (where r.kind = 'game')  as games,
             count(r.id) filter (where r.kind = 'drill') as drills,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'typing') as best_typing,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'math')   as best_math,
             max(r.score) filter (where r.kind = 'game' and r.mode <> 'perso' and r.game = 'memory') as best_memory,
             round(avg(r.wpm) filter (where r.kind = 'game' and r.game = 'typing'), 1) as avg_wpm,
             round(avg(r.acc) filter (where r.kind = 'game' and r.game = 'typing'), 1) as avg_acc,
             coalesce(sum(r.duration), 0)::integer as seconds,
             (extract(epoch from max(r.played_at)) * 1000)::bigint as last_played
      from public.students s
      left join public.runs r on r.student_id = s.id
      where s.class_id = p_class
      group by s.id
    ) t), '[]'::jsonb);
end $$;

-- Le droit d'appel est conservé par « create or replace » ; on le réaffirme par précaution.
grant execute on function public.class_overview(uuid) to authenticated;
