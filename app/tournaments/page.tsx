"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type TournamentRow = {
    id: string;
    title: string;
    start_at: string;
    location: string | null;
    format: "LOWER_UPPER_KO" | "GROUPS_KO";
    status: string;
};

function prettyFormat(f: TournamentRow["format"]) {
    return f === "LOWER_UPPER_KO" ? "Inferioare → Superioare → KO" : "Grupe → KO direct";
}

function prettyDate(d: string) {
    try {
        return new Date(d).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return d ?? "—";
    }
}

export default function PublicTournamentsHistoryPage() {
    const [loading, setLoading] = useState(true);
    const [tournaments, setTournaments] = useState<TournamentRow[]>([]);

    async function load() {
        setLoading(true);

        const { data, error } = await supabase
            .from("tournaments")
            .select("id,title,location,start_at,format,status")
            .eq("status", "FINISHED")
            .order("start_at", { ascending: false });

        if (error) {
            console.error(error);
            setTournaments([]);
            setLoading(false);
            return;
        }

        setTournaments((data as any) ?? []);
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, []);

    return (
        <main
            style={{
                minHeight: "100vh",
                background: "var(--ps-bg, #f6f7fb)",
                padding: "18px 0 28px",
            }}
        >
            <div className="mx-auto max-w-6xl px-4">
                {/* Header card (same width as the rest) */}
                <div
                    className="ps-card"
                    style={{
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid rgba(0,0,0,0.06)",
                        background: "var(--ps-card, #fff)",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: 24,
                                    fontWeight: 900,
                                    color: "#2f3c6e",
                                    lineHeight: 1.15,
                                }}
                            >
                                Istoric turnee
                            </h1>
                            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                                Turnee finalizate (public • read-only)
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <Link href="/" style={{ fontSize: 14, opacity: 0.9 }}>Acasă</Link>
                            <Link href="/login" style={{ fontSize: 14, opacity: 0.9 }}>Login</Link>
                        </div>
                    </div>
                </div>

                {/* List */}
                <section style={{ marginTop: 14 }}>
                    {loading ? (
                        <div className="ps-card" style={{ padding: 14, borderRadius: 18, background: "var(--ps-card, #fff)" }}>
                            Se încarcă...
                        </div>
                    ) : tournaments.length === 0 ? (
                        <div className="ps-card" style={{ padding: 14, borderRadius: 18, background: "var(--ps-card, #fff)", opacity: 0.9 }}>
                            Nu există turnee finalizate.
                        </div>
                    ) : (
                        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                            {tournaments.map((t) => (
                                <Link
                                    key={t.id}
                                    href={`/tournaments/${t.id}`}
                                    style={{
                                        textDecoration: "none",
                                        color: "inherit",
                                        display: "block",
                                    }}
                                >
                                    <div
                                        className="ps-card"
                                        style={{
                                            padding: 14,
                                            borderRadius: 18,
                                            border: "1px solid rgba(0,0,0,0.06)",
                                            background: "#fff",
                                            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                                            transition: "transform 0.15s ease, box-shadow 0.15s ease",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "translateY(-2px)";
                                            e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,0.08)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "translateY(0)";
                                            e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.05)";
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
                                            <div style={{ minWidth: 240 }}>
                                                <div style={{ fontWeight: 900, fontSize: 15 }}>{t.title}</div>
                                                <div style={{ opacity: 0.88, fontSize: 12.5, marginTop: 4 }}>
                                                    {t.start_at ? prettyDate(t.start_at) : "—"} • {t.location ?? "—"}
                                                </div>
                                            </div>

                                            <div style={{ textAlign: "right", fontSize: 12, opacity: 0.9 }}>
                                                <div>{prettyFormat(t.format)}</div>
                                                <div style={{ marginTop: 2 }}>Status: {t.status}</div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
