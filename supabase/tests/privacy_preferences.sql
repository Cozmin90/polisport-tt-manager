-- Run after the schema, inside a transaction; fixtures never persist.
begin;
do $$
declare uid uuid := gen_random_uuid(); other_id uuid := gen_random_uuid(); admin_id uuid := gen_random_uuid(); n integer;
begin
 perform set_config('privacy.test_uid',uid::text,true);
 perform set_config('privacy.test_other',other_id::text,true);
 perform set_config('privacy.test_admin',admin_id::text,true);
 insert into auth.users(id,raw_user_meta_data) values
 (uid,'{"first_name":"Privacy","last_name":"Test","privacy_version":"2026-09-11.1","privacy_notice_read":true,"media_consent":true}'),
 (other_id,'{"first_name":"Privacy","last_name":"Other"}'),
 (admin_id,'{"first_name":"Privacy","last_name":"Admin"}');
 update public.players set is_admin=true where id=admin_id;
 select count(*) into n from public.privacy_events where user_id=uid;
 if n<>2 then raise exception 'Signup events missing'; end if;
 if exists(select 1 from public.privacy_events where user_id=other_id) then raise exception 'Implicit consent'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('privacy.test_uid'),true);
do $$
declare n integer;
begin
 select count(*) into n from public.privacy_events;
 if n<>2 then raise exception 'Owner read failed'; end if;
 insert into public.privacy_events(user_id,kind,accepted,version) values
 (current_setting('privacy.test_uid')::uuid,'media',false,'2026-09-11.1');
 if (select accepted from public.privacy_preferences where user_id=current_setting('privacy.test_uid')::uuid and kind='media') then raise exception 'Withdrawal not current'; end if;
 begin
  insert into public.privacy_events(user_id,kind,accepted,version) values(current_setting('privacy.test_other')::uuid,'media',true,'2026-09-11.1');
  raise exception 'Cross-user insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.privacy_events set accepted=true;
  raise exception 'History mutable';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.privacy_events;
  raise exception 'History deletable';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.privacy_events(user_id,kind,accepted,version,created_at) values(current_setting('privacy.test_uid')::uuid,'media',true,'2026-09-11.1',now());
  raise exception 'Timestamp forgery allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.players set is_admin=true where id=current_setting('privacy.test_uid')::uuid;
  raise exception 'Role escalation allowed';
 exception when raise_exception then
  if sqlerrm <> 'Administrator role cannot be changed from a client' then raise; end if;
 end;
 update public.players set first_name='Privacy' where id=current_setting('privacy.test_uid')::uuid;
end $$;
select set_config('request.jwt.claim.sub',current_setting('privacy.test_other'),true);
do $$ begin
 if exists(select 1 from public.privacy_events) or exists(select 1 from public.privacy_preferences) then raise exception 'Other user can read private data'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('privacy.test_admin'),true);
do $$ begin
 if (select count(*) from public.privacy_events where user_id=current_setting('privacy.test_uid')::uuid) <> 3 then raise exception 'Admin read failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
 perform * from public.privacy_events; raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.users set raw_user_meta_data=raw_user_meta_data || '{"media_consent":true}'::jsonb where id=current_setting('privacy.test_uid')::uuid;
do $$ begin
 if (select accepted from public.privacy_preferences where user_id=current_setting('privacy.test_uid')::uuid and kind='media') then raise exception 'Metadata replay restored consent'; end if;
end $$;
rollback;
