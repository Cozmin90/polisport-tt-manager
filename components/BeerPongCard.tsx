"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { byNextStart, categoryLabels, dateLabel, editionUrl, listEditions, type ListedEdition } from "../lib/beerPong";
import BeerPongArtwork from "./BeerPongArtwork";
import styles from "./BeerPongCard.module.css";

export default function BeerPongCard() {
  const [events, setEvents] = useState<ListedEdition[]>([]);
  useEffect(() => {
    let active = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const editions = await listEditions();
        if (active) setEvents(editions.filter(e => e.state !== "closed").sort(byNextStart));
      } catch { /* Keep the card reachable even if editions cannot be fetched. */ }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, []);

  return (
    <section aria-label="Competiție BeerPong" className={styles.card}>
      <div className={styles.layout}>
        <div className={styles.content}>
          <span className={styles.kicker}>POLISPORT · ARCADE</span>
          <h3 className={styles.title}>Competiție BeerPong</h3>
          <p className={styles.subtitle}>O minge, o halbă și o țintă. Exersează oricând, fără cont, sau intră într-o competiție!</p>
          <div className={styles.actions}>
            <Link href="/beerpong#demo" className={styles.primary}>Joacă demo gratuit <span aria-hidden="true">↗</span></Link>
            <Link href="/beerpong#editii" className={styles.secondary}>Competiții și clasamente</Link>
          </div>
        </div>
        <BeerPongArtwork className={styles.artwork} />
      </div>

      {events.length > 0 ? (
        <div className={styles.editions} aria-label="Ediții BeerPong active și programate">
          {events.slice(0, 2).map(e => (
            <div key={e.id} className={styles.edition}>
              <div className={styles.editionTop}>
                <span className={e.state === "open" ? styles.status + " " + styles.statusLive : styles.status}>
                  {e.state === "open" ? "● ÎN DESFĂȘURARE" : "◷ URMEAZĂ"}
                </span>
              </div>
              <Link href={editionUrl(e.id)} className={styles.editionLink}>{e.title} <span aria-hidden="true">↗</span></Link>
              <p className={styles.meta}>
                {e.state === "open" ? "Deschisă până la " + dateLabel(e.ends) : "Începe la " + dateLabel(e.starts)}
                {" · "}{e.prize_count} {e.prize_count === 1 ? "premiu" : "premii"}
                {" · "}{e.categories.map(c => categoryLabels[c] ?? c).join(", ")}
              </p>
            </div>
          ))}
          {events.length > 2 && (
            <div className={styles.edition}>
              <Link className={styles.editionLink} href="/beerpong">Vezi toate cele {events.length} ediții ↗</Link>
            </div>
          )}
        </div>
      ) : <p className={styles.empty}>Nu există ediții active? Poți juca demo oricând, fără cont și fără limită de timp.</p>}
    </section>
  );
}
