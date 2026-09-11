create schema if not exists privacy_private;
revoke all on schema privacy_private from public, anon, authenticated;

create table public.privacy_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('privacy_notice','media')),
 accepted boolean not null,
 version text not null check (version = '2026-09-11.1'),
 created_at timestamptz not null default clock_timestamp(),
 check (kind <> 'privacy_notice' or accepted)
);
create index privacy_events_user_kind_id_idx on public.privacy_events(user_id,kind,id desc);
alter table public.privacy_events enable row level security;
revoke all on public.privacy_events from public, anon, authenticated;
grant select on public.privacy_events to authenticated;
grant insert (user_id,kind,accepted,version) on public.privacy_events to authenticated;
grant usage on sequence public.privacy_events_id_seq to authenticated;
create policy privacy_events_read on public.privacy_events for select to authenticated
 using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy privacy_events_insert on public.privacy_events for insert to authenticated
 with check ((select auth.uid()) = user_id);

create view public.privacy_preferences with (security_invoker=true) as
 select distinct on (user_id,kind) id,user_id,kind,accepted,version,created_at
 from public.privacy_events order by user_id,kind,id desc;
revoke all on public.privacy_preferences from public,anon,authenticated;
grant select on public.privacy_preferences to authenticated;

-- Protect the database role flag used by the administrator read policy.
-- Regular profile edits and service-role administration remain available.
create function privacy_private.protect_admin_flag() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if current_user in ('authenticated','anon') then
   if TG_OP = 'INSERT' then
     if coalesce(new.is_admin,false) then raise exception 'Administrator role cannot be assigned from a client'; end if;
   elsif new.is_admin is distinct from old.is_admin then
     raise exception 'Administrator role cannot be changed from a client';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function privacy_private.protect_admin_flag() from public,anon,authenticated;
create trigger protect_privacy_admin_flag before insert or update of is_admin on public.players
 for each row execute function privacy_private.protect_admin_flag();

-- Runs only for an actual auth.users INSERT; client metadata is input consent,
-- never authorization. Later metadata edits and logins cannot restore consent.
create function privacy_private.capture_signup_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.raw_user_meta_data->>'privacy_version' = '2026-09-11.1'
    and new.raw_user_meta_data->'privacy_notice_read' = 'true'::jsonb then
   insert into public.privacy_events(user_id,kind,accepted,version)
   values(new.id,'privacy_notice',true,'2026-09-11.1');
   if new.raw_user_meta_data->'media_consent' in ('true'::jsonb,'false'::jsonb) then
     insert into public.privacy_events(user_id,kind,accepted,version)
     values(new.id,'media',new.raw_user_meta_data->'media_consent' = 'true'::jsonb,'2026-09-11.1');
   end if;
 end if;
 return new;
end;
$$;
revoke all on function privacy_private.capture_signup_preferences() from public,anon,authenticated;
create trigger capture_signup_privacy after insert on auth.users
 for each row execute function privacy_private.capture_signup_preferences();
