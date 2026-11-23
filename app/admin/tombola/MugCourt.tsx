import { memo } from "react";

export type Point = [number, number];
export type Avatar = "male" | "female";

type SceneProps = {
  avatar: Avatar;
  hits: number;
  lean: number;
  release: number;
  mug?: number;
  ball: Point;
  trail: Point[];
  guide?: string;
  wallImpactY?: number;
  landed: boolean;
};

// The portraits share a 768 × 1024 source coordinate system. Anchor each palm
// below the ball and rotate the forearm about its own elbow on release.
const portraits = {
  male: {
    image: "/tombola/student.webp", palmX: 142, palmY: 504,
    elbowX: 329, elbowY: 602, armEnd: 343,
    face: "M296 108 Q327 86 353 103 Q367 120 373 142 Q384 122 405 131 Q435 130 434 157 Q432 177 412 183 L444 230 L414 259 L370 275 L352 242 Q320 250 301 238 Q291 232 295 212 L291 200 L291 191 L278 183 Q273 178 280 168 L293 148 Z",
  },
  female: {
    image: "/tombola/studenta.webp", palmX: 160, palmY: 504,
    elbowX: 357, elbowY: 608, armEnd: 373,
    face: "M368 124 Q384 149 408 162 Q425 176 441 197 Q444 188 461 181 Q486 171 495 190 Q502 211 483 226 L474 231 Q484 259 515 282 L475 314 L438 330 L417 278 Q384 290 361 274 Q350 266 355 249 L351 240 L353 227 L340 218 Q335 213 342 205 L356 191 Q354 159 368 124Z",
  },
} as const;

const Room = memo(function Room() {
  return <>
    <image href="/tombola/sala-rectorat.webp" width="680" height="340" preserveAspectRatio="xMidYMin slice"/>
    <g fill="#524c3f" opacity=".58" fontSize="11" fontFamily="'Segoe Print', 'Bradley Hand', Georgia, serif" fontStyle="italic">
      <text transform="translate(63 266) rotate(-7)">U = R·I</text>
      <text transform="translate(369 238) rotate(5)">∫ cafea dt</text>
    </g>
    <rect x="16" width="14" height="340" fill="url(#mug-wall-shadow)"/>
    <rect width="16" height="340" fill="url(#mug-masonry)"/>
    <path d="M14.5 0V340" stroke="#cab6a2" strokeWidth="2"/>
    <path d="M16 0V340" stroke="#5e5349" strokeWidth="1.2"/>
  </>;
});

function Student({ avatar, hits, lean, release }: Pick<SceneProps,"avatar"|"hits"|"lean"|"release">) {
  const person = portraits[avatar];
  const sick = hits > 5;
  return <g data-complexion={sick ? "green" : "normal"} transform={`translate(548 244) rotate(${lean}) scale(.225) translate(${-person.palmX} ${-person.palmY})`}>
    <defs>
      <image id="mug-person" href={person.image} width="768" height="1024"/>
      <mask id="mug-face" maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="1024">
        <path d={person.face} fill="white" filter="url(#mug-soft-edge)"/>
      </mask>
      <clipPath id="mug-forearm"><rect x="25" y="447" width={person.armEnd-25} height="217"/></clipPath>
      <mask id="mug-body" maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="1024">
        <rect width="768" height="1024" fill="white"/>
        <rect x="25" y="447" width={person.armEnd-40} height="217" fill="black"/>
      </mask>
    </defs>
    <use href="#mug-person" mask="url(#mug-body)"/>
    {sick && <g mask="url(#mug-face)"><use href="#mug-person" filter="url(#mug-green-skin)"/></g>}
    <g transform={`rotate(${release * 22} ${person.elbowX} ${person.elbowY})`}>
      <use href="#mug-person" clipPath="url(#mug-forearm)"/>
    </g>
  </g>;
}

function BeerMug({ x }: { x: number }) {
  return <g transform={`translate(${x} 250)`}>
    <ellipse cx="5" cy="50" rx="25" ry="2.6" fill="#4b3524" opacity=".29"/>
    <image href="/tombola/halba.webp" x="-20.4" y="-1.8" width="58" height="52" preserveAspectRatio="none"/>
  </g>;
}

export default function MugCourt({ avatar, hits, lean, release, mug, ball, trail, guide, wallImpactY, landed }: SceneProps) {
  return <svg viewBox="0 0 680 340" role="img" aria-label={`Joc văzut din lateral. În stânga este peretele de ricoșeu. Pe peretele din spate sunt un tablou cu Rectoratul și o bibliotecă. Personajul are ${hits > 5 ? "fața înverzită" : "tenul natural"}.`}>
    <defs>
      <linearGradient id="mug-wall-shadow"><stop stopColor="#33271c" stopOpacity=".3"/><stop offset="1" stopColor="#49392b" stopOpacity="0"/></linearGradient>
      <pattern id="mug-masonry" width="16" height="48" patternUnits="userSpaceOnUse">
        <rect width="16" height="48" fill="#948575"/><path d="M0 1 16 5v19L0 21ZM0 23l16 3v20L0 43Z" fill="#ad9e8d"/>
        <path d="M0 1l16 4M0 23l16 3" stroke="#d1c3ae" strokeWidth="1.2"/><path d="M2 8v7m8 18 2 3" opacity=".45" stroke="#837465"/>
      </pattern>
      <linearGradient id="mug-desk" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#a47344"/><stop offset=".22" stopColor="#976840"/><stop offset=".55" stopColor="#725033"/><stop offset=".78" stopColor="#845a35"/><stop offset="1" stopColor="#513c2a"/>
      </linearGradient>
      <radialGradient id="mug-ball" cx=".32" cy=".24" r=".85"><stop stopColor="#fff8ca"/><stop offset=".56" stopColor="#ffca4d"/><stop offset="1" stopColor="#ce821b"/></radialGradient>
      <filter id="mug-soft-edge"><feGaussianBlur stdDeviation="3.5"/></filter>
      <filter id="mug-green-skin" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values=".29 .53 .08 0 0  .32 .60 .08 0 .035  .14 .40 .14 0 0  0 0 0 1 0"/>
      </filter>
    </defs>
    <Room/>
    <Student avatar={avatar} hits={hits} lean={lean} release={release}/>
    <g>
      <path d="M34 310v30m550-30v30" stroke="#413d36" strokeWidth="9"/>
      <path d="M32 312v28m550-28v28" stroke="#817565" strokeWidth="2"/>
      <rect x="16" y="300" width="590" height="13" rx="1.2" fill="url(#mug-desk)" stroke="#705239" strokeWidth="1"/>
      <path d="M16 300h589" stroke="#e2bf8a" strokeWidth="2"/>
      <path d="M20 304q130 1.5 230 0t349 1m-574 3q144-1 238 .4t330-.6" fill="none" stroke="#54351e" strokeWidth=".8" opacity=".48"/>
    </g>
    {mug !== undefined && <BeerMug x={mug}/>}
    {wallImpactY !== undefined && <path d={`M18 ${wallImpactY-5}l6-4m-6 10 8 2m-7 2 4 5`} fill="none" stroke="#fff0bf" strokeWidth="1.6" strokeLinecap="round"/>}
    {guide && <polyline fill="none" stroke="#514332" opacity=".8" points={guide} strokeWidth="1.8" strokeDasharray="3 5" strokeLinecap="round"/>}
    {trail.length > 1 && <polyline fill="none" points={trail.map(p=>p.join(",")).join(" ")} stroke="#fff4d1" opacity=".75" strokeWidth="1.8" strokeDasharray="3 5" strokeLinecap="round"/>}
    <circle cx={ball[0]} cy={ball[1]} r="6" fill="url(#mug-ball)" stroke="#795015" strokeWidth=".85" opacity={landed ? .6 : 1}/>
  </svg>;
}
