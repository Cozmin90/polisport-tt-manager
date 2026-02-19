"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

// NOTE: This component is safe for public use only if your Supabase RLS allows
// SELECT on the fields/tables queried below (or you expose them via public views).

type PublicPlayer = {
    id: string;
    display_name: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    mp: number | null;
    mp_max: number | null;
    penalty_points?: number | null;
    banned_until?: string | null;
};

type TournamentRow = {
    id?: string;
    title: string;
    start_at: string;
    status: string;
    format: string;
    location: string | null;
    category?: string | null;
    is_rated?: boolean | null;
};

type RegRow = {
    tournament_id: string;
    status: string | null;
    registered_at?: string | null;
    withdrawn_at?: string | null;

    mp_before?: number | null;
    mp_turneu?: number | null;
    mp_after?: number | null;

    final_place?: number | string | null;
    ko_label?: string | null;
    is_zv?: boolean | null;

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

function normalizeCat(raw: any): string {
    const s = String(raw ?? "").trim();
    if (!s) return "OPEN";
    const up = s.toUpperCase();
    if (["OPEN", "OP", "GENERAL", "GENERALA", "ALL"].includes(up)) return "OPEN";
    if (["HOBBY", "HOBBIT", "AMATOR", "AMATORI", "RECREATIONAL"].includes(up)) return "HOBBY";
    if (up.includes("AVANS")) return "AVANSATI";
    if (["ADVANCED", "AVANCED", "ADV"].includes(up)) return "AVANSATI";
    if (["ELITE", "PRO", "EXPERT"].includes(up) || up.includes("ELIT")) return "ELITE";
    return up;
}

function prettyCat(cat: string) {
    const up = String(cat || "").toUpperCase();
    if (up === "OPEN") return "Open";
    if (up === "HOBBY") return "Hobby";
    if (up === "AVANSATI") return "Avansați";
    if (up === "ELITE") return "Elite";
    return cat;
}

function parseFinalPlace(fp: any): number | null {
    if (fp === null || fp === undefined) return null;
    const s = String(fp).trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
}

const card: React.CSSProperties = {
    borderRadius: 14,
    padding: 16,
    background: "white",
    boxShadow: "0 3px 6px rgba(0,0,0,0.15)",
};

function Stat({ label, value }: { label: string; value: any }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, padding: "6px 0" }}>
            <div style={{ opacity: 0.75 }}>{label}</div>
            <div style={{ fontWeight: 800 }}>{String(value)}</div>
        </div>
    );
}

export default function PlayerProfile({
    playerId,
    showOwnerActions = false,
}: {
    playerId: string;
    showOwnerActions?: boolean;
}) {
    const safePlayerId = (playerId ?? "").toString().trim();
    // Relaxed UUID check (accepts any standard UUID, without enforcing version/variant)
    const isValidUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(safePlayerId);

    // Guard against /players/undefined or missing param
    if (!isValidUuid) {
        return <div style={{ padding: 16 }}>Profil invalid.</div>;
    }

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [player, setPlayer] = useState<PublicPlayer | null>(null);
    const [regs, setRegs] = useState<RegRow[]>([]);

    useEffect(() => {
        let alive = true;

        async function load() {
            setLoading(true);
            setErr(null);

            // 1) player (safe columns only)
            const pRes = await supabase
                .from("players")
                .select("id, display_name, full_name, first_name, last_name, mp, mp_max, penalty_points, banned_until")
                .eq("id", safePlayerId)
                .maybeSingle();

            if (!alive) return;

            if (pRes.error) {
                setErr(pRes.error.message);
                setLoading(false);
                return;
            }

            setPlayer((pRes.data as any) ?? null);

            // 2) registrations + tournaments
            const rRes = await supabase
                .from("registrations")
                .select(
                    [
                        "tournament_id",
                        "status",
                        "registered_at",
                        "withdrawn_at",
                        "mp_before",
                        "mp_turneu",
                        "mp_after",
                        "final_place",
                        "ko_label",
                        "is_zv",
                        "tournaments: tournaments ( title, start_at, status, format, location, category, is_rated )",
                    ].join(",")
                )
                .eq("player_id", safePlayerId)
                .order("registered_at", { ascending: false });

            if (!alive) return;

            if (rRes.error) {
                // don't hard-fail if RLS blocks registrations; show player header still
                setRegs([]);
            } else {
                setRegs((rRes.data as any) ?? []);
            }

            setLoading(false);
        }

        load();
        return () => {
            alive = false;
        };
    }, [safePlayerId]);

    const displayName = useMemo(() => {
        if (!player) return "Jucător";
        return (
            player.display_name ||
            player.full_name ||
            [player.first_name, player.last_name].filter(Boolean).join(" ") ||
            "Jucător"
        );
    }, [player]);

    const stats = useMemo(() => {
        const finished = regs.filter((r) => String(r.tournaments?.status ?? "").toUpperCase() === "FINISHED");
        const played = finished.length;

        // average MP turneu (exclude ZV)
        const rated = finished.filter((r) => (r.is_zv ?? false) === false && typeof r.mp_turneu === "number");
        const avgMpTurneu = rated.length ? rated.reduce((s, r) => s + (r.mp_turneu ?? 0), 0) / rated.length : null;

        // podium counts based on final_place (1,2,3/4)
        let gold = 0,
            silver = 0,
            bronze = 0;
        for (const r of finished) {
            const p = parseFinalPlace(r.final_place);
            if (p === 1) gold++;
            else if (p === 2) silver++;
            else if (p === 3 || p === 4) bronze++;
        }

        return {
            played,
            ratedCount: rated.length,
            avgMpTurneu,
            gold,
            silver,
            bronze,
        };
    }, [regs]);

    if (loading) {
        return (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
                <div style={{ ...card }}>Se încarcă profilul…</div>
            </div>
        );
    }

    if (err) {
        return (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
                <div style={{ ...card, border: "1px solid #f3c" }}>Eroare: {err}</div>
            </div>
        );
    }

    if (!player) {
        return (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
                <div style={{ ...card }}>Jucător inexistent sau profil indisponibil.</div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <div style={{ fontSize: 26, fontWeight: 950 }}>{displayName}</div>
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                        MP curent: <b>{player.mp ?? "—"}</b> · MP max: <b>{player.mp_max ?? "—"}</b>
                        {player.banned_until ? (
                            <span style={{ marginLeft: 10 }}>
                                · Suspendat până la <b>{formatRO(player.banned_until)}</b>
                            </span>
                        ) : null}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link href="/" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", textDecoration: "none", fontWeight: 800 }}>
                        ⟵ Acasă
                    </Link>
                    {showOwnerActions ? (
                        <Link href="/account" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", textDecoration: "none", fontWeight: 800 }}>
                            Profilul meu
                        </Link>
                    ) : null}
                </div>
            </div>

            <div style={{ marginTop: 16, ...card }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Palmares (turnee FINISHED)</div>
                <Stat label="Turnee jucate" value={stats.played} />
                <Stat label="Turnee cu MP Turneu (fără ZV)" value={stats.ratedCount} />
                <Stat label="Medie MP Turneu" value={stats.avgMpTurneu === null ? "—" : stats.avgMpTurneu.toFixed(2)} />
                <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>🥇 {stats.gold}</div>
                    <div style={{ fontWeight: 900 }}>🥈 {stats.silver}</div>
                    <div style={{ fontWeight: 900 }}>🥉 {stats.bronze}</div>
                </div>
            </div>

            <div style={{ marginTop: 16, ...card }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Istoric turnee</div>
                {regs.length === 0 ? (
                    <div style={{ opacity: 0.8 }}>Nu există înregistrări sau nu sunt vizibile public (verifică RLS/View).</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr>
                                    {[
                                        "Data",
                                        "Turneu",
                                        "Status",
                                        "Categorie",
                                        "Loc",
                                        "MP înainte",
                                        "MP Turneu",
                                        "MP după",
                                        "ZV",
                                    ].map((h) => (
                                        <th
                                            key={h}
                                            style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee", fontWeight: 900, whiteSpace: "nowrap" }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {regs
                                    .slice()
                                    .sort((a, b) => {
                                        const da = a.tournaments?.start_at ? new Date(a.tournaments.start_at).getTime() : 0;
                                        const db = b.tournaments?.start_at ? new Date(b.tournaments.start_at).getTime() : 0;
                                        return db - da;
                                    })
                                    .map((r, idx) => {
                                        const t = r.tournaments;
                                        const cat = prettyCat(normalizeCat(t?.category ?? "OPEN"));
                                        const place = parseFinalPlace(r.final_place);
                                        return (
                                            <tr key={idx}>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" }}>
                                                    {t?.start_at ? formatRO(t.start_at) : "—"}
                                                </td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{t?.title ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{t?.status ?? r.status ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" }}>{cat}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{place ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{r.mp_before ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{r.mp_turneu ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{r.mp_after ?? "—"}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3" }}>{r.is_zv ? "da" : ""}</td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
                Tip: pentru acces public, asigură-te că Supabase RLS permite SELECT pentru tabelul <b>players</b> și pentru
                <b> registrations</b> + <b>tournaments</b> (ideal prin views publice).
            </div>
        </div>
    );
}
