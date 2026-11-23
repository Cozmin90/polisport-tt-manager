-- Run after the wall and hit-count migration. No rows are written.
do $$
declare
  sample record;
  flight jsonb;
begin
  for sample in
    select * from (values
      (150, 40, 100, 1, false, false), -- direct
      (65, 30, 75, 1, true, false),    -- table
      (65, 30, 90, 1, true, true),     -- table, wall, mug
      (65, 25, 60, 0, true, true),     -- wall rebound without scoring
      (65, 15, 10, 0, true, false)
    ) as shots(mug, angle, power, score, table_hit, wall_hit)
  loop
    flight := tombola_test.cup_flight(jsonb_build_array(sample.mug), sample.angle, sample.power);
    if (flight->>'score')::int is distinct from sample.score
       or ((flight->>'bounces')::int > 0) is distinct from sample.table_hit
       or ((flight->>'wall_bounces')::int > 0) is distinct from sample.wall_hit then
      raise exception 'Unexpected result for mug %, angle %, power %', sample.mug, sample.angle, sample.power;
    end if;
    if exists (select 1 from jsonb_array_elements(flight->'frames') p where (p->>0)::float8 < 22) then
      raise exception 'Ball crossed the left wall';
    end if;
    if sample.wall_hit and not exists (
      select 1 from (
        select (p->>0)::float8 as x,
               lag((p->>0)::float8) over (order by n) as before_x,
               lead((p->>0)::float8) over (order by n) as after_x
        from jsonb_array_elements(flight->'frames') with ordinality as frames(p,n)
      ) trace where x < 27 and x < before_x and x < after_x
    ) then
      raise exception 'Missing change of direction at the wall';
    end if;
  end loop;
end $$;
