// ============================================================================
// Nemesis logic. A player's Nemesis = whoever has wronged them most.
// "Wronging" is measured in heat — a unified score combining drinks inflicted,
// score damage dealt, and direct attacks made.
// ============================================================================

import type { GameState, NemesisStats, PairStat } from "./types";

export const HEAT_PER_DRINK = 1;
export const HEAT_PER_5_SCORE = 1;         // 1 heat per 5 pts of score damage
export const HEAT_PER_DIRECT_ATTACK = 0.5;

export const NEMESIS_THRESHOLD = 5;         // heat required to qualify as a Nemesis
const SHOWDOWN_HEAT_THRESHOLD = 8;          // heat required before a showdown can fire
const SHOWDOWN_CHANCE = 0.5;

/** Compute the heat a single attacker→victim pair has accumulated. */
export function heatOf(stat: PairStat): number {
  return (
    stat.drinks * HEAT_PER_DRINK +
    Math.floor(stat.scoreDamage / 5) * HEAT_PER_5_SCORE +
    stat.directAttacks * HEAT_PER_DIRECT_ATTACK
  );
}

export function pairKey(attackerId: string, victimId: string): string {
  return `${attackerId}->${victimId}`;
}

/** Order-independent key for a showdown pair (same regardless of who challenged whom). */
export function showdownPairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

export function getPair(stats: NemesisStats, attackerId: string, victimId: string): PairStat {
  const key = pairKey(attackerId, victimId);
  return stats[key] ?? { drinks: 0, scoreDamage: 0, directAttacks: 0 };
}

export function credit(
  stats: NemesisStats,
  attackerId: string | null,
  victimId: string,
  opts: { drinks?: number; scoreDamage?: number; directAttack?: boolean }
): void {
  if (!attackerId || attackerId === victimId) return;
  const key = pairKey(attackerId, victimId);
  const cur = stats[key] ?? { drinks: 0, scoreDamage: 0, directAttacks: 0 };
  stats[key] = {
    drinks: cur.drinks + (opts.drinks ?? 0),
    scoreDamage: cur.scoreDamage + (opts.scoreDamage ?? 0),
    directAttacks: cur.directAttacks + (opts.directAttack ? 1 : 0),
  };
}

/** Return the highest-heat attacker who qualifies as a Nemesis for this victim, or null. */
export function nemesisOf(stats: NemesisStats, victimId: string): { attackerId: string; heat: number } | null {
  let best: { attackerId: string; heat: number } | null = null;
  for (const key of Object.keys(stats)) {
    const [attackerId, vId] = key.split("->");
    if (vId !== victimId) continue;
    const heat = heatOf(stats[key]);
    if (heat < NEMESIS_THRESHOLD) continue;
    if (!best || heat > best.heat) best = { attackerId, heat };
  }
  return best;
}

/** True if any Nemesis relationship qualifies for this victim. */
export function hasNemesis(stats: NemesisStats, victimId: string): boolean {
  return nemesisOf(stats, victimId) !== null;
}

/** True if at least one Nemesis relationship exists anywhere in the game. */
export function anyNemesisExists(stats: NemesisStats): boolean {
  for (const key of Object.keys(stats)) {
    if (heatOf(stats[key]) >= NEMESIS_THRESHOLD) return true;
  }
  return false;
}

/**
 * Decide whether a Nemesis Showdown should fire this round end. Returns the
 * pair if a rivalry is hot enough and the coin flip lands.
 */
export function pickShowdown(
  state: GameState,
  rng: () => number
): { aId: string; bId: string } | null {
  const stats = state.nemesis;
  const completed = state.showdownsCompleted ?? {};
  const candidates: { aId: string; bId: string; heat: number }[] = [];
  for (const key of Object.keys(stats)) {
    const [attackerId, victimId] = key.split("->");
    const heat = heatOf(stats[key]);
    if (heat >= SHOWDOWN_HEAT_THRESHOLD && !completed[showdownPairKey(attackerId, victimId)]) {
      candidates.push({ aId: victimId, bId: attackerId, heat });
    }
  }
  if (candidates.length === 0) return null;
  if (rng() > SHOWDOWN_CHANCE) return null;
  candidates.sort((a, b) => b.heat - a.heat);
  return { aId: candidates[0].aId, bId: candidates[0].bId };
}

/** Easter eggs for the showdown outcome. */
export function showdownMessage(winnerName: string, loserName: string): string | null {
  const w = winnerName.trim().toLowerCase();
  const l = loserName.trim().toLowerCase();
  if (w === "taavet" && l === "kaspar") return "Who's 5'11 now?";
  if (w === "kaspar" && l === "taavet") return "Back to 5'11, son.";
  return null;
}