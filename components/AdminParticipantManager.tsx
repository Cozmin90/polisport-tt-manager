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

const UPB_FACULTIES = [
  "1. Facultatea de Inginerie Electrică",
  "2. Facultatea de Inginerie Industrială și Robotică",
  "3. Facultatea de Inginerie Chimică și Biotehnologii",
  "4. Facultatea de Energetică",
  "5. Facultatea de Ingineria Sistemelor Biotehnice",
  "6. Facultatea de Inginerie în Limbi Străine",
  "7. Facultatea de Automatică și Calculatoare",
  "8. Facultatea de Transporturi",
  "9. Facultatea de Științe Aplicate",
  "10. Facultatea de Electronică, Telecomunicații și Tehnologia Informației",
  "11. Facultatea de Inginerie Aerospațială",
  "12. Facultatea de Inginerie Medicală",
  "13. Facultatea de Inginerie Mecanică și Mecatronică",
  "14. Facultatea de Știința și Ingineria Materialelor",
  "15. Facultatea de Antreprenoriat, Ingineria și Managementul Afacerilor",
  "16. Facultatea de Științe, Educație Fizică și Informatică",
  "17. Facultatea de Mecanică și Tehnologie",
  "18. Facultatea de Electronică, Comunicații și Calculatoare",
  "19. Facultatea de Științe ale Educației, Științe Sociale și Psihologie",
  "20. Facultatea de Științe Economice și Drept",
  "21. Facultatea de Teologie, Litere, Istorie și Arte",
  "22. Rectorat / Administrativ",
];

export default function AdminParticipantManager() {
  const pathname = usePathname();
  const tournamentId = useMemo(() => pathname.match(/^\/admin\/tournaments\/([0-9a-fA-F-]{36})$/)?.[1] ?? null, [pathname]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mp, setMp] = useState("2");
  const [mpMax, setMpMax] = useState("2");
  const [hasAmatur, setHasAmatur] = useState(false);
  const [amaturMp, setAmaturMp] = useState("");
  const [amatUrl, setAmatUrl] = useState("");
  const [upbRole, setUpbRole] = useState("");
  const [upbCenter, setUpbCenter] = useState("");
  const [upbFaculty, setUpbFaculty] = useState("");
  const [upbPartnerName, setUpbPartnerName] = useState("");

  if (!tournamentId) return null;

  async function invoke(payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-participant-manager", { body: payload });

    if (error) {
      // Supabase wraps non-2xx Edge Function responses in FunctionsHttpError.
      // Read the actual JSON/text returned by our function so the admin sees the real cause.
      const response = (error as any)?.context as Response | undefined;
      if (response) {
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          if (body?.error) throw new Error(String(body.error));
          if (body?.message) throw new Error(String(body.message));
        } catch (parsed: any) {
          if (parsed instanceof Error && parsed.message && parsed.message !== "Unexpected end of JSON input") {
            throw parsed;
          }
          try {
            const text = await response.clone().text();
            if (text) throw new Error(text);
          } catch (textErr: any) {
            if (textErr instanceof Error && textErr.message) throw textErr;
          }
        }
      }
      throw new Error(error.message || "Eroare comunicare cu serverul.");
    }

    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  async function searchPlayers() {
    const q = query.trim();
    if (q.length < 2) return setResults([]);
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
      const data = await invoke({ action: "add_existing", tournament_id: tournamentId, player_id: player.id });
      alert(data?.already_registered ? "Jucătorul este deja înscris în acest turneu." : data?.reactivated ? "Înscrierea jucătorului a fost reactivată." : "Jucătorul a fost înscris în turneu.");
      setOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert("Eroare înscriere: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function resetCreateForm() {
    setFullName(""); setEmail(""); setPhone("");
    setMp("2"); setMpMax("2");
    setHasAmatur(false); setAmaturMp(""); setAmatUrl("");
    setUpbRole(""); setUpbCenter(""); setUpbFaculty(""); setUpbPartnerName("");
  }

  async function createAndAdd() {
    if (!fullName.trim() || !email.trim() || !phone.trim()) return alert("Completează numele, e-mailul și telefonul.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) return alert("Telefonul trebuie să conțină cel puțin 6 cifre.");

    const mpValue = Number(mp);
    const mpMaxValue = Number(mpMax);
    if (!Number.isFinite(mpValue) || mpValue < 0 || !Number.isFinite(mpMaxValue) || mpMaxValue < 0) return alert("MP și MP Max trebuie să fie valori numerice pozitive.");
    if (hasAmatur && amaturMp !== "" && (!Number.isFinite(Number(amaturMp)) || Number(amaturMp) < 0)) return alert("MP Amatur trebuie să fie o valoare numerică pozitivă.");

    const temporaryPassword = digits.slice(-6);
    if (!window.confirm(`Se va crea contul pentru ${fullName.trim()} și va fi înscris în turneu.\n\nParola inițială: ${temporaryPassword}\n\nContinui?`)) return;

    setSaving(true);
    try {
      const data = await invoke({
        action: "create_and_add",
        tournament_id: tournamentId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        mp: mpValue,
        mp_max: mpMaxValue,
        has_amatur_account: hasAmatur,
        amatur_mp: hasAmatur && amaturMp !== "" ? Number(amaturMp) : 0,
        amat_url: hasAmatur ? amatUrl.trim() : "",
        upb_role: upbRole || null,
        upb_center: upbCenter || null,
        upb_faculty: upbFaculty || null,
        upb_partner_name: upbPartnerName || null,
      });
      alert(`Cont creat și participant înscris cu succes.\n\nUtilizator: ${email.trim()}\nParolă inițială: ${data?.temporary_password ?? temporaryPassword}\n\nRecomandă-i să schimbe parola după prima autentificare.`);
      resetCreateForm();
      setOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert("Eroare creare participant: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const affiliationNeedsCenter = ["employee","student","alumni"].includes(upbRole);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-5 z-[79] rounded-full px-4 py-3 font-extrabold shadow-lg" style={{ background: "#111827", color: "white" }}>
        + Adaugă participant
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">Adaugă participant în turneu</h2>
                <p className="text-sm opacity-70 mt-1">Caută un cont existent sau creează unul nou cu profilul complet.</p>
              </div>
              <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Închide</button>
            </div>

            <div className="mt-5 flex gap-2 flex-wrap">
              <button type="button" onClick={() => setMode("search")} className={`ps-btn ${mode === "search" ? "ps-btn-primary" : "ps-btn-outline"}`}>Caută cont existent</button>
              <button type="button" onClick={() => setMode("create")} className={`ps-btn ${mode === "create" ? "ps-btn-primary" : "ps-btn-outline"}`}>Creează cont nou</button>
            </div>

            {mode === "search" ? (
              <div className="mt-5">
                <label className="text-sm font-bold">Nume, e-mail sau telefon</label>
                <div className="mt-2 flex gap-2">
                  <input className="border rounded-xl p-3 flex-1" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchPlayers(); }} placeholder="Ex.: Popescu, nume@email.ro sau 072..." autoFocus />
                  <button type="button" className="ps-btn ps-btn-primary" onClick={searchPlayers} disabled={searching}>{searching ? "Caut..." : "Caută"}</button>
                </div>
                <div className="mt-4 grid gap-2">
                  {!searching && query.trim().length >= 2 && results.length === 0 ? (
                    <div className="border rounded-xl p-4 bg-gray-50">
                      <div className="font-bold">Nu am găsit niciun cont.</div>
                      <button type="button" className="ps-btn ps-btn-outline mt-3" onClick={() => {
                        setFullName(query.includes("@") || /\d/.test(query) ? "" : query);
                        setEmail(query.includes("@") ? query : "");
                        setPhone(/^\+?[\d\s().-]+$/.test(query) ? query : "");
                        setMode("create");
                      }}>Creează participant nou</button>
                    </div>
                  ) : null}
                  {results.map((p) => (
                    <div key={p.id} className="border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-extrabold">{p.full_name}</div>
                        <div className="text-sm opacity-70">{p.email || "fără e-mail afișat"}{p.phone ? ` · ${p.phone}` : ""}</div>
                        <div className="text-xs opacity-60 mt-1">MP: {p.mp ?? 2} · MP Max: {p.mp_max ?? p.mp ?? 2}</div>
                      </div>
                      <button type="button" disabled={saving} className="ps-btn ps-btn-primary" onClick={() => addExisting(p)}>Înscrie în turneu</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <div className="rounded-xl border p-3 bg-amber-50 text-sm">Contul va fi creat cu e-mailul confirmat. Parola inițială va fi formată din <b>ultimele 6 cifre ale numărului de telefon</b>.</div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="grid gap-1"><span className="text-sm font-bold">Nume complet</span><input className="border rounded-xl p-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
                  <label className="grid gap-1"><span className="text-sm font-bold">E-mail</span><input className="border rounded-xl p-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  <label className="grid gap-1"><span className="text-sm font-bold">Telefon</span><input className="border rounded-xl p-3" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
                  <div className="grid gap-1"><span className="text-sm font-bold">Parolă inițială</span><div className="border rounded-xl p-3 bg-gray-50">{phone.replace(/\D/g, "").length >= 6 ? phone.replace(/\D/g, "").slice(-6) : "—"}</div></div>
                </div>

                <div className="border-t pt-4">
                  <div className="font-extrabold mb-3">Clasificare valorică</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="grid gap-1"><span className="text-sm font-bold">MP curent</span><input type="number" min="0" className="border rounded-xl p-3" value={mp} onChange={(e) => setMp(e.target.value)} /></label>
                    <label className="grid gap-1"><span className="text-sm font-bold">MP Max</span><input type="number" min="0" className="border rounded-xl p-3" value={mpMax} onChange={(e) => setMpMax(e.target.value)} /></label>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="font-extrabold mb-3">Cont Amatur</div>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={hasAmatur} onChange={(e) => setHasAmatur(e.target.checked)} /><span>Are cont Amatur</span></label>
                  {hasAmatur ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <label className="grid gap-1"><span className="text-sm font-bold">MP Amatur</span><input type="number" min="0" className="border rounded-xl p-3" value={amaturMp} onChange={(e) => setAmaturMp(e.target.value)} /></label>
                      <label className="grid gap-1"><span className="text-sm font-bold">Link profil Amatur</span><input className="border rounded-xl p-3" value={amatUrl} onChange={(e) => setAmatUrl(e.target.value)} placeholder="https://..." /></label>
                    </div>
                  ) : null}
                </div>

                <div className="border-t pt-4">
                  <div className="font-extrabold mb-3">Statut și afiliere UPB</div>
                  <div className="grid gap-3">
                    <select className="border rounded-xl p-3" value={upbRole} onChange={(e) => { setUpbRole(e.target.value); setUpbCenter(""); setUpbFaculty(""); setUpbPartnerName(""); }}>
                      <option value="">Nesetat</option>
                      <option value="employee">Profesor / Angajat UPB</option>
                      <option value="student">Student UPB</option>
                      <option value="alumni">Alumni UPB</option>
                      <option value="partner">Partener UPB</option>
                      <option value="guest">Invitat UPB</option>
                    </select>
                    {affiliationNeedsCenter ? (
                      <div className="grid sm:grid-cols-2 gap-3">
                        <select className="border rounded-xl p-3" value={upbCenter} onChange={(e) => setUpbCenter(e.target.value)}>
                          <option value="">Centru universitar</option>
                          <option value="BUC">UPB București</option>
                          <option value="PIT">UPB Pitești</option>
                        </select>
                        <select className="border rounded-xl p-3" value={upbFaculty} onChange={(e) => setUpbFaculty(e.target.value)}>
                          <option value="">Selectează facultatea</option>
                          {UPB_FACULTIES.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    ) : null}
                    {upbRole === "partner" ? <label className="grid gap-1"><span className="text-sm font-bold">Denumire partener</span><input className="border rounded-xl p-3" value={upbPartnerName} onChange={(e) => setUpbPartnerName(e.target.value)} /></label> : null}
                  </div>
                </div>

                <button type="button" disabled={saving} className="ps-btn ps-btn-primary" onClick={createAndAdd}>{saving ? "Se creează..." : "Creează contul și înscrie participantul"}</button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
