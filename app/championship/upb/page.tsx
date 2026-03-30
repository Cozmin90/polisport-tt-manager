"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TournamentCategory = "HOBBY" | "ADVANCED" | "ELITE" | "ALL" | string;
type RoleGroup = "student" | "employee" | "other";

type StandingFilterKey =
  | "overall"
  | "student_hobby"
  | "student_advanced"
  | "student_elite"
  | "employee_hobby"
  | "employee_advanced"
  | "employee_elite";

type SectionKey = "faculties" | "individual";

type TournamentInfo = {
  id: string;
  title: string | null;
  category: TournamentCategory | null;
  championship_season: string | null;
  championship_stage: number | null;
  start_at: string | null;
  is_upb_championship: boolean | null;
};

type PlayerInfo = {
  id: string;
  full_name: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  upb_role?: string | null;
  upb_faculty?: string | null;
};

type RegistrationJoined = {
  player_id: string | null;
  championship_points: number | null;
  mp_turneu: number | null;
  final_place: number | null;
  tournaments: TournamentInfo | null;
  players: PlayerInfo | null;
};

type RegistrationQueryRow = {
  player_id: string | null;
  championship_points: number | null;
  mp_turneu: number | null;
  final_place: number | null;
  tournaments: TournamentInfo | TournamentInfo[] | null;
  players: PlayerInfo | PlayerInfo[] | null;
};

type FacultyStanding = {
  rank: number;
  faculty: string;
  points: number;
  participations: number;
  playersCount: number;
  stageCount: number;
};

type IndividualStanding = {
  rank: number;
  playerId: string;
  name: string;
  faculty: string;
  roleLabel: string;
  points: number;
  participations: number;
  stageCount: number;
  bestResult: number | null;
};

type FilterDef = {
  key: StandingFilterKey;
  label: string;
  role: RoleGroup | null;
  category: TournamentCategory | null;
};

const FILTERS: FilterDef[] = [
  { key: "overall", label: "Overall", role: null, category: null },
  { key: "student_hobby", label: "Studenți Hobby", role: "student", category: "HOBBY" },
  { key: "student_advanced", label: "Studenți Avansați", role: "student", category: "ADVANCED" },
  { key: "student_elite", label: "Studenți Elite", role: "student", category: "ELITE" },
  { key: "employee_hobby", label: "Profesori/Angajați Hobby", role: "employee", category: "HOBBY" },
  { key: "employee_advanced", label: "Profesori/Angajați Avansați", role: "employee", category: "ADVANCED" },
  { key: "employee_elite", label: "Profesori/Angajați Elite", role: "employee", category: "ELITE" },
];

function normalizeRole(role: string | null | undefined): RoleGroup {
  const v = String(role ?? "").trim().toLowerCase();
  if (!v) return "other";
  if (["student", "stud", "student upb"].includes(v)) return "student";
  if (["employee", "angajat", "profesor", "teacher", "staff", "cadru didactic"].includes(v)) return "employee";
  return "other";
}

function roleLabel(role: RoleGroup): string {
  if (role === "student") return "Student";
  if (role === "employee") return "Profesor/Angajat";
  return "Alt rol";
}

function normalizeCategory(category: string | null | undefined): TournamentCategory | null {
  const v = String(category ?? "").trim().toUpperCase();
  if (!v) return null;
  if (["HOBBY", "H"].includes(v)) return "HOBBY";
  if (["ADVANCED", "AVANSATI", "AVANSAȚI", "A"].includes(v)) return "ADVANCED";
  if (["ELITE", "E"].includes(v)) return "ELITE";
  if (v === "ALL") return "ALL";
  return v;
}

function categoryLabel(category: TournamentCategory | null | undefined): string {
  const v = normalizeCategory(category);
  if (v === "HOBBY") return "Hobby";
  if (v === "ADVANCED") return "Avansați";
  if (v === "ELITE") return "Elite";
  if (v === "ALL") return "All";
  return "—";
}

function normalizeFaculty(faculty: string | null | undefined): string {
  return String(faculty ?? "").replace(/^\d+\.\s*/, "").trim() || "Necompletat";
}

function getPlayerName(player: RegistrationJoined["players"]): string {
  if (!player) return "—";
  const display = String(player.display_name ?? "").trim();
  if (display) return display;
  const firstLast = [player.first_name, player.last_name].filter(Boolean).join(" ").trim();
  if (firstLast) return firstLast;
  const full = String(player.full_name ?? "").trim();
  return full || "—";
}

function formatDateRO(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ro-RO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function denseRank<T>(rows: T[], getPoints: (row: T) => number): (T & { rank: number })[] {
  let prevPoints: number | null = null;
  let currentRank = 0;
  return rows.map((row, index) => {
    const pts = getPoints(row);
    if (prevPoints === null || pts !== prevPoints) {
      currentRank = index + 1;
      prevPoints = pts;
    }
    return { ...row, rank: currentRank };
  });
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeRegistrationRows(data: RegistrationQueryRow[]): RegistrationJoined[] {
  return data.map((row) => ({
    player_id: row.player_id ?? null,
    championship_points: row.championship_points ?? null,
    mp_turneu: row.mp_turneu ?? null,
    final_place: row.final_place ?? null,
    tournaments: firstOrNull(row.tournaments),
    players: firstOrNull(row.players),
  }));
}

function matchesFilter(row: RegistrationJoined, filter: FilterDef): boolean {
  const tournament = row.tournaments;
  const player = row.players;
  if (!tournament?.is_upb_championship) return false;
  if (!player) return false;

  const role = normalizeRole(player.upb_role);
  const cat = normalizeCategory(tournament.category);

  if (filter.role && role !== filter.role) return false;
  if (filter.category && cat !== filter.category) return false;

  return true;
}

export default function ChampionshipPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RegistrationJoined[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState<string>("all");
  const [section, setSection] = useState<SectionKey>("faculties");
  const [filterKey, setFilterKey] = useState<StandingFilterKey>("overall");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const { data: tournamentsData, error: tournamentsError } = await supabase
          .from("tournaments")
          .select("id, title, category, championship_season, championship_stage, start_at, is_upb_championship")
          .eq("is_upb_championship", true)
          .order("championship_season", { ascending: false })
          .order("championship_stage", { ascending: true });

        if (tournamentsError) throw tournamentsError;

        const championshipTournaments = (tournamentsData ?? []) as TournamentInfo[];
        const tournamentIds = championshipTournaments.map((t) => t.id).filter(Boolean) as string[];

        const seasonList = Array.from(
          new Set(
            championshipTournaments
              .map((t) => String(t.championship_season ?? "").trim())
              .filter(Boolean)
          )
        );

        if (isMounted) {
          setSeasons(seasonList);
          setSeason((prev) => {
            if (prev !== "all" && seasonList.includes(prev)) return prev;
            return seasonList[0] ?? "all";
          });
        }

        if (!tournamentIds.length) {
          if (isMounted) setRows([]);
          return;
        }

        const { data: registrationsData, error: registrationsError } = await supabase
          .from("registrations")
          .select(`
            player_id,
            championship_points,
            mp_turneu,
            final_place,
            tournaments:tournament_id (
              id,
              title,
              category,
              championship_season,
              championship_stage,
              start_at,
              is_upb_championship
            ),
            players:player_id (
              id,
              full_name,
              display_name,
              first_name,
              last_name,
              upb_role,
              upb_faculty
            )
          `)
          .in("tournament_id", tournamentIds)
          .order("final_place", { ascending: true, nullsFirst: false });

        if (registrationsError) throw registrationsError;

        if (isMounted) {
          const normalized = normalizeRegistrationRows((registrationsData ?? []) as RegistrationQueryRow[]);
          setRows(normalized);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message ?? "Nu am putut încărca clasamentele campionatului.");
          setRows([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const currentFilter = useMemo(
    () => FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0],
    [filterKey]
  );

  const seasonRows = useMemo(() => {
    return rows.filter((row) => {
      const rowSeason = String(row.tournaments?.championship_season ?? "").trim();
      if (season === "all") return true;
      return rowSeason === season;
    });
  }, [rows, season]);

  const seasonStages = useMemo(() => {
    const map = new Map<string, { id: string; title: string; stage: number | null; date: string | null; category: string }>();

    for (const row of seasonRows) {
      const t = row.tournaments;
      if (!t?.id) continue;
      if (!map.has(t.id)) {
        map.set(t.id, {
          id: t.id,
          title: String(t.title ?? "Etapă"),
          stage: t.championship_stage ?? null,
          date: t.start_at ?? null,
          category: categoryLabel(t.category),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const stageA = a.stage ?? 9999;
      const stageB = b.stage ?? 9999;
      if (stageA !== stageB) return stageA - stageB;
      return String(a.date ?? "").localeCompare(String(b.date ?? ""));
    });
  }, [seasonRows]);

  const filteredRows = useMemo(() => {
    return seasonRows.filter((row) => matchesFilter(row, currentFilter));
  }, [seasonRows, currentFilter]);

  const facultyStandings = useMemo<FacultyStanding[]>(() => {
    const map = new Map<string, { faculty: string; points: number; participations: number; players: Set<string>; stages: Set<string> }>();

    for (const row of filteredRows) {
      const player = row.players;
      const tournament = row.tournaments;
      if (!player || !tournament) continue;

      const faculty = normalizeFaculty(player.upb_faculty);
      const key = faculty;
      const points = Number(row.championship_points ?? 0);
      const stageKey = tournament.id;
      const playerId = String(player.id ?? row.player_id ?? "");

      if (!map.has(key)) {
        map.set(key, { faculty, points: 0, participations: 0, players: new Set(), stages: new Set() });
      }

      const item = map.get(key)!;
      item.points += Number.isFinite(points) ? points : 0;
      item.participations += 1;
      if (playerId) item.players.add(playerId);
      if (stageKey) item.stages.add(stageKey);
    }

    const rowsBase = Array.from(map.values())
      .map((item) => ({
        faculty: item.faculty,
        points: Number(item.points.toFixed(2)),
        participations: item.participations,
        playersCount: item.players.size,
        stageCount: item.stages.size,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.playersCount !== a.playersCount) return b.playersCount - a.playersCount;
        return a.faculty.localeCompare(b.faculty, "ro");
      });

    return denseRank(rowsBase, (row) => row.points);
  }, [filteredRows]);

  const individualStandings = useMemo<IndividualStanding[]>(() => {
    const map = new Map<
      string,
      {
        playerId: string;
        name: string;
        faculty: string;
        roleLabel: string;
        points: number;
        participations: number;
        stages: Set<string>;
        bestResult: number | null;
      }
    >();

    for (const row of filteredRows) {
      const player = row.players;
      const tournament = row.tournaments;
      if (!player || !tournament) continue;

      const playerId = String(player.id ?? row.player_id ?? "");
      if (!playerId) continue;

      const points = Number(row.championship_points ?? 0);
      const faculty = normalizeFaculty(player.upb_faculty);
      const role = roleLabel(normalizeRole(player.upb_role));
      const name = getPlayerName(player);
      const place = typeof row.final_place === "number" ? row.final_place : null;

      if (!map.has(playerId)) {
        map.set(playerId, {
          playerId,
          name,
          faculty,
          roleLabel: role,
          points: 0,
          participations: 0,
          stages: new Set(),
          bestResult: place,
        });
      }

      const item = map.get(playerId)!;
      item.points += Number.isFinite(points) ? points : 0;
      item.participations += 1;
      item.stages.add(tournament.id);
      if (place != null) {
        item.bestResult = item.bestResult == null ? place : Math.min(item.bestResult, place);
      }
    }

    const rowsBase = Array.from(map.values())
      .map((item) => ({
        playerId: item.playerId,
        name: item.name,
        faculty: item.faculty,
        roleLabel: item.roleLabel,
        points: Number(item.points.toFixed(2)),
        participations: item.participations,
        stageCount: item.stages.size,
        bestResult: item.bestResult,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const bestA = a.bestResult ?? 9999;
        const bestB = b.bestResult ?? 9999;
        if (bestA !== bestB) return bestA - bestB;
        return a.name.localeCompare(b.name, "ro");
      });

    return denseRank(rowsBase, (row) => row.points);
  }, [filteredRows]);

  const summary = useMemo(() => {
    const totalPoints = filteredRows.reduce((sum, row) => sum + Number(row.championship_points ?? 0), 0);
    const uniquePlayers = new Set(filteredRows.map((row) => row.players?.id).filter(Boolean)).size;
    const uniqueFaculties = new Set(filteredRows.map((row) => normalizeFaculty(row.players?.upb_faculty)).filter(Boolean)).size;
    return {
      totalPoints: Number(totalPoints.toFixed(2)),
      uniquePlayers,
      uniqueFaculties,
      participations: filteredRows.length,
    };
  }, [filteredRows]);

  const activeRows = section === "faculties" ? facultyStandings : individualStandings;

  return (
    <main className="min-h-screen" style={{ background: "var(--ps-bg)" }}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div
          className="rounded-3xl border p-6 shadow-sm"
          style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.12)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-extrabold uppercase tracking-[0.22em]" style={{ color: "var(--ps-muted)" }}>
                Campionatul UPB
              </div>
              <h1 className="mt-2 text-3xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                Clasamente generale
              </h1>
              <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--ps-muted)" }}>
                Aici poți vedea clasamentele pe facultăți și individuale, atât overall, cât și pe segmentele stabilite pentru studenți și profesori/angajați.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/" className="ps-btn ps-btn-outline text-sm">
                ← Acasă
              </Link>
              <Link href="/tournaments" className="ps-btn ps-btn-outline text-sm">
                Istoric turnee
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
              <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                SEZON
              </div>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: "var(--ps-border)", background: "white", color: "var(--ps-text)" }}
              >
                <option value="all">Toate sezoanele</option>
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
              <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                ETAPE ÎN FILTRU
              </div>
              <div className="mt-2 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                {seasonStages.length}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                turnee de campionat găsite
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
              <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                PUNCTE ÎN FILTRU
              </div>
              <div className="mt-2 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                {summary.totalPoints}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                total puncte campionat
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ps-border)", background: "white" }}>
              <div className="text-xs font-extrabold tracking-wide" style={{ color: "var(--ps-muted)" }}>
                PARTICIPĂRI ÎN FILTRU
              </div>
              <div className="mt-2 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                {summary.participations}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                {summary.uniquePlayers} jucători · {summary.uniqueFaculties} facultăți
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="rounded-3xl border p-5" style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
              <div className="text-sm font-extrabold" style={{ color: "var(--ps-primary)" }}>
                Tip clasament
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  onClick={() => setSection("faculties")}
                  className="rounded-2xl border px-4 py-3 text-left text-sm font-bold"
                  style={{
                    borderColor: section === "faculties" ? "var(--ps-primary)" : "var(--ps-border)",
                    background: section === "faculties" ? "rgba(34,197,94,0.08)" : "white",
                    color: "var(--ps-text)",
                  }}
                >
                  Clasament facultăți
                </button>
                <button
                  onClick={() => setSection("individual")}
                  className="rounded-2xl border px-4 py-3 text-left text-sm font-bold"
                  style={{
                    borderColor: section === "individual" ? "var(--ps-primary)" : "var(--ps-border)",
                    background: section === "individual" ? "rgba(34,197,94,0.08)" : "white",
                    color: "var(--ps-text)",
                  }}
                >
                  Clasament individual
                </button>
              </div>
            </section>

            <section className="rounded-3xl border p-5" style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
              <div className="text-sm font-extrabold" style={{ color: "var(--ps-primary)" }}>
                Filtru activ
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {FILTERS.map((filter) => {
                  const isActive = filter.key === filterKey;
                  const isFacultyEmployee = filter.key.startsWith("employee_");
                  const label = section === "individual" && isFacultyEmployee
                    ? filter.label.replace("Profesori/", "")
                    : filter.label;

                  return (
                    <button
                      key={filter.key}
                      onClick={() => setFilterKey(filter.key)}
                      className="rounded-full border px-3 py-2 text-xs font-extrabold"
                      style={{
                        borderColor: isActive ? "var(--ps-primary)" : "var(--ps-border)",
                        background: isActive ? "rgba(34,197,94,0.08)" : "white",
                        color: isActive ? "var(--ps-primary)" : "var(--ps-text)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border p-5" style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
              <div className="text-sm font-extrabold" style={{ color: "var(--ps-primary)" }}>
                Etape în sezonul selectat
              </div>
              <div className="mt-3 space-y-2">
                {seasonStages.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--ps-muted)" }}>
                    Nu există încă etape pentru filtrul ales.
                  </div>
                ) : (
                  seasonStages.map((stage) => (
                    <div key={stage.id} className="rounded-2xl border px-3 py-3" style={{ borderColor: "var(--ps-border)", background: "white" }}>
                      <div className="text-sm font-extrabold" style={{ color: "var(--ps-text)" }}>
                        Etapa {stage.stage ?? "—"} · {stage.category}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                        {stage.title}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--ps-muted)" }}>
                        {formatDateRO(stage.date)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="rounded-3xl border p-5" style={{ borderColor: "var(--ps-border)", background: "var(--ps-card)", boxShadow: "0 3px 6px rgba(0,0,0,0.08)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--ps-muted)" }}>
                  {section === "faculties" ? "Facultăți" : "Individual"}
                </div>
                <h2 className="mt-1 text-2xl font-extrabold" style={{ color: "var(--ps-primary)" }}>
                  {section === "faculties" ? "Clasament facultăți" : "Clasament individual"}
                </h2>
                <div className="mt-1 text-sm" style={{ color: "var(--ps-muted)" }}>
                  Filtru: {section === "individual" && currentFilter.key.startsWith("employee_")
                    ? currentFilter.label.replace("Profesori/", "")
                    : currentFilter.label}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 rounded-2xl border px-4 py-8 text-sm" style={{ borderColor: "var(--ps-border)", background: "white", color: "var(--ps-muted)" }}>
                Se încarcă clasamentele campionatului...
              </div>
            ) : error ? (
              <div className="mt-6 rounded-2xl border px-4 py-8 text-sm" style={{ borderColor: "#fecaca", background: "#fff1f2", color: "#991b1b" }}>
                {error}
              </div>
            ) : activeRows.length === 0 ? (
              <div className="mt-6 rounded-2xl border px-4 py-8 text-sm" style={{ borderColor: "var(--ps-border)", background: "white", color: "var(--ps-muted)" }}>
                Nu există încă suficiente date pentru acest clasament.
              </div>
            ) : section === "faculties" ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ps-border)", textAlign: "left" }}>
                      <th className="px-3 py-3">Loc</th>
                      <th className="px-3 py-3">Facultate</th>
                      <th className="px-3 py-3 text-right">Puncte</th>
                      <th className="px-3 py-3 text-right">Participări</th>
                      <th className="px-3 py-3 text-right">Jucători</th>
                      <th className="px-3 py-3 text-right">Etape</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facultyStandings.map((row) => (
                      <tr key={row.faculty} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td className="px-3 py-3 font-extrabold" style={{ color: "var(--ps-primary)" }}>{row.rank}</td>
                        <td className="px-3 py-3 font-semibold" style={{ color: "var(--ps-text)" }}>{row.faculty}</td>
                        <td className="px-3 py-3 text-right font-extrabold" style={{ color: "var(--ps-text)" }}>{row.points}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.participations}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.playersCount}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.stageCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ps-border)", textAlign: "left" }}>
                      <th className="px-3 py-3">Loc</th>
                      <th className="px-3 py-3">Jucător</th>
                      <th className="px-3 py-3">Facultate</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3 text-right">Puncte</th>
                      <th className="px-3 py-3 text-right">Participări</th>
                      <th className="px-3 py-3 text-right">Etape</th>
                      <th className="px-3 py-3 text-right">Cel mai bun loc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {individualStandings.map((row) => (
                      <tr key={row.playerId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td className="px-3 py-3 font-extrabold" style={{ color: "var(--ps-primary)" }}>{row.rank}</td>
                        <td className="px-3 py-3 font-semibold" style={{ color: "var(--ps-text)" }}>{row.name}</td>
                        <td className="px-3 py-3" style={{ color: "var(--ps-text)" }}>{row.faculty}</td>
                        <td className="px-3 py-3" style={{ color: "var(--ps-muted)" }}>{row.roleLabel}</td>
                        <td className="px-3 py-3 text-right font-extrabold" style={{ color: "var(--ps-text)" }}>{row.points}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.participations}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.stageCount}</td>
                        <td className="px-3 py-3 text-right" style={{ color: "var(--ps-muted)" }}>{row.bestResult ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
