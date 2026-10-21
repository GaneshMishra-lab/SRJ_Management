// Line drawings for the collection tiles, in the same thin stroke as the app's icons. They stand in
// for photographs until the design gallery has pictures of its own.

export type CategoryArtKind = "rings" | "earrings" | "chains" | "pendants" | "mangalsutra" | "silver";

const svgProps = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Black beads of a mangalsutra along a curve from (8, 8) down to (24, 28) and back up to (40, 8).
const maniBeads = Array.from({ length: 15 }, (_, i) => {
  const t = i / 14;
  const x = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 24 + t * t * 40;
  const y = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 48 + t * t * 8;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
});

// Ghungroo bells hanging under the anklet, at points on its lower edge.
const bells = [
  [12, 27.3],
  [18, 29.4],
  [24, 30],
  [30, 29.4],
  [36, 27.3],
];

export function CategoryArt({ kind, className = "" }: { kind: CategoryArtKind; className?: string }) {
  switch (kind) {
    case "rings":
      return (
        <svg {...svgProps} className={className}>
          <circle cx="24" cy="30" r="11" />
          <circle cx="24" cy="30" r="8.5" />
          <path d="M19 13.5 24 8.5l5 5-5 5z" />
          <path d="M19 13.5h10M24 8.5v10" strokeWidth="0.8" />
        </svg>
      );
    case "earrings":
      return (
        <svg {...svgProps} className={className}>
          <path d="M24 12.5V6.5c0-1.7 1.4-2.5 3-2.5" />
          <circle cx="24" cy="15" r="2.5" />
          <path d="M24 17.5v2.5" />
          <path d="M14.5 33c0-7 4.3-13 9.5-13s9.5 6 9.5 13z" />
          <path d="M18.5 27.5h11" strokeWidth="0.8" />
          {[16, 20, 24, 28, 32].map((x) => (
            <circle key={x} cx={x} cy="36.5" r="1.4" />
          ))}
        </svg>
      );
    case "chains":
      return (
        <svg {...svgProps} className={className}>
          <g transform="rotate(-24 24 24)">
            <ellipse cx="11" cy="24" rx="7" ry="4" />
            <ellipse cx="24" cy="24" rx="7" ry="4" />
            <ellipse cx="37" cy="24" rx="7" ry="4" />
          </g>
        </svg>
      );
    case "pendants":
      return (
        <svg {...svgProps} className={className}>
          <path d="M8 4l14 16.5M40 4 26 20.5" strokeWidth="0.9" />
          <circle cx="24" cy="22" r="2.2" />
          <ellipse cx="24" cy="34" rx="8" ry="10" />
          <ellipse cx="24" cy="34" rx="4.5" ry="6" />
        </svg>
      );
    case "mangalsutra":
      return (
        <svg {...svgProps} className={className}>
          {maniBeads.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />
          ))}
          <path d="M24 28.5v3" />
          <path d="M15.5 33h8a4 4 0 0 1-8 0zM24.5 33h8a4 4 0 0 1-8 0z" />
        </svg>
      );
    case "silver":
      return (
        <svg {...svgProps} className={className}>
          <ellipse cx="24" cy="22" rx="16" ry="8" />
          {bells.map(([x, y]) => (
            <g key={x}>
              <path d={`M${x} ${y}v2.5`} strokeWidth="0.9" />
              <circle cx={x} cy={y + 4.3} r="1.8" />
            </g>
          ))}
        </svg>
      );
  }
}
