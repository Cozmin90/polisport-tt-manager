"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
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

    // UI / reguli
    is_rated?: boolean;
    category?: TournamentCategory | null;
    allowed_categories?: TournamentCategory[] | null;

    donation_recommended?: string | null;
    donation_min?: string | null;
    donation?: string | null;

    // Campionatul UPB
    is_upb_championship?: boolean | null;
    championship_season?: string | null;
    championship_stage?: number | null;

    // calculate (optional)
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

function cardCategoryText(t: Tournament) {
    const cat = (t.category ?? "ALL") as TournamentCategory;
    if (cat === "ALL") return "ALL (Hobby, Avansați, Elite)";
    return catLabel(cat);
}

function prettyStatus(s: string) {
    const v = (s ?? "").toUpperCase();
    if (v === "UPCOMING") return "Urmează";
    if (v === "LIVE") return "În desfășurare";
    if (v === "FINISHED") return "Finalizat";
    if (v === "CANCELLED") return "Anulat";
    return s;
}

function normalizeUpbRole(role: string | null | undefined): "student" | "employee" | "other" | null {
    const v = (role ?? "").toString().trim().toLowerCase();
    if (!v) return null;

    if ([
        "student",
        "stud",
        "student upb",
        "studenti",
        "student master",
        "masterand",
        "doctorand",
        "phd",
    ].includes(v)) {
        return "student";
    }

    if ([
        "employee",
        "angajat",
        "staff",
        "profesor",
        "cadru didactic",
        "didactic",
        "nedidactic",
        "personal",
        "personal auxiliar",
        "cercetator",
        "employee upb",
    ].includes(v)) {
        return "employee";
    }

    if ([
        "guest",
        "invitat",
        "invitat",
        "extern",
        "external",
        "alumni",
        "alumnus",
        "partener",
        "partner",
    ].includes(v)) {
        return "other";
    }

    return "other";
}

function getUpbEligibility(params: {
    tournament: Tournament;
    userId: string | null;
    upbRole: string | null;
    upbFaculty: string | null;
}) {
    const { tournament, userId, upbRole, upbFaculty } = params;

    if (!tournament.is_upb_championship) {
        return { eligible: true, reason: "" };
    }

    if (!userId) {
        return { eligible: false, reason: "Autentifică-te pentru a verifica eligibilitatea la Campionatul UPB." };
    }

    const faculty = (upbFaculty ?? "").trim();
    const roleNorm = normalizeUpbRole(upbRole);

    if (!upbRole || !upbRole.toString().trim()) {
        return {
            eligible: false,
            reason: "Pentru etapele Campionatului UPB trebuie să ai completat rolul UPB în profil.",
        };
    }

    if (!faculty) {
        return {
            eligible: false,
            reason: "Pentru etapele Campionatului UPB trebuie să ai completată facultatea în profil.",
        };
    }

    if (roleNorm !== "student" && roleNorm !== "employee") {
        return {
            eligible: false,
            reason: "La Campionatul UPB se pot înscrie doar studenți și angajați ai UPB.",
        };
    }

    return { eligible: true, reason: "" };
}

export default function HomePage() {
    const router = useRouter();

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean>(false);

    const [userMp, setUserMp] = useState<number>(2);
    const [userMpMax, setUserMpMax] = useState<number>(2);

    // Amatur
    const [userAmaturMp, setUserAmaturMp] = useState<number | null>(null);
    const [hasAmatur, setHasAmatur] = useState<boolean>(false);
    const [userUpbRole, setUserUpbRole] = useState<string | null>(null);
    const [userUpbFaculty, setUserUpbFaculty] = useState<string | null>(null);

    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [tournamentsTotalCount, setTournamentsTotalCount] = useState<number>(0);
    const [playersCount, setPlayersCount] = useState<number>(0);
    const [myRegistrations, setMyRegistrations] = useState<Record<string, MyReg>>({});

    const [loading, setLoading] = useState(true);
    const loadingRef = useRef(false);

    async function load() {
        if (loadingRef.current) return;
        loadingRef.current = true;

        setLoading(true);
        try {
            // 1) auth
            const { data: authData } = await supabase.auth.getUser();
            const uid = authData?.user?.id ?? null;
            const email = authData?.user?.email ?? null;

            setUserId(uid);
            setUserEmail(email);

            // fallback nume din metadata
            const meta = authData?.user?.user_metadata ?? {};
            const metaDisplay =
                (meta.display_name as string | undefined)?.trim() ||
                [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() ||
                null;
            setUserName(metaDisplay);

            setIsAdmin(false);

            // 2) players row (mp, mp_max, amatur_mp, is_admin)
            if (uid) {
                const { data: p } = await supabase
                    .from("players")
                    .select("display_name, full_name, first_name, last_name, mp, mp_max, amatur_mp, is_admin, upb_role, upb_faculty")
                    .eq("id", uid)
                    .maybeSingle();

                if (p) {
                    setIsAdmin(!!(p as any).is_admin);

                    const fromFirstLast = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
                    const name =
                        (p.display_name as string | null)?.trim() ||
                        (p.full_name as string | null)?.trim() ||
                        (fromFirstLast.length ? fromFirstLast : null) ||
                        metaDisplay;

                    setUserName(name);

                    const mp = Number((p as any).mp ?? 2);
                    const mpMax = Number((p as any).mp_max ?? mp ?? 2);
                    setUserMp(Number.isFinite(mp) ? mp : 2);
                    setUserMpMax(Number.isFinite(mpMax) ? mpMax : 2);

                    const am = (p as any).amatur_mp;
                    const amNum = am == null ? null : Number(am);
                    setUserAmaturMp(Number.isFinite(amNum as any) ? (amNum as number) : null);
                    setHasAmatur(Number.isFinite(amNum as any));
                    setUserUpbRole(((p as any).upb_role ?? null) as string | null);
                    setUserUpbFaculty(((p as any).upb_faculty ?? null) as string | null);
                }
            } else {
                setUserMp(2);
                setUserMpMax(2);
                setUserAmaturMp(null);
                setHasAmatur(false);
                setUserUpbRole(null);
                setUserUpbFaculty(null);
            }

            // 3) tournaments (public list on Home)
            // IMPORTANT: use select("*") to avoid breaking if some optional columns are missing in local schema
            const { data: ts, error: tErr } = await supabase
                .from("tournaments")
                .select("*")
                .neq("status", "FINISHED")
                .order("start_at", { ascending: true });

            if (tErr) {
                console.error("Home tournaments query error:", tErr);
            }

            const list = (ts ?? []) as Tournament[];

            // 3b) total tournaments organized (include FINISHED too)
            try {
                const { count: tCount } = await supabase
                    .from("tournaments")
                    .select("id", { count: "exact", head: true } as any);
                setTournamentsTotalCount(typeof tCount === "number" ? tCount : 0);
            } catch {
                setTournamentsTotalCount(0);
            }


            // 4) registered_count + spots_left (best-effort)
            const ids = list.map((t) => t.id);
            let counts: Record<string, number> = {};
            if (ids.length) {
                const { data: regs } = await supabase
                    .from("registrations")
                    .select("tournament_id,status")
                    .in("tournament_id", ids);

                (regs ?? []).forEach((r: any) => {
                    if (r?.status !== "REGISTERED") return;
                    counts[r.tournament_id] = (counts[r.tournament_id] ?? 0) + 1;
                });
            }

            const enriched = list.map((t) => {
                const registered = counts[t.id] ?? 0;
                const max = typeof t.max_players === "number" ? t.max_players : null;
                const spotsLeft = typeof max === "number" ? Math.max(0, max - registered) : null;
                const isFull = typeof max === "number" ? registered >= max : false;
                return { ...t, registered_count: registered, spots_left: spotsLeft, is_full: isFull };
            });

            setTournaments(enriched);

            // 4b) total players (best-effort)
            try {
                const { count } = await supabase.from("players").select("id", { count: "exact", head: true } as any);
                setPlayersCount(typeof count === "number" ? count : 0);
            } catch {
                setPlayersCount(0);
            }


            // 5) my registrations
            if (uid && ids.length) {
                const { data: myRegs } = await supabase
                    .from("registrations")
                    .select("tournament_id,status")
                    .eq("player_id", uid)
                    .in("tournament_id", ids);

                const map: Record<string, MyReg> = {};
                (myRegs ?? []).forEach((r: any) => {
                    if (!r?.tournament_id) return;
                    map[r.tournament_id] = { tournament_id: r.tournament_id, status: r.status };
                });
                setMyRegistrations(map);
            } else {
                setMyRegistrations({});
            }
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }

    useEffect(() => {
        // Initial load
        load();

        // Keep UI in sync with auth changes (login/logout) without requiring a manual refresh
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            const uid = session?.user?.id ?? null;
            const email = session?.user?.email ?? null;

            setUserId(uid);
            setUserEmail(email);

            if (!uid) {
                // Immediately reflect logged-out state in the UI
                setUserName(null);
                setIsAdmin(false);
                setMyRegistrations({});
                setHasAmatur(false);
                setUserAmaturMp(null);
                setUserUpbRole(null);
                setUserUpbFaculty(null);
            }

            // Re-fetch data that depends on auth
            load();
        });

        return () => {
            sub?.subscription?.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    async function logout() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("Logout error:", error.message);
            alert("Nu am putut face logout. Te rog încearcă din nou.");
            return;
        }

        // Update UI instantly (no manual refresh needed)
        setUserEmail(null);
        setUserId(null);
        setUserName(null);
        setIsAdmin(false);
        setMyRegistrations({});
        setHasAmatur(false);
        setUserAmaturMp(null);
        setUserUpbRole(null);
        setUserUpbFaculty(null);

        router.replace("/");
        router.refresh();
    }
    async function registerToTournament(t: Tournament) {
        if (!userId) return;

        const upbEligibility = getUpbEligibility({
            tournament: t,
            userId,
            upbRole: userUpbRole,
            upbFaculty: userUpbFaculty,
        });

        if (!upbEligibility.eligible) {
            alert(upbEligibility.reason);
            return;
        }

        // eligibilitate simplă: permit "o categorie mai sus" (în regulament) – aici doar blocăm dacă e clar peste.
        const cat = (t.category ?? "ALL") as TournamentCategory;
        if (cat !== "ALL") {
            const myCat = playerCategory(userMpMax);
            const allowed =
                myCat === cat ||
                (myCat === "HOBBY" && cat === "ADVANCED") ||
                (myCat === "ADVANCED" && cat === "ELITE");

            if (!allowed) {
                alert("Nu ești eligibil pentru această categorie (regula este: categoria ta sau una mai sus).");
                return;
            }
        }

        const { error } = await supabase.from("registrations").upsert({
            tournament_id: t.id,
            player_id: userId,
            status: "REGISTERED",
            registered_at: new Date().toISOString(),
            mp_before: (
                hasAmatur && userAmaturMp != null
                    ? Math.max(Number(userAmaturMp ?? 0), Number(userMp ?? 0))
                    : Number(userMp ?? 2)
            ) ?? 2,
        } as any);

        if (error) {
            alert((error as any)?.message ?? "Eroare înscriere.");
            return;
        }

        await load();
    }

    async function withdrawFromTournament(t: Tournament) {
        if (!userId) return;

        const { error } = await supabase
            .from("registrations")
            .update({ status: "WITHDRAWN", withdrawn_at: new Date().toISOString() } as any)
            .eq("tournament_id", t.id)
            .eq("player_id", userId);

        if (error) {
            alert((error as any)?.message ?? "Eroare retragere.");
            return;
        }

        await load();
    }

    function buildWhatsappAnnouncement(t: Tournament) {
        const title = t?.title ?? "Turneu nou";
        const when = t?.start_at ? new Date(t.start_at).toLocaleString("ro-RO") : "—";
        const location = t?.location ?? "—";
        const format = t?.format ?? "—";
        const type = t?.is_rated ? "Punctat" : "Agrement";

        const cats = cardCategoryText(t);
        const donation = ((t as any).donation_info ?? t.donation_recommended ?? t.donation_min ?? t.donation ?? "")
            .toString()
            .trim() || "Gratuit";

        const regOpen = typeof t?.registration_open === "boolean" ? (t.registration_open ? "DESCHISE" : "ÎNCHISE") : "—";

        const registered = typeof t?.registered_count === "number" ? t.registered_count : 0;
        const max = typeof t?.max_players === "number" ? t.max_players : null;
        const spotsLeft = typeof t?.spots_left === "number" ? t.spots_left : typeof max === "number" ? Math.max(0, max - registered) : null;

        const slotsLine =
            typeof max === "number"
                ? `${registered}/${max} (rămase ${spotsLeft ?? Math.max(0, max - registered)})`
                : `${registered} înscriși`;

        const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/tournaments/${t.id}` : `/tournaments/${t.id}`;

        return [
            `🏆 TURNEU NOU: ${title}`,
            ``,
            `📅 Data: ${when}`,
            `📍 Locație: ${location}`,
            `Tip: ${type}`,
            `Format: ${format}`,
            `🏷️ Categorie: ${cats}`,
            `💰 Donație minimă recomandată: ${donation}`,
            `📝 Înscrieri: ${regOpen}`,
            `👥 Locuri: ${slotsLine}`,
            ``,
            `🔗 Detalii & înscriere:`,
            publicUrl,
        ].join("\n");
    }

    async function announceOnWhatsApp(t: Tournament) {
        const msg = buildWhatsappAnnouncement(t);

        try {
            await navigator.clipboard.writeText(msg);
        } catch { }

        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    const userCat = catLabel(playerCategory(userMpMax));


    // Derived UI data (client-side)
    const nowTs = Date.now();
    const myUpcoming = tournaments
        .filter((t) => myRegistrations[t.id]?.status === "REGISTERED")
        .filter((t) => {
            const ts = Date.parse(t.start_at);
            return Number.isFinite(ts) ? ts >= nowTs - 2 * 60 * 60 * 1000 : true; // keep near-future items
        })
        .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
        .slice(0, 3);

    const tournamentsCount = tournamentsTotalCount || tournaments.length;

    const APP_START = new Date("2026-01-12T00:00:00+02:00").getTime();

    const daysRunning = Math.max(
        1,
        Math.floor((nowTs - APP_START) / (1000 * 60 * 60 * 24)) + 1
    );

    const IBAN = "RO77 REVO 0000 1310 3910 2276";

    return (
        <main className="min-h-screen" style={{ background: "var(--ps-bg)" }}>
            {/* Top bar */}
            <div className="w-full" style={{ background: "var(--ps-bg)" }}>
                <div className="mx-auto max-w-6xl px-4 pt-4">
                    <div className="rounded-2xl border shadow-sm" style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.4)" }}>
                        <div className="px-4 py-1">
                            {/* Action bar */}
                            <div className="flex justify-end gap-1 flex-wrap pt-1">
                                {userEmail ? (
                                    <>
                                        <Link href="/account" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            Contul meu
                                        </Link>
                                        <button onClick={logout} className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            Logout
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Link href="/login?mode=login" className="ps-btn ps-btn-primary text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:brightness-95">
                                            Login
                                        </Link>
                                        <Link href="/login?mode=register" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            Creează cont
                                        </Link>
                                    </>
                                )}

                                <Link href="/tournaments" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                    Istoric Turnee
                                </Link>
                                <Link href="/players" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                    Jucători
                                </Link>
                                <Link href="/championship/upb" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                    Campionat UPB
                                </Link>
                            </div>

                            {/* Branding */}
                            <div className="mt-2 flex items-center gap-4">
                                <div className="flex items-center gap-2 min-w-[220px]">
                                    <Image
                                        src="/Logo_POLISPORT_TT_v1.png"
                                        alt="PoliSport Table Tennis"
                                        width={200}
                                        height={62}
                                        priority
                                        style={{ height: "auto" }}
                                    />
                                </div>

                                <div className="min-w-[320px]">
                                    <div className="text-3xl lg:text-4xl font-extrabold tracking-tight" style={{ color: "var(--ps-primary)" }}>
                                        PoliSport Table Tennis
                                    </div>
                                    <div className="mt-1 text-base lg:text-lg" style={{ color: "var(--ps-muted)" }}>
                                        Manager turnee & jucători @ UNSTPB
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-6xl px py-6">
                        {/* Hero */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left: Player hub */}
                            <div className="ps-card p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                            PANOUL MEU
                                        </div>
                                        <p className="mt-2 text-sm" style={{ color: "var(--ps-muted)" }}>
                                            Informații despre cont, înscrieri și remindere.
                                        </p>
                                    </div>
                                    {isAdmin ? (
                                        <Link href="/admin/tournaments/new" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            + Creează Turneu
                                        </Link>
                                    ) : null}
                                </div>

                                {/* Status boxes */}
                                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                                        <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                                            STATUS
                                        </div>
                                        <div className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ps-text)" }}>
                                            {userEmail ? (
                                                <>
                                                    Autentificat ca:<br />
                                                    <b>{userName ?? "Utilizator"}</b>
                                                </>
                                            ) : (
                                                <>Nu ești autentificat</>
                                            )}
                                        </div>
                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                            {userEmail}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                                        <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                                            CATEGORIA TA
                                        </div>
                                        <div className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ps-text)" }}>
                                            {catLabel(playerCategory(userMpMax))}
                                        </div>
                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                            MP: <b style={{ color: "var(--ps-text)" }}>{userMp}</b> · Max:{" "}
                                            <b style={{ color: "var(--ps-text)" }}>{userMpMax}</b>
                                            {hasAmatur && typeof userAmaturMp === "number" ? (
                                                <>
                                                    {" "}
                                                    · Amatur MP: <b style={{ color: "var(--ps-text)" }}>{userAmaturMp}</b>
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                            Cont Amatur:{" "}
                                            <b style={{ color: "var(--ps-text)" }}>{hasAmatur ? "Da" : "Nu"}</b>
                                        </div>
                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                            Rol UPB: <b style={{ color: "var(--ps-text)" }}>{userUpbRole?.trim() || "—"}</b>
                                        </div>
                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                            Facultate: <b style={{ color: "var(--ps-text)" }}>{userUpbFaculty?.trim() || "—"}</b>
                                        </div>
                                    </div>
                                </div>

                                {/* Upcoming registrations */}
                                <div className="mt-5">
                                    <div className="text-base font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                        Ești înscris la următoarele turnee:
                                    </div>
                                    <div className="mt-2 space">
                                        {myUpcoming.length === 0 ? (
                                            <div className="text-sm" style={{ color: "var(--ps-muted)" }}>
                                                Momentan nu ești înscris la niciun turneu viitor.
                                            </div>
                                        ) : (
                                            myUpcoming.map((t, idx) => (
                                                <div key={t.id} className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-semibold" style={{ color: "var(--ps-text)" }}>
                                                        {idx + 1}. {t.title}{" "}
                                                        <span className="font-normal" style={{ color: "var(--ps-muted)" }}>
                                                            ({toLocalRO24(t.start_at)})
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                                        <Link href="/info" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            Citește regulamentul
                                        </Link>

                                        <Link href="/account" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                            Contul meu
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Contribution */}
                            <div className="ps-card p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-base font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                            CONTRIBUIE ȘI TU
                                        </div>
                                        <p className="mt-3 text-sm" style={{ color: "var(--ps-muted)", maxWidth: 420 }}>
                                            Dacă îți place ce am realizat până acum, poți susține proiectul printr-o mică donație. Fiecare contribuție va ajuta la dezvoltarea aplicației, a acestei comunități și la organizarea de noi turnee gratuite. Mulțumesc pentru implicare!
                                        </p>
                                        <div className="mt-3 text-base font-extrabold" style={{ color: "var(--ps-muted)" }}>
                                            Cont IBAN:
                                            <br />
                                            <span style={{ color: "var(--ps-text)", fontSize: "14px" }}>{IBAN}</span>
                                        </div>
                                    </div>

                                    <div
                                        className="rounded-2xl border p-2 overflow-hidden"
                                        style={{ borderColor: "var(--ps-border)", background: "white", minWidth: 170 }}
                                    >
                                        <Image
                                            src="/qr_contribute.png"
                                            alt="QR contribuție"
                                            width={170}
                                            height={170}
                                            style={{ width: "100%", height: "auto", borderRadius: 10 }}
                                        />
                                        <div className="mt-2 text-center text-xs font-semibold" style={{ color: "var(--ps-muted)" }}>
                                            Revolut tag @cozzy90
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="mt-6 grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl border p-4 text-center" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                                        <div className="text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>🏆</div>
                                        <div className="mt-1 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                            {tournamentsCount}
                                        </div>
                                        <div className="mt-1 text-[11px] font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                                            TURNEE ORGANIZATE
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border p-4 text-center" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                                        <div className="text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>👥</div>
                                        <div className="mt-1 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                            {playersCount}
                                        </div>
                                        <div className="mt-1 text-[11px] font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                                            JUCĂTORI ÎN APLICAȚIE
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border p-4 text-center" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                                        <div className="text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>📅</div>
                                        <div className="mt-1 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                            {daysRunning}
                                        </div>
                                        <div className="mt-1 text-[11px] font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                                            ZILE DE FUNCȚIONARE
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-base font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                    Planificare Turnee
                                </h2>

                                {isAdmin ? (
                                    <Link href="/admin/tournaments/new" className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                        + Creează Turneu
                                    </Link>
                                ) : null}
                            </div>

                            {loading ? (
                                <p className="mt-4 text-sm" style={{ color: "var(--ps-muted)" }}>
                                    Se încarcă...
                                </p>
                            ) : tournaments.length === 0 ? (
                                <p className="mt-4 text-sm" style={{ color: "var(--ps-muted)" }}>
                                    Nu există turnee încă.
                                </p>
                            ) : (
                                <div className="mt-4 grid gap-4">
                                    {tournaments.map((t) => {
                                        const reg = myRegistrations[t.id];
                                        const regOpen = !!t.registration_open;
                                        const notFull = !(t.is_full ?? false);
                                        const upbEligibility = getUpbEligibility({
                                            tournament: t,
                                            userId,
                                            upbRole: userUpbRole,
                                            upbFaculty: userUpbFaculty,
                                        });
                                        const canJoinUpb = upbEligibility.eligible;

                                        const canShowJoin =
                                            !!userId &&
                                            regOpen &&
                                            notFull &&
                                            (reg?.status ?? null) !== "REGISTERED" &&
                                            canJoinUpb;
                                        const canShowWithdraw = !!userId && regOpen && reg?.status === "REGISTERED";

                                        return (
                                            <div key={t.id} className="ps-card p-5">
                                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-base font-extrabold" style={{ color: "var(--ps-primary)" }}>
                                                            🏆{t.title}
                                                        </div>
                                                        <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                                                            {toLocalRO24(t.start_at)} • {t.location ?? "—"}
                                                        </div>

                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {t.is_upb_championship ? (
                                                                <>
                                                                    <span
                                                                        className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold"
                                                                        style={{ borderColor: "var(--ps-primary)", color: "var(--ps-primary)", background: "rgba(0,128,0,0.06)" }}
                                                                    >
                                                                        Campionatul UPB
                                                                    </span>
                                                                    {t.championship_season ? (
                                                                        <span
                                                                            className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
                                                                            style={{ borderColor: "var(--ps-border)", color: "var(--ps-text)", background: "white" }}
                                                                        >
                                                                            Sezon {t.championship_season}
                                                                        </span>
                                                                    ) : null}
                                                                    {typeof t.championship_stage === "number" ? (
                                                                        <span
                                                                            className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
                                                                            style={{ borderColor: "var(--ps-border)", color: "var(--ps-text)", background: "white" }}
                                                                        >
                                                                            Etapa {t.championship_stage}
                                                                        </span>
                                                                    ) : null}
                                                                </>
                                                            ) : null}
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--ps-border)" }}>
                                                                <div className="text-xs font-semibold uppercase" style={{ color: "var(--ps-muted)" }}>
                                                                    Tip
                                                                </div>
                                                                <div className="mt-1 text-[13px] font-semibold">{t.is_rated ? "Punctat" : "Agrement"}</div>
                                                            </div>

                                                            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--ps-border)" }}>
                                                                <div className="text-xs font-semibold uppercase" style={{ color: "var(--ps-muted)" }}>
                                                                    Categorie
                                                                </div>
                                                                <div className="mt-1 text-[13px] font-semibold">{cardCategoryText(t)}</div>
                                                            </div>

                                                            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--ps-border)" }}>
                                                                <div className="text-xs font-semibold uppercase" style={{ color: "var(--ps-muted)" }}>
                                                                    Donație recomandată
                                                                </div>
                                                                <div className="mt-1 text-[13px] font-semibold">
                                                                    {((t as any).donation_info ?? t.donation_recommended ?? t.donation_min ?? t.donation ?? "")
                                                                        .toString()
                                                                        .trim() || "Gratuit"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="lg:text-right text-sm" style={{ color: "var(--ps-muted)" }}>
                                                        <div>
                                                            <b>Format:</b>{" "}
                                                            {t.format === "LOWER_UPPER_KO"
                                                                ? "Inferioare→Superioare→KO"
                                                                : t.format === "GROUPS_KO"
                                                                    ? "Grupe→KO"
                                                                    : t.format}
                                                        </div>
                                                        <div>
                                                            <b>Status:</b> {prettyStatus(t.status)}
                                                        </div>

                                                        {typeof t.max_players === "number" && <div><b>Max:</b> {t.max_players}</div>}

                                                        {typeof t.registered_count === "number" && (
                                                            <div>
                                                                <b>Înscriși:</b> {t.registered_count}
                                                                {t.max_players != null ? ` / ${t.max_players}` : ""}
                                                            </div>
                                                        )}

                                                        {typeof t.spots_left === "number" && <div><b>Rămase:</b> {t.spots_left}</div>}

                                                        <div className="mt-1">
                                                            <b>Starea mea:</b> {reg ? reg.status : "—"}
                                                        </div>
                                                    </div>
                                                </div>

                                                {!userId ? (
                                                    <div className="mt-4 text-sm" style={{ color: "var(--ps-muted)" }}>
                                                        Autentifică-te ca să te înscrii.
                                                    </div>
                                                ) : (
                                                    <>
                                                        {t.is_upb_championship && !upbEligibility.eligible ? (
                                                            <div
                                                                className="mt-4 rounded-2xl border px-4 py-3 text-sm"
                                                                style={{
                                                                    borderColor: "#d97706",
                                                                    background: "rgba(245, 158, 11, 0.08)",
                                                                    color: "#92400e",
                                                                }}
                                                            >
                                                                <b>Etapă Campionatul UPB:</b> {upbEligibility.reason}
                                                            </div>
                                                        ) : null}

                                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            {canShowJoin && (
                                                                <button onClick={() => registerToTournament(t)} className="ps-btn ps-btn-primary text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:brightness-95">
                                                                    Înscrie-mă
                                                                </button>
                                                            )}

                                                            {canShowWithdraw && (
                                                                <button onClick={() => withdrawFromTournament(t)} className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                                                    Retrage-mă
                                                                </button>
                                                            )}

                                                            <Link href={`/tournaments/${t.id}`} className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                                                Vezi turneu
                                                            </Link>
                                                        </div>

                                                        {isAdmin ? (
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Link href={`/admin/tournaments/${t.id}`} className="ps-btn ps-btn-outline text-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-black/5">
                                                                    Admin turneu
                                                                </Link>

                                                                <button
                                                                    onClick={() => announceOnWhatsApp(t)}
                                                                    className="ps-btn text-sm hover:-translate-y-[1px] hover:shadow-md hover:bg-[rgba(37,211,102,0.10)]"
                                                                    style={{ border: "1px solid #25D366", color: "#25D366", background: "transparent" }}
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
                        </div>

                        <footer className="mt-10 pb-6 text-center text-sm" style={{ color: "var(--ps-muted)" }}>
                            Creat de <span style={{ color: "var(--ps-primary)", fontWeight: 800 }}>Cristoiu Cozmin-Adrian</span> @ FIIR pentru
                            comunitatea pasionaților de tenis de masă din{" "}
                            <span style={{ color: "var(--ps-primary-2)", fontWeight: 800 }}>UNSTPB</span>.
                        </footer>
                    </div>
                </div>
            </div>
        </main>
    );
}
