"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

async function invoke(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-participant-manager", { body: payload });
  if (error) {
    const response = (error as any)?.context as Response | undefined;
    if (response) {
      try {
        const body = await response.clone().json();
        if (body?.error) throw new Error(String(body.error));
        if (body?.message) throw new Error(String(body.message));
      } catch (parsed: any) {
        if (parsed instanceof Error && parsed.message && parsed.message !== "Unexpected end of JSON input") throw parsed;
      }
    }
    throw new Error(error.message || "Eroare comunicare cu serverul.");
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export default function AdminPlayerEditor({
  playerId,
  onClose,
  onSaved,
}: {
  playerId: string | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await invoke({ action: "get_player", player_id: playerId });
        if (cancelled) return;
        const p = data?.player ?? {};
        setFullName(String(p.full_name ?? p.display_name ?? ""));
        setEmail(String(p.email ?? ""));
        setPhone(String(p.phone ?? ""));
        setMp(String(p.mp ?? 2));
        setMpMax(String(p.mp_max ?? p.mp ?? 2));
        setHasAmatur(!!p.has_amatur_account);
        setAmaturMp(p.amatur_mp == null ? "" : String(p.amatur_mp));
        setAmatUrl(String(p.amat_url ?? ""));
        setUpbRole(String(p.upb_role ?? ""));
        setUpbCenter(String(p.upb_center ?? ""));
        setUpbFaculty(String(p.upb_faculty ?? ""));
        setUpbPartnerName(String(p.upb_partner_name ?? ""));
      } catch (e: any) {
        alert("Eroare încărcare profil: " + (e?.message ?? e));
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  if (!playerId) return null;

  const affiliationNeedsCenter = ["employee","student","alumni"].includes(upbRole);

  async function save() {
    if (!fullName.trim() || !email.trim()) return alert("Completează numele și e-mailul.");
    const mpValue = Number(mp);
    const mpMaxValue = Number(mpMax);
    if (!Number.isFinite(mpValue) || mpValue < 0 || !Number.isFinite(mpMaxValue) || mpMaxValue < 0) {
      return alert("MP și MP Max trebuie să fie valori numerice pozitive.");
    }
    if (hasAmatur && amaturMp !== "" && (!Number.isFinite(Number(amaturMp)) || Number(amaturMp) < 0)) {
      return alert("MP Amatur trebuie să fie o valoare numerică pozitivă.");
    }

    setSaving(true);
    try {
      await invoke({
        action: "update_player",
        player_id: playerId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        mp: mpValue,
        mp_max: mpMaxValue,
        has_amatur_account: hasAmatur,
        amatur_mp: hasAmatur && amaturMp !== "" ? Number(amaturMp) : "",
        amat_url: hasAmatur ? amatUrl.trim() : "",
        upb_role: upbRole || null,
        upb_center: upbCenter || null,
        upb_faculty: upbFaculty || null,
        upb_partner_name: upbPartnerName || null,
      });
      alert("Profilul jucătorului a fost actualizat.");
      if (onSaved) await onSaved();
      onClose();
    } catch (e: any) {
      alert("Eroare actualizare profil: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[92vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">Editează profilul jucătorului</h2>
            <p className="text-sm opacity-70 mt-1">Modificările sunt salvate în profil; e-mailul este sincronizat și cu autentificarea.</p>
          </div>
          <button type="button" className="ps-btn ps-btn-outline" onClick={onClose}>Închide</button>
        </div>

        {loading ? <div className="mt-5">Se încarcă profilul…</div> : (
          <div className="mt-5 grid gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="grid gap-1"><span className="text-sm font-bold">Nume complet</span><input className="border rounded-xl p-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
              <label className="grid gap-1"><span className="text-sm font-bold">E-mail</span><input className="border rounded-xl p-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="grid gap-1"><span className="text-sm font-bold">Telefon</span><input className="border rounded-xl p-3" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
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

            <button type="button" disabled={saving} className="ps-btn ps-btn-primary" onClick={save}>
              {saving ? "Se salvează…" : "Salvează modificările"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
