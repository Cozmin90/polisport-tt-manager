lock table public.privacy_events in share row exclusive mode;
-- Retain exactly the newest stored choice per person and purpose.
delete from public.privacy_events old
using public.privacy_events newer
where old.user_id=newer.user_id and old.kind=newer.kind and old.id<newer.id;
alter table public.privacy_events add constraint privacy_one_current_choice unique(user_id,kind);

create function privacy_private.replace_current_choice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and auth.uid() <> new.user_id then
   raise insufficient_privilege using message='Cannot change another user preference';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('privacy:' || new.user_id::text || ':' || new.kind,0));
 delete from public.privacy_events where user_id=new.user_id and kind=new.kind;
 new.created_at := clock_timestamp();
 return new;
end;
$$;
revoke all on function privacy_private.replace_current_choice() from public,anon,authenticated;
create trigger replace_current_privacy_choice before insert on public.privacy_events
 for each row execute function privacy_private.replace_current_choice();
