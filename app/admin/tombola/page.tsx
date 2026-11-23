"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import TargetGame from "./TargetGame";
import styles from "./raffle.module.css";

type Edition = { id:string; title:string; starts:string; ends:string; prizes:number[]; roles:string[]; categories:string[] };
type Row = {rank:number; name:string; points:number; serves:number; mine:boolean; voucher:number|null};
type View = {event:Edition; board:Row[]; open:boolean; closed:boolean; now:string};
const categories:Record<string,string>={HOBBY:"Hobby",ADVANCED:"Avansați",ELITE:"Elite"};
const labels:Record<string,string> = {student:"Studenți",employee:"Angajați",alumni:"Alumni",partner:"Parteneri",guest:"Invitați",unspecified:"Fără afiliere"};
const numberLabel=(n:number)=>String(n).padStart(3,"0");
const dateLabel=(s:string)=>new Date(s).toLocaleString("ro-RO",{dateStyle:"short",timeStyle:"short"});
function localDate(offset:number) {
 const d=new Date(Date.now()+offset);
 return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
async function rpc<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await supabase.rpc("tombola_test_admin",{action,payload});
 if(error) throw new Error(error.message);
 return data as T;
}
async function loadImage(src:string){
 const img=new Image(); img.src=src; await img.decode(); return img;
}
async function template(file:File){
 const url=URL.createObjectURL(file);
 try{
  const img=await loadImage(url); const canvas=document.createElement("canvas"); canvas.width=1491; canvas.height=1055;
  const ctx=canvas.getContext("2d"); if(!ctx) throw Error("Imaginea nu poate fi pregătită.");
  ctx.drawImage(img,0,0,1491,1055); return canvas.toDataURL("image/jpeg",0.85);
 }finally{URL.revokeObjectURL(url);}
}
async function download(id:string,name:string){
 const prize=await rpc<{number:number;image:string|null}>("voucher",{id});
 const cv=document.createElement("canvas"); cv.width=1491; cv.height=1055;
 const ctx=cv.getContext("2d"); if(!ctx) throw Error("Descărcarea nu este disponibilă.");
 if(prize.image) ctx.drawImage(await loadImage(prize.image),0,0,cv.width,cv.height);
 else {
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,1491,1055); ctx.strokeStyle="#126432"; ctx.lineWidth=12; ctx.strokeRect(25,25,1441,1005);
  ctx.fillStyle="#10452a"; ctx.font="bold 48px Georgia"; ctx.fillText("PoliSport Table Tennis",90,150);
  ctx.fillText("Voucher nr. "+numberLabel(prize.number),980,150); ctx.font="bold 96px Georgia"; ctx.fillText("VOUCHER CADOU",90,380);
  ctx.font="48px Georgia"; ctx.fillText("1 antrenament gratuit de tenis de masă",90,500); ctx.fillText("Nume",100,620);
  ctx.font="36px Georgia"; ctx.fillText("Programare necesară · PoliSport-TT, Universitatea Politehnica din București",85,810);
 }
 ctx.fillStyle="#143e2a"; ctx.font='italic 55px "Segoe Script", "Brush Script MT", cursive'; ctx.fillText(name,400,prize.number===3?622:610,890);
 ctx.fillStyle="#343434"; ctx.font="bold 26px sans-serif"; ctx.fillText("TEST · FĂRĂ VALOARE",85,985);
 const a=document.createElement("a"); a.download="PoliSport-test-"+numberLabel(prize.number)+".png"; a.href=cv.toDataURL("image/png"); a.click();
}
export default function Raffle(){
 const [access,setAccess]=useState("loading"),[events,setEvents]=useState<Edition[]>([]),[id,select]=useState(""),[view,setView]=useState<View|null>(null);
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [title,setTitle]=useState("Serva de aur"),[starts,setStarts]=useState(""),[ends,setEnds]=useState("");
 const [roles,setRoles]=useState(Object.keys(labels)),[prizes,setPrizes]=useState([1]),[files,setFiles]=useState<Record<number,File>>({});
 const [levels,setLevels]=useState(Object.keys(categories));
 const lock=useRef(false),revision=useRef(0);
 useEffect(()=>{let active=true; async function init(){
  try{const {data}=await supabase.auth.getSession(); if(!active)return;
   if(!data.session){setAccess("login");return;}
   const {data:admin,error:err}=await supabase.rpc("is_admin"); if(err)throw Error(err.message);
   if(!active)return; if(!admin){setAccess("denied");return;}
   const items=await rpc<Edition[]>("list"); if(!active)return;
   setEvents(items);select(items[0]?.id??"");setAccess("ok");setEditing(!items.length);
   setStarts(localDate(0));setEnds(localDate(5*60000));
  }catch(e){if(active){setAccess("failed");setError(String(e));}}
 } void init(); const {data}=supabase.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")window.location.reload();});
 return ()=>{active=false;data.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(!id)return;let active=true;let pending=false;
  async function refresh(){if(pending)return;pending=true;const version=revision.current;
   try{const v=await rpc<View>("view",{id});if(active&&version===revision.current){setView(v);}}
   catch(e){if(active)setError(String(e));}finally{pending=false;}}
  void refresh();const timer=setInterval(refresh,2000);return ()=>{active=false;clearInterval(timer);};
 },[id]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}}
 function choose(next:string){revision.current++;setView(null);select(next);setError("");}
 const mine=view?.board.find(r=>r.mine);
 return <main className={styles.page}><header className={styles.hero}><small>POLISPORT-TT · TEST ADMIN</small><h1>Tombola de tenis de masă</h1><p>Joacă până la închidere și adună puncte pentru un voucher de antrenament.</p></header>
 {error&&<p role="alert">{error}</p>}
 {access==="loading"&&<p>Se verifică accesul…</p>}{access==="denied"&&<p>Test rezervat administratorilor.</p>}
 {access==="login"&&<p><a href="/login?mode=login">Autentifică-te cu contul de administrator</a>, apoi revino pe această pagină.</p>}
 {access==="ok"&&<><nav><label>Ediție <select disabled={busy} value={id} onChange={e=>choose(e.target.value)}>{!events.length&&<option value="">Nicio ediție</option>}{events.map(e=><option key={e.id} value={e.id}>{e.title} · {dateLabel(e.starts)}</option>)}</select></label><button disabled={busy} onClick={()=>{setEditing(!editing);setStarts(localDate(0));setEnds(localDate(300000));}}>{editing?"Închide formularul":"Creează tombolă"}</button></nav>
 {editing&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{
 const images:Record<number,string>={};for(const n of prizes){if(files[n])images[n]=await template(files[n]);}
 const item=await rpc<Edition>("create",{title,starts:new Date(starts).toISOString(),ends:new Date(ends).toISOString(),prizes,roles,categories:levels,images});
 setEvents([item,...events]);choose(item.id);setEditing(false);
 });}}><h2>Ediție nouă</h2><label>Titlu<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <div className={styles.dates}><label>Începe la<input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>Se încheie la<input type="datetime-local" required value={ends} onChange={e=>setEnds(e.target.value)}/></label></div>
 <fieldset><legend>Afilieri eligibile în rândul administratorilor</legend>{Object.entries(labels).map(([v,l])=><label key={v}><input type="checkbox" checked={roles.includes(v)} onChange={()=>setRoles(roles.includes(v)?roles.filter(x=>x!==v):[...roles,v])}/>{l}</label>)}</fieldset>
 <fieldset><legend>Categorii de joc eligibile</legend>{Object.entries(categories).map(([key,label])=><label key={key}><input type="checkbox" checked={levels.includes(key)} onChange={()=>setLevels(levels.includes(key)?levels.filter(x=>x!==key):[...levels,key])}/>{label}</label>)}</fieldset>
 <fieldset><legend>Vouchere premiate · {prizes.length} câștigători</legend><p>Bifează câte un voucher pentru fiecare loc premiat, în ordinea numerelor. Poți încărca modelul original pentru fiecare număr sau folosi modelul simplu de test.</p>
 {[1,2,3,4,5].map(n=><div key={n}><label><input type="checkbox" checked={prizes.includes(n)} onChange={()=>setPrizes(prizes.includes(n)?prizes.filter(x=>x!==n):[...prizes,n].sort())}/>Voucher {numberLabel(n)}</label>{prizes.includes(n)&&<input aria-label={"Model voucher "+n} type="file" accept="image/png,image/jpeg" onChange={e=>{const f=e.target.files?.[0];setFiles(current=>{const next={...current};if(f)next[n]=f;else delete next[n];return next;});}}/>}</div>)}</fieldset>
 <button disabled={busy||!levels.length||!roles.length||!prizes.length}>Publică ediția de test</button></form>}
 {view&&view.event.id===id&&<><section><small>{view.closed?"ÎNCHEIATĂ":view.open?"ÎN DESFĂȘURARE":"PROGRAMATĂ"}</small><h2>{view.event.title}</h2><p>{dateLabel(view.event.starts)} – {dateLabel(view.event.ends)} · Locuri premiate: {view.event.prizes.length}</p>
 <p>Categorii admise: {view.event.categories.map(k=>categories[k]).join(", ")}. Lovește ținta pentru 30, 60 sau 100 de puncte, în funcție de precizie. La egalitate are prioritate cine a atins primul totalul. Pentru un premiu trebuie să joci cel puțin o servă.</p>
 {view.open&&!mine&&<button disabled={busy} onClick={()=>void run(async()=>{const v=await rpc<View>("join",{id});revision.current++;setView(v);})}>Înscrie-mă</button>}
 {view.open&&mine&&<><TargetGame key={id} serve={()=>rpc("serve",{id})} finish={(token,paddle)=>rpc("return_ball",{id,token,paddle})}/><p>Total: {mine.points} puncte · Locul {mine.rank}</p></>}
 {mine?.voucher&&<><h3>Felicitări! Ai câștigat voucherul nr. {numberLabel(mine.voucher)}!</h3><button disabled={busy} onClick={()=>void run(()=>download(id,mine.name))}>Descarcă voucherul de test (PNG)</button></>}
 </section><section><h2>{view.closed?"Clasament final":"Clasament live"}</h2>{view.board.length?<table><thead><tr><th>Loc</th><th>Participant</th><th>Puncte</th><th>Status</th></tr></thead><tbody>{view.board.map(r=><tr key={r.rank}><td>{r.rank}</td><td>{r.name}</td><td>{r.points}</td><td>{r.voucher?"Voucher "+numberLabel(r.voucher):view.closed?"Fără premiu":r.serves?"În joc":"Înscris"}</td></tr>)}</tbody></table>:<p>Niciun participant înscris.</p>}</section></>}
 </>}</main>;
}