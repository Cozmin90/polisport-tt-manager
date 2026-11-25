-- Training notifications: durable per-account read state; live pending queue for admins.
create table training.notifications (
 booking_id uuid primary key references training.bookings(id) on delete cascade,
 event_id uuid not null unique default gen_random_uuid(),
 player uuid not null,
 status text not null check(status in ('CONFIRMED','REJECTED','CANCELLED')),
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz
);
create index training_notifications_unread on training.notifications(player,created_at desc) where read_at is null;
alter table training.notifications enable row level security;
revoke all on training.notifications from public,anon,authenticated;

create function training.booking_notification() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status is not distinct from old.status then return new; end if;
 if new.status in ('CONFIRMED','REJECTED','CANCELLED') then
   -- A participant already knows about their own cancellation.
   -- Replace the previous notification so an outdated approval is never shown.
   if new.status='CANCELLED' and auth.uid()=new.player then
     update training.notifications set read_at=clock_timestamp() where booking_id=new.id;
   else
     insert into training.notifications(booking_id,player,status)
       values(new.id,new.player,new.status)
     on conflict(booking_id) do update set event_id=gen_random_uuid(), status=excluded.status,
       player=excluded.player,created_at=clock_timestamp(),read_at=null;
   end if;
 elsif new.status='COMPLETED' then
   update training.notifications set read_at=clock_timestamp() where booking_id=new.id;
 end if;
 return new;
end $$;
revoke all on function training.booking_notification() from public,anon,authenticated;
create trigger training_booking_notification after update of status on training.bookings
for each row execute function training.booking_notification();

-- Existing future confirmations should also appear once after release.
insert into training.notifications(booking_id,player,status,created_at)
 select b.id,b.player,b.status,b.updated_at from training.bookings b
 join training.slots s on s.id=b.slot_id
 where b.status='CONFIRMED' and not s.cancelled and s.starts>statement_timestamp()
 on conflict(booking_id) do nothing;

create function training.notification_portal(action text, ids uuid[] default '{}'::uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); pending_count int:=0; voucher_count int:=0;
begin
 if uid is null then raise exception 'Autentifică-te mai întâi.' using errcode='42501'; end if;
 if action is null or action not in ('view','read') then raise exception 'Acțiune necunoscută.'; end if;
 if action='read' then
   if cardinality(coalesce(ids,'{}'::uuid[]))>100 then raise exception 'Prea multe notificări.'; end if;
   update training.notifications n set read_at=clock_timestamp()
     where n.player=uid and n.read_at is null and n.event_id=any(ids);
 end if;
 if coalesce(public.is_admin(),false) then
   select count(*)::int,count(*) filter(where b.voucher_id is not null)::int
    into pending_count,voucher_count from training.bookings b join training.slots s on s.id=b.slot_id
    where b.status='PENDING' and not s.cancelled and s.starts>statement_timestamp();
 end if;
 return jsonb_build_object('pending',pending_count,'pending_voucher',voucher_count,
   'unread',(select count(*) from training.notifications n where n.player=uid and n.read_at is null),
   'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id)
     from (select n.event_id as id,n.status,n.created_at,s.starts,s.ends,s.coach,s.location
     from training.notifications n join training.bookings b on b.id=n.booking_id join training.slots s on s.id=b.slot_id
     where n.player=uid and n.read_at is null order by n.created_at desc,n.event_id limit 50) x),'[]'::jsonb));
end $$;
revoke all on function training.notification_portal(text,uuid[]) from public,anon,authenticated;
grant execute on function training.notification_portal(text,uuid[]) to authenticated;
create function public.training_notifications(action text default 'view',ids uuid[] default '{}'::uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select training.notification_portal(action,ids); $$;
revoke all on function public.training_notifications(text,uuid[]) from public,anon,authenticated;
grant execute on function public.training_notifications(text,uuid[]) to authenticated;
