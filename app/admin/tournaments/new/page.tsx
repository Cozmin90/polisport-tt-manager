"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TournamentCategory = "ALL" | "HOBBY" | "ADVANCED" | "ELITE";
type TournamentFormat = "LOWER_UPPER_KO" | "GROUPS_KO";

function catLabel(c: TournamentCategory) {
    switch (c) {
        case "ALL":
            return "ALL (Open)";
        case "HOBBY":
            return "Hobby (<20 MP Max)";
        case "ADVANCED":
            return "Avansați (20–<40 MP Max)";
        case "ELITE":
            return "Elite (>=40 MP Max)";
        default:
            return c;
    }
}

function fmtLabel(f: TournamentFormat) {
    switch (f) {
        case "LOWER_UPPER_KO":
            return "Grupe inferioare → Grupe superioare → KO";
        case "GROUPS_KO":
            return "Grupe → KO";
        default:
            return f;
    }
}

export default function NewTournamentPage() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [startAtLocal, setStartAtLocal] = useState(""); // datetime-local string
    const [location, setLocation] = useState("");
    const [maxPlayers, setMaxPlayers] = useState<string>(""); // păstrăm ca string pt input

    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [format, setFormat] = useState<TournamentFormat>("GROUPS_KO");

    const [isRated, setIsRated] = useState(true);
    const [category, setCategory] = useState<TournamentCategory>("ALL");

    const [donationInfo, setDonationInfo] = useState("Gratuit");

    const [submitting, setSubmitting] = useState(false);
    const [errMsg, setErrMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        const t = title.trim();
        return t.length >= 3 && startAtLocal.trim().length > 0 && !submitting;
    }, [title, startAtLocal, submitting]);

    function toIsoFromDatetimeLocal(dt: string) {
        // dt e de forma "YYYY-MM-DDTHH:mm"
        // îl convertim în ISO folosind timezone local al browserului
        const d = new Date(dt);
        return d.toISOString();
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrMsg(null);
        setOkMsg(null);

        const t = title.trim();
        if (t.length < 3) {
            setErrMsg("Titlul trebuie să aibă minim 3 caractere.");
            return;
        }
        if (!startAtLocal) {
            setErrMsg("Alege data și ora de start.");
            return;
        }

        const maxPlayersInt =
            maxPlayers.trim() === "" ? null : Number.parseInt(maxPlayers.trim(), 10);

        if (maxPlayersInt !== null && (!Number.isFinite(maxPlayersInt) || maxPlayersInt < 2)) {
            setErrMsg("Numărul maxim de jucători trebuie să fie gol sau >= 2.");
            return;
        }

        setSubmitting(true);
        try {
            // opțional: verifică auth (dacă ai RLS pentru admin)
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) {
                setErrMsg("Trebuie să fii autentificat ca să creezi un turneu.");
                setSubmitting(false);
                return;
            }

            const payload: any = {
                title: t,
                start_at: toIsoFromDatetimeLocal(startAtLocal),
                location: location.trim() === "" ? null : location.trim(),
                max_players: maxPlayersInt,
                registration_open: registrationOpen,
                format,
                status: "UPCOMING", // poți lăsa și default în DB; e ok și explicit
                is_rated: isRated,
                category,
                donation_info: donationInfo.trim() === "" ? "Gratuit" : donationInfo.trim(),
            };

            const { error } = await supabase.from("tournaments").insert(payload);

            if (error) {
                setErrMsg(`Eroare la creare turneu: ${error.message}`);
                setSubmitting(false);
                return;
            }

            setOkMsg("Turneul a fost creat.");
            // trimite înapoi pe Home (sau /tournaments)
            router.push("/");
            router.refresh();
        } catch (err: any) {
            setErrMsg(`Eroare neașteptată: ${err?.message ?? String(err)}`);
            setSubmitting(false);
        }
    }

    return (
        <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 800 }}>Creează turneu</h1>
                    <p style={{ opacity: 0.8, marginTop: 6 }}>
                        Completează detaliile. Categoria folosește MP Max (anti-smurf).
                    </p>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Link
                        href="/"
                        style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            textDecoration: "none",
                        }}
                    >
                        Înapoi
                    </Link>
                </div>
            </header>

            <form
                onSubmit={onSubmit}
                style={{
                    marginTop: 18,
                    border: "1px solid #eee",
                    borderRadius: 14,
                    padding: 16,
                    display: "grid",
                    gap: 14,
                }}
            >
                {errMsg && (
                    <div
                        style={{
                            border: "1px solid #f3c",
                            borderRadius: 12,
                            padding: 10,
                            background: "rgba(255,0,120,0.05)",
                        }}
                    >
                        <b>Eroare:</b> {errMsg}
                    </div>
                )}

                {okMsg && (
                    <div
                        style={{
                            border: "1px solid #0a7",
                            borderRadius: 12,
                            padding: 10,
                            background: "rgba(0,160,110,0.06)",
                        }}
                    >
                        {okMsg}
                    </div>
                )}

                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 700 }}>Titlu turneu *</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: PoliSport TT – Etapa 1"
                        style={{
                            padding: 12,
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            fontSize: 14,
                        }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Minim 3 caractere.
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Data & ora start *</label>
                        <input
                            type="datetime-local"
                            value={startAtLocal}
                            onChange={(e) => setStartAtLocal(e.target.value)}
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                            }}
                        />
                        {startAtLocal && (
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                                Preview (24h):{" "}
                                <b>
                                    {new Date(startAtLocal).toLocaleString("ro-RO", {
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: false,
                                    })}
                                </b>
                            </div>
                        )}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Locație (opțional)</label>
                        <input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Ex: UPB, Cladire AN, hol central."
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Format</label>
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value as TournamentFormat)}
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                                background: "black",
                            }}
                        >
                            <option value="GROUPS_KO">{fmtLabel("GROUPS_KO")}</option>
                            <option value="LOWER_UPPER_KO">{fmtLabel("LOWER_UPPER_KO")}</option>
                        </select>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Max jucători (opțional)</label>
                        <input
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(e.target.value)}
                            placeholder="Ex: 16 (lasă gol pentru nelimitat)"
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Tip turneu</label>
                        <select
                            value={isRated ? "RATED" : "FUN"}
                            onChange={(e) => setIsRated(e.target.value === "RATED")}
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                                background: "black",
                            }}
                        >
                            <option value="RATED">Punctat (modifică MP)</option>
                            <option value="FUN">Agrement (NU modifică MP)</option>
                        </select>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Categoria turneului</label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as TournamentCategory)}
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                                background: "black",
                            }}
                        >
                            <option value="ALL">{catLabel("ALL")}</option>
                            <option value="HOBBY">{catLabel("HOBBY")}</option>
                            <option value="ADVANCED">{catLabel("ADVANCED")}</option>
                            <option value="ELITE">{catLabel("ELITE")}</option>
                        </select>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                            Regula: jucătorul poate juca la categoria lui sau cu o treaptă mai sus.
                        </div>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Înscrieri deschise?</label>
                        <select
                            value={registrationOpen ? "true" : "false"}
                            onChange={(e) => setRegistrationOpen(e.target.value === "true")}
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                                background: "black",
                            }}
                        >
                            <option value="true">Da</option>
                            <option value="false">Nu</option>
                        </select>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 700 }}>Donație minimă recomandată</label>
                        <input
                            value={donationInfo}
                            onChange={(e) => setDonationInfo(e.target.value)}
                            placeholder='Ex: "Gratuit", "10 lei", "Minim 50 lei (caritabil)"'
                            style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                fontSize: 14,
                            }}
                        />
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                            Nu e obligatorie. Poți folosi text liber pentru turnee caritabile.
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                        type="button"
                        onClick={() => router.push("/")}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "black",
                            cursor: "pointer",
                        }}
                        disabled={submitting}
                    >
                        Renunță
                    </button>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: canSubmit ? "black" : "black",
                            cursor: canSubmit ? "pointer" : "not-allowed",
                            fontWeight: 700,
                        }}
                    >
                        {submitting ? "Se creează..." : "Creează turneu"}
                    </button>
                </div>
            </form>

            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
                Notă: dacă ai RLS strict, insert-ul poate e permis doar adminilor.
            </div>
        </main>
    );
}
