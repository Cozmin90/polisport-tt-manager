-- Integration smoke test. Requires an existing admin and at least two non-admin accounts.
-- All test data is transactionally rolled back; run only as database owner.
begin;
do $test$
declare a uuid; p1 uuid; p2 uuid; s uuid; s2 uuid; v uuid; c text; b1 uuid; b2 uuid; x jsonb; blocked boolean; start_at timestamp; ed uuid;
begin
 select pl.id into a from public.players pl join auth.users au on au.id=pl.id where pl.is_admin limit 1;
 select pl.id into p1 from public.players pl join auth.users au on au.id=pl.id where not coalesce(pl.is_admin,false) limit 1;
 select pl.id into p2 from public.players pl join auth.users au on au.id=pl.id where not coalesce(pl.is_admin,false) and pl.id<>p1 limit 1;
 if a is null or p1 is null or p2 is null then raise exception 'Not enough test identities'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 if not public.is_admin() then raise exception 'Admin identity check failed'; end if;
 start_at:=date_trunc('hour',now() at time zone 'Europe/Bucharest')+interval '21 days';
 perform public.training_portal('publish',jsonb_build_object('starts',start_at,'ends',start_at+interval '1 hour','coach','TRAINING TEST ROLLBACK','location','TEST','capacity',2,'kind','group','reserved_vouchers',1,'approval',true,'weeks',2));
 select id into s from training.slots where coach='TRAINING TEST ROLLBACK' order by starts limit 1;
 select id into s2 from training.slots where coach='TRAINING TEST ROLLBACK' order by starts desc limit 1;
 if (select count(*) from training.slots where coach='TRAINING TEST ROLLBACK')<>2 then raise exception 'Recurrence failed'; end if;
 x:=public.training_portal('issue',jsonb_build_object('serial','TEST ROLLBACK'));
 v:=(x->>'id')::uuid;c:=x->>'code';
 perform set_config('request.jwt.claim.sub',p1::text,true);
 if public.is_admin() then raise exception 'Player admin mismatch'; end if;
 blocked:=false;begin perform public.training_portal('issue',jsonb_build_object('serial','FORBIDDEN'));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Nonadmin issue permitted'; end if;
 x:=public.training_portal('request',jsonb_build_object('slot',s));b1:=(x->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',p2::text,true);
 x:=public.training_portal('request',jsonb_build_object('slot',s,'code',c));b2:=(x->>'id')::uuid;
 if (select owner from training.vouchers where id=v)<>p2 then raise exception 'Claim failed';end if;
 x:=public.training_portal('view','{}');
 if exists(select 1 from jsonb_array_elements(x->'bookings') y where (y->>'id')::uuid=b1) then raise exception 'Private booking leaked';end if;
 if x->'issued'<>'[]'::jsonb then raise exception 'Codes leaked';end if;
 blocked:=false;begin perform public.training_portal('request',jsonb_build_object('slot',s2,'voucher',v));exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Duplicate voucher accepted';end if;
 perform set_config('request.jwt.claim.sub',p1::text,true);
 blocked:=false;begin perform public.training_portal('claim',jsonb_build_object('code',c));exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Other user claimed voucher';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 blocked:=false;begin perform public.training_portal('manage',jsonb_build_object('booking',b1,'status','CONFIRMED'));exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Priority failed';end if;
 perform public.training_portal('manage',jsonb_build_object('booking',b2,'status','CONFIRMED'));
 perform public.training_portal('manage',jsonb_build_object('booking',b1,'status','CONFIRMED'));
 perform set_config('request.jwt.claim.sub',p2::text,true);
 perform public.training_portal('cancel',jsonb_build_object('booking',b2));
 x:=public.training_portal('view','{}');
 if not exists(select 1 from jsonb_array_elements(x->'vouchers') y where y->>'id'=v::text and y->>'state'='AVAILABLE') then raise exception 'Voucher not released';end if;
 x:=public.training_portal('request',jsonb_build_object('slot',s2,'voucher',v));b2:=(x->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.training_portal('manage',jsonb_build_object('booking',b2,'status','CONFIRMED'));
 update training.slots set starts=now()-interval '2 hours',ends=now()-interval '1 hour' where id=s2;
 perform public.training_portal('manage',jsonb_build_object('booking',b2,'status','COMPLETED'));
 insert into beerpong.editions(title,starts,ends,roles,categories,prize_count,prizes)
 values('TRAINING TEST ROLLBACK',now()-interval '3 hours',now()-interval '1 hour',array['student'],array['HOBBY'],1,array[5]) returning id into ed;
 insert into beerpong.entries(edition,player,demo,name,voucher_name,points,serves) values(ed,p2,false,'TEST','TEST',3,4);
 perform set_config('request.jwt.claim.sub',p2::text,true);
 x:=public.training_portal('view','{}');
 if not exists(select 1 from jsonb_array_elements(x->'vouchers') y where y->>'id'=v::text and y->>'state'='USED') then raise exception 'Voucher not consumed';end if;
 if not exists(select 1 from training.vouchers where edition=ed and owner=p2 and serial='005' and source='beerpong') then raise exception 'Prize import failed';end if;
 perform public.training_portal('view','{}');
 if (select count(*) from training.vouchers where edition=ed and owner=p2)<>1 then raise exception 'Prize duplicated';end if;
 if has_table_privilege('anon','training.vouchers','SELECT') or has_table_privilege('authenticated','training.bookings','INSERT') then raise exception 'Direct access exists';end if;
end $test$;
rollback;
begin;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $anon$
declare x jsonb;
begin
 x:=public.training_portal('view','{}');
 if x->>'admin'<>'false' or x->'bookings'<>'[]'::jsonb or x->'vouchers'<>'[]'::jsonb or x->'issued'<>'[]'::jsonb then raise exception 'Anonymous data leak'; end if;
end $anon$;
rollback;
select 'PASS' as result;