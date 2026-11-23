"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { byNextStart, categoryLabels, dateLabel, editionUrl, listEditions, type ListedEdition } from "../lib/beerPong";

export default function BeerPongCard() {
  const [events, setEvents] = useState<ListedEdition[]>([]);
  useEffect(() => {
    let active = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const editions = await listEditions();
        if (active) setEvents(editions.filter(e => e.state !== "closed").sort(byNextStart));
      } catch { /* The hub remains reachable when the event list is temporarily unavailable. */ }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, []);
  return <section aria-label="Competiție BeerPong" className="mt-4 rounded-2xl p-5 text-white" style={{ background: "linear-gradient(110deg,#40245b,#65355d)" }}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Link href="/beerpong" className="text-lg font-extrabold">Competiție BeerPong</Link>
      <Link href="/beerpong#istoric" className="text-sm underline">Istoric BeerPong</Link>
    </div>
    {events.length ? events.map(e => <div key={e.id} className="mt-3 border-t border-white/25 pt-2">
      <Link href={editionUrl(e.id)} className="font-bold underline">{e.title}</Link>
      <p className="mt-1 text-sm">{e.state === "open" ? "În joc până la " + dateLabel(e.ends) : "Începe la " + dateLabel(e.starts)}
        {" · "}{e.categories.map(c => categoryLabels[c]).join(", ")} · {e.prize_count} {e.prize_count === 1 ? "premiu" : "premii"}</p>
      <Link href={editionUrl(e.id)} className="mt-1 inline-block text-sm font-bold" style={{ color: "#ffe1a3" }}>
        {e.state === "open" ? "Participă" : "Vezi ediția"} →</Link>
    </div>) : <Link href="/beerpong" className="mt-1 block text-sm underline">Vezi competițiile</Link>}
  </section>;
}
