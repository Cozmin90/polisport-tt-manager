"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { latestEvent, MEDIA_LABEL, NOTICE_LABEL, PRIVACY_VERSION, PrivacyEvent, WITHDRAWAL_MESSAGE } from "../lib/privacy";

export default function PrivacySettings({ userId }: { userId: string }) {
    const [events, setEvents] = useState<PrivacyEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        let active = true;
        async function load() {
            try {
                const { data, error } = await supabase.from("privacy_events").select("*").eq("user_id", userId).order("id", { ascending: false });
                if (error) throw error;
                if (active) { setEvents(data ?? []); setError(""); setLoading(false); }
            } catch {
                if (active) { setError("Opțiunile nu au putut fi încărcate. Reîncarcă pagina pentru a încerca din nou."); setLoading(false); }
            }
        }
        void load();
        return () => { active = false; };
    }, [userId]);

    async function save(kind: PrivacyEvent["kind"], accepted: boolean) {
        setBusy(true); setMessage("");
        try {
            const { data, error } = await supabase.from("privacy_events").insert({ user_id: userId, kind, accepted, version: PRIVACY_VERSION }).select().single();
            if (error) throw error;
            setEvents((previous) => [data as PrivacyEvent, ...previous]);
            setMessage(kind === "media" && !accepted ? WITHDRAWAL_MESSAGE : "Opțiunea a fost salvată.");
        } catch {
            setMessage("Salvarea nu a reușit. Opțiunea anterioară a rămas în vigoare. Te rugăm să încerci din nou.");
        } finally { setBusy(false); }
    }

    const notice = latestEvent(events, "privacy_notice");
    const media = latestEvent(events, "media");
    return (
        <section style={{ marginTop: 18, padding: 20, border: "1px solid #888", borderRadius: 12 }} aria-labelledby="privacy-heading">
            <h2 id="privacy-heading" style={{ fontSize: 20, fontWeight: 800 }}>Date personale și foto-video</h2>
            <p><Link href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Citește informarea (se deschide într-o filă nouă)</Link></p>
            {loading ? <p>Se încarcă opțiunile…</p> : error ? <p role="alert">{error}</p> : (
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={notice?.version === PRIVACY_VERSION && notice.accepted} disabled={busy || (notice?.version === PRIVACY_VERSION && notice.accepted)} onChange={() => void save("privacy_notice", true)} />
                        <span>{NOTICE_LABEL}</span>
                    </label>
                    <p style={{ fontSize: 14 }}>Aceasta este confirmarea citirii informării, nu un consimțământ general pentru toate prelucrările. Confirmarea se păstrează în istoric. Pentru cereri privind datele tale, contactează organizatorul.</p>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={media?.accepted === true} disabled={busy} onChange={(event) => void save("media", event.target.checked)} />
                        <span>{MEDIA_LABEL} <strong>Opțional.</strong></span>
                    </label>
                    <p style={{ fontSize: 14 }}>Stare: <strong>{!media ? "Acord neexprimat" : media.accepted ? "Acord acordat" : "Fără acord foto-video"}</strong>. Refuzul sau retragerea acordului nu împiedică participarea. Modificările se salvează imediat.</p>
                    {message ? <p role="status" style={{ padding: 14, border: "1px solid #888", borderRadius: 8 }}>{message}</p> : null}
                    {events.length ? <details><summary>Istoricul opțiunilor</summary><ul style={{ paddingLeft: 20 }}>{events.map((event) => <li key={event.id}>{new Date(event.created_at).toLocaleString("ro-RO")} — {event.kind === "privacy_notice" ? "Informare citită" : event.accepted ? "Acord foto-video acordat" : "Fără acord foto-video"} (versiunea {event.version})</li>)}</ul></details> : null}
                </div>
            )}
        </section>
    );
}
