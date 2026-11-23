"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./raffle.module.css";

type Table = {token:string; cups:number[]};
type Point = [number,number];
type Flight = {frames:Point[]; score:number; bounces:number};
type Props = {serve:()=>Promise<Table>; finish:(token:string,angle:number,power:number)=>Promise<Flight>};
const origin:Point=[548,238];

export default function TargetGame({serve,finish}:Props){
 const [table,setTable]=useState<Table|null>(null);
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
   prepare.current().then(data=>{if(active){setTable(data);setPhase("aim");locked.current=false;}})
     .catch(error=>{if(active){setMessage(String(error));setPhase("error");locked.current=false;}});
   return ()=>{active=false;};
 },[round]);
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
     setMessage(flight.score===100?"În pahar după ricoșeu! +100 puncte.":flight.score===60?"Direct în pahar! +60 puncte.":"Mingea a ratat paharele. 0 puncte.");
   }
   animation=requestAnimationFrame(animate);
   return ()=>cancelAnimationFrame(animation);
 },[flight]);
 const ball=flight?.frames[frame]??origin;
 const trail=flight?.frames.slice(Math.max(0,frame-22),frame+1).map(p=>p.join(",")).join(" ");
 const radians=angle*Math.PI/180, speed=180+3*power;
 const guide=Array.from({length:11},(_,i)=>{const t=i*0.027;return [origin[0]-speed*Math.cos(radians)*t,origin[1]-speed*Math.sin(radians)*t+290*t*t].join(",");}).join(" ");
 const ready=phase==="aim";
 return <div className={styles.game}><h3>La pahar</h3><p>Alege unghiul și intensitatea. Lansează din dreapta și încearcă să trimiți mingea într-unul dintre cele trei pahare.</p>
 <svg viewBox="0 0 600 340" className={styles.court} role="img" aria-label="Masă văzută din lateral, cu paharele în stânga și mingea în dreapta">
 <defs><pattern id="wall" width="64" height="36" patternUnits="userSpaceOnUse"><rect width="64" height="36" fill="#f7f2ed"/><path d="M0 0H64M0 18H64M0 0V18M32 18V36" fill="none" stroke="#ded8d1"/></pattern></defs>
 <rect width="600" height="340" fill="url(#wall)"/><path d="M32 308v36m531-36v36" stroke="#35444a" strokeWidth="10"/>
 <rect x="4" y="300" width="592" height="12" rx="3" fill="#ba9468" stroke="#534d44"/>
 {table?.cups.map(x=><g key={x}><path d={`M${x-20} 250h40l-6 49h-28z`} fill="#b73336" stroke="#69272a" strokeWidth="2"/><path d={`M${x-17} 263h34m-32 22h30`} stroke="#e67868" strokeWidth="2"/><ellipse cx={x} cy="250" rx="20" ry="3" fill="#622327" stroke="#f0a385" strokeWidth="2"/></g>)}
 <g transform="rotate(27 550 253)"><rect x="546" y="254" width="10" height="39" rx="4" fill="#b89168"/><ellipse cx="550" cy="253" rx="20" ry="10" fill="#655083" stroke="#473451" strokeWidth="2"/></g>
 {ready&&<polyline fill="none" points={guide} stroke="#62666b" strokeWidth="2.5" strokeDasharray="4 6"/>}
 {trail&&<polyline fill="none" points={trail} stroke="#bd801f" strokeWidth="2" strokeDasharray="4 4"/>}
 <circle cx={ball[0]} cy={ball[1]} r="6" fill="#ffcb43" stroke="#70471e" strokeWidth="1.6"/>
 </svg>
 <div className={styles.dates}><label>Unghi · {angle}°<input type="range" min="15" max="75" value={angle} disabled={!ready} onChange={e=>setAngle(Number(e.target.value))}/></label>
 <label>Intensitate · {power}%<input type="range" min="10" max="100" value={power} disabled={!ready} onChange={e=>setPower(Number(e.target.value))}/></label></div>
 <div className={styles.gameControls} style={{marginTop:"1rem"}}>{phase==="done"||phase==="error"?<button type="button" onClick={()=>setRound(r=>r+1)}>{phase==="done"?"Pregătește mingea următoare":"Reîncearcă"}</button>:<button type="button" disabled={!ready} onClick={launch}>{phase==="loading"?"Se așază paharele…":ready?"Lansează mingea":"Minge în joc"}</button>}<span aria-live="polite">{message}</span></div></div>;
}