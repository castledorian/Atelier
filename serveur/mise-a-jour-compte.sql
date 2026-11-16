-- Mise à jour « Suppression de son compte » : permet à un enseignant de supprimer lui-même son compte (droit à l'effacement).
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor → New query → Run. Aucune donnée n'est touchée par cette mise à jour.
--
-- Règles (elles sont aussi expliquées à l'enseignant avant qu'il confirme) :
--  · une école dont il est le SEUL enseignant est supprimée avec ses classes, ses élèves et leurs scores ;
--  · une école qui a d'autres enseignants reste ; si l'enseignant était le seul administrateur, le plus ancien collègue le devient ;
--  · le compte (adresse e-mail, mot de passe) est supprimé définitivement ;
--  · la fonction exige que l'enseignant recopie son adresse e-mail : un appel accidentel est refusé.

-- Aperçu : les écoles de l'enseignant et ce qu'elles contiennent (pour lui montrer ce qui va disparaître).
create or replace function public.account_deletion_preview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'name', s.name,
        'members', (select count(*) from public.school_members x where x.school_id = s.id),
        'classes', (select count(*) from public.classes c where c.school_id = s.id),
        'students', (select count(*) from public.students st where st.school_id = s.id)
      ) order by s.name)
    from public.school_members m
    join public.schools s on s.id = m.school_id
    where m.user_id = auth.uid()
  ), '[]'::jsonb);
end $$;

create or replace function public.delete_my_account(p_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_mail    text;
  v_s       record;
  v_next    uuid;
  v_deleted integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select lower(email) into v_mail from auth.users where id = v_uid;
  if v_mail is null or lower(btrim(coalesce(p_email, ''))) <> v_mail then
    raise exception 'confirmation_mismatch' using errcode = '22023';
  end if;

  for v_s in select school_id, role from public.school_members where user_id = v_uid loop
    if not exists (select 1 from public.school_members where school_id = v_s.school_id and user_id <> v_uid) then
      -- seul enseignant de l'école : l'école et ses données disparaissent avec lui
      delete from public.schools where id = v_s.school_id;
      v_deleted := v_deleted + 1;
    elsif v_s.role = 'admin'
          and not exists (select 1 from public.school_members where school_id = v_s.school_id and user_id <> v_uid and role = 'admin') then
      -- dernier administrateur : on transmet le rôle au collègue le plus ancien
      select user_id into v_next from public.school_members
        where school_id = v_s.school_id and user_id <> v_uid order by created_at limit 1;
      update public.school_members set role = 'admin' where school_id = v_s.school_id and user_id = v_next;
    end if;
  end loop;

  delete from auth.users where id = v_uid;   -- supprime aussi ses appartenances (cascade)
  return jsonb_build_object('ok', true, 'schools_deleted', v_deleted);
end $$;

revoke all on function public.account_deletion_preview() from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.account_deletion_preview() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
