"use client";

import { useEffect, useRef, useState } from "react";
import MugCourt, { type Avatar, type Point } from "./MugCourt";
import styles from "./raffle.module.css";

type Table = { token: string; cups: number[]; hits: number; elapsed: number };
type Flight = { frames: Point[]; score: number; bounces: number; wall_bounces?: number; hits: number };
type Props = {
  initialScore: number;
  endsAt?: string;
  serverNow?: string;
  serve: () => Promise<Table>;
  finish: (token: string, angle: number, power: number) => Promise<Flight>;
};
type Phase = "loading" | "aim" | "sending" | "flying" | "done" | "error";
const origin: Point = [548, 238];

function shotMessage(result: Flight) {
  if (!result.score) return "Mingea a ratat halba. 0 puncte.";
  if (result.wall_bounces) return "În halbă după ricoșeu din perete! +1 punct.";
  if (result.bounces) return "În halbă după ricoșeu pe masă! +1 punct.";
  return "Direct în halbă! +1 punct.";
}

export default function TargetGame({ serve, finish, initialScore, endsAt, serverNow }: Props) {
  const [table, setTable] = useState<Table | null>(null);
  const [avatar, setAvatar] = useState<Avatar>("male");
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(65);
  const [hits, setHits] = useState(initialScore);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [round, setRound] = useState(0);
  const clock = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  const deadline = useRef(Infinity);
  useEffect(() => {
    deadline.current = endsAt && serverNow
      ? performance.now() + Date.parse(endsAt) - Date.parse(serverNow)
      : Infinity; // Permanent local demo has no end date.
  }, [endsAt, serverNow]);
  const prepare = useRef(serve);
  useEffect(() => { prepare.current = serve; }, [serve]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setPhase("loading");
    const sent = performance.now();
    prepare.current().then(data => {
      if (!active) return;
      const received = performance.now();
      clock.current = (received + sent) / 2 - data.elapsed * 1000;
      setFlight(null);
      setFrame(0);
      setNow(received);
      setTable(data);
      setHits(data.hits);
      setPhase("aim");
      locked.current = false;
    }).catch(error => {
      if (active) { setMessage(String(error)); setPhase("error"); }
    });
    return () => { active = false; };
  }, [round]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => {
      if (performance.now() < deadline.current) setRound(previous => previous + 1);
    }, 720);
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function launch() {
    if (!table || locked.current || phase !== "aim" || performance.now() >= deadline.current) return;
    locked.current = true;
    setPhase("sending");
    setMessage("");
    try {
      const result = await finish(table.token, angle, power);
      if (mounted.current) { setFlight(result); setPhase("flying"); }
    } catch (error) {
      if (mounted.current) {
        setMessage(String(error));
        setPhase(error instanceof Error && error.message.includes("aruncare nouă") ? "error" : "aim");
        locked.current = false;
      }
    }
  }

  useEffect(() => {
    if (phase !== "flying" && (!hits || phase === "loading" || phase === "error")) return;
    const start = performance.now();
    let animation = 0;
    function animate(time: number) {
      setNow(time);
      if (phase === "flying" && flight) {
        const last = flight.frames.length - 1;
        const index = Math.max(0, Math.min(last, Math.floor((time - start) * .06)));
        setFrame(index);
        if (index === last) {
          setHits(flight.hits);
          setMessage(shotMessage(flight));
          setPhase("done");
          return;
        }
      }
      animation = requestAnimationFrame(animate);
    }
    animation = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animation);
  }, [phase, flight, hits]);

  const amplitude = 14 * hits / (hits + 5);
  const sway = (now - clock.current) / 1000 * (2.2 + amplitude / 8);
  const lean = amplitude * Math.sin(sway);
  const radians = Math.min(75, Math.max(15, Math.round(angle + lean))) * Math.PI / 180;
  const speed = 180 + 3 * Math.min(100, Math.max(10, Math.round(power + .65 * amplitude * Math.sin(sway * 1.37))));
  const ready = phase === "aim";
  const dizziness = Math.round(100 * amplitude / 14);
  const guide = ready ? Array.from({ length: 11 }, (_, i) => {
    const t = i * .027;
    return [origin[0] - speed * Math.cos(radians) * t, origin[1] - speed * Math.sin(radians) * t + 290 * t * t].join(",");
  }).join(" ") : undefined;
  const ball = flight?.frames[frame] ?? origin;
  const trail = flight?.frames.slice(Math.max(0, frame - 22), frame + 1) ?? [];
  // The ball reverses horizontally at its left limit (x=22). Show a brief impact there.
  const wallContact = flight?.wall_bounces ? trail.slice(-6).find(p => p[0] <= 25) : undefined;
  const release = phase === "flying" && frame < 22 ? Math.sin(Math.PI * frame / 22) : 0;

  return <div className={styles.game}>
    <h3>Țintește halba</h3>
    <p>Reglează unghiul și intensitatea, apoi urmărește linia punctată pentru a alege momentul lansării. Poți folosi masa și peretele din stânga pentru ricoșeu.</p>
    <fieldset>
      <legend>Personaj</legend>
      {(["male", "female"] as const).map(value =>
        <label key={value}><input type="radio" name="personaj" checked={avatar === value}
          disabled={phase === "flying" || phase === "sending"} onChange={() => setAvatar(value)}/>
          {value === "male" ? "Bărbat" : "Fată"}
        </label>
      )}
    </fieldset>
    <div className={styles.court}>
      <MugCourt avatar={avatar} hits={hits} lean={lean} release={release} mug={table?.cups[0]}
        ball={ball} trail={trail} guide={guide} wallImpactY={phase === "flying" ? wallContact?.[1] : undefined}
        landed={(phase === "done" || phase === "loading") && Boolean(flight?.score)}/>
      <div className={styles.hud}>
        <div className={styles.readouts}>
          <div className={styles.score}><span>Scor</span><strong>{hits}</strong></div>
          <div className={styles.dizziness}>
            <span>Amețeală <b>{dizziness}%</b></span>
            <meter aria-label="Amețeală" min={0} max={100} value={dizziness}/>
          </div>
        </div>
        <button className={styles.throwButton} type="button"
          disabled={!ready && phase !== "error"}
          aria-label={phase === "error" ? "Reîncearcă pregătirea mingii" : "Aruncă mingea"}
          onClick={phase === "error" ? () => { setMessage(""); setRound(r => r + 1); } : launch}>
          {phase === "error" ? "Reîncearcă" : "Aruncă"}
        </button>
      </div>
    </div>
    <p role="status" className={styles.feedback}>{message}</p>
    <div className={styles.dates}>
      <label>Unghi · {angle}°<input type="range" min="15" max="75" value={angle} disabled={!ready} onChange={e => setAngle(Number(e.target.value))}/></label>
      <label>Intensitate · {power}%<input type="range" min="10" max="100" value={power} disabled={!ready} onChange={e => setPower(Number(e.target.value))}/></label>
    </div>
  </div>;
}
