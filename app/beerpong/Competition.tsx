"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { categoryLabels, dateLabel, play, readEdition, roleLabels, serialLabel, type EventView } from "../../lib/beerPong";
import TargetGame from "./TargetGame";
import { downloadVoucher } from "./voucher";
import styles from "./raffle.module.css";

type Props = { id: string; signedIn: boolean; onClose: () => void };
export default function Competition({ id, signedIn, onClose }: Props) {
  const [view, setView] = useState<EventView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"official" | "demo" | null>(null);
  const [reload, setReload] = useState(0);
  const [readError, setReadError] = useState("");
  const lock = useRef(false);
  const lastOpen = useRef<boolean | null>(null);
  const onTransition = useRef(onClose);
  useEffect(() => { onTransition.current = onClose; }, [onClose]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let pending = false;
    async function refresh() {
      if (pending) return;
      clearTimeout(timer);
      pending = true;
      let delay = 5000;
      try {
        const info = await readEdition(id);
        if (!active) return;
        setReadError("");
        setView(info);
        if (lastOpen.current !== null && lastOpen.current !== info.open) onTransition.current();
        lastOpen.current = info.open;
        if (info.closed) return;
        const boundary = Date.parse(info.open ? info.event.ends : info.event.starts) - Date.parse(info.now) + 100;
        delay = Math.max(250, Math.min(boundary, info.open ? 4000 : 30000));
      } catch (e) {
        if (active) setReadError(e instanceof Error ? e.message : String(e));
      } finally {
        pending = false;
      }
      if (active) timer = window.setTimeout(refresh, delay);
    }
    function visible() { if (document.visibilityState === "visible") void refresh(); }
    void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [id, reload]);

  async function perform(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  function join(demo: boolean) {
    void perform(async () => {
      await play("join", { id, demo });
      setMode(demo ? "demo" : "official");
      setReload(n => n + 1);
    });
  }

  if (!view) return <div role="status">{readError || "Se încarcă ediția…"}</div>;
  const { event, open, closed, board, eligibility } = view;
  const mine = board.find(row => row.mine);
  const official = !!mine && mode !== "demo";
  const demo = !official && view.demo_points !== null && (mode === "demo" || !eligibility.eligible);
  return <>
    <section>
      <small>{closed ? "ÎNCHEIATĂ" : open ? "ÎN DESFĂȘURARE" : "PROGRAMATĂ"}</small>
      <h2>{event.title}</h2>
      <p>{dateLabel(event.starts)} – {dateLabel(event.ends)} (ora României)</p>
      <p><strong>{event.categories.map(k => categoryLabels[k]).join(" · ")}</strong> · {event.roles.map(k => roleLabels[k]).join(", ")}</p>
      <p>{event.prize_count === 1 ? "Un voucher pentru primul loc." : "Vouchere pentru primele " + event.prize_count + " locuri."} Fiecare reușită valorează un punct. La egalitate are prioritate cine a atins primul punctajul. Pentru un premiu trebuie să lansezi cel puțin o minge.</p>
      {(error || readError) && <p role="alert">{error || readError}</p>}
      {!closed && !open && <p>Înscrierea și jocul se deschid la ora de start.</p>}
      {open && !signedIn && <Link className={styles.actionLink} href={"/login?mode=login&beerpong=" + id}>Autentifică-te pentru a juca</Link>}
      {open && signedIn && !mine && <>
        {eligibility.eligible ? <button disabled={busy} onClick={() => join(false)}>Înscrie-mă în competiție</button> :
          <div className={styles.notice}>
            <strong>Poți juca în afara concursului</strong>
            <p>{eligibility.reason} În demo ai scor personal și poți încerca toate aruncările. Clasamentul și premiile sunt rezervate participanților oficiali.</p>
            {!demo && <button disabled={busy} onClick={() => join(true)}>Joacă demo</button>}
          </div>}
      </>}
      {open && signedIn && (official || demo) && <>
        {demo && <p className={styles.demoLabel}>Demo · Scor personal</p>}
        <TargetGame key={demo ? "demo" : "official"} endsAt={event.ends} serverNow={view.now}
          initialScore={demo ? (view.demo_points ?? 0) : (mine?.points ?? 0)}
          serve={() => play("cups", { id, demo })} finish={(token, angle, power) => play("throw", { id, demo, token, angle, power })}/>
        {official && mine && <p>Locul tău în clasament este <strong>{mine.rank}</strong>.</p>}
      </>}
      {mine?.voucher && <div className={styles.winner}>
        <h3>Felicitări! Ai câștigat voucherul nr. {serialLabel(mine.voucher)}!</h3>
        <button disabled={busy} onClick={() => void perform(() => downloadVoucher(id))}>Descarcă voucherul (PNG)</button>
        <p><Link href="/training#voucherele-mele">Folosește voucherul pentru un antrenament →</Link></p>
      </div>}
      {closed && !signedIn && <Link href={"/login?mode=login&beerpong=" + id}>Intră în cont pentru a vedea premiul tău</Link>}
    </section>
    <section><h2>{closed ? "Clasament final" : "Clasament live"}</h2>
      {board.length ? <table><thead><tr><th>Loc</th><th>Participant</th><th>Reușite</th><th>Status</th></tr></thead>
        <tbody>{board.map(r => <tr key={r.rank} className={r.mine ? styles.myRow : undefined}>
          <td>{r.rank}</td><td>{r.name}{r.mine ? " (tu)" : ""}</td><td>{r.points}</td>
          <td>{r.voucher ? "Voucher " + serialLabel(r.voucher) : closed ? "Fără premiu" : r.serves ? "În joc" : "Înscris"}</td>
        </tr>)}</tbody></table> : <p>Niciun participant oficial înscris.</p>}
    </section>
  </>;
}
