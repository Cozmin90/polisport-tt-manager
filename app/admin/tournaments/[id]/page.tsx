"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";

type TournamentFormat = "LOWER_UPPER_KO" | "GROUPS_KO";

// Categoria jucătorului (din MP Max)
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
    // H = Hobby, A = Avansați, E = Elite
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
    const [participants, setParticipants] = useState<{ id: string; name: string; mp: number; mpMax: number; category: PlayerCat }[]>([]);

    const registered = useMemo(() => rows.filter((r) => r.status === "REGISTERED"), [rows]);

    const registeredCount = registered.length;
    // Pentru formatul "Inferioare → Superioare → KO": dacă sunt 3–9 jucători,
    // nu se pot face grupe superioare (nu sunt suficienți calificați). În acest caz,
    // rulăm identic cu modul "Grupe → KO direct" (folosim doar grupele inferioare).
    const forceGroupsKo = format === "LOWER_UPPER_KO" && registeredCount >= 3 && registeredCount <= 9;


    // Participanți derivați din rows (și sortați)
    useEffect(() => {
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
                return a.name.localeCompare(b.name); // la egalitate: alfabetic
            });

        setParticipants(list);
    }, [registered]);

    const participantCount = participants.length;
    const spotsLeft = typeof maxPlayers === "number" ? Math.max(0, maxPlayers - participantCount) : null;

    async function setTournamentStatusSafe(next: "UPCOMING" | "LIVE" | "FINISHED" | "CANCELLED") {
        const { error } = await supabase.from("tournaments").update({ status: next }).eq("id", tournamentId);
        if (error) return alert("Eroare status: " + error.message);

        setTournamentStatus(next);
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

        const { data: t } = await supabase.from("tournaments").select("title,format,status,registration_open,max_players").eq("id", tournamentId).single();

        setTitle(t?.title ?? "");
        setFormat((t?.format as TournamentFormat) ?? "LOWER_UPPER_KO");
        setTournamentStatus(t?.status ?? "UPCOMING");
        setRegistrationOpen(!!t?.registration_open);
        setMaxPlayers(typeof t?.max_players === "number" ? t.max_players : null);

        const { data: regs } = await supabase
            .from("registrations")
            .select(
                `
        player_id,status,withdrawn_at,penalty_applied,penalty_reason,
        players:player_id(full_name,display_name,first_name,last_name,mp,mp_max,penalty_points,banned_until)
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
        const N = participants.length;

        if (N < 3) return alert("Ai nevoie de minim 3 participanți REGISTERED.");
        if (groupsLower.length > 0 || matchesLower.length > 0) return
        // încearcă grupe 4–6
        const G = chooseGroupCount(N, 4, 6, 5);

        // seed list: descrescător MP (deja e sortat)
        const seedIds = participants.map((p) => p.id);

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
        const base = participants.map((p) => ({
            id: p.id,
            name: p.name,

            // MP la înscriere (folosit la calc MP sector)
            mpReg: p.mp,

            // Categoria jucătorului (H/A/E)
            cat: p.category,

            // victorii în grupe
            winsLower: 0,
            winsUpper: 0,

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

        // victorii + grupă/rank (prefer UPPER dacă există)
        const upperByPlayer = new Map<string, { groupName: string; rank: number | null; wins: number }>();
        for (const g of groupsUpper) {
            for (const m of g.members) upperByPlayer.set(m.player_id, { groupName: g.name, rank: m.rank_in_group ?? null, wins: m.wins ?? 0 });
        }

        const lowerByPlayer = new Map<string, { groupName: string; rank: number | null; wins: number }>();
        for (const g of groupsLower) {
            for (const m of g.members) lowerByPlayer.set(m.player_id, { groupName: g.name, rank: m.rank_in_group ?? null, wins: m.wins ?? 0 });
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

        // sortarea finală (same as înainte)
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

        // Calcul MP Turneu:
        // - sector = blocuri de 4 în clasamentul final (1-4, 5-8, ...)
        // - mpSector = media MP la înscriere a celor din bloc (MP din lista de înscriere)
        // - bonus: #1 +6, #2 +4, #3/#4 +2
        // - mpTournament = mpSector + bonus
        // MP sector pe blocuri de 4 din LISTA DE ÎNSCRIERE (nu din clasamentul final)
        const regSorted = [...participants].sort((a, b) => {
            if (b.mp !== a.mp) return b.mp - a.mp;
            return a.name.localeCompare(b.name);
        });

        const regMeans: number[] = [];
        for (let i = 0; i < regSorted.length; i += 4) {
            const blk = regSorted.slice(i, i + 4);
            const mean = blk.length
                ? blk.reduce((acc, p) => acc + (Number.isFinite(p.mp) ? p.mp : 0), 0) / blk.length
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

                const bonus = pos === 1 ? 6 : pos === 2 ? 4 : pos === 3 ? 2 : (hasKO && pos === 4 ? 2 : 0);

                const mpTournament = mpSector + bonus;

                block[j].mpTournament = mpTournament;
                block[j].mpBonus = bonus;
            }
        }
        return sorted;
    }, [participants, matchesKO, podium, groupsUpper, groupsLower]);


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
        <main style={{ maxWidth: 1150, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800 }}>Admin • {title || "Turneu"}</h1>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                        Format: {format === "LOWER_UPPER_KO" ? "Inferioare → Superioare → KO" : "Grupe → KO direct"}{forceGroupsKo ? " (fallback: Grupe → KO direct pentru 3–9 jucători)" : ""} • Grupe: {groupsLower.length} • Superioare:{" "}
                        {groupsUpper.length} • KO: {matchesKO.length} meciuri
                    </div>
                </div>
                <Link href="/">← Înapoi</Link>
            </header>

            {/* CONTROALE (secondary) */}
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>Status turneu:</span>

                        <select value={tournamentStatus} onChange={(e) => setTournamentStatusSafe(e.target.value as any)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", color: "#111" }}>
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
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
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
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                            <thead>
                                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                                    <th style={{ padding: "8px 6px", width: 44 }}>#</th>
                                    <th style={{ padding: "8px 6px" }}>Nume Prenume</th>
                                    <th style={{ padding: "8px 6px", width: 120 }}>Categorie</th>
                                    <th style={{ padding: "8px 6px", width: 90, textAlign: "right" }}>MP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map((p, idx) => (
                                    <tr key={p.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                                        <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
                                        <td style={{ padding: "8px 6px", fontWeight: 900 }}>{p.name}</td>
                                        <td style={{ padding: "8px 6px" }}>{catLabel(p.category)}</td>
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
            <section style={{ marginTop: 12 }}>
                <button
                    onClick={generateLowerGroupsAndMatches}
                    disabled={participants.length < 3 || groupsLower.length > 0 || matchesLower.length > 0}
                    style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
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
                                        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                            <div style={{ fontWeight: 900, fontSize: 15 }}>{g.name}</div>
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
                                                                <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
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
                                                                                            placeholder="3"
                                                                                            style={{ padding: "6px 6px", borderRadius: 8, border: "1px solid #ddd", width: 44, textAlign: "center" }}
                                                                                        />
                                                                                        <span style={{ opacity: 0.7 }}>-</span>
                                                                                        <input
                                                                                            type="number"
                                                                                            inputMode="numeric"
                                                                                            min={0}
                                                                                            value={getDraftAB(m.id, m.score).b}
                                                                                            onChange={(e) => setDraftB(m.id, e.target.value)}
                                                                                            placeholder="1"
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
                <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Grupe superioare</h2>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                                                                    <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
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
                                                                                                onChange={(e) => setDraftA(m.id, e.target.value)}
                                                                                                placeholder="3"
                                                                                                style={{ padding: 8, border: "1px solid #ddd", width: 44, textAlign: "center", borderRadius: 8 }}
                                                                                            />
                                                                                            <span style={{ opacity: 0.7 }}>-</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                inputMode="numeric"
                                                                                                min={0}
                                                                                                value={getDraftAB(m.id, m.score).b}
                                                                                                onChange={(e) => setDraftB(m.id, e.target.value)}
                                                                                                placeholder="1"
                                                                                                style={{ padding: 8, border: "1px solid #ddd", width: 44, textAlign: "center", borderRadius: 8 }}
                                                                                            />
                                                                                        </>
                                                                                    ) : (
                                                                                        <span style={{ fontSize: 12, opacity: 0.8 }}>BYE</span>
                                                                                    )}

                                                                                    <button
                                                                                        onClick={() => saveScoreFromDraft(m)}
                                                                                        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}
                                                                                    >
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
                                        );
                                    })()}
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* KO */}
            <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Tablou eliminatoriu (KO)</h2>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={generateKORound1} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                            {isGroupsKo ? "Generează Tablou KO (Top 4 grupe)" : "Generează Tablou KO (Top 2 superioare)"}
                        </button>

                        <button onClick={advanceKONextRound} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
                            Avansează KO (runda următoare)
                        </button>
                    </div>
                </div>

                {matchesKO.length === 0 ? (
                    <div style={{ marginTop: 10, opacity: 0.8 }}>Nu există KO încă. (Generează KO după clasament: {isGroupsKo ? "Top 4 din grupe" : "Top 2 din superioare"})</div>
                ) : (
                    <div style={{ marginTop: 10 }}>
                        {matchesKOByRound.rounds.map((r) => (
                            <div key={r} style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 900, marginBottom: 8 }}>{roundLabel(r, nextPow2((matchesKO.filter((m) => (m.round ?? 1) === 1).length || 1) * 2))}</div>

                                <div style={{ display: "grid", gap: 8, gridTemplateColumns: `repeat(${(r === maxKORound && (matchesKOByRound.map[r]?.length ?? 0) === 1) ? 1 : 2}, minmax(320px, 1fr))`, justifyItems: r === maxKORound ? "center" : "stretch" }}>
                                    {matchesKOByRound.map[r].map((m) => (
                                        <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, width: r === maxKORound ? "min(520px, 100%)" : "100%" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                                <div style={{ fontSize: 14 }}>
                                                    <b>{m.p1?.full_name ?? "—"}</b> <span style={{ opacity: 0.8 }}>vs</span>{" "}
                                                    <b>{m.p2?.full_name ?? (m.player2_id ? "—" : "BYE")}</b>

                                                    {m.winner_id ? <span style={{ marginLeft: 10, opacity: 0.85 }}>✅</span> : null}
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
                                                                    placeholder="3"
                                                                    style={{ padding: "6px 6px", borderRadius: 8, border: "1px solid #ddd", width: 44, textAlign: "center" }}
                                                                />
                                                                <span style={{ opacity: 0.7 }}>-</span>
                                                                <input
                                                                    type="number"
                                                                    inputMode="numeric"
                                                                    min={0}
                                                                    value={getDraftAB(m.id, m.score).b}
                                                                    onChange={(e) => setDraftB(m.id, e.target.value)}
                                                                    placeholder="1"
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

                                {r === matchesKOByRound.rounds[matchesKOByRound.rounds.length - 1] && champion && !showFinalRanking ? (
                                    <div style={{ marginTop: 12 }}>
                                        <button style={{ padding: "8pxCE 12px", borderRadius: 10, border: "1px solid #ddd" }}
                                            onClick={() => {
                                                localStorage.setItem(
                                                    `showRanking_${tournamentId}`,
                                                    "true"
                                                );
                                                setShowFinalRanking(true);
                                            }}
                                        >
                                            Generează clasament final
                                        </button>
                                    </div>
                                ) : null}

                            </div>
                        ))}

                        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>Folosește <b>Avansează KO</b> după ce ai completat toți câștigătorii rundei curente.</div>
                    </div>
                )}
            </section>


            {/* CLASAMENT TOTAL */}
            {showFinalRanking && champion ? (
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
                                        <th style={{ padding: "8px 6px", width: 60 }}>Categoria</th>
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

                                                <td style={{ padding: "8px 6px", fontWeight: 900 }}>
                                                    {p.name}
                                                </td>

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
                                                            {p.mpBonus > 0 ? (
                                                                <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.9 }}>(+{p.mpBonus})</span>
                                                            ) : null}
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
            ) : null}
        </main>
    );
}