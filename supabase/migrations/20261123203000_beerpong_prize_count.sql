alter table tombola_test.editions add column prize_count integer;
update tombola_test.editions set prize_count = cardinality(prizes);
alter table tombola_test.editions
  alter column prize_count set not null,
  add constraint editions_prize_count_check
    check (prize_count > 0 and cardinality(prizes) in (0, prize_count));

create or replace function public.tombola_test_admin(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 e tombola_test.editions; entry tombola_test.entries; uid uuid := auth.uid();
 t timestamptz; nums int[]; allowed text[]; n int; img text; prize_total int; score int; board jsonb; win int; cats text[]; category text; flight jsonb; angle int; power int; mug int; previous int; amplitude float8; phase float8;
begin
 if uid is null or not public.is_admin() then raise exception 'Acces rezervat administratorilor.' using errcode='42501'; end if;
 if action='list' then
   return (select coalesce(jsonb_agg(to_jsonb(d) order by d.created desc),'[]') from tombola_test.editions d);
 elsif action='create' then
   -- Explicit serials follow the order entered for each rank. Earlier clients sent a set.
   select coalesce(array_agg(serial order by sort_key), '{}'::int[])
     into nums
     from (
       select value::int as serial,
              case when payload ? 'prize_count' then rank else value::int end as sort_key
       from jsonb_array_elements_text(coalesce(payload->'prizes', '[]'::jsonb))
            with ordinality as numbers(value, rank)
     ) as ordered;
   prize_total := coalesce((payload->>'prize_count')::int, cardinality(nums));
   if prize_total < 1 or cardinality(nums) not in (0, prize_total) or
      exists (select 1 from unnest(nums) serial where serial is null or serial <= 0) or
      cardinality(nums) <> (select count(distinct serial) from unnest(nums) serial) then
     raise exception 'Verifică numărul de premii și seriile voucherelor.';
   end if;
   -- The original five-voucher previews read the array length when displaying an edition.
   if cardinality(nums)=0 and prize_total<=5 then
     nums := array(select generate_series(1, prize_total));
   end if;
   select array_agg(value) into allowed from jsonb_array_elements_text(payload->'roles');
   if coalesce(cardinality(allowed),0)=0 or
      not allowed <@ array['student','employee','alumni','partner','guest','unspecified'] then
     raise exception 'Verifică afilierile eligibile.';
   end if;
   select array_agg(distinct value) into cats from jsonb_array_elements_text(coalesce(payload->'categories','["HOBBY","ADVANCED","ELITE"]'::jsonb));
   if coalesce(cardinality(cats),0)=0 or array_position(cats,null) is not null or not cats <@ array['HOBBY','ADVANCED','ELITE'] then raise exception 'Selectează cel puțin o categorie validă.'; end if;
   insert into tombola_test.editions(title,starts,ends,roles,prizes,categories,prize_count) values(trim(payload->>'title'),(payload->>'starts')::timestamptz,(payload->>'ends')::timestamptz,allowed,nums,cats,prize_total) returning * into e;
   if e.ends<=clock_timestamp() then raise exception 'Alege o oră de închidere în viitor.'; end if;
   -- Sequential vouchers use the rank as their serial. Store only uploaded models.
   for n, img in select key::int, value from jsonb_each_text(coalesce(payload->'images', '{}'::jsonb)) loop
     if (cardinality(nums)=0 and n not between 1 and prize_total) or
        (cardinality(nums)>0 and not n=any(nums)) then
       raise exception 'Modelul nu corespunde unui voucher premiat.';
     end if;
     if img is null or length(img)>1000000 or left(img,23)<>'data:image/jpeg;base64,' then
       raise exception 'Imagine neacceptată.';
     end if;
     insert into tombola_test.templates values(e.id,n,img);
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
     if entry.challenge->>'mode' is distinct from 'mug' then
       previous:=(entry.last_throw->>'mug')::int;
       select pos into mug from generate_series(42,410) pos
         where previous is null or abs(pos-previous)>=48 order by random() limit 1;
       update tombola_test.entries set token=gen_random_uuid(),started=t,
         challenge=jsonb_build_object('cups',jsonb_build_array(mug),'mode','mug')
         where edition=e.id and player=uid returning * into entry;
     end if;
     return entry.challenge || jsonb_build_object('token',entry.token,'hits',entry.mug_hits,'elapsed',extract(epoch from (t-entry.started)));
   end if;
   if entry.challenge->>'mode' is distinct from 'mug' or entry.token is distinct from (payload->>'token')::uuid then raise exception 'Pregătește o aruncare nouă.'; end if;
   angle:=(payload->>'angle')::int; power:=(payload->>'power')::int;
   if angle is null or power is null then raise exception 'Alege unghiul și intensitatea.'; end if;
   if angle not between 15 and 75 or power not between 10 and 100 then raise exception 'Unghi sau intensitate invalidă.'; end if;
   amplitude:=14*entry.mug_hits::float8/(entry.mug_hits+5.0);
   phase:=extract(epoch from (t-entry.started))*(2.2+amplitude/8);
   angle:=greatest(15,least(75,round(angle+amplitude*sin(phase))::int));
   power:=greatest(10,least(100,round(power+0.65*amplitude*sin(phase*1.37))::int));
   flight:=tombola_test.cup_flight(entry.challenge->'cups',angle,power)||jsonb_build_object('token',entry.token);
   score:=(flight->>'score')::int;
   flight:=flight||jsonb_build_object('hits',entry.mug_hits+case when score>0 then 1 else 0 end,'mug',entry.challenge->'cups'->0);
   update tombola_test.entries set mug_hits=(flight->>'hits')::int, points=points+score, serves=serves+1, reached=case when score>0 then t else reached end,
     challenge=null,token=null,started=null,last_throw=flight where edition=e.id and player=uid;
   return flight;
 elsif action not in ('view','voucher') then raise exception 'Acțiune necunoscută.'; end if;
 t:=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object('rank',r,'name',name,'points',points,'serves',serves,'mine',player=uid,'voucher',case when t>=e.ends and serves>0 and r<=e.prize_count then coalesce(e.prizes[r::int], r::int) end) order by r),'[]') into board
 from (select b.*,row_number() over(order by points desc,(serves>0) desc,reached,player) r from tombola_test.entries b where edition=e.id) ranks;
 if action='voucher' then
   select (v->>'voucher')::int into win from jsonb_array_elements(board) v where (v->>'mine')::boolean;
   if win is null then raise exception 'Voucher indisponibil.'; end if;
   return (select jsonb_build_object('number',win,'image',(select image from tombola_test.templates where edition=e.id and number=win)));
 end if;
 return jsonb_build_object('event',to_jsonb(e),'board',board,'now',t,'closed',t>=e.ends,'open',t>=e.starts and t<e.ends);
end $$;
