/** Decorative, lightweight BeerPong artwork shared by the hub and home card. */
export default function BeerPongArtwork({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 480 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bp-glass" x1="204" y1="125" x2="310" y2="260" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE9A6" stopOpacity=".96" />
          <stop offset=".43" stopColor="#F5B63F" stopOpacity=".93" />
          <stop offset="1" stopColor="#C97931" />
        </linearGradient>
        <linearGradient id="bp-table" x1="40" y1="250" x2="440" y2="302" gradientUnits="userSpaceOnUse">
          <stop stopColor="#278A6C" />
          <stop offset="1" stopColor="#0D574F" />
        </linearGradient>
        <linearGradient id="bp-ball" x1="124" y1="74" x2="176" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D8F8E9" />
        </linearGradient>
      </defs>
      <circle cx="249" cy="150" r="131" stroke="#B6F3C7" strokeOpacity=".16" strokeWidth="2" strokeDasharray="8 13" />
      <circle cx="249" cy="150" r="101" stroke="#FFE6A9" strokeOpacity=".13" strokeWidth="2" />
      <path d="M43 244 260 190l181 56-207 62L43 244Z" fill="url(#bp-table)" stroke="#91E4B0" strokeOpacity=".55" strokeWidth="3" />
      <path d="M47 244 233 306M440 246 233 306" stroke="#B8F4D2" strokeOpacity=".33" strokeWidth="2" />
      <path d="m119 226 189 53M178 209l192 54M257 190l1 117" stroke="#B8F4D2" strokeOpacity=".23" strokeWidth="2" />
      <ellipse cx="266" cy="256" rx="66" ry="14" fill="#071E26" fillOpacity=".35" />
      <path d="M307 149c25-8 47 6 46 30-1 26-24 41-47 34" stroke="#BFEBD6" strokeOpacity=".83" strokeWidth="17" strokeLinecap="round" />
      <path d="M307 149c23-8 36 5 35 27-1 19-14 31-35 29" stroke="#1F6E66" strokeWidth="6" strokeLinecap="round" />
      <path d="m208 140 113 0-13 103c-3 19-82 20-87 0l-13-103Z" fill="url(#bp-glass)" stroke="#FFF7D4" strokeWidth="5" strokeLinejoin="round" />
      <path d="m220 163 10 74M309 163l-9 72" stroke="#FFF5D9" strokeOpacity=".53" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="264" cy="141" rx="57" ry="18" fill="#F9E1AD" stroke="#FFFDF0" strokeWidth="5" />
      <ellipse cx="264" cy="140" rx="42" ry="10" fill="#E99A3D" />
      <path d="M218 128c-13-15 6-27 22-20 6-18 31-19 42-4 16-9 31 0 29 13 17 1 17 18 3 23-32 7-91 9-104-2-7-5-5-11 8-10Z" fill="#FFF4D6" stroke="#FFFDF4" strokeWidth="3" />
      <circle cx="237" cy="128" r="4" fill="#E5C78B" />
      <circle cx="273" cy="119" r="3" fill="#E5C78B" />
      <circle cx="294" cy="131" r="3" fill="#E5C78B" />
      <path d="M73 182c44-90 91-119 145-75" stroke="#FFE3A2" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 14" />
      <path d="m203 92 17 16-23 6" stroke="#FFE3A2" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="118" cy="91" r="26" fill="url(#bp-ball)" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M108 78c-9 3-13 9-15 17" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M361 74v22M350 85h22M397 144v14M390 151h14" stroke="#FFE4A2" strokeWidth="4" strokeLinecap="round" />
      <circle cx="78" cy="137" r="4" fill="#A8EFC5" />
      <circle cx="380" cy="207" r="5" fill="#A8EFC5" />
      <circle cx="414" cy="107" r="3" fill="#FFE4A2" />
    </svg>
  );
}
