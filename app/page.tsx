"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Image from "next/image";
import WhatsAppInvite from "../components/WhatsAppInvite";
import WhatsAppButton from "../components/WhatsAppButton";

type TournamentCategory = "HOBBY" | "ADVANCED" | "ELITE" | "ALL";

type Tournament = {
    id: string;
    title: string;
    location: string | null;
    start_at: string;
    format: "LOWER_UPPER_KO" | "GROUPS_KO" | string;
    status: string;
    registration_open?: boolean;
    max_players?: number | null;

    // noi
    is_rated?: boolean;
    allowed_categories?: TournamentCategory[] | null;

    // donație minimă recomandată (text)
    donation_recommended?: string | null;
    donation_min?: string | null;
    donation?: string | null;

    // opțional (le calculăm dacă putem)
    registered_count?: number;
    spots_left?: number | null;
    is_full?: boolean;
};

type MyReg = {
    tournament_id: string;
    status: "REGISTERED" | "WITHDRAWN" | "PRESENT" | "ABSENT_UNEXCUSED" | "ABSENT_EXCUSED";
};

function catLabel(c: TournamentCategory) {
    if (c === "ALL") return "ALL";
    if (c === "HOBBY") return "Hobby";
    if (c === "ADVANCED") return "Avansați";
    return "Elite";
}

function playerCategory(mpMax: number): Exclude<TournamentCategory, "ALL"> {
    if (mpMax < 20) return "HOBBY";
    if (mpMax < 40) return "ADVANCED";
    return "ELITE";
}

function toLocalRO24(iso: string) {
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

export default function HomePage() {
    const router = useRouter();

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    // Admin gating (UI only). Access should still be enforced in /admin routes and via RLS.
    // We read this from players.is_admin.
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    const [userMp, setUserMp] = useState<number>(2);
    const [userMpMax, setUserMpMax] = useState<number>(2);

    // ✅ Fix #2 + #3: Amatur
    const [userAmaturMp, setUserAmaturMp] = useState<number | null>(null);
    const [hasAmatur, setHasAmatur] = useState<boolean>(false);

    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [myRegistrations, setMyRegistrations] = useState<Record<string, MyReg>>({});

    const [loading, setLoading] = useState(true);
    const loadingRef = useRef(false);

    async function load() {
        if (loadingRef.current) return;
        loadingRef.current = true;

        setLoading(true);

        try {
            // 1) user curent
            const { data: authData, error: authErr } = await supabase.auth.getUser();
            if (authErr) {
                console.error("auth.getUser error:", {
                    message: (authErr as any)?.message,
                    details: (authErr as any)?.details,
                    hint: (authErr as any)?.hint,
                    code: (authErr as any)?.code,
                    status: (authErr as any)?.status,
                });
            }

            const uid = authData?.user?.id ?? null;
            const email = authData?.user?.email ?? null;

            setUserId(uid);
            setUserEmail(email);

            // We'll compute isAdmin from players.is_admin once we fetch the player row.
            setIsAdmin(false);

            // fallback nume din metadata (instant)
            const meta = authData?.user?.user_metadata ?? {};
            const metaDisplay =
                (meta.display_name as string | undefined)?.trim() ||
                [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() ||
                null;
            setUserName(metaDisplay);

            // 2) players: nume + mp/mp_max + amatur_mp
            if (uid) {
                const { data: p, error: pErr } = await supabase
                    .from("players")
                    // ✅ includem amatur_mp + is_admin
                    .select("display_name, full_name, first_name, last_name, mp, mp_max, amatur_mp, is_admin")
                    .eq("id", uid)
                    .maybeSingle();

                if (pErr) {
                    console.error("players error:", {
                        message: (pErr as any)?.message,
                        details: (pErr as any)?.details,
                        hint: (pErr as any)?.hint,
                        code: (pErr as any)?.code,
                        status: (pErr as any)?.status,
                    });
                } else if (p) {
                    // ✅ Admin gating from DB
                    setIsAdmin(!!(p as any).is_admin);

                    const fromFirstLast = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();

                    const candidate =
                        (p.display_name ?? "").trim() ||
                        fromFirstLast ||
                        ((p.full_name ?? "").includes("@") ? "" : (p.full_name ?? "").trim()) ||
                        metaDisplay ||
                        null;

                    setUserName(candidate);

                    const mp = typeof (p as any).mp === "number" ? (p as any).mp : 2;
                    const mpMax = typeof (p as any).mp_max === "number" ? (p as any).mp_max : mp;

                    setUserMp(mp);
                    setUserMpMax(mpMax);

                    const aMp = typeof (p as any).amatur_mp === "number" ? ((p as any).amatur_mp as number) : null;
                    setUserAmaturMp(aMp);
                    setHasAmatur(typeof aMp === "number" && aMp > 0);
                } else {
                    setUserMp(2);
                    setUserMpMax(2);
                    setUserAmaturMp(null);
                    setHasAmatur(false);
                    setIsAdmin(false);
                }
            } else {
                setUserName(null);
                setUserMp(2);
                setUserMpMax(2);
                setUserAmaturMp(null);
                setHasAmatur(false);
                setIsAdmin(false);
            }

            // 3) turnee: direct din tournaments (stabil)
            const { data: tDataRaw, error: tErr } = await supabase
                .from("tournaments")
                .select("*")
                .in("status", ["UPCOMING", "LIVE"])
                .order("start_at", { ascending: true });

            if (tErr) {
                console.error("Home: tournaments error:", {
                    message: (tErr as any)?.message,
                    details: (tErr as any)?.details,
                    hint: (tErr as any)?.hint,
                    code: (tErr as any)?.code,
                    status: (tErr as any)?.status,
                });
                setTournaments([]);
            } else {
                const tData = (tDataRaw ?? []) as any[];

                // ✅ Fix #1: normalizează categoriile (și acceptă ALL)
                const normalizeAllowed = (x: any): TournamentCategory[] => {
                    if (Array.isArray(x) && x.length > 0) return x as TournamentCategory[];
                    return ["ALL"]; // default: oricine
                };

                const normalized: Tournament[] = tData.map((t) => ({
                    ...t,
                    is_rated: typeof t.is_rated === "boolean" ? t.is_rated : true,
                    allowed_categories: normalizeAllowed(t.allowed_categories),
                }));

                setTournaments(normalized);

                // 3b) opțional: calculează registered_count/is_full/spots_left (dacă ai permisiuni)
                try {
                    const ids = normalized.map((x) => x.id);
                    if (ids.length > 0) {
                        const { data: regAll, error: regAllErr } = await supabase
                            .from("registrations")
                            .select("tournament_id,status")
                            .in("tournament_id", ids);

                        if (!regAllErr && regAll) {
                            const cnt = new Map<string, number>();
                            for (const r of regAll as any[]) {
                                if (r.status === "REGISTERED") {
                                    cnt.set(r.tournament_id, (cnt.get(r.tournament_id) ?? 0) + 1);
                                }
                            }

                            setTournaments((prev) =>
                                prev.map((t) => {
                                    const c = cnt.get(t.id) ?? 0;
                                    const isFull = typeof t.max_players === "number" ? c >= t.max_players : false;
                                    const spotsLeft = typeof t.max_players === "number" ? t.max_players - c : null;
                                    return {
                                        ...t,
                                        registered_count: c,
                                        is_full: isFull,
                                        spots_left: spotsLeft,
                                    };
                                })
                            );
                        }
                    }
                } catch (e) {
                    console.warn("Optional registrations aggregate skipped:", e);
                }
            }

            // 4) registrations ale mele (ca să știu dacă sunt înscris)
            if (uid) {
                const { data: rData, error: rErr } = await supabase
                    .from("registrations")
                    .select("tournament_id,status")
                    .eq("player_id", uid);

                if (rErr) {
                    console.error("my registrations error:", {
                        message: (rErr as any)?.message,
                        details: (rErr as any)?.details,
                        hint: (rErr as any)?.hint,
                        code: (rErr as any)?.code,
                        status: (rErr as any)?.status,
                    });
                }

                const map: Record<string, any> = {};
                (rData ?? []).forEach((r: any) => (map[r.tournament_id] = r));
                setMyRegistrations(map);
            } else {
                setMyRegistrations({});
            }
        } catch (e) {
            console.error("load() crashed:", e);
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }

    async function logout() {
        await supabase.auth.signOut();

        // curățare imediată UI
        setUserId(null);
        setUserEmail(null);
        setUserName(null);
        setUserMp(2);
        setUserMpMax(2);
        setUserAmaturMp(null);
        setHasAmatur(false);
        setMyRegistrations({});

        await load();
        router.refresh();
    }

    useEffect(() => {
        load();

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
                load();
            }
        });

        return () => {
            sub.subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function registerToTournament(t: Tournament) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
            router.push("/login?mode=login");
            return;
        }

        // eligibilitate pe MP_MAX + categorie turneu
        const myCat = playerCategory(userMpMax);
        const allowed = (t.allowed_categories ?? ["ALL"]) as TournamentCategory[];

        // dacă turneul e ALL -> acceptă pe oricine
        if (!allowed.includes("ALL") && !allowed.includes(myCat)) {
            alert(
                `Nu ești eligibil.\nCategoria ta: ${catLabel(myCat)} (MP Max: ${userMpMax})\nTurneul acceptă: ${allowed
                    .map(catLabel)
                    .join(", ")}`
            );
            return;
        }

        // dacă e full (doar dacă avem calcule)
        if (t.is_full) {
            alert("Turneul este full.");
            return;
        }

        // snapshot MP pentru istoric (îngheață MP-ul cu care te-ai înscris)
        // IMPORTANT: luăm MP-ul curent direct din DB (nu din state), ca să fie corect chiar dacă UI e în urmă.
        const { data: pNow, error: pNowErr } = await supabase
            .from("players")
            .select("mp")
            .eq("id", auth.user.id)
            .maybeSingle();

        if (pNowErr) {
            alert("Eroare citire MP (players): " + (pNowErr as any)?.message);
            return;
        }

        const mpBefore = typeof (pNow as any)?.mp === "number" ? ((pNow as any).mp as number) : 0;


        // Dacă există deja o înregistrare (ex: WITHDRAWN), o reactivăm în loc să inserăm una nouă
        const { data: existingReg, error: existingErr } = await supabase
            .from("registrations")
            .select("status, penalty_applied")
            .eq("tournament_id", t.id)
            .eq("player_id", auth.user.id)
            .maybeSingle();

        if (existingErr) {
            alert("Eroare verificare înscriere: " + (existingErr as any)?.message);
            return;
        }

        // deja înscris
        if (existingReg?.status === "REGISTERED") {
            alert("Ești deja înscris la acest turneu.");
            return;
        }

        if (existingReg?.status === "WITHDRAWN") {
            // Reînscriere: anulăm retragerea și (dacă a existat) penalizarea de retragere
            const prevPenalty = typeof (existingReg as any)?.penalty_applied === "number" ? ((existingReg as any).penalty_applied as number) : 0;

            const { error: upErr } = await supabase
                .from("registrations")
                .update({
                    status: "REGISTERED",
                    withdrawn_at: null,
                    withdraw_penalty: 0, // reset și câmpul folosit în Cont
                    penalty_applied: 0,
                    penalty_reason: null,
                    mp_before: mpBefore, // re-snapshot (util dacă s-a schimbat între timp)
                } as any)
                .eq("tournament_id", t.id)
                .eq("player_id", auth.user.id);

            if (upErr) {
                alert("Eroare reînscriere: " + (upErr as any)?.message);
                return;
            }

            if (prevPenalty > 0) {
                // Notăm anularea în jurnal și scădem punctele de penalizare la jucător
                await supabase.from("penalty_events").insert({
                    player_id: auth.user.id,
                    tournament_id: t.id,
                    points_delta: -prevPenalty,
                    reason: "Anulare penalizare (reînscriere după retragere)",
                });

                const { data: p, error: pErr } = await supabase
                    .from("players")
                    .select("penalty_points, banned_until")
                    .eq("id", auth.user.id)
                    .single();

                if (!pErr) {
                    const current = (p?.penalty_points ?? 0) as number;
                    const next = Math.max(0, current - prevPenalty);

                    await supabase
                        .from("players")
                        .update({
                            penalty_points: next,
                            banned_until: next === 0 ? null : (p as any)?.banned_until ?? null,
                        } as any)
                        .eq("id", auth.user.id);
                }
            }

            alert("Te-ai reînscris cu succes!");
            await load();
            setMyRegistrations((prev) => ({
                ...prev,
                [t.id]: { tournament_id: t.id, status: "REGISTERED" },
            }));
            return;
        }

        // Caz normal: nu există înregistrare -> insert
        const { error } = await supabase.from("registrations").insert({
            tournament_id: t.id,
            player_id: auth.user.id,
            status: "REGISTERED",
            mp_before: mpBefore, // ✅ snapshot pentru istoric
        } as any);

        if (error) {
            alert("Eroare înscriere: " + (error as any)?.message);
        } else {
            alert("Înscris cu succes!");
            await load();
            setMyRegistrations((prev) => ({
                ...prev,
                [t.id]: { tournament_id: t.id, status: "REGISTERED" },
            }));
        }
    }

    async function withdrawFromTournament(t: Tournament) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;

        const start = new Date(t.start_at).getTime();
        const now = Date.now();
        const hoursLeft = (start - now) / (1000 * 60 * 60);

        let penalty = 0;
        let reason = "Retragere >=48h (0 puncte)";

        if (hoursLeft < 48 && hoursLeft >= 24) {
            penalty = 1;
            reason = "Retragere între 24–48h (+1 punct)";
        } else if (hoursLeft < 24) {
            penalty = 2;
            reason = "Retragere sub 24h (+2 puncte)";
        }

        const { error: regErr } = await supabase
            .from("registrations")
            .update({
                status: "WITHDRAWN",
                withdrawn_at: new Date().toISOString(),
                withdraw_penalty: penalty, // important: folosit pe pagina Cont pentru total penalizări
                penalty_applied: penalty,
                penalty_reason: reason,
            } as any)
            .eq("tournament_id", t.id)
            .eq("player_id", auth.user.id);

        if (regErr) {
            alert("Eroare retragere: " + (regErr as any)?.message);
            return;
        }

        // penalizări (dacă ai tabelele)
        if (penalty > 0) {
            await supabase.from("penalty_events").insert({
                player_id: auth.user.id,
                tournament_id: t.id,
                points_delta: penalty,
                reason,
            });

            const { data: p, error: pErr } = await supabase
                .from("players")
                .select("penalty_points")
                .eq("id", auth.user.id)
                .single();

            if (!pErr) {
                const current = (p?.penalty_points ?? 0) as number;
                const next = current + penalty;

                const bannedUntilIso = next >= 4 ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() : null;

                await supabase
                    .from("players")
                    .update({
                        penalty_points: next >= 4 ? 0 : next,
                        banned_until: bannedUntilIso,
                    })
                    .eq("id", auth.user.id);
            }
        }

        alert("Te-ai retras. " + reason);
        await load();

        setMyRegistrations((prev) => ({
            ...prev,
            [t.id]: { tournament_id: t.id, status: "WITHDRAWN" },
        }));
    }

    function prettyStatus(s: string | null | undefined) {
        switch ((s ?? "").toUpperCase()) {
            case "UPCOMING":
                return "Urmează";
            case "LIVE":
                return "În desfășurare";
            case "FINISHED":
                return "Finalizat";
            case "CANCELLED":
                return "Anulat";
            default:
                return s ?? "—";
        }
    }



    function buildWhatsappAnnouncement(t: any) {
        const title = t?.title ?? "Turneu nou";
        const when = t?.start_at ? new Date(t.start_at).toLocaleString("ro-RO") : "—";
        const location = t?.location ?? "—";
        const format = t?.format ?? "—";
        const type = t?.is_rated ? "Punctat" : "Agrement";

        const cats =
            Array.isArray(t?.allowed_categories) && t.allowed_categories.length
                ? t.allowed_categories.map((c: any) => catLabel(c)).join(", ")
                : catLabel("ALL" as any);

        const donation = ((t as any).donation_info ?? "").toString().trim() || "Gratuit";

        const regOpen =
            typeof t?.registration_open === "boolean" ? (t.registration_open ? "DESCHISE" : "ÎNCHISE") : "—";

        const registered = typeof t?.registered_count === "number" ? t.registered_count : 0;
        const max = typeof t?.max_players === "number" ? t.max_players : null;
        const spotsLeft =
            typeof t?.spots_left === "number"
                ? t.spots_left
                : typeof max === "number"
                    ? Math.max(0, max - registered)
                    : null;

        const slotsLine =
            typeof max === "number"
                ? `${registered}/${max} (rămase ${spotsLeft ?? Math.max(0, max - registered)})`
                : `${registered} înscriși`;

        const publicUrl =
            typeof window !== "undefined" ? `${window.location.origin}/tournaments/${t.id}` : `/tournaments/${t.id}`;

        // Notă: folosim emoji-uri foarte comune (compatibile WhatsApp)
        return [
            `TURNEU NOU: ${title}`,
            ``,
            `Data: ${when}`,
            `Locație: ${location}`,
            `Tip: ${type}`,
            `Format: ${format}`,
            `Categorii: ${cats}`,
            `Donație minimă recomandată: ${donation}`,
            `Înscrieri: ${regOpen}`,
            `Locuri: ${slotsLine}`,
            ``,
            `Detalii & înscriere:`,
            publicUrl,
        ].join("\n");
    }

    async function announceOnWhatsApp(t: any) {
        const msg = buildWhatsappAnnouncement(t);

        // Copiem mesajul în clipboard (fallback util)
        try {
            await navigator.clipboard.writeText(msg);
        } catch { }

        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    const navItemStyle: CSSProperties = {
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


    return (
        <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            {/* LOGO sus, centrat */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <Image
                    src="/Logo_POLISPORT_TT_v2.png"
                    alt="PoliSport Table Tennis"
                    width={260 * 1.25}
                    height={80 * 1.25}
                    priority
                    style={{ height: "auto" }}
                />
            </div>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, }}>PoliSport Table Tennis</h1>
                    <p style={{ opacity: 0.8 }}>Manager Turnee & jucători @ UNSTPB</p>
                    <p style={{ opacity: 0.8 }}>
                        <Link
                            href="/info"
                            style={{
                                textDecoration: "none",
                                color: "inherit",
                                fontWeight: 500,
                            }}
                        >
                            ℹ️ Info utile & Regulament
                        </Link>
                    </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "center",
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                            maxWidth: 520,
                        }}
                    >
                        {userEmail ? (
                            <>
                                <Link
                                    href="/account"
                                    style={navItemStyle}
                                >
                                    Contul meu
                                </Link>

                                <button
                                    onClick={logout}
                                    style={{ ...navItemStyle, background: "transparent", cursor: "pointer" }}
                                >
                                    Logout
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/login?mode=login"
                                    style={navItemStyle}
                                >
                                    Login
                                </Link>

                                <Link
                                    href="/login?mode=register"
                                    style={navItemStyle}
                                >
                                    Register
                                </Link>
                            </>
                        )}

                        <Link
                            href="/tournaments"
                            style={navItemStyle}
                        >
                            Istoric Turnee
                        </Link>
                    </div>

                    {userEmail ? (
                        <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85, lineHeight: 1.35 }}>
                            <div>
                                Ești autentificat ca: <b>{userName ?? "Utilizator"}</b>{" "}
                                <span style={{ opacity: 0.85 }}>
                                    (MP: <b>{userMp}</b> · Max: <b>{userMpMax}</b>)
                                </span>
                            </div>

                            <div>
                                {userEmail}{" "}
                                {hasAmatur && typeof userAmaturMp === "number" ? (
                                    <span style={{ opacity: 0.9 }}>
                                        · Amatur MP: <b>{userAmaturMp}</b>
                                    </span>
                                ) : null}
                            </div>

                            <div style={{ opacity: 0.9 }}>
                                Cont Amatur: <b>{hasAmatur ? "Da" : "Nu"}</b>
                            </div>

                            <div style={{ opacity: 0.85 }}>
                                Categoria ta: <b>{catLabel(playerCategory(userMpMax))}</b>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: "right", fontSize: 12, opacity: 0.75 }}>
                            Nu ești autentificat.
                        </div>
                    )}
                </div>

            </header>

            <section style={{ marginTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Planificare Turnee</h2>

                    {isAdmin ? (
                        <Link href="/admin/tournaments/new" style={{ ...navItemStyle, fontSize: 14 }}>
                            + Creează Turneu
                        </Link>
                    ) : null}
                </div>

                {loading ? (
                    <p style={{ marginTop: 12 }}>Se încarcă...</p>
                ) : tournaments.length === 0 ? (
                    <p style={{ marginTop: 12, opacity: 0.8 }}>Nu există turnee încă.</p>
                ) : (
                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                        {tournaments.map((t) => {
                            const reg = myRegistrations[t.id];
                            const regOpen = !!t.registration_open;
                            const notFull = !(t.is_full ?? false);

                            // ✅ Fix #1: safe categories
                            const allowed = Array.isArray(t.allowed_categories) && t.allowed_categories.length > 0
                                ? (t.allowed_categories as TournamentCategory[])
                                : (["ALL"] as TournamentCategory[]);

                            const canShowJoin = userId && regOpen && notFull && (reg?.status ?? null) !== "REGISTERED";
                            const canShowWithdraw = userId && regOpen && reg?.status === "REGISTERED";

                            return (
                                <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                        <div>
                                            <div style={{ fontWeight: 800 }}>{t.title}</div>
                                            <div style={{ opacity: 0.8, fontSize: 14 }}>
                                                {/* ✅ 24h */}
                                                {toLocalRO24(t.start_at)} • {t.location ?? "—"}
                                            </div>

                                            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                                                <div>Tip: {t.is_rated ? "Punctat" : "Agrement"}</div>
                                                <div>Categorii: {allowed.map(catLabel).join(", ")}</div>
                                                <div>
                                                    Donație minimă recomandată:{" "}
                                                    <b>
                                                        {((t as any).donation_info ?? "").toString().trim() || "Gratuit"}

                                                    </b>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: "right", fontSize: 13, opacity: 0.85 }}>
                                            <div>
                                                Format:{" "}
                                                {t.format === "LOWER_UPPER_KO"
                                                    ? "Inferioare→Superioare→KO"
                                                    : t.format === "GROUPS_KO"
                                                        ? "Grupe→KO"
                                                        : t.format}
                                            </div>
                                            <div>Status: {prettyStatus(t.status)}</div>

                                            {typeof t.max_players === "number" && <div>Nr. max. jucători: {t.max_players}</div>}

                                            {typeof t.registered_count === "number" && (
                                                <div>
                                                    Înscriși: {t.registered_count}
                                                    {t.max_players != null ? ` / ${t.max_players}` : ""}
                                                </div>
                                            )}

                                            {typeof t.spots_left === "number" && <div>Locuri rămase: {t.spots_left}</div>}

                                            <div>{reg ? <span>Starea mea: {reg.status}</span> : <span>Starea mea: —</span>}</div>
                                        </div>
                                    </div>

                                    {!userId ? (
                                        <div style={{ marginTop: 10, opacity: 0.8 }}>Autentifică-te ca să te înscrii.</div>
                                    ) : (
                                        <>
                                            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                                    {canShowJoin && (
                                                        <button
                                                            onClick={() => registerToTournament(t)}
                                                            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                                                        >
                                                            Înscrie-mă
                                                        </button>
                                                    )}

                                                    {canShowWithdraw && (
                                                        <button
                                                            onClick={() => withdrawFromTournament(t)}
                                                            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                                                        >
                                                            Retrage-mă
                                                        </button>
                                                    )}

                                                    <Link
                                                        href={`/tournaments/${t.id}`}
                                                        style={{
                                                            padding: "8px 12px",
                                                            borderRadius: 10,
                                                            border: "1px solid #ddd",
                                                            textDecoration: "none",
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                        }}
                                                    >
                                                        Vezi turneu
                                                    </Link>

                                                </div>

                                                {isAdmin ? (
                                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                                        <Link
                                                            href={`/admin/tournaments/${t.id}`}
                                                            style={{ fontSize: 13, opacity: 0.85, textDecoration: "none" }}
                                                        >
                                                            Admin turneu
                                                        </Link>

                                                        <button
                                                            onClick={() => announceOnWhatsApp(t)}
                                                            style={{
                                                                padding: "8px 12px",
                                                                borderRadius: 10,
                                                                border: "1px solid #25D366",
                                                                color: "#25D366",
                                                                background: "transparent",
                                                                fontWeight: 900,
                                                                cursor: "pointer",
                                                            }}
                                                            title="Deschide WhatsApp cu anunțul precompletat (mesajul se copiază și în clipboard)"
                                                        >
                                                            Anunță pe WhatsApp
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
                <div style={{ display: "inline-flex" }}>
                    <WhatsAppButton />
                </div>
          
            </div>
            <footer style={{ marginTop: 28, opacity: 0.85, fontSize: 13, textAlign: "center" }}>
                Creat de{" "}
                <span style={{ color: "#f5d000", fontWeight: 600 }}>
                    Cristoiu Cozmin-Adrian
                </span>{" "}
                @ FIIR pentru comunitatea pasionaților de tenis de masă din
                <span style={{ color: "#4169E1", fontWeight: 600 }}>
                    {" "} UNSTPB
                </span>{" "}

            </footer>

        </main>
    );
}
