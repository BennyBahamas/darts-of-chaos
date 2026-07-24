// ============================================================================
// Pure SVG geometry for rendering a standard dartboard (viewBox 0 0 400 400).
// No React here — shared by the read-only board (Dartboard.tsx) and the
// tappable placement picker (DartboardPicker.tsx) so both draw from the same
// wedge/ring math.
// ============================================================================

// Standard dartboard order, clockwise from 20 at the top.
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const WEDGE = 360 / 20; // 18°

export const CX = 200;
export const CY = 200;
export const R = {
  ibOuter: 13, // inner bull
  obOuter: 28, // outer bull
  innerSingleOuter: 100,
  tripleOuter: 116,
  outerSingleOuter: 158,
  doubleOuter: 180,
  numbers: 192,
};

const TAU = Math.PI / 180;
export function pt(r: number, aDeg: number): [number, number] {
  const a = aDeg * TAU;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}
export function sector(rI: number, rO: number, a0: number, a1: number): string {
  const [x1, y1] = pt(rO, a0);
  const [x2, y2] = pt(rO, a1);
  const [x3, y3] = pt(rI, a1);
  const [x4, y4] = pt(rI, a0);
  return `M ${x1} ${y1} A ${rO} ${rO} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rI} ${rI} 0 0 0 ${x4} ${y4} Z`;
}

export type Ring = "S" | "D" | "T" | "OB" | "IB";

export function ringRadii(ring: Ring): [number, number] {
  switch (ring) {
    case "S":
      return [R.tripleOuter, R.outerSingleOuter]; // highlight the outer single band
    case "T":
      return [R.innerSingleOuter, R.tripleOuter];
    case "D":
      return [R.outerSingleOuter, R.doubleOuter];
    case "OB":
      return [R.ibOuter, R.obOuter];
    case "IB":
      return [0, R.ibOuter];
  }
}

export function parseSegment(seg: string): { ring: Ring; number: number | null } | null {
  if (seg === "OB") return { ring: "OB", number: null };
  if (seg === "IB") return { ring: "IB", number: null };
  const z = seg[0] as Ring;
  const n = parseInt(seg.slice(1), 10);
  if ((z === "S" || z === "D" || z === "T") && n >= 1 && n <= 20) return { ring: z, number: n };
  return null;
}
