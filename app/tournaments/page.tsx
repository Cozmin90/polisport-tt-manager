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
        <main style={{ maxWidth: 1150, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Istoric turnee</h1>
                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>Turnee finalizate (public • read-only)</div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                    <Link href="/">Acasă</Link>
                    <Link href="/login">Login</Link>
                </div>
            </header>

            <section style={{ marginTop: 14 }}>
                {loading ? (
                    <div style={{ padding: 12 }}>Se încarcă...</div>
                ) : tournaments.length === 0 ? (
                    <div style={{ padding: 12, opacity: 0.85 }}>Nu există turnee finalizate.</div>
                ) : (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {tournaments.map((t) => (
                            <Link
                                key={t.id}
                                href={`/tournaments/${t.id}`}
                                style={{
                                    textDecoration: "none",
                                    color: "inherit",
                                    border: "1px solid #eee",
                                    borderRadius: 12,
                                    padding: 12,
                                    display: "block",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: 16 }}>{t.title}</div>
                                        <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
                                            {t.start_at ? new Date(t.start_at).toLocaleString("ro-RO") : "—"} • {t.location ?? "—"}
                                        </div>
                                    </div>

                                    <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85 }}>
                                        <div>{prettyFormat(t.format)}</div>
                                        <div>Status: {t.status}</div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
