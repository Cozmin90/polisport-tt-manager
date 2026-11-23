-- Official editions and demo rounds start in a fresh schema. Test results stay private.
create schema beerpong;
revoke all on schema beerpong from public, anon, authenticated;

create table beerpong.editions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 100),
  starts timestamptz not null,
  ends timestamptz not null check (isfinite(ends) and ends > starts),
  roles text[] not null,
  categories text[] not null,
  prize_count integer not null check (prize_count > 0),
  prizes integer[] not null default '{}' check (cardinality(prizes) in (0, prize_count))
);
create table beerpong.entries (
  edition uuid not null references beerpong.editions(id),
  player uuid not null,
  demo boolean not null,
  name text not null,
  voucher_name text not null,
  points integer not null default 0 check (points >= 0),
  serves integer not null default 0,
  reached timestamptz not null default clock_timestamp(),
  started timestamptz,
  token uuid,
  mug integer,
  next_throw timestamptz,
  last_throw jsonb,
  primary key (edition, player, demo)
);
create index entries_official_rank on beerpong.entries
  (edition, points desc, (serves > 0) desc, reached, player) where not demo;
create table beerpong.templates (
  edition uuid not null references beerpong.editions(id),
  number integer not null,
  image text not null,
  primary key (edition, number)
);
create table beerpong.default_templates (
  number integer primary key check (number > 0),
  image text not null
);
alter table beerpong.editions enable row level security;
alter table beerpong.entries enable row level security;
alter table beerpong.templates enable row level security;
alter table beerpong.default_templates enable row level security;

create or replace function beerpong.cup_flight(cups jsonb, angle int, power int)
returns jsonb
language plpgsql immutable strict set search_path = '' as $$
declare
  x float8 := 548;
  y float8 := 238;
  previous_x float8;
  previous_y float8;
  rim_x float8;
  vx float8 := -(180 + 3 * power) * cos(radians(angle::float8));
  vy float8 := -(180 + 3 * power) * sin(radians(angle::float8));
  -- Wall face at x=16 and tabletop at y=300, with a ball radius of 6.
  wall_limit constant float8 := 22;
  table_limit constant float8 := 294;
  rim_height constant float8 := 250;
  bounces int := 0;
  wall_bounces int := 0;
  mug float8;
  hit boolean := false;
  frames jsonb := '[[548,238]]';
begin
  if angle not between 15 and 75 or power not between 10 and 100 then
    raise exception 'Unghi sau intensitate invalidă.';
  end if;

  for step in 1..300 loop
    previous_x := x;
    previous_y := y;
    vy := vy + 580.0 / 60;
    x := x + vx / 60;
    y := y + vy / 60;

    if vx < 0 and x <= wall_limit then
      x := wall_limit + (wall_limit - x) * 0.84;
      vx := -vx * 0.84;
      wall_bounces := wall_bounces + 1;
    end if;

    for mug in select value::float8 from jsonb_array_elements_text(cups) loop
      if previous_y < rim_height and y >= rim_height then
        rim_x := previous_x + (x - previous_x) * (rim_height - previous_y) / (y - previous_y);
        if abs(rim_x - mug) <= 14 then
          x := mug;
          y := 275;
          hit := true;
          exit;
        elsif abs(rim_x - mug) <= 24 then
          vy := -abs(vy) * 0.55;
          y := rim_height - 1;
          vx := case when rim_x > mug then abs(vx) else -abs(vx) end * 0.55;
        end if;
      elsif y > rim_height and previous_y > rim_height and y < table_limit
        and (previous_x - mug) * (x - mug) > 0
        and abs(previous_x - mug) >= 22 and abs(x - mug) < 22 then
        x := mug + sign(previous_x - mug) * 22;
        vx := -vx * 0.55;
      end if;
    end loop;

    if y >= table_limit and vy > 0 then
      y := table_limit;
      vy := -vy * 0.76;
      vx := vx * 0.88;
      bounces := bounces + 1;
    end if;

    frames := frames || jsonb_build_array(jsonb_build_array(round(x::numeric, 1), round(y::numeric, 1)));
    exit when hit or x > 606 or bounces >= 5;
  end loop;
  return jsonb_build_object('frames', frames, 'score', hit::integer,
                            'bounces', bounces, 'wall_bounces', wall_bounces);
end $$;

create function beerpong.eligibility(e beerpong.editions, uid uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  p public.players;
  category text;
  reason text;
begin
  select * into p from public.players where id=uid;
  if found then
    category := case when coalesce(p.mp_max,p.mp,2)<20 then 'HOBBY'
                     when coalesce(p.mp_max,p.mp,2)<40 then 'ADVANCED' else 'ELITE' end;
  end if;
  reason := case
    when uid is null then 'Autentifică-te pentru a participa.'
    when p.id is null then 'Completează profilul de jucător în Contul meu.'
    when not category=any(e.categories) then
      format('Categoria ta este %s. Această ediție admite %s.',
        case category when 'HOBBY' then 'Hobby' when 'ADVANCED' then 'Avansați' else 'Elite' end,
        (select string_agg(case c when 'HOBBY' then 'Hobby' when 'ADVANCED' then 'Avansați' else 'Elite' end, ', ' order by i)
         from unnest(e.categories) with ordinality a(c,i)))
    when p.upb_role='guest' then 'Jucătorii invitați pot participa la această ediție în modul demo.'
    when coalesce(trim(p.upb_role),'') not in ('student','employee','alumni','partner')
      then 'Completează afilierea UPB în Contul meu pentru a te putea înscrie oficial.'
    when p.upb_role='partner' and nullif(trim(p.upb_partner_name),'') is null
      then 'Completează denumirea partenerului UPB în Contul meu.'
    when p.upb_role<>'partner' and (coalesce(p.upb_center,'') not in ('BUC','PIT') or nullif(trim(p.upb_faculty),'') is null)
      then 'Completează centrul universitar și facultatea în Contul meu.'
    when not p.upb_role=any(e.roles) then 'Afilierea ta UPB nu se află printre cele admise la această ediție.'
  end;
  return jsonb_build_object('eligible',reason is null,'reason',reason,'category',category);
end $$;

-- Only the fields appropriate for a public board leave the private schema.
create function beerpong.board(e beerpong.editions, moment timestamptz)
returns table(place bigint, player uuid, name text, points int, serves int, voucher int)
language sql stable set search_path='' as $$
  select r, b.player, b.name, b.points, b.serves,
         case when moment>=e.ends and b.serves>0 and r<=e.prize_count then coalesce(e.prizes[r::int],r::int) end
  from (select b.*,row_number() over(order by b.points desc,(b.serves>0) desc,b.reached,b.player) r
        from beerpong.entries b where b.edition=e.id and not b.demo) b
  order by r;
$$;

create function public.beerpong_editions() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.starts desc,d.id),'[]')
  from (select e.id,e.title,e.starts,e.ends,e.roles,e.categories,e.prize_count,
          case when statement_timestamp()>=e.ends then 'closed' when statement_timestamp()<e.starts then 'scheduled' else 'open' end as state,
          (select count(*) from beerpong.entries b where b.edition=e.id and not b.demo) participants
        from beerpong.editions e) d;
$$;

create function public.beerpong_event(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  e beerpong.editions;
  uid uuid := auth.uid();
  moment timestamptz := statement_timestamp();
  standings jsonb;
begin
  select * into e from beerpong.editions where id=p_id;
  if not found then raise exception 'Competiția nu a fost găsită.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('rank',b.place,'name',b.name,'points',b.points,
      'serves',b.serves,'mine',coalesce(b.player=uid,false),'voucher',b.voucher) order by b.place),'[]')
    into standings from beerpong.board(e,moment) b;
  return jsonb_build_object('event',to_jsonb(e)-'prizes','board',standings,'now',moment,
    'open',moment>=e.starts and moment<e.ends,'closed',moment>=e.ends,'eligibility',beerpong.eligibility(e,uid),
    'demo_points',(select points from beerpong.entries where edition=e.id and player=uid and demo));
end $$;

create function public.beerpong_create(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  e beerpong.editions;
  allowed text[];
  cats text[];
  nums integer[];
  total int := (payload->>'prize_count')::int;
  n int;
  img text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Doar administratorii pot publica ediții.' using errcode='42501';
  end if;
  select coalesce(array_agg(value::int order by i),'{}') into nums
    from jsonb_array_elements_text(coalesce(payload->'prizes','[]')) with ordinality v(value,i);
  if total is null or total<1 or cardinality(nums) not in (0,total)
     or exists(select from unnest(nums) a(serial) where serial is null or serial<=0)
     or cardinality(nums)<>(select count(distinct s) from unnest(nums) s) then
    raise exception 'Verifică numărul de premii și seriile voucherelor.';
  end if;
  select array_agg(value order by i) into allowed from jsonb_array_elements_text(payload->'roles') with ordinality v(value,i);
  select array_agg(value order by i) into cats from jsonb_array_elements_text(payload->'categories') with ordinality v(value,i);
  if coalesce(cardinality(allowed),0)=0 or array_position(allowed,null) is not null
     or not allowed <@ array['student','employee','partner','alumni'] then raise exception 'Selectează afilierile UPB admise.'; end if;
  if coalesce(cardinality(cats),0)=0 or array_position(cats,null) is not null
     or not cats <@ array['HOBBY','ADVANCED','ELITE'] then raise exception 'Selectează categoriile de joc admise.'; end if;
  if (payload->>'ends')::timestamptz<=clock_timestamp() or (payload->>'ends')::timestamptz<=(payload->>'starts')::timestamptz then
    raise exception 'Închiderea trebuie să fie în viitor și după deschidere.';
  end if;
  insert into beerpong.editions(title,starts,ends,roles,categories,prizes,prize_count)
    values(trim(payload->>'title'),(payload->>'starts')::timestamptz,(payload->>'ends')::timestamptz,allowed,cats,nums,total) returning * into e;
  for n,img in select key::int,value from jsonb_each_text(coalesce(payload->'images','{}')) loop
    if (case when cardinality(nums)=0 then n not between 1 and total else not n=any(nums) end) then
      raise exception 'Modelul nu corespunde unui voucher premiat.';
    end if;
    if img is null or length(img)>1000000 or left(img,23)<>'data:image/jpeg;base64,' then raise exception 'Imagine neacceptată.'; end if;
    insert into beerpong.templates values(e.id,n,img);
  end loop;
  return e.id;
end $$;

create function public.beerpong_play(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  e beerpong.editions;
  entry beerpong.entries;
  uid uuid := auth.uid();
  practice boolean := coalesce((payload->>'demo')::boolean,false);
  eligibility jsonb;
  moment timestamptz;
  previous int;
  target int;
  angle int;
  power int;
  amplitude float8;
  phase float8;
  flight jsonb;
  hits int;
  win int;
  winner text;
  profile_name text;
  public_name text;
begin
  if uid is null then raise exception 'Autentifică-te pentru a participa.' using errcode='42501'; end if;
  if action is null or action not in ('join','cups','throw','voucher') then raise exception 'Acțiune necunoscută.'; end if;
  select * into e from beerpong.editions where id=(payload->>'id')::uuid;
  if not found then raise exception 'Competiția nu a fost găsită.'; end if;
  if action='voucher' then
    select b.voucher,x.voucher_name into win,winner from beerpong.board(e,clock_timestamp()) b
      join beerpong.entries x on x.edition=e.id and x.player=b.player and not x.demo where b.player=uid;
    if win is null or practice then raise exception 'Voucher indisponibil.'; end if;
    return jsonb_build_object('number',win,'name',winner,'image',coalesce(
      (select x.image from beerpong.templates x where x.edition=e.id and x.number=win),
      (select x.image from beerpong.default_templates x where x.number=win)));
  end if;
  select * into entry from beerpong.entries b where b.edition=e.id and b.player=uid and b.demo=practice for update;
  moment:=clock_timestamp();
  if action='throw' and entry.last_throw->>'token'=payload->>'token' then return entry.last_throw; end if;
  if moment<e.starts or moment>=e.ends then raise exception 'Participarea este închisă pentru această ediție.'; end if;
  if action='join' then
    if entry.player is null then
      eligibility := beerpong.eligibility(e,uid);
      if not practice and not (eligibility->>'eligible')::boolean then
        raise exception '% Poți juca demo, în afara concursului.',eligibility->>'reason';
      end if;
      select coalesce(nullif(trim(p.full_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'')),
             nullif(trim(p.display_name),'') into profile_name,public_name from public.players p where p.id=uid;
      if position('@' in public_name)>0 then public_name:=null; end if;
      if position('@' in profile_name)>0 then profile_name:=null; end if;
      insert into beerpong.entries(edition,player,demo,name,voucher_name)
        values(e.id,uid,practice,coalesce(public_name,profile_name,'Jucător'),coalesce(profile_name,public_name,'Jucător'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('joined',true);
  end if;
  if entry.player is null then raise exception 'Înscrie-te sau pornește jocul demo.'; end if;
  if action='cups' then
    if entry.token is null then
      previous:=(entry.last_throw->>'mug')::int;
      select pos into target from generate_series(42,410) pos where previous is null or abs(pos-previous)>=48 order by random() limit 1;
      update beerpong.entries b set token=gen_random_uuid(),started=moment,mug=target
        where b.edition=e.id and b.player=uid and b.demo=practice returning * into entry;
    end if;
    return jsonb_build_object('cups',jsonb_build_array(entry.mug),'token',entry.token,'hits',entry.points,'elapsed',extract(epoch from moment-entry.started));
  end if;
  if entry.token is null or entry.token is distinct from (payload->>'token')::uuid then raise exception 'Pregătește o aruncare nouă.'; end if;
  if moment<entry.next_throw then raise exception 'Așteaptă ca mingea precedentă să își încheie traiectoria.'; end if;
  angle:=(payload->>'angle')::int; power:=(payload->>'power')::int;
  if angle is null or power is null or angle not between 15 and 75 or power not between 10 and 100 then raise exception 'Unghi sau intensitate invalidă.'; end if;
  amplitude:=14*entry.points::float8/(entry.points+5.0);
  phase:=extract(epoch from moment-entry.started)*(2.2+amplitude/8);
  angle:=greatest(15,least(75,round(angle+amplitude*sin(phase))::int));
  power:=greatest(10,least(100,round(power+0.65*amplitude*sin(phase*1.37))::int));
  flight:=beerpong.cup_flight(jsonb_build_array(entry.mug),angle,power);
  hits:=entry.points+(flight->>'score')::int;
  flight:=flight||jsonb_build_object('token',entry.token,'hits',hits,'mug',entry.mug);
  update beerpong.entries b set points=hits,serves=b.serves+1,reached=case when hits>b.points then moment else b.reached end,
    next_throw=moment+make_interval(secs=>(jsonb_array_length(flight->'frames')-1)/60.0),
    mug=null,token=null,started=null,last_throw=flight where b.edition=e.id and b.player=uid and b.demo=practice;
  return flight;
end $$;

revoke all on all tables in schema beerpong from public, anon, authenticated;
revoke all on all functions in schema beerpong from public, anon, authenticated;
revoke all on function public.beerpong_editions(), public.beerpong_event(uuid), public.beerpong_create(jsonb), public.beerpong_play(text,jsonb) from public, anon, authenticated;
grant execute on function public.beerpong_editions(), public.beerpong_event(uuid) to anon, authenticated;
grant execute on function public.beerpong_create(jsonb), public.beerpong_play(text,jsonb) to authenticated;
