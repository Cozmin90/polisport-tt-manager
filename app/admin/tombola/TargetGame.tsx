"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./raffle.module.css";

type Table = {token:string; cups:number[]; hits:number; elapsed:number};
type Point = [number,number];
type Flight = {frames:Point[]; score:number; bounces:number; hits:number};
type Props = {serve:()=>Promise<Table>; finish:(token:string,angle:number,power:number)=>Promise<Flight>};
const origin:Point=[548,238];

export default function TargetGame({serve,finish}:Props){
 const [table,setTable]=useState<Table|null>(null);
 const [avatar,setAvatar]=useState<"male"|"female">("male");
 const [now,setNow]=useState(0);
 const clock=useRef(0);
 const [angle,setAngle]=useState(45),[power,setPower]=useState(65);
 const [flight,setFlight]=useState<Flight|null>(null),[frame,setFrame]=useState(0);
 const [phase,setPhase]=useState<"loading"|"aim"|"sending"|"flying"|"done"|"error">("loading");
 const [message,setMessage]=useState("");
 const [round,setRound]=useState(0);
 const locked=useRef(false),mounted=useRef(true),prepare=useRef(serve);
 useEffect(()=>{prepare.current=serve;},[serve]);
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 useEffect(()=>{
   let active=true;
   setPhase("loading");setMessage("");setFlight(null);setTable(null);setFrame(0);
   const sent=performance.now();
   prepare.current().then(data=>{if(active){clock.current=(performance.now()+sent)/2-data.elapsed*1000;setNow(performance.now());setTable(data);setPhase("aim");locked.current=false;}})
     .catch(error=>{if(active){setMessage(String(error));setPhase("error");locked.current=false;}});
   return ()=>{active=false;};
 },[round]);
 const hits=(phase==="done"?flight?.hits:table?.hits)??0;
 useEffect(()=>{
   if(!hits)return;
   let id=0;
   function tick(time:number){setNow(time);id=requestAnimationFrame(tick);}
   id=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(id);
 },[hits]);
 async function launch(){
   if(!table||locked.current||phase!=="aim")return;
   locked.current=true;setPhase("sending");setMessage("");
   try{
     const result=await finish(table.token,angle,power);
     if(mounted.current){setFlight(result);setPhase("flying");}
   }catch(error){if(mounted.current){setMessage(String(error));setPhase("aim");locked.current=false;}}
 }
 useEffect(()=>{
   if(!flight)return;
   const start=performance.now(); let animation=0;
   function animate(now:number){
     if(!flight)return;
     const last=flight.frames.length-1;
     const index=Math.min(last,Math.floor((now-start)*0.06));setFrame(index);
     if(index<last){animation=requestAnimationFrame(animate);return;}
     setPhase("done");locked.current=false;
     setMessage(flight.score===100?"În halbă după ricoșeu! +100 puncte.":flight.score===60?"Direct în halbă! +60 puncte.":"Mingea a ratat halba. 0 puncte.");
   }
   animation=requestAnimationFrame(animate);
   return ()=>cancelAnimationFrame(animation);
 },[flight]);
 const ball=flight?.frames[frame]??origin;
 const trail=flight?.frames.slice(Math.max(0,frame-22),frame+1).map(p=>p.join(",")).join(" ");
 const amplitude=14*hits/(hits+5);
 const sway=(now-clock.current)/1000*(2.2+amplitude/8);
 const lean=amplitude*Math.sin(sway);
 const radians=Math.min(75,Math.max(15,angle+lean))*Math.PI/180;
 const speed=180+3*Math.min(100,Math.max(10,power+0.65*amplitude*Math.sin(sway*1.37)));
 const mug=table?.cups[0];
 const swing=phase==="flying"?Math.max(0,1-frame/19):0;
 const pivot=lean*Math.PI/180;
 const armX=568+(548-568)*Math.cos(pivot)+(238-300)*Math.sin(pivot);
 const armY=300-(548-568)*Math.sin(pivot)+(238-300)*Math.cos(pivot);
 const female=avatar==="female";
 const guide=Array.from({length:11},(_,i)=>{const t=i*0.027;return [origin[0]-speed*Math.cos(radians)*t,origin[1]-speed*Math.sin(radians)*t+290*t*t].join(",");}).join(" ");
 const ready=phase==="aim";
 return <div className={styles.game}><h3>Țintește halba</h3><p>Reglează unghiul și intensitatea, apoi aruncă. După fiecare reușită, personajul se clatină mai tare. Urmărește direcția punctată și alege momentul lansării.</p>
 <fieldset><legend>Personaj</legend>{(["male","female"] as const).map(v=><label key={v}><input type="radio" name="personaj" value={v} checked={avatar===v} disabled={phase==="flying"||phase==="sending"} onChange={()=>setAvatar(v)}/>{v==="male"?"Bărbat":"Fată"}</label>)}</fieldset>
 <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><strong>Amețeală</strong><meter min="0" max="14" value={amplitude} aria-label="Nivel de amețeală"/><span>{hits} {hits===1?"reușită":"reușite"}</span></div>
 <svg viewBox="0 0 600 340" className={styles.court} role="img" aria-label="Masă văzută din lateral, cu o halbă de bere, un personaj care aruncă și un tablou al Politehnicii">
 <defs><pattern id="wall" width="64" height="36" patternUnits="userSpaceOnUse"><rect width="64" height="36" fill="#f7f2ed"/><path d="M0 0H64M0 18H64M0 0V18M32 18V36" fill="none" stroke="#ded8d1"/></pattern></defs>
 <rect width="600" height="340" fill="url(#wall)"/><path d="M32 308v36m531-36v36" stroke="#35444a" strokeWidth="10"/>
 <g aria-label="Tablou cu o ilustrație a campusului Politehnicii din București" transform="translate(146 19)">
 <rect x="3" y="5" width="285" height="146" fill="#554633" opacity=".17"/><rect width="285" height="146" fill="#6c4838"/><rect x="5" y="5" width="275" height="136" fill="#e7d4ab"/><rect x="10" y="10" width="265" height="126" fill="#9cbcc4"/>
 <circle cx="221" cy="35" r="14" fill="#ffe7a0"/><path d="M10 94 Q45 68 73 89T146 81T222 80T275 85 V124H10Z" fill="#506e61"/>
 <path d="M41 83L146 61l96 14v21H42Z" fill="#e5d3ad"/><path d="M40 81l108-25 97 16-2 6-95-14-106 22Z" fill="#48646a"/>
 <path d="M47 87l101-21 88 14v10l-89-12-100 19z" fill="#456370"/>
 {[0,1,2,3,4,5,6,7].map(i=><path key={i} d={`M${54+i*12} ${85-i*2.45}v11`} stroke="#dbcba7" strokeWidth="2"/>)}
 <path d="M65 94l79-15 77 10v13l-76-10-80 12Z" fill="#e9dfc7"/><path d="M20 116l125-24 118 13v14H20Z" fill="#778b74"/>
 <rect x="10" y="114" width="265" height="22" fill="#233f49"/><text x="142" y="129" textAnchor="middle" fontFamily="Georgia,serif" fontSize="10" letterSpacing="1.1" fill="#fff0ce">POLITEHNICA · BUCUREȘTI</text></g>
 <rect x="4" y="300" width="592" height="12" rx="3" fill="#ba9468" stroke="#534d44"/>
 {mug!==undefined&&<g transform={`translate(${mug} 250)`}>
 <path d="M18 10h8q14 0 10 16-2 11-18 11" fill="none" stroke="#66898d" strokeWidth="6"/><path d="M18 10h8q12 0 9 15-2 10-16 11" fill="none" stroke="#dceff1" strokeWidth="3"/>
 <rect x="-20" width="40" height="49" rx="5" fill="#cfeced" fillOpacity=".44" stroke="#637f84" strokeWidth="2"/>
 <path d="M-17 14h34v28q0 3-3 3h-28q-3 0-3-3Z" fill="#efa926" fillOpacity=".86"/><path d="M-17 11q4-6 9-2 4-5 9-1 8-5 16 2v6h-34Z" fill="#fff5dc"/>
 <path d="M-14 6v34m24-32v33" stroke="#fff" strokeWidth="2" opacity=".85"/><circle cx="-3" cy="28" r="1.5" fill="#ffe4a0"/><circle cx="4" cy="35" r="2" fill="#ffe4a0"/><ellipse rx="20" ry="3" fill="#e7f5f6" fillOpacity=".45" stroke="#6b8b8d"/></g>}
 <g transform={`rotate(${lean} 568 300)`}>
 <path d="M567 267l-7 29m13-29 6 29" fill="none" stroke="#253d53" strokeWidth="8" strokeLinecap="round"/><path d="M560 297h-7m25 0h-5" stroke="#533c35" strokeWidth="5" strokeLinecap="round"/>
 {female&&<path d="M582 209q14-5 13 11l-3 17q-11-5-10-17Z" fill="#513629"/>}
 <path d="M566 228q11-5 15 7l-2 34h-18l-1-28Z" fill={female?"#925075":"#38767c"}/>
 <path d="M576 236l11 14-7 8" fill="none" stroke="#cc9274" strokeWidth="6" strokeLinecap="round"/>
 <ellipse cx="572" cy="216" rx="11" ry="13" fill="#e4ac86"/><path d="M561 216q-4-17 10-17 15-1 14 18l-5 3-2-12q-9 4-17 4Z" fill="#513629"/>
 <path d="M561 214l-4 6h5" fill="#e4ac86"/><circle cx="564" cy="215" r="1.2" fill="#302829"/>
 <path d={`M566 236 Q${561-11*swing} ${252-16*swing} ${armX-13*swing} ${armY-13*swing}`} fill="none" stroke="#edb793" strokeWidth="6" strokeLinecap="round"/>
 </g>
 {ready&&<polyline fill="none" points={guide} stroke="#62666b" strokeWidth="2.5" strokeDasharray="4 6"/>}
 {trail&&<polyline fill="none" points={trail} stroke="#bd801f" strokeWidth="2" strokeDasharray="4 4"/>}
 <circle cx={ball[0]} cy={ball[1]} r="6" fill="#ffcb43" stroke="#70471e" strokeWidth="1.6"/>
 </svg>
 <div className={styles.dates}><label>Unghi · {angle}°<input type="range" min="15" max="75" value={angle} disabled={!ready} onChange={e=>setAngle(Number(e.target.value))}/></label>
 <label>Intensitate · {power}%<input type="range" min="10" max="100" value={power} disabled={!ready} onChange={e=>setPower(Number(e.target.value))}/></label></div>
 <div className={styles.gameControls} style={{marginTop:"1rem"}}>{phase==="done"||phase==="error"?<button type="button" onClick={()=>setRound(r=>r+1)}>{phase==="done"?"Pregătește mingea următoare":"Reîncearcă"}</button>:<button type="button" disabled={!ready} onClick={launch}>{phase==="loading"?"Se așază halba…":ready?"Lansează mingea":"Minge în joc"}</button>}<span aria-live="polite">{message}</span></div></div>;
}