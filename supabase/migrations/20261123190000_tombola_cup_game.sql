create function tombola_test.cup_flight(cups jsonb, angle int, power int) returns jsonb
language plpgsql immutable strict set search_path='' as $$
declare
 x float8:=548; y float8:=238; px float8; py float8; cross_x float8;
 vx float8:=-(180+3*power)*cos(radians(angle::float8));
 vy float8:=-(180+3*power)*sin(radians(angle::float8));
 bounces int:=0; cup float8; score int:=0; hit boolean:=false; frames jsonb:='[[548,238]]';
begin
 if angle not between 15 and 75 or power not between 10 and 100 then raise exception 'Unghi sau intensitate invalidă.'; end if;
 for step in 1..300 loop
   px:=x; py:=y; vy:=vy+580.0/60; x:=x+vx/60; y:=y+vy/60;
   for cup in select value::float8 from jsonb_array_elements_text(cups) loop
     if py<250 and y>=250 then
       cross_x:=px+(x-px)*(250-py)/(y-py);
       if abs(cross_x-cup)<=14 then
         x:=cup; y:=275; hit:=true; score:=case when bounces=0 then 60 else 100 end; exit;
       elsif abs(cross_x-cup)<=24 then
         vy:=-abs(vy)*0.55; y:=249; vx:=case when cross_x>cup then abs(vx) else -abs(vx) end*0.55;
       end if;
     elsif y>250 and py>250 and y<294 and (px-cup)*(x-cup)>0 and abs(px-cup)>=22 and abs(x-cup)<22 then
       x:=cup+sign(px-cup)*22; vx:=-vx*0.55;
     end if;
   end loop;
   if y>=294 and vy>0 then
     y:=294; vy:=-vy*0.76; vx:=vx*0.88; bounces:=bounces+1;
   end if;
   frames:=frames||jsonb_build_array(jsonb_build_array(round(x::numeric,1),round(y::numeric,1)));
   exit when hit or x < -6 or x>606 or bounces>=5;
 end loop;
 return jsonb_build_object('frames',frames,'score',score,'bounces',bounces);
end $$;
revoke all on function tombola_test.cup_flight(jsonb,int,int) from public,anon,authenticated;
alter table tombola_test.entries add column last_throw jsonb;
create or replace function public.tombola_test_admin(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e tombola_test.editions; entry tombola_test.entries; uid uuid := auth.uid();
 t timestamptz; nums int[]; allowed text[]; n int; img text; score int; board jsonb; win int; cats text[]; category text; flight jsonb; angle int; power int;
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
 elsif action in ('cups','throw') then
   select * into strict entry from tombola_test.entries where edition=e.id and player=uid for update;
   t:=clock_timestamp();
   if action='throw' and entry.last_throw->>'token'=payload->>'token' then return entry.last_throw; end if;
   if t<e.starts or t>=e.ends then raise exception 'Ediția nu este deschisă.'; end if;
   if action='cups' then
     if entry.challenge->'cups' is null then
       update tombola_test.entries set token=gen_random_uuid(),started=t,
         challenge=jsonb_build_object('cups',jsonb_build_array(40+floor(random()*32),128+floor(random()*32),216+floor(random()*45)))
         where edition=e.id and player=uid returning * into entry;
     end if;
     return entry.challenge || jsonb_build_object('token',entry.token);
   end if;
   if entry.challenge->'cups' is null or entry.token is distinct from (payload->>'token')::uuid then raise exception 'Pregătește o aruncare nouă.'; end if;
   angle:=(payload->>'angle')::int; power:=(payload->>'power')::int;
   if angle is null or power is null then raise exception 'Alege unghiul și intensitatea.'; end if;
   flight:=tombola_test.cup_flight(entry.challenge->'cups',angle,power)||jsonb_build_object('token',entry.token);
   score:=(flight->>'score')::int;
   update tombola_test.entries set points=points+score, serves=serves+1, reached=case when score>0 then t else reached end,
     challenge=null,token=null,started=null,last_throw=flight where edition=e.id and player=uid;
   return flight;
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
