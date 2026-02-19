"use client";

import { useEffect, useMemo, useState } from "react";
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

    // ✅ as you said: tournaments.category
    category?: string | null; // e.g. OPEN / HOBBY / AVANSATI / ELITE

    is_rated?: boolean | null;
};

type MyRegRow = {
    tournament_id: string;
    status: string | null;

    // Persisted at tournament finalization
    final_place?: number | string | null;

    // Persisted at tournament finalization
    mp_turneu?: number | null;


    // ZV (0 victorii) - nu intră în medie
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
    border: "0px solid #222",
    borderRadius: 14,
    padding: 16,
    background: "white",
    boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
};


const smallCard: React.CSSProperties = {
    border: "0px solid #333",
    borderRadius: 14,
    padding: 14,
    background: "white",
    boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
};

function Row({ label, value }: { label: string; value: any }) {
    const isReactEl = value && typeof value === "object" && "type" in value;
    return (
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 10 }}>
            <div style={{ opacity: 0.7 }}>{label}</div>
            <div style={{ fontWeight: 650 }}>{isReactEl ? value : String(value)}</div>
        </div>
    );
}

function parseFinalPlace(fp: any): number | null {
    if (fp === null || fp === undefined) return null;
    const s = String(fp).trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
}

function medalForPlaceNum(n: number | null): "gold" | "silver" | "bronze" | null {
    if (!n) return null;
    if (n === 1) return "gold";
    if (n === 2) return "silver";
    // două bronzuri: loc 3 și 4
    if (n === 3 || n === 4) return "bronze";
    return null;
}

function medalEmoji(kind: "gold" | "silver" | "bronze") {
    if (kind === "gold") return "🥇";
    if (kind === "silver") return "🥈";
    return "🥉";
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

// ✅ Categoria jucătorului (derivată din MP; pentru "promovare" folosim MP Max).
function playerCategoryFromMp(mp: number | null | undefined) {
    const v = Number(mp ?? 0);
    // Regula voastră:
    // Hobby: < 20
    // Avansați: 20..40
    // Elite: > 40
    if (v < 20) return "HOBBY";
    if (v <= 40) return "AVANSATI";
    return "ELITE";
}

function prettyPlayerCat(cat: string) {
    const up = cat.toUpperCase();
    if (up === "HOBBY") return "Hobby";
    if (up === "AVANSATI") return "Avansați";
    if (up === "CAT_3" || up === "CAT3" || up === "CATEGORIA_A_3A") return "Categoria a 3-a";
    if (up === "ELITE") return "Elite";
    return cat;
}

function Badge({ label, value }: { label: string; value: number }) {
    return (
        <div
            style={{
                border: "1px solid #444",
                borderRadius: 999,
                padding: "8px 10px",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                fontWeight: 900,
            }}
        >
            <span style={{ fontSize: 16 }}>{label}</span>
            <span style={{ fontSize: 14 }}>{value}</span>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.95 }}>
            <span>{label}</span>
            <b>{value}</b>
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
    const [editAmatur, setEditAmatur] = useState(false);
    const [amaturValue, setAmaturValue] = useState<number | "">(player?.amatur_mp ?? "");
    const [savingAmatur, setSavingAmatur] = useState(false);
    const [amaturMsg, setAmaturMsg] = useState<string | null>(null);

    // Penalizări / ban (ciclu care se resetează după expirarea banului)
    const [penaltyPoints, setPenaltyPoints] = useState(0); // puncte curente (după ultimul reset)
    const [bannedUntil, setBannedUntil] = useState<Date | null>(null);
    const [penaltyAllTime, setPenaltyAllTime] = useState(0); // informativ
    const [penaltyErr, setPenaltyErr] = useState<string | null>(null);







    // Detalii penalizări (pentru afișare "info")
    const [penaltyDetails, setPenaltyDetails] = useState<{ at: Date; pts: number; reason: string }[]>([]);
    useEffect(() => {
        let mounted = true;

        async function load() {
            setLoading(true);
            setRegsLoading(true);
            setErrorText(null);
            setMyRegs([]);

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

            const pid = resolvedPlayer?.id ?? uid;
            setPlayerIdForRegs(pid);

            setLoading(false);

            const { data: regs, error: rErr } = await supabase
                .from("registrations")
                .select(
                    `*,
          tournaments: tournaments (
            title,
            start_at,
            status,
            format,
            location,
            category,
            is_rated
          )`
                )
                .eq("player_id", pid)
                .is("withdrawn_at", null)
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

    useEffect(() => {
        if (!playerIdForRegs) return;

        (async () => {
            try {
                setPenaltyErr(null);

                const { data, error } = await supabase
                    .from("registrations")
                    .select("withdraw_penalty,no_show_penalty,penalty_applied,withdrawn_at,tournaments(start_at)")
                    .eq("player_id", playerIdForRegs);

                if (error) throw error;

                const events: { at: Date; pts: number; reason: string }[] = [];
                const details: { at: Date; pts: number; reason: string }[] = [];
                let totalAll = 0;

                for (const r of (data ?? []) as any[]) {
                    const w = Number(r?.withdraw_penalty ?? 0);
                    const n = Number(r?.no_show_penalty ?? 0);
                    const applied = Number(r?.penalty_applied ?? 0);

                    // Prioritate: penalty_applied (dacă e setat), altfel suma (withdraw + no_show)
                    const sum = (Number.isFinite(w) ? w : 0) + (Number.isFinite(n) ? n : 0);
                    const pts = (Number.isFinite(applied) && applied > 0) ? applied : sum;

                    if (!Number.isFinite(pts) || pts <= 0) continue;

                    totalAll += pts;

                    const atStr = (w > 0 ? r?.withdrawn_at : null) ?? r?.tournaments?.start_at ?? null;
                    if (!atStr) continue;

                    const at = new Date(atStr);
                    if (Number.isNaN(at.getTime())) continue;

                    const reason =
                        String(r?.penalty_reason ?? "").trim() ||
                        (w > 0 ? "Retragere târzie" : n > 0 ? "Neprezentare" : "Penalizare");

                    events.push({ at, pts, reason });
                    details.push({ at, pts, reason });
                }

                events.sort((a, b) => a.at.getTime() - b.at.getTime());

                const BAN_THRESHOLD = 6; // pragul de puncte
                const BAN_DAYS = 90; // ~3 luni

                let curPts = 0;
                let banUntil: Date | null = null;

                for (const ev of events) {
                    // dacă există ban și a expirat înainte de evenimentul curent -> resetăm ciclul
                    if (banUntil && ev.at.getTime() > banUntil.getTime()) {
                        curPts = 0;
                        banUntil = null;
                    }

                    curPts += ev.pts;

                    // când depășim pragul -> setăm banul de la acest eveniment
                    if (curPts >= BAN_THRESHOLD) {
                        banUntil = new Date(ev.at.getTime() + BAN_DAYS * 24 * 60 * 60 * 1000);
                    }
                }

                // dacă banul a expirat deja acum -> resetăm și afișăm 0
                const now = new Date();
                if (banUntil && now.getTime() > banUntil.getTime()) {
                    curPts = 0;
                    banUntil = null;
                }

                setPenaltyAllTime(totalAll);
                setPenaltyPoints(curPts);
                setBannedUntil(banUntil);

                // pentru afișare: cele mai recente evenimente primele
                details.sort((a, b) => b.at.getTime() - a.at.getTime());
                setPenaltyDetails(details);
            } catch (e: any) {
                setPenaltyErr(e?.message ?? "Eroare la calcul penalizări.");
                setPenaltyAllTime(0);
                setPenaltyPoints(0);
                setBannedUntil(null);
                setPenaltyDetails([]);
            }
        })();
    }, [playerIdForRegs]);



    const name =
        (player?.display_name ?? "").trim() ||
        [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() ||
        (player?.full_name ?? "").trim() ||
        "—";

    const playerCat = useMemo(() => prettyPlayerCat(playerCategoryFromMp(player?.mp_max ?? player?.mp)), [player?.mp_max, player?.mp]);

    const palmares = useMemo(() => {
        const total = { gold: 0, silver: 0, bronze: 0 };
        const byCat: Record<string, { gold: 0; silver: 0; bronze: 0; participari: number }> = {};

        for (const r of myRegs) {
            if ((r.tournaments as any)?.is_rated === false) continue;
            const cat = prettyCat(normalizeCat(r.tournaments?.category));
            if (!byCat[cat]) byCat[cat] = { gold: 0, silver: 0, bronze: 0, participari: 0 };
            byCat[cat].participari += 1;

            const place = parseFinalPlace(r.final_place);
            const medal = medalForPlaceNum(place);
            if (!medal) continue;

            total[medal] += 1;
            byCat[cat][medal] += 1;
        }

        const cats = Object.entries(byCat)
            .map(([cat, v]) => ({ cat, ...v }))
            .sort((a, b) => {
                const am = a.gold * 100 + a.silver * 10 + a.bronze;
                const bm = b.gold * 100 + b.silver * 10 + b.bronze;
                if (bm !== am) return bm - am;
                return b.participari - a.participari;
            });

        return { total, cats, participariTotal: myRegs.length };
    }, [myRegs]);

    const last4MpTurnee = useMemo(() => {
        const regsSorted = [...myRegs].sort((a, b) => {
            const ta = a.tournaments?.start_at ? new Date(a.tournaments.start_at).getTime() : 0;
            const tb = b.tournaments?.start_at ? new Date(b.tournaments.start_at).getTime() : 0;
            return tb - ta;
        });

        // ✅ Folosim la medie DOAR turneele non-ZV (is_zv=false) cu mp_turneu numeric.
        const usedVals: number[] = [];
        let zvSkipped = 0;

        for (const r of regsSorted) {
            const isZv = Boolean((r as any)?.is_zv);
            const isRated = (r.tournaments as any)?.is_rated !== false;
            if (!isRated) {
                continue;
            }
            if (isZv) {
                zvSkipped += 1;
                continue;
            }
            const v = Number((r as any)?.mp_turneu);
            if (!Number.isFinite(v)) continue;
            usedVals.push(v);
            if (usedVals.length >= 4) break;
        }

        const avg = usedVals.length ? usedVals.reduce((s, v) => s + v, 0) / usedVals.length : 0;

        return { vals: usedVals, avg, count: usedVals.length, zvSkipped };
    }, [myRegs]);


    function placeTextAndMedal(r: MyRegRow) {
        const n = parseFinalPlace(r.final_place);
        if (!n) return { text: "—", medal: null as null | string };
        const medalKind = medalForPlaceNum(n);
        const medal = medalKind ? medalEmoji(medalKind) : null;
        return { text: `Locul ${n}`, medal };
    }

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
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
                    <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap", }}>
                        <div style={{ flex: "1 1 520px" }}>
                            <div style={{ display: "grid", gap: 10 }}>
                                <Row label="Nume" value={name} />
                                <Row label="Email (Auth)" value={authEmail ?? "—"} />
                                <Row label="ID unic" value={playerIdForRegs ?? "—"} />
                                <Row label="Admin" value={player.is_admin ? "DA" : "NU"} />
                                <Row label="MP Actual" value={player.mp ?? 0} />
                                <Row label="MP Max" value={player.mp_max ?? (player.mp ?? 0)} />
                                <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 10 }}>
                                    <div style={{ opacity: 0.7 }}>MP circuit Amatur</div>

                                    {!editAmatur ? (
                                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                            <b>{player.amatur_mp ?? 0}</b>
                                            <button
                                                onClick={() => {
                                                    setEditAmatur(true);
                                                    setAmaturValue(player.amatur_mp ?? 0);
                                                    setAmaturMsg(null);
                                                }}
                                                style={{
                                                    border: "1px solid #444",
                                                    borderRadius: 8,
                                                    padding: "4px 8px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Editează
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <input
                                                type="number"
                                                min={0}
                                                value={amaturValue}
                                                onChange={(e) => setAmaturValue(Number(e.target.value))}
                                                style={{
                                                    width: 80,
                                                    padding: "6px 8px",
                                                    borderRadius: 8,
                                                    border: "1px solid #444",
                                                    background: "transparent",
                                                    color: "inherit",
                                                }}
                                            />

                                            <button
                                                disabled={savingAmatur}
                                                onClick={async () => {
                                                    setSavingAmatur(true);
                                                    setAmaturMsg(null);

                                                    const val = Number(amaturValue);
                                                    if (!Number.isFinite(val) || val < 0) {
                                                        setAmaturMsg("Valoare invalidă.");
                                                        setSavingAmatur(false);
                                                        return;
                                                    }

                                                    const { error } = await supabase
                                                        .from("players")
                                                        .update({ amatur_mp: val })
                                                        .eq("id", player.id);

                                                    if (error) {
                                                        setAmaturMsg("Eroare la salvare.");
                                                    } else {
                                                        setPlayer((prev) =>
                                                            prev ? { ...prev, amatur_mp: val } : prev
                                                        );
                                                        setAmaturMsg("Salvat ✔");
                                                        setEditAmatur(false);
                                                    }

                                                    setSavingAmatur(false);
                                                }}
                                                style={{
                                                    border: "1px solid #444",
                                                    borderRadius: 8,
                                                    padding: "6px 10px",
                                                    cursor: savingAmatur ? "not-allowed" : "pointer",
                                                    opacity: savingAmatur ? 0.6 : 1,
                                                }}
                                            >
                                                Salvează
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setEditAmatur(false);
                                                    setAmaturValue(player.amatur_mp ?? 0);
                                                    setAmaturMsg(null);
                                                }}
                                                style={{
                                                    border: "none",
                                                    background: "transparent",
                                                    cursor: "pointer",
                                                    opacity: 0.6,
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <Row
                                    label="Puncte penalizare"
                                    value={
                                        <span style={{ color: penaltyPoints > 0 ? "red" : "inherit", fontWeight: 900 }}>
                                            {penaltyPoints}
                                        </span>
                                    }
                                />
                                <Row
                                    label="Ban"
                                    value={
                                        bannedUntil ? (
                                            <span style={{ color: "red", fontWeight: 900 }}>
                                                Banat până la {bannedUntil.toLocaleDateString("ro-RO")}
                                            </span>
                                        ) : (
                                            "Nu ești banat"
                                        )
                                    }
                                />
                                <Row
                                    label="Penalizări totale (info)"
                                    value={
                                        <div style={{ display: "grid", gap: 6 }}>
                                            {penaltyDetails.length === 0 ? (
                                                <span style={{ opacity: 0.8 }}>Nu ai penalizări.</span>
                                            ) : (
                                                <>
                                                    {penaltyDetails.slice(0, 6).map((p, i) => (
                                                        <div key={i} style={{ opacity: 0.95, fontWeight: 650 }}>
                                                            • {p.reason} (+{p.pts}) — {p.at.toLocaleDateString("ro-RO")}
                                                        </div>
                                                    ))}
                                                    {penaltyDetails.length > 6 ? (
                                                        <div style={{ opacity: 0.75, fontSize: 12 }}>
                                                            …și încă {penaltyDetails.length - 6} evenimente
                                                        </div>
                                                    ) : null}
                                                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                                                        Total all-time: <b>{penaltyAllTime}</b> puncte
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    }
                                />

                                {penaltyErr ? (
                                    <div style={{ marginLeft: 200, fontSize: 13, color: "red", opacity: 0.9 }}>
                                        {penaltyErr}
                                    </div>
                                ) : null}




                                {amaturMsg && (
                                    <div style={{ marginLeft: 200, fontSize: 13, opacity: 0.85 }}>
                                        {amaturMsg}
                                    </div>
                                )}
                                <Row label="Categoria jucătorului" value={playerCat} />
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Doar ultimele 4 MP Turneu sunt folosite la medie (excluse ZV)</div>

                                    {regsLoading ? (
                                        <div style={{ opacity: 0.85 }}>Se calculează…</div>
                                    ) : last4MpTurnee.vals.length === 0 ? (
                                        <div style={{ opacity: 0.85 }}>Încă nu ai MP Turneu salvate (sau ai doar turnee ZV).</div>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                            {last4MpTurnee.vals.map((v, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        border: "1px solid #444",
                                                        borderRadius: 999,
                                                        padding: "8px 10px",
                                                        fontWeight: 900,
                                                    }}
                                                    title="MP Turneu (salvat la finalizarea turneului)"
                                                >
                                                    {v}
                                                </div>
                                            ))}

                                            <div style={{ marginLeft: "auto", opacity: 0.85, textAlign: "right" }}>
                                                <div>
                                                    Medie: <b>{Math.round(last4MpTurnee.avg)}</b>
                                                </div>
                                                {last4MpTurnee.zvSkipped > 0 ? (
                                                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                                                        ZV ignorate: <b>{last4MpTurnee.zvSkipped}</b>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>

                        <div style={{ flex: "0 1 360px", minWidth: 320 }}>
                            <div style={smallCard}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                    <div style={{ fontWeight: 900, fontSize: 16 }}>Palmares</div>
                                    <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12 }}>
                                        Turnee: <b>{palmares.participariTotal}</b>
                                    </div>
                                </div>

                                {regsLoading ? (
                                    <div style={{ marginTop: 10, opacity: 0.85 }}>Se calculează…</div>
                                ) : (
                                    <>
                                        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                            <Badge label="🥇" value={palmares.total.gold} />
                                            <Badge label="🥈" value={palmares.total.silver} />
                                            <Badge label="🥉" value={palmares.total.bronze} />
                                        </div>

                                        {palmares.cats.length > 0 ? (
                                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                                {palmares.cats.map((c) => (
                                                    <div
                                                        key={c.cat}
                                                        style={{
                                                            border: "1px solid #2e2e2e",
                                                            borderRadius: 12,
                                                            padding: "10px 10px",
                                                            background: "rgba(255,255,255,0.02)",
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                                            <div style={{ fontWeight: 900 }}>{c.cat}</div>
                                                            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
                                                                Turnee: <b>{c.participari}</b>
                                                            </div>
                                                        </div>
                                                        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                            <Mini label="🥇" value={c.gold} />
                                                            <Mini label="🥈" value={c.silver} />
                                                            <Mini label="🥉" value={c.bronze} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: 12, opacity: 0.85 }}>Nu există încă turnee în istoric.</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
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
                            const { text: placeText, medal } = placeTextAndMedal(r);
                            const cat = prettyCat(normalizeCat(t?.category));

                            return (
                                <div
                                    key={`${r.tournament_id}-${idx}`}
                                    style={{
                                        border: "1px solid #333",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "rgba(255,255,255,0)",
                                    }}
                                >
                                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                        <div style={{ fontWeight: 800 }}>{t?.title ?? "Turneu"}</div>
                                        <div style={{ opacity: 0.75 }}>{t?.start_at ? formatRO(t.start_at) : ""}</div>

                                        <div style={{ marginLeft: "auto", opacity: 0.95 }}>
                                            Loc obținut: <b>{placeText}</b>
                                            {medal ? <span style={{ marginLeft: 6 }}>{medal}</span> : null}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                                        {t?.location ? `Locație: ${t.location} · ` : ""}
                                        {t?.format ? `Format: ${t.format} · ` : ""}
                                        {t?.status ? `Status turneu: ${t.status} · ` : ""}
                                        {`Categorie: ${cat}`}{" · "}{`Tip: ${(t as any)?.is_rated === false ? "Agrement" : "Punctat"}`}
                                    </div>

                                    <div style={{ marginTop: 10 }}>
                                        <Link href={`/tournaments/${r.tournament_id}`} style={{ textDecoration: "underline" }}>
                                            Vezi detalii turneu
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}