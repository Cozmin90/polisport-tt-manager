create schema tombola_test;
revoke all on schema tombola_test from public, anon, authenticated;
create table tombola_test.editions (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 100),
 starts timestamptz not null, ends timestamptz not null check(ends > starts),
 roles text[] not null, prizes int[] not null, created timestamptz not null default now()
);
create table tombola_test.templates (
 edition uuid references tombola_test.editions, number int not null, image text not null, primary key(edition,number)
);
create table tombola_test.entries (
 edition uuid references tombola_test.editions, player uuid not null, name text not null,
 points bigint not null default 0, reached timestamptz not null default clock_timestamp(),
 started timestamptz, token uuid, serves integer not null default 0, primary key(edition,player)
);
create function public.tombola_test_admin(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e tombola_test.editions; entry tombola_test.entries; uid uuid := auth.uid();
 t timestamptz; nums int[]; allowed text[]; n int; img text; score int; board jsonb; win int;
begin
 if uid is null or not public.is_admin() then raise exception 'Acces rezervat administratorilor.' using errcode='42501'; end if;
 if action='list' then
   return (select coalesce(jsonb_agg(to_jsonb(d) order by d.created desc),'[]') from tombola_test.editions d);
 elsif action='create' then
   select array_agg(value::int order by value::int) into nums from jsonb_array_elements_text(payload->'prizes');
   select array_agg(value) into allowed from jsonb_array_elements_text(payload->'roles');
   if coalesce(cardinality(nums),0) not between 1 and 5 or nums[1]<1 or nums[cardinality(nums)]>5 or
      cardinality(nums)<>(select count(distinct a) from unnest(nums) a) or coalesce(cardinality(allowed),0)=0 or
      not allowed <@ array['student','employee','alumni','partner','guest','unspecified'] then raise exception 'Verifică voucherele și categoriile.'; end if;
   insert into tombola_test.editions(title,starts,ends,roles,prizes) values(trim(payload->>'title'),(payload->>'starts')::timestamptz,(payload->>'ends')::timestamptz,allowed,nums) returning * into e;
   if e.ends<=clock_timestamp() then raise exception 'Alege o oră de închidere în viitor.'; end if;
   foreach n in array nums loop
     img:=payload->'images'->>n::text;
     if img is not null then
       if length(img)>1000000 or left(img,23)<>'data:image/jpeg;base64,' then raise exception 'Imagine neacceptată.'; end if;
       insert into tombola_test.templates values(e.id,n,img);
     end if;
   end loop;
   return to_jsonb(e);
 end if;
 select * into strict e from tombola_test.editions where id=(payload->>'id')::uuid;
 if action='join' then
   if clock_timestamp() not between e.starts and e.ends or clock_timestamp()>=e.ends then raise exception 'Înscrierea este închisă.'; end if;
   insert into tombola_test.entries(edition,player,name)
   select e.id,p.id,coalesce(nullif(trim(p.full_name),''),nullif(trim(p.display_name),''),'Administrator')
   from public.players p where p.id=uid and coalesce(nullif(p.upb_role::text,''),'unspecified')=any(e.roles)
   on conflict do nothing;
   if not exists(select 1 from tombola_test.entries where edition=e.id and player=uid) then raise exception 'Afilierea contului nu este eligibilă pentru această ediție.'; end if;
 elsif action in ('start','hit') then
   select * into strict entry from tombola_test.entries where edition=e.id and player=uid for update;
   t:=clock_timestamp();
   if t<e.starts or t>=e.ends then raise exception 'Ediția nu este deschisă.'; end if;
   if action='start' then
     if entry.token is null then
       update tombola_test.entries set started=t,token=gen_random_uuid() where edition=e.id and player=uid returning * into entry;
     end if;
     return jsonb_build_object('token',entry.token,'elapsed',1000*extract(epoch from t-entry.started));
   end if;
   if entry.token is null or entry.token is distinct from (payload->>'token')::uuid then raise exception 'Serva a fost deja înregistrată.'; end if;
   score:=round(100*(1-abs(mod(extract(epoch from t-entry.started),2)-1)))::int;
   update tombola_test.entries set points=points+score, serves=serves+1, reached=case when score>0 then t else reached end, started=null, token=null where edition=e.id and player=uid;
   return to_jsonb(score);
 elsif action not in ('view','voucher') then raise exception 'Acțiune necunoscută.'; end if;
 t:=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object('rank',r,'name',name,'points',points,'serves',serves,'mine',player=uid,'voucher',case when t>=e.ends and serves>0 then e.prizes[r::int] end) order by r),'[]') into board
 from (select b.*,row_number() over(order by points desc,(serves>0) desc,reached,player) r from tombola_test.entries b where edition=e.id) ranks;
 if action='voucher' then
   select (v->>'voucher')::int into win from jsonb_array_elements(board) v where (v->>'mine')::boolean;
   if win is null then raise exception 'Voucher indisponibil.'; end if;
   return (select jsonb_build_object('number',win,'image',(select image from tombola_test.templates where edition=e.id and number=win)));
 end if;
 return jsonb_build_object('event',to_jsonb(e),'board',board,'now',t,'closed',t>=e.ends,'open',t>=e.starts and t<e.ends);
end $$;
revoke all on function public.tombola_test_admin(text,jsonb) from public,anon;
grant execute on function public.tombola_test_admin(text,jsonb) to authenticated;