"use client";
import {useEffect, useRef, useState} from "react";
import styles from "./raffle.module.css";

type Challenge = {token:string; incoming:number; targetX:number; targetY:number};
type Props = {
  serve:()=>Promise<Challenge>;
  finish:(token:string,paddle:number)=>Promise<number>;
};
const approach = 2400;
const flight = 720;
const clamp = (value:number) => Math.min(570,Math.max(30,value));

export default function TargetGame({serve,finish}:Props){
 const [round,setRound]=useState<Challenge|null>(null);
 const [paddle,setPaddle]=useState(300);
 const [elapsed,setElapsed]=useState(0);
 const [pending,setPending]=useState(false);
 const [notice,setNotice]=useState("Pregătește paleta și pornește prima minge.");
 const position=useRef(300), contact=useRef<number|null>(null), busy=useRef(false);
 const surface=useRef<SVGSVGElement>(null), alive=useRef(true);
 const finishRef=useRef(finish);
 useEffect(()=>{finishRef.current=finish;},[finish]);
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
 function move(x:number){
   if(contact.current!==null)return;
   position.current=clamp(x);setPaddle(position.current);
 }
 async function start(){
   if(busy.current)return;
   busy.current=true;setPending(true);
   try{
     const next=await serve();if(!alive.current)return;
     contact.current=null;setElapsed(0);setRound(next);setNotice("Așază paleta sub minge și orientează returul spre țintă.");surface.current?.focus();
   }catch(error){if(alive.current){setNotice(String(error));busy.current=false;setPending(false);}}
 }
 useEffect(()=>{
   if(!round)return;
   let frame=0,active=true;
   const started=performance.now();
   let result:Promise<string>|undefined;
   function animate(now:number){
     if(!round||!active)return;
     const ms=now-started;
     setElapsed(Math.min(ms,approach+flight));
     if(ms>=approach && contact.current===null){
       contact.current=position.current;
       result=finishRef.current(round.token,contact.current)
         .then(points=>points===100?"În centru! +100 puncte.":points?"Țintă lovită! +"+points+" puncte.":"Ratare · 0 puncte.")
         .catch(error=>String(error));
     }
     if(ms<approach+flight){frame=requestAnimationFrame(animate);return;}
     void result?.then(message=>{if(active){setNotice(message);busy.current=false;setPending(false);}});
   }
   frame=requestAnimationFrame(animate);
   return ()=>{active=false;cancelAnimationFrame(frame);};
 },[round]);
 const x=round?.incoming??300, tx=round?.targetX??300, ty=round?.targetY??100;
 const dx=x-paddle, touching=Math.abs(dx)<=34;
 const returning=elapsed>=approach;
 const progress=Math.max(0,Math.min(1,(elapsed-approach)/flight));
 const y=returning?(touching?360-progress*(360-ty):360+progress*75):40+320*elapsed/approach;
 const ballX=returning&&touching?x+dx/34*1.9*(360-y):x;
 const flash=round&&progress===1&&touching&&Math.abs(ballX-tx)<=30;
 return <div className={styles.game}>
 <p>Deplasează paleta cu mouse-ul, cu degetul sau cu săgețile. Mingea ricoșează automat. Marginea stângă a paletei trimite mingea spre stânga, iar cea dreaptă spre dreapta.</p>
 <svg ref={surface} viewBox="0 0 600 420" tabIndex={0} aria-label="Masă de joc. Săgețile mută paleta, Shift și săgețile permit reglajul fin." className={styles.court}
 onKeyDown={e=>{if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();move(position.current+(e.key==="ArrowLeft"?-1:1)*(e.shiftKey?1:7));}}}
 onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const b=e.currentTarget.getBoundingClientRect();move((e.clientX-b.left)/b.width*600);}}
 onPointerMove={e=>{const b=e.currentTarget.getBoundingClientRect();move((e.clientX-b.left)/b.width*600);}}>
 <rect width="600" height="420" rx="15" fill="#113b49"/><rect x="17" y="17" width="566" height="385" rx="3" fill="#146865" stroke="#dbf1de" strokeWidth="3"/>
 <path d="M300 18V401" stroke="#c5e1d7" opacity=".45" strokeWidth="2"/><path d="M8 210H592" stroke="#e7efde" strokeWidth="5" strokeDasharray="4 2"/>
 <circle cx={tx} cy={ty} r={flash?35:30} fill="#ffca50"/><circle cx={tx} cy={ty} r="20" fill="#e4683a"/><circle cx={tx} cy={ty} r="10" fill="#ffe9a7"/>
 {round&&!returning&&touching&&<path d={`M ${x} 360 l ${dx/34*1.9*68} -68`} stroke="#fff2b4" strokeWidth="3" strokeDasharray="5 5"/>}
 <g transform={`translate(${paddle} 363)`}><rect x="-6" y="4" width="12" height="39" rx="5" fill="#d9a879"/><ellipse cy="0" rx="34" ry="16" fill="#ce443d" stroke="#ffe5b0" strokeWidth="3"/></g>
 <circle cx={ballX+3} cy={y+4} r="8" fill="#092f39" opacity=".4"/><circle cx={ballX} cy={y} r="8" fill="#fff8e6" stroke="#bdc9bb"/>
 </svg><div className={styles.gameControls}><button type="button" disabled={pending} onClick={start}>{pending?"Minge în joc":round?"Mingea următoare":"Pornește mingea"}</button><span aria-live="polite">{notice}</span></div></div>;
}