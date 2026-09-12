import { describeGroupPlan, parseTableCount } from "../lib/groupPlanning";

export default function TableCountField({ value, onChange, players, disabled = false }: { value: string; onChange: (value: string) => void; players: number; disabled?: boolean }) {
    let plan: string;
    try { plan = describeGroupPlan(players, parseTableCount(value)); }
    catch (error) { plan = (error as Error).message; }
    return <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="table-count" style={{ fontWeight: 700 }}>Mese disponibile pentru acest turneu</label>
        <input id="table-count" type="number" min="1" max="2147483647" step="1" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} placeholder="Ex: 4" style={{ padding: 12, borderRadius: 10, border: "1px solid #bbb", background: "white", maxWidth: "100%" }} />
        <p style={{ fontSize: 13 }}>Introdu doar mesele alocate acestei categorii. De exemplu, pentru 12 mese împărțite egal între Hobby, Avansați și Elite, setează 4 la fiecare turneu. Lasă gol dacă nu știi încă numărul.</p>
        <p role="status" style={{ padding: 12, borderRadius: 8, background: "#edf3fa", color: "#18365c" }}>{plan}</p>
    </div>;
}
