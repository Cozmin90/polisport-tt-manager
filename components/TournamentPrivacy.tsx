"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { latestEvent, PrivacyEvent } from "../lib/privacy";

type Participant = { player_id: string; status: string; players: { full_name: string } | null };

export default function TournamentPrivacy({ tournamentId }: { tournamentId: string }) {
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [events, setEvents] = useState<PrivacyEvent[]>([]);
    const [error, setError] = useState("");
    const [updated, setUpdated] = useState("");
    useEffect(() => {
        let active = true;
        let running = false;
        async function load() {
            if (running) return;
            running = true;
            try {
                const { data: registrations, error: regError } = await supabase.from("registrations").select("player_id,status,players:player_id(full_name)").eq("tournament_id", tournamentId);
                if (regError) throw regError;
                const rows = (registrations ?? []) as unknown as Participant[];
                const ids = rows.map((row) => row.player_id);
                const result = ids.length ? await supabase.from("privacy_preferences").select("*").in("user_id", ids).order("id", { ascending: false }) : { data: [], error: null };
                if (result.error) throw result.error;
                if (active) { setParticipants(rows); setEvents(result.data ?? []); setUpdated(new Date().toLocaleTimeString("ro-RO")); setError(""); }
            } catch {
                if (active) setError("Preferințele nu au putut fi actualizate. Nu presupune existența acordului; verifică înainte de utilizarea materialelor.");
            } finally { running = false; }
        }
        void load();
        const interval = window.setInterval(() => void load(), 30000);
        window.addEventListener("focus", load);
        return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", load); };
    }, [tournamentId]);

    return <details style={{ marginTop: 16, padding: 12, border: "1px solid #888", borderRadius: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Date personale și acorduri foto-video — participanți</summary>
        <p style={{ margin: "12px 0" }}>Actualizare automată la 30 de secunde și la revenirea în pagină. {updated ? `Ultima actualizare: ${updated}.` : "Se încarcă…"}</p>
        <p>„Neexprimat” și „Fără acord” nu permit utilizarea materialelor pe baza consimțământului. Comunică preferințele echipei foto-video. Refuzul nu restricționează participarea.</p>
        {error ? <p role="alert">{error}</p> : <div style={{ overflowX: "auto", marginTop: 12 }}><table style={{ width: "100%", textAlign: "left" }}>
            <thead><tr><th>Participant</th><th>Înscriere</th><th>Informare</th><th>Foto-video</th><th>Modificat</th></tr></thead>
            <tbody>{participants.map((participant) => {
                const own = events.filter((event) => event.user_id === participant.player_id);
                const media = latestEvent(own, "media");
                const notice = latestEvent(own, "privacy_notice");
                return <tr key={participant.player_id}>
                    <td style={{ padding: "8px 6px" }}>{participant.players?.full_name ?? "Participant"}</td>
                    <td>{participant.status}</td><td>{notice?.accepted ? "Citită" : "Neconfirmată"}</td>
                    <td><strong>{!media ? "Neexprimat" : media.accepted ? "Acord acordat" : "Fără acord"}</strong></td>
                    <td>{media ? new Date(media.created_at).toLocaleString("ro-RO") : "—"}</td>
                </tr>;
            })}</tbody>
        </table></div>}
    </details>;
}
