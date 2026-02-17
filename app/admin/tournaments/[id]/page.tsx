"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";

type TournamentFormat = "LOWER_UPPER_KO" | "GROUPS_KO";

// Categoria jucătorului (din MP Max,)
type PlayerCat = "HOBBY" | "ADVANCED" | "ELITE";
function playerCategoryFromMpMax(mpMax: number): PlayerCat {
    if (mpMax < 20) return "HOBBY";
    if (mpMax < 40) return "ADVANCED";
    return "ELITE";
}
function catLabel(c: PlayerCat) {
    if (c === "HOBBY") return "Hobby";
    if (c === "ADVANCED") return "Avansați";
    return "Elite";
}

function catShort(c: PlayerCat) {
    // H = Hobby, A = Avansați, E = Elite.
    if (c === "HOBBY") return "H";
    if (c === "ADVANCED") return "A";
    return "E";
}



type RegistrationRow = {
    player_id: string;
    status: string;
    withdrawn_at: string | null;
    penalty_applied: number;
    penalty_reason: string | null;
    attended?: boolean | null;
    no_show_penalty?: number | null; // penalizare no-show (AN) // prezență marcată de admin (true/false)
    players:
    | {
        full_name: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        mp: number | string | null;
        mp_max: number | string | null;
        penalty_points: number;
        banned_until: string | null;
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

function chooseGroupCount(N: number, minSize: number, maxSize: number, preferred: number) {
    const candidates: number[] = [];
    for (let G = 1; G <= N; G++) if (minSize * G <= N && N <= maxSize * G) candidates.push(G);
    if (candidates.length === 0) return null;

    let bestG = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const G of candidates) {
        const base = Math.floor(N / G);
        const extra = N % G;
        const score = extra * Math.abs(base + 1 - preferred) + (G - extra) * Math.abs(base - preferred);
        if (score < bestScore) {
            bestScore = score;
            bestG = G;
        }
    }
    return bestG;
}

function buildGroupSizes(N: number, G: number) {
    const base = Math.floor(N / G);
    const extra = N % G;
    const sizes: number[] = [];
    for (let i = 0; i < G; i++) sizes.push(i < extra ? base + 1 : base);
    return sizes;
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

function getChampion(matches: MatchRow[]) {
    const rounds = matches.map((x) => x.round ?? 1);
    if (rounds.length === 0) return null;
    const maxR = Math.max(...rounds);
    const last = matches.filter((m) => (m.round ?? 1) === maxR);
    if (last.length !== 1) return null;
    const finalMatch = last[0];
    if (!finalMatch.winner_id) return null;
    const champName = finalMatch.winner_id === finalMatch.player1_id ? finalMatch.p1?.full_name : finalMatch.p2?.full_name;
    return champName ?? "Campion";
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
    const place2Id =
        finalM.winner_id === finalM.player1_id ? finalM.player2_id : finalM.player1_id;

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
        place3a: uniqueThird[0]
            ? { id: uniqueThird[0], name: nameById(uniqueThird[0]) ?? "Locul 3" }
            : null,
        place3b: uniqueThird[1]
            ? { id: uniqueThird[1], name: nameById(uniqueThird[1]) ?? "Locul 3" }
            : null,
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

/**
 * Round-robin scheduling (circle method).
 * Returns rounds; each round is list of pairs [a,b]; a/b can be null => BYE.
 */
function buildRoundRobinRounds(ids: string[]) {
    if (ids.length < 2) return [];
    const arr = [...ids];
    if (arr.length % 2 === 1) arr.push("__BYE__");

    const n = arr.length;
    const rounds: [string | null, string | null][][] = [];
    let players = [...arr];

    for (let r = 0; r < n - 1; r++) {
        const pairs: [string | null, string | null][] = [];
        for (let i = 0; i < n / 2; i++) {
            const a = players[i];
            const b = players[n - 1 - i];
            const pa = a === "__BYE__" ? null : a;
            const pb = b === "__BYE__" ? null : b;
            pairs.push([pa, pb]);
        }
        rounds.push(pairs);

        // rotate (keep first fixed)
        const fixed = players[0];
        const rest = players.slice(1);
        rest.unshift(rest.pop()!);
        players = [fixed, ...rest];
    }

    return rounds;
}

/**
 * Distribute seeded ids into groups using "snake" pattern and respecting target sizes.
 * Seed order should be strongest -> weakest.
 */
function snakeDistribute(seedIds: string[], groupSizes: number[]) {
    const G = groupSizes.length;
    const buckets: string[][] = Array.from({ length: G }, () => []);

    let dir: 1 | -1 = 1;
    let gi = 0;

    for (const id of seedIds) {
        // find next group with capacity
        let tries = 0;
        while (tries < G && buckets[gi].length >= groupSizes[gi]) {
            gi += dir;
            if (gi >= G) {
                gi = G - 1;
                dir = -1;
            } else if (gi < 0) {
                gi = 0;
                dir = 1;
            }
            tries++;
        }

        buckets[gi].push(id);

        // move pointer
        gi += dir;
        if (gi >= G) {
            gi = G - 1;
            dir = -1;
        } else if (gi < 0) {
            gi = 0;
            dir = 1;
        }
    }

    return buckets;
}

export default function AdminTournamentPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    const [title, setTitle] = useState("");
    const [format, setFormat] = useState<TournamentFormat>("LOWER_UPPER_KO");

    const [rows, setRows] = useState<RegistrationRow[]>([]);

    const [groupsLower, setGroupsLower] = useState<GroupWithMembers[]>([]);
    const [groupsUpper, setGroupsUpper] = useState<GroupWithMembers[]>([]);

    const [matchesLower, setMatchesLower] = useState<MatchRow[]>([]);
    const [matchesUpper, setMatchesUpper] = useState<MatchRow[]>([]);
    const [matchesKO, setMatchesKO] = useState<MatchRow[]>([]);

    const [scoreDraft, setScoreDraft] = useState<Record<string, { a: string; b: string }>>({});
    const [showFinalRanking, setShowFinalRanking] = useState(false);
    const [savingPlaces, setSavingPlaces] = useState(false);
    const [placesSavedAt, setPlacesSavedAt] = useState<string | null>(null);
    const [placesSavedAtRaw, setPlacesSavedAtRaw] = useState<string | null>(null);

    // ---- Print helpers (foi de concurs) ----
    type PrintTarget =
        | null
        | { kind: "LOWER_ALL" }
        | { kind: "LOWER_ONE"; groupId: string }
        | { kind: "UPPER_ALL" }
        | { kind: "UPPER_ONE"; groupId: string }
        | { kind: "KO_ALL" }
        | { kind: "KO_ROUND"; round: number };

    const [printTarget, setPrintTarget] = useState<PrintTarget>(null);

    function doPrint(target: Exclude<PrintTarget, null>) {
        setPrintTarget(target);
        // lăsăm React să randeze zona printabilă
        setTimeout(() => window.print(), 120);
    }

    useEffect(() => {
        const onAfterPrint = () => setPrintTarget(null);
        window.addEventListener("afterprint", onAfterPrint);
        return () => window.removeEventListener("afterprint", onAfterPrint);
    }, []);

    function printTableStyle(): CSSProperties {
        return { width: "100%", borderCollapse: "collapse", fontSize: 12 };
    }

    function cell(th: boolean = false): CSSProperties {
        return {
            border: "1px solid #000",
            padding: 6,
            fontWeight: th ? 800 : 600,
            textAlign: "left",
            verticalAlign: "middle",
        };
    }

    function PrintGroupSheet({
        groupName,
        matches,
    }: {
        groupName: string;
        matches: { p1: string; p2: string }[];
    }) {
        return (
            <div className="print-sheet">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{groupName}</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                        Masa: <span style={{ display: "inline-block", minWidth: 120, borderBottom: "1px solid #000" }} />
                    </div>
                </div>

                <table style={printTableStyle()}>
                    <thead>
                        <tr>
                            <th style={cell(true)}>Jucător 1</th>
                            <th style={cell(true)}>Jucător 2</th>
                            <th style={{ ...cell(true), width: 110, textAlign: "center" }}>Seturi</th>
                            <th style={{ ...cell(true), width: 200 }}>Semnături</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((m, idx) => (
                            <tr key={idx}>
                                <td style={cell()}>{m.p1}</td>
                                <td style={cell()}>{m.p2}</td>
                                <td style={{ ...cell(), textAlign: "center" }}>
                                    <span style={{ display: "inline-block", minWidth: 60, borderBottom: "1px solid #000" }} />
                                </td>
                                <td style={cell()}>
                                    <div style={{ display: "flex", gap: 12 }}>
                                        <span style={{ flex: 1, borderBottom: "1px solid #000", display: "inline-block" }} />
                                        <span style={{ flex: 1, borderBottom: "1px solid #000", display: "inline-block" }} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function PrintKORoundSheet({
        roundName,
        matches,
    }: {
        roundName: string;
        matches: { p1: string; p2: string }[];
    }) {
        return (
            <div className="print-sheet">
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>{roundName}</div>
                <table style={printTableStyle()}>
                    <thead>
                        <tr>
                            <th style={cell(true)}>Jucător 1</th>
                            <th style={cell(true)}>Jucător 2</th>
                            <th style={{ ...cell(true), width: 110, textAlign: "center" }}>Seturi</th>
                            <th style={{ ...cell(true), width: 200 }}>Semnături</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((m, idx) => (
                            <tr key={idx}>
                                <td style={cell()}>{m.p1}</td>
                                <td style={cell()}>{m.p2}</td>
                                <td style={{ ...cell(), textAlign: "center" }}>
                                    <span style={{ display: "inline-block", minWidth: 60, borderBottom: "1px solid #000" }} />
                                </td>
                                <td style={cell()}>
                                    <div style={{ display: "flex", gap: 12 }}>
                                        <span style={{ flex: 1, borderBottom: "1px solid #000", display: "inline-block" }} />
                                        <span style={{ flex: 1, borderBottom: "1px solid #000", display: "inline-block" }} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function getDraftAB(matchId: string, currentScore: string | null) {
        const d = scoreDraft[matchId];
        if (d) return d;
        const p = parseScore(currentScore);
        if (!p) return { a: "", b: "" };
        return { a: String(p.a), b: String(p.b) };
    }

    function setDraftA(matchId: string, a: string) {
        setScoreDraft((prev) => ({ ...prev, [matchId]: { a, b: prev[matchId]?.b ?? "" } }));
    }

    function setDraftB(matchId: string, b: string) {
        setScoreDraft((prev) => ({ ...prev, [matchId]: { a: prev[matchId]?.a ?? "", b } }));
    }

    async function recomputeAndPersistGroupStandings(
        stage: "LOWER_GROUP" | "UPPER_GROUP",
        groupId: string,
        matchesForStage: MatchRow[]
    ) {
        const groups = stage === "LOWER_GROUP" ? groupsLower : groupsUpper;
        const setGroups = stage === "LOWER_GROUP" ? setGroupsLower : setGroupsUpper;

        const g = groups.find((x) => x.id === groupId);
        if (!g) return;

        // Construim meciurile din grupă (doar cele cu scor valid)
        const ms = matchesForStage
            .filter((m) => m.group_id === groupId && m.player1_id && m.player2_id)
            .map((m) => {
                const s = parseScore(m.score);
                if (!s || !m.player1_id || !m.player2_id) return null;
                return { p1: m.player1_id, p2: m.player2_id, a: s.a, b: s.b };
            })
            .filter(Boolean) as { p1: string; p2: string; a: number; b: number }[];

        const members = g.members.map((m) => ({ player_id: m.player_id, full_name: m.full_name }));

        const overall: Record<string, Stat> = {};
        for (const m of members) overall[m.player_id] = { wins: 0, losses: 0, pf: 0, pa: 0 };

        for (const m of ms) {
            if (!overall[m.p1] || !overall[m.p2]) continue;

            overall[m.p1].pf += m.a;
            overall[m.p1].pa += m.b;
            overall[m.p2].pf += m.b;
            overall[m.p2].pa += m.a;

            if (m.a > m.b) {
                overall[m.p1].wins += 1;
                overall[m.p2].losses += 1;
            } else if (m.b > m.a) {
                overall[m.p2].wins += 1;
                overall[m.p1].losses += 1;
            }
        }

        const ranked = rankWithMiniTable(members, overall, ms);

        // Actualizăm local grupa (fără reload)
        const updatedMembers = ranked.map((rm, idx) => {
            const st = overall[rm.player_id] ?? { wins: 0, losses: 0, pf: 0, pa: 0 };
            return {
                player_id: rm.player_id,
                full_name: rm.full_name,
                wins: st.wins,
                losses: st.losses,
                points_for: st.pf,
                points_against: st.pa,
                rank_in_group: idx + 1,
            };
        });

        setGroups((prev) =>
            prev.map((gg) => (gg.id === groupId ? { ...gg, members: updatedMembers } : gg))
        );

        // Persistăm în DB (doar pentru grupa afectată)
        for (const mem of updatedMembers) {
            await supabase
                .from("group_members")
                .update({
                    wins: mem.wins,
                    losses: mem.losses,
                    points_for: mem.points_for,
                    points_against: mem.points_against,
                    rank_in_group: mem.rank_in_group,
                })
                .eq("group_id", groupId)
                .eq("player_id", mem.player_id);
        }
    }

    function applyLocalMatchUpdate(stage: MatchRow["stage"], matchId: string, score: string | null, winnerId: string | null) {
        const patch = (m: MatchRow) => (m.id === matchId ? { ...m, score, winner_id: winnerId } : m);

        if (stage === "LOWER_GROUP") setMatchesLower((prev) => prev.map(patch));
        else if (stage === "UPPER_GROUP") setMatchesUpper((prev) => prev.map(patch));
        else setMatchesKO((prev) => prev.map(patch));
    }


    async function saveScoreFromDraft(match: MatchRow) {
        if (!match.player1_id) return;

        try {
            // BYE (player2 lipsă) => câștigător automat
            if (!match.player2_id) {
                const res = await saveScore(match.id, "BYE", match.player1_id, null);
                applyLocalMatchUpdate(match.stage, match.id, res.score, res.winnerId);

                setScoreDraft((prev) => {
                    const cp = { ...prev };
                    delete cp[match.id];
                    return cp;
                });
                return;
            }

            const d = getDraftAB(match.id, match.score);
            if (d.a === "" || d.b === "") {
                alert("Completează ambele seturi (ex: 3 și 1).");
                return;
            }

            const score = `${d.a}-${d.b}`;
            const res = await saveScore(match.id, score, match.player1_id, match.player2_id);
            applyLocalMatchUpdate(match.stage, match.id, res.score, res.winnerId);

            setScoreDraft((prev) => {
                const cp = { ...prev };
                delete cp[match.id];
                return cp;
            });
            // Recalculează imediat clasamentul DOAR pentru grupa afectată (fără reload, fără a afecta celelalte grupe)
            if ((match.stage === "LOWER_GROUP" || match.stage === "UPPER_GROUP") && match.group_id) {
                const base = match.stage === "LOWER_GROUP" ? matchesLower : matchesUpper;
                const updatedMatches = base.map((mm) =>
                    mm.id === match.id ? { ...mm, score: res.score, winner_id: res.winnerId } : mm
                );
                await recomputeAndPersistGroupStandings(match.stage, match.group_id, updatedMatches);
            }
        } catch (e: any) {
            alert(e?.message ?? "Eroare salvare scor.");
        }
    }

    const [showResetOptions, setShowResetOptions] = useState(false);
    const [tournamentStatus, setTournamentStatus] = useState<string>("UPCOMING");
    const [registrationOpen, setRegistrationOpen] = useState<boolean>(true);

    // ✅ pentru locuri libere
    const [maxPlayers, setMaxPlayers] = useState<number | null>(null);

    // ✅ listă participanți (tabel)
    const [participants, setParticipants] = useState<{ id: string; name: string; mp: number; mpMax: number; mpReg: number; category: PlayerCat; present: boolean | null; attended: boolean | null; regStatus: string; absence: "AM" | "AN" | null }[]>([]);

    const activeParticipants = useMemo(() => participants.filter((p) => p.regStatus === "REGISTERED" && p.present !== false && p.attended !== false), [participants]);

    const registered = useMemo(() => rows.filter((r) => r.status === "REGISTERED" && (r as any).present !== false && (r as any).attended !== false), [rows]);

    const registeredCount = registered.length;
    // Pentru formatul "Inferioare → Superioare → KO": dacă sunt 3–9 jucători,
    // nu se pot face grupe superioare (nu sunt suficienți calificați). În acest caz,
    // rulăm identic cu modul "Grupe → KO direct" (folosim doar grupele inferioare).
    const forceGroupsKo = format === "LOWER_UPPER_KO" && registeredCount >= 3 && registeredCount <= 9;


    // Participanți derivați din rows (și sortați)
    useEffect(() => {
        const list = rows
            .filter((r) => r.status === "REGISTERED")
            .map((r) => {
                const p = r.players;

                const name =
                    (p?.display_name ?? "").trim() ||
                    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
                    ((p?.full_name ?? "").includes("@") ? "" : (p?.full_name ?? "").trim()) ||
                    p?.full_name ||
                    "—";

                const mp = normalizeNum(p?.mp, 2);
                const mpMaxBase = normalizeNum(p?.mp_max, mp);
                const mpAmatur = normalizeNum((p as any)?.amatur_mp, 0);
                const mpMax = Math.max(mpMaxBase, mpAmatur);
                const mpReg = normalizeNum((r as any).mp_before, 2);

                const present = ((r as any).present ?? null) as boolean | null;
                const attended = ((r as any).attended ?? null) as boolean | null;

                const noShow = normalizeNum((r as any).no_show_penalty, 0);
                const applied = normalizeNum((r as any).penalty_applied, 0);

                // Dacă e marcat absent (present/attended=false), determinăm tipul:
                // AN dacă are penalizare (>=2), altfel AM
                const isAbsent = present === false || attended === false;
                const absence: "AM" | "AN" | null = isAbsent ? ((noShow >= 2 || applied >= 2) ? "AN" : "AM") : null;

                return { id: r.player_id, name, mp, mpMax, mpReg, category: playerCategoryFromMpMax(mpMax), present, attended, regStatus: r.status, absence };
            })
            .sort((a, b) => {
                if (b.mp !== a.mp) return b.mp - a.mp; // MP desc
                return a.name.localeCompare(b.name); // la egalitate: alfabetic
            });

        setParticipants(list);
    }, [rows]);

    const participantCount = activeParticipants.length;
    const spotsLeft = typeof maxPlayers === "number" ? Math.max(0, maxPlayers - participantCount) : null;

    async function setTournamentStatusSafe(next: "UPCOMING" | "LIVE" | "FINISHED" | "CANCELLED") {
        const { error } = await supabase.from("tournaments").update({ status: next }).eq("id", tournamentId);
        if (error) return alert("Eroare status: " + error.message);

        setTournamentStatus(next);
        await load();
    }


    // ✅ Absență (AM/AN). Implicit toți sunt considerați prezenți; marchezi DOAR absenții.
    // AM = absență motivată (0 puncte)
    // AN = absență nemotivată / no-show (+2 puncte)
    async function markAbsence(playerId: string, kind: "AM" | "AN") {
        const points = kind === "AN" ? 2 : 0;
        const reason = kind === "AN" ? "Absență nemotivată (+2 puncte)" : "Absență motivată (0 puncte)";

        // Citim starea curentă ca să evităm update-uri inutile
        const { data: reg, error: regErr } = await supabase
            .from("registrations")
            .select("present,attended,no_show_penalty,penalty_applied")
            .eq("tournament_id", tournamentId)
            .eq("player_id", playerId)
            .maybeSingle();

        if (regErr) {
            alert("Eroare citire registration: " + regErr.message);
            return;
        }

        const currentPresent = (reg as any)?.present as boolean | null | undefined;
        const currentAttended = (reg as any)?.attended as boolean | null | undefined;
        const currentNoShow = normalizeNum((reg as any)?.no_show_penalty, 0);
        const currentApplied = normalizeNum((reg as any)?.penalty_applied, 0);

        const alreadyAbsent = currentPresent === false || currentAttended === false;
        const alreadySameKind =
            alreadyAbsent &&
            ((points >= 2 && (currentNoShow >= 2 || currentApplied >= 2)) || (points === 0 && currentNoShow === 0 && currentApplied === 0));

        if (alreadySameKind) {
            await load();
            return;
        }

        const { error: upErr } = await supabase
            .from("registrations")
            .update({
                present: false,
                attended: false,
                no_show_penalty: points,
                penalty_applied: points,
                penalty_reason: reason,
            } as any)
            .eq("tournament_id", tournamentId)
            .eq("player_id", playerId);

        if (upErr) return alert("Eroare setare absență: " + upErr.message);

        await load();
    }

    // Revenire (demarcare) a absenței: revine la starea "neconfirmat" (null) și șterge penalizarea no-show.
    async function clearAbsence(playerId: string) {
        const { error: upErr } = await supabase
            .from("registrations")
            .update({
                present: null,
                attended: null,
                no_show_penalty: 0,
                penalty_applied: 0,
                penalty_reason: null,
            } as any)
            .eq("tournament_id", tournamentId)
            .eq("player_id", playerId);

        if (upErr) {
            alert("Eroare demarcare absență: " + upErr.message);
            return;
        }

        await load();
    }

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

        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
            router.push("/login");
            return;
        }

        const { data: me } = await supabase.from("players").select("is_admin").eq("id", auth.user.id).single();
        const admin = !!me?.is_admin;
        setIsAdmin(admin);

        if (!admin) {
            setLoading(false);
            router.push("/");
            return;
        }

        const { data: t } = await supabase.from("tournaments").select("title,format,status,registration_open,max_players,places_saved_at").eq("id", tournamentId).single();

        setTitle(t?.title ?? "");
        setFormat((t?.format as TournamentFormat) ?? "LOWER_UPPER_KO");
        setTournamentStatus(t?.status ?? "UPCOMING");
        setRegistrationOpen(!!t?.registration_open);
        setMaxPlayers(typeof t?.max_players === "number" ? t.max_players : null);

        const psa = (t as any)?.places_saved_at as string | null | undefined;
        if (psa) {
            setPlacesSavedAtRaw(psa);
            try {
                setPlacesSavedAt(new Date(psa).toLocaleString("ro-RO"));
            } catch {
                setPlacesSavedAt(psa);
            }
        } else {
            setPlacesSavedAtRaw(null);
            setPlacesSavedAt(null);
            setPlacesSavedAtRaw(null);
        }

        const { data: regs } = await supabase
            .from("registrations")
            .select(
                `
        player_id,status,withdrawn_at,penalty_applied,penalty_reason,present,attended,no_show_penalty,
        players:player_id(full_name,display_name,first_name,last_name,mp,mp_max,amatur_mp,penalty_points,banned_until)
      `
            )
            .eq("tournament_id", tournamentId)
            .order("registered_at", { ascending: true });

        setRows((regs as any) ?? []);

        // Sincronizare MP Max cu MP Amator (dacă există și e mai mare)
        // Turneele naționale/amator pot ridica MP Max automat.
        try {
            const toSync: { id: string; newMpMax: number }[] = [];
            for (const r of (regs as any[]) ?? []) {
                const p = (r as any)?.players;
                const id = (r as any)?.player_id as string | undefined;
                if (!id) continue;
                const mpMax = normalizeNum(p?.mp_max, 0);
                const mpAmatur = normalizeNum((p as any)?.amatur_mp, 0);
                if (mpAmatur > mpMax) toSync.push({ id, newMpMax: mpAmatur });
            }

            // Update doar când e necesar (și doar câteva rânduri, de obicei)
            for (const u of toSync) {
                await supabase.from("players").update({ mp_max: u.newMpMax } as any).eq("id", u.id);
            }
        } catch {
            // dacă RLS nu permite update, nu blocăm pagina; rămâne doar afișarea cu max(mp_max, amatur_mp)
        }

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

    // --- RESET helpers (DANGEROUS) ---
    async function confirmResetOnce(actionLabel: string) {
        const ok = window.confirm(
            `ATENȚIE!\n\nAceasta acțiune va ȘTERGE date (doar pentru TESTE).\nAcțiune: ${actionLabel}\n\nApasă OK ca să continui sau Cancel ca să renunți.`
        );
        if (!ok) return false;

        const suffix = String(tournamentId ?? "").slice(-6).toUpperCase();
        const expected = `RESET ${suffix}`;

        const typedRaw = window.prompt(`Confirmare finală.\nTastează exact:\n\n${expected}\n\nca să continui.`);
        const typed = (typedRaw ?? "")
            .toUpperCase()
            .replace(/\s+/g, " ")
            .trim();

        // Acceptăm câteva variante "umane":
        // - "RESET ABCDEF" (exact)
        // - "RESETABCDEF" (fără spațiu)
        // - "ABCDEF" (doar sufixul)
        const ok2 = typed === expected || typed === `RESET${suffix}` || typed === suffix;

        if (!ok2) {
            alert(`Cod greșit sau acțiune anulată.\n\nAșteptat: ${expected}\nPrimit: ${typedRaw ?? "—"}`);
            return false;
        }
        return true;
    }

    async function resetKOSilent() {
        const { error } = await supabase.from("matches").delete().eq("tournament_id", tournamentId).eq("stage", "KO");
        if (error) throw new Error("Eroare reset KO: " + error.message);
    }

    async function resetUpperSilent() {
        const { error: mErr } = await supabase.from("matches").delete().eq("tournament_id", tournamentId).eq("stage", "UPPER_GROUP");
        if (mErr) throw new Error("Eroare ștergere meciuri superioare: " + mErr.message);

        const { data: gs, error: gErr } = await supabase.from("groups").select("id").eq("tournament_id", tournamentId).eq("stage", "UPPER_GROUP");
        if (gErr) throw new Error("Eroare citire grupe superioare: " + gErr.message);

        const groupIds = (gs ?? []).map((x: any) => x.id);
        if (groupIds.length > 0) {
            const { error: gmErr } = await supabase.from("group_members").delete().in("group_id", groupIds);
            if (gmErr) throw new Error("Eroare ștergere group_members (superioare): " + gmErr.message);
        }

        const { error: delGErr } = await supabase.from("groups").delete().eq("tournament_id", tournamentId).eq("stage", "UPPER_GROUP");
        if (delGErr) throw new Error("Eroare ștergere grupe superioare: " + delGErr.message);
    }

    async function resetLowerSilent() {
        const { error: mErr } = await supabase.from("matches").delete().eq("tournament_id", tournamentId).eq("stage", "LOWER_GROUP");
        if (mErr) throw new Error("Eroare ștergere meciuri grupe: " + mErr.message);

        const { data: gs, error: gErr } = await supabase.from("groups").select("id").eq("tournament_id", tournamentId).eq("stage", "LOWER_GROUP");
        if (gErr) throw new Error("Eroare citire grupe: " + gErr.message);

        const groupIds = (gs ?? []).map((x: any) => x.id);
        if (groupIds.length > 0) {
            const { error: gmErr } = await supabase.from("group_members").delete().in("group_id", groupIds);
            if (gmErr) throw new Error("Eroare ștergere group_members (grupe): " + gmErr.message);
        }

        const { error: delGErr } = await supabase.from("groups").delete().eq("tournament_id", tournamentId).eq("stage", "LOWER_GROUP");
        if (delGErr) throw new Error("Eroare ștergere grupe: " + delGErr.message);
    }

    async function resetAllTournamentDataOnce() {
        const ok = await confirmResetOnce("RESET TOTAL (șterge Grupe + Superioare + KO)");
        if (!ok) return;

        try {
            await resetKOSilent();
            await resetUpperSilent();
            await resetLowerSilent();

            alert("RESET TOTAL efectuat.");
            setShowResetOptions(false);
            await load();
        } catch (e: any) {
            alert(e?.message ?? "Eroare reset total.");
            await load();
        }
    }

    async function resetKOOnce() {
        const ok = await confirmResetOnce("Reset KO (șterge toate meciurile KO)");
        if (!ok) return;
        try {
            await resetKOSilent();
            alert("KO a fost resetat.");
            await load();
        } catch (e: any) {
            alert(e?.message ?? "Eroare reset KO.");
            await load();
        }
    }

    async function resetUpperOnce() {
        const ok = await confirmResetOnce("Reset Superioare (șterge grupe+meciuri superioare)");
        if (!ok) return;
        try {
            await resetUpperSilent();
            alert("Superioarele au fost resetate.");
            await load();
        } catch (e: any) {
            alert(e?.message ?? "Eroare reset superioare.");
            await load();
        }
    }

    async function resetLowerOnce() {
        const ok = await confirmResetOnce("Reset Grupe/Inferioare (șterge grupe+meciuri de grupe)");
        if (!ok) return;
        try {
            await resetLowerSilent();
            await load();
        } catch (e: any) {
            await load();
        }
    }

    // -------- KO helpers --------
    function getQualifiedTopKFromGroups(sourceGroups: GroupWithMembers[], k: number) {
        if (sourceGroups.length === 0) return null

        const anyMissingRank = sourceGroups.some((g) => g.members.some((m) => m.rank_in_group == null))
        if (anyMissingRank) return null

        const qualified: { id: string; name: string; group: string; rank: number }[] = []

        for (const g of sourceGroups) {
            const sorted = [...g.members].sort((a, b) => (a.rank_in_group ?? 999) - (b.rank_in_group ?? 999))
            const topK = sorted.filter((m) => (m.rank_in_group ?? 999) <= k)

            for (const m of topK) {
                qualified.push({
                    id: m.player_id,
                    name: m.full_name,
                    group: g.name,
                    rank: m.rank_in_group ?? 999,
                })
            }
        }

        // unique by player id
        const map = new Map<string, { id: string; name: string; group: string; rank: number }>()
        for (const x of qualified) map.set(x.id, x)
        const uniq = Array.from(map.values())

        // seeding: rank (1 înaintea 2 etc), apoi grupă
        uniq.sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank
            return a.group.localeCompare(b.group)
        })

        return uniq
    }

    async function generateGroupMatchesWithRounds(stage: "LOWER_GROUP" | "UPPER_GROUP", groups: GroupWithMembers[], existingCount: number) {
        if (groups.length === 0) return
        if (existingCount > 0) return alert("Meciurile pentru această etapă au fost deja generate.")
        const inserts: any[] = [];

        for (const g of groups) {
            const ids = g.members.map((m) => m.player_id);
            const rounds = buildRoundRobinRounds(ids);

            for (let r = 0; r < rounds.length; r++) {
                for (const [a, b] of rounds[r]) {
                    if (!a && !b) continue;
                    if (a && b) {
                        inserts.push({
                            tournament_id: tournamentId,
                            stage,
                            group_id: g.id,
                            round: r + 1,
                            player1_id: a,
                            player2_id: b,
                            score: null,
                            winner_id: null,
                        });
                    } else if (a && !b) {
                        inserts.push({
                            tournament_id: tournamentId,
                            stage,
                            group_id: g.id,
                            round: r + 1,
                            player1_id: a,
                            player2_id: null,
                            score: "BYE",
                            winner_id: a,
                        });
                    } else if (!a && b) {
                        inserts.push({
                            tournament_id: tournamentId,
                            stage,
                            group_id: g.id,
                            round: r + 1,
                            player1_id: b,
                            player2_id: null,
                            score: "BYE",
                            winner_id: b,
                        });
                    }
                }
            }
        }

        const { error } = await supabase.from("matches").insert(inserts);
        if (error) return
        await load();
    }

    async function saveScore(matchId: string, score: string, p1: string, p2: string | null) {
        // Returnează { score, winnerId } fără să facă reload complet
        if (!p2) {
            const { error } = await supabase
                .from("matches")
                .update({ score: (score?.trim() ? score.trim() : "BYE"), winner_id: p1 })
                .eq("id", matchId);

            if (error) throw new Error("Eroare salvare scor: " + error.message);
            return { score: (score?.trim() ? score.trim() : "BYE"), winnerId: p1 as string | null };
        }

        const parsed = parseScore(score);
        if (!parsed) throw new Error('Scor invalid. Folosește formatul 3-1.');

        const winnerId = parsed.a > parsed.b ? p1 : parsed.b > parsed.a ? p2 : null;

        const { error } = await supabase
            .from("matches")
            .update({ score: `${parsed.a}-${parsed.b}`, winner_id: winnerId })
            .eq("id", matchId);

        if (error) throw new Error("Eroare salvare scor: " + error.message);
        return { score: `${parsed.a}-${parsed.b}`, winnerId };
    }

    async function computeStandingsForStage(stage: "LOWER_GROUP" | "UPPER_GROUP", groups: GroupWithMembers[], matches: MatchRow[]) {
        if (groups.length === 0) return
        const matchesByGroup: Record<string, { p1: string; p2: string; a: number; b: number }[]> = {};
        for (const m of matches) {
            if (!m.group_id || !m.player1_id || !m.player2_id) continue;
            const s = parseScore(m.score);
            if (!s) continue;
            if (!matchesByGroup[m.group_id]) matchesByGroup[m.group_id] = [];
            matchesByGroup[m.group_id].push({ p1: m.player1_id, p2: m.player2_id, a: s.a, b: s.b });
        }

        const nextGroups: GroupWithMembers[] = [];

        for (const g of groups) {
            for (const mem of g.members) {
                await supabase
                    .from("group_members")
                    .update({ wins: 0, losses: 0, points_for: 0, points_against: 0, rank_in_group: null })
                    .eq("group_id", g.id)
                    .eq("player_id", mem.player_id);
            }

            const members = g.members.map((m) => ({ player_id: m.player_id, full_name: m.full_name }));
            const ms = matchesByGroup[g.id] ?? [];

            const overall: Record<string, Stat> = {};
            for (const m of members) overall[m.player_id] = { wins: 0, losses: 0, pf: 0, pa: 0 };

            for (const m of ms) {
                if (!overall[m.p1] || !overall[m.p2]) continue;

                overall[m.p1].pf += m.a;
                overall[m.p1].pa += m.b;
                overall[m.p2].pf += m.b;
                overall[m.p2].pa += m.a;

                if (m.a > m.b) {
                    overall[m.p1].wins += 1;
                    overall[m.p2].losses += 1;
                } else if (m.b > m.a) {
                    overall[m.p2].wins += 1;
                    overall[m.p1].losses += 1;
                }
            }

            const ranked = rankWithMiniTable(members, overall, ms);

            for (let idx = 0; idx < ranked.length; idx++) {
                const id = ranked[idx].player_id;
                const st = overall[id];

                await supabase
                    .from("group_members")
                    .update({ wins: st.wins, losses: st.losses, points_for: st.pf, points_against: st.pa, rank_in_group: idx + 1 })
                    .eq("group_id", g.id)
                    .eq("player_id", id);
            }

            nextGroups.push({ ...g, members: g.members.map((m) => ({ ...m })) });
        }

        // ✅ Update local state (fără reload global)
        if (stage === "LOWER_GROUP") setGroupsLower(nextGroups);
        else setGroupsUpper(nextGroups);
    }



    function isLowerMatchCompleted(mm: MatchRow) {
        if (!mm.player2_id) return Boolean(mm.winner_id || mm.player1_id);
        return Boolean(mm.score && mm.winner_id);
    }

    function areAllLowerGroupsCompleted() {
        if (groupsLower.length === 0) return false;
        const ms = matchesLower.filter((m) => m.group_id);
        if (ms.length === 0) return false;
        return ms.every(isLowerMatchCompleted);
    }

    async function generateUpperGroupsFromLowerTop4() {
        if (forceGroupsKo) return alert("Sunt " + registeredCount + " jucători înscriși. Pentru 3–9 jucători nu se pot genera grupe superioare; turneul rulează ca «Grupe → KO direct».");
        if (groupsLower.length === 0) return
        if (groupsUpper.length > 0) return
        const anyMissingRank = groupsLower.some((g) => g.members.some((m) => m.rank_in_group == null));
        if (anyMissingRank) return
        const qualified: { id: string; name: string }[] = [];
        for (const g of groupsLower) {
            const top4 = [...g.members]
                .filter((m) => (m.rank_in_group ?? 999) <= 4)
                .sort((a, b) => (a.rank_in_group ?? 999) - (b.rank_in_group ?? 999));
            for (const m of top4) qualified.push({ id: m.player_id, name: m.full_name });
        }

        const uniqMap = new Map<string, { id: string; name: string }>();
        for (const q of qualified) uniqMap.set(q.id, q);
        const uniq = Array.from(uniqMap.values());

        const N = uniq.length;
        if (N < 3) return
        const G = chooseGroupCount(N, 3, 4, 3);
        if (!G) return
        const sizes = buildGroupSizes(N, G);
        const shuffled = [...uniq].sort(() => Math.random() - 0.5);

        const names = Array.from({ length: G }, (_, i) => `Superioare ${String.fromCharCode(65 + i)}`);
        const { data: created, error: gErr } = await supabase.from("groups").insert(names.map((name) => ({ tournament_id: tournamentId, stage: "UPPER_GROUP", name }))).select("id,name");
        if (gErr) return
        const inserts: any[] = [];
        let idx = 0;
        for (let gi = 0; gi < created!.length; gi++) {
            for (let k = 0; k < sizes[gi]; k++) {
                const p = shuffled[idx++];
                inserts.push({ group_id: created![gi].id, player_id: p.id, seed: k + 1, wins: 0, losses: 0, points_for: 0, points_against: 0, rank_in_group: null });
            }
        }

        const { error: mErr } = await supabase.from("group_members").insert(inserts);
        if (mErr) return alert("Eroare group_members (superioare): " + mErr.message);
        await load();
    }

    async function generateKORound1() {
        if (matchesKO.length > 0) return
        const isGroupsKo = format === "GROUPS_KO" || forceGroupsKo;
        const sourceGroups = isGroupsKo ? groupsLower : groupsUpper;

        if (sourceGroups.length === 0) return
        const k = isGroupsKo ? 4 : 2;
        // GROUPS_KO → Top 4 din grupe (inferioare)
        // LOWER_UPPER_KO → Top 2 din superioare
        const qualified = getQualifiedTopKFromGroups(sourceGroups, k);
        if (!qualified) return
        const N = qualified.length;
        if (N < 2) return alert("Prea puțini calificați pentru KO.");

        const size = nextPow2(N);
        const byes = size - N;

        const seeds: (typeof qualified[number] | null)[] = [...qualified];
        for (let i = 0; i < byes; i++) seeds.push(null);

        const pairs: { a: (typeof qualified[number] | null); b: (typeof qualified[number] | null) }[] = [];
        for (let i = 0; i < size / 2; i++) pairs.push({ a: seeds[i], b: seeds[size - 1 - i] });

        const inserts: any[] = [];
        for (const p of pairs) {
            const p1 = p.a;
            const p2 = p.b;

            if (p1 && p2) {
                inserts.push({ tournament_id: tournamentId, stage: "KO", round: 1, group_id: null, player1_id: p1.id, player2_id: p2.id, score: null, winner_id: null });
            } else if (p1 && !p2) {
                inserts.push({ tournament_id: tournamentId, stage: "KO", round: 1, group_id: null, player1_id: p1.id, player2_id: null, score: "BYE", winner_id: p1.id });
            } else if (!p1 && p2) {
                inserts.push({ tournament_id: tournamentId, stage: "KO", round: 1, group_id: null, player1_id: p2.id, player2_id: null, score: "BYE", winner_id: p2.id });
            }
        }

        const { error } = await supabase.from("matches").insert(inserts);
        if (error) return alert("Eroare creare KO: " + error.message);

        alert(`KO creat: Round 1 (${size} tablou, ${byes} BYE).`);
        await load();
    }

    async function advanceKONextRound() {
        if (matchesKO.length === 0) return alert("Nu există KO.");

        const rounds = matchesKO.map((m) => m.round ?? 0).filter((r) => r > 0);
        const maxRound = rounds.length ? Math.max(...rounds) : 1;

        const hasNext = matchesKO.some((m) => (m.round ?? 0) === maxRound + 1);
        if (hasNext) return alert("Runda următoare există deja.");

        const current = matchesKO.filter((m) => (m.round ?? 0) === maxRound);
        if (current.length === 0) return
        const missing = current.filter((m) => !m.winner_id);
        if (missing.length > 0) return
        const winners = current.map((m) => m.winner_id!).filter(Boolean);
        if (winners.length < 2) {
            alert("Turneul KO s-a terminat (există campion)!");
            return;
        }

        const inserts: any[] = [];
        for (let i = 0; i < winners.length; i += 2) {
            const p1 = winners[i];
            const p2 = winners[i + 1] ?? null;

            if (p2) inserts.push({ tournament_id: tournamentId, stage: "KO", round: maxRound + 1, group_id: null, player1_id: p1, player2_id: p2, score: null, winner_id: null });
            else inserts.push({ tournament_id: tournamentId, stage: "KO", round: maxRound + 1, group_id: null, player1_id: p1, player2_id: null, score: "BYE", winner_id: p1 });
        }

        const { error } = await supabase.from("matches").insert(inserts);
        if (error) return alert("Eroare avansare KO: " + error.message);

        await load();
    }

    async function setRegistrationOpenSafe(open: boolean) {
        const { error } = await supabase.from("tournaments").update({ registration_open: open }).eq("id", tournamentId);
        if (error) return alert("Eroare registration_open: " + error.message);
        await load();
    }

    async function closeRegistrations() {
        const ok = window.confirm("Închizi înscrierile? Jucătorii nu se mai pot înscrie/retrage.");
        if (!ok) return;
        await setRegistrationOpenSafe(false);
    }

    async function openRegistrations() {
        const ok = window.confirm("Redeschizi înscrierile? Jucătorii se pot înscrie/retrage.");
        if (!ok) return;
        await setRegistrationOpenSafe(true);
    }

    // ⭐️ NOU: flux 1-click pentru "grupe + meciuri" cu fallback "Liga"
    async function generateLowerGroupsAndMatches() {
        const N = activeParticipants.length;

        if (N < 3) return alert("Ai nevoie de minim 3 participanți REGISTERED.");
        if (groupsLower.length > 0 || matchesLower.length > 0) return
        // încearcă grupe 4–6
        const G = chooseGroupCount(N, 4, 6, 5);

        // seed list: descrescător MP (deja e sortat)
        const seedIds = activeParticipants.map((p) => p.id);

        if (!G) {
            // fallback: Liga (fiecare cu fiecare)
            const ok = window.confirm(
                `Nu pot crea grupe de minim 4 pentru ${N} jucători.\n\nVrei să rulezi formatul "Liga (fiecare cu fiecare)"? (fără KO)`
            );
            if (!ok) return;

            const { data: created, error: gErr } = await supabase
                .from("groups")
                .insert([{ tournament_id: tournamentId, stage: "LOWER_GROUP", name: "Liga (fiecare cu fiecare)" }])
                .select("id,name");
            if (gErr) return alert("Eroare creare Liga: " + gErr.message);

            const groupId = created![0].id;

            const insertsMembers = seedIds.map((id, idx) => ({
                group_id: groupId,
                player_id: id,
                seed: idx + 1,
                wins: 0,
                losses: 0,
                points_for: 0,
                points_against: 0,
                rank_in_group: null,
            }));
            const { error: mErr } = await supabase.from("group_members").insert(insertsMembers);
            if (mErr) return alert("Eroare group_members (Liga): " + mErr.message);

            // generează meciuri cu runde
            await load();
            const gl = await loadGroups("LOWER_GROUP");
            await generateGroupMatchesWithRounds("LOWER_GROUP", gl, 0);
            return;
        }

        // grupe standard (4–6) + distribuire snake
        const sizes = buildGroupSizes(N, G);
        const buckets = snakeDistribute(seedIds, sizes);

        const names = Array.from({ length: G }, (_, i) => `Grupa ${String.fromCharCode(65 + i)}`);
        const { data: created, error: gErr } = await supabase.from("groups").insert(names.map((name) => ({ tournament_id: tournamentId, stage: "LOWER_GROUP", name }))).select("id,name");
        if (gErr) return
        const insertsMembers: any[] = [];
        for (let gi = 0; gi < created!.length; gi++) {
            for (let k = 0; k < buckets[gi].length; k++) {
                insertsMembers.push({
                    group_id: created![gi].id,
                    player_id: buckets[gi][k],
                    seed: k + 1,
                    wins: 0,
                    losses: 0,
                    points_for: 0,
                    points_against: 0,
                    rank_in_group: null,
                });
            }
        }

        const { error: mErr } = await supabase.from("group_members").insert(insertsMembers);
        if (mErr) return alert("Eroare group_members: " + mErr.message);

        // refresh groups, apoi meciuri pe runde
        const gl = await loadGroups("LOWER_GROUP");
        setGroupsLower(gl);
        await generateGroupMatchesWithRounds("LOWER_GROUP", gl, 0);
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
        const rounds = Object.keys(map).map((x) => parseInt(x, 10)).sort((a, b) => a - b);
        return { map, rounds };
    }, [matchesKO]);

    const champion = useMemo(() => getChampion(matchesKO), [matchesKO]);
    const maxKORound = useMemo(() => (matchesKO.length ? Math.max(...matchesKO.map((m) => m.round ?? 1)) : 1), [matchesKO]);
    const podium = useMemo(() => getPodiumTop4(matchesKO), [matchesKO]);

    useEffect(() => {
        if (!champion) setShowFinalRanking(false);
    }, [champion]);

    const overallRanking = useMemo(() => {
        // baza: participanții (MP la înscriere = mp curent din profil, în lipsa unui snapshot în registrations)
        const base = activeParticipants.map((p) => ({
            id: p.id,
            name: p.name,

            // MP la înscriere (snapshot din registrations.mp_before)
            mpReg: p.mpReg,

            // Categoria jucătorului (H/A/E)
            cat: p.category,

            // victorii în grupe
            winsLower: 0,
            winsUpper: 0,

            // ✅ seturi în grupe (pentru setaveraj)
            pfLower: 0,
            paLower: 0,
            pfUpper: 0,
            paUpper: 0,

            // ✅ victorii în KO (pentru total victorii turneu)
            koWins: 0,

            // progres KO / grupe
            koRound: 0,
            groupStage: "" as "UPPER_GROUP" | "LOWER_GROUP" | "",
            groupName: "",
            groupRank: null as number | null,

            // podium
            finalPlace: null as 1 | 2 | 3 | null,

            // MP turneu (media sector + bonus)
            mpTournament: null as number | null,
            mpBonus: 0 as number,
        }));

        const idToRow = new Map(base.map((x) => [x.id, x]));

        // podium (1,2,3,3)
        if (podium?.place1?.id) {
            const r1 = idToRow.get(podium.place1.id);
            if (r1) r1.finalPlace = 1;
        }
        if (podium?.place2?.id) {
            const r2 = idToRow.get(podium.place2.id);
            if (r2) r2.finalPlace = 2;
        }
        if (podium?.place3a?.id) {
            const r3a = idToRow.get(podium.place3a.id);
            if (r3a) r3a.finalPlace = 3;
        }
        if (podium?.place3b?.id) {
            const r3b = idToRow.get(podium.place3b.id);
            if (r3b) r3b.finalPlace = 3;
        }

        // KO run
        const { roundReached } = buildKORunMap(matchesKO);
        for (const [id, rr] of roundReached.entries()) {
            const row = idToRow.get(id);
            if (row) row.koRound = rr;
        }

        // ✅ KO wins (număr de meciuri KO câștigate)
        const koWinsByPlayer = new Map<string, number>();
        for (const m of matchesKO) {
            if (!m.winner_id) continue;
            koWinsByPlayer.set(m.winner_id, (koWinsByPlayer.get(m.winner_id) ?? 0) + 1);
        }
        for (const [id, w] of koWinsByPlayer.entries()) {
            const row = idToRow.get(id);
            if (row) row.koWins = w;
        }

        // victorii + grupă/rank (prefer UPPER dacă există)
        const upperByPlayer = new Map<
            string,
            { groupName: string; rank: number | null; wins: number; pf: number; pa: number }
        >();
        for (const g of groupsUpper) {
            for (const m of g.members) {
                upperByPlayer.set(m.player_id, {
                    groupName: g.name,
                    rank: m.rank_in_group ?? null,
                    wins: m.wins ?? 0,
                    pf: m.points_for ?? 0,
                    pa: m.points_against ?? 0,
                });
            }
        }

        const lowerByPlayer = new Map<
            string,
            { groupName: string; rank: number | null; wins: number; pf: number; pa: number }
        >();
        for (const g of groupsLower) {
            for (const m of g.members) {
                lowerByPlayer.set(m.player_id, {
                    groupName: g.name,
                    rank: m.rank_in_group ?? null,
                    wins: m.wins ?? 0,
                    pf: m.points_for ?? 0,
                    pa: m.points_against ?? 0,
                });
            }
        }

        for (const row of base) {
            const up = upperByPlayer.get(row.id);
            const lo = lowerByPlayer.get(row.id);

            row.winsUpper = up?.wins ?? 0;
            row.winsLower = lo?.wins ?? 0;

            row.pfUpper = up?.pf ?? 0;
            row.paUpper = up?.pa ?? 0;
            row.pfLower = lo?.pf ?? 0;
            row.paLower = lo?.pa ?? 0;

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

        // ✅ sortarea finală (Varianta 1: Podium + total victorii + setaveraj grupe + MP la înscriere + alfabetic)
        const sorted = [...base].sort((a, b) => {
            // 1) Podium (1,2,3,3) mereu sus
            if (a.finalPlace && b.finalPlace) return a.finalPlace - b.finalPlace;
            if (a.finalPlace && !b.finalPlace) return -1;
            if (!a.finalPlace && b.finalPlace) return 1;

            // 2) Total victorii în turneu (grupe + KO), descrescător
            const aTotalWins = (a.winsLower ?? 0) + (a.winsUpper ?? 0) + (a.koWins ?? 0);
            const bTotalWins = (b.winsLower ?? 0) + (b.winsUpper ?? 0) + (b.koWins ?? 0);
            if (bTotalWins !== aTotalWins) return bTotalWins - aTotalWins;

            // 3) Setaveraj în grupe (inf + sup), descrescător
            const aSetDiff = (a.pfLower - a.paLower) + (a.pfUpper - a.paUpper);
            const bSetDiff = (b.pfLower - b.paLower) + (b.pfUpper - b.paUpper);
            if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;

            // 4) MP la înscriere (descrescător)
            if (b.mpReg !== a.mpReg) return b.mpReg - a.mpReg;

            // 5) Alfabetic
            return a.name.localeCompare(b.name);
        });

        // Calcul MP Turneu:
        // - sector = blocuri de 4 în clasamentul final (1-4, 5-8, ...)
        // - mpSector = media MP la înscriere a celor din bloc (MP din lista de înscriere)
        // - bonus: #1 +6, #2 +4, #3/#4 +3 #5/#8 +2 #9/#12 +1
        // - mpTournament = mpSector + bonus
        // MP sector pe blocuri de 4 din LISTA DE ÎNSCRIERE (nu din clasamentul final)
        const regSorted = [...activeParticipants].sort((a, b) => {
            // IMPORTANT: MP sector must be computed from MP la înscriere (mpReg), not current MP (mp)
            if (b.mpReg !== a.mpReg) return b.mpReg - a.mpReg;
            return a.name.localeCompare(b.name);
        });

        const regMeans: number[] = [];
        for (let i = 0; i < regSorted.length; i += 4) {
            const blk = regSorted.slice(i, i + 4);
            const mean = blk.length
                ? blk.reduce((acc, p) => acc + (Number.isFinite(p.mpReg) ? p.mpReg : 0), 0) / blk.length
                : 0;
            regMeans.push(mean);
        }

        const hasKO = matchesKO.length > 0;

        for (let i = 0; i < sorted.length; i += 4) {
            const block = sorted.slice(i, i + 4);
            const blockIndex = Math.floor(i / 4);

            // sectorul #1 (locurile 1-4) folosește media MP a locurilor 1-4 din lista de înscriere,
            // sectorul #2 (locurile 5-8) folosește media MP a locurilor 5-8 din lista de înscriere, etc.
            const mpSector = regMeans[blockIndex] ?? (regMeans.length ? regMeans[regMeans.length - 1] : 0);

            for (let j = 0; j < block.length; j++) {
                const pos = i + j + 1;

                const podiumBonus = pos === 1 ? 6 : pos === 2 ? 4 : pos === 3 || pos === 4 ? 3 : 0;

                // Bonusuri suplimentare (motivare): locurile 5–8 (+2), locurile 9–12 (+1)
                const bandBonus = pos >= 5 && pos <= 8 ? 2 : pos >= 9 && pos <= 12 ? 1 : 0;

                const bonus = podiumBonus + bandBonus;

                const mpTournament = mpSector + bonus;

                block[j].mpTournament = mpTournament;
                block[j].mpBonus = bonus;
            }
        }
        return sorted;
    }, [activeParticipants, matchesKO, podium, groupsUpper, groupsLower]);

    // ✅ Salvează locul final în DB (registrations.final_place) + opțional etichetă KO (registrations.ko_label)
    // Necesită coloane:
    //  - registrations.final_place int
    //  - registrations.ko_label text (opțional)
    async function persistFinalPlacesToRegistrations() {
        if (!tournamentId) return;
        if (!champion || !showFinalRanking) {
            alert("Locurile pot fi salvate doar după ce există campion și ai generat clasamentul final.");
            return;
        }
        if (!overallRanking || overallRanking.length === 0) {
            alert("Nu există clasament de salvat.");
            return;
        }


        if (placesSavedAtRaw) {
            alert("Acest turneu are deja locurile salvate în DB (places_saved_at). Dacă vrei să refaci, folosește RESET (teste) sau șterge places_saved_at din DB.");
            return;
        }

        const ok = window.confirm("Vrei să salvezi în DB locurile + MP Turneu (registrations.final_place / mp_turneu) și să recalculezi MP-urile jucătorilor?");
        if (!ok) return;

        setSavingPlaces(true);
        setPlacesSavedAt(null);

        try {
            for (let idx = 0; idx < overallRanking.length; idx++) {
                const p = overallRanking[idx] as any;

                const totalWins = (p.winsLower ?? 0) + (p.winsUpper ?? 0) + (p.koWins ?? 0);
                const isZv = totalWins === 0;

                // Dacă e ZV (zero victorii), NU salvăm mp_turneu (nu intră în media ultimelor 4)
                const koLabel =
                    isZv
                        ? "ZV"
                        : p.finalPlace === 1
                            ? "Campion"
                            : p.finalPlace === 2
                                ? "Finalist"
                                : p.finalPlace === 3
                                    ? "Semifinale"
                                    : p.koRound
                                        ? `Runda ${p.koRound}`
                                        : null;

                const { error } = await supabase
                    .from("registrations")
                    .update(
                        {
                            final_place: idx + 1,
                            ko_label: koLabel,
                            is_zv: isZv,
                            mp_turneu: isZv ? null : (p.mpTournament == null ? null : Math.round(p.mpTournament)),
                        } as any
                    )
                    .eq("tournament_id", tournamentId)
                    .eq("player_id", p.id);

                if (error) {
                    console.error("persistFinalPlaces error for", p?.id, error);
                    throw new Error(`Eroare salvare pentru ${p?.name ?? p?.id}: ${error.message}`);
                }
            }


            // Recalculează MP-ul fiecărui jucător ca medie a ultimelor 4 MP Turneu (registrations.mp_turneu)
            for (const p of overallRanking as any[]) {
                const { error: rpcErr } = await supabase.rpc("recalc_player_mp", { p_player_id: p.id });
                if (rpcErr) {
                    console.error("recalc_player_mp error for", p?.id, rpcErr);
                    throw new Error(`Eroare recalcul MP pentru ${p?.name ?? p?.id}: ${rpcErr.message}`);
                }
            }

            const { data: tu, error: tErr } = await supabase
                .from("tournaments")
                .update({ places_saved_at: new Date().toISOString() })
                .eq("id", tournamentId)
                .select("places_saved_at")
                .single();

            if (tErr) {
                console.error("places_saved_at update error", tErr);
                // nu blocăm — locurile sunt deja salvate; doar nu am putut seta lock-ul
                setPlacesSavedAt(new Date().toLocaleString("ro-RO"));
            } else {
                const psa = (tu as any)?.places_saved_at as string | null | undefined;
                if (psa) {
                    setPlacesSavedAtRaw(psa);
                    setPlacesSavedAt(new Date(psa).toLocaleString("ro-RO"));
                } else {
                    setPlacesSavedAt(new Date().toLocaleString("ro-RO"));
                }
            }

            alert("✅ Locurile și MP Turneu au fost salvate în DB, iar MP-urile jucătorilor au fost recalculate (media ultimelor 4 turnee).");
        } catch (e: any) {
            alert(e?.message ?? "Eroare salvare locuri.");
        } finally {
            setSavingPlaces(false);
        }
    }



    const isGroupsKo = format === "GROUPS_KO" || forceGroupsKo;

    useEffect(() => {
        load().then(() => {
            const saved = localStorage.getItem(
                `showRanking_${tournamentId}`
            );
            if (saved === "true") {
                setShowFinalRanking(true);
            }
        });
    }, [tournamentId]);

    if (loading) return <main style={{ padding: 24 }}>Se încarcă...</main>;
    if (!isAdmin) return <main style={{ padding: 24 }}>Acces interzis.</main>;

    return (
        <main className="min-h-screen">
            <div className="mx-auto max-w-6xl px-4 py-6">
                {/* Top bar – Rankedin style */}
                <div className="ps-card mb-6 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <Link href="/" className="ps-btn ps-btn-outline text-sm">Înapoi</Link>
                            <div>
                                <div className="text-xl font-extrabold leading-tight">Administrare turneu</div>
                                <div className="text-sm" style={{ color: "var(--ps-muted)" }}>
                                    Gestionează înscrieri, grupe, KO și clasamentul final
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="px-3 py-1 rounded-full text-xs font-extrabold"
                                style={{ border: "1px solid var(--ps-border)", color: "var(--ps-primary)", background: "rgba(47,63,115,0.06)" }}>
                                Admin
                            </div>
                        </div>
                    </div>
                </div>

                <style jsx global>{`
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .print-sheet {
                        page-break-after: always;
                    }
                    @page {
                        margin: 12mm;
                    }
                }
                @media screen {
                    .print-only {
                        display: none;
                    }
                }
            `}</style>

                {/* PRINT-ONLY (foi pentru mese) */}
                <div className="print-only">
                    {printTarget ? (
                        (() => {
                            const lowerSheets = () => {
                                const pick = (gid: string) => {
                                    const g = groupsLower.find((x) => x.id === gid);
                                    if (!g) return null;
                                    const ms = matchesLower
                                        .filter((m) => m.group_id === gid && m.player1_id && m.player2_id)
                                        .sort((a, b) => (a.round ?? 1) - (b.round ?? 1))
                                        .map((m) => ({ p1: m.p1?.full_name ?? "—", p2: m.p2?.full_name ?? "—" }));
                                    return <PrintGroupSheet key={gid} groupName={g.name} matches={ms} />;
                                };
                                if (printTarget.kind === "LOWER_ONE") return pick(printTarget.groupId);
                                return groupsLower.map((g) => pick(g.id));
                            };

                            const upperSheets = () => {
                                const pick = (gid: string) => {
                                    const g = groupsUpper.find((x) => x.id === gid);
                                    if (!g) return null;
                                    const ms = matchesUpper
                                        .filter((m) => m.group_id === gid && m.player1_id && m.player2_id)
                                        .sort((a, b) => (a.round ?? 1) - (b.round ?? 1))
                                        .map((m) => ({ p1: m.p1?.full_name ?? "—", p2: m.p2?.full_name ?? "—" }));
                                    return <PrintGroupSheet key={gid} groupName={g.name} matches={ms} />;
                                };
                                if (printTarget.kind === "UPPER_ONE") return pick(printTarget.groupId);
                                return groupsUpper.map((g) => pick(g.id));
                            };

                            const koSheets = () => {
                                const totalPlayers = nextPow2((matchesKO.filter((m) => (m.round ?? 1) === 1).length || 1) * 2);
                                const renderRound = (r: number) => {
                                    const ms = (matchesKOByRound.map[r] ?? [])
                                        .filter((m) => m.player1_id && m.player2_id)
                                        .map((m) => ({ p1: m.p1?.full_name ?? "—", p2: m.p2?.full_name ?? "—" }));
                                    return <PrintKORoundSheet key={r} roundName={roundLabel(r, totalPlayers)} matches={ms} />;
                                };
                                if (printTarget.kind === "KO_ROUND") return renderRound(printTarget.round);
                                return matchesKOByRound.rounds.map((r) => renderRound(r));
                            };

                            if (printTarget.kind === "LOWER_ALL" || printTarget.kind === "LOWER_ONE") return lowerSheets();
                            if (printTarget.kind === "UPPER_ALL" || printTarget.kind === "UPPER_ONE") return upperSheets();
                            if (printTarget.kind === "KO_ALL" || printTarget.kind === "KO_ROUND") return koSheets();
                            return null;
                        })()
                    ) : null}
                </div>

                <div className="no-print">
                    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{title || "Turneu"}</h1>
                            <div style={{ opacity: 0.8, fontSize: 13, }}>
                                Format: {format === "LOWER_UPPER_KO" ? "Inferioare → Superioare → KO" : "Grupe → KO direct"}{forceGroupsKo ? " (fallback: Grupe → KO direct pentru 3–9 jucători)" : ""} • Grupe: {groupsLower.length} • Superioare:{" "}
                                {groupsUpper.length} • KO: {matchesKO.length} meciuri
                            </div>
                        </div>
                    </header>

                    {/* CONTROALE (secondary) */}
                    <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Status turneu:</span>

                                <select value={tournamentStatus} onChange={(e) => setTournamentStatusSafe(e.target.value as any)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", color: "#111" }}>
                                    <option value="UPCOMING">Urmează</option>
                                    <option value="LIVE">În desfășurare</option>
                                    <option value="FINISHED">Finalizat</option>
                                    <option value="CANCELLED">Anulat</option>
                                </select>
                            </div>

                            <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Înscrieri:</span>
                                <b>{registrationOpen ? "DESCHISE" : "ÎNCHISE"}</b>
                                {registrationOpen ? (
                                    <button onClick={closeRegistrations} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                                        Închide înscrieri
                                    </button>
                                ) : (
                                    <button onClick={openRegistrations} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                                        Redeschide înscrieri
                                    </button>
                                )}
                            </div>

                            <span style={{ flex: 1 }} />

                            <button onClick={() => setShowResetOptions((v) => !v)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", opacity: 0.9 }}>
                                {showResetOptions ? "Ascunde reset (teste)" : "Arată reset (teste)"}
                            </button>
                        </div>

                        {showResetOptions && (
                            <div style={{ marginTop: 12, border: "1px solid #f2c2c2", background: "#fff5f5", borderRadius: 12, padding: 12 }}>
                                <div style={{ fontWeight: 900, color: "#a40000" }}>⚠ Opțiuni RESET (doar teste/dev)</div>
                                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Protecție: confirm + cod tastat. Atenție, șterge date!</div>

                                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <button onClick={resetKOOnce} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #a40000", background: "white", color: "#a40000", fontWeight: 900 }}>
                                        Reset KO
                                    </button>

                                    {!isGroupsKo && (
                                        <button onClick={resetUpperOnce} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #a40000", background: "white", color: "#a40000", fontWeight: 900 }}>
                                            Reset Superioare
                                        </button>
                                    )}

                                    <button onClick={resetLowerOnce} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #a40000", background: "white", color: "#a40000", fontWeight: 900 }}>
                                        Reset {isGroupsKo ? "Grupe" : "Inferioare"}
                                    </button>

                                    <button onClick={resetAllTournamentDataOnce} style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid #a40000", background: "#a40000", color: "white", fontWeight: 900 }}>
                                        RESET TOTAL
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>



                    {/* ✅ PARTICIPANȚI + LOCURI LIBERE */}
                    <section style={{ marginTop: 14, border: "2px solid #eee", borderRadius: 12, padding: 12, background: "white", boxShadow: "0 3px 6px rgba(0,0,0,0.4)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Participanți</h2>

                            <div style={{ fontSize: 13, opacity: 0.85 }}>
                                Înscriși: <b>{registeredCount}</b>
                                {typeof maxPlayers === "number" ? (
                                    <>
                                        {" "}
                                        / <b>{maxPlayers}</b> · Locuri libere: <b>{spotsLeft ?? 0}</b>
                                    </>
                                ) : (
                                    <>
                                        {" "}
                                        · Locuri libere: <b>—</b>
                                    </>
                                )}
                            </div>
                        </div>

                        {participants.length === 0 ? (
                            <div style={{ marginTop: 10, opacity: 0.8 }}>Încă nu există participanți înscriși.</div>
                        ) : (
                            <div style={{ overflowX: "auto", marginTop: 10 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, }}>
                                    <thead>
                                        <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                                            <th style={{ padding: "8px 6px", width: 44 }}>#</th>
                                            <th style={{ padding: "8px 6px", width: 120 }}>Nume Prenume</th>
                                            <th style={{ padding: "8px 6px", width: 120 }}>Categorie</th>
                                            <th style={{ padding: "8px 6px", width: 180 }}>Absență</th>
                                            <th style={{ padding: "8px 6px", width: 90, textAlign: "right" }}>MP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {participants.map((p, idx) => (
                                            <tr key={p.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                                                <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
                                                <td style={{ padding: "8px 6px", fontWeight: 900 }}>{p.name}</td>
                                                <td style={{ padding: "8px 6px" }}>{catLabel(p.category)}</td>
                                                <td style={{ padding: "8px 6px" }}>
                                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                                        <button
                                                            onClick={() => markAbsence(p.id, "AM")}
                                                            title="Absență motivată (fără penalizare)"
                                                            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 1000, fontSize: 12 }}
                                                        >
                                                            AM
                                                        </button>
                                                        <button
                                                            onClick={() => markAbsence(p.id, "AN")}
                                                            title="Absență nemotivată (+2 puncte penalizare)"
                                                            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 1000, fontSize: 12 }}
                                                        >
                                                            AN
                                                        </button>

                                                        {p.absence ? (
                                                            <>
                                                                <span style={{ fontSize: 12, opacity: 0.85 }}>
                                                                    Marcat: <b>{p.absence}</b>
                                                                </span>
                                                                <button
                                                                    onClick={() => clearAbsence(p.id)}
                                                                    title="Demarchează absența (revine la neconfirmat)"
                                                                    style={{
                                                                        padding: "6px 10px",
                                                                        borderRadius: 10,
                                                                        border: "1px solid #ddd",
                                                                        fontWeight: 900,
                                                                        fontSize: 12,
                                                                        opacity: 0.9,
                                                                    }}
                                                                >
                                                                    ↩
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span style={{ fontSize: 12, opacity: 0.65 }}>—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "8px 6px", textAlign: "right" }}>{p.mp}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Sortare: descrescător după MP (la egalitate, alfabetic).</div>
                            </div>
                        )}
                    </section>

                    {/* ✅ CTA: 1-click */}
                    <section style={{ marginTop: 12, }}>
                        <button
                            onClick={generateLowerGroupsAndMatches}
                            disabled={participants.length < 3 || groupsLower.length > 0 || matchesLower.length > 0}
                            style={{
                                width: "100%",
                                padding: "14px 16px",
                                borderRadius: 12,
                                border: "0px solid #ddd",
                                boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
                                fontWeight: 1000,
                                fontSize: 14,
                                cursor: participants.length < 3 || groupsLower.length > 0 || matchesLower.length > 0 ? "not-allowed" : "pointer",
                                opacity: participants.length < 3 || groupsLower.length > 0 || matchesLower.length > 0 ? 0.6 : 1,
                                color: "#111",
                                background: "white",
                            }}
                        >
                            GENEREAZĂ GRUPE ȘI MECIURI (GRUPE)
                        </button>

                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                            Reguli: grupe de 4–6 când se poate; altfel „Liga (fiecare cu fiecare)”. Distribuire echilibrată (seeding după MP).
                        </div>
                    </section>



                    {/* GRUPE (LOWER_GROUP) */}
                    <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white", boxShadow: "0 3px 6px rgba(0,0,0,0.4)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>{isGroupsKo ? "Grupe" : "Grupe inferioare"}</h2>

                            {groupsLower.length > 0 && matchesLower.length > 0 ? (
                                <button
                                    onClick={() => doPrint({ kind: "LOWER_ALL" })}
                                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                                >
                                    🖨️ Print toate grupele
                                </button>
                            ) : null}
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
                                        <div key={g.id} className="ps-card p-4">
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                                                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                                    <div style={{ fontWeight: 900, fontSize: 15 }}>{g.name}</div>
                                                    {groupMatches.length > 0 ? (
                                                        <button
                                                            onClick={() => doPrint({ kind: "LOWER_ONE", groupId: g.id })}
                                                            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 12, fontWeight: 900 }}
                                                        >
                                                            🖨️ Print foaie
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        onClick={() => recomputeAndPersistGroupStandings("LOWER_GROUP", g.id, matchesLower)}
                                                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 12 }}
                                                        disabled={groupMatches.length === 0}
                                                        title="Recalculează clasamentul doar pentru această grupă"
                                                    >
                                                        Recalculează grupa
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                                    Calificați: <b>Top 4</b> · Runde: <b>{maxRound}</b>
                                                </div>
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
                                                                <tr key={m.player_id} style={undefined}>
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

                                            {/* Meciuri - în interiorul grupei */}
                                            {groupMatches.length > 0 && (
                                                <div style={{ marginTop: 12 }}>
                                                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Meciuri (ordine pe runde)</div>

                                                    {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                                                        const roundMatches = groupMatches.filter((m) => (m.round ?? 1) === r);
                                                        return (
                                                            <div key={r} style={{ marginTop: 10 }}>
                                                                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>Runda {r}</div>
                                                                <div style={{ display: "grid", gap: 8, marginTop: 6, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", justifyItems: "stretch", width: "100%", justifyContent: "stretch" }}>
                                                                    {roundMatches.map((m) => (
                                                                        <div key={m.id} className="ps-card p-4">
                                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                                                                <div style={{ fontSize: 14 }}>
                                                                                    <b>{m.p1?.full_name ?? "P1"}</b> vs <b>{m.p2?.full_name ?? (m.player2_id ? "P2" : "BYE")}</b>

                                                                                </div>

                                                                                {m.player1_id && (
                                                                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                                                        {m.player2_id ? (
                                                                                            <>
                                                                                                <input
                                                                                                    type="number"
                                                                                                    inputMode="numeric"
                                                                                                    min={0}
                                                                                                    value={getDraftAB(m.id, m.score).a}
                                                                                                    onChange={(e) => setDraftA(m.id, e.target.value)}
                                                                                                    placeholder="0"
                                                                                                    style={{ padding: "6px 6px", borderRadius: 8, border: "1px solid #ddd", width: 44, textAlign: "center" }}
                                                                                                />
                                                                                                <span style={{ opacity: 0.7 }}>-</span>
                                                                                                <input
                                                                                                    type="number"
                                                                                                    inputMode="numeric"
                                                                                                    min={0}
                                                                                                    value={getDraftAB(m.id, m.score).b}
                                                                                                    onChange={(e) => setDraftB(m.id, e.target.value)}
                                                                                                    placeholder="0"
                                                                                                    style={{ padding: "6px 6px", borderRadius: 8, border: "1px solid #ddd", width: 44, textAlign: "center" }}
                                                                                                />
                                                                                            </>
                                                                                        ) : (
                                                                                            <span style={{ fontSize: 12, opacity: 0.8 }}>BYE</span>
                                                                                        )}

                                                                                        <button onClick={() => saveScoreFromDraft(m)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
                                                                                            Save
                                                                                        </button>
                                                                                    </div>
                                                                                )}
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
                        <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white", boxShadow: "0 3px 6px rgba(0,0,0,0.4)" }}>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Grupe superioare</h2>

                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    {groupsUpper.length > 0 && matchesUpper.length > 0 ? (
                                        <button onClick={() => doPrint({ kind: "UPPER_ALL" })} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}>
                                            🖨️ Print toate superioarele
                                        </button>
                                    ) : null}
                                    <button onClick={generateUpperGroupsFromLowerTop4} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                                        Generează Grupe Superioare (Top 4)
                                    </button>

                                    <button onClick={() => generateGroupMatchesWithRounds("UPPER_GROUP", groupsUpper, matchesUpper.length)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                                        Generează meciuri (superioare)
                                    </button>

                                    <button onClick={() => computeStandingsForStage("UPPER_GROUP", groupsUpper, matchesUpper)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                                        Calculează clasament (superioare)
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                {groupsUpper.length === 0 ? (
                                    <div style={{ opacity: 0.8 }}>Nu există grupe superioare încă.</div>
                                ) : (
                                    groupsUpper.map((g) => (
                                        <div key={g.id} className="ps-card p-4">
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                                                <div style={{ fontWeight: 900 }}>{g.name}</div>
                                                {matchesUpper.some((m) => m.group_id === g.id && m.player1_id && m.player2_id) ? (
                                                    <button onClick={() => doPrint({ kind: "UPPER_ONE", groupId: g.id })} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 12, fontWeight: 900 }}>
                                                        🖨️ Print foaie
                                                    </button>
                                                ) : null}
                                            </div>
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
                                                                <tr key={m.player_id} style={undefined}>
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

                                            {/* Meciuri - în interiorul grupei (superioare) */}
                                            {(() => {
                                                const groupMatches = matchesUpper
                                                    .filter((m) => m.group_id === g.id)
                                                    .sort((a, b) => (a.round ?? 1) - (b.round ?? 1));

                                                const maxRound = groupMatches.reduce((acc, m) => Math.max(acc, m.round ?? 1), 1);

                                                if (groupMatches.length === 0) return null;

                                                return (
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
                                                                            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                                                                            justifyItems: "stretch",
                                                                            width: "100%",
                                                                            justifyContent: "stretch",
                                                                        }}
                                                                    >
                                                                        {roundMatches.map((m) => (
                                                                            <div key={m.id} className="ps-card p-4">
                                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                                                                    <div style={{ fontSize: 14 }}>
                                                                                        <b>{m.p1?.full_name ?? "P1"}</b> vs{" "}
                                                                                        <b>{m.p2?.full_name ?? (m.player2_id ? "P2" : "BYE")}</b>
                                                                                    </div>

                                                                                    {m.player1_id && (
                                                                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                                                            {m.player2_id ? (
                                                                                                <>
                                                                                                    <input
                                                                                                        type="number"
                                                                                                        inputMode="numeric"
                                                                                                        min={0}
                                                                                                        value={getDraftAB(m.id, m.score).a}
         