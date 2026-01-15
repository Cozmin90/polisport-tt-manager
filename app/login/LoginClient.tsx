"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../utils/supabase/client";


export default function LoginClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const supabase = createClient();

    const next = searchParams.get("next") || "/";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        router.push(next);
    }

    return (
        <div style={{ maxWidth: 400, margin: "60px auto" }}>
            <h1>Autentificare</h1>

            <form onSubmit={handleLogin}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ display: "block", width: "100%", marginBottom: 10 }}
                />

                <input
                    type="password"
                    placeholder="Parolă"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ display: "block", width: "100%", marginBottom: 10 }}
                />

                <button type="submit" disabled={loading}>
                    {loading ? "Se autentifică..." : "Login"}
                </button>
            </form>

            {error && (
                <p style={{ color: "red", marginTop: 10 }}>
                    {error}
                </p>
            )}
        </div>
    );
}
