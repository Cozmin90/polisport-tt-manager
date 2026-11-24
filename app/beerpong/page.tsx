"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { byNextStart, categoryLabels, dateLabel, editionUrl, listEditions, type ListedEdition } from "../../lib/beerPong";
import { supabase } from "../../lib/supabaseClient";
import Competition from "./Competition";
import PracticeMode from "./PracticeMode";
import BeerPongArtwork from "../../components/BeerPongArtwork";
import EditionForm from "./EditionForm";
import styles from "./raffle.module.css";

function EditionLinks({ items, archived }: { items: ListedEdition[]; archived?: boolean }) {
  return <ul className={styles.editionGrid}>{items.map(e => <li key={e.id} className={archived ? styles.archivedEdition : styles.editionCard}>
    <div className={styles.editionCardTop}>
      <span className={e.state === "open" ? styles.liveStatus : styles.editionStatus}>
        {archived ? "EDIȚIE ÎNCHEIATĂ" : e.state === "open" ? "● ÎN DESFĂȘURARE" : "◷ PROGRAMATĂ"}
      </span>
      <span className={styles.prizeLabel}>★ {e.prize_count} {e.prize_count === 1 ? "premiu" : "premii"}</span>
    </div>
    <h3><Link href={editionUrl(e.id)}>{e.title}</Link></h3>
    <p className={styles.editionDate}>
      {archived ? "Încheiată la " + dateLabel(e.ends) : e.state === "open" ? "Deschisă până la " + dateLabel(e.ends) : "Începe la " + dateLabel(e.starts)}
    </p>
    <div className={styles.editionInfo}>
      <span>{e.categories.map(c => categoryLabels[c] ?? c).join(" · ")}</span>
      <span>{e.participants} {e.participants === 1 ? "participant" : "participanți"}</span>
    </div>
    <Link className={styles.editionAction} href={editionUrl(e.id)}>{archived ? "Vezi clasamentul" : e.state === "open" ? "Intră în joc" : "Vezi detaliile"} <span aria-hidden="true">↗</span></Link>
  </li>)}</ul>;
}
function CompetitionHub() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("editie");
  const [items, setItems] = useState<ListedEdition[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const refetch = useCallback(() => setReload(v => v + 1), []);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    setAdmin(false);
    setEditing(false);
    if (uid) void supabase.rpc("is_admin").then(({ data, error }) => {
      if (active) {
        setAdmin(data === true);
        if (error) setError(error.message);
      }
    });
    return () => { active = false; };
  }, [uid]);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function load() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const editions = await listEditions();
        if (active) { setItems(editions); setError(""); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally { pending = false; }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [reload]);
  const current = (items ?? []).filter(e => e.state !== "closed").sort(byNextStart);
  const history = (items ?? []).filter(e => e.state === "closed").sort((a, b) => Date.parse(b.ends) - Date.parse(a.ends));
  const selected = requested || current[0]?.id || history[0]?.id;
  const valid = selected && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(selected);
  function published(id: string) {
    setEditing(false);
    refetch();
    router.push(editionUrl(id));
  }
  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.topline}><Link href="/">← PoliSport-TT</Link>
          {authReady && !uid && <Link href={"/login?mode=login&beerpong=" + (valid ? selected : "1")}>Intră în cont</Link>}
        </div>
        <span className={styles.heroKicker}>POLISPORT · COMPETIȚIE INTERACTIVĂ</span>
        <h1>Competiție <span>BeerPong</span></h1>
        <p className={styles.heroSubtitle}>Țintește halba, aruncă mingea și transformă fiecare reușită într-un punct. Joacă, concurează și urmărește clasamentul live!</p>
        <div className={styles.heroHighlights}>
          <span>◎ Țintește</span><span>◉ Aruncă</span><span>★ Câștigă puncte</span>
        </div>
        <div className={styles.heroActions}>
          <a href="#demo" className={styles.heroPrimary}>Joacă demo gratuit <span aria-hidden="true">↘</span></a>
          <a href="#editii" className={styles.heroSecondary}>Competiții și clasamente</a>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <BeerPongArtwork className={styles.heroArtwork}/>
        <span className={styles.heroSticker}>O MINGE · O ȚINTĂ</span>
      </div>
    </header>
    {admin && <div className={styles.manage}><button type="button" aria-expanded={editing}
      onClick={() => setEditing(!editing)}>{editing ? "Închide formularul" : "Creează competiție"}</button></div>}
    {editing && admin && <EditionForm onPublish={published}/>}
    <PracticeMode/>
    {error && <p role="alert">{error} <button type="button" onClick={refetch}>Reîncearcă</button></p>}
    {items === null && !error && <p role="status">Se încarcă edițiile…</p>}
    {items && <section id="editii" className={styles.editionSection}><h2>Competiții în desfășurare și programate</h2>
      {current.length ? <EditionLinks items={current}/> : <p>Momentan nu este programată nicio competiție BeerPong.</p>}
    </section>}
    <div id="editie" className={styles.anchor}>
      {valid && authReady && <Competition key={selected + (uid ?? "public")} id={selected} signedIn={!!uid} onClose={refetch}/>}
      {requested && !valid && <p role="alert">Linkul ediției este incorect. <Link href="/beerpong">Vezi lista edițiilor.</Link></p>}
    </div>
    <section id="istoric" className={styles.anchor}><h2>Istoric BeerPong</h2>
      {history.length ? <EditionLinks items={history} archived/> :
        <p>{items === null ? "Se încarcă istoricul…" : "Prima ediție va apărea aici la încheiere, împreună cu clasamentul și voucherele acordate."}</p>}
    </section>
  </main>;
}
export default function BeerPongPage() {
  return <Suspense fallback={<main className={styles.page}><h1>Competiție BeerPong</h1><p>Se încarcă edițiile…</p></main>}>
    <CompetitionHub/>
  </Suspense>;
}
