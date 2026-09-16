"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type Sponsor = { id: string; name: string; logo_url: string | null; website_url: string | null };
type Promo = { id: string; enabled: boolean; eyebrow: string | null; title: string; description: string | null; image_url: string | null; button_label: string | null; button_url: string | null; starts_at: string | null; ends_at: string | null };

function activePromo(p: Promo | null) {
  if (!p?.enabled) return false;
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return false;
  return true;
}

export default function BrandingEnhancer() {
  const pathname = usePathname();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoTarget, setPromoTarget] = useState<HTMLElement | null>(null);
  const [sponsorsByTournament, setSponsorsByTournament] = useState<Record<string, Sponsor[]>>({});
  const [tournamentTargets, setTournamentTargets] = useState<Record<string, HTMLElement>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminSponsors, setAdminSponsors] = useState<Sponsor[]>([]);
  const [newSponsorName, setNewSponsorName] = useState("");
  const [newSponsorWebsite, setNewSponsorWebsite] = useState("");
  const [newSponsorFile, setNewSponsorFile] = useState<File | null>(null);

  const adminTournamentId = useMemo(() => {
    const m = pathname.match(/^\/admin\/tournaments\/([^/]+)$/);
    return m?.[1] ?? null;
  }, [pathname]);

  async function loadPublic() {
    const { data: pc } = await supabase.from("promotional_cards").select("*").eq("id", "homepage-main").maybeSingle();
    setPromo((pc as Promo | null) ?? null);
    const { data: links } = await supabase.from("tournament_sponsors").select("tournament_id,display_order,sponsors:sponsor_id(id,name,logo_url,website_url)").order("display_order", { ascending: true });
    const map: Record<string, Sponsor[]> = {};
    for (const row of (links ?? []) as any[]) {
      const s = row.sponsors as Sponsor | null;
      if (!s) continue;
      (map[row.tournament_id] ||= []).push(s);
    }
    setSponsorsByTournament(map);
  }

  async function loadAdmin() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setIsAdmin(false);
    const { data: p } = await supabase.from("players").select("is_admin").eq("id", auth.user.id).maybeSingle();
    setIsAdmin(!!p?.is_admin);
    if (p?.is_admin) {
      const { data } = await supabase.from("sponsors").select("id,name,logo_url,website_url").order("name");
      setAdminSponsors((data as Sponsor[]) ?? []);
    }
  }

  useEffect(() => { loadPublic(); loadAdmin(); }, [pathname]);

  useEffect(() => {
    if (pathname !== "/") { setPromoTarget(null); setTournamentTargets({}); return; }
    const findTargets = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".ps-card"));
      const contribution = cards.find((el) => el.textContent?.includes("CONTRIBUIE ȘI TU")) ?? null;
      setPromoTarget(contribution);
      const found: Record<string, HTMLElement> = {};
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/tournaments/"]'))) {
        const id = a.getAttribute("href")?.split("/")[2];
        const card = a.closest<HTMLElement>(".ps-card");
        if (id && card) found[id] = card;
      }
      setTournamentTargets(found);
    };
    const timer = window.setTimeout(findTargets, 150);
    const observer = new MutationObserver(findTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [pathname]);

  async function uploadBranding(file: File, prefix: string) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  }

  async function addSponsor() {
    if (!adminTournamentId || !newSponsorName.trim()) return alert("Completează numele sponsorului.");
    setSaving(true);
    try {
      const logoUrl = newSponsorFile ? await uploadBranding(newSponsorFile, "sponsors") : null;
      const { data: s, error } = await supabase.from("sponsors").insert({ name: newSponsorName.trim(), website_url: newSponsorWebsite.trim() || null, logo_url: logoUrl }).select("id,name,logo_url,website_url").single();
      if (error) throw error;
      const { error: linkErr } = await supabase.from("tournament_sponsors").insert({ tournament_id: adminTournamentId, sponsor_id: s.id });
      if (linkErr) throw linkErr;
      setNewSponsorName(""); setNewSponsorWebsite(""); setNewSponsorFile(null);
      await loadPublic(); await loadAdmin();
    } catch (e: any) { alert("Eroare sponsor: " + (e?.message ?? e)); }
    finally { setSaving(false); }
  }

  async function attachSponsor(sponsorId: string) {
    if (!adminTournamentId) return;
    const { error } = await supabase.from("tournament_sponsors").insert({ tournament_id: adminTournamentId, sponsor_id: sponsorId });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) alert(error.message);
    await loadPublic();
  }

  async function detachSponsor(sponsorId: string) {
    if (!adminTournamentId) return;
    await supabase.from("tournament_sponsors").delete().eq("tournament_id", adminTournamentId).eq("sponsor_id", sponsorId);
    await loadPublic();
  }

  async function savePromo(next: Partial<Promo>, imageFile?: File | null) {
    setSaving(true);
    try {
      let image_url = next.image_url ?? promo?.image_url ?? null;
      if (imageFile) image_url = await uploadBranding(imageFile, "promos");
      const payload = { ...next, image_url, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("promotional_cards").update(payload).eq("id", "homepage-main");
      if (error) throw error;
      await loadPublic();
    } catch (e: any) { alert("Eroare card promoțional: " + (e?.message ?? e)); }
    finally { setSaving(false); }
  }

  const currentSponsors = adminTournamentId ? (sponsorsByTournament[adminTournamentId] ?? []) : [];
  const currentIds = new Set(currentSponsors.map((s) => s.id));

  return <>
    {pathname === "/" && promoTarget && activePromo(promo) ? createPortal(
      <div className="p-6 h-full flex flex-col justify-center" style={{ minHeight: 250 }}>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex-1">
            {promo?.eyebrow ? <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--ps-muted)" }}>{promo.eyebrow}</div> : null}
            <div className="mt-1 text-xl font-extrabold" style={{ color: "var(--ps-primary)" }}>{promo?.title}</div>
            {promo?.description ? <p className="mt-3 text-sm" style={{ color: "var(--ps-muted)" }}>{promo.description}</p> : null}
            {promo?.button_label && promo?.button_url ? <a className="ps-btn ps-btn-primary text-sm inline-flex mt-4" href={promo.button_url} target="_blank" rel="noreferrer">{promo.button_label}</a> : null}
          </div>
          {promo?.image_url ? <img src={promo.image_url} alt="Promovare PoliSport" className="max-h-40 max-w-[220px] object-contain rounded-xl" /> : null}
        </div>
      </div>, promoTarget) : null}

    {pathname === "/" ? Object.entries(tournamentTargets).map(([tid, target]) => {
      const list = sponsorsByTournament[tid] ?? [];
      if (!list.length) return null;
      return createPortal(<div className="px-5 pb-4 flex flex-wrap items-center gap-3"><span className="text-[11px] font-extrabold uppercase" style={{ color: "var(--ps-muted)" }}>Cu sprijinul</span>{list.map(s => s.website_url ? <a key={s.id} href={s.website_url} target="_blank" rel="noreferrer" title={s.name}>{s.logo_url ? <img src={s.logo_url} alt={s.name} className="h-9 max-w-32 object-contain" /> : <span className="font-bold text-sm">{s.name}</span>}</a> : <span key={s.id} title={s.name}>{s.logo_url ? <img src={s.logo_url} alt={s.name} className="h-9 max-w-32 object-contain" /> : <span className="font-bold text-sm">{s.name}</span>}</span>)}</div>, target, `sponsor-${tid}`);
    }) : null}

    {isAdmin && adminTournamentId ? <>
      <button onClick={() => setShowAdmin(true)} className="fixed bottom-5 right-5 z-[80] rounded-full px-4 py-3 font-extrabold shadow-lg" style={{ background: "var(--ps-primary)", color: "white" }}>Sponsorii turneului</button>
      {showAdmin ? <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAdmin(false)}><div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}><div className="flex justify-between gap-3"><div><h2 className="text-xl font-extrabold">Sponsorii turneului</h2><p className="text-sm opacity-70">Poți asocia mai mulți sponsori și încărca logo-uri.</p></div><button onClick={() => setShowAdmin(false)} className="ps-btn ps-btn-outline">Închide</button></div><div className="mt-5"><b>Sponsori asociați</b>{currentSponsors.length ? currentSponsors.map(s => <div key={s.id} className="mt-2 flex items-center justify-between border rounded-xl p-3"><div className="flex items-center gap-3">{s.logo_url ? <img src={s.logo_url} alt={s.name} className="h-10 w-20 object-contain" /> : null}<span>{s.name}</span></div><button className="ps-btn ps-btn-outline text-sm" onClick={() => detachSponsor(s.id)}>Elimină</button></div>) : <p className="text-sm opacity-60 mt-2">Niciun sponsor asociat.</p>}</div><div className="mt-6 border-t pt-4"><b>Asociază sponsor existent</b><div className="mt-2 flex flex-wrap gap-2">{adminSponsors.filter(s => !currentIds.has(s.id)).map(s => <button key={s.id} className="ps-btn ps-btn-outline text-sm" onClick={() => attachSponsor(s.id)}>+ {s.name}</button>)}</div></div><div className="mt-6 border-t pt-4"><b>Adaugă sponsor nou</b><div className="grid gap-3 mt-3"><input className="border rounded-xl p-2" placeholder="Nume sponsor" value={newSponsorName} onChange={e => setNewSponsorName(e.target.value)} /><input className="border rounded-xl p-2" placeholder="Website (opțional)" value={newSponsorWebsite} onChange={e => setNewSponsorWebsite(e.target.value)} /><input className="border rounded-xl p-2" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => setNewSponsorFile(e.target.files?.[0] ?? null)} /><button disabled={saving} className="ps-btn ps-btn-primary" onClick={addSponsor}>{saving ? "Se salvează..." : "Adaugă și asociază sponsorul"}</button></div></div></div></div> : null}
    </> : null}

    {isAdmin && pathname === "/" && promo ? <PromoEditor promo={promo} saving={saving} onSave={savePromo} /> : null}
  </>;
}

function PromoEditor({ promo, saving, onSave }: { promo: Promo; saving: boolean; onSave: (p: Partial<Promo>, f?: File | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(promo);
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => setForm(promo), [promo]);
  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-[80] rounded-full px-4 py-3 font-extrabold shadow-lg" style={{ background: "var(--ps-primary)", color: "white" }}>Card promoțional</button>
    {open ? <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}><div className="bg-white rounded-2xl p-5 w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}><div className="flex justify-between"><h2 className="text-xl font-extrabold">Card promoțional homepage</h2><button className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Închide</button></div><label className="mt-4 flex gap-2 items-center"><input type="checkbox" checked={form.enabled} onChange={e => setForm({...form, enabled:e.target.checked})}/> Activ</label><div className="grid gap-3 mt-4"><input className="border rounded-xl p-2" placeholder="Etichetă (ex. Partener PoliSport)" value={form.eyebrow ?? ""} onChange={e=>setForm({...form,eyebrow:e.target.value})}/><input className="border rounded-xl p-2" placeholder="Titlu" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><textarea className="border rounded-xl p-2 min-h-24" placeholder="Descriere" value={form.description ?? ""} onChange={e=>setForm({...form,description:e.target.value})}/><input className="border rounded-xl p-2" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>setFile(e.target.files?.[0] ?? null)}/><input className="border rounded-xl p-2" placeholder="Text buton" value={form.button_label ?? ""} onChange={e=>setForm({...form,button_label:e.target.value})}/><input className="border rounded-xl p-2" placeholder="Link buton" value={form.button_url ?? ""} onChange={e=>setForm({...form,button_url:e.target.value})}/><button disabled={saving} className="ps-btn ps-btn-primary" onClick={async()=>{await onSave(form,file); setOpen(false)}}>{saving?"Se salvează...":"Salvează"}</button></div></div></div> : null}
  </>;
}
