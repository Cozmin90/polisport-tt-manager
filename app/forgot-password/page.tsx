"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const validEmail = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);

    async function sendReset() {
        setErr(null);
        const e = email.trim().toLowerCase();

        if (!/\S+@\S+\.\S+/.test(e)) {
            setErr("Te rog introdu un email valid.");
            return;
        }

        setSending(true);
        try {
            const redirectTo =
                typeof window !== "undefined"
                    ? `${window.location.origin}/reset-password`
                    : undefined;

            const { error } = await supabase.auth.resetPasswordForEmail(e, {
                redirectTo,
            });

            if (error) throw error;

            setSentTo(e);
        } catch (ex: any) {
            setErr(ex?.message ?? "Eroare la trimiterea emailului de resetare.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div style={{ maxWidth: 520, margin: "40px auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <h1 style={{ margin: 0 }}>Recuperare parolă</h1>
                <Link href="/login" style={{ opacity: 0.9 }}>
                    Înapoi la login
                </Link>
            </div>

            <p style={{ opacity: 0.85, marginTop: 10 }}>
                Introdu emailul contului și îți trimitem un link pentru setarea unei parole noi.
            </p>

            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                <label style={{ fontWeight: 800 }}>Email</label>
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: nume@exemplu.ro"
                    autoComplete="email"
                    style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #444",
                        background: "transparent",
                        color: "inherit",
                    }}
                />

                <button
                    onClick={sendReset}
                    disabled={sending || !validEmail}
                    style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #444",
                        cursor: sending || !validEmail ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        opacity: sending || !validEmail ? 0.6 : 1,
                    }}
                >
                    {sending ? "Se trimite..." : "Trimite link de resetare"}
                </button>

                {sentTo ? (
                    <div
                        style={{
                            marginTop: 10,
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid #2a6",
                            background: "rgba(20, 180, 120, 0.08)",
                        }}
                    >
                        ✅ Dacă există un cont cu emailul <b>{sentTo}</b>, vei primi imediat un email
                        cu linkul de resetare. Verifică și Spam/Promotions.
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

                <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Notă (Supabase)</div>
                    În Supabase → Authentication → URL Configuration, asigură-te că ai
                    adăugat la <b>Redirect URLs</b>:
                    <div style={{ marginTop: 6, fontFamily: "monospace" }}>
                        {"http://localhost:3000/reset-password"}
                    </div>
                    (și domeniul tău de producție dacă e cazul)
                </div>
            </div>
        </div>
    );
}
