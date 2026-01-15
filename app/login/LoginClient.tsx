"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Mode = "login" | "register";

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "2px solid #fff",
  background: "transparent",
  color: "inherit",
  outline: "none",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "2px solid #fff",
  background: "transparent",
  fontWeight: 900,
  cursor: "pointer",
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = (searchParams.get("mode") as Mode) || "login";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [hasAmatur, setHasAmatur] = useState(false);
  const [amaturMp, setAmaturMp] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

        <button style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {mode === "login" ? "Login" : "Creează cont"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </main>
  );
}
