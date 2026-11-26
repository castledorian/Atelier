-- Mise à jour « Chasse aux fautes » : autorise le 4e jeu (orthographe) dans les séances de classe.
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run (projet déjà installé avec schema.sql).
-- Sans danger : aucune donnée n'est touchée ; on élargit seulement la liste des jeux acceptés.
-- Si vous ne l'exécutez pas, le jeu fonctionne quand même en jeu libre ; seules les séances de classe « Chasse aux fautes » sont refusées.

alter table public.class_sessions drop constraint if exists class_sessions_game_check;
alter table public.class_sessions add constraint class_sessions_game_check
  check (game in ('typing', 'math', 'memory', 'spelling', 'lexique', 'facteur'));

alter table public.balance_runs drop constraint if exists balance_runs_game_check;
alter table public.balance_runs add constraint balance_runs_game_check
  check (game in ('typing', 'math', 'memory', 'spelling', 'lexique', 'facteur'));

create or replace function public.save_class_session(
  p_class uuid, p_id uuid, p_title text, p_game text, p_config jsonb, p_max integer, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_c  public.classes%rowtype;
  v_t  text := private.clean_name(p_title);
  v_id uuid;
begin
  select * into v_c from public.classes where id = p_class;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.assert_member(v_c.school_id);
  if char_length(v_t) not between 1 and 60 or p_game not in ('typing', 'math', 'memory', 'spelling')
     or p_max not between 1 and 3 or p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_id is null then
    if (select count(*) from public.class_sessions where class_id = p_class) >= 30 then
      raise exception 'too_many_sessions' using errcode = '54000';
    end if;
    insert into public.class_sessions (class_id, school_id, title, game, config, max_attempts, active)
    values (p_class, v_c.school_id, v_t, p_game, p_config, p_max, coalesce(p_active, true)) returning id into v_id;
  else
    -- le jeu d'une séance déjà jouée ne change plus : les résultats resteraient incomparables
    update public.class_sessions
       set title = v_t, config = p_config, max_attempts = p_max, active = coalesce(p_active, active),
           game = case when exists (select 1 from public.runs where session_id = p_id) then game else p_game end
     where id = p_id and class_id = p_class returning id into v_id;
    if v_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

grant execute on function public.save_class_session(uuid, uuid, text, text, jsonb, integer, boolean) to authenticated;
