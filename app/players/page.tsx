"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type PlayerRow = {
    id: string;
    full_name: string;
    display_name: string | null;
    mp: number | string | null;
    mp_max: number | string | null;
    penalty_points: number | null;
    banned_until: string | null;
    upb_role?: string | null;
    upb_center?: string | null;
    upb_faculty?: string | null;
    upb_partner_name?: string | null;
};

type SortKey =
    | "name_asc"
    | "name_desc"
    | "mp_desc"
    | "mp_asc"
    | "mpmax_desc"
    | "mpmax_asc";

function toNum(v: number | string | null | undefined): number {
    if (v === null || v === undefined) return 0;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : 0;
}

// ✅ CATEGORII OFICIALE POLISPORT (DOAR DUPĂ MP MAX)
// Hobby: MP max < 20
// Avansați: 20 ≤ MP max < 40
// Elite: MP max ≥ 40
function categoryFromMpMax(mpMax: number): "H" | "A" | "E" {
    if (mpMax >= 40) return "E";
    if (mpMax >= 20) return "A";
    return "H";
}

const catLabels: Record<"H" | "A" | "E", string> = {
    H: "Hobby",
    A: "Avansați",
    E: "Elite",
};

function getRoleLabel(role?: string | null): string {
    switch (role) {
        case "employee":
            return "Profesor / Angajat";
        case "student":
            return "Student";
        case "alumni":
            return "Alumni";
        case "partner":
            return "Partener";
        case "guest":
            return "Invitat";
        default:
            return "—";
    }
}

function getFacultyShort(raw?: string | null): string {
    const cleaned = String(raw ?? "").replace(/^\d+\.\s*/, "").trim();
    if (!cleaned) return "—";

    const map: Record<string, string> = {
        "Facultatea de Inginerie Electrică": "IE",
        "Facultatea de Inginerie Industrială și Robotică": "FIIR",
        "Facultatea de Inginerie Chimică și Biotehnologii": "FICBi",
        "Facultatea de Energetică": "ENER",
        "Facultatea de Ingineria Sistemelor Biotehnice": "ISB",
        "Facultatea de Inginerie în Limbi Străine": "FILS",
        "Facultatea de Automatică și Calculatoare": "AC",
        "Facultatea de Transporturi": "TR",
        "Facultatea de Științe Aplicate": "FSA",
        "Facultatea de Electronică, Telecomunicații și Tehnologia Informației": "ETTI",
        "Facultatea de Inginerie Aerospațială": "IAERO",
        "Facultatea de Inginerie Medicală": "IM",
        "Facultatea de Inginerie Mecanică și Mecatronică": "FIMM",
        "Facultatea de Știința și Ingineria Materialelor": "SIM",
        "Facultatea de Antreprenoriat, Ingineria și Managementul Afacerilor": "FAIMA",
        "Facultatea de Științe, Educație Fizică și Informatică": "SEFI",
        "Facultatea de Mecanică și Tehnologie": "MT",
        "Facultatea de Electronică, Comunicații și Calculatoare": "ECC",
        "Facultatea de Științe ale Educației, Științe Sociale și Psihologie": "SESSP",
        "Facultatea de Științe Economice și Drept": "SED",
        "Facultatea de Teologie, Litere, Istorie și Arte": "TLIA",
        "Rectorat / Administrativ": "RECT/ADM",
    };

    return map[cleaned] ?? cleaned;
}

function getAffiliationLabel(p: Pick<PlayerRow, "upb_role" | "upb_center" | "upb_faculty" | "upb_partner_name">): string {
    if (!p?.upb_role) return "—";

    if (p.upb_role === "guest") return "Invitat UPB";

    if (p.upb_role === "partner") {
        const partner = String(p.upb_partner_name ?? "").trim();
        return partner ? `Partener UPB / ${partner}` : "Partener UPB";
    }

    if (p.upb_role === "employee" || p.upb_role === "student" || p.upb_role === "alumni") {
        const center = p.upb_center === "PIT" ? "UPB PIT" : p.upb_center === "BUC" ? "UPB BUC" : "UPB";
        const faculty = getFacultyShort(p.upb_faculty);
        return faculty && faculty !== "—" ? `${center} / ${faculty}` : center;
    }

    return "—";
}

export default function PlayersDirectoryPage() {
    const [players, setPlayers] = useState<PlayerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortKey>("mpmax_desc");
    const [activeCat, setActiveCat] = useState<"ALL" | "H" | "A" | "E">("ALL");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setErr(null);

            const { data, error } = await supabase
                .from("players")
                .select("id, full_name, display_name, mp, mp_max, penalty_points, banned_until, upb_role, upb_center, upb_faculty, upb_partner_name")
                .order("full_name", { ascending: true });

            if (cancelled) return;

            if (error) {
                setErr(error.message);
                setPlayers([]);
            } else {
                setPlayers((data as any[]) as PlayerRow[]);
            }

            setLoading(false);
        }

        load();

        return () => {
            cancelled = true;
        };
    }, []);

    const normalized = useMemo(() => {
        const q = search.trim().toLowerCase();

        return players
            .map((p) => {
                const name = (p.display_name || p.full_name || "").trim();
                const mp = toNum(p.mp);
                const mpMax = toNum(p.mp_max);
                const category = categoryFromMpMax(mpMax);
                const roleLabel = getRoleLabel(p.upb_role);
                const affiliationLabel = getAffiliationLabel(p);
                return { ...p, name, mp, mpMax, category, roleLabel, affiliationLabel };
            })
            .filter((p) => {
                if (activeCat !== "ALL" && p.category !== activeCat) return false;
                if (!q) return true;
                return (
                    p.name.toLowerCase().includes(q) ||
                    p.roleLabel.toLowerCase().includes(q) ||
                    p.affiliationLabel.toLowerCase().includes(q)
                );
            });
    }, [players, search, activeCat]);

    const sorted = useMemo(() => {
        const arr = [...normalized];
        arr.sort((a, b) => {
            switch (sort) {
                case "name_asc":
                    return a.name.localeCompare(b.name);
                case "name_desc":
                    return b.name.localeCompare(a.name);
                case "mp_desc":
                    return b.mp - a.mp || a.name.localeCompare(b.name);
                case "mp_asc":
                    return a.mp - b.mp || a.name.localeCompare(b.name);
                case "mpmax_desc":
                    return b.mpMax - a.mpMax || a.name.localeCompare(b.name);
                case "mpmax_asc":
                    return a.mpMax - b.mpMax || a.name.localeCompare(b.name);
                default:
                    return a.name.localeCompare(b.name);
            }
        });
        return arr;
    }, [normalized, sort]);

    const grouped = useMemo(() => {
        const g: Record<string, typeof sorted> = { H: [], A: [], E: [] };
        for (const p of sorted) {
            g[p.category].push(p);
        }
        return g as Record<"H" | "A" | "E", typeof sorted>;
    }, [sorted]);

    return (
        <div style={{ padding: 18, maxWidth: 1280, margin: "0 auto" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <h1 style={{ margin: 0, fontSize: 26 }}>Jucători</h1>
                    <div style={{ opacity: 0.75, marginTop: 6 }}>
                        Pagină publică cu filtre + acces rapid la profilul fiecărui jucător.
                    </div>
                </div>

                <Link
                    href="/"
                    style={{
                        textDecoration: "none",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.12)",
                    }}
                >
                    Înapoi acasă
                </Link>
            </div>

            <div
                style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 12,
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                }}
            >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Caută după nume, statut sau afiliere…"
                        style={{
                            flex: "1 1 260px",
                            minWidth: 0,
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.18)",
                            outline: "none",
                        }}
                    />

                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        style={{
                            maxWidth: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.18)",
                            background: "#fff",
                        }}
                    >
                        <option value="mpmax_desc">MP Max ↓</option>
                        <option value="mpmax_asc">MP Max ↑</option>
                        <option value="mp_desc">MP curent ↓</option>
                        <option value="mp_asc">MP curent ↑</option>
                        <option value="name_asc">Nume A→Z</option>
                        <option value="name_desc">Nume Z→A</option>
                    </select>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["ALL", "H", "A", "E"] as const).map((c) => {
                        const isActive = activeCat === c;
                        const label = c === "ALL" ? "Toți" : catLabels[c];
                        return (
                            <button
                                key={c}
                                onClick={() => setActiveCat(c)}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(0,0,0,0.18)",
                                    background: isActive ? "rgba(0,0,0,0.06)" : "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {err ? <div style={{ color: "crimson" }}>Eroare: {err}</div> : null}
                {loading ? <div>Se încarcă…</div> : null}
            </div>

            <div style={{ marginTop: 16 }}>
                {(["H", "A", "E"] as const).map((cat) => {
                    const list = grouped[cat] || [];
                    if (activeCat !== "ALL" && activeCat !== cat) return null;

                    return (
                        <div key={cat} style={{ marginTop: 14 }}>
                            <h2 style={{ margin: "10px 0" }}>
                                {catLabels[cat]}{" "}
                                <span style={{ opacity: 0.6, fontSize: 14 }}>({list.length})</span>
                            </h2>

                            <div
                                style={{
                                    borderRadius: 12,
                                    border: "1px solid rgba(0,0,0,0.12)",
                                    overflowX: "auto",
                                    overflowY: "hidden",
                                    WebkitOverflowScrolling: "touch",
                                    background: "#fff",
                                }}
                            >
                                {list.length === 0 ? (
                                    <div style={{ padding: 14, opacity: 0.7 }}>
                                        Niciun jucător în această categorie.
                                    </div>
                                ) : (
                                    <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr style={{ background: "rgba(0,0,0,0.04)" }}>
                                                <th style={{ textAlign: "left", padding: 12 }}>Jucător</th>
                                                <th style={{ textAlign: "left", padding: 12, width: 170 }}>Statut</th>
                                                <th style={{ textAlign: "left", padding: 12, width: 220 }}>Afiliere</th>
                                                <th style={{ textAlign: "right", padding: 12, width: 120 }}>MP</th>
                                                <th style={{ textAlign: "right", padding: 12, width: 120 }}>MP Max</th>
                                                <th style={{ textAlign: "right", padding: 12, width: 140 }}>Profil</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {list.map((p) => (
                                                <tr key={p.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                                                    <td style={{ padding: 12 }}>
                                                        <Link
                                                            href={`/players/${p.id}`}
                                                            style={{ textDecoration: "none", color: "inherit", fontWeight: 700 }}
                                                            title="Vezi profilul jucătorului"
                                                        >
                                                            {(p.display_name || p.full_name || "").trim()}
                                                        </Link>
                                                        {p.banned_until ? (
                                                            <span style={{ marginLeft: 8, fontSize: 12, color: "crimson" }}>
                                                                (ban)
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                    <td style={{ padding: 12 }}>{p.roleLabel}</td>
                                                    <td style={{ padding: 12 }}>{p.affiliationLabel}</td>
                                                    <td style={{ padding: 12, textAlign: "right" }}>{toNum(p.mp)}</td>
                                                    <td style={{ padding: 12, textAlign: "right" }}>{toNum(p.mp_max)}</td>
                                                    <td style={{ padding: 12, textAlign: "right" }}>
                                                        <Link
                                                            href={`/players/${p.id}`}
                                                            style={{
                                                                textDecoration: "none",
                                                                padding: "8px 10px",
                                                                borderRadius: 10,
                                                                border: "1px solid rgba(0,0,0,0.16)",
                                                                display: "inline-block",
                                                            }}
                                                        >
                                                            Vezi profil
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
