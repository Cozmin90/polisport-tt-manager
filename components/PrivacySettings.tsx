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
            setEvents((previous) => [data as PrivacyEvent, ...previous.filter((event) => event.kind !== kind)]);
            setMessage(kind === "media" && !accepted ? WITHDRAWAL_MESSAGE : "Opțiunea a fost salvată.");
        } catch {
            setMessage("Salvarea nu a reușit. Opțiunea anterioară a rămas în vigoare. Te rugăm să încerci din nou.");
        } finally { setBusy(false); }
    }

    const notice = latestEvent(events, "privacy_notice");
    const media = latestEvent(events, "media");
    return (
        <section style={{ marginTop: 18, padding: 20, border: "1px solid #888", borderRadius: 12 }} aria-labelledby="privacy-heading">
            <h2 id="privacy-heading" style={{ fontSize: 20, fontWeight: 800 }}>Date cu caracter personal și acord foto-video</h2>
            <p><Link href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Citește informarea (se deschide într-o filă nouă)</Link></p>
            {loading ? <p>Se încarcă opțiunile…</p> : error ? <p role="alert">{error}</p> : (
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                    <h3 style={{ fontWeight: 700 }}>Datele tale cu caracter personal</h3>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={notice?.version === PRIVACY_VERSION && notice.accepted} disabled={busy || (notice?.version === PRIVACY_VERSION && notice.accepted)} onChange={() => void save("privacy_notice", true)} />
                        <span>{NOTICE_LABEL}</span>
                    </label>
                    <p style={{ fontSize: 14 }}>Folosim date precum numele, adresa de e-mail și rezultatele sportive pentru cont, înscrieri și clasamente. Bifa confirmă că ai citit aceste explicații. Dacă dorești modificarea sau ștergerea datelor, contactează organizatorul.</p>
                    {notice ? <p style={{ fontSize: 14 }}>Informare citită la {new Date(notice.created_at).toLocaleString("ro-RO")}.</p> : null}
                    <div style={{ borderTop: "1px solid #bbb", paddingTop: 16 }}><h3 style={{ fontWeight: 700 }}>Fotografii și filmări</h3><p style={{ fontSize: 14 }}>Tu alegi dacă îți dai acordul. Poți participa și fără această bifă.</p></div>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={media?.accepted === true} disabled={busy} onChange={(event) => void save("media", event.target.checked)} />
                        <span>{MEDIA_LABEL}</span>
                    </label>
                    <p style={{ fontSize: 14 }}>Stare: <strong>{!media ? "Acord neexprimat" : media.accepted ? "Acord foto-video activ" : "Fără acord foto-video"}</strong>.{media ? <> Ultima modificare: {new Date(media.created_at).toLocaleString("ro-RO")}.</> : null} Modificările se salvează automat.</p>
                    {message ? <p role="status" style={{ padding: 14, border: "1px solid #888", borderRadius: 8 }}>{message}</p> : null}
                </div>
            )}
        </section>
    );
}
