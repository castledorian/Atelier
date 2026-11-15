\set ON_ERROR_STOP on
-- Aides : se faire passer pour un rôle / un utilisateur
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u::text, false); execute 'set role authenticated'; end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
-- Vérifie qu'une requête échoue avec un message donné
create function pg_temp.fails(q text, expect text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like '%' || expect || '%' then return; end if;
    raise exception 'ÉCHEC DU TEST : « % » a échoué avec « % » au lieu de « % »', q, sqlerrm, expect;
  end;
  raise exception 'ÉCHEC DU TEST : « % » aurait dû échouer (%)', q, expect;
end $$;
create function pg_temp.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'ÉCHEC DU TEST [%] : obtenu %, attendu %', label, got, want; end if;
  raise notice 'ok  %', label; end $$;

-- Deux enseignants, deux écoles
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','a@ecole-a.fr'), ('bbbbbbbb-0000-0000-0000-000000000002','b@ecole-b.fr');
create temp table ctx (k text primary key, v text);
grant all on ctx to anon, authenticated;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'schoolA', public.create_school('  École   A ')::text;
insert into ctx select 'classA', (public.create_class((select v::uuid from ctx where k='schoolA'), 'CM2 A')->>'id');
insert into ctx select 'stu', public.add_students((select v::uuid from ctx where k='classA'), array['Léa','Tom','  ','léa', E'Zoé\n','Max'])::text;
select pg_temp.eq('3 élèves créés (doublon « léa » et ligne vide ignorés)', jsonb_array_length((select v::jsonb from ctx where k='stu')), 4);
select pg_temp.eq('nom nettoyé', (select v::jsonb->2->>'name' from ctx where k='stu'), 'Zoé');
select pg_temp.eq('école nettoyée', (select name from public.schools), 'École A');
select pg_temp.as_admin();
insert into ctx select 'code_lea', (select v::jsonb->0->>'access_code' from ctx where k='stu');
insert into ctx select 'code_tom', (select v::jsonb->1->>'access_code' from ctx where k='stu');
select pg_temp.eq('code de 8 caractères sans lettres ambiguës', (select v ~ '^[A-HJKMN-Z2-9]{8}$' from ctx where k='code_lea'), true);

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into ctx select 'schoolB', public.create_school('École B')::text;
insert into ctx select 'classB', (public.create_class((select v::uuid from ctx where k='schoolB'), '6e B')->>'id');
insert into ctx select 'stuB', public.add_students((select v::uuid from ctx where k='classB'), array['Nina','Omar'])::text;
select pg_temp.as_admin();
insert into ctx select 'code_nina', (select v::jsonb->0->>'access_code' from ctx where k='stuB');

-- ═══ Isolation entre écoles (enseignants) ═══
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.eq('B ne voit que son école', (select count(*) from public.schools), 1::bigint);
select pg_temp.eq('B ne voit que ses classes', (select count(*) from public.classes), 1::bigint);
select pg_temp.eq('B ne voit que ses élèves', (select count(*) from public.students), 2::bigint);
select pg_temp.fails($$select public.create_class('$$||(select v from ctx where k='schoolA')||$$'::uuid, 'Intrus')$$, 'forbidden');
select pg_temp.fails($$select public.add_students('$$||(select v from ctx where k='classA')||$$'::uuid, array['Pirate'])$$, 'forbidden');
select pg_temp.fails($$select public.reset_student_code('$$||(select v::jsonb->0->>'id' from ctx where k='stu')||$$'::uuid)$$, 'forbidden');
select pg_temp.fails($$select public.delete_school('$$||(select v from ctx where k='schoolA')||$$'::uuid)$$, 'forbidden');
-- modifier / supprimer chez A : 0 ligne touchée
with u as (update public.classes set name = 'piraté' where school_id = (select v::uuid from ctx where k='schoolA') returning 1) select pg_temp.eq('B ne peut pas renommer une classe de A', (select count(*) from u), 0::bigint);
with d as (delete from public.students where school_id = (select v::uuid from ctx where k='schoolA') returning 1) select pg_temp.eq('B ne peut pas supprimer les élèves de A', (select count(*) from d), 0::bigint);
select pg_temp.fails($$update public.students set access_code = 'AAAAAAAA' where true$$, 'permission denied');
select pg_temp.fails($$update public.students set school_id = gen_random_uuid() where true$$, 'permission denied');
select pg_temp.fails($$insert into public.classes (school_id, name) values (gen_random_uuid(), 'x')$$, 'permission denied');
select pg_temp.fails($$insert into public.runs (client_id,student_id,class_id,school_id,game,mode,score,wave,wpm,acc,correct,duration) values ('abcdef',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'typing','standard',1,1,1,1,1,1)$$, 'permission denied');
select pg_temp.fails($$select * from public.student_sessions$$, 'permission denied');
select pg_temp.fails($$select * from private.login_attempts$$, 'permission denied');
select pg_temp.fails($$select public.create_school('x')$$, 'invalid_name');
select pg_temp.fails($$select private.new_code()$$, 'permission denied');
select pg_temp.as_admin();

-- ═══ Ce que le navigateur sans compte peut faire ═══
select pg_temp.as_anon();
select pg_temp.fails($$select * from public.students$$, 'permission denied');
select pg_temp.fails($$select * from public.runs$$, 'permission denied');
select pg_temp.fails($$select * from public.schools$$, 'permission denied');
select pg_temp.fails($$select * from public.classes$$, 'permission denied');
select pg_temp.fails($$select public.create_school('Anonyme')$$, 'permission denied');
select pg_temp.fails($$select public.add_students(gen_random_uuid(), array['x'])$$, 'permission denied');
select pg_temp.fails($$select public.reset_student_code(gen_random_uuid())$$, 'permission denied');
select pg_temp.fails($$select private.student_from_token('x')$$, 'permission denied');
-- connexion élève
select pg_temp.eq('code inconnu refusé', public.student_login('ZZZZZZZZ')->>'error', 'invalid_code');
insert into ctx select 'tok_lea', public.student_login(lower(substr((select v from ctx where k='code_lea'),1,4)||'-'||substr((select v from ctx where k='code_lea'),5)))->>'token';
select pg_temp.eq('connexion Léa (code en minuscules avec tiret)', length((select v from ctx where k='tok_lea')), 64);
insert into ctx select 'tok_tom', public.student_login((select v from ctx where k='code_tom'))->>'token';
insert into ctx select 'tok_nina', public.student_login((select v from ctx where k='code_nina'))->>'token';
select pg_temp.eq('réponse de connexion', (public.student_login((select v from ctx where k='code_lea'))->'class'->>'name'), 'CM2 A');
select pg_temp.eq('jeton invalide', public.my_runs('nimportequoi')->>'error', 'invalid_session');

-- parties
select pg_temp.eq('partie Léa 1', public.submit_run((select v from ctx where k='tok_lea'),'run0000001','typing','standard','game',1500,6,22.5,91,120,100)->>'ok', 'true');
select public.submit_run((select v from ctx where k='tok_lea'),'run0000002','typing','standard','game',2500,8,30,95,200,150);
select public.submit_run((select v from ctx where k='tok_lea'),'run0000002','typing','standard','game',99999,8,30,95,200,150); -- renvoi : ignoré
select public.submit_run((select v from ctx where k='tok_tom'),'run0000003','typing','standard','game',1800,6,20,80,100,90);
select public.submit_run((select v from ctx where k='tok_nina'),'run0000004','typing','standard','game',9000,12,50,99,400,300);
select public.submit_run((select v from ctx where k='tok_lea'),'run0000005','typing','perso','game',50000,3,10,90,10,60);
select public.submit_run((select v from ctx where k='tok_lea'),'run0000006','typing','standard','drill',77777,3,10,90,10,60);
select pg_temp.eq('valeurs absurdes bornées', public.submit_run((select v from ctx where k='tok_tom'),'run0000007','typing','expert','game',2000000000,-5,9999,500,-3,99999)->>'ok','true');
select pg_temp.eq('client_id invalide refusé', public.submit_run((select v from ctx where k='tok_tom'),'../..','typing','expert','game',1,1,1,1,1,1)->>'error','invalid_data');
select pg_temp.eq('jeton invalide : partie refusée', public.submit_run('faux','run0000008','typing','standard','game',1,1,1,1,1,1)->>'error','invalid_session');

-- classements
select pg_temp.eq('classe : Tom 2e derrière Léa, sans Nina (autre école), ni perso, ni entraînement',
  (select string_agg(r->>'name' || ':' || (r->>'score'), ',' order by (r->>'rank')::int) from jsonb_array_elements(public.class_leaderboard((select v from ctx where k='tok_lea'),'typing','standard')->'rows') r),
  'Léa:2500,Tom:1800');
select pg_temp.eq('is_me', (public.class_leaderboard((select v from ctx where k='tok_lea'),'typing','standard')->'rows'->0->>'is_me'), 'true');
select pg_temp.eq('Nina ne voit que son école',
  (select string_agg(r->>'name', ',') from jsonb_array_elements(public.class_leaderboard((select v from ctx where k='tok_nina'),'typing','standard','school')->'rows') r), 'Nina');
select pg_temp.eq('école A (portée « school »)', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'),'typing','standard','school')->'rows'), 2);
select pg_temp.eq('perso jamais classé', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'),'typing','perso')->'rows'), 0);
select pg_temp.eq('mon historique contient 5 parties (hors renvoi)', jsonb_array_length(public.my_runs((select v from ctx where k='tok_lea'),'typing')->'rows'), 4);
select pg_temp.eq('l''historique d''un élève n''est pas celui d''un autre', jsonb_array_length(public.my_runs((select v from ctx where k='tok_nina'),'typing')->'rows'), 1);
select pg_temp.as_admin();
select pg_temp.eq('renvoi ignoré (2500 conservé)', (select score from public.runs where client_id='run0000002'), 2500);
select pg_temp.eq('bornes appliquées', (select score||'/'||wave||'/'||wpm||'/'||acc||'/'||correct||'/'||duration from public.runs where client_id='run0000007'), '10000000/0/300.0/100.0/0/7200');

-- ═══ Enseignant A : lit ses résultats, jamais ceux de B ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('A voit les parties de sa classe uniquement', (select count(distinct student_id) from public.runs), 2::bigint);
select pg_temp.eq('A voit les codes de ses élèves', (select count(*) from public.students where access_code is not null), 4::bigint);
select pg_temp.eq('aperçu de classe : 4 élèves', jsonb_array_length(public.class_overview((select v::uuid from ctx where k='classA'))), 4);
select pg_temp.eq('aperçu : meilleur score Léa (parties classées uniquement)', (select (e->>'best_typing')::int from jsonb_array_elements(public.class_overview((select v::uuid from ctx where k='classA'))) e where e->>'name'='Léa'), 2500);
select pg_temp.eq('aperçu : 4 parties + 1 entraînement', (select (e->>'games')||'/'||(e->>'drills') from jsonb_array_elements(public.class_overview((select v::uuid from ctx where k='classA'))) e where e->>'name'='Léa'), '3/1');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.fails($$select public.class_overview('$$||(select v from ctx where k='classA')||$$'::uuid)$$, 'forbidden');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.classes set session_config = '{"speed":70,"letters":"fjdksl"}'::jsonb where id = (select v::uuid from ctx where k='classA');
select pg_temp.fails($$update public.classes set session_config = '[1]'::jsonb where true$$, 'violates check');
select pg_temp.as_anon();
select pg_temp.eq('la séance de la classe est transmise à l''élève', public.student_login((select v from ctx where k='code_lea'))->'class'->'session_config'->>'speed', '70');

-- ═══ Code réinitialisé ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'code_lea2', public.reset_student_code((select (v::jsonb->0->>'id')::uuid from ctx where k='stu'));
select pg_temp.as_anon();
select pg_temp.eq('ancien code refusé après réinitialisation', public.student_login((select v from ctx where k='code_lea'))->>'error', 'invalid_code');
select pg_temp.eq('ancienne connexion coupée', public.my_runs((select v from ctx where k='tok_lea'))->>'error', 'invalid_session');
select pg_temp.eq('nouveau code accepté', (public.student_login((select v from ctx where k='code_lea2'))->'student'->>'name'), 'Léa');

-- ═══ Limite anti-devinette ═══
select pg_temp.as_anon();
do $$ declare i int; r jsonb; begin
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', false);
  for i in 1..30 loop perform public.student_login('AAAAAAA' || i); end loop;
  r := public.student_login((select v from ctx where k='code_nina'));
  if r->>'error' is distinct from 'rate_limited' then raise exception 'ÉCHEC : la 31e tentative aurait dû être limitée (%)', r; end if;
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.7"}', false);
  r := public.student_login((select v from ctx where k='code_nina'));
  if r->>'token' is null then raise exception 'ÉCHEC : une autre adresse ne doit pas être bloquée (%)', r; end if;
  raise notice 'ok  limite par adresse (30 refus / 10 min), autre adresse non bloquée';
end $$;

-- ═══ Suppression de l'école A ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_school((select v::uuid from ctx where k='schoolA'));
select pg_temp.as_admin();
select pg_temp.eq('plus aucune donnée de l''école A', (select (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolA'))
  + (select count(*) from public.runs where school_id=(select v::uuid from ctx where k='schoolA')) + (select count(*) from public.classes where school_id=(select v::uuid from ctx where k='schoolA'))), 0::bigint);
select pg_temp.eq('l''école B est intacte', (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolB')), 2::bigint);
\echo TOUS LES TESTS SQL PASSENT
