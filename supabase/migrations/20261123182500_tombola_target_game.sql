alter table tombola_test.editions add column categories text[] not null default array['HOBBY','ADVANCED','ELITE'];
alter table tombola_test.entries add column challenge jsonb;

create or replace function public.tombola_test_admin(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e tombola_test.editions; entry tombola_test.entries; uid uuid := auth.uid();
 t timestamptz; nums int[]; allowed text[]; n int; img text; score int; board jsonb; win int; cats text[]; category text; bat numeric; offset_x numeric; miss numeric;
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
   select array_agg(distinct value) into cats from jsonb_array_elements_text(coalesce(payload->'categories','["HOBBY","ADVANCED","ELITE"]'::jsonb));
   if coalesce(cardinality(cats),0)=0 or array_position(cats,null) is not null or not cats <@ array['HOBBY','ADVANCED','ELITE'] then raise exception 'Selectează cel puțin o categorie validă.'; end if;
   insert into tombola_test.editions(title,starts,ends,roles,prizes,categories) values(trim(payload->>'title'),(payload->>'starts')::timestamptz,(payload->>'ends')::timestamptz,allowed,nums,cats) returning * into e;
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
   select case when coalesce(p.mp_max,p.mp,2)<20 then 'HOBBY' when coalesce(p.mp_max,p.mp,2)<40 then 'ADVANCED' else 'ELITE' end into strict category from public.players p where p.id=uid;
   if not category=any(e.categories) then raise exception 'Categoria ta de joc nu este eligibilă pentru această ediție.'; end if;
   insert into tombola_test.entries(edition,player,name)
   select e.id,p.id,coalesce(nullif(trim(p.full_name),''),nullif(trim(p.display_name),''),'Administrator')
   from public.players p where p.id=uid and coalesce(nullif(p.upb_role::text,''),'unspecified')=any(e.roles)
   on conflict do nothing;
   if not exists(select 1 from tombola_test.entries where edition=e.id and player=uid) then raise exception 'Afilierea contului nu este eligibilă pentru această ediție.'; end if;
 elsif action in ('serve','return_ball') then
   select * into strict entry from tombola_test.entries where edition=e.id and player=uid for update;
   t:=clock_timestamp();
   if t<e.starts or t>=e.ends then raise exception 'Ediția nu este deschisă.'; end if;
   if action='serve' then
     if entry.challenge is null then
       update tombola_test.entries set started=t,token=gen_random_uuid(),
         challenge=jsonb_build_object('incoming',130+floor(random()*341),'targetX',80+floor(random()*441),'targetY',80+floor(random()*81))
         where edition=e.id and player=uid returning * into entry;
     end if;
     return entry.challenge || jsonb_build_object('token',entry.token);
   end if;
   if entry.challenge is null or entry.token is distinct from (payload->>'token')::uuid then raise exception 'Această minge a fost deja jucată.'; end if;
   bat:=(payload->>'paddle')::numeric;
   if bat is null or not (bat between 30 and 570) then raise exception 'Poziție invalidă.'; end if;
   if t-entry.started < interval '1.4 seconds' then raise exception 'Mingea încă nu a ajuns la paletă.'; end if;
   offset_x:=(entry.challenge->>'incoming')::numeric-bat;
   miss:=abs((entry.challenge->>'incoming')::numeric + offset_x/34*1.9*(360-(entry.challenge->>'targetY')::numeric) - (entry.challenge->>'targetX')::numeric);
   score:=case when abs(offset_x)>34 or miss>30 then 0 when miss<=10 then 100 when miss<=20 then 60 else 30 end;
   update tombola_test.entries set challenge=null, points=points+score, serves=serves+1, reached=case when score>0 then t else reached end, started=null, token=null where edition=e.id and player=uid;
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
