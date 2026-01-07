"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type TournamentFormat = "LOWER_UPPER_KO" | "GROUPS_KO";

// Categoria jucătorului (din MP Max)
type PlayerCat = "HOBBY" | "ADVANCED" | "ELITE";
function playerCategoryFromMpMax(mpMax: number): PlayerCat {
    if (mpMax < 20) return "HOBBY";
    if (mpMax < 40) return "ADVANCED";
    return "ELITE";
}
function catShort(c: PlayerCat) {
    // H = Hobby, A = Avansați, E = Elite
    if (c === "HOBBY") return "H";
    if (c === "ADVANCED") return "A";
    return "E";
}

type RegistrationRow = {
    player_id: string;
    status: string;
    players:
    | {
        full_name: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        mp: number | string | null;
        mp_max: number | string | null;
    }
    | null;
};

type GroupWithMembers = {
    id: string;
    name: string;
    stage: "LOWER_GROUP" | "UPPER_GROUP";
    members: {
        player_id: string;
        full_name: string;
        wins: number;
        losses: number;
        points_for: number;
        points_against: number;
        rank_in_group: number | null;
    }[];
};

type MatchRow = {
    id: string;
    stage: "LOWER_GROUP" | "UPPER_GROUP" | "KO";
    round: number | null;
    group_id: string | null;
    player1_id: string | null;
    player2_id: string | null;
    score: string | null;
    winner_id: string | null;
    p1?: { full_name: string } | null;
    p2?: { full_name: string } | null;
};

type Stat = { wins: number; losses: number; pf: number; pa: number };

function parseScore(score: string | null): { a: number; b: number } | null {
    if (!score) return null;
    const m = score.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return null;
    return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
}

function rankWithMiniTable(
    members: { player_id: string; full_name: string }[],
    overall: Record<string, Stat>,
    matches: { p1: string; p2: string; a: number; b: number }[]
) {
    const sorted = [...members].sort((x, y) => (overall[y.player_id]?.wins ?? 0) - (overall[x.player_id]?.wins ?? 0));

    const out: { player_id: string; full_name: string }[] = [];
    let i = 0;

    while (i < sorted.length) {
        const w = overall[sorted[i].player_id]?.wins ?? 0;
        const tie: { player_id: string; full_name: string }[] = [];
        while (i < sorted.length && (overall[sorted[i].player_id]?.wins ?? 0) === w) {
            tie.push(sorted[i]);
            i++;
        }

        if (tie.length === 1) {
            out.push(tie[0]);
            continue;
        }

        const ids = new Set(tie.map((t) => t.player_id));
        const mini: Record<string, Stat> = {};
        for (const t of tie) mini[t.player_id] = { wins: 0, losses: 0, pf: 0, pa: 0 };

        for (const m of matches) {
            if (!ids.has(m.p1) || !ids.has(m.p2)) continue;

            mini[m.p1].pf += m.a;
            mini[m.p1].pa += m.b;
            mini[m.p2].pf += m.b;
            mini[m.p2].pa += m.a;

            if (m.a > m.b) {
                mini[m.p1].wins += 1;
                mini[m.p2].losses += 1;
            } else if (m.b > m.a) {
                mini[m.p2].wins += 1;
                mini[m.p1].losses += 1;
            }
        }

        const tieSorted = [...tie].sort((x, y) => {
            const mx = mini[x.player_id];
            const my = mini[y.player_id];

            if (my.wins !== mx.wins) return my.wins - mx.wins;

            const dxm = mx.pf - mx.pa;
            const dym = my.pf - my.pa;
            if (dym !== dxm) return dym - dxm;

            if (my.pf !== mx.pf) return my.pf - mx.pf;

            const ox = overall[x.player_id];
            const oy = overall[y.player_id];
            const dxo = (ox?.pf ?? 0) - (ox?.pa ?? 0);
            const dyo = (oy?.pf ?? 0) - (oy?.pa ?? 0);
            if (dyo !== dxo) return dyo - dxo;

            if ((oy?.pf ?? 0) !== (ox?.pf ?? 0)) return (oy?.pf ?? 0) - (ox?.pf ?? 0);

            return x.full_name.localeCompare(y.full_name);
        });

        out.push(...tieSorted);
    }

    return out;
}

function nextPow2(n: number) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

function roundLabel(r: number, size: number) {
    const rounds = Math.log2(size);
    const remaining = rounds - r + 1;
    if (remaining === 1) return "Finală";
    if (remaining === 2) return "Semifinale";
    if (remaining === 3) return "Sferturi";
    return `Runda ${r}`;
}

function getPodiumTop4(matchesKO: MatchRow[]) {
    if (!matchesKO || matchesKO.length === 0) return null;

    const rounds = matchesKO.map((m) => m.round ?? 1);
    const maxR = Math.max(...rounds);

    const finalMatches = matchesKO.filter((m) => (m.round ?? 1) === maxR);
    if (finalMatches.length !== 1) return null;

    const finalM = finalMatches[0];
    if (!finalM.winner_id) return null;

    const place1Id = finalM.winner_id;
    const place2Id = finalM.winner_id === finalM.player1_id ? finalM.player2_id : finalM.player1_id;

    const semiRound = maxR - 1;
    const semis = matchesKO.filter((m) => (m.round ?? 1) === semiRound);

    const thirdPlaceIds: string[] = [];
    for (const sm of semis) {
        if (!sm.player1_id || !sm.player2_id) continue;
        if (!sm.winner_id) continue;
        const loser = sm.winner_id === sm.player1_id ? sm.player2_id : sm.player1_id;
        if (loser) thirdPlaceIds.push(loser);
    }

    const uniqueThird = Array.from(new Set(thirdPlaceIds)).slice(0, 2);

    const nameById = (id: string | null) => {
        if (!id) return null;
        const found = matchesKO.find((m) => m.player1_id === id || m.player2_id === id);
        if (!found) return id;
        if (found.player1_id === id) return found.p1?.full_name ?? id;
        return found.p2?.full_name ?? id;
    };

    return {
        place1: { id: place1Id, name: nameById(place1Id) ?? "Locul 1" },
        place2: { id: place2Id ?? "", name: nameById(place2Id ?? null) ?? "Locul 2" },
        place3a: uniqueThird[0] ? { id: uniqueThird[0], name: nameById(uniqueThird[0]) ?? "Locul 3" } : null,
        place3b: uniqueThird[1] ? { id: uniqueThird[1], name: nameById(uniqueThird[1]) ?? "Locul 3" } : null,
    };
}

function buildKORunMap(matchesKO: MatchRow[]) {
    if (!matchesKO || matchesKO.length === 0) {
        return { roundReached: new Map<string, number>(), championId: null as string | null };
    }

    const rounds = matchesKO.map((m) => m.round ?? 1);
    const maxR = Math.max(...rounds);
    const finalM = matchesKO.find((m) => (m.round ?? 1) === maxR);
    const championId = finalM?.winner_id ?? null;

    const roundReached = new Map<string, number>();
    for (const m of matchesKO) {
        const r = m.round ?? 1;
        const ids = [m.player1_id, m.player2_id].filter(Boolean) as string[];
        for (const id of ids) {
            const prev = roundReached.get(id) ?? 0;
            if (r > prev) roundReached.set(id, r);
        }
    }

    return { roundReached, championId };
}

function normalizeNum(x: unknown, fallback: number) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

export default function PublicTournamentReadOnlyPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;

    const [loading, setLoading] = useState(true);

    const [title, setTitle] = useState("");
    const [format, setFormat] = useState<TournamentFormat>("LOWER_UPPER_KO");

    const [rows, setRows] = useState<RegistrationRow[]>([]);

    const [groupsLower, setGroupsLower] = useState<GroupWithMembers[]>([]);
    const [groupsUpper, setGroupsUpper] = useState<GroupWithMembers[]>([]);

    const [matchesLower, setMatchesLower] = useState<MatchRow[]>([]);
    const [matchesUpper, setMatchesUpper] = useState<MatchRow[]>([]);
    const [matchesKO, setMatchesKO] = useState<MatchRow[]>([]);

    const registered = useMemo(() => rows.filter((r) => r.status === "REGISTERED"), [rows]);

    const participants = useMemo(() => {
        const list = registered
            .map((r) => {
                const p = r.players;

                const name =
                    (p?.display_name ?? "").trim() ||
                    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
                    ((p?.full_name ?? "").includes("@") ? "" : (p?.full_name ?? "").trim()) ||
                    p?.full_name ||
                    "—";

                const mp = normalizeNum(p?.mp, 2);
                const mpMax = normalizeNum(p?.mp_max, mp);

                return { id: r.player_id, name, mp, mpMax, category: playerCategoryFromMpMax(mpMax) };
            })
            .sort((a, b) => {
                if (b.mp !== a.mp) return b.mp - a.mp; // MP desc
                return a.name.localeCompare(b.name); // egalitate: alfabetic
            });

        return list;
    }, [registered]);

    async function loadGroups(stage: "LOWER_GROUP" | "UPPER_GROUP") {
        const { data: gs, error: gErr } = await supabase
            .from("groups")
            .select("id,name,stage")
            .eq("tournament_id", tournamentId)
            .eq("stage", stage)
            .order("name", { ascending: true });

        if (gErr) return [];

        const filled: GroupWithMembers[] = [];
        for (const g of (gs as any[]) ?? []) {
            const { data: mem, error: mErr } = await supabase
                .from("group_members")
                .select(
                    `
          player_id,wins,losses,points_for,points_against,rank_in_group,
          players:player_id(full_name)
        `
                )
                .eq("group_id", g.id);

            if (mErr) continue;

            const members =
                (mem ?? []).map((m: any) => ({
                    player_id: m.player_id,
                    full_name: m.players?.full_name ?? m.player_id,
                    wins: m.wins ?? 0,
                    losses: m.losses ?? 0,
                    points_for: m.points_for ?? 0,
                    points_against: m.points_against ?? 0,
                    rank_in_group: m.rank_in_group ?? null,
                })) ?? [];

            members.sort((a, b) => (a.rank_in_group ?? 999) - (b.rank_in_group ?? 999));

            filled.push({ id: g.id, name: g.name, stage: g.stage, members });
        }
        return filled;
    }

    async function loadMatches(stage: "LOWER_GROUP" | "UPPER_GROUP" | "KO") {
        const { data: mm, error } = await supabase
            .from("matches")
            .select(
                `
        id,stage,round,group_id,player1_id,player2_id,score,winner_id,
        p1:player1_id(full_name),
        p2:player2_id(full_name)
      `
            )
            .eq("tournament_id", tournamentId)
            .eq("stage", stage)
            .order("round", { ascending: true })
            .order("created_at", { ascending: true });

        if (error) return [];
        return (mm as any) ?? [];
    }

    async function load() {
        setLoading(true);

        const { data: t, error: tErr } = await supabase
            .from("tournaments")
            .select("title,format")
            .eq("id", tournamentId)
            .single();

        if (tErr || !t) {
            setTitle("");
            setLoading(false);
            return;
        }

        setTitle(t.title ?? "");
        setFormat((t.format as TournamentFormat) ?? "LOWER_UPPER_KO");

        const { data: regs } = await supabase
            .from("registrations")
            .select(
                `
        player_id,status,
        players:player_id(full_name,display_name,first_name,last_name,mp,mp_max)
      `
            )
            .eq("tournament_id", tournamentId)
            .order("registered_at", { ascending: true });

        setRows((regs as any) ?? []);

        const gl = await loadGroups("LOWER_GROUP");
        const gu = await loadGroups("UPPER_GROUP");
        setGroupsLower(gl);
        setGroupsUpper(gu);

        const ml = await loadMatches("LOWER_GROUP");
        const mu = await loadMatches("UPPER_GROUP");
        const mk = await loadMatches("KO");
        setMatchesLower(ml);
        setMatchesUpper(mu);
        setMatchesKO(mk);

        setLoading(false);
    }

    const lowerHasStandings = groupsLower.some((g) => g.members.some((m) => m.rank_in_group != null));
    const upperHasStandings = groupsUpper.some((g) => g.members.some((m) => m.rank_in_group != null));

    const matchesKOByRound = useMemo(() => {
        const map: Record<number, MatchRow[]> = {};
        for (const m of matchesKO) {
            const r = m.round ?? 1;
            if (!map[r]) map[r] = [];
            map[r].push(m);
        }
        const rounds = Object.keys(map)
            .map((x) => parseInt(x, 10))
            .sort((a, b) => a - b);
        return { map, rounds };
    }, [matchesKO]);

    const podium = useMemo(() => getPodiumTop4(matchesKO), [matchesKO]);

    const overallRanking = useMemo(() => {
        const base = participants.map((p) => ({
            id: p.id,
            name: p.name,
            mpReg: p.mp,
            cat: p.category,
            winsLower: 0,
            winsUpper: 0,
            koRound: 0,
            groupStage: "" as "UPPER_GROUP" | "LOWER_GROUP" | "",
            groupName: "",
            groupRank: null as number | null,
            finalPlace: null as 1 | 2 | 3 | null,
            mpTournament: null as number | null,
            mpBonus: 0 as number,
        }));

        const idToRow = new Map(base.map((x) => [x.id, x]));

        if (podium?.place1?.id) idToRow.get(podium.place1.id)?.finalPlace = 1;
        if (podium?.place2?.id) idToRow.get(podium.place2.id)?.finalPlace = 2;
        if (podium?.place3a?.id) idToRow.get(podium.place3a.id)?.finalPlace = 3;
        if (podium?.place3b?.id) idToRow.get(podium.place3b.id)?.finalPlace = 3;

        const { roundReached } = buildKORunMap(matchesKO);
        for (const [id, rr] of roundReached.entries()) {
            const row = idToRow.get(id);
            if (row) row.koRound = rr;
        }

        const upperByPlayer = new Map<string, { groupName: string; rank: number | null; wins: number }>();
        for (const g of groupsUpper) {
            for (const m of g.members)
                upperByPlayer.set(m.player_id, { groupName: g.name, rank: m.rank_in_group ?? null, wins: m.wins ?? 0 });
        }

        const lowerByPlayer = new Map<string, { groupName: string; rank: number | null; wins: number }>();
        for (const g of groupsLower) {
            for (const m of g.members)
                lowerByPlayer.set(m.player_id, { groupName: g.name, rank: m.rank_in_group ?? null, wins: m.wins ?? 0 });
        }

        for (const row of base) {
            const up = upperByPlayer.get(row.id);
            const lo = lowerByPlayer.get(row.id);

            row.winsUpper = up?.wins ?? 0;
            row.winsLower = lo?.wins ?? 0;

            if (up) {
                row.groupStage = "UPPER_GROUP";
                row.groupName = up.groupName;
                row.groupRank = up.rank;
            } else if (lo) {
                row.groupStage = "LOWER_GROUP";
                row.groupName = lo.groupName;
                row.groupRank = lo.rank;
            }
        }

        const sorted = [...base].sort((a, b) => {
            if (a.finalPlace && b.finalPlace) return a.finalPlace - b.finalPlace;
            if (a.finalPlace && !b.finalPlace) return -1;
            if (!a.finalPlace && b.finalPlace) return 1;

            if (b.koRound !== a.koRound) return b.koRound - a.koRound;

            const ar = a.groupRank ?? 999;
            const br = b.groupRank ?? 999;
            if (ar !== br) return ar - br;

            if (b.mpReg !== a.mpReg) return b.mpReg - a.mpReg;

            return a.name.localeCompare(b.name);
        });

        const regSorted = [...participants].sort((a, b) => {
            if (b.mp !== a.mp) return b.mp - a.mp;
            return a.name.localeCompare(b.name);
        });

        const regMeans: number[] = [];
        for (let i = 0; i < regSorted.length; i += 4) {
            const blk = regSorted.slice(i, i + 4);
            const mean = blk.length ? blk.reduce((acc, p) => acc + (Number.isFinite(p.mp) ? p.mp : 0), 0) / blk.length : 0;
            regMeans.push(mean);
        }

        const hasKO = matchesKO.length > 0;

        for (let i = 0; i < sorted.length; i += 4) {
            const block = sorted.slice(i, i + 4);
            const blockIndex = Math.floor(i / 4);

            const mpSector = regMeans[blockIndex] ?? (regMeans.length ? regMeans[regMeans.length - 1] : 0);

            for (let j = 0; j < block.length; j++) {
                const pos = i + j + 1;

                const bonus = pos === 1 ? 6 : pos === 2 ? 4 : pos === 3 ? 2 : hasKO && pos === 4 ? 2 : 0;

                const mpTournament = mpSector + bonus;

                block[j].mpTournament = mpTournament;
                block[j].mpBonus = bonus;
            }
        }

        return sorted;
    }, [participants, matchesKO, podium, groupsUpper, groupsLower]);

    const isGroupsKo = format === "GROUPS_KO";

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournamentId]);

    if (loading) return <main style={{ padding: 24 }}>Se încarcă...</main>;

    if (!title) {
        return (
            <main style={{ maxWidth: 1150, margin: "0 auto", padding: 24 }}>
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Link href="/tournaments">← Înapoi la istoric</Link>
                </header>
                <div style={{ marginTop: 14, opacity: 0.85 }}>Turneul nu a fost găsit sau nu este disponibil public.</div>
            </main>
        );
    }

    const sizeForLabel = nextPow2((matchesKO.filter((m) => (m.round ?? 1) === 1).length || 1) * 2);
    const maxKORound = matchesKOByRound.rounds.length ? Math.max(...matchesKOByRound.rounds) : 1;

    return (
        <main style={{ maxWidth: 1150, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800 }}>{title || "Turneu"}</h1>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                        Format: {format === "LOWER_UPPER_KO" ? "Inferioare → Superioare → KO" : "Grupe → KO direct"} • Grupe:{" "}
                        {groupsLower.length} • Superioare: {groupsUpper.length} • KO: {matchesKO.length} meciuri
                    </div>
                </div>
                <Link href="/tournaments">← Înapoi la istoric</Link>
            </header>

            {/* CLASAMENT TOTAL */}
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Clasament total (toți înscrișii)</h2>

                {overallRanking.length === 0 ? (
                    <div style={{ marginTop: 10, opacity: 0.8 }}>Nu există participanți.</div>
                ) : (
                    <div style={{ overflowX: "auto", marginTop: 10 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                            <thead>
                                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                                    <th style={{ padding: "8px 6px", width: 60 }}>Loc</th>
                                    <th style={{ padding: "8px 6px", width: 200 }}>Jucător</th>
                                    <th style={{ padding: "8px 6px", width: 60 }}>KO</th>
                                    <th style={{ padding: "8px 6px", width: 120 }}>Categorie</th>
                                    <th style={{ padding: "8px 6px", width: 120, textAlign: "center" }}>Victorii gr. inf.</th>
                                    <th style={{ padding: "8px 6px", width: 120, textAlign: "center" }}>Victorii gr. sup.</th>
                                    <th style={{ padding: "8px 6px", width: 140, textAlign: "right" }}>MP Turneu (bonus inclus)</th>
                                </tr>
                            </thead>

                            <tbody>
                                {overallRanking.map((p, idx) => {
                                    const placeLabel = p.finalPlace === 1 ? "🥇" : p.finalPlace === 2 ? "🥈" : p.finalPlace === 3 ? "🥉" : "";

                                    const koLabel =
                                        p.finalPlace === 1
                                            ? "Campion"
                                            : p.finalPlace === 2
                                                ? "Finalist"
                                                : p.finalPlace === 3
                                                    ? "Semifinale"
                                                    : p.koRound
                                                        ? `Runda ${p.koRound}`
                                                        : "—";

                                    const totalWins = (p.winsLower ?? 0) + (p.winsUpper ?? 0);

                                    return (
                                        <tr key={p.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                                            <td style={{ padding: "8px 6px" }}>
                                                <b>{idx + 1}</b> {placeLabel}
                                            </td>

                                            <td style={{ padding: "8px 6px", fontWeight: 900 }}>{p.name}</td>

                                            <td style={{ padding: "8px 6px" }}>{koLabel}</td>

                                            <td style={{ padding: "8px 6px" }}>
                                                {catShort(p.cat)}, MP:{Number.isFinite(p.mpReg) ? Math.round(p.mpReg * 100) / 100 : "—"}
                                            </td>

                                            <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.winsLower ?? 0}</td>
                                            <td style={{ padding: "8px 6px", textAlign: "center" }}>{p.winsUpper ?? 0}</td>

                                            <td style={{ padding: "8px 6px", textAlign: "right" }}>
                                                {totalWins === 0 ? (
                                                    <span style={{ fontSize: 12, fontWeight: 900, opacity: 100 }}>ZV</span>
                                                ) : p.mpTournament == null ? (
                                                    "—"
                                                ) : (
                                                    <span>
                                                        {(Math.round(p.mpTournament * 100) / 100).toString()}
                                                        {p.mpBonus > 0 ? <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.9 }}>(+{p.mpBonus})</span> : null}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                            Notă: ZV = zero victorii în turneu. Sortare: Podium → runda KO → rank/grupe → MP (la înscriere) → alfabetic.
                        </div>
                    </div>
                )}
            </section>

            {/* GRUPE (LOWER_GROUP) */}
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>{isGroupsKo ? "Grupe" : "Grupe inferioare"}</h2>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {groupsLower.length === 0 ? (
                        <div style={{ opacity: 0.8 }}>{isGroupsKo ? "Nu există grupe încă." : "Nu există grupe inferioare încă."}</div>
                    ) : (
                        groupsLower.map((g) => {
                            const groupMatches = matchesLower
                                .filter((m) => m.group_id === g.id)
                                .sort((a, b) => (a.round ?? 1) - (b.round ?? 1));

                            const maxRound = groupMatches.reduce((acc, m) => Math.max(acc, m.round ?? 1), 1);

                            return (
                                <div key={g.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                        <div style={{ fontWeight: 900, fontSize: 15 }}>{g.name}</div>
                                        {lowerHasStandings ? (
                                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                                                Calificați: <b>Top 4</b> · Runde: <b>{maxRound}</b>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 12, opacity: 0.75 }}>Runde: <b>{maxRound}</b></div>
                                        )}
                                    </div>

                                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>#</th>
                                                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Jucător</th>
                                                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>W</th>
                                                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>L</th>
                                                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>Seturi</th>
                                                <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>Dif</th>
                                                <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>"Top 4"</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...g.members]
                                                .sort((a, b) => (a.rank_in_group ?? 999) - (b.rank_in_group ?? 999))
                                                .map((m) => {
                                                    const dif = (m.points_for ?? 0) - (m.points_against ?? 0);
                                                    const q = (m.rank_in_group ?? 999) <= 4;
                                                    return (
                                                        <tr key={m.player_id}>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3" }}>{m.rank_in_group ?? "—"}</td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", fontWeight: 800 }}>{m.full_name}</td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{m.wins}</td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{m.losses}</td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>
                                                                {m.points_for}-{m.points_against}
                                                            </td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{dif}</td>
                                                            <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3" }}>{q ? "✅" : ""}</td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>

                                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                                        Tie-break: Victorii → Mini-clasament meciuri directe (2+) → Setaveraj overall → Seturi overall
                                    </div>

                                    {/* Meciuri - în interiorul grupei (4 pe rând) */}
                                    {groupMatches.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <div style={{ fontWeight: 900, marginBottom: 8 }}>Meciuri (ordine pe runde)</div>

                                            {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                                                const roundMatches = groupMatches.filter((m) => (m.round ?? 1) === r);
                                                return (
                                                    <div key={r} style={{ marginTop: 10 }}>
                                                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Runda {r}</div>
                                                        <div
                                                            style={{
                                                                display: "grid",
                                                                gap: 8,
                                                                marginTop: 6,
                                                                gridTemplateColumns: "repeat(4, minmax(240px, 1fr))",
                                                            }}
                                                        >
                                                            {roundMatches.map((m) => (
                                                                <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                                                                    <div style={{ fontSize: 14 }}>
                                                                        <b>{m.p1?.full_name ?? "P1"}</b> vs <b>{m.p2?.full_name ?? (m.player2_id ? "P2" : "BYE")}</b>
                                                                        {m.score ? <span style={{ marginLeft: 10, opacity: 0.85 }}>Scor: {m.score}</span> : null}
                                                                        {m.winner_id ? <span style={{ marginLeft: 10, opacity: 0.85 }}>✅</span> : null}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {/* SUPERIOARE (doar pentru LOWER_UPPER_KO) */}
            {!isGroupsKo && (
                <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Grupe superioare</h2>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        {groupsUpper.length === 0 ? (
                            <div style={{ opacity: 0.8 }}>Nu există grupe superioare încă.</div>
                        ) : (
                            groupsUpper.map((g) => {
                                const groupMatches = matchesUpper
                                    .filter((m) => m.group_id === g.id)
                                    .sort((a, b) => (a.round ?? 1) - (b.round ?? 1));
                                const maxRound = groupMatches.reduce((acc, m) => Math.max(acc, m.round ?? 1), 1);

                                return (
                                    <div key={g.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                                        <div style={{ fontWeight: 900 }}>{g.name}</div>
                                        {upperHasStandings && (
                                            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                                                Calificați: <b>Top 2</b>
                                            </div>
                                        )}

                                        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 13 }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>#</th>
                                                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Jucător</th>
                                                    <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>W</th>
                                                    <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>L</th>
                                                    <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>Seturi</th>
                                                    <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 6 }}>Dif</th>
                                                    <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Top 2</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...g.members]
                                                    .sort((a, b) => (a.rank_in_group ?? 999) - (b.rank_in_group ?? 999))
                                                    .map((m) => {
                                                        const dif = (m.points_for ?? 0) - (m.points_against ?? 0);
                                                        const q = (m.rank_in_group ?? 999) <= 2;
                                                        return (
                                                            <tr key={m.player_id}>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3" }}>{m.rank_in_group ?? "—"}</td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3" }}>{m.full_name}</td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{m.wins}</td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{m.losses}</td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>
                                                                    {m.points_for}-{m.points_against}
                                                                </td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3", textAlign: "right" }}>{dif}</td>
                                                                <td style={{ padding: 6, borderBottom: "1px solid #f3f3f3" }}>{q ? "✅" : ""}</td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>

                                        {/* Meciuri superioare (4 pe rând) */}
                                        {groupMatches.length > 0 && (
                                            <div style={{ marginTop: 12 }}>
                                                <div style={{ fontWeight: 900, marginBottom: 8 }}>Meciuri (ordine pe runde)</div>

                                                {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                                                    const roundMatches = groupMatches.filter((m) => (m.round ?? 1) === r);
                                                    return (
                                                        <div key={r} style={{ marginTop: 10 }}>
                                                            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Runda {r}</div>
                                                            <div
                                                                style={{
                                                                    display: "grid",
                                                                    gap: 8,
                                                                    marginTop: 6,
                                                                    gridTemplateColumns: "repeat(4, minmax(240px, 1fr))",
                                                                }}
                                                            >
                                                                {roundMatches.map((m) => (
                                                                    <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                                                                        <div style={{ fontSize: 14 }}>
                                                                            <b>{m.p1?.full_name ?? "P1"}</b> vs <b>{m.p2?.full_name ?? (m.player2_id ? "P2" : "BYE")}</b>
                                                                            {m.score ? <span style={{ marginLeft: 10, opacity: 0.85 }}>Scor: {m.score}</span> : null}
                                                                            {m.winner_id ? <span style={{ marginLeft: 10, opacity: 0.85 }}>✅</span> : null}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>
            )}

            {/* KO (2 pe rând, finala 1 pe rând) */}
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Tablou eliminatoriu (KO)</h2>
                </div>

                {matchesKO.length === 0 ? (
                    <div style={{ marginTop: 10, opacity: 0.8 }}>Nu există KO încă.</div>
                ) : (
                    <div style={{ marginTop: 10 }}>
                        {matchesKOByRound.rounds.map((r) => {
                            const cols = r === maxKORound ? 1 : 2;
                            return (
                                <div key={r} style={{ marginTop: 10 }}>
                                    <div style={{ fontWeight: 900, marginBottom: 8 }}>{roundLabel(r, sizeForLabel)}</div>

                                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(${cols}, minmax(320px, 1fr))` }}>
                                        {matchesKOByRound.map[r].map((m) => (
                                            <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                                                <div style={{ fontSize: 14 }}>
                                                    <b>{m.p1?.full_name ?? "—"}</b> <span style={{ opacity: 0.8 }}>vs</span>{" "}
                                                    <b>{m.p2?.full_name ?? (m.player2_id ? "—" : "BYE")}</b>
                                                    {m.score ? <span style={{ marginLeft: 10, opacity: 0.85 }}>Scor: {m.score}</span> : null}
                                                    {m.winner_id ? <span style={{ marginLeft: 10, opacity: 0.85 }}>✅ Winner set</span> : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>KO este read-only în pagina publică.</div>
                    </div>
                )}
            </section>
        </main>
    );
}
