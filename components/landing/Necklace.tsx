// A gold bead necklace with a ruby pendant, drawn rather than photographed until the shop's own
// pictures are in. The beads hang on a quadratic curve; the numbers are in the SVG's own units.

const P0 = [52, 40];
const P1 = [200, 420];
const P2 = [348, 40];
const BEADS = 33; // odd, so one large bead sits at the very bottom above the pendant

const at = (t: number) => {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return [a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]];
};

// Equal distances along the curve, so the beads do not bunch up at the bottom where it is slower.
function beadPoints() {
  const steps = 600;
  const pts = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
  const lengths = [0];
  for (let i = 1; i <= steps; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lengths[steps];
  let j = 0;
  return Array.from({ length: BEADS }, (_, k) => {
    const want = (total * k) / (BEADS - 1);
    while (j < steps && lengths[j + 1] < want) j++;
    return pts[j];
  });
}

// Small gold dots ringing the stone, like milgrain work.
const milgrain = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return [200 + 23 * Math.cos(a), 314 + 27 * Math.sin(a)];
});

export function Necklace({ className = "" }: { className?: string }) {
  const beads = beadPoints();
  const r = (n: number) => Math.round(n * 10) / 10;

  return (
    <svg viewBox="0 0 400 360" className={className} role="img" aria-label="A gold bead necklace with a ruby pendant">
      <defs>
        <radialGradient id="nk-gold" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.35" stopColor="#ebc66f" />
          <stop offset="0.75" stopColor="#b8862f" />
          <stop offset="1" stopColor="#7a5518" />
        </radialGradient>
        <linearGradient id="nk-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc93" />
          <stop offset="0.5" stopColor="#c99a42" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
        <radialGradient id="nk-ruby" cx="40%" cy="32%" r="70%">
          <stop offset="0" stopColor="#f2828c" />
          <stop offset="0.45" stopColor="#b3233a" />
          <stop offset="1" stopColor="#5c0f1d" />
        </radialGradient>
        <linearGradient id="nk-thread" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8862f" stopOpacity="0" />
          <stop offset="1" stopColor="#b8862f" />
        </linearGradient>
        <filter id="nk-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#4a3209" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* The thread running up and round the neck, fading out at the top. */}
      <path d={`M${P0[0]} ${P0[1]} L26 0 M${P2[0]} ${P2[1]} L374 0`} stroke="url(#nk-thread)" strokeWidth="2" fill="none" />

      <g filter="url(#nk-shadow)">
        {beads.map(([x, y], k) => (
          <circle key={k} cx={r(x)} cy={r(y)} r={k % 2 === 0 ? 7.5 : 4} fill="url(#nk-gold)" />
        ))}

        <circle cx="200" cy="245" r="7" fill="none" stroke="url(#nk-plate)" strokeWidth="3.5" />
        <path
          d="M200 254 C224 278 236 298 236 316 A36 36 0 0 1 164 316 C164 298 176 278 200 254 Z"
          fill="url(#nk-plate)"
          stroke="#8a6420"
          strokeWidth="1.2"
        />
        {milgrain.map(([x, y], i) => (
          <circle key={i} cx={r(x)} cy={r(y)} r="1.7" fill="#fff1c4" opacity="0.9" />
        ))}
        <ellipse cx="200" cy="314" rx="15" ry="19" fill="url(#nk-ruby)" />
        <ellipse cx="195" cy="306" rx="4" ry="5.5" fill="#ffffff" opacity="0.35" />
      </g>
    </svg>
  );
}
