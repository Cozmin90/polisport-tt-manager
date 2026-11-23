-- Integration test for a populated PoliSport database. All fixtures are rolled back.
begin;
do $$
declare
  administrator uuid;
  member uuid;
  outside_player uuid;
  event_id uuid;
  params jsonb;
  response jsonb;
  drawing jsonb;
  shot jsonb;
  failed boolean;
begin
  if not has_function_privilege('anon','public.beerpong_editions()','EXECUTE') or
     not has_function_privilege('anon','public.beerpong_event(uuid)','EXECUTE') or
     has_function_privilege('anon','public.beerpong_play(text,jsonb)','EXECUTE') or
     has_function_privilege('anon','public.beerpong_create(jsonb)','EXECUTE') or
     has_schema_privilege('authenticated','beerpong','USAGE') or
     has_table_privilege('anon','beerpong.default_templates','SELECT') then
    raise exception 'Unexpected public permissions';
  end if;
  select id into strict administrator from public.players where is_admin limit 1;
  select id into strict member from public.players where not coalesce(is_admin,false) and coalesce(mp_max,mp,2)<20
    and upb_role in ('student','employee','alumni') and upb_center in ('BUC','PIT') and nullif(trim(upb_faculty),'') is not null limit 1;
  select id into strict outside_player from public.players where not coalesce(is_admin,false) and coalesce(mp_max,mp,2)>=40
    and upb_role in ('student','employee','alumni') and upb_center in ('BUC','PIT') and nullif(trim(upb_faculty),'') is not null limit 1;
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  params:=jsonb_build_object('title','QA în tranzacție','starts',now()-interval '1 hour','ends',now()+interval '1 hour',
     'categories','["HOBBY"]'::jsonb,'roles','["student","employee","alumni","partner"]'::jsonb,'prize_count',1,'prizes','[3]'::jsonb);
  event_id:=public.beerpong_create(params);
  perform set_config('request.jwt.claim.sub',member::text,true);
  failed:=false;
  begin perform public.beerpong_create(params); exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Non-admin created an edition'; end if;
  params:=jsonb_build_object('id',event_id);
  if public.beerpong_event(event_id)#>>'{eligibility,eligible}' is distinct from 'true' then raise exception 'Expected eligible member'; end if;
  perform public.beerpong_play('join',params);
  perform public.beerpong_play('join',params);
  drawing:=public.beerpong_play('cups',params);
  update beerpong.entries set mug=150 where edition=event_id and player=member and not demo;
  shot:=params||jsonb_build_object('token',drawing->'token','angle',40,'power',100);
  response:=public.beerpong_play('throw',shot);
  if response->>'score' is distinct from '1' or public.beerpong_play('throw',shot) is distinct from response then raise exception 'Official throw or retry failed'; end if;
  drawing:=public.beerpong_play('cups',params);
  if drawing->>'hits' is distinct from '1' or drawing->'token'=shot->'token' then raise exception 'Next ball not prepared'; end if;
  response:=public.beerpong_event(event_id);
  if jsonb_array_length(response->'board')<>1 or response#>>'{board,0,serves}' is distinct from '1' or response#>>'{board,0,voucher}' is not null then raise exception 'Live standings incorrect'; end if;
  perform set_config('request.jwt.claim.sub',outside_player::text,true);
  response:=public.beerpong_event(event_id);
  if response#>>'{eligibility,eligible}' is distinct from 'false' or response#>>'{eligibility,reason}' not like '%Elite%Hobby%' then raise exception 'Missing category notice'; end if;
  failed:=false;
  begin perform public.beerpong_play('join',params); exception when raise_exception then failed:=position('demo' in sqlerrm)>0; end;
  if not failed then raise exception 'Official registration accepted an excluded category'; end if;
  params:=params||'{"demo":true}'::jsonb;
  perform public.beerpong_play('join',params);
  drawing:=public.beerpong_play('cups',params);
  update beerpong.entries set mug=150 where edition=event_id and player=outside_player and demo;
  perform public.beerpong_play('throw',params||jsonb_build_object('token',drawing->'token','angle',40,'power',100));
  response:=public.beerpong_event(event_id);
  if response->>'demo_points' is distinct from '1' or jsonb_array_length(response->'board')<>1 or response#>>'{board,0,mine}' is distinct from 'false' then raise exception 'Demo leaked into rankings'; end if;
  -- Demo points also stay separate if the same user later qualifies.
  update beerpong.editions set categories=array['HOBBY','ELITE'] where id=event_id;
  perform public.beerpong_play('join',params-'demo');
  response:=public.beerpong_event(event_id);
  if response#>>'{board,1,points}' is distinct from '0' or response#>>'{board,1,mine}' is distinct from 'true' then raise exception 'Demo points migrated to official entry'; end if;
  update beerpong.editions set ends=now()-interval '1 minute' where id=event_id;
  failed:=false;
  begin perform public.beerpong_play('cups',params); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Playing after the deadline was possible'; end if;
  failed:=false;
  begin perform public.beerpong_play('voucher',params-'demo'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Nonwinner downloaded a voucher'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  response:=public.beerpong_event(event_id);
  if response->>'closed' is distinct from 'true' or response#>>'{board,0,voucher}' is distinct from '3' or response#>>'{board,0,mine}' is distinct from 'false'
     or response#>>'{board,1,voucher}' is not null or not exists (select from jsonb_array_elements(public.beerpong_editions()) d
       where d->>'id'=event_id::text and d->>'participants'='2' and d->>'state'='closed') then raise exception 'Public archive or awards incorrect'; end if;
  perform set_config('request.jwt.claim.sub',member::text,true);
  response:=public.beerpong_play('voucher',params-'demo');
  if response->>'number' is distinct from '3' or nullif(response->>'name','') is null then raise exception 'Personal voucher incorrect'; end if;
  if exists(select from beerpong.default_templates where number=3) and response->>'image' not like 'data:image/%' then raise exception 'Missing voucher artwork'; end if;
end $$;
rollback;
