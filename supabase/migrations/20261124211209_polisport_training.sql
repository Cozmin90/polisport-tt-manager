-- PoliSport Training. Private data, explicit RPC access, atomic reservations.
create schema training;
revoke all on schema training from public, anon, authenticated;
create table training.slots (
 id uuid primary key default gen_random_uuid(),
 starts timestamptz not null, ends timestamptz not null,
 coach text not null check(length(trim(coach)) between 1 and 100),
 location text not null check(length(trim(location)) between 1 and 160),
 notes text not null default '' check(length(notes)<=1000),
 kind text not null check(kind in ('individual','group')),
 capacity int not null check(capacity between 1 and 30),
 accepts_vouchers boolean not null default true,
 reserved_vouchers int not null default 0 check(reserved_vouchers>=0 and reserved_vouchers<=capacity),
 approval boolean not null default true,
 cancelled boolean not null default false,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 check(isfinite(starts) and isfinite(ends) and ends>starts and ends-starts<=interval '12 hours'),
 check(kind<>'individual' or capacity=1),
 check(accepts_vouchers or reserved_vouchers=0)
);
create table training.vouchers (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source in ('beerpong','gift','admin')),
 owner uuid,
 serial text not null check(length(serial) between 1 and 100),
 code text unique,
 edition uuid references beerpong.editions(id),
 created_at timestamptz not null default now(),
 check(source<>'beerpong' or (edition is not null and owner is not null and code is null)),
 check(source<>'gift' or code is not null),
 unique(edition,owner)
);
create table training.bookings (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references training.slots(id),
 player uuid not null,
 voucher_id uuid references training.vouchers(id),
 status text not null check(status in ('PENDING','CONFIRMED','COMPLETED','CANCELLED','REJECTED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index training_one_active_per_slot on training.bookings(slot_id,player) where status in ('PENDING','CONFIRMED','COMPLETED');
create unique index training_one_use_per_voucher on training.bookings(voucher_id) where voucher_id is not null and status in ('PENDING','CONFIRMED','COMPLETED');
create index training_booking_player on training.bookings(player,created_at desc);
create index training_booking_slot on training.bookings(slot_id,status);
create index training_voucher_owner on training.vouchers(owner);
alter table training.slots enable row level security;
alter table training.vouchers enable row level security;
alter table training.bookings enable row level security;
revoke all on all tables in schema training from public, anon, authenticated;

-- Existing prizes are identified by edition AND account, never by a public serial alone.
create function training.sync_prizes(uid uuid) returns void
language sql set search_path='' as $$
 insert into training.vouchers(source,owner,serial,edition)
 select 'beerpong',uid,lpad(win.voucher::text,greatest(3,length(win.voucher::text)),'0'),e.id
 from beerpong.editions e cross join lateral beerpong.board(e,statement_timestamp()) win
 where e.ends<=statement_timestamp() and win.player=uid and win.voucher is not null
 on conflict(edition,owner) do nothing;
$$;
revoke all on function training.sync_prizes(uuid) from public,anon,authenticated;

create function training.portal(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();
 admin boolean:=false;
 s training.slots%rowtype;
 booking training.bookings%rowtype;
 voucher training.vouchers%rowtype;
 sid uuid;
 vid uuid;
 player_id uuid;
 start_local timestamp;
 end_local timestamp;
 repeats int;
 cap int;
 reserve int;
 accept_v boolean;
 approval_v boolean;
 kind_v text;
 count_confirmed int;
 count_standard int;
 st text;
 gift_code text;
 label_v text;
 i int;
 result jsonb;
begin
 if action is null or action not in ('view','request','cancel','claim','publish','manage','cancel_slot','issue','find_players') then
   raise exception 'Acțiune necunoscută.';
 end if;
 payload:=coalesce(payload,'{}'::jsonb);
 if uid is not null then admin:=coalesce(public.is_admin(),false); end if;
 if action<>'view' and uid is null then raise exception 'Autentifică-te mai întâi.' using errcode='42501'; end if;
 if action in ('publish','manage','cancel_slot','issue','find_players') and not admin then
   raise exception 'Acces rezervat administratorilor.' using errcode='42501';
 end if;
 if action='view' then
   if uid is not null then perform training.sync_prizes(uid); end if;
   return jsonb_build_object('admin',admin,
    'slots',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sl.id,'starts',sl.starts,'ends',sl.ends,'coach',sl.coach,'location',sl.location,
      'notes',sl.notes,'kind',sl.kind,'capacity',sl.capacity,'accepts_vouchers',sl.accepts_vouchers,
      'reserved_vouchers',sl.reserved_vouchers,'approval',sl.approval,'cancelled',sl.cancelled,
      'free',greatest(0,sl.capacity-c.total),
      'standard_free',greatest(0,least(sl.capacity-c.total,sl.capacity-sl.reserved_vouchers-c.standard)),
      'pending',c.pending) order by sl.starts,sl.id)
      from training.slots sl cross join lateral (
       select count(*) filter(where bk.status in ('CONFIRMED','COMPLETED'))::int total,
        count(*) filter(where bk.status in ('CONFIRMED','COMPLETED') and bk.voucher_id is null)::int standard,
        count(*) filter(where bk.status='PENDING')::int pending
       from training.bookings bk where bk.slot_id=sl.id) c
      where (not sl.cancelled and sl.starts>statement_timestamp())
       or (admin and sl.ends>statement_timestamp()-interval '90 days')
       or exists(select 1 from training.bookings bk where bk.slot_id=sl.id and bk.player=uid)),'[]'::jsonb),
    'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',bk.id,'slot_id',bk.slot_id,'status',bk.status,
      'name',case when admin then coalesce(nullif(trim(pl.full_name),''),nullif(trim(pl.display_name),''),'Jucător') else null end,
      'voucher_serial',vv.serial,'voucher_source',vv.source,'created_at',bk.created_at,'mine',bk.player=uid)
      order by (vv.id is not null) desc,bk.created_at,bk.id)
      from training.bookings bk join training.slots sl on sl.id=bk.slot_id
      left join training.vouchers vv on vv.id=bk.voucher_id left join public.players pl on pl.id=bk.player
      where bk.player=uid or (admin and sl.ends>statement_timestamp()-interval '90 days')),'[]'::jsonb),
    'vouchers',coalesce((select jsonb_agg(jsonb_build_object('id',vv.id,'serial',vv.serial,'source',vv.source,
      'edition_title',e.title,'state',case when exists(select 1 from training.bookings bk where bk.voucher_id=vv.id and bk.status='COMPLETED') then 'USED'
       when exists(select 1 from training.bookings bk where bk.voucher_id=vv.id and bk.status in ('PENDING','CONFIRMED')) then 'RESERVED' else 'AVAILABLE' end)
      order by vv.created_at desc) from training.vouchers vv left join beerpong.editions e on e.id=vv.edition where vv.owner=uid),'[]'::jsonb),
    'issued',case when admin then coalesce((select jsonb_agg(jsonb_build_object('serial',vv.serial,'code',case when vv.owner is null then vv.code else null end,
      'source',vv.source,'claimed',vv.owner is not null,'state',case when exists(select 1 from training.bookings bk where bk.voucher_id=vv.id and bk.status='COMPLETED') then 'USED'
      when exists(select 1 from training.bookings bk where bk.voucher_id=vv.id and bk.status in ('PENDING','CONFIRMED')) then 'RESERVED' else 'AVAILABLE' end) order by vv.created_at desc)
      from training.vouchers vv where vv.source in ('gift','admin')),'[]'::jsonb) else '[]'::jsonb end);
 end if;
 if action='find_players' then
   if length(trim(coalesce(payload->>'query','')))<2 then return '[]'::jsonb; end if;
   return coalesce((select jsonb_agg(to_jsonb(p)) from (select pl.id,coalesce(nullif(trim(pl.full_name),''),nullif(trim(pl.display_name),''),'Jucător') name
     from public.players pl join auth.users au on au.id=pl.id
     where strpos(lower(coalesce(pl.full_name,'')||' '||coalesce(pl.display_name,'')),lower(trim(payload->>'query')))>0
     order by name limit 20) p),'[]'::jsonb);
 end if;
 -- Serialize writes; checking capacity, voucher use and overlapping bookings is atomic.
 perform pg_advisory_xact_lock(79268431::bigint);
 if action='publish' then
   start_local:=(payload->>'starts')::timestamp; end_local:=(payload->>'ends')::timestamp;
   repeats:=coalesce((payload->>'weeks')::int,1); cap:=(payload->>'capacity')::int;
   reserve:=coalesce((payload->>'reserved_vouchers')::int,0);
   accept_v:=coalesce((payload->>'accepts_vouchers')::boolean,true);
   approval_v:=coalesce((payload->>'approval')::boolean,true); kind_v:=payload->>'kind';
   if start_local is null or end_local is null or end_local<=start_local or not isfinite(start_local) or not isfinite(end_local)
     or start_local at time zone 'Europe/Bucharest'<=statement_timestamp() or end_local-start_local>interval '12 hours'
     or repeats not between 1 and 12 then raise exception 'Verifică intervalul și recurența.'; end if;
   for i in 0..repeats-1 loop
     insert into training.slots(starts,ends,coach,location,notes,kind,capacity,accepts_vouchers,reserved_vouchers,approval,created_by)
     values ((start_local+i*interval '1 week') at time zone 'Europe/Bucharest',(end_local+i*interval '1 week') at time zone 'Europe/Bucharest',
      trim(payload->>'coach'),trim(payload->>'location'),trim(coalesce(payload->>'notes','')),kind_v,cap,accept_v,reserve,approval_v,uid);
   end loop;
   return jsonb_build_object('created',repeats);
 elsif action='issue' then
   label_v:=trim(coalesce(payload->>'serial',''));
   if length(label_v) not between 1 and 100 then raise exception 'Introdu numărul voucherului.'; end if;
   player_id:=nullif(payload->>'player','')::uuid;
   if player_id is not null and not exists(select 1 from public.players pl join auth.users au on au.id=pl.id where pl.id=player_id) then
     raise exception 'Jucătorul nu are un cont valid.';
   end if;
   gift_code:=case when player_id is null then replace(gen_random_uuid()::text,'-','') else null end;
   insert into training.vouchers(source,owner,serial,code) values(case when player_id is null then 'gift' else 'admin' end,player_id,label_v,gift_code)
     returning id into vid;
   return jsonb_build_object('id',vid,'code',gift_code,'serial',label_v);
 elsif action in ('claim','request') then
   if not exists(select 1 from public.players pl where pl.id=uid) then raise exception 'Completează mai întâi profilul de jucător.'; end if;
   perform training.sync_prizes(uid);
   gift_code:=lower(replace(trim(coalesce(payload->>'code','')),'-',''));
   vid:=nullif(payload->>'voucher','')::uuid;
   if gift_code<>'' and vid is not null then raise exception 'Alege un singur voucher.'; end if;
   if gift_code<>'' then
     select * into voucher from training.vouchers vv where vv.code=gift_code and (vv.owner is null or vv.owner=uid) for update;
     if not found then raise exception 'Cod de voucher invalid sau deja revendicat.'; end if;
     if voucher.owner is null then update training.vouchers set owner=uid where id=voucher.id; end if;
     vid:=voucher.id;
   elsif vid is not null then
     select * into voucher from training.vouchers vv where vv.id=vid and vv.owner=uid for update;
     if not found then raise exception 'Voucher indisponibil.'; end if;
   end if;
   if action='claim' then
     if gift_code='' then raise exception 'Introdu codul unic al voucherului.'; end if;
     return jsonb_build_object('claimed',true);
   end if;
   sid:=(payload->>'slot')::uuid;
   select * into s from training.slots sl where sl.id=sid for update;
   if not found or s.cancelled or s.starts<=clock_timestamp() then raise exception 'Intervalul nu mai este disponibil.'; end if;
   if vid is not null then
     if not s.accepts_vouchers then raise exception 'Acest interval nu acceptă vouchere.'; end if;
     if exists(select 1 from training.bookings bk where bk.voucher_id=vid and bk.status in ('PENDING','CONFIRMED','COMPLETED')) then
       raise exception 'Voucherul este deja rezervat sau utilizat.';
     end if;
   end if;
   if exists(select 1 from training.bookings bk join training.slots sl on sl.id=bk.slot_id
    where bk.player=uid and bk.status in ('PENDING','CONFIRMED') and sl.starts<s.ends and sl.ends>s.starts) then
     raise exception 'Ai deja o rezervare sau cerere care se suprapune acestui interval.';
   end if;
   select count(*)::int,count(*) filter(where bk.voucher_id is null)::int into count_confirmed,count_standard
     from training.bookings bk where bk.slot_id=s.id and bk.status in ('CONFIRMED','COMPLETED');
   if count_confirmed>=s.capacity or (vid is null and count_standard>=s.capacity-s.reserved_vouchers) then
     raise exception 'Nu mai sunt locuri disponibile pentru acest tip de rezervare.';
   end if;
   st:=case when s.approval then 'PENDING' else 'CONFIRMED' end;
   insert into training.bookings(slot_id,player,voucher_id,status) values(s.id,uid,vid,st) returning id into sid;
   return jsonb_build_object('id',sid,'status',st);
 elsif action='cancel_slot' then
   sid:=(payload->>'slot')::uuid;
   select * into s from training.slots sl where sl.id=sid for update;
   if not found or s.cancelled or s.starts<=clock_timestamp() then raise exception 'Poți anula doar un interval viitor.'; end if;
   update training.slots set cancelled=true where id=sid;
   update training.bookings set status='CANCELLED',updated_at=now() where slot_id=sid and status in ('PENDING','CONFIRMED');
   return jsonb_build_object('cancelled',true);
 elsif action in ('cancel','manage') then
   select * into booking from training.bookings bk where bk.id=(payload->>'booking')::uuid for update;
   if not found or (action='cancel' and booking.player<>uid) then raise exception 'Rezervarea nu există.'; end if;
   select * into s from training.slots sl where sl.id=booking.slot_id for update;
   st:=case when action='cancel' then 'CANCELLED' else payload->>'status' end;
   if st='CONFIRMED' then
     if booking.status<>'PENDING' or s.cancelled or s.starts<=clock_timestamp() then raise exception 'Cererea nu mai poate fi confirmată.'; end if;
     select count(*)::int,count(*) filter(where bk.voucher_id is null)::int into count_confirmed,count_standard
     from training.bookings bk where bk.slot_id=s.id and bk.status in ('CONFIRMED','COMPLETED');
     if count_confirmed>=s.capacity or (booking.voucher_id is null and count_standard>=s.capacity-s.reserved_vouchers) then
       raise exception 'Nu mai sunt locuri disponibile.';
     end if;
     if booking.voucher_id is null and exists(select 1 from training.bookings bk where bk.slot_id=s.id and bk.status='PENDING' and bk.voucher_id is not null) then
       raise exception 'Confirmă mai întâi cererile cu voucher.';
     end if;
   elsif st='COMPLETED' then
     if booking.status<>'CONFIRMED' or s.starts>clock_timestamp() then raise exception 'Antrenamentul nu poate fi marcat efectuat încă.'; end if;
   elsif st='REJECTED' then
     if booking.status<>'PENDING' then raise exception 'Doar cererile în așteptare pot fi respinse.'; end if;
   elsif st='CANCELLED' then
     if booking.status not in ('PENDING','CONFIRMED') or (action='cancel' and s.starts<=clock_timestamp()) then
       raise exception 'Rezervarea nu mai poate fi anulată online.';
     end if;
   else raise exception 'Stare nepermisă.';
   end if;
   update training.bookings set status=st,updated_at=now() where id=booking.id;
   return jsonb_build_object('status',st);
 end if;
 raise exception 'Acțiune necunoscută.';
end $$;

revoke all on function training.portal(text,jsonb) from public,anon,authenticated;
grant usage on schema training to anon,authenticated;
grant execute on function training.portal(text,jsonb) to anon,authenticated;
-- Public wrapper is invoker-only. All data and privileged implementation remain private.
create function public.training_portal(action text,payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select training.portal(action,payload); $$;
revoke all on function public.training_portal(text,jsonb) from public,anon,authenticated;
grant execute on function public.training_portal(text,jsonb) to anon,authenticated;
