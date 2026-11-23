"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { byNextStart, dateLabel, editionUrl, listEditions, type ListedEdition } from "../../lib/beerPong";
import { supabase } from "../../lib/supabaseClient";
import Competition from "./Competition";
import EditionForm from "./EditionForm";
import styles from "./raffle.module.css";

function EditionLinks({ items, archived }: { items: ListedEdition[]; archived?: boolean }) {
  return <ul className={styles.editions}>{items.map(e => <li key={e.id}>
    <div><Link href={editionUrl(e.id)}>{e.title}</Link>
      <small>{archived ? dateLabel(e.ends) : e.state === "open" ? "Deschisă până la " + dateLabel(e.ends) : "Începe la " + dateLabel(e.starts)}</small></div>
    <span>{e.participants} {e.participants === 1 ? "participant" : "participanți"} · {e.prize_count} {e.prize_count === 1 ? "premiu" : "premii"}</span>
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
      <Link href="/">← PoliSport-TT</Link>
      <h1>Competiție BeerPong</h1>
      <p>Țintește halba și adună reușite până la închiderea ediției.</p>
      <a href="#istoric">Istoric și clasamente</a>
    </header>
    {admin && <div className={styles.manage}><button type="button" aria-expanded={editing}
      onClick={() => setEditing(!editing)}>{editing ? "Închide formularul" : "Creează competiție"}</button></div>}
    {editing && admin && <EditionForm onPublish={published}/>}
    {error && <p role="alert">{error} <button type="button" onClick={refetch}>Reîncearcă</button></p>}
    {items === null && !error && <p role="status">Se încarcă edițiile…</p>}
    {items && <section><h2>Competiții în desfășurare și programate</h2>
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
