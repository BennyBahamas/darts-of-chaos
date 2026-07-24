// ============================================================================
// 4. CORE ENGINE + EFFECT RESOLUTION ORDER
// All game logic lives here (and in the effect pools). The store only wires
// these pure-ish functions to React. Every function mutates the passed-in
// GameState draft; the store re-commits the draft via set().
//
// EFFECT RESOLUTION ORDER
// -----------------------
// Per dart, at turn submit (resolveDartTriggers):
//   1. score the dart
//   2. Golden tile match  -> trigger, reveal, remove
//   3. Mine match         -> trigger, reveal, remove, credit creator
//   4. Zone match         -> trigger (repeatable), credit creator
//
// At round resolve (resolveRound):
//   1. round-wide chaos: Triple Fever -> round score; Bull Madness -> total
//   2. add round scores to totals
//   3. determine winner (max) and last place (min)
//   4. drinks: winner 0, last 2, others 1; Happy Hour transforms penalties
//   5. reveal + remove untriggered mines; remove expired zones
//   6. clear round modifiers; update nemesis; maybe queue a showdown
//
// During reward (resolveChaosChoice / confirmPlacement):
//   - immediate chaos resolves now; round-wide chaos arms the next round;
//     Hidden Fortune spawns a golden tile (round >= 5, max one active);
//     mine/zone get placed for the next round.
// ============================================================================

import { allPlaceableSegments, dartSegment, isBull, parseDart } from "./darts";
import {
  allGoldenDefs,
  allMineDefs,
  getChaosDef,
  getGoldenDef,
  getMineDef,
  getZoneDef,
  rewardZoneDefs,
  wildZoneDefs,
  wildDrinkZoneDefs,
  wildOtherZoneDefs,
  nemesisTileDefs,
  type EffectAPI,
} from "./effects/registry";
import { GOLDEN_MIN_ROUND, HIDDEN_FORTUNE_ID, NATURAL_GOLDEN_CHANCE } from "./effects/chaos";
import { anyNemesisExists, credit, getPair, hasNemesis, heatOf, NEMESIS_THRESHOLD, nemesisOf, pickShowdown, showdownMessage, showdownPairKey } from "./nemesis";
import type {
  Affliction,
  CardType,
  Dart,
  GameEvent,
  GameState,
  PlacedEffect,
  PlayerRoundResult,
  RewardState,
} from "./types";

// ---- id helpers ------------------------------------------------------------

let counter = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

// In online mode, plain informational events are dismissed per-device
// (client-local, never removed from this shared array) rather than shifted
// out globally — see src/store/gameStore.ts. That means this array only
// shrinks when an assign event resolves, so cap its growth here. Never drops
// an unresolved assign event (`.assign` present) — that's a genuine pending
// decision, not just an announcement.
const MAX_PENDING_EVENTS = 40;
function pushEvent(state: GameState, e: Omit<GameEvent, "id">) {
  state.pendingEvents.push({ ...e, id: uid("evt") });
  const overflow = state.pendingEvents.length - MAX_PENDING_EVENTS;
  if (overflow <= 0) return;
  let dropped = 0;
  state.pendingEvents = state.pendingEvents.filter((evt) => {
    if (dropped >= overflow || evt.assign) return true;
    dropped++;
    return false;
  });
}

// ---- shared API factory ----------------------------------------------------

function makeApi(state: GameState, rng: () => number): EffectAPI {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "??";
  return {
    state,
    rng,
    log: (text) => state.log.push({ id: uid("log"), round: state.round, text }),
    addEvent: (e: Omit<GameEvent, "id">) => pushEvent(state, e),
    creditNemesis: (attackerId, victimId, opts) => {
      const before = attackerId && attackerId !== victimId ? getPair(state.nemesis, attackerId, victimId) : null;
      const wasNemesis = before ? heatOf(before) >= NEMESIS_THRESHOLD : false;
      credit(state.nemesis, attackerId, victimId, opts);
      if (attackerId && attackerId !== victimId && !wasNemesis) {
        const after = getPair(state.nemesis, attackerId, victimId);
        const heat = heatOf(after);
        if (heat >= NEMESIS_THRESHOLD) {
          const aName = state.players.find((p) => p.id === attackerId)?.name ?? "??";
          const vName = state.players.find((p) => p.id === victimId)?.name ?? "??";
          const parts: string[] = [];
          if (after.drinks > 0) parts.push(`${after.drinks} drinks`);
          if (after.scoreDamage > 0) parts.push(`${after.scoreDamage} pts taken`);
          if (after.directAttacks > 0) parts.push(`${after.directAttacks} direct attacks`);
          state.log.push({ id: uid("log"), round: state.round, text: `${aName} is now ${vName}'s Nemesis (${heat} heat).` });
          pushEvent(state, {
            type: "nemesis",
            title: "☠️ NEMESIS UNLOCKED",
            lines: [
              `${aName} has wronged ${vName} — ${parts.join(", ")} (${heat} heat) — ${vName} now has a Nemesis!`,
              "I wonder what happens now?",
            ],
          });
        }
      }
    },
    adjustScore: (playerId, delta) => {
      const p = state.players.find((x) => x.id === playerId);
      if (p) p.totalScore += delta;
    },
    addRoundScore: (playerId, delta) => {
      state.roundScoreBonus[playerId] = (state.roundScoreBonus[playerId] ?? 0) + delta;
    },
    leaderId: () => leaderId(state),
    nemesisOf: (playerId) => nemesisOf(state.nemesis, playerId)?.attackerId ?? null,
    addAffliction: (playerId, a) => {
      state.pendingAfflictions.push({ id: uid("afl"), playerId, ...a });
    },
    playerName: name,
  };
}

/** Darts the player throws this round (3 minus any reducedDarts handicaps, min 1). */
export function dartsForPlayer(state: GameState, playerId: string): number {
  const reduced = (state.activeAfflictions ?? []).filter(
    (a) => a.playerId === playerId && a.type === "reducedDarts"
  ).length;
  return Math.max(1, 3 - reduced);
}

/** A fresh empty dart array sized for the given player's current handicaps. */
export function freshDarts(state: GameState, playerId: string): (string | null)[] {
  return Array(dartsForPlayer(state, playerId)).fill(null);
}

/** A fresh initial GameState, shared by local mode and the room server so both start identically. */
export function emptyGameState(): GameState {
  return {
    phase: "setup",
    round: 1,
    maxRounds: 10,
    players: [],
    currentPlayerIndex: 0,
    currentDarts: [null, null, null],
    roundThrows: {},
    placedEffects: [],
    goldenTile: null,
    activeRoundModifiers: [],
    activeAfflictions: [],
    pendingAfflictions: [],
    roundScoreBonus: {},
    roundResult: null,
    reward: null,
    nemesis: {},
    showdown: null,
    showdownsCompleted: {},
    chaosHistory: [],
    pendingEvents: [],
    log: [],
  };
}

export function leaderId(state: GameState): string | null {
  if (state.players.length === 0) return null;
  return [...state.players].sort((a, b) => b.totalScore - a.totalScore)[0].id;
}

// ---- per-dart trigger resolution ------------------------------------------

function resolveDartTriggers(state: GameState, playerId: string, dart: Dart, rng: () => number) {
  const seg = dartSegment(dart);
  if (!seg) return; // MISS hosts nothing
  const api = makeApi(state, rng);

  // 2. Golden
  if (state.goldenTile && !state.goldenTile.triggered && state.goldenTile.segment === seg) {
    const def = getGoldenDef(state.goldenTile.defId);
    if (def) {
      state.goldenTile.triggered = true;
      def.onTrigger(api, { effect: state.goldenTile, victimId: playerId });
    }
    state.goldenTile = null; // removed after triggering
  }

  // 3. Mines (one-time, hidden). Iterate a copy; remove triggered ones.
  for (const mine of state.placedEffects.filter((e) => e.kind === "mine" && !e.triggered && e.segment === seg)) {
    const def = getMineDef(mine.defId);
    mine.triggered = true;
    if (def) def.onTrigger(api, { effect: mine, victimId: playerId });
  }
  state.placedEffects = state.placedEffects.filter((e) => !(e.kind === "mine" && e.triggered));

  // 4. Zones. The victim depends on the zone's target mode:
  //    - "chosen": the creator's chosen target suffers on ANY hit (reward curses)
  //    - "nemesis": the creator's current Nemesis suffers on ANY hit (resolved at trigger time)
  //    - "hitter" (default): the player who hit the segment suffers (Public Tiles)
  //    First-hit-only tiles are consumed after their first trigger.
  for (const zone of state.placedEffects.filter((e) => e.kind === "zone" && !e.triggered && e.segment === seg)) {
    const def = getZoneDef(zone.defId);
    if (!def) continue;
    const victimId =
      def.target === "chosen"
        ? zone.targetId
        : def.target === "nemesis"
        ? (zone.creatorId ? nemesisOf(state.nemesis, zone.creatorId)?.attackerId ?? null : null)
        : playerId;
    if (!victimId) continue; // chosen/nemesis zone with no valid target -> nothing to do
    def.onTrigger(api, { effect: zone, victimId });
    if (def.firstHitOnly) zone.triggered = true;
  }
  state.placedEffects = state.placedEffects.filter((e) => !(e.kind === "zone" && e.triggered));
}

// ---- turn submission -------------------------------------------------------

/** Apply one player's 3 darts: record throws and resolve per-dart triggers. */
export function applyTurn(state: GameState, playerId: string, rawDarts: (string | null)[], rng: () => number) {
  const darts = rawDarts.map((r) => parseDart(r ?? "MISS"));
  state.roundThrows[playerId] = darts;
  for (const dart of darts) resolveDartTriggers(state, playerId, dart, rng);
}

// ---- round resolution ------------------------------------------------------

export function resolveRound(state: GameState, rng: () => number) {
  const api = makeApi(state, rng);
  const activeChaos = state.activeRoundModifiers
    .map((m) => getChaosDef(m.defId))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  const results: PlayerRoundResult[] = state.players.map((p) => {
    const darts = state.roundThrows[p.id] ?? [];
    let roundScore = darts.reduce((s, d) => s + d.baseScore, 0);
    // Double or Nothing: first dart counts double
    const hasDon = (state.activeAfflictions ?? []).some((a) => a.playerId === p.id && a.type === "doubleOrNothing");
    if (hasDon && darts.length > 0) roundScore += darts[0].baseScore;
    // 1a. +Round Score Public Tiles collected this round
    roundScore += state.roundScoreBonus[p.id] ?? 0;
    // 1b. Triple Fever and any per-dart round-score chaos
    for (const c of activeChaos) {
      if (!c.roundScoreBonus) continue;
      for (const d of darts) roundScore += c.roundScoreBonus(d);
    }
    // 1b. Bull Madness and any total-score chaos applied on resolve
    let totalBonus = 0;
    for (const c of activeChaos) {
      if (c.totalScoreBonusOnResolve) totalBonus += c.totalScoreBonusOnResolve(darts);
    }
    if (totalBonus !== 0) {
      api.adjustScore(p.id, totalBonus);
      api.log(`${p.name} earns +${totalBonus} Total Score from chaos.`);
    }
    return { playerId: p.id, roundScore, drinks: 0 };
  });

  // 2. add round scores to totals
  for (const r of results) api.adjustScore(r.playerId, r.roundScore);

  // 3. winner (max) and last place (min)
  const sorted = [...results].sort((a, b) => b.roundScore - a.roundScore);
  const winnerId = sorted[0].playerId;
  const minScore = sorted[sorted.length - 1].roundScore;
  const lastCandidates = results.filter((r) => r.roundScore === minScore);
  const lastPlaceId =
    lastCandidates.find((r) => r.playerId !== winnerId)?.playerId ??
    lastCandidates[lastCandidates.length - 1].playerId;

  // 4. drinks (winner 0, last 2, others 1), then Happy Hour transform
  for (const r of results) {
    let drinks = r.playerId === winnerId ? 0 : r.playerId === lastPlaceId ? 2 : 1;
    for (const c of activeChaos) if (c.drinkModifier) drinks = c.drinkModifier(drinks);
    r.drinks = drinks;
  }

  // 4b. per-player affliction drink modifiers (doubledDrinks, heroChallenge)
  for (const r of results) {
    const afl = (state.activeAfflictions ?? []).filter((a) => a.playerId === r.playerId);
    if (afl.some((a) => a.type === "doubledDrinks")) r.drinks *= 2;
    if (afl.some((a) => a.type === "heroChallenge") && r.playerId === lastPlaceId) {
      api.adjustScore(r.playerId, -20);
      r.drinks += 2;
      api.log(`Hero Moment backfired: ${api.playerName(r.playerId)} finished last — -20 Total Score.`);
      api.addEvent({
        type: "info",
        title: "🦸 HERO MOMENT — FAILED",
        lines: [`${api.playerName(r.playerId)} finished last!`, "-20 Total Score and drink 2."],
      });
    }
    if (afl.some((a) => a.type === "doubleOrNothing")) {
      r.drinks *= 2; // all drinks doubled always
      const firstDart = (state.roundThrows[r.playerId] ?? [])[0];
      const doubledPts = firstDart ? firstDart.baseScore * 2 : 0;
      if (r.playerId !== winnerId && doubledPts > 0) {
        api.adjustScore(r.playerId, -doubledPts);
        api.log(`Double or Nothing: ${api.playerName(r.playerId)} didn't finish first — lost ${doubledPts} pts.`);
        api.addEvent({
          type: "info",
          title: "🎲 DOUBLE OR NOTHING — NOTHING",
          lines: [`${api.playerName(r.playerId)} didn't finish first!`, `Lost all ${doubledPts} doubled first dart points. Drinks doubled.`],
        });
      } else if (r.playerId === winnerId) {
        api.addEvent({
          type: "info",
          title: "🎲 DOUBLE OR NOTHING — DOUBLE!",
          lines: [`${api.playerName(r.playerId)} wins! Keeps the +${doubledPts} first dart bonus.`],
        });
      }
    }
  }

  // 5. expire zones (one round only); mines persist on the board until triggered.
  state.placedEffects = state.placedEffects.filter((e) => e.kind !== "zone");

  // 6. clear round modifiers
  state.activeRoundModifiers = [];

  // 7. natural Golden spawn: after round 5, a Golden tile may appear on its
  // own (separate from the Hidden Fortune chaos). Max one active at a time.
  maybeNaturalGolden(state, rng);

  // record result + log
  const wName = api.playerName(winnerId);
  api.log(`Round ${state.round}: ${wName} wins the round.`);
  state.roundResult = { round: state.round, results, winnerId, lastPlaceId };

  // Straight to the reward pick — no separate "continue" confirmation needed,
  // since nothing else is being decided at this transition. The round
  // results (scores/drinks) stay visible via `roundResult`, which isn't
  // cleared until the next round starts, so the reward screen shows them.
  state.reward = buildReward(state, rng);
  state.phase = "reward";
}

// ---- reward flow -----------------------------------------------------------

/** Pick a random eligible def id from a pool, honoring the Nemesis gate. */
function pickEligible<T extends { id: string; requiresNemesis?: boolean }>(
  pool: T[],
  winnerHasNemesis: boolean,
  rng: () => number,
  fallbackId: string
): string {
  const eligible = pool.filter((d) => !d.requiresNemesis || winnerHasNemesis);
  if (eligible.length === 0) return fallbackId;
  return eligible[Math.floor(rng() * eligible.length)].id;
}

export function buildReward(state: GameState, rng: () => number): RewardState {
  const winnerId = state.roundResult!.winnerId;
  // Nemesis cards only become eligible once the winner actually has a Nemesis,
  // which also guarantees a valid target for them.
  const winnerHasNemesis = hasNemesis(state.nemesis, winnerId);
  const offered: CardType[] = ["mine", "zone", "chaos"];
  return {
    winnerId,
    offered,
    mineDefId: pickEligible(allMineDefs(), winnerHasNemesis, rng, "landmine"),
    zoneDefId: pickEligible(rewardZoneDefs(), winnerHasNemesis, rng, "tollZone"),
    chosen: null,
    chosenDefId: null,
    needsPlacement: false,
    needsTarget: false,
    selectedSegment: null,
    selectedTargetId: null,
    chaosDefId: null,
    resolved: false,
    placementKind: null,
    placementsRemaining: 1,
  };
}

/** Winner picks a card. Mine/zone need placement; chaos resolves here. */
export function chooseCard(state: GameState, card: CardType, rng: () => number) {
  const reward = state.reward!;
  reward.chosen = card;

  if (card === "chaos") {
    resolveChaosChoice(state, rng);
    return;
  }
  // mine / zone -> need a segment.
  reward.chosenDefId = card === "mine" ? reward.mineDefId : reward.zoneDefId;
  const zoneDef = card === "zone" ? getZoneDef(reward.chosenDefId) : null;
  reward.placementKind = card;
  reward.placementsRemaining = 1;
  reward.needsPlacement = true;
  // Reward zones target a chosen player; mines hit whoever steps on them.
  reward.needsTarget = card === "zone" && zoneDef?.target === "chosen";
  state.phase = "rewardPlacement";
}

/** Roll a random mine def id eligible for the reward's winner (Nemesis gate honored). */
function pickMineDefForWinner(state: GameState, rng: () => number): string {
  const winnerHasNemesis = state.reward ? hasNemesis(state.nemesis, state.reward.winnerId) : false;
  return pickEligible(allMineDefs(), winnerHasNemesis, rng, "landmine");
}

function pickChaosDef(state: GameState, rng: () => number): string {
  const winnerHasNemesis = state.reward
    ? hasNemesis(state.nemesis, state.reward.winnerId)
    : false;
  const eligible = [
    "tripleFever",
    "happyHour",
    "bullMadness",
    "heavyHand",
    "crownPressure",
    "randomMisfortune",
    HIDDEN_FORTUNE_ID,
    "nemesisStrike",
    "nemesisCurse",
    "nemesisHangover",
    "publicAccusation",
    "taxAudit",
    "snitch",
    "luckyBastard",
    "mainCharacterSyndrome",
    "witchHunt",
    "thunderdome",
    "roundTax",
    "lastPlaceLuck",
    "doubleOrNothing",
    "reverseUno",
    "courtOfPublicOpinion",
    "skillIssue",
    "heroMoment",
    "minefield",
  ]
    .map((id) => getChaosDef(id)!)
    .filter((d) => (d.minRound ?? 0) <= state.round)
    .filter((d) => !d.requiresNemesis || winnerHasNemesis);

  const recent = state.chaosHistory ?? [];
  const pool = eligible.filter((d) => !recent.includes(d.id));
  // If excluding the last 3 leaves nothing (small eligible pool early game), fall back
  // to the full eligible set rather than crashing.
  const finalPool = pool.length > 0 ? pool : eligible;
  return finalPool[Math.floor(rng() * finalPool.length)].id;
}

/** Record a chaos pick so it's excluded from the next draw; keeps only the last 3. */
function recordChaosPick(state: GameState, defId: string) {
  state.chaosHistory = [...(state.chaosHistory ?? []), defId].slice(-3);
}

export function resolveChaosChoice(state: GameState, rng: () => number) {
  const reward = state.reward!;
  const api = makeApi(state, rng);
  const defId = pickChaosDef(state, rng);
  const def = getChaosDef(defId)!;
  reward.chaosDefId = defId;
  recordChaosPick(state, defId);

  if (def.kind === "immediate") {
    def.resolve?.(api, reward.winnerId);
  } else if (def.kind === "roundWide") {
    state.activeRoundModifiers.push({ defId, createdRound: state.round });
    api.log(`Chaos armed for next round: ${def.name}.`);
    api.addEvent({ type: "chaos", title: `🌀 CHAOS — ${def.name}`, lines: [def.description] });
  } else if (def.kind === "spawnGolden") {
    spawnGolden(state, rng);
  } else if (def.kind === "placeMines") {
    const count = def.placementCount ?? 1;
    reward.placementKind = "mine";
    reward.placementsRemaining = count;
    reward.chosenDefId = pickMineDefForWinner(state, rng);
    reward.needsPlacement = true;
    reward.needsTarget = false;
    state.phase = "rewardPlacement";
    api.log(`${api.playerName(reward.winnerId)} rolled ${def.name}: place ${count} hidden mines.`);
    api.addEvent({
      type: "chaos",
      title: `🌀 CHAOS — ${def.name}`,
      lines: [def.description, `Place ${count} hidden mines anywhere on the board.`],
    });
    return; // placement queue owns resolving `reward` now, not this function
  }

  reward.resolved = true;
}

// ---- Public Tiles (app-spawned, code name "wild") --------------------------

/**
 * Public Tiles appear by themselves at the start of EVERY round (1..maxRounds),
 * placed on random open segments. Golden becoming available after round 5
 * does NOT stop them. Two pools, spawned separately so drink tiles are a
 * guaranteed count rather than left to the luck of a shared random draw:
 *   - a flat count of drink tiles (amount is 1/2/3 depending on the Single/
 *     Double/Triple ring it lands on — see pubDrink's onTrigger), at least
 *     PUBLIC_DRINK_MIN_SINGLE of which are forced onto Single segments
 *   - a random-range count of the other bonus/hazard tiles
 * Up to PUBLIC_DRINK_TILES + PUBLIC_OTHER_TILES_MAX (10) tiles per round.
 */
export const PUBLIC_DRINK_TILES = 5;
export const PUBLIC_DRINK_MIN_SINGLE = 3; // of the drink tiles, at least this many land on a Single
export const PUBLIC_OTHER_TILES_MIN = 3;
export const PUBLIC_OTHER_TILES_MAX = 5;

export function spawnWildTiles(state: GameState, rng: () => number) {
  // Open segments = placeable segments not already hosting an effect or golden.
  const taken = new Set<string>(state.placedEffects.map((e) => e.segment));
  if (state.goldenTile) taken.add(state.goldenTile.segment);
  const open = allPlaceableSegments().filter((s) => !taken.has(s));

  /** Pop a random open segment matching `predicate` (default: any), removing it from `open`. */
  const takeSegment = (predicate: (s: string) => boolean = () => true): string | null => {
    const candidates = open.filter(predicate);
    if (candidates.length === 0) return null;
    const segment = candidates[Math.floor(rng() * candidates.length)];
    open.splice(open.indexOf(segment), 1);
    return segment;
  };

  const placeAt = (segment: string, def: ReturnType<typeof wildZoneDefs>[number]) => {
    state.placedEffects.push({
      id: uid("pub"),
      kind: "zone",
      defId: def.id,
      segment,
      creatorId: null, // app-spawned
      targetId: null,
      createdRound: state.round,
      triggered: false,
    });
    state.log.push({ id: uid("log"), round: state.round, text: `Public Tile: ${def.name} on ${segment}.` });
  };

  const place = (def: ReturnType<typeof wildZoneDefs>[number]) => {
    const segment = takeSegment();
    if (segment) placeAt(segment, def);
  };

  const drinkPool = wildDrinkZoneDefs();
  let drinkCount = 0;
  if (drinkPool.length > 0) {
    const totalDrink = Math.min(open.length, PUBLIC_DRINK_TILES);
    const minSingle = Math.min(PUBLIC_DRINK_MIN_SINGLE, totalDrink);
    for (let i = 0; i < minSingle; i++) {
      const segment = takeSegment((s) => s.startsWith("S"));
      if (!segment) break; // ran out of open Singles — shouldn't happen in practice
      placeAt(segment, drinkPool[Math.floor(rng() * drinkPool.length)]);
      drinkCount++;
    }
    for (let i = drinkCount; i < totalDrink; i++) {
      const segment = takeSegment();
      if (!segment) break;
      placeAt(segment, drinkPool[Math.floor(rng() * drinkPool.length)]);
      drinkCount++;
    }
  }

  const otherPool = wildOtherZoneDefs();
  let otherCount = 0;
  if (otherPool.length > 0) {
    const span = PUBLIC_OTHER_TILES_MAX - PUBLIC_OTHER_TILES_MIN + 1;
    otherCount = Math.min(open.length, PUBLIC_OTHER_TILES_MIN + Math.floor(rng() * span));
    for (let i = 0; i < otherCount; i++) place(otherPool[Math.floor(rng() * otherPool.length)]);
  }

  const total = drinkCount + otherCount;
  if (total > 0) {
    pushEvent(state, {
      type: "info",
      title: "✨ PUBLIC TILES",
      lines: [
        `${total} Public Tiles appeared on the board this round (${drinkCount} drink tiles).`,
        "Check the board before you throw.",
      ],
    });
  }
}

/** Spawn one Nemesis tile on a random open segment. Only fires when any Nemesis exists. */
export function spawnNemesisTile(state: GameState, rng: () => number) {
  const pool = nemesisTileDefs();
  if (pool.length === 0 || !anyNemesisExists(state.nemesis)) return;

  const taken = new Set<string>(state.placedEffects.map((e) => e.segment));
  if (state.goldenTile) taken.add(state.goldenTile.segment);
  const open = allPlaceableSegments().filter((s) => !taken.has(s));
  if (open.length === 0) return;

  const def = pool[Math.floor(rng() * pool.length)];
  const segment = open[Math.floor(rng() * open.length)];
  state.placedEffects.push({
    id: uid("nem"),
    kind: "zone",
    defId: def.id,
    segment,
    creatorId: null,
    targetId: null,
    createdRound: state.round,
    triggered: false,
  });
  pushEvent(state, {
    type: "nemesis",
    title: "☠️ NEMESIS TILE",
    lines: ["A Nemesis tile appeared on the board.", "Land on it and your Nemesis pays the price."],
  });
}

/** Place a Golden tile on Bull or a random Triple. Caller guarantees eligibility. */
function placeGolden(state: GameState, rng: () => number): string {
  const pool = allGoldenDefs();
  const def = pool[Math.floor(rng() * pool.length)];
  const segment = rng() < 0.5 ? "IB" : `T${1 + Math.floor(rng() * 20)}`;
  state.goldenTile = {
    id: uid("golden"),
    kind: "golden",
    defId: def.id,
    segment,
    creatorId: null,
    targetId: null,
    createdRound: state.round,
    triggered: false,
  };
  return segment;
}

/** Hidden Fortune chaos: drop a golden tile (round >= 5, max one active). */
export function spawnGolden(state: GameState, rng: () => number) {
  const api = makeApi(state, rng);
  if (state.round < GOLDEN_MIN_ROUND) {
    api.log("Hidden Fortune fizzled — too early for Golden.");
    api.addEvent({ type: "chaos", title: "🌀 CHAOS — Hidden Fortune", lines: ["Too early. Golden cannot appear yet."] });
    return;
  }
  if (state.goldenTile) {
    api.log("Hidden Fortune fizzled — a Golden tile is already active.");
    api.addEvent({ type: "chaos", title: "🌀 CHAOS — Hidden Fortune", lines: ["A Golden tile is already in play. Nothing happens."] });
    return;
  }
  const segment = placeGolden(state, rng);
  api.log(`Hidden Fortune: a Golden tile appears on ${segment} (hidden effect).`);
  api.addEvent({
    type: "chaos",
    title: "🌀 CHAOS — Hidden Fortune",
    lines: ["A Golden tile ⭐ ? has appeared on the board.", "Hit it to reveal its effect."],
  });
}

/** Natural Golden spawn rolled at round end (after round 5, if none active). */
function maybeNaturalGolden(state: GameState, rng: () => number) {
  if (state.round < GOLDEN_MIN_ROUND) return;
  if (state.goldenTile) return; // max one active
  if (rng() >= NATURAL_GOLDEN_CHANCE) return;
  const api = makeApi(state, rng);
  const segment = placeGolden(state, rng);
  api.log(`A Golden tile appeared on its own on ${segment} (hidden effect).`);
  api.addEvent({
    type: "golden",
    title: "⭐ A GOLDEN TILE APPEARS",
    lines: ["A Golden tile ⭐ ? has appeared on the board.", "Hit it to reveal its effect."],
  });
}

/** Finalize one mine/zone placement. Loops back into rewardPlacement instead of
 * resolving when the card owes more than one placement (e.g. Minefield). */
export function confirmPlacement(state: GameState, rng: () => number) {
  const reward = state.reward!;
  const seg = reward.selectedSegment!;
  const kind = reward.placementKind ?? (reward.chosen === "mine" ? "mine" : "zone");
  const defId = reward.chosenDefId ?? (kind === "mine" ? "landmine" : "curseDrink1");
  const def = kind === "mine" ? getMineDef(defId) : getZoneDef(defId);

  // Reward zones land their effect on the chosen target; mines hit the hitter.
  const targetId = kind === "zone" && (def as { target?: string })?.target === "chosen" ? reward.selectedTargetId : null;

  const effect: PlacedEffect = {
    id: uid("eff"),
    kind,
    defId,
    segment: seg,
    creatorId: reward.winnerId,
    targetId,
    createdRound: state.round,
    triggered: false,
  };
  state.placedEffects.push(effect);
  const label = def?.name ?? kind;
  if (kind !== "mine") {
    state.log.push({
      id: uid("log"),
      round: state.round,
      text: `${state.players.find((p) => p.id === reward.winnerId)?.name} placed ${label} on ${seg}.`,
    });
  }

  reward.placementsRemaining = Math.max(0, (reward.placementsRemaining ?? 1) - 1);
  if (reward.placementsRemaining > 0) {
    reward.selectedSegment = null;
    reward.selectedTargetId = null;
    // Vary flavor across a multi-mine card's placements instead of hiding 3 of the same mine.
    if (kind === "mine") reward.chosenDefId = pickMineDefForWinner(state, rng);
  } else {
    reward.resolved = true;
  }
}

// ---- drink assignment (Give a Drink / Give 2 Drinks public tiles) ---------

/**
 * The giver (whoever hit the tile) picks who drinks — one drink per call, so
 * a "Give 2 Drinks" tile can be split across two different people (1 to X,
 * 1 to Y) or given entirely to one, just by calling this twice. The event
 * stays pending with a decremented `amount` until fully given out, then it's
 * removed. Self-assign is free — no Nemesis credit, since there's no rivalry
 * in giving yourself a drink. Assigning to someone else credits giver->drinker
 * 1 drink + a direct attack, same as the curse zones' pattern, and may
 * unlock a Nemesis.
 *
 * Targets the event by `eventId`, not array position: in online mode, plain
 * informational events are dismissed per-device and no longer shift out of
 * this shared array (see gameStore.ts), so an assign event isn't guaranteed
 * to sit at index 0 — and two could plausibly be pending at once if two
 * different players hit drink tiles before either resolves theirs.
 */
export function assignDrink(state: GameState, eventId: string, drinkerId: string, rng: () => number) {
  const evt = state.pendingEvents.find((e) => e.id === eventId);
  if (!evt?.assign || evt.assign.amount <= 0) return;
  const { giverId } = evt.assign;
  const api = makeApi(state, rng);
  const giverName = api.playerName(giverId);
  const drinkerName = api.playerName(drinkerId);

  if (drinkerId !== giverId) {
    api.creditNemesis(giverId, drinkerId, { drinks: 1, directAttack: true });
  }
  api.log(
    drinkerId === giverId
      ? `${giverName} drinks 1 themselves (Give a Drink tile).`
      : `${giverName} gave ${drinkerName} 1 drink (Give a Drink tile).`
  );

  evt.assign.given = evt.assign.given ?? {};
  evt.assign.given[drinkerId] = (evt.assign.given[drinkerId] ?? 0) + 1;
  evt.assign.amount -= 1;

  // Only pop ONE confirmation, once the whole tile is fully given out — not
  // one per click. Giving all 3 drinks from a Triple to one person should be
  // a single "DRINK ASSIGNED" popup, not three stacked back-to-back.
  if (evt.assign.amount <= 0) {
    const lines = Object.entries(evt.assign.given).map(([id, count]) =>
      id === giverId
        ? `${giverName} drinks ${count} themselves.`
        : `${giverName} gives ${api.playerName(id)} ${count} drink${count > 1 ? "s" : ""}.`
    );
    api.addEvent({ type: "info", title: "🍺 DRINK ASSIGNED", lines });
    state.pendingEvents = state.pendingEvents.filter((e) => e.id !== eventId);
  }
}

// ---- advancing the game ----------------------------------------------------

/**
 * After a reward is resolved, either trigger a Nemesis Showdown, start the next
 * round, or end the game.
 */
export function advanceAfterReward(state: GameState, rng: () => number) {
  // Showdown can interrupt before the next round.
  const pair = pickShowdown(state, rng);
  if (pair) {
    startShowdown(state, pair.aId, pair.bId);
    return;
  }
  startNextRoundOrEnd(state, rng);
}

export function startNextRoundOrEnd(state: GameState, rng: () => number) {
  if (state.round >= state.maxRounds) {
    state.phase = "gameOver";
    state.log.push({ id: uid("log"), round: state.round, text: "Game over." });
    return;
  }
  state.round += 1;
  const startIdx = (state.round - 1) % state.players.length;
  state.currentPlayerIndex = startIdx;
  // afflictions armed last round take effect now; they last exactly one round.
  state.activeAfflictions = state.pendingAfflictions;
  state.pendingAfflictions = [];
  state.currentDarts = freshDarts(state, state.players[startIdx].id);
  state.roundThrows = {};
  state.roundScoreBonus = {};
  state.roundResult = null;
  state.reward = null;
  state.phase = "roundActive";
  spawnWildTiles(state, rng);
  spawnNemesisTile(state, rng);
}

// ---- nemesis showdown ------------------------------------------------------

function startShowdown(state: GameState, aId: string, bId: string) {
  state.showdown = {
    aId,
    bId,
    aDarts: [null, null, null],
    bDarts: [null, null, null],
    stage: "a",
    aScore: null,
    bScore: null,
    winnerId: null,
    loserId: null,
    message: null,
  };
  state.phase = "showdown";
  const a = state.players.find((p) => p.id === aId)?.name;
  const b = state.players.find((p) => p.id === bId)?.name;
  pushEvent(state, {
    type: "showdown",
    title: "⚔️ NEMESIS SHOWDOWN",
    lines: [`${a} vs ${b}`, "Each throws 3 darts. Winner +15, loser -15 and drinks 3."],
  });
}

/** Clear the showdown after its result has been shown. */
export function finishShowdownFix(state: GameState) {
  state.showdown = null;
}

export function resolveShowdown(state: GameState, rng: () => number) {
  const sd = state.showdown!;
  const api = makeApi(state, rng);
  const aScore = (sd.aDarts.map((r) => parseDart(r ?? "MISS")).reduce((s, d) => s + d.baseScore, 0));
  const bScore = (sd.bDarts.map((r) => parseDart(r ?? "MISS")).reduce((s, d) => s + d.baseScore, 0));
  sd.aScore = aScore;
  sd.bScore = bScore;

  // Ties: the challenged player (a) is treated as defending; b wins ties.
  const winnerId = aScore >= bScore ? sd.aId : sd.bId;
  const loserId = winnerId === sd.aId ? sd.bId : sd.aId;
  sd.winnerId = winnerId;
  sd.loserId = loserId;

  api.adjustScore(winnerId, +15);
  api.adjustScore(loserId, -15);
  api.creditNemesis(winnerId, loserId, { drinks: 3, scoreDamage: 15, directAttack: true });

  const wName = api.playerName(winnerId);
  const lName = api.playerName(loserId);
  const egg = showdownMessage(wName, lName);
  sd.message = egg;
  sd.stage = "result";
  state.showdownsCompleted[showdownPairKey(sd.aId, sd.bId)] = true;

  api.log(`Showdown: ${wName} (${winnerId === sd.aId ? aScore : bScore}) beat ${lName}. +15 / -15, drink 3.`);
  const lines = [`${wName} wins! +15 Total Score.`, `${lName}: -15 Total Score and drink 3.`];
  if (egg) lines.push(egg);
  api.addEvent({ type: "showdown", title: "⚔️ SHOWDOWN RESULT", lines });
  if (egg) api.addEvent({ type: "easterEgg", title: "🥚 …", lines: [egg] });
}
