import { ArrowUpRight, Route } from "lucide-react";

export function HeroMap() {
  return (
    <div className="hero-map" aria-label="Illustration of a Kolkata bus route connecting city stops" role="img">
      <div className="map-topline">
        <span className="map-topline-dot" />
        <span>THE CITY, CONNECTED</span>
        <span className="map-topline-icon">✳</span>
      </div>
      <svg className="map-illustration" viewBox="0 0 560 350" fill="none" aria-hidden="true">
        <path d="M-30 145C57 132 91 153 148 204C196 246 257 266 325 234C380 207 440 165 594 177" stroke="#c2dcc9" strokeWidth="18" strokeLinecap="round" />
        <path d="M125 -30C119 56 143 109 201 143C264 180 298 219 282 385" stroke="#c2dcc9" strokeWidth="14" strokeLinecap="round" />
        <path d="M412 -20C386 70 380 123 412 178C445 235 442 278 422 383" stroke="#c2dcc9" strokeWidth="13" strokeLinecap="round" />
        <path d="M-20 283C92 289 147 264 211 227C284 184 348 183 588 263" stroke="#cfe3d1" strokeWidth="9" strokeLinecap="round" />
        <path d="M-20 58C65 86 132 91 181 73C244 48 305 56 363 92C417 126 492 130 585 89" stroke="#cfe3d1" strokeWidth="9" strokeLinecap="round" />
        <path d="M78 76H168C204 76 217 91 229 124L250 173C263 202 290 207 324 207H348C381 207 395 220 395 254V279H484" stroke="#f7faf1" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M78 76H168C204 76 217 91 229 124L250 173C263 202 290 207 324 207H348C381 207 395 220 395 254V279H484" stroke="#17604a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="78" cy="76" r="15" fill="#f7faf1" />
        <circle cx="78" cy="76" r="8" fill="#f39769" />
        <circle cx="178" cy="78" r="10" fill="#f7faf1" />
        <circle cx="178" cy="78" r="5" fill="#17604a" />
        <circle cx="348" cy="207" r="10" fill="#f7faf1" />
        <circle cx="348" cy="207" r="5" fill="#17604a" />
        <circle cx="484" cy="279" r="15" fill="#f7faf1" />
        <circle cx="484" cy="279" r="8" fill="#f39769" />
        <g transform="translate(212 127)">
          <rect x="-5" y="4" width="112" height="93" rx="24" fill="#ffffff" fillOpacity="0.4" />
          <rect x="2" y="0" width="98" height="84" rx="21" fill="#164d3d" />
          <rect x="13" y="12" width="76" height="35" rx="8" fill="#d6eee0" />
          <path d="M51 12V47" stroke="#164d3d" strokeWidth="5" />
          <rect x="14" y="56" width="24" height="9" rx="4.5" fill="#f5a772" />
          <rect x="64" y="56" width="24" height="9" rx="4.5" fill="#f5a772" />
          <rect x="15" y="78" width="19" height="12" rx="4" fill="#263f37" />
          <rect x="68" y="78" width="19" height="12" rx="4" fill="#263f37" />
          <path d="M34 73H68" stroke="#cce4d3" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g>
          <rect x="39" y="25" width="109" height="30" rx="15" fill="#ffffff" />
          <text x="93.5" y="44" textAnchor="middle" fill="#27483b" fontSize="12" fontWeight="700" fontFamily="Arial, sans-serif">Esplanade</text>
          <rect x="391" y="295" width="86" height="30" rx="15" fill="#ffffff" />
          <text x="434" y="314" textAnchor="middle" fill="#27483b" fontSize="12" fontWeight="700" fontFamily="Arial, sans-serif">Garia</text>
          <rect x="331" y="144" width="104" height="29" rx="14.5" fill="#ffffff" fillOpacity="0.88" />
          <text x="383" y="163" textAnchor="middle" fill="#426653" fontSize="11" fontWeight="700" fontFamily="Arial, sans-serif">Park Street</text>
        </g>
      </svg>
      <div className="map-caption">
        <span className="map-caption-icon"><Route size={19} strokeWidth={2.2} /></span>
        <span><strong>Good routes. Better days.</strong><small>Wherever your day takes you.</small></span>
        <ArrowUpRight size={18} className="map-caption-arrow" />
      </div>
    </div>
  );
}
