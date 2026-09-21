"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type SearchPlayer = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  mp: number;
  mp_max: number;
};

export default function AdminParticipantManager() {
  const pathname = usePathname();
  const tournamentId = useMemo(() => {
    const match = pathname.match(/^\/admin\/tournaments\/([0-9a-fA-F-]{36})$/);
    return match?.[1] ?? null;
  }, [pathname]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  if (!tournamentId) return null;

  async function invoke(payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-participant-manager", { body: payload });
    if (error) throw new Error(error.message || "Eroare comunicare cu serverul.");
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function searchPlayers() {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await invoke({ action: "search", query: q });
      setResults((data?.players ?? []) as SearchPlayer[]);
    } catch (e: any) {
      alert("Eroare căutare: " + (e?.message ?? e));
    } finally {
      setSearching(false);
    }
  }

  async function addExisting(player: SearchPlayer) {
    if (!window.confirm(`Îl înscrii pe ${player.full_name} în acest turneu?`)) return;
    setSaving(true);
    try {
      const data = await invoke({
        action: "add_existing",
        tournament_id: tournamentId,
        player_id: player.id,
      });
      alert(data?.already_registered
        ? "Jucătorul este deja înscris în acest turneu."
        : data?.reactivated
          ? "Înscrierea jucătorului a fost reactivată."
          : "Jucătorul a fost înscris în turneu.");
      setOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert("Eroare înscriere: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function createAndAdd() {
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      alert("Completează numele, e-mailul și telefonul.");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) {
      alert("Telefonul trebuie să conțină cel puțin 6 cifre.");
      return;
    }
    const temporaryPassword = digits.slice(-6);
    const ok = window.confirm(
      `Se va crea contul pentru ${fullName.trim()} și va fi înscris în turneu.\n\nParola inițială va fi: ${temporaryPassword}\n(ultimele 6 cifre ale telefonului)\n\nContinui?`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const data = await invoke({
        action: "create_and_add",
        tournament_id: tournamentId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      alert(
        `Cont creat și participant înscris cu succes.\n\nUtilizator: ${email.trim()}\nParolă inițială: ${data?.temporary_password ?? temporaryPassword}\n\nRecomandă-i să schimbe parola după prima autentificare.`
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert("Eroare creare participant: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-[79] rounded-full px-4 py-3 font-extrabold shadow-lg"
        style={{ background: "#111827", color: "white" }}
      >
        + Adaugă participant
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[88vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">Adaugă participant în turneu</h2>
                <p className="text-sm opacity-70 mt-1">Caută un cont existent sau creează unul nou din datele primite la înscriere.</p>
              </div>
              <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Închide</button>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("search")}
                className={`ps-btn ${mode === "search" ? "ps-btn-primary" : "ps-btn-outline"}`}
              >
                Caută cont existent
              </button>
              <button
                type="button"
                onClick={() => setMode("create")}
                className={`ps-btn ${mode === "create" ? "ps-btn-primary" : "ps-btn-outline"}`}
              >
                Creează cont nou
              </button>
            </div>

            {mode === "search" ? (
              <div className="mt-5">
                <label className="text-sm font-bold">Nume, e-mail sau telefon</label>
                <div className="mt-2 flex gap-2">
                  <input
                    className="border rounded-xl p-3 flex-1"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") searchPlayers(); }}
                    placeholder="Ex.: Popescu, nume@email.ro sau 072..."
                    autoFocus
                  />
                  <button type="button" className="ps-btn ps-btn-primary" onClick={searchPlayers} disabled={searching}>
                    {searching ? "Caut..." : "Caută"}
                  </button>
                </div>

                <div className="mt-4 grid gap-2">
                  {!searching && query.trim().length >= 2 && results.length === 0 ? (
                    <div className="border rounded-xl p-4 bg-gray-50">
                      <div className="font-bold">Nu am găsit niciun cont.</div>
                      <button
                        type="button"
                        className="ps-btn ps-btn-outline mt-3"
                        onClick={() => {
                          setFullName(query.includes("@") || /\d/.test(query) ? "" : query);
                          setEmail(query.includes("@") ? query : "");
                          setPhone(/^\+?[\d\s().-]+$/.test(query) ? query : "");
                          setMode("create");
                        }}
                      >
                        Creează participant nou
                      </button>
                    </div>
                  ) : null}

                  {results.map((p) => (
                    <div key={p.id} className="border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-extrabold">{p.full_name}</div>
                        <div className="text-sm opacity-70">{p.email || "fără e-mail afișat"}{p.phone ? ` · ${p.phone}` : ""}</div>
                        <div className="text-xs opacity-60 mt-1">MP: {p.mp ?? 2} · MP Max: {p.mp_max ?? p.mp ?? 2}</div>
                      </div>
                      <button type="button" disabled={saving} className="ps-btn ps-btn-primary" onClick={() => addExisting(p)}>
                        Înscrie în turneu
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <div className="rounded-xl border p-3 bg-amber-50 text-sm">
                  Contul va fi creat cu e-mailul confirmat. Parola inițială va fi formată din <b>ultimele 6 cifre ale numărului de telefon</b>.
                </div>
                <label className="grid gap-1">
                  <span className="text-sm font-bold">Nume complet</span>
                  <input className="border rounded-xl p-3" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nume Prenume" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-bold">E-mail</span>
                  <input className="border rounded-xl p-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nume@email.ro" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-bold">Telefon</span>
                  <input className="border rounded-xl p-3" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" />
                </label>
                {phone.replace(/\D/g, "").length >= 6 ? (
                  <div className="text-sm opacity-70">Parola inițială va fi: <b>{phone.replace(/\D/g, "").slice(-6)}</b></div>
                ) : null}
                <button type="button" disabled={saving} className="ps-btn ps-btn-primary" onClick={createAndAdd}>
                  {saving ? "Se creează..." : "Creează contul și înscrie participantul"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
