"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Mode = "login" | "register";

export default function LoginPage() {
    const router = useRouter();

    const [mode, setMode] = useState<Mode>("login");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // register extras
    const [firstName, setFirstName] = useState(""); // Prenume
    const [lastName, setLastName] = useState("");  // Nume
    const [hasAmatur, setHasAmatur] = useState(false);
    const [amaturMp, setAmaturMp] = useState<string>("");

    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    function displayNameLN_FN() {
        const ln = lastName.trim();
        const fn = firstName.trim();
        return `${ln} ${fn}`.trim(); // "Nume Prenume"
    }

    async function ensurePlayerProfile() {
        const { data: authData, error: gErr } = await supabase.auth.getUser();
        if (gErr) throw gErr;

        const u = authData?.user;
        if (!u) throw new Error("Nu există user autentificat.");

        const meta: any = u.user_metadata ?? {};
        const fn = (meta.first_name ?? "").toString().trim();
        const ln = (meta.last_name ?? "").toString().trim();
        const dn = (meta.display_name ?? `${ln} ${fn}`.trim()).toString().trim();

        const hasAmatur = !!meta.has_amatur_account;
        const mpRaw = meta.amatur_mp;
        const mp = mpRaw === null || mpRaw === undefined || mpRaw === "" ? null : Number(mpRaw);
        const mpInt = Number.isFinite(mp) && mp! >= 0 ? Math.floor(mp!) : null;

        // UPSERT în players (acum ai sesiune => RLS permite id=auth.uid)
        const { error: pErr } = await supabase.from("players").upsert({
            id: u.id,
            first_name: fn || null,
            last_name: ln || null,
            display_name: dn || null,
            full_name: dn || "Utilizator", // fiind NOT NULL la tine
            has_amatur_account: hasAmatur,
            amatur_mp: mpInt,
        });

        if (pErr) throw pErr;
    }

    async function doLogin() {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setMsg(error.message);
            return;
        }

        try {
            await ensurePlayerProfile();
        } catch (e: any) {
            console.error(e);
            setMsg("Login OK, dar profilul nu s-a putut crea: " + (e?.message ?? ""));
        }

        router.push("/");
    }

    async function doRegister() {
        const ln = lastName.trim();
        const fn = firstName.trim();

        if (!ln) return setMsg("Te rog completează Nume.");
        if (!fn) return setMsg("Te rog completează Prenume.");

        let mp: number | null = null;
        if (hasAmatur) {
            const v = amaturMp.trim();
            if (v.length === 0) return setMsg("Te rog completează MP (punctele) dacă ai cont pe Amatur.");
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) return setMsg("MP trebuie să fie un număr >= 0.");
            mp = Math.floor(n);
        }

        const { data, error: regError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: fn,
                    last_name: ln,
                    display_name: `${fn} ${ln}`.trim(),
                    has_amatur_account: hasAmatur,
                    amatur_mp: mp,
                },
            },
        });

        if (regError) {
            setMsg(regError.message);
            return;
        }

        // user poate fi null dacă proiectul cere confirmare email, dar de obicei există
        const userId = data.user?.id ?? null;

        // Dacă nu avem userId, nu putem crea profilul în players acum.
        // Îi spunem userului să confirme email și apoi să facă login.
        if (!userId) {
            setMsg("Cont creat. Verifică emailul (dacă e necesar) și apoi fă login.");
            return;
        }

        const name = displayNameLN_FN();


        // Dacă email confirmation e ON, session poate fi null.
        // În cazul ăsta, profilul îl creăm la primul login (când există sesiune).
        if (!data.session) {
            setMsg("Cont creat. Verifică emailul (confirmare) și apoi fă login. Profilul se va crea automat la primul login.");
            return;
        }

        // Dacă există sesiune (confirmare OFF), putem crea profilul acum:
        await ensurePlayerProfile();
        router.push("/");

        if (pErr) {
            setMsg("Cont creat, dar profilul (players) nu a putut fi salvat: " + pErr.message);
            return;
        }

        // În unele configurații ești deja logat după signUp; dacă nu, userul va face login.
        router.push("/");
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            if (mode === "login") await doLogin();
            else await doRegister();
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900 }}>PoliSport TT-Manager</h1>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button
                    type="button"
                    onClick={() => { setMode("login"); setMsg(null); }}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        fontWeight: 800,
                        background: mode === "login" ? "black" : "black",
                    }}
                >
                    Login
                </button>

                <button
                    type="button"
                    onClick={() => { setMode("register"); setMsg(null); }}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        fontWeight: 800,
                        background: mode === "register" ? "black" : "black",
                    }}
                >
                    Register
                </button>
            </div>

            <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {mode === "register" && (
                    <>
                        <input
                            placeholder="Nume"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                        />
                        <input
                            placeholder="Prenume"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                            <input
                                type="checkbox"
                                checked={hasAmatur}
                                onChange={(e) => setHasAmatur(e.target.checked)}
                            />
                            <span>Am cont și puncte în Circuitul Amatur</span>
                        </label>

                        {hasAmatur && (
                            <input
                                placeholder="MP (puncte Amatur) – ex: 1234"
                                value={amaturMp}
                                onChange={(e) => setAmaturMp(e.target.value)}
                                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                            />
                        )}
                    </>
                )}

                <input
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                    placeholder="Parolă"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
                />

                <button
                    disabled={busy}
                    style={{
                        marginTop: 6,
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        fontWeight: 900,
                        opacity: busy ? 0.6 : 1,
                    }}
                >
                    {mode === "login" ? "Login" : "Creează cont"}
                </button>
            </form>

            {msg && <p style={{ marginTop: 12, opacity: 0.9 }}>{msg}</p>}

            <p style={{ marginTop: 14, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
                Notă: Dacă proiectul tău are confirmare email activată, după Register vei primi un email și va trebui să confirmi înainte de login.
            </p>
        </main>
    );
}
