"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { MEDIA_LABEL, NOTICE_LABEL, PRIVACY_VERSION } from "../../lib/privacy";

type Mode = "login" | "register";

const inputStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.18)",
    background: "#fff",
    color: "inherit",
    outline: "none",
};

const buttonStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(15, 23, 42, 0.18)",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    transition: "background 150ms ease, transform 150ms ease, box-shadow 150ms ease",
};

export default function LoginClient() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const initialMode = (searchParams.get("mode") as Mode) || "login";
    const [mode, setMode] = useState<Mode>(initialMode);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [noticeRead, setNoticeRead] = useState(false);
    const [mediaConsent, setMediaConsent] = useState(false);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [hasAmatur, setHasAmatur] = useState(false);
    const [amaturMp, setAmaturMp] = useState("");

    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [btnHover, setBtnHover] = useState(false);

    useEffect(() => {
        const m = (searchParams.get("mode") as Mode) || "login";
        setMode(m);
    }, [searchParams]);

    async function ensurePlayerProfile() {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const u = data.user;
        if (!u) throw new Error("No user");

        const meta: any = u.user_metadata ?? {};
        const fn = meta.first_name ?? "";
        const ln = meta.last_name ?? "";
        const dn = meta.display_name ?? `${ln} ${fn}`.trim();

        await supabase.from("players").upsert({
            id: u.id,
            first_name: fn || null,
            last_name: ln || null,
            display_name: dn || null,
            full_name: dn || "Utilizator",
            has_amatur_account: !!meta.has_amatur_account,
            amatur_mp: meta.amatur_mp ?? null,
        });
    }

    async function doLogin() {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) return setMsg(error.message);

        await ensurePlayerProfile();
        router.push("/");
    }

    async function doRegister() {
        if (!noticeRead) return setMsg("Te rugăm să citești informarea privind datele personale și să confirmi că ai luat cunoștință de aceasta.");
        if (!lastName.trim()) return setMsg("Te rog completează Nume.");
        if (!firstName.trim()) return setMsg("Te rog completează Prenume.");

        let mp: number | null = null;
        if (hasAmatur) {
            const n = Number(amaturMp);
            if (!Number.isFinite(n) || n < 0) return setMsg("MP invalid.");
            mp = Math.floor(n);
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    display_name: `${firstName} ${lastName}`.trim(),
                    has_amatur_account: hasAmatur,
                    amatur_mp: mp,
                    privacy_version: PRIVACY_VERSION,
                    privacy_notice_read: noticeRead,
                    media_consent: mediaConsent,
                },
            },
        });

        if (error) return setMsg(error.message);

        if (!data.session) {
            return setMsg("Cont creat. Verifică emailul și apoi fă login.");
        }

        await ensurePlayerProfile();
        router.push("/");
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            mode === "login" ? await doLogin() : await doRegister();
        } catch {
            setMsg("Operațiunea nu a reușit. Te rugăm să încerci din nou.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h1 style={{ fontSize: 22, fontWeight: 900 }}>
                    {mode === "login" ? "Login" : "Register"}
                </h1>
                <Link href="/" style={{ fontSize: 13 }}>
                    ← Acasă
                </Link>
            </div>

            <div style={{ marginTop: 12 }}>
                {mode === "login" ? (
                    <Link href="/login?mode=register" style={{ fontSize: 13 }}>
                        Nu ai cont? Creează unul
                    </Link>
                ) : (
                    <Link href="/login?mode=login" style={{ fontSize: 13 }}>
                        Ai deja cont? Login
                    </Link>
                )}
            </div>

            <form onSubmit={onSubmit} style={{ marginTop: 20, display: "grid", gap: 12 }}>
                {mode === "register" && (
                    <>
                        <input
                            style={inputStyle}
                            placeholder="Nume"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                        <input
                            style={inputStyle}
                            placeholder="Prenume"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                        />
                        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                            <input
                                type="checkbox"
                                checked={hasAmatur}
                                onChange={(e) => setHasAmatur(e.target.checked)}
                            />
                            Am cont Amatur
                        </label>
                        {hasAmatur && (
                            <input
                                style={inputStyle}
                                placeholder="MP Amatur"
                                value={amaturMp}
                                onChange={(e) => setAmaturMp(e.target.value)}
                            />
                        )}
                    </>
                )}

                <input
                    style={inputStyle}
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input
                    style={inputStyle}
                    placeholder="Parolă"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                {mode === "login" && (
                    <div style={{ textAlign: "right", marginTop: -6 }}>
                        <Link href="/forgot-password" style={{ fontSize: 13, opacity: 0.9 }}>
                            Ai uitat parola?
                        </Link>
                    </div>
                )}

                {mode === "register" ? (
                    <fieldset disabled={busy} style={{ display: "grid", gap: 14, border: "1px solid #888", padding: 14, borderRadius: 12 }}>
                        <legend>Date personale și foto-video</legend>
                        <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Citește informarea (filă nouă)</Link>
                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" required checked={noticeRead} onChange={(event) => setNoticeRead(event.target.checked)} /><span>{NOTICE_LABEL}</span></label>
                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={mediaConsent} onChange={(event) => setMediaConsent(event.target.checked)} /><span>{MEDIA_LABEL} <strong>Opțional.</strong></span></label>
                        <p style={{ fontSize: 13 }}>Poți crea contul și participa fără acord foto-video. Îl poți modifica ulterior din Contul meu.</p>
                    </fieldset>
                ) : null}

                <button
                    onMouseEnter={() => setBtnHover(true)}
                    onMouseLeave={() => setBtnHover(false)}
                    style={{
                        ...buttonStyle,
                        opacity: busy ? 0.6 : 1,
                        background: btnHover ? "#f1f5f9" : "#fff",
                        transform: btnHover ? "translateY(-1px)" : "translateY(0px)",
                        boxShadow: btnHover ? "0 6px 16px rgba(0,0,0,0.10)" : "none",
                    }}
                    disabled={busy}
                >
                    {mode === "login" ? "Login" : "Creează cont"}
                </button>
            </form>

            {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
        </main>
    );
}
