-- Mise à jour « administrateur du site » — à exécuter UNE FOIS dans Supabase (SQL Editor). Sans danger si répétée.
-- Ajoute un espace réservé au propriétaire du site : voir toutes les écoles, classes, élèves, parties, inscriptions
-- et le journal des parties refusées. Voir serveur/GUIDE-SERVEUR.md, section « Espace administrateur ».
--
-- Garde-fous (RGPD) :
--  • seuls les comptes listés dans public.site_admins peuvent l'utiliser (aucun compte enseignant n'y a accès) ;
--  • les CODES D'ACCÈS des élèves ne sont jamais renvoyés, même à l'administrateur ;
--  • chaque consultation est notée dans private.admin_audit (qui, quand, quoi), effacée après 1 an ;
--  • tout est en lecture seule : l'administrateur ne peut rien modifier ni supprimer par cet espace.

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.site_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;   -- aucune politique : illisible depuis le navigateur
revoke all on public.site_admins from anon, authenticated;

create table if not exists private.admin_audit (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  admin_id uuid,
  action   text not null,
  target   text
);
create index if not exists admin_audit_at_idx on private.admin_audit (at);
alter table private.admin_audit enable row level security;

-- ───────────────────────── Contrôle d'accès ─────────────────────────

create or replace function private.assert_site_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.site_admins where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- « Suis-je administrateur ? » : sert uniquement à afficher le bouton. Ne lève jamais d'erreur.
create or replace function public.admin_check() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid())
$$;

-- ───────────────────────── Vue d'ensemble ─────────────────────────

create or replace function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action) values (auth.uid(), 'overview');
  delete from private.admin_audit where at < now() - interval '1 year';
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'schools',            (select count(*) from public.schools),
      'teachers',           (select count(distinct user_id) from public.school_members),
      'classes',            (select count(*) from public.classes),
      'students',           (select count(*) from public.students),
      'runs',               (select count(*) from public.runs),
      'runs_7d',            (select count(*) from public.runs where played_at > now() - interval '7 days'),
      'active_students_7d', (select count(distinct student_id) from public.runs where played_at > now() - interval '7 days'),
      'flags_7d',           (select count(*) from private.cheat_log where at > now() - interval '7 days'),
      'signups_7d',         (select count(*) from auth.users where created_at > now() - interval '7 days')
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'runs', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d
      left join (select played_at::date as day, count(*) as n from public.runs where played_at >= current_date - 13 group by 1) c
        on c.day = d::date
    ),
    'games', (
      select coalesce(jsonb_agg(jsonb_build_object('game', game, 'runs', n) order by n desc), '[]'::jsonb)
      from (select game, count(*) as n from public.runs group by game) g
    ),
    'schools', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.last_run desc nulls last, t.created desc), '[]'::jsonb)
      from (
        select s.id, s.name,
               (extract(epoch from s.created_at) * 1000)::bigint as created,
               (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb)
                  from public.school_members m join auth.users u on u.id = m.user_id where m.school_id = s.id) as teachers,
               (select count(*) from public.classes c where c.school_id = s.id)  as classes,
               (select count(*) from public.students st where st.school_id = s.id) as students,
               (select count(*) from public.runs r where r.school_id = s.id)      as runs,
               (select (extract(epoch from max(r.played_at)) * 1000)::bigint from public.runs r where r.school_id = s.id) as last_run
        from public.schools s
      ) t
    )
  ) into v;
  return v;
end $$;

-- ───────────────────────── Détail d'une école (sans aucun code d'accès) ─────────────────────────

create or replace function public.admin_school(p_school uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform private.assert_site_admin();
  if not exists (select 1 from public.schools where id = p_school) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into private.admin_audit (admin_id, action, target) values (auth.uid(), 'school', p_school::text);
  select jsonb_build_object(
    'school', (select jsonb_build_object('id', s.id, 'name', s.name, 'created', (extract(epoch from s.created_at) * 1000)::bigint)
               from public.schools s where s.id = p_school),
    'teachers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', u.email, 'role', m.role,
               'since', (extract(epoch from m.created_at) * 1000)::bigint,
               'last_sign_in', (extract(epoch from u.last_sign_in_at) * 1000)::bigint) order by u.email), '[]'::jsonb)
      from public.school_members m join auth.users u on u.id = m.user_id where m.school_id = p_school
    ),
    'classes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'grade', c.grade, 'hide_board', c.hide_board,
               'created', (extract(epoch from c.created_at) * 1000)::bigint,
               'students', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', st.id, 'name', st.name,
                          'created', (extract(epoch from st.created_at) * 1000)::bigint,
                          'runs', x.n, 'seconds', x.secs, 'last_played', x.last) order by lower(st.name)), '[]'::jsonb)
                 from public.students st
                 left join lateral (
                   select count(*)::integer as n, coalesce(sum(r.duration), 0)::integer as secs,
                          (extract(epoch from max(r.played_at)) * 1000)::bigint as last
                   from public.runs r where r.student_id = st.id) x on true
                 where st.class_id = c.id)
             ) order by lower(c.name)), '[]'::jsonb)
      from public.classes c where c.school_id = p_school
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from r.played_at) * 1000)::bigint as at,
               st.name as student, c.name as class, r.game, r.mode, r.kind, r.score, r.acc, r.duration
        from public.runs r
        join public.students st on st.id = r.student_id
        join public.classes c on c.id = r.class_id
        where r.school_id = p_school
        order by r.played_at desc limit 60
      ) t
    )
  ) into v;
  return v;
end $$;

-- ───────────────────────── Journal : parties, inscriptions, anomalies, consultations ─────────────────────────

create or replace function public.admin_logs(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform private.assert_site_admin();
  insert into private.admin_audit (admin_id, action) values (auth.uid(), 'logs');
  return jsonb_build_object(
    'runs', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from r.played_at) * 1000)::bigint as at,
               sc.name as school, c.name as class, st.name as student,
               r.game, r.mode, r.kind, r.score, r.acc, r.duration
        from public.runs r
        join public.students st on st.id = r.student_id
        join public.classes c   on c.id  = r.class_id
        join public.schools sc  on sc.id = r.school_id
        order by r.played_at desc limit n
      ) t),
    'signups', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select u.email, (extract(epoch from u.created_at) * 1000)::bigint as at,
               (extract(epoch from u.last_sign_in_at) * 1000)::bigint as last_sign_in,
               (u.email_confirmed_at is not null) as confirmed,
               (select count(*) from public.school_members m where m.user_id = u.id) as schools
        from auth.users u order by u.created_at desc limit 50
      ) t),
    'flags', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from f.at) * 1000)::bigint as at, st.name as student, sc.name as school,
               f.game, f.mode, f.reason
        from private.cheat_log f
        left join public.students st on st.id = f.student_id
        left join public.schools sc  on sc.id = st.school_id
        order by f.at desc limit n
      ) t),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb)
      from (
        select (extract(epoch from a.at) * 1000)::bigint as at, u.email as admin, a.action, a.target
        from private.admin_audit a left join auth.users u on u.id = a.admin_id
        order by a.at desc limit 50
      ) t)
  );
end $$;

grant execute on function public.admin_check()                to authenticated;
grant execute on function public.admin_overview()             to authenticated;
grant execute on function public.admin_school(uuid)           to authenticated;
grant execute on function public.admin_logs(integer)          to authenticated;

-- ───────────────────────── Vous nommer administrateur (à faire UNE FOIS, avec VOTRE e-mail de compte enseignant) ─────────────────────────
-- Remplacez l'adresse puis exécutez cette ligne seule :
--
--   insert into public.site_admins (user_id) select id from auth.users where email = 'votre@adresse.fr' on conflict do nothing;
--
-- Pour retirer l'accès : delete from public.site_admins where user_id = (select id from auth.users where email = 'votre@adresse.fr');
