"use client";

import { useRef, useState, type FormEvent } from "react";
import { categoryLabels, roleLabels } from "../../lib/beerPong";
import { supabase } from "../../lib/supabaseClient";
import PrizeFields, { readPrizePlan, type PrizeSettings } from "./PrizeFields";
import { prepareTemplate } from "./voucher";
import styles from "./raffle.module.css";

function localDate(offset = 0) {
  const d = new Date(Date.now() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function toggle(values: string[], key: string) {
  return values.includes(key) ? values.filter(v => v !== key) : [...values, key];
}
export default function EditionForm({ onPublish }: { onPublish: (id: string) => void }) {
  const [title, setTitle] = useState("Competiție BeerPong");
  const [starts, setStarts] = useState(() => localDate());
  const [ends, setEnds] = useState(() => localDate(60 * 60000));
  const [roles, setRoles] = useState(Object.keys(roleLabels));
  const [categories, setCategories] = useState(Object.keys(categoryLabels));
  const [prizes, setPrizes] = useState<PrizeSettings>({ count: "5", serials: "", files: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const plan = readPrizePlan(prizes);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (plan.error) throw new Error(plan.error);
      if (new Date(ends) <= new Date(starts) || new Date(ends).getTime() <= Date.now()) {
        throw new Error("Închiderea trebuie să fie după deschidere și în viitor.");
      }
      const images: Record<number, string> = {};
      for (const [number, file] of Object.entries(prizes.files)) {
        const n = Number(number);
        if (plan.numbers.length ? plan.numbers.includes(n) : n >= 1 && n <= plan.count) {
          images[n] = await prepareTemplate(file);
        }
      }
      const { data, error } = await supabase.rpc("beerpong_create", { payload: {
        title: title.trim(), starts: new Date(starts).toISOString(), ends: new Date(ends).toISOString(),
        roles, categories, prize_count: plan.count, prizes: plan.numbers, images
      } });
      if (error) throw new Error(error.message);
      onPublish(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <form onSubmit={publish} className={styles.editionForm}>
    <h2>Ediție nouă</h2>
    <label>Titlu<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)}/></label>
    <div className={styles.dates}>
      <label>Începe la<input type="datetime-local" required value={starts} onChange={e => setStarts(e.target.value)}/></label>
      <label>Se încheie la<input type="datetime-local" required min={starts} value={ends} onChange={e => setEnds(e.target.value)}/></label>
    </div>
    <p className={styles.note}>Fusul orar al formularului este {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <fieldset><legend>Afilieri UPB admise</legend>{Object.entries(roleLabels).map(([v, label]) =>
      <label key={v}><input type="checkbox" checked={roles.includes(v)} onChange={() => setRoles(toggle(roles, v))}/>{label}</label>)}</fieldset>
    <fieldset><legend>Categorii de joc admise</legend>{Object.entries(categoryLabels).map(([v, label]) =>
      <label key={v}><input type="checkbox" checked={categories.includes(v)} onChange={() => setCategories(toggle(categories, v))}/>{label}</label>)}</fieldset>
    <PrizeFields value={prizes} onChange={setPrizes}/>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy || !title.trim() || !roles.length || !categories.length || !!plan.error}>
      {busy ? "Se publică…" : "Publică ediția"}</button>
  </form>;
}
