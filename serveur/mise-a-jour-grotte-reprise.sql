-- Reprise de la grotte (version 1.26) — à exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run), après mise-a-jour-grotte.sql.
-- Sans danger si exécutée plusieurs fois.
--
-- Pourquoi : les compteurs de la grotte n'existent que depuis la version 1.18. Les parties envoyées avant n'ont ni fautes ni réussites
-- enregistrées pour la grotte : la créature d'une classe qui joue depuis longtemps restait à 10 points de vie.
-- Ici on les reconstitue depuis ce que le serveur sait déjà de chaque partie (réussites et précision) :
--   fautes ≈ réussites × (100 − précision) / précision ; pour « Le facteur » : colis rangés − colis rangés du premier coup.
-- C'est une estimation (anonyme, par classe), faite une seule fois par partie, et seulement depuis la rentrée (1er août).
-- Les parties de séance et celles reçues depuis moins de 10 minutes (leur compteur exact peut encore arriver) sont laissées de côté.

update public.runs r
   set cave_power = least(500, r.correct),
       cave_ink   = least(500, greatest(0,
         case when r.game = 'facteur' then r.correct - r.wave
              else round(r.correct * (100 - r.acc) / greatest(r.acc, 1)) end))
 where r.cave_ink is null
   and r.session_id is null
   and r.received_at >= private.cave_start()
   and r.received_at < now() - interval '10 minutes';

insert into private.schema_migrations (id) values ('2026-11-grotte-reprise') on conflict (id) do nothing;
