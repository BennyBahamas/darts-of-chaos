"use client";

import { segmentLabel } from "@/game/darts";
import type { SegmentKey } from "@/game/types";
import { CX, CY, ORDER, R, WEDGE, pt, ringRadii, sector } from "./boardGeometry";

// ============================================================================
// Tappable dartboard for reward placement: pick a segment by tapping its wedge
// or bull directly on the board, instead of hunting through a flat list.
// Shares its geometry with the read-only Dartboard (boardGeometry.ts) but adds
// a transparent, clickable overlay per segment plus a highlight for the
// current selection. The old <select> stays alongside it in RewardScreen as a
// precise fallback for thin segments that are fiddly to tap on a phone.
// ============================================================================

const HIGHLIGHT = "#34d399";

interface DartboardPickerProps {
  value: SegmentKey | null;
  onSelect: (segment: SegmentKey) => void;
}

export function DartboardPicker({ value, onSelect }: DartboardPickerProps) {
  const wedgeTargets = ORDER.flatMap((num, i) => {
    const center = i * WEDGE;
    const a0 = center - WEDGE / 2;
    const a1 = center + WEDGE / 2;
    return (["S", "D", "T"] as const).map((ring) => {
      const [rI, rO] = ringRadii(ring);
      return { seg: `${ring}${num}`, path: sector(rI, rO, a0, a1) };
    });
  });

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
    <div className="space-y-2">
      <svg viewBox="0 0 400 400" className="mx-auto block w-full max-w-xs touch-manipulation select-none">
        {baseWedges}
        <circle cx={CX} cy={CY} r={R.obOuter} fill="#14532d" stroke="#0b1220" strokeWidth={0.5} />
        <circle cx={CX} cy={CY} r={R.ibOuter} fill="#7f1d1d" stroke="#0b1220" strokeWidth={0.5} />

        {ORDER.map((num, i) => {
          const [x, y] = pt(R.numbers, i * WEDGE);
          return (
            <text key={num} x={x} y={y} fill="#94a3b8" fontSize={11} textAnchor="middle" dominantBaseline="middle">
              {num}
            </text>
          );
        })}

        {/* Tap targets for the 60 single/double/triple wedges */}
        {wedgeTargets.map(({ seg, path }) => {
          const selected = value === seg;
          return (
            <path
              key={seg}
              d={path}
              fill={selected ? HIGHLIGHT : "transparent"}
              fillOpacity={selected ? 0.55 : 0}
              stroke={selected ? HIGHLIGHT : "none"}
              strokeWidth={selected ? 1.5 : 0}
              pointerEvents="all"
              className="cursor-pointer"
              onClick={() => onSelect(seg)}
            >
              <title>
                {segmentLabel(seg)} ({seg})
              </title>
            </path>
          );
        })}

        {/* Outer bull tap target (drawn first so Inner Bull sits on top of it) */}
        <circle
          cx={CX}
          cy={CY}
          r={R.obOuter}
          fill={value === "OB" ? HIGHLIGHT : "transparent"}
          fillOpacity={value === "OB" ? 0.55 : 0}
          stroke={value === "OB" ? HIGHLIGHT : "none"}
          strokeWidth={value === "OB" ? 1.5 : 0}
          pointerEvents="all"
          className="cursor-pointer"
          onClick={() => onSelect("OB")}
        >
          <title>Outer Bull (OB)</title>
        </circle>
        <circle
          cx={CX}
          cy={CY}
          r={R.ibOuter}
          fill={value === "IB" ? HIGHLIGHT : "transparent"}
          fillOpacity={value === "IB" ? 0.55 : 0}
          stroke={value === "IB" ? HIGHLIGHT : "none"}
          strokeWidth={value === "IB" ? 1.5 : 0}
          pointerEvents="all"
          className="cursor-pointer"
          onClick={() => onSelect("IB")}
        >
          <title>Inner Bull (IB)</title>
        </circle>
      </svg>
      <p className="text-center text-xs text-slate-400">
        {value ? `Selected: ${segmentLabel(value)} (${value})` : "Tap a segment on the board"}
      </p>
    </div>
  );
}
