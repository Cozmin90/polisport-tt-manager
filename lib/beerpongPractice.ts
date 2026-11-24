/**
 * Browser-only BeerPong practice.
 * This mirrors beerpong.cup_flight and the aim/sway calculations in the
 * 20261123213000_public_beerpong.sql migration. It never calls Supabase.
 */
export type PracticePoint = [number, number];
export type PracticeFlight = {
  frames: PracticePoint[];
  score: number;
  bounces: number;
  wall_bounces: number;
  hits: number;
};

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function simulatePracticeFlight(mug: number, angle: number, power: number): Omit<PracticeFlight, "hits"> {
  if (!Number.isInteger(angle) || angle < 15 || angle > 75 ||
      !Number.isInteger(power) || power < 10 || power > 100) {
    throw new Error("Unghi sau intensitate invalidă.");
  }
  let x = 548;
  let y = 238;
  let vx = -(180 + 3 * power) * Math.cos(angle * Math.PI / 180);
  let vy = -(180 + 3 * power) * Math.sin(angle * Math.PI / 180);
  let bounces = 0;
  let wallBounces = 0;
  let hit = false;
  const frames: PracticePoint[] = [[548, 238]];

  for (let step = 0; step < 300; step++) {
    const previousX = x;
    const previousY = y;
    vy += 580 / 60;
    x += vx / 60;
    y += vy / 60;

    // Same wall, mug rim and tabletop collision order as the SQL game.
    if (vx < 0 && x <= 22) {
      x = 22 + (22 - x) * .84;
      vx = -vx * .84;
      wallBounces++;
    }
    if (previousY < 250 && y >= 250) {
      const rimX = previousX + (x - previousX) * (250 - previousY) / (y - previousY);
      if (Math.abs(rimX - mug) <= 14) {
        x = mug;
        y = 275;
        hit = true;
      } else if (Math.abs(rimX - mug) <= 24) {
        vy = -Math.abs(vy) * .55;
        y = 249;
        vx = (rimX > mug ? Math.abs(vx) : -Math.abs(vx)) * .55;
      }
    } else if (y > 250 && previousY > 250 && y < 294 &&
               (previousX - mug) * (x - mug) > 0 &&
               Math.abs(previousX - mug) >= 22 && Math.abs(x - mug) < 22) {
      x = mug + Math.sign(previousX - mug) * 22;
      vx = -vx * .55;
    }
    if (y >= 294 && vy > 0) {
      y = 294;
      vy = -vy * .76;
      vx *= .88;
      bounces++;
    }
    frames.push([roundTenth(x), roundTenth(y)]);
    if (hit || x > 606 || bounces >= 5) break;
  }
  return { frames, score: Number(hit), bounces, wall_bounces: wallBounces };
}

export function createPracticeEngine() {
  let hits = 0;
  let previousMug: number | null = null;
  let mug = 0;
  let started = 0;
  let token = "";
  let shotNumber = 0;

  function serve() {
    if (!token) {
      const choices: number[] = [];
      for (let pos = 42; pos <= 410; pos++) {
        if (previousMug === null || Math.abs(pos - previousMug) >= 48) choices.push(pos);
      }
      mug = choices[Math.floor(Math.random() * choices.length)];
      previousMug = mug;
      token = String(++shotNumber);
      started = performance.now();
    }
    return Promise.resolve({ token, cups: [mug], hits, elapsed: (performance.now() - started) / 1000 });
  }

  function finish(requestedToken: string, angle: number, power: number) {
    if (!token || requestedToken !== token) {
      return Promise.reject(new Error("Pregătește o aruncare nouă."));
    }
    const amplitude = 14 * hits / (hits + 5);
    const phase = (performance.now() - started) / 1000 * (2.2 + amplitude / 8);
    const actualAngle = Math.max(15, Math.min(75, Math.round(angle + amplitude * Math.sin(phase))));
    const actualPower = Math.max(10, Math.min(100, Math.round(power + .65 * amplitude * Math.sin(phase * 1.37))));
    const flight = simulatePracticeFlight(mug, actualAngle, actualPower);
    hits += flight.score;
    token = "";
    return Promise.resolve({ ...flight, hits });
  }

  return { serve, finish };
}
