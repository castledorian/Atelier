-- Mise à jour « sécurité des scores » — à exécuter UNE FOIS dans Supabase (SQL Editor), après les mises à jour précédentes.
-- Sans danger si exécutée plusieurs fois. Ajoute la vérification des parties côté serveur (voir GUIDE-SERVEUR.md).

-- ───────────────────────── Sécurité des scores ─────────────────────────
-- Le navigateur est entre les mains de l'élève : tout ce qu'il envoie peut être falsifié. La protection est donc ICI, sur le serveur :
-- chaque partie est vérifiée avec les règles réelles des jeux (cadence maximale humaine, points maximaux par réponse, durée),
-- puis le temps de jeu cumulé est contrôlé. Une partie impossible n'est PAS enregistrée et est notée dans private.cheat_log
-- (illisible depuis le navigateur, effacée après 90 jours). Les bornes sont volontairement larges : elles ne visent
-- que ce qu'aucun élève ne peut obtenir en jouant, jamais un excellent joueur.

create table if not exists private.cheat_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  student_id uuid,
  game       text,
  mode       text,
  reason     text not null,
  values_    jsonb
);
create index if not exists cheat_log_at_idx on private.cheat_log (at);

-- Renvoie la raison pour laquelle une partie est impossible, ou null si elle est plausible.
create or replace function private.run_violation(
  p_game text, p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer
) returns text
language plpgsql immutable as $$
declare
  s bigint  := coalesce(p_score, 0);
  w bigint  := coalesce(p_wave, 0);
  c bigint  := coalesce(p_correct, 0);
  d bigint  := coalesce(p_duration, 0);
  a numeric := coalesce(p_acc, 0);
  k numeric := coalesce(p_wpm, 0);
begin
  if s < 0 or w < 0 or c < 0 or d < 0 or k < 0 or a < 0 or a > 100 then return 'valeurs hors limites'; end if;
  if s > 0 and d < 1 then return 'score sans durée de jeu'; end if;
  if p_game = 'typing' then
    if k > 200 then return 'vitesse de frappe impossible'; end if;                       -- 200 mots/min = record du monde
    if c > 17 * d + 40 then return 'trop de lettres pour la durée'; end if;               -- 17 lettres/s ≈ 200 mots/min
    if w > d + 5 then return 'trop de vagues pour la durée'; end if;
    if s > 160 * c + 5000 * (w + 1) + 3000 then return 'score supérieur au maximum possible'; end if;  -- ×6 : 60 points/lettre, mots longs, Ratures
  elsif p_game = 'math' then
    if c > 4 * d + 3 then return 'réponses trop rapides'; end if;                         -- une réponse demande au moins 0,25 s
    if w > c then return 'série plus longue que le nombre de réponses'; end if;
    if s > 70 * c + 1500 then return 'score supérieur au maximum possible'; end if;       -- ×5 + 20 de vitesse, + pages parfaites et bonus final
  elsif p_game = 'memory' then
    if c > 30 or w > 30 then return 'plus de manches que le jeu n''en contient'; end if;
    if c > d / 0.5 + 2 then return 'manches trop rapides'; end if;
    if s > 60 * greatest(w, 1) * c + 1000 then return 'score supérieur au maximum possible'; end if;
  elsif p_game = 'spelling' then
    if c > 10 then return 'plus de phrases que le jeu n''en contient'; end if;
    if d < c then return 'phrases trop rapides'; end if;                                  -- lire, toucher et choisir prend au moins 1 s
    if w > c then return 'série plus longue que le nombre de phrases'; end if;
    if s > 25 * c then return 'score supérieur au maximum possible'; end if;              -- 5 + 10 + 10 de série au mieux
  else
    return 'jeu inconnu';
  end if;
  return null;
end $$;

-- Contrôle commun aux deux envois : forme de la partie, puis temps de jeu cumulé (au plus 2 h de jeu par heure : deux appareils).
-- Renvoie la raison du refus, ou null. Note le refus dans le journal.
create or replace function private.check_run(
  p_student uuid, p_game text, p_mode text, p_at timestamptz,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_why text := private.run_violation(p_game, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration);
begin
  if v_why is null and coalesce(p_duration, 0) +
       (select coalesce(sum(duration), 0) from public.runs where student_id = p_student and played_at > p_at - interval '1 hour' and played_at <= p_at + interval '1 hour')
       > 7200 then
    v_why := 'plus de temps de jeu que de temps écoulé';
  end if;
  if v_why is not null then
    delete from private.cheat_log where at < now() - interval '90 days';
    insert into private.cheat_log (student_id, game, mode, reason, values_)
    values (p_student, p_game, p_mode, v_why,
            jsonb_build_object('score', p_score, 'wave', p_wave, 'wpm', p_wpm, 'acc', p_acc, 'correct', p_correct, 'duration', p_duration));
  end if;
  return v_why;
end $$;

-- Les deux fonctions d'envoi, avec le contrôle ajouté
create or replace function public.submit_run(
  p_token text, p_client_id text, p_game text, p_mode text, p_kind text,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer,
  p_played_ms bigint default null, p_balance jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid uuid := private.student_from_token(p_token);
  v_s   public.students%rowtype;
  v_at  timestamptz := now();
  v_n   integer;
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' or p_game !~ '^[a-z0-9_-]{1,20}$' or p_mode !~ '^[a-z0-9_-]{1,20}$'
     or p_kind not in ('game', 'drill') then
    return jsonb_build_object('error', 'invalid_data');
  end if;
  if (select count(*) from public.runs where student_id = v_sid and played_at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into v_s from public.students where id = v_sid;
  if p_played_ms is not null then
    v_at := least(now(), greatest(now() - interval '30 days', to_timestamp(p_played_ms / 1000.0)));
  end if;
  -- partie déjà enregistrée (renvoi) : rien à vérifier ; sinon elle doit être humainement possible
  if not exists (select 1 from public.runs where student_id = v_sid and client_id = p_client_id)
     and private.check_run(v_sid, p_game, p_mode, v_at, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration) is not null then
    return jsonb_build_object('error', 'cheat');
  end if;
  insert into public.runs (client_id, student_id, class_id, school_id, game, mode, kind,
                           score, wave, wpm, acc, correct, duration, played_at)
  values (p_client_id, v_sid, v_s.class_id, v_s.school_id, p_game, p_mode, p_kind,
          least(10000000, greatest(0, coalesce(p_score, 0))),
          least(999, greatest(0, coalesce(p_wave, 0))),
          round(least(300, greatest(0, coalesce(p_wpm, 0))), 1),
          round(least(100, greatest(0, coalesce(p_acc, 0))), 1),
          least(100000, greatest(0, coalesce(p_correct, 0))),
          least(7200, greatest(0, coalesce(p_duration, 0))),
          v_at)
  on conflict (student_id, client_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_kind = 'game' and p_balance is not null then
    perform private.store_balance(p_balance, p_mode = 'perso');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.submit_session_run(
  p_token text, p_session uuid, p_client_id text,
  p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer,
  p_played_ms bigint default null, p_balance jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sid  uuid := private.student_from_token(p_token);
  v_s    public.students%rowtype;
  v_x    public.class_sessions%rowtype;
  v_used integer;
  v_at   timestamptz := now();
begin
  if v_sid is null then return jsonb_build_object('error', 'invalid_session'); end if;
  if p_client_id !~ '^[A-Za-z0-9_-]{6,40}$' then return jsonb_build_object('error', 'invalid_data'); end if;
  select * into v_s from public.students where id = v_sid for update;   -- deux envois simultanés ne dépassent pas le quota
  select * into v_x from public.class_sessions where id = p_session and class_id = v_s.class_id;
  if not found then return jsonb_build_object('error', 'unknown_session'); end if;
  if exists (select 1 from public.runs where student_id = v_sid and client_id = p_client_id) then
    return jsonb_build_object('ok', true);   -- même partie envoyée deux fois
  end if;
  if not v_x.active then return jsonb_build_object('error', 'session_closed'); end if;
  select count(*) into v_used from public.runs where student_id = v_sid and session_id = p_session;
  if v_used >= v_x.max_attempts then return jsonb_build_object('error', 'no_attempts_left'); end if;
  if p_played_ms is not null then
    v_at := least(now(), greatest(now() - interval '30 days', to_timestamp(p_played_ms / 1000.0)));
  end if;
  if private.check_run(v_sid, v_x.game, 'seance', v_at, p_score, p_wave, p_wpm, p_acc, p_correct, p_duration) is not null then
    return jsonb_build_object('error', 'cheat');
  end if;
  insert into public.runs (client_id, student_id, class_id, school_id, game, mode, kind, session_id,
                           score, wave, wpm, acc, correct, duration, played_at)
  values (p_client_id, v_sid, v_s.class_id, v_s.school_id, v_x.game, 'seance', 'game', p_session,
          least(10000000, greatest(0, coalesce(p_score, 0))),
          least(999, greatest(0, coalesce(p_wave, 0))),
          round(least(300, greatest(0, coalesce(p_wpm, 0))), 1),
          round(least(100, greatest(0, coalesce(p_acc, 0))), 1),
          least(100000, greatest(0, coalesce(p_correct, 0))),
          least(7200, greatest(0, coalesce(p_duration, 0))),
          v_at);
  return jsonb_build_object('ok', true, 'attempts_used', v_used + 1, 'max_attempts', v_x.max_attempts);
end $$;
