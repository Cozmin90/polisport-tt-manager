-- Keep completed leaderboards and the vouchers already awarded under their original rules.
alter table tombola_test.editions add column score_by_hits boolean not null default true;
update tombola_test.editions set score_by_hits = false where ends <= now();

-- Open editions already record each successful mug throw. Use that same count for ranking.
update tombola_test.entries as player
set points = player.mug_hits,
    last_throw = case when (player.last_throw->>'score')::int > 0
                      then jsonb_set(player.last_throw, '{score}', '1'::jsonb)
                      else player.last_throw end
from tombola_test.editions as edition
where player.edition = edition.id and edition.score_by_hits
  and (player.points <> player.mug_hits or (player.last_throw->>'score')::int > 1);

create or replace function tombola_test.cup_flight(cups jsonb, angle int, power int)
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
