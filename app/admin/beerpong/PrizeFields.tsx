"use client";

import { useState } from "react";

export type PrizeSettings = {
  count: string;
  serials: string;
  files: Record<number, File>;
};

const maxSerial = 2147483647;
const pageSize = 5;
const formatSerial = (value: number) => String(value).padStart(3, "0");

export function readPrizePlan(settings: PrizeSettings) {
  const count = Number(settings.count);
  const text = settings.serials.trim();
  const numbers = text ? text.split(/[,;\s]+/).map(serial => /^\d+$/.test(serial) ? Number(serial) : NaN) : [];
  let error = "";
  if (!Number.isInteger(count) || count < 1 || count > maxSerial) {
    error = "Introdu un număr întreg de premii, de cel puțin 1.";
  } else if (numbers.length && (numbers.length !== count || new Set(numbers).size !== count ||
      numbers.some(n => !Number.isInteger(n) || n < 1 || n > maxSerial))) {
    error = "Introdu câte un număr de voucher distinct și pozitiv pentru fiecare loc premiat.";
  }
  return { count, numbers, error };
}

export default function PrizeFields({ value, onChange }: {
  value: PrizeSettings;
  onChange: (next: PrizeSettings) => void;
}) {
  const [page, setPage] = useState(0);
  const plan = readPrizePlan(value);
  const pages = plan.error ? 0 : Math.ceil(plan.count / pageSize);
  const current = Math.min(page, Math.max(0, pages - 1));
  const start = current * pageSize;
  const visible = plan.error ? [] : Array.from({ length: Math.min(pageSize, plan.count - start) }, (_, offset) => {
    const rank = start + offset + 1;
    return { rank, serial: plan.numbers[rank - 1] ?? rank };
  });
  return <fieldset>
    <legend>Premii</legend>
    <div><label htmlFor="prize-count">Număr de premii</label></div>
    <input id="prize-count" type="number" min="1" max={maxSerial} step="1" required
      value={value.count} onChange={event => { setPage(0); onChange({ ...value, count: event.target.value }); }}/>
    <p>La închidere, fiecare loc premiat primește un voucher, în ordinea clasamentului.</p>
    <details>
      <summary>Numere și imagini pentru vouchere</summary>
      <div><label htmlFor="voucher-serials">Numere personalizate (opțional)</label></div>
      <input id="voucher-serials" type="text" placeholder="De exemplu 002, 004" value={value.serials}
        onChange={event => { setPage(0); onChange({ ...value, serials: event.target.value }); }}/>
      <p>Implicit, voucherele încep de la 001. Poți indica alte numere, în ordinea locurilor premiate.</p>
      {visible.map(({rank, serial}) => <div key={serial}>
        <label htmlFor={`voucher-${serial}`}>Locul {rank} · Voucher {formatSerial(serial)}</label>
        <input id={`voucher-${serial}`} type="file" accept="image/png,image/jpeg" onChange={event => {
          const file = event.target.files?.[0];
          if (file) {
            onChange({ ...value, files: { ...value.files, [serial]: file } });
            event.target.value = "";
          }
        }}/>
        {value.files[serial] && <span>{value.files[serial].name} <button type="button"
          aria-label={`Elimină imaginea pentru voucherul ${formatSerial(serial)}`} onClick={() => {
            const files = { ...value.files };
            delete files[serial];
            onChange({ ...value, files });
          }}>Elimină</button></span>}
      </div>)}
      {pages > 1 && <div>
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Locurile anterioare</button>{" "}
        <span>{start + 1}–{Math.min(start + pageSize, plan.count)} din {plan.count}</span>{" "}
        <button type="button" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>Locurile următoare</button>
      </div>}
    </details>
    {plan.error && <p role="alert">{plan.error}</p>}
  </fieldset>;
}
