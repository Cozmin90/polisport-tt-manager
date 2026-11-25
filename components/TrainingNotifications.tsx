"use client";
import Link from "next/link";
import {useEffect,useState,useRef} from "react";
import {supabase} from "../lib/supabaseClient";
import styles from "./TrainingNotifications.module.css";

type Notice={id:string;status:"CONFIRMED"|"REJECTED"|"CANCELLED";created_at:string;starts:string;ends:string;coach:string;location:string};
type Inbox={pending:number;pending_voucher:number;unread:number;items:Notice[]};
const labels={CONFIRMED:"Rezervare confirmată",REJECTED:"Cerere respinsă",CANCELLED:"Programare anulată"};
const date=(value:string)=>new Intl.DateTimeFormat("ro-RO",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Bucharest"}).format(new Date(value));
const time=(value:string)=>new Intl.DateTimeFormat("ro-RO",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Bucharest"}).format(new Date(value));
const plural=(n:number,one:string,many:string)=>n+" "+(n===1?one:many);
async function readInbox(action="view",ids:string[]=[]):Promise<Inbox>{
 const {data,error}=await supabase.rpc("training_notifications",{action,ids});
 if(error)throw new Error(error.message);
 return data as Inbox;
}
function useInbox(uid:string|null,revision=0){
 const [value,setValue]=useState<{uid:string;data:Inbox}|null>(null);
 const [error,setError]=useState("");
 const [reload,setReload]=useState(0);
 const [busy,setBusy]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{
  setValue(null);setError("");setBusy(false);
 },[uid]);
 useEffect(()=>{
  if(!uid)return;
  let active=true,pending=false;
  async function load(){
   if(pending||document.visibilityState==="hidden")return;
   pending=true;const request=++generation.current;
   try{const data=await readInbox();if(active&&request===generation.current){setValue({uid:uid!,data});setError("")}}
   catch{if(active&&request===generation.current)setError("Notificările nu au putut fi actualizate.")}
   finally{pending=false}
  }
  void load();
  const timer=window.setInterval(()=>void load(),15000);
  const visible=()=>{if(document.visibilityState==="visible")void load()};
  window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
  return()=>{active=false;generation.current++;window.clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible)};
 },[uid,revision,reload]);
 async function mark(ids:string[]){
  if(!uid||!ids.length||busy)return;
  setBusy(true);generation.current++;
  try{const data=await readInbox("read",ids);generation.current++;setValue({uid,data});setError("");setReload(n=>n+1)}
  catch{setError("Nu am putut marca notificarea ca citită. Încearcă din nou.")}
  finally{setBusy(false)}
 }
 return {inbox:value?.uid===uid?value.data:null,error,busy,mark,retry:()=>setReload(n=>n+1)};
}
function Bell(){return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>}
export function TrainingHomeCard({uid}:{uid:string|null}){
 const {inbox}=useInbox(uid);
 const pending=inbox?.pending??0,unread=inbox?.unread??0,total=pending+unread;
 return <Link href={total?"/training#notificari":"/training"} className={"ps-card mt-4 block p-5 "+styles.home} style={{background:"linear-gradient(120deg,#153d31,#267253)",color:"white",borderColor:"#327657"}}>
  <div className={styles.top}><div className={styles.kicker}>POLISPORT TRAINING</div>{total>0&&<span className={styles.bell} aria-label={plural(total,"notificare","notificări")}><Bell/><span>{total>99?"99+":total}</span></span>}</div>
  <div className={styles.main}><div className={styles.copy}><div className="mt-1 text-2xl font-extrabold">Antrenamente</div><p className="mt-2 text-sm" style={{color:"#e4f6e8"}}>Rezervă un antrenament individual sau de grup. Poți folosi și voucherele tale.</p></div><span className="ps-btn" style={{background:"#d6f2be",color:"#183d2a"}}>{total?"Vezi notificările →":"Vezi intervalele →"}</span></div>
  {total>0&&<div className={styles.summary} role="status" aria-live="polite">
   {pending>0&&<div><strong>{plural(pending,"cerere de antrenament în așteptare","cereri de antrenament în așteptare")}</strong>{(inbox?.pending_voucher??0)>0&&<small>{plural(inbox!.pending_voucher,"cerere cu voucher","cereri cu voucher")}</small>}</div>}
   {unread>0&&<div><strong>{unread===1&&inbox?.items[0]?labels[inbox.items[0].status]:plural(unread,"actualizare a programării tale","actualizări ale programărilor tale")}</strong><small>Ai notificări necitite.</small></div>}
  </div>}
 </Link>;
}
export function TrainingInbox({uid,revision=0}:{uid:string|null;revision?:number}){
 const {inbox,error,busy,mark,retry}=useInbox(uid,revision);
 if(!uid||(!inbox&&!error))return null;
 const pending=inbox?.pending??0,unread=inbox?.unread??0;
 return <section id="notificari" className={styles.inbox} aria-labelledby="training-notice-title">
  <div className={styles.heading}><span className={styles.inboxBell}><Bell/></span><h2 id="training-notice-title">Notificări antrenamente</h2>{pending+unread>0&&<span className={styles.number}>{pending+unread}</span>}</div>
  {error&&<p role="alert">{error} <button type="button" onClick={retry}>Reîncearcă</button></p>}
  {inbox&&pending===0&&unread===0&&<p>Nu ai notificări noi.</p>}
  {pending>0&&<article className={styles.request}><div><strong>{plural(pending,"cerere de confirmat","cereri de confirmat")}</strong>{(inbox?.pending_voucher??0)>0&&<p>{plural(inbox!.pending_voucher,"cerere cu voucher prioritară","cereri cu voucher prioritare")}</p>}<p>Verifică solicitările și confirmă sau respinge rezervările.</p></div><a href="#administrare">Vezi cererile →</a></article>}
  {unread>0&&<><div className={styles.noticeList}>{inbox?.items.map(n=><article className={styles.message} data-status={n.status} key={n.id}><div><strong>{labels[n.status]}</strong><p>{date(n.starts)} – {time(n.ends)}</p><small>{n.coach} · {n.location}</small></div><button type="button" disabled={busy} onClick={()=>void mark([n.id])}>Marchează citit</button></article>)}</div><div className={styles.actions}><a href="#programarile-mele">Vezi programările mele →</a>{(inbox?.items.length??0)>1&&<button type="button" disabled={busy} onClick={()=>void mark(inbox?.items.map(n=>n.id)??[])}>Marchează notificările afișate ca citite</button>}</div></>}
 </section>;
}
