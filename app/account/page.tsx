"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type PlayerRow = {
    id: string;
    display_name: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    mp: number | null;
    mp_max: number | null;
    amatur_mp: number | null;
    is_admin: boolean | null;
};

type TournamentRow = {
    title: string;
    start_at: string;
    status: string;
    format: string;
    location: string | null;
};

// We select registrations with "*" so the page won't break if you later add new columns like final_place.
// (We do NOT list unknown columns explicitly, because Supabase would error if they don't exist yet.)
type MyRegRow = {
    tournament_id: string;
    status: string | null;
    // optional (recommended to add later)
    final_place?: number | null;
    ko_label?: string | null; // e.g., "Campion", "Finalist", "Semifinale"
    tournaments?: TournamentRow | null;
};

function formatRO(iso: string) {
    try {
        return new Date(iso).toLocaleString("ro-RO", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    } catch {
        return iso;
    }
}

// Temporary fallback: map status of registration -> text
function mapPlaceFallback(status: string | null | undefined) {
    if (!status) return "—";
    const s = status.toLowerCase();
    if (s === "winner" || s === "champion" || s === "1") return "Locul 1";
    if (s === "finalist" || s === "runner_up" || s === "runner-up" || s === "2") return "Locul 2";
    if (s === "semi_finalist" || s === "semifinalist" || s === "3") return "Locul 3";
    if (s === "completed") return "Participant";
    if (s === "registered" || s === "inscris" || s === "înscris") return "Înscris";
    return "—";
}

const navBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #ddd",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    lineHeight: 1,
};

const card: React.CSSProperties = {
    marginTop: 16,
    border: "1px solid #222",
    borderRadius: 14,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
};

function Row({ label, value }: { label: string; value: any }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7 }}>{label}</div>
            <div style={{ fontWeight: 650 }}>{String(value)}</div>
        </div>
    );
}

export default function AccountPage() {
    const [loading, setLoading] = useState(true);
    const [authEmail, setAuthEmail] = useState<string | null>(null);
    const [authUid, setAuthUid] = useState<string | null>(null);

    const [player, setPlayer] = useState<PlayerRow | null>(null);
    const [playerIdForRegs, setPlayerIdForRegs] = useState<string | null>(null);

    const [regsLoading, setRegsLoading] = useState(true);
    const [myRegs, setMyRegs] = useState<MyRegRow[]>([]);

    const [errorText, setErrorText] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function load() {
            setLoading(true);
            setRegsLoading(true);
            setErrorText(null);
            setMyRegs([]);

            // 1) Auth user
            const { data: authData, error: authErr } = await supabase.auth.getUser();
            if (authErr) console.error("auth.getUser error:", authErr);

            const user = authData?.user ?? null;
            const uid = user?.id ?? null;
            const email = user?.email ?? null;

            if (!mounted) return;

            setAuthUid(uid);
            setAuthEmail(email);

            if (!uid) {
                setPlayer(null);
                setPlayerIdForRegs(null);
                setLoading(false);
                setRegsLoading(false);
                return;
            }

            // 2) Player profile from players
            const { data: p, error: pErr } = await supabase
                .from("players")
                .select("id,display_name,full_name,first_name,last_name,mp,mp_max,amatur_mp,is_admin")
                .eq("id", uid)
                .maybeSingle();

            let resolvedPlayer: PlayerRow | null = null;

            if (pErr) {
                console.error("players read error:", pErr);
                setErrorText(`Eroare la citirea profilului: ${(pErr as any)?.message ?? "necunoscută"}`);
            } else {
                resolvedPlayer = (p as PlayerRow) ?? null;
            }

            if (!mounted) return;

            setPlayer(resolvedPlayer);

            // Use players.id when available; otherwise fallback to auth.uid
            const pid = resolvedPlayer?.id ?? uid;
            setPlayerIdForRegs(pid);

            setLoading(false);

            // 3) Registrations history
            // IMPORTANT: we use "*" for registrations so you can add columns later (final_place, ko_label)
            const { data: regs, error: rErr } = await supabase
                .from("registrations")
                .select(
                    `*,
          tournaments: tournaments (
            title,
            start_at,
            status,
            format,
            location
          )`
                )
                .eq("player_id", pid)
                .order("id", { ascending: false });

            if (!mounted) return;

            if (rErr) {
                console.error("registrations read error:", rErr);
                setErrorText((prev) => prev ?? `Eroare la citirea istoricului: ${(rErr as any)?.message ?? "necunoscută"}`);
                setMyRegs([]);
            } else {
                setMyRegs(((regs ?? []) as MyRegRow[]).filter(Boolean));
            }

            setRegsLoading(false);
        }

        load();

        return () => {
            mounted = false;
        };
    }, []);

    const name =
        (player?.display_name ?? "").trim() ||
        [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() ||
        (player?.full_name ?? "").trim() ||
        "—";

    function placeText(r: MyRegRow) {
        // Preferred: real place saved in DB (registrations.final_place)
        if (typeof r.final_place === "number" && r.final_place > 0) return `Locul ${r.final_place}`;
        // Optional: KO label saved in DB
        if (r.ko_label) return r.ko_label;
        // Fallback: old mapping from status
        return mapPlaceFallback(r.status);
    }

    return (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h1 style={{ margin: 0 }}>Contul meu</h1>
                <div style={{ marginLeft: "auto" }}>
                    <Link href="/" style={navBtn}>
                        ← Înapoi acasă
                    </Link>
                </div>
            </div>

            {errorText ? (
                <div style={{ ...card, borderColor: "#6a0000" }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>A apărut o problemă</div>
                    <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{errorText}</div>
                </div>
            ) : null}

            <div style={card}>
                {loading ? (
                    <div>Se încarcă profilul…</div>
                ) : !authUid ? (
                    <div>
                        Nu ești logat.
                        <div style={{ marginTop: 10 }}>
                            <Link href="/login" style={{ textDecoration: "underline" }}>
                                Mergi la Login
                            </Link>
                        </div>
                    </div>
                ) : !player ? (
                    <div>
                        Ești logat ca <b>{authEmail ?? "—"}</b> (uid: {authUid}), dar profilul din <b>players</b> nu a fost găsit
                        sau RLS blochează citirea.
                    </div>
                ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                        <Row label="Nume" value={name} />
                        <Row label="Email (Auth)" value={authEmail ?? "—"} />
                        <Row label="ID unic:" value={playerIdForRegs ?? "—"} />
                        <Row label="Admin" value={player.is_admin ? "DA" : "NU"} />
                        <Row label="MP Actual" value={player.mp ?? 0} />
                        <Row label="MP Max" value={player.mp_max ?? (player.mp ?? 0)} />
                        <Row label="MP circuit Amatur" value={player.amatur_mp ?? 0} />
                    </div>
                )}
            </div>

            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Istoric turnee</h2>
                </div>

                {regsLoading ? (
                    <div style={{ marginTop: 12 }}>Se încarcă istoricul…</div>
                ) : myRegs.length === 0 ? (
                    <div style={{ marginTop: 12, opacity: 0.85 }}>Nu ai înregistrări la turnee încă.</div>
                ) : (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {myRegs.map((r, idx) => {
                            const t = r.tournaments;
                            return (
                                <div
                                    key={`${r.tournament_id}-${idx}`}
                                    style={{
                                        border: "1px solid #333",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "rgba(0,0,0,0.25)",
                                    }}
                                >
                                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                        <div style={{ fontWeight: 800 }}>{t?.title ?? "Turneu"}</div>
                                        <div style={{ opacity: 0.75 }}>{t?.start_at ? formatRO(t.start_at) : ""}</div>
                                        <div style={{ marginLeft: "auto", opacity: 0.9 }}>
                                            Status înscriere: <b>{r.status ?? "—"}</b>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>
                                        Loc obținut: <b>{placeText(r)}</b>
                                        <span style={{ opacity: 0.65 }}> (recomandat: salvare în DB ca registrations.final_place)</span>
                                    </div>

                                    <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                                        {t?.location ? `Locație: ${t.location} · ` : ""}
                                        {t?.format ? `Format: ${t.format} · ` : ""}
                                        {t?.status ? `Status turneu: ${t.status}` : ""}
                                    </div>

                                    <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                        <Link href={`/tournaments/${r.tournament_id}`} style={{ textDecoration: "underline" }}>
                                            Vezi clasamentul / detalii turneu
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 18, opacity: 0.75, fontSize: 13 }}>
                De ce nu pot lua direct „locul” din Supabase acum?
                <ul style={{ marginTop: 8 }}>
                    <li>View-ul <b>tournament_overview</b> este doar despre turnee (număr înscriși, status, etc.), nu despre clasament.</li>
                    <li>Clasamentul pe care îl vezi pe pagina turneului este calculat (din meciuri/KO/grupe) și nu pare salvat ca tabel/view separat.</li>
                    <li>Cea mai simplă soluție: la „Finalizează turneu” să scriem în <b>registrations.final_place</b> locul fiecărui jucător.</li>
                </ul>
            </div>
        </div>
    );
}
