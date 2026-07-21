// ============================================================================
// Dart parsing & scoring (pure functions, no React).
// ============================================================================

import type { Dart, DartZone, SegmentKey } from "./types";

export const DART_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20

/** Parse a raw dart string ("T18", "OB", "MISS") into a Dart. */
export function parseDart(raw: string): Dart {
  const r = raw.trim().toUpperCase();
  if (r === "MISS" || r === "") {
    return { raw: "MISS", zone: "MISS", number: null, baseScore: 0 };
  }
  if (r === "OB") return { raw: "OB", zone: "OB", number: null, baseScore: 25 };
  if (r === "IB") return { raw: "IB", zone: "IB", number: null, baseScore: 50 };

  const zone = r[0] as DartZone;
  const number = parseInt(r.slice(1), 10);
  if ((zone === "S" || zone === "D" || zone === "T") && number >= 1 && number <= 20) {
    const mult = zone === "S" ? 1 : zone === "D" ? 2 : 3;
    return { raw: r, zone, number, baseScore: number * mult };
  }
  // Anything unrecognized scores as a miss rather than crashing the engine.
  return { raw: "MISS", zone: "MISS", number: null, baseScore: 0 };
}

/** The segment a dart occupies, or null if it cannot host an effect (MISS). */
export function dartSegment(dart: Dart): SegmentKey | null {
  if (dart.zone === "MISS") return null;
  return dart.raw;
}

export function isBull(dart: Dart): boolean {
  return dart.zone === "OB" || dart.zone === "IB";
}

/** Human label for a segment key. */
export function segmentLabel(seg: SegmentKey): string {
  if (seg === "OB") return "Outer Bull";
  if (seg === "IB") return "Inner Bull";
  const map: Record<string, string> = { S: "Single", D: "Double", T: "Triple" };
  return `${map[seg[0]] ?? ""} ${seg.slice(1)}`.trim();
}

/** Multiplier for player-created effects based on segment ring (S=1, D=2, T=3). */
export function segmentMultiplier(segment: string): number {
  const z = segment[0];
  if (z === "D") return 2;
  if (z === "T") return 3;
  return 1;
}

/** All segments a winner may place a mine/zone on. */
export function allPlaceableSegments(): SegmentKey[] {
  const segs: SegmentKey[] = [];
  for (const z of ["S", "D", "T"] as const) {
    for (const n of DART_NUMBERS) segs.push(`${z}${n}`);
  }
  segs.push("OB", "IB");
  return segs;
}
