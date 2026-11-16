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
select public.submit_run((select v from ctx where k='tok_lea'),'run0000005','typing','perso','game',5000,3,10,90,10,60);
select public.submit_run((select v from ctx where k='tok_lea'),'run0000006','typing','standard','drill',7777,3,10,90,10,60);
select pg_temp.eq('valeurs absurdes : partie refusée (triche)', public.submit_run((select v from ctx where k='tok_tom'),'run0000007','typing','expert','game',2000000000,-5,9999,500,-3,99999)->>'error','cheat');
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
select pg_temp.eq('la partie truquée n''est pas enregistrée', (select count(*) from public.runs where client_id='run0000007'), 0::bigint);

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

-- ═══ Séances de classe : essais limités, résultats, équilibrage anonyme ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'sess', public.save_class_session((select v::uuid from ctx where k='classA'), null, '  Éval   tables ', 'math', '{"level":"cm1","difficulty":"standard"}', 2, true)::text;
select pg_temp.eq('1 séance listée', jsonb_array_length(public.list_class_sessions((select v::uuid from ctx where k='classA'))), 1);
select pg_temp.eq('titre nettoyé', public.list_class_sessions((select v::uuid from ctx where k='classA'))->0->>'title', 'Éval tables');
select pg_temp.fails($$select public.save_class_session((select v::uuid from ctx where k='classA'), null, 'x', 'jeu-inconnu', '{}', 2, true)$$, 'invalid_name');
select pg_temp.fails($$select public.save_class_session((select v::uuid from ctx where k='classA'), null, 'x', 'math', '{}', 4, true)$$, 'invalid_name');
select pg_temp.fails($$select public.save_class_session((select v::uuid from ctx where k='classA'), null, '', 'math', '{}', 2, true)$$, 'invalid_name');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.fails($$select public.list_class_sessions((select v::uuid from ctx where k='classA'))$$, 'forbidden');
select pg_temp.fails($$select public.save_class_session((select v::uuid from ctx where k='classA'), null, 'pirate', 'math', '{}', 2, true)$$, 'forbidden');
select pg_temp.fails($$select public.save_class_session((select v::uuid from ctx where k='classB'), (select v::uuid from ctx where k='sess'), 'vol', 'math', '{}', 2, true)$$, 'forbidden');
select pg_temp.fails($$select public.session_results((select v::uuid from ctx where k='sess'))$$, 'forbidden');
select pg_temp.fails($$select public.delete_class_session((select v::uuid from ctx where k='sess'))$$, 'forbidden');
select pg_temp.fails($$select count(*) from public.class_sessions$$, 'permission denied');   -- tout passe par les fonctions

select pg_temp.as_anon();
update ctx set v = public.student_login((select v from ctx where k='code_lea2'))->>'token' where k='tok_lea';   -- Léa s'est reconnectée avec son nouveau code
select pg_temp.eq('l''élève voit la séance', jsonb_array_length(public.my_sessions((select v from ctx where k='tok_lea'))->'sessions'), 1);
select pg_temp.eq('Nina (autre classe) ne voit rien', jsonb_array_length(public.my_sessions((select v from ctx where k='tok_nina'))->'sessions'), 0);
select pg_temp.eq('jeton invalide', public.my_sessions('faux')->>'error', 'invalid_session');
select pg_temp.eq('essai 1 Léa', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sess'), 'seance00001', 1000, 3, 0, 70, 30, 200)->>'attempts_used', '1');
select pg_temp.eq('essai 2 Léa (meilleur)', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sess'), 'seance00002', 2400, 5, 0, 88, 40, 250,
  null, '{"game":"math","level":"cm1","difficulty":"standard","outcome":"finished","score":2400,"rounds_ok":40,"rounds_err":3,"pages":[{"a":8,"e":0}]}')->>'attempts_used', '2');
select pg_temp.eq('renvoi du même essai : sans effet', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sess'), 'seance00002', 9, 1, 0, 1, 1, 1)->>'ok', 'true');
select pg_temp.eq('3e essai refusé (limite 2)', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sess'), 'seance00003', 99999, 9, 0, 99, 99, 99)->>'error', 'no_attempts_left');
select pg_temp.eq('Nina ne peut pas jouer la séance d''une autre classe', public.submit_session_run((select v from ctx where k='tok_nina'), (select v::uuid from ctx where k='sess'), 'seance00004', 1, 1, 0, 1, 1, 1)->>'error', 'unknown_session');
select pg_temp.eq('mon espace : 2 essais utilisés, meilleur 2400', (public.my_sessions((select v from ctx where k='tok_lea'))->'sessions'->0->>'attempts_used') || '/' || (public.my_sessions((select v from ctx where k='tok_lea'))->'sessions'->0->>'best_score'), '2/2400');
select pg_temp.eq('Tom : aucun essai', public.my_sessions((select v from ctx where k='tok_tom'))->'sessions'->0->>'attempts_used', '0');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('résultats : meilleur de Léa = 2400 avec 2 essais', (select (r->>'best_score') || '/' || (r->>'attempts') from jsonb_array_elements(public.session_results((select v::uuid from ctx where k='sess'))) r where r->>'name'='Léa'), '2400/2');
select pg_temp.eq('résultats : les élèves sans essai apparaissent', (select (r->>'attempts') from jsonb_array_elements(public.session_results((select v::uuid from ctx where k='sess'))) r where r->>'name'='Tom'), '0');
-- augmenter les essais : Léa peut rejouer
select public.save_class_session((select v::uuid from ctx where k='classA'), (select v::uuid from ctx where k='sess'), 'Éval tables', 'typing', '{"level":"cm1"}', 3, true);
select pg_temp.eq('le jeu d''une séance déjà jouée ne change pas', public.list_class_sessions((select v::uuid from ctx where k='classA'))->0->>'game', 'math');
select pg_temp.as_anon();
select pg_temp.eq('3e essai accepté après réglage', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sess'), 'seance00005', 100, 1, 0, 50, 5, 20)->>'attempts_used', '3');
-- séance fermée
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.save_class_session((select v::uuid from ctx where k='classA'), (select v::uuid from ctx where k='sess'), 'Éval tables', 'math', '{}', 3, false);
select pg_temp.as_anon();
select pg_temp.eq('séance fermée : refusée', public.submit_session_run((select v from ctx where k='tok_tom'), (select v::uuid from ctx where k='sess'), 'seance00006', 100, 1, 0, 50, 5, 20)->>'error', 'session_closed');

-- les essais de séance ne comptent ni dans les classements libres ni dans les records du tableau de bord
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('record « maths » du tableau de bord ignore les séances', (select (r->>'best_math') is null from jsonb_array_elements(public.class_overview((select v::uuid from ctx where k='classA'))) r where r->>'name'='Léa'), true);
select pg_temp.as_anon();
select pg_temp.eq('classement libre math ignore les séances', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'),'math','seance')->'rows'), 0);

-- équilibrage anonyme
select pg_temp.as_anon();
select pg_temp.eq('partie libre avec résumé', public.submit_run((select v from ctx where k='tok_tom'),'bal0000001','math','standard','game',1200,0,0,0,30,150,null,
  '{"game":"math","level":"cm2","difficulty":"standard","outcome":"lost","score":1200,"rounds_ok":30,"rounds_err":6,"pages":[{"a":8,"e":1},{"a":8,"e":2}]}')->>'ok','true');
select public.submit_run((select v from ctx where k='tok_tom'),'bal0000001','math','standard','game',1200,0,0,0,30,150,null,
  '{"game":"math","level":"cm2","difficulty":"standard","outcome":"lost","score":1200,"rounds_ok":30,"rounds_err":6}');   -- renvoi : un seul résumé
select public.submit_run((select v from ctx where k='tok_tom'),'bal0000002','math','perso','game',10,0,0,0,3,15,null,
  '{"game":"math","difficulty":"perso","outcome":"lost","score":10}');
select public.submit_run((select v from ctx where k='tok_tom'),'bal0000003','math','standard','drill',10,0,0,0,3,15,null,
  '{"game":"math","difficulty":"standard","outcome":"lost","score":10}');   -- entraînement : pas de résumé
select public.submit_run((select v from ctx where k='tok_tom'),'bal0000004','math','standard','game',10,0,0,0,3,15,null,
  '{"game":"danger","difficulty":"standard","outcome":"lost","score":10}');  -- résumé invalide ignoré, partie enregistrée
select pg_temp.eq('la partie à résumé invalide est quand même enregistrée', public.submit_run((select v from ctx where k='tok_tom'),'bal0000004','math','standard','game',10,0,0,0,3,15)->>'ok','true');
select pg_temp.as_admin();
select pg_temp.eq('2 résumés exacts (libre + perso), ni doublon, ni entraînement, ni invalide', (select count(*) from public.balance_runs), 2::bigint);
select pg_temp.eq('résumé « perso » exclu des moyennes', (select count(*) from public.balance_runs where custom), 1::bigint);
select pg_temp.eq('aucune colonne ne relie le résumé à un élève', (select count(*) from information_schema.columns where table_name='balance_runs' and column_name ~ 'student|class|school|user'), 0::bigint);
select pg_temp.eq('la requête de statistiques par page fonctionne', (select count(*) from public.balance_runs b, jsonb_array_elements(b.pages) with ordinality as p(v, ord) where not b.custom), 2::bigint);
select pg_temp.as_anon();
select pg_temp.fails($$select count(*) from public.balance_runs$$, 'permission denied');
select pg_temp.fails($$select count(*) from public.class_sessions$$, 'permission denied');
select pg_temp.fails($$insert into public.balance_runs (game, difficulty, outcome, score) values ('math','standard','lost',1)$$, 'permission denied');

-- classement masquable + objectif collectif
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.classes set hide_board = true where id = (select v::uuid from ctx where k='classA');
select pg_temp.as_anon();
select pg_temp.eq('classement masqué : aucune ligne et drapeau hidden', (public.class_leaderboard((select v from ctx where k='tok_lea'),'math','standard')->>'hidden'), 'true');
select pg_temp.eq('classement masqué : liste vide', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'),'math','standard')->'rows'), 0);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.classes set hide_board = false where id = (select v::uuid from ctx where k='classA');
select pg_temp.as_anon();
select pg_temp.eq('classement réaffiché', (public.class_leaderboard((select v from ctx where k='tok_lea'),'math','standard')->>'hidden') is null, true);
select pg_temp.eq('objectif collectif : réponse ok', public.class_week((select v from ctx where k='tok_lea'))->>'ok', 'true');
select pg_temp.eq('objectif collectif : compte des parties', (public.class_week((select v from ctx where k='tok_lea'))->>'games')::int > 0, true);
select pg_temp.eq('objectif collectif : jeton invalide refusé', public.class_week('nimporte-quoi')->>'error', 'invalid_session');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
update public.classes set hide_board = true where id = (select v::uuid from ctx where k='classA');
select pg_temp.as_admin();
select pg_temp.eq('un autre enseignant ne peut pas masquer', (select hide_board from public.classes where id = (select v::uuid from ctx where k='classA')), false);

-- ═══ 4e jeu : orthographe (séance + partie libre) ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'sessSp', public.save_class_session((select v::uuid from ctx where k='classA'), null, 'Orthographe', 'spelling', '{"level":"cm1","diff":"standard"}', 1, true)::text;
select pg_temp.eq('séance d''orthographe créée', (select count(*) from jsonb_array_elements(public.list_class_sessions((select v::uuid from ctx where k='classA'))) e where e->>'game'='spelling'), 1::bigint);
select pg_temp.as_anon();
select pg_temp.eq('essai d''orthographe en séance', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sessSp'), 'ortho000001', 135, 6, 0, 90, 9, 240)->>'attempts_used', '1');
select pg_temp.eq('partie libre d''orthographe', public.submit_run((select v from ctx where k='tok_lea'), 'ortho000002', 'spelling', 'cm1', 'game', 120, 4, 0, 80, 8, 200)->>'ok', 'true');
select pg_temp.eq('refus d''une triche en séance', public.submit_session_run((select v from ctx where k='tok_tom'), (select v::uuid from ctx where k='sessSp'), 'triche00002', 99999, 9, 0, 100, 10, 60)->>'error', 'cheat');
select pg_temp.eq('classement orthographe', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'), 'spelling', 'cm1')->'rows'), 1);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_class_session((select v::uuid from ctx where k='sessSp'));

-- ═══ Niveau de la classe ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.classes set grade = 'cm2' where id = (select v::uuid from ctx where k='classA');
select pg_temp.as_anon();
select pg_temp.eq('l''élève reçoit le niveau de sa classe', public.my_sessions((select v from ctx where k='tok_lea'))->>'grade', 'cm2');
select pg_temp.eq('niveau absent : null', (public.my_sessions((select v from ctx where k='tok_nina'))->'grade') = 'null'::jsonb, true);
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
update public.classes set grade = 'cp' where id = (select v::uuid from ctx where k='classA');
select pg_temp.as_admin();
select pg_temp.eq('un autre enseignant ne change pas le niveau', (select grade from public.classes where id = (select v::uuid from ctx where k='classA')), 'cm2');
select pg_temp.fails($$update public.classes set grade = 'terminale' where id = (select v::uuid from ctx where k='classA')$$, 'check');

-- suppression d'une séance : ses essais disparaissent avec elle
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_class_session((select v::uuid from ctx where k='sess'));
select pg_temp.as_admin();
select pg_temp.eq('essais de la séance supprimés avec elle', (select count(*) from public.runs where session_id is not null), 0::bigint);

-- ═══ Suppression de l'école A ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_school((select v::uuid from ctx where k='schoolA'));
select pg_temp.as_admin();
select pg_temp.eq('plus aucune donnée de l''école A', (select (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolA'))
  + (select count(*) from public.runs where school_id=(select v::uuid from ctx where k='schoolA')) + (select count(*) from public.classes where school_id=(select v::uuid from ctx where k='schoolA'))), 0::bigint);
select pg_temp.eq('l''école B est intacte', (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolB')), 2::bigint);
\echo TOUS LES TESTS SQL PASSENT

-- ───────────────────────── Sécurité des scores ─────────────────────────
select pg_temp.as_admin();
select pg_temp.eq('plausible : un très bon joueur de Frappe passe', private.run_violation('typing', 20000, 25, 120, 98, 1500, 480) is null, true);
select pg_temp.eq('Frappe : 10 millions en 60 s', private.run_violation('typing', 10000000, 5, 40, 95, 200, 60), 'score supérieur au maximum possible');
select pg_temp.eq('Frappe : 400 mots/min', private.run_violation('typing', 1000, 2, 400, 95, 200, 60), 'vitesse de frappe impossible');
select pg_temp.eq('Frappe : 5000 lettres en 60 s', private.run_violation('typing', 1000, 2, 100, 95, 5000, 60), 'trop de lettres pour la durée');
select pg_temp.eq('score sans durée', private.run_violation('typing', 100, 1, 10, 90, 10, 0), 'score sans durée de jeu');
select pg_temp.eq('Course : le maximum réel passe', private.run_violation('math', 48 * 70 + 50 * 6 + 250, 48, 0, 100, 48, 240) is null, true);
select pg_temp.eq('Course : 48 réponses en 5 s', private.run_violation('math', 1000, 20, 0, 100, 48, 5), 'réponses trop rapides');
select pg_temp.eq('Course : score impossible', private.run_violation('math', 99999, 10, 0, 100, 30, 200), 'score supérieur au maximum possible');
select pg_temp.eq('Mémoire : plus de manches que le jeu', private.run_violation('memory', 500, 40, 0, 100, 40, 300), 'plus de manches que le jeu n''en contient');
select pg_temp.eq('Mémoire : un vrai score passe', private.run_violation('memory', 1800, 12, 0, 95, 12, 200) is null, true);
select pg_temp.eq('Orthographe : 10 phrases parfaites passent', private.run_violation('spelling', 250, 10, 0, 100, 10, 90) is null, true);
select pg_temp.eq('Orthographe : score impossible', private.run_violation('spelling', 5000, 10, 0, 100, 10, 90), 'score supérieur au maximum possible');
select pg_temp.eq('Orthographe : 10 phrases en 5 s', private.run_violation('spelling', 100, 5, 0, 100, 10, 5), 'phrases trop rapides');
select pg_temp.eq('jeu inconnu', private.run_violation('piratage', 1, 1, 0, 1, 1, 10), 'jeu inconnu');

select pg_temp.eq('refus d''une triche en partie libre', public.submit_run((select v from ctx where k='tok_nina'),'triche00001','math','standard','game',900000,50,0,100,50,100)->>'error', 'cheat');
select pg_temp.eq('la triche n''apparaît pas dans les parties', (select count(*) from public.runs where client_id='triche00001'), 0::bigint);
select pg_temp.eq('la triche est notée dans le journal', (select count(*) from private.cheat_log where game='math' and (values_->>'score')::int = 900000), 1::bigint);
-- plus de temps de jeu que de temps écoulé : une heure ne contient pas plus de 2 h de parties (deux appareils)
select pg_temp.eq('1 h de jeu : accepté', public.submit_run((select v from ctx where k='tok_nina'),'temps000001','math','standard','game',500,10,0,100,20,3600)->>'ok', 'true');
select pg_temp.eq('50 min de plus : accepté', public.submit_run((select v from ctx where k='tok_nina'),'temps000002','math','standard','game',500,10,0,100,20,3000)->>'ok', 'true');
select pg_temp.eq('au-delà de 2 h dans l''heure : refusé', public.submit_run((select v from ctx where k='tok_nina'),'temps000003','math','standard','game',500,10,0,100,20,600)->>'error', 'cheat');
select pg_temp.eq('le journal est inaccessible au navigateur', has_schema_privilege('anon', 'private', 'USAGE'), false);
