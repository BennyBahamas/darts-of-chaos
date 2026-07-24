"use client";

import { useGame } from "@/store/gameStore";
import { getGoldenDef, getZoneDef } from "@/game/effects/registry";
import { CX, CY, ORDER, R, WEDGE, parseSegment, pt, ringRadii, sector, segmentBands } from "./boardGeometry";

// ============================================================================
// A deliberately simple visual dartboard. Its ONLY job is to communicate where
// the active *visible* effects and special tiles live — not to simulate a real
// board. Mines are hidden and are NEVER drawn here (only revealed when hit).
// Dart entry is still done with the dropdowns in DartInput; this is
// display-only. (Reward placement uses the tappable DartboardPicker instead,
// built on the same geometry from boardGeometry.ts.)
// ============================================================================

interface Marker {
  key: string;
  paths?: string[]; // wedge ring highlight(s) (S/D/T) — Single has 2 (inner + outer band)
  circle?: { r: number }; // bull highlight (OB/IB)
  bx: number;
  by: number;
  badge: string;
  color: string;
  title: string;
}

function markerFor(seg: string, badge: string, color: string, title: string, key: string): Marker | null {
  const parsed = parseSegment(seg);
  if (!parsed) return null;
  const { ring, number } = parsed;

  if (ring === "IB" || ring === "OB") {
    const [, rO] = ringRadii(ring);
    const [bx, by] = ring === "IB" ? [CX, CY] : pt(R.obOuter - 3, -30);
    return { key, circle: { r: rO }, bx, by, badge, color, title };
  }

  const i = ORDER.indexOf(number!);
  const center = i * WEDGE;
  const bands = segmentBands(ring);
  const paths = bands.map(([rI, rO]) => sector(rI, rO, center - WEDGE / 2, center + WEDGE / 2));
  // Anchor the badge at the outer-most band's midpoint (the only band for D/T; the
  // less cluttered, closer-to-the-edge one for Single, which has two bands).
  const [rI, rO] = bands[bands.length - 1];
  const [bx, by] = pt((rI + rO) / 2, center);
  return { key, paths, bx, by, badge, color, title };
}

export function Dartboard() {
  const game = useGame((s) => s.game);

  const markers: Marker[] = [];

  // Visible zones.
  for (const z of game.placedEffects.filter((e) => e.kind === "zone")) {
    const def = getZoneDef(z.defId);
    const badge = def?.badge ?? "•";
    const color = def?.nemesisTile
      ? "#a855f7" // nemesis -> purple
      : badge.startsWith("+")
      ? "#34d399" // bonus -> green
      : badge.includes("🍺")
      ? "#fb7185" // drink -> rose
      : "#22d3ee"; // score/other -> cyan
    const m = markerFor(z.segment, badge, color, def?.name ?? "Zone", z.id);
    if (m) markers.push(m);
  }
  // Golden tile (effect hidden -> "⭐ ?").
  if (game.goldenTile) {
    const goldenBadge = getGoldenDef(game.goldenTile.defId)?.badge ?? "⭐?";
    const m = markerFor(game.goldenTile.segment, goldenBadge, "#f59e0b", "Golden tile — secret effect inside!", "golden");
    if (m) markers.push(m);
  }

  // Base wedges.
  const baseWedges = ORDER.map((num, i) => {
    const center = i * WEDGE;
    const a0 = center - WEDGE / 2;
    const a1 = center + WEDGE / 2;
    const dark = i % 2 === 0;
    const single = dark ? "#1e293b" : "#0f172a";
    const ringFill = dark ? "#334155" : "#1e293b";
    return (
      <g key={num}>
        <path d={sector(R.obOuter, R.innerSingleOuter, a0, a1)} fill={single} stroke="#0b1220" strokeWidth={0.5} />
        <path d={sector(R.innerSingleOuter, R.tripleOuter, a0, a1)} fill={ringFill} stroke="#0b1220" strokeWidth={0.5} />
        <path d={sector(R.tripleOuter, R.outerSingleOuter, a0, a1)} fill={single} stroke="#0b1220" strokeWidth={0.5} />
        <path d={sector(R.outerSingleOuter, R.doubleOuter, a0, a1)} fill={ringFill} stroke="#0b1220" strokeWidth={0.5} />
      </g>
    );
  });

  return (
    <div className="card">
      <div className="label mb-2">Board</div>
      <svg viewBox="0 0 400 400" className="mx-auto block w-full max-w-sm">
        {/* base */}
        {baseWedges}
        {/* bull */}
        <circle cx={CX} cy={CY} r={R.obOuter} fill="#14532d" stroke="#0b1220" strokeWidth={0.5} />
        <circle cx={CX} cy={CY} r={R.ibOuter} fill="#7f1d1d" stroke="#0b1220" strokeWidth={0.5} />

        {/* numbers */}
        {ORDER.map((num, i) => {
          const [x, y] = pt(R.numbers, i * WEDGE);
          return (
            <text
              key={num}
              x={x}
              y={y}
              fill="#94a3b8"
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {num}
            </text>
          );
        })}

        {/* effect highlights (visible effects + golden only — never mines) */}
        {markers.map((m) => (
          <g key={m.key}>
            <title>{m.title}</title>
            {m.paths?.map((d, i) => (
              <path key={i} d={d} fill={m.color} fillOpacity={0.55} stroke={m.color} strokeWidth={1} />
            ))}
            {m.circle && (
              <circle cx={CX} cy={CY} r={m.circle.r} fill={m.color} fillOpacity={0.55} stroke={m.color} strokeWidth={1} />
            )}
            <text
              x={m.bx}
              y={m.by}
              fill="#0b1220"
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {m.badge}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Legend for the board's badge colors — kept separate so Play can show just
 * the board while Effects shows the itemized companion (legend + summary). */
export function BoardLegend() {
  return (
    <div className="card">
      <div className="label mb-2">Legend</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>🍺 drink</span>
        <span><span style={{ color: "#34d399" }}>+</span> bonus</span>
        <span><span style={{ color: "#22d3ee" }}>−</span> penalty</span>
        <span><span style={{ color: "#a855f7" }}>☠</span> nemesis</span>
        <span><span style={{ color: "#f59e0b" }}>⭐?</span> golden (hidden)</span>
        <span className="text-slate-500">mines stay hidden until hit</span>
      </div>
    </div>
  );
}
