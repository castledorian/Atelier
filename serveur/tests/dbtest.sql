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

-- les tests d'avant l'invitation partent d'un site ouvert ; l'inscription sur invitation est testée en fin de fichier
update private.app_settings set value = 'off' where key = 'invite_only';
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
select pg_temp.fails($$select access_code from public.students$$, 'permission denied');
select pg_temp.fails($$select code_hash from public.students$$, 'permission denied');
select pg_temp.as_admin();
select pg_temp.eq('les codes ne sont plus stockés en clair', (select count(*) from public.students where access_code is not null), 0::bigint);
select pg_temp.eq('chaque élève a une empreinte de code', (select count(*) from public.students where code_hash is not null), (select count(*) from public.students));
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
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
insert into ctx select 'sessLex', public.save_class_session((select v::uuid from ctx where k='classA'), null, 'Vocabulaire', 'lexique', '{"rel":"famille","level":"cm1","diff":"standard"}', 1, true)::text;
select pg_temp.eq('séance de Mots en orbite créée', (select count(*) from jsonb_array_elements(public.list_class_sessions((select v::uuid from ctx where k='classA'))) e where e->>'game'='lexique'), 1::bigint);
select pg_temp.as_anon();
select pg_temp.eq('essai d''orthographe en séance', public.submit_session_run((select v from ctx where k='tok_lea'), (select v::uuid from ctx where k='sessSp'), 'ortho000001', 135, 6, 0, 90, 9, 240)->>'attempts_used', '1');
select pg_temp.eq('partie libre d''orthographe', public.submit_run((select v from ctx where k='tok_lea'), 'ortho000002', 'spelling', 'cm1', 'game', 120, 4, 0, 80, 8, 200)->>'ok', 'true');
select pg_temp.eq('refus d''une triche en séance', public.submit_session_run((select v from ctx where k='tok_tom'), (select v::uuid from ctx where k='sessSp'), 'triche00002', 99999, 9, 0, 100, 10, 60)->>'error', 'cheat');
select pg_temp.eq('classement orthographe', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'), 'spelling', 'cm1')->'rows'), 1);
select pg_temp.eq('partie libre de Mots en orbite', public.submit_run((select v from ctx where k='tok_lea'), 'lexi0000001', 'lexique', 'famille', 'game', 640, 6, 0, 86, 6, 60)->>'ok', 'true');
select pg_temp.eq('classement Mots en orbite', jsonb_array_length(public.class_leaderboard((select v from ctx where k='tok_lea'), 'lexique', 'famille')->'rows'), 1);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('tableau de bord : record Mots en orbite', (select max((e->>'best_lexique')::int) from jsonb_array_elements(public.class_overview((select v::uuid from ctx where k='classA'))) e), 640);
select pg_temp.as_anon();
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


-- ───────────────────────── Suivi des exercices (mise-a-jour-exercices.sql) ─────────────────────────
select pg_temp.as_anon();
-- sans partie récente du jeu, l'envoi est refusé
select pg_temp.eq('envoi sans partie récente : refusé', public.submit_item_stats((select v from ctx where k='tok_lea'),'math','cm1','standard',1,'[{"k":"rule","i":"tables","l":"Tables","n":1,"e":0}]'::jsonb)->>'error', 'invalid_data');
select public.submit_run((select v from ctx where k='tok_lea'),'runmath001','math','cm1','game',300,5,0,70,20,120,null,
  '{"game":"math","level":"cm1","difficulty":"standard","version":1,"outcome":"finished","score":300,"duration":120,"rounds_ok":35,"rounds_err":13}'::jsonb);
select public.submit_run((select v from ctx where k='tok_tom'),'runmath002','math','cm1','game',200,4,0,60,12,100,null,
  '{"game":"math","level":"cm1","difficulty":"standard","version":1,"outcome":"lost","score":200,"duration":100,"rounds_ok":15,"rounds_err":15}'::jsonb);
select pg_temp.eq('envoi des compteurs : accepté', public.submit_item_stats((select v from ctx where k='tok_lea'),'math','cm1','standard',1,
  '[{"k":"rule","i":"tables","l":"Tables de multiplication","n":4,"e":2,"p":{"54":1,"56":1}},
    {"k":"item","i":"7 × 8","l":"7 × 8","n":1,"e":1,"p":{"54":1}},
    {"k":"item","i":"9 × 6","l":"9 × 6","n":1,"e":0},
    {"k":"item","i":"trop","l":"invalide : plus d erreurs que de questions","n":1,"e":3},
    {"k":"item","i":"six","l":"invalide : un exercice précis posé 6 fois","n":6,"e":0},
    {"k":"rule","i":"grande-famille","l":"Une famille posée 48 fois","n":48,"e":6}]'::jsonb)->>'stored', '4');
select public.submit_item_stats((select v from ctx where k='tok_tom'),'math','cm1','standard',1,
  '[{"k":"rule","i":"tables","l":"Tables de multiplication","n":4,"e":3,"p":{"54":2,"63":1}},{"k":"item","i":"7 × 8","l":"7 × 8","n":1,"e":1,"p":{"56":1}}]'::jsonb);
select public.submit_item_stats((select v from ctx where k='tok_lea'),'math','cm1','standard',1,'[{"k":"item","i":"7 × 8","l":"7 × 8","n":1,"e":0}]'::jsonb);
select pg_temp.eq('jeton inconnu : refusé', public.submit_item_stats('x','math','cm1','standard',1,'[]'::jsonb)->>'error', 'invalid_session');
select pg_temp.eq('réglages personnalisés : refusés', public.submit_item_stats((select v from ctx where k='tok_lea'),'math','cm1','perso',1,'[]'::jsonb)->>'error', 'invalid_data');
select pg_temp.eq('jeu non joué récemment : refusé', public.submit_item_stats((select v from ctx where k='tok_tom'),'spelling','cm1','standard',1,'[]'::jsonb)->>'error', 'invalid_data');
select pg_temp.eq('contenu qui n''est pas une liste : refusé', public.submit_item_stats((select v from ctx where k='tok_lea'),'math','cm1','standard',1,'{"a":1}'::jsonb)->>'error', 'invalid_data');
select pg_temp.fails($$select * from public.item_stats$$, 'permission denied');
select pg_temp.fails($$select public.admin_item_stats()$$, 'permission denied');
select pg_temp.fails($$select public.admin_balance()$$, 'permission denied');
select pg_temp.fails($$select private.store_items('math','cm1','standard',1,'[]'::jsonb)$$, 'permission denied');

-- un enseignant ordinaire n'a pas accès
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.fails($$select public.admin_item_stats()$$, 'forbidden');
select pg_temp.fails($$select public.admin_balance()$$, 'forbidden');
select pg_temp.fails($$select * from public.item_stats$$, 'permission denied');

-- limite : 60 envois par heure et par élève
select pg_temp.as_anon();
do $$ declare i int; r jsonb; begin
  for i in 1..70 loop
    r := public.submit_item_stats((select v from ctx where k='tok_tom'),'math','cm1','standard',1,'[{"k":"rule","i":"tables","l":"Tables de multiplication","n":1,"e":0}]'::jsonb);
    if r->>'error' = 'rate_limited' then raise notice 'ok  limite atteinte après % envois', i - 1; return; end if;
  end loop;
  raise exception 'ÉCHEC DU TEST [limite d''envois] : jamais refusé';
end $$;


-- ═══ Suppression de l'école A ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_school((select v::uuid from ctx where k='schoolA'));
select pg_temp.as_admin();
select pg_temp.eq('plus aucune donnée de l''école A', (select (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolA'))
  + (select count(*) from public.runs where school_id=(select v::uuid from ctx where k='schoolA')) + (select count(*) from public.classes where school_id=(select v::uuid from ctx where k='schoolA'))), 0::bigint);
select pg_temp.eq('l''école B est intacte', (select count(*) from public.students where school_id=(select v::uuid from ctx where k='schoolB')), 2::bigint);

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
select pg_temp.eq('Orthographe : score impossible', private.run_violation('spelling', 20000, 10, 0, 100, 10, 90), 'score supérieur au maximum possible');
select pg_temp.eq('Orthographe : 10 phrases en 5 s', private.run_violation('spelling', 100, 5, 0, 100, 10, 5), 'phrases trop rapides');
select pg_temp.eq('Mots en orbite : une vraie partie passe', private.run_violation('lexique', 900, 8, 0, 85, 8, 70) is null, true);
select pg_temp.eq('Mots en orbite : manches trop rapides', private.run_violation('lexique', 300, 40, 0, 100, 40, 10), 'manches trop rapides');
select pg_temp.eq('Mots en orbite : score impossible', private.run_violation('lexique', 90000, 8, 0, 100, 8, 70), 'score supérieur au maximum possible');
select pg_temp.eq('barème commun : indicateur de version', (public.server_version()->'features'->>'bareme'), 'true');
select pg_temp.eq('barème commun : Course, 48 réponses à haut score acceptées', private.run_violation('math', 30000, 20, 0, 98, 48, 300), null);
select pg_temp.eq('barème commun : Course, 840 points par réponse au plus', private.run_violation('math', 840*48+5001, 20, 0, 98, 48, 300), 'score supérieur au maximum possible');
select pg_temp.eq('barème commun : Mémoire, belle partie acceptée', private.run_violation('memory', 14000, 6, 0, 95, 30, 400), null);
select pg_temp.eq('barème commun : Orthographe, partie parfaite acceptée', private.run_violation('spelling', 6250, 10, 0, 100, 10, 200), null);
select pg_temp.eq('barème commun : Mots en orbite, belle partie acceptée', private.run_violation('lexique', 9000, 20, 0, 100, 20, 200), null);
select pg_temp.eq('Mots en orbite : série supérieure aux bonnes réponses', private.run_violation('lexique', 100, 9, 0, 100, 8, 70), 'plus de manches que de bonnes réponses');
select pg_temp.eq('version du serveur : Mots en orbite reconnu', (public.server_version()->'features'->>'lexique'), 'true');
select pg_temp.eq('jeu inconnu', private.run_violation('piratage', 1, 1, 0, 1, 1, 10), 'jeu inconnu');

select pg_temp.eq('refus d''une triche en partie libre', public.submit_run((select v from ctx where k='tok_nina'),'triche00001','math','standard','game',900000,50,0,100,50,100)->>'error', 'cheat');
select pg_temp.eq('la triche n''apparaît pas dans les parties', (select count(*) from public.runs where client_id='triche00001'), 0::bigint);
select pg_temp.eq('la triche est notée dans le journal', (select count(*) from private.cheat_log where game='math' and (values_->>'score')::int = 900000), 1::bigint);
-- plus de temps de jeu que de temps écoulé : une heure ne contient pas plus de 2 h de parties (deux appareils)
select pg_temp.eq('1 h de jeu : accepté', public.submit_run((select v from ctx where k='tok_nina'),'temps000001','math','standard','game',500,10,0,100,20,3600)->>'ok', 'true');
select pg_temp.eq('50 min de plus : accepté', public.submit_run((select v from ctx where k='tok_nina'),'temps000002','math','standard','game',500,10,0,100,20,3000)->>'ok', 'true');
select pg_temp.eq('au-delà de 2 h dans l''heure : refusé', public.submit_run((select v from ctx where k='tok_nina'),'temps000003','math','standard','game',500,10,0,100,20,600)->>'error', 'cheat');
select pg_temp.eq('le journal est inaccessible au navigateur', has_schema_privilege('anon', 'private', 'USAGE'), false);


-- ═══ Espace administrateur du site ═══
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'schoolX', public.create_school('École X')::text;
insert into ctx select 'classX', (public.create_class((select v::uuid from ctx where k='schoolX'), 'CE2 X')->>'id');
insert into ctx select 'stuX', public.add_students((select v::uuid from ctx where k='classX'), array['Ana','Ben','Chloé','Dan'])::text;
select pg_temp.as_admin();
insert into ctx select 'code_ana', (select v::jsonb->0->>'access_code' from ctx where k='stuX');
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003','proprio@atelier.fr');
insert into public.site_admins (user_id) values ('cccccccc-0000-0000-0000-000000000003');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('un enseignant n''est pas administrateur', public.admin_check(), false);
select pg_temp.fails($$select public.admin_overview()$$, 'forbidden');
select pg_temp.fails($$select public.admin_logs(10)$$, 'forbidden');
select pg_temp.fails($$select public.admin_school('$$||(select v from ctx where k='schoolB')||$$'::uuid)$$, 'forbidden');
select pg_temp.fails($$select count(*) from public.site_admins$$, 'permission denied');
select pg_temp.fails($$select count(*) from private.admin_audit$$, 'permission denied');

select pg_temp.as_anon();
select pg_temp.fails($$select public.admin_check()$$, 'permission denied');
select pg_temp.fails($$select public.admin_overview()$$, 'permission denied');

select pg_temp.as_admin();
insert into ctx select 'nsch', count(*)::text from public.schools;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.eq('l''administrateur est reconnu', public.admin_check(), true);
select pg_temp.eq('vue d''ensemble : toutes les écoles', (public.admin_overview()->'totals'->>'schools')::int, (select v::int from ctx where k='nsch'));
select pg_temp.eq('vue d''ensemble : liste des écoles', jsonb_array_length(public.admin_overview()->'schools'), (select v::int from ctx where k='nsch'));
select pg_temp.eq('14 jours de courbe', jsonb_array_length(public.admin_overview()->'daily'), 14);
select pg_temp.eq('détail d''une école : ses classes', jsonb_array_length(public.admin_school((select v::uuid from ctx where k='schoolX'))->'classes'), 1);
select pg_temp.eq('détail d''une école : ses élèves', jsonb_array_length(public.admin_school((select v::uuid from ctx where k='schoolX'))->'classes'->0->'students'), 4);
select pg_temp.eq('détail d''une école : ses enseignants', public.admin_school((select v::uuid from ctx where k='schoolX'))->'teachers'->0->>'email', 'a@ecole-a.fr');
select pg_temp.fails($$select public.admin_school('99999999-0000-0000-0000-000000000000'::uuid)$$, 'not_found');
-- jamais de code d'accès, quel que soit l'appel
select pg_temp.eq('aucun code d''accès dans le détail', (public.admin_school((select v::uuid from ctx where k='schoolX'))::text ~ 'access_code'), false);
select pg_temp.eq('aucun code élève dans le détail', position((select v from ctx where k='code_ana') in public.admin_school((select v::uuid from ctx where k='schoolX'))::text), 0);
select pg_temp.eq('aucun code élève dans le journal', position((select v from ctx where k='code_ana') in public.admin_logs(500)::text), 0);
select pg_temp.eq('le journal contient les parties', jsonb_typeof(public.admin_logs(5)->'runs'), 'array');
select pg_temp.eq('le journal contient les anomalies', (jsonb_array_length(public.admin_logs(50)->'flags') >= 1), true);
select pg_temp.eq('le journal contient les inscriptions', (jsonb_array_length(public.admin_logs(50)->'signups') >= 3), true);
select pg_temp.eq('limite bornée', jsonb_array_length(public.admin_logs(-5)->'runs') <= 1, true);
select pg_temp.as_admin();
select pg_temp.eq('chaque consultation est journalisée', (select count(*) >= 3 from private.admin_audit where admin_id = 'cccccccc-0000-0000-0000-000000000003'), true);
select pg_temp.eq('la consultation d''une école est tracée avec sa cible', (select count(*) >= 1 from private.admin_audit where action = 'school' and target is not null), true);


-- l'administrateur lit les compteurs
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.eq('famille : posé 8 fois (4+4+1+1+... hors limite)', (select (x->>'shown')::int from jsonb_array_elements(public.admin_item_stats('math','cm1')->'rules') x where x->>'item'='tables' limit 1) >= 8, true);
select pg_temp.eq('famille : 5 erreurs additionnées', (select (x->>'wrong')::int from jsonb_array_elements(public.admin_item_stats('math','cm1')->'rules') x where x->>'item'='tables' limit 1), 5);
select pg_temp.eq('calcul 7 × 8 : posé 3 fois, raté 2', (select x->>'shown' || '/' || (x->>'wrong') from jsonb_array_elements(public.admin_item_stats('math','cm1')->'items') x where x->>'item'='7 × 8'), '3/2');
select pg_temp.eq('mauvaises réponses fusionnées (54 et 56, une fois chacune)', (select (x->'picks'->>'54') || '/' || (x->'picks'->>'56') from jsonb_array_elements(public.admin_item_stats('math','cm1')->'items') x where x->>'item'='7 × 8'), '1/1');
select pg_temp.eq('familles : réponses fusionnées (54 choisi 3 fois)', (select (x->'picks'->>'54')::int from jsonb_array_elements(public.admin_item_stats('math','cm1')->'rules') x where x->>'item'='tables'), 3);
select pg_temp.eq('entrée invalide ignorée', (select count(*)::int from jsonb_array_elements(public.admin_item_stats('math','cm1')->'items') x where x->>'item'='trop'), 0);
select pg_temp.eq('les calculs vus moins de 3 fois sont masqués', (select count(*)::int from jsonb_array_elements(public.admin_item_stats('math','cm1')->'items') x where x->>'item'='9 × 6'), 0);
select pg_temp.eq('filtre par jeu', jsonb_array_length(public.admin_item_stats('spelling', null)->'rules'), 0);
select pg_temp.eq('aucun élève dans les compteurs', (public.admin_item_stats()::text ~* '(léa|tom|nina|student)'), false);
select pg_temp.eq('bilan d''équilibrage : 50 réussites, 28 erreurs', (select x->>'ok' || '/' || (x->>'err') from jsonb_array_elements(public.admin_balance()->'levels') x where x->>'game'='math' and x->>'level'='cm1' and x->>'difficulty'='standard'), '50/28');
select pg_temp.as_admin();
select pg_temp.eq('les consultations des compteurs sont tracées', (select count(*) >= 2 from private.admin_audit where action in ('item_stats','balance')), true);



-- ───────────────────────── Fiabilité (1.11) ─────────────────────────

-- Les limites se comptent sur l'heure de RÉCEPTION : des parties antidatées ne les contournent pas
select pg_temp.as_anon();
do $$
declare r jsonb; ok_n int := 0; limited boolean := false; i int;
begin
  for i in 1..70 loop
    r := public.submit_run((select v from ctx where k='tok_nina'), 'back' || lpad(i::text, 6, '0'), 'typing', 'standard', 'game', 100, 1, 30, 95, 40, 60,
                           (extract(epoch from now() - interval '20 days') * 1000)::bigint);
    if r->>'ok' = 'true' then ok_n := ok_n + 1;
    elsif r->>'error' = 'rate_limited' then limited := true; exit;
    else raise exception 'ÉCHEC : réponse inattendue %', r; end if;
  end loop;
  if not limited then raise exception 'ÉCHEC : 70 envois antidatés n''ont pas été limités'; end if;
  if ok_n > 60 then raise exception 'ÉCHEC : % envois acceptés en une minute (60 au plus)', ok_n; end if;
  raise notice 'ok  envois antidatés limités après % parties (heure de réception)', ok_n;
end $$;
select pg_temp.as_admin();
select pg_temp.eq('l''heure de réception n''est pas celle du navigateur', (select count(*) from public.runs where received_at < now() - interval '1 day'), 0::bigint);
select pg_temp.eq('l''heure annoncée est gardée pour l''affichage', (select count(*) > 0 from public.runs where client_id like 'back%' and played_at < now() - interval '19 days'), true);

-- Version du serveur : lue dans la base ; seul le nettoyage automatique (pg_cron) manque ici
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('server_version : rien ne manque sauf pg_cron (absent des tests)', public.server_version()->'missing', '["nettoyage_auto"]'::jsonb);
select pg_temp.as_anon();
select pg_temp.fails($q$select public.server_version()$q$, 'permission denied');
-- une vieille mise à jour rejouée par erreur est détectée
select pg_temp.as_admin();
create function pg_temp.old_submit() returns void language plpgsql as $$ begin null; end $$;
alter function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) rename to submit_run_new;
create function public.submit_run(p_token text, p_client_id text, p_game text, p_mode text, p_kind text, p_score integer, p_wave integer, p_wpm numeric, p_acc numeric, p_correct integer, p_duration integer, p_played_ms bigint default null, p_balance jsonb default null)
  returns jsonb language sql as $$ select '{"ok": true}'::jsonb $$;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('server_version : envoi sans contrôle détecté', (public.server_version()->'missing') @> '["securite","fiabilite"]'::jsonb, true);
select pg_temp.as_admin();
drop function public.submit_run(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb);
alter function public.submit_run_new(text, text, text, text, text, integer, integer, numeric, numeric, integer, integer, bigint, jsonb) rename to submit_run;

-- Inscription sur invitation
insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000004','d@ecole-d.fr'), ('eeeeeeee-0000-0000-0000-000000000005','e@ecole-e.fr');
update private.app_settings set value = 'on' where key = 'invite_only';
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select pg_temp.eq('sans invitation : pas le droit de créer une école', public.my_teacher_access(), '{"invite_only": true, "allowed": false}'::jsonb);
select pg_temp.fails($q$select public.create_school('École D')$q$, 'invitation_required');
select pg_temp.eq('mauvais code refusé', public.redeem_invitation('ZZZZ-ZZZZ'), false);
select pg_temp.fails($q$select public.admin_create_invitation('x', 1, 30)$q$, 'forbidden');
select pg_temp.fails($q$select public.admin_invitations()$q$, 'forbidden');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
insert into ctx select 'invite', public.admin_create_invitation('Collègues de test', 1, 30);
select pg_temp.eq('code d''invitation : 8 caractères', (select char_length(v) from ctx where k='invite'), 8);
select pg_temp.eq('l''administrateur voit l''invitation', (select x->>'uses' || '/' || (x->>'max_uses') from jsonb_array_elements(public.admin_invitations()->'items') x limit 1), '0/1');
select pg_temp.eq('un administrateur peut créer une école sans invitation', public.my_teacher_access()->>'allowed', 'true');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select pg_temp.eq('bon code accepté (minuscules et tiret tolérés)', public.redeem_invitation(lower(substr((select v from ctx where k='invite'),1,4)||'-'||substr((select v from ctx where k='invite'),5))), true);
select pg_temp.eq('après invitation : école créée', (public.create_school('École D') is not null), true);
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select pg_temp.eq('invitation à usage unique : épuisée', public.redeem_invitation((select v from ctx where k='invite')), false);
select pg_temp.fails($q$select public.create_school('École E')$q$, 'invitation_required');
-- limite d'essais : 8 refus par 10 minutes
do $$ declare i int; begin for i in 1..7 loop perform public.redeem_invitation('QQQQQQQQ'); end loop; end $$;
select pg_temp.fails($q$select public.redeem_invitation('QQQQQQQQ')$q$, 'rate_limited');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select public.admin_revoke_invitation((select v from ctx where k='invite'));
select public.admin_set_invite_only(false);
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select pg_temp.eq('invitations désactivées : tout le monde peut créer une école', public.my_teacher_access()->>'allowed', 'true');
select pg_temp.as_admin();
select pg_temp.eq('les actions d''invitation sont tracées', (select count(*) >= 3 from private.admin_audit where action in ('invitation_create','invitation_revoke','invite_only')), true);
select pg_temp.eq('un enseignant déjà installé garde son droit si les invitations reviennent', (select private.can_create_school('aaaaaaaa-0000-0000-0000-000000000001')), true);

-- Conservation limitée : les vieilles parties et les élèves sans activité partent
update public.runs set received_at = now() - interval '500 days' where client_id = 'run0000004';
update public.students set created_at = now() - interval '500 days' where name = 'Max';
select pg_temp.eq('nettoyage : une partie de plus de 13 mois effacée', (private.purge_old_data()->>'runs')::int >= 1, true);
select pg_temp.eq('nettoyage : la partie ancienne a disparu', (select count(*) from public.runs where client_id = 'run0000004'), 0::bigint);
select pg_temp.eq('nettoyage : les parties récentes sont gardées', (select count(*) > 0 from public.runs where client_id like 'back%'), true);
select pg_temp.eq('nettoyage : un élève ancien sans partie est effacé', (select count(*) from public.students where name = 'Max'), 0::bigint);
select pg_temp.as_anon();
select pg_temp.fails($q$select private.purge_old_data()$q$, 'permission denied');
select pg_temp.as_admin();


-- Sessions élèves : 30 jours, prolongées tant que l'élève joue
select pg_temp.as_admin();
select pg_temp.eq('session élève : 30 jours', (select expires_at between now() + interval '29 days' and now() + interval '31 days' from public.student_sessions where token_hash = private.hash_token((select v from ctx where k='tok_nina'))), true);
update public.student_sessions set expires_at = now() + interval '5 days' where token_hash = private.hash_token((select v from ctx where k='tok_nina'));
select pg_temp.as_anon();
select public.submit_run((select v from ctx where k='tok_nina'),'renew000001','typing','standard','game',100,1,30,95,40,60);
select pg_temp.as_admin();
select pg_temp.eq('session prolongée par l''envoi d''une partie', (select expires_at > now() + interval '29 days' from public.student_sessions where token_hash = private.hash_token((select v from ctx where k='tok_nina'))), true);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('server_version : sessions de 30 jours détectées', (public.server_version()->'features'->>'sessions'), 'true');
select pg_temp.as_admin();


-- Codes hachés : régénération d'une classe, rien en clair, ancien code refusé
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx select 'regen', public.reset_class_codes((select v::uuid from ctx where k='classX'))::text;
select pg_temp.eq('reset_class_codes : un code par élève', jsonb_array_length((select v::jsonb from ctx where k='regen')), (select count(*)::int from public.students where class_id = (select v::uuid from ctx where k='classX')));
select pg_temp.as_admin();
select pg_temp.eq('les nouveaux codes ne sont pas stockés', (select count(*) from public.students where access_code is not null), 0::bigint);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.as_anon();
select pg_temp.eq('ancien code refusé après régénération de la classe', public.student_login((select v from ctx where k='code_ana'))->>'error', 'invalid_code');
select pg_temp.eq('nouveau code accepté (hors majuscules et espaces)', public.student_login(' ' || lower((select v::jsonb->0->>'access_code' from ctx where k='regen')) || ' ')->'student'->>'name', (select v::jsonb->0->>'name' from ctx where k='regen'));
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.fails($$select public.reset_class_codes('$$||(select v from ctx where k='classX')||$$'::uuid)$$, 'forbidden');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('server_version : codes hachés détectés', (public.server_version()->'features'->>'codes'), 'true');
select pg_temp.as_admin();

-- Grotte par classe + observation en lecture seule de l'administrateur
select pg_temp.as_anon();
select pg_temp.eq('cave_report accepté', public.cave_report((select v from ctx where k='tok_nina'),'renew000001',7,3)->>'ok','true');
select pg_temp.eq('cave_report : second envoi sans effet', public.cave_report((select v from ctx where k='tok_nina'),'renew000001',99,99)->>'ok','true');
select pg_temp.eq('grotte de la classe : encre', public.cave_get((select v from ctx where k='tok_nina'))->>'ink','7');
select pg_temp.eq('grotte de la classe : puissance', public.cave_get((select v from ctx where k='tok_nina'))->>'power','3');
select pg_temp.eq('cave_drop : partie sans bonne réponse comptée', public.cave_drop((select v from ctx where k='tok_nina'),'drop-0000001',5,0)->>'ok','true');
select pg_temp.eq('cave_drop : même identifiant, aucun doublon', public.cave_drop((select v from ctx where k='tok_nina'),'drop-0000001',5,0)->>'ok','true');
select pg_temp.eq('cave_drop : identifiant invalide refusé', public.cave_drop((select v from ctx where k='tok_nina'),'../x',5,0)->>'error','invalid_data');
select pg_temp.eq('cave_drop : mauvais jeton refusé', public.cave_drop('nimportequoi','drop-0000002',5,0)->>'error','invalid_session');
select pg_temp.eq('grotte de la classe : encre avec la goutte (7 + 5)', public.cave_get((select v from ctx where k='tok_nina'))->>'ink','12');
select pg_temp.eq('jeton d''observation refusé à un anonyme', public.cave_get('obs:'||gen_random_uuid()::text)->>'error','invalid_session');
select pg_temp.fails($$select public.admin_observe('student', gen_random_uuid())$$, 'permission denied');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.fails($$select public.admin_observe('school', gen_random_uuid())$$, 'forbidden');
select pg_temp.fails($$select public.teacher_cave_reset(array[gen_random_uuid()])$$, 'forbidden');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.eq('admin : voit la grotte d''une classe', (public.cave_get('obs:'||(select id::text from public.students where name = (select name from public.students where class_id=(select class_id from public.runs where client_id='renew000001') limit 1) limit 1))->>'ink') is not null, true);
select pg_temp.eq('admin : observe un élève', public.admin_observe('student', (select student_id from public.runs where client_id='renew000001'))->'student'->>'name' is not null, true);
select pg_temp.eq('admin : lit les écoles', (select count(*) > 0 from public.schools), true);
select pg_temp.fails($$select access_code from public.students$$, 'permission denied');
select pg_temp.fails($$select code_hash from public.students$$, 'permission denied');
update public.students set name = 'x' where true;
delete from public.runs where true;
select pg_temp.as_admin();
select pg_temp.eq('admin : aucune modification d''élève possible', (select count(*) from public.students where name = 'x'), 0::bigint);
select pg_temp.eq('admin : aucune partie supprimée', (select count(*) from public.runs where client_id='renew000001'), 1::bigint);
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.fails($$select public.teacher_cave_reset(array[(select class_id from public.runs where client_id='renew000001')])$$, 'forbidden');
select pg_temp.fails($$select public.teacher_cave_win(array[(select class_id from public.runs where client_id='renew000001')])$$, 'forbidden');
select pg_temp.fails($$select public.reset_class_codes((select class_id from public.runs where client_id='renew000001'))$$, 'forbidden');
select pg_temp.eq('admin : ne voit pas le code en clair dans l''aperçu', (select count(*) from jsonb_array_elements(public.class_overview((select class_id from public.runs where client_id='renew000001'))) e where e->>'access_code' is not null), 0::bigint);
select pg_temp.eq('admin : enseignant, résultats de séance en lecture', public.list_class_sessions((select class_id from public.runs where client_id='renew000001')) is not null, true);
select pg_temp.as_admin();
select pg_temp.eq('admin : l''observation est journalisée', (select count(*) from private.admin_audit where action='observe_student'), 1::bigint);
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq('enseignant : voit la grotte de ses classes', public.teacher_cave(null)->>'classes' is not null, true);
select pg_temp.as_admin();

\echo TOUS LES TESTS SQL PASSENT
