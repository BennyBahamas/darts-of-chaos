// ============================================================================
// 5. EFFECT REGISTRY (data-driven card pools)
// To add a new Mine / Zone / Chaos / Golden effect, add a definition object to
// the relevant pool file (mines.ts, zones.ts, chaos.ts, golden.ts). No
// component or engine changes are required — the engine looks effects up here.
// ============================================================================

import type { AfflictionType, Dart, GameEvent, GameState, PlacedEffect } from "../types";

/**
 * The sandboxed surface effects use to mutate the game. Effects never touch
 * React or the store directly — they receive this API from the engine.
 * `state` is a mutable draft; mutate it directly.
 */
export interface EffectAPI {
  state: GameState;
  rng: () => number; // 0..1
  log: (text: string) => void;
  addEvent: (e: Omit<GameEvent, "id">) => void;
  /** Credit an attacker for harming a victim (drinks / score). */
  creditNemesis: (
    attackerId: string | null,
    victimId: string,
    opts: { drinks?: number; scoreDamage?: number; directAttack?: boolean }
  ) => void;
  adjustScore: (playerId: string, delta: number) => void;
  /** Add to a player's *round* score (used by +Round Score public tiles). */
  addRoundScore: (playerId: string, delta: number) => void;
  /** Apply a one-round handicap to a player, active next round. */
  addAffliction: (playerId: string, a: { type: AfflictionType; label: string; icon: string }) => void;
  leaderId: () => string | null;
  /** The current Nemesis (attacker id) for a player, or null if none qualifies. */
  nemesisOf: (playerId: string) => string | null;
  playerName: (id: string) => string;
}

// ---- Mine -----------------------------------------------------------------

export interface MineDef {
  id: string;
  name: string;
  description: string;
  /** Eligible for the reward pool only once the winner has a Nemesis. */
  requiresNemesis?: boolean;
  onTrigger: (api: EffectAPI, ctx: { effect: PlacedEffect; victimId: string }) => void;
}

// ---- Zone -----------------------------------------------------------------

/**
 * Who suffers a zone's effect when its segment is hit:
 * - "hitter": the player who threw the dart (generic public tiles)
 * - "chosen": the creator's chosen target player, on ANY hit (player reward zones)
 * - "nemesis": the creator's current Nemesis, resolved at trigger time
 */
export type ZoneTarget = "hitter" | "chosen" | "nemesis";

export interface ZoneDef {
  id: string;
  name: string;
  description: string;
  /** Short badge shown on the board, e.g. "🍺", "-5", "+5T". */
  badge?: string;
  /** Eligible for the reward pool only once the winner has a Nemesis. */
  requiresNemesis?: boolean;
  /** Whom the effect lands on. Default "hitter". */
  target?: ZoneTarget;
  /** App-spawnable Public Tile (not offered as a reward card). */
  wild?: boolean;
  /** App-spawned Nemesis Tile — spawned once per round when any Nemesis exists. Never offered as a reward card. */
  nemesisTile?: boolean;
  /** Consumed after the first player hits it (one-shot visible tile). */
  firstHitOnly?: boolean;
  onTrigger: (api: EffectAPI, ctx: { effect: PlacedEffect; victimId: string }) => void;
}

// ---- Golden ---------------------------------------------------------------

export interface GoldenDef {
  id: string;
  name: string;
  description: string;
  /** Badge shown on the board instead of the default "⭐?". */
  badge?: string;
  onTrigger: (api: EffectAPI, ctx: { effect: PlacedEffect; victimId: string }) => void;
}

// ---- Chaos ----------------------------------------------------------------

export type ChaosKind = "immediate" | "roundWide" | "spawnGolden";

export interface ChaosDef {
  id: string;
  name: string;
  description: string;
  kind: ChaosKind;
  minRound?: number; // earliest round this can be selected
  /** Eligible for the chaos pool only once the winner has a Nemesis. */
  requiresNemesis?: boolean;

  /** immediate + spawnGolden: resolved during the reward phase. */
  resolve?: (api: EffectAPI, winnerId: string) => void;

  /** roundWide hooks, applied during the NEXT round's resolution. */
  roundScoreBonus?: (dart: Dart) => number; // extra round score per dart
  totalScoreBonusOnResolve?: (darts: Dart[]) => number; // extra total per player
  drinkModifier?: (baseDrinks: number) => number; // transform a drink penalty
}

// ---- Registries ------------------------------------------------------------

const mineRegistry: Record<string, MineDef> = {};
const zoneRegistry: Record<string, ZoneDef> = {};
const goldenRegistry: Record<string, GoldenDef> = {};
const chaosRegistry: Record<string, ChaosDef> = {};

export function registerMines(defs: MineDef[]) {
  for (const d of defs) mineRegistry[d.id] = d;
}
export function registerZones(defs: ZoneDef[]) {
  for (const d of defs) zoneRegistry[d.id] = d;
}
export function registerGolden(defs: GoldenDef[]) {
  for (const d of defs) goldenRegistry[d.id] = d;
}
export function registerChaos(defs: ChaosDef[]) {
  for (const d of defs) chaosRegistry[d.id] = d;
}

export const getMineDef = (id: string): MineDef | undefined => mineRegistry[id];
export const getZoneDef = (id: string): ZoneDef | undefined => zoneRegistry[id];
export const getGoldenDef = (id: string): GoldenDef | undefined => goldenRegistry[id];
export const getChaosDef = (id: string): ChaosDef | undefined => chaosRegistry[id];

export const allMineDefs = (): MineDef[] => Object.values(mineRegistry);
export const allZoneDefs = (): ZoneDef[] => Object.values(zoneRegistry);
/** Zones eligible to be offered as a reward card (excludes app-spawned wild tiles). */
/** Zones eligible to be offered as a reward card (excludes app-spawned tiles). */
export const rewardZoneDefs = (): ZoneDef[] => Object.values(zoneRegistry).filter((z) => !z.wild && !z.nemesisTile);
/** Zones that can be auto-spawned as public tiles each round. */
export const wildZoneDefs = (): ZoneDef[] => Object.values(zoneRegistry).filter((z) => z.wild);
/** Zones that can be auto-spawned when a Nemesis relationship exists. */
export const nemesisTileDefs = (): ZoneDef[] => Object.values(zoneRegistry).filter((z) => z.nemesisTile);
export const allGoldenDefs = (): GoldenDef[] => Object.values(goldenRegistry);
export const allChaosDefs = (): ChaosDef[] => Object.values(chaosRegistry);
