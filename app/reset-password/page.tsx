"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPasswordPage() {
    const [ready, setReady] = useState(false);
    const [hasSession, setHasSession] = useState<boolean>(false);

    const [pass1, setPass1] = useState("");
    const [pass2, setPass2] = useState("");

    const [saving, setSaving] = useState(false);
    const [ok, setOk] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // ✅ important: după ce am schimbat parola, nu mai arătăm ecranul de "link invalid"
    const [passwordChanged, setPasswordChanged] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function init() {
            const { data } = await supabase.auth.getSession();
            if (!mounted) return;
            setHasSession(!!data.session);
            setReady(true);
        }

        init();

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setHasSession(!!session);
        });

        return () => {
            mounted = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    async function save() {
        setErr(null);
        setOk(null);

        if (!pass1 || pass1.length < 6) {
            setErr("Parola trebuie să aibă minim 6 caractere.");
            return;
        }
        if (pass1 !== pass2) {
            setErr("Parolele nu coincid.");
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: pass1 });
            if (error) throw error;

            setPasswordChanged(true);
            setOk("✅ Parola a fost schimbată. Te poți autentifica acum.");
            setPass1("");
            setPass2("");

            // opțional: logout după reset, ca să forțezi login proaspăt
            // (acum NU mai strică UI-ul, fiindcă passwordChanged=true)
            await supabase.auth.signOut();
        } catch (ex: any) {
            setErr(ex?.message ?? "Eroare la schimbarea parolei.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ maxWidth: 520, margin: "40px auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <h1 style={{ margin: 0 }}>Setează parolă nouă</h1>
                <Link href="/login" style={{ opacity: 0.9 }}>
                    Login
                </Link>
            </div>

            <p style={{ opacity: 0.85, marginTop: 10 }}>
                Dacă ai ajuns aici din emailul de resetare, poți seta o parolă nouă.
            </p>

            {!ready ? (
                <div style={{ marginTop: 18, opacity: 0.85 }}>Se verifică linkul...</div>
            ) : passwordChanged ? (
                <div
                    style={{
                        marginTop: 18,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #2a6",
                        background: "rgba(20, 180, 120, 0.08)",
                    }}
                >
                    ✅ Parola a fost schimbată. Mergi la <Link href="/login">Login</Link>.
                </div>
            ) : !hasSession ? (
                <div
                    style={{
                        marginTop: 18,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #a33",
                        background: "rgba(200, 40, 40, 0.08)",
                    }}
                >
                    ❌ Link invalid/expirat sau sesiunea nu a putut fi validată.
                    <div style={{ marginTop: 8 }}>
                        Revino la <Link href="/forgot-password">Recuperare parolă</Link> și cere un link nou.
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                    <label style={{ fontWeight: 800 }}>Parolă nouă</label>
                    <input
                        type="password"
                        value={pass1}
                        onChange={(e) => setPass1(e.target.value)}
                        autoComplete="new-password"
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #444",
                            background: "transparent",
                            color: "inherit",
                        }}
                    />

                    <label style={{ fontWeight: 800 }}>Repetă parola</label>
                    <input
                        type="password"
                        value={pass2}
                        onChange={(e) => setPass2(e.target.value)}
                        autoComplete="new-password"
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #444",
                            background: "transparent",
                            color: "inherit",
                        }}
                    />

                    <button
                        onClick={save}
                        disabled={saving}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #444",
                            cursor: saving ? "not-allowed" : "pointer",
                            fontWeight: 900,
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        {saving ? "Se salvează..." : "Schimbă parola"}
                    </button>

                    {ok ? (
                        <div
                            style={{
                                marginTop: 10,
                                padding: 12,
                                borderRadius: 12,
                                border: "1px solid #2a6",
                                background: "rgba(20, 180, 120, 0.08)",
                            }}
                        >
                            {ok}
                        </div>
                    ) : null}

                    {err ? (
                        <div
                            style={{
                                marginTop: 10,
                                padding: 12,
                                borderRadius: 12,
                                border: "1px solid #a33",
                                background: "rgba(200, 40, 40, 0.08)",
                            }}
                        >
                            ❌ {err}
                        </div>
                    ) : null}
                </div>
            )}

            <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
                Dacă nu primești emailul: verifică Spam/Promotions și confirmă că în Supabase ai
                configurat Redirect URLs corect.
            </div>
        </div>
    );
}
