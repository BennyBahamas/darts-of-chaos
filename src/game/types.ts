// ============================================================================
// 1. TYPE DEFINITIONS
// Darts of Chaos — all shared types live here. No game logic in this file.
// ============================================================================

// ---- Darts ----------------------------------------------------------------

/** Zone of a dart. S=single, D=double, T=triple, OB=outer bull(25), IB=inner bull(50), MISS=0 */
export type DartZone = "S" | "D" | "T" | "OB" | "IB" | "MISS";

export interface Dart {
  raw: string; // e.g. "S17", "D20", "T18", "OB", "IB", "MISS"
  zone: DartZone;
  number: number | null; // 1..20 for S/D/T, null otherwise
  baseScore: number; // points before any modifiers
}

/**
 * A board location that can host an effect.
 * Canonical forms: "S17", "D20", "T18", "OB", "IB". MISS can never host effects.
 */
export type SegmentKey = string;

// ---- Players --------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  totalScore: number;
}

// ---- Afflictions (one-round, per-player handicaps from mines) --------------

export type AfflictionType =
  | "reducedDarts"    // throw one fewer dart this round
  | "offhand"         // must throw with the off (wrong) hand this round — honor system
  | "doubledDrinks"    // all round-end drinks are ×2 this round
  | "heroChallenge"   // gained +20 last reward phase; finishing last this round costs -20 and +2 drinks
  | "doubleOrNothing"; // round score counts double next round; finishing last also doubles drinks

export interface Affliction {
  id: string;
  playerId: string;
  type: AfflictionType;
  label: string; // shown to the operator, e.g. "−1 dart"
  icon: string; // e.g. "🎯", "🤚"
}

// ---- Effects (data-driven; definitions live in the registry) --------------

export type PlacedKind = "mine" | "zone" | "golden";

export interface PlacedEffect {
  id: string;
  kind: PlacedKind;
  defId: string; // references a definition in the effect registry
  segment: SegmentKey;
  creatorId: string | null; // null for app-spawned (golden)
  targetId: string | null; // optional intended victim
  createdRound: number; // round in which it became active
  triggered: boolean;
}

/** Round-wide chaos effect currently in force for the active round. */
export interface RoundModifier {
  defId: string; // references a ChaosDef in the chaos pool
  createdRound: number;
}

// ---- Reward flow ----------------------------------------------------------

export type CardType = "mine" | "zone" | "chaos";

export interface RewardState {
  winnerId: string;
  offered: CardType[]; // always [mine, zone, chaos] in MVP
  /**
   * The concrete card definition rolled for each placeable category. These are
   * decided up front (so the winner sees the actual card, e.g. "Nemesis Mine"),
   * and may be a Nemesis variant only when the winner already has a Nemesis.
   */
  mineDefId: string;
  zoneDefId: string;
  chosen: CardType | null;
  chosenDefId: string | null; // concrete def id once a mine/zone is chosen
  needsPlacement: boolean; // mine / zone require a segment
  needsTarget: boolean; // optional manual target selection (off for nemesis cards)
  selectedSegment: SegmentKey | null;
  selectedTargetId: string | null;
  chaosDefId: string | null; // randomly chosen chaos effect id
  resolved: boolean;
}

// ---- Round results --------------------------------------------------------

export interface PlayerRoundResult {
  playerId: string;
  roundScore: number;
  drinks: number;
}

export interface RoundResult {
  round: number;
  results: PlayerRoundResult[];
  winnerId: string;
  lastPlaceId: string;
}

// ---- Nemesis --------------------------------------------------------------

export interface PairStat {
  drinks: number; // drinks this attacker inflicted on this victim
  scoreDamage: number; // total score this attacker took from this victim
  directAttacks: number; // count of distinct attack events
}

/** key = `${attackerId}->${victimId}` */
export type NemesisStats = Record<string, PairStat>;

// ---- Nemesis Showdown ------------------------------------------------------

export interface ShowdownState {
  aId: string;
  bId: string;
  aDarts: (string | null)[];
  bDarts: (string | null)[];
  stage: "a" | "b" | "result";
  aScore: number | null;
  bScore: number | null;
  winnerId: string | null;
  loserId: string | null;
  message: string | null; // easter egg / outcome line
}

// ---- Events (drive the overlay modal) -------------------------------------

export type GameEventType =
  | "mine"
  | "golden"
  | "nemesis"
  | "showdown"
  | "easterEgg"
  | "chaos"
  | "info";

export interface GameEvent {
  id: string;
  type: GameEventType;
  title: string;
  lines: string[];
  /** Present only for "give a drink" tiles — the modal shows a player picker instead of Continue. */
  assign?: { giverId: string; amount: number };
}

// ---- Log ------------------------------------------------------------------

export interface LogEntry {
  id: string;
  round: number;
  text: string;
}

// ---- Game phases (see phases.ts for the canonical state machine) ----------

export type GamePhase =
  | "setup"
  | "roundActive" // operator entering player turns
  | "reward" // winner picking one of three cards — round results (scores/drinks) stay visible via `roundResult` here
  | "rewardPlacement" // winner choosing segment / target
  | "showdown" // nemesis showdown dart entry
  | "gameOver";

// ---- Root game state -------------------------------------------------------

export interface GameState {
  phase: GamePhase;
  round: number; // 1..maxRounds
  maxRounds: number;

  players: Player[]; // index order = turn order
  currentPlayerIndex: number;
  currentDarts: (string | null)[]; // 3 inputs for the player currently throwing

  roundThrows: Record<string, Dart[]>; // playerId -> darts thrown this round
  placedEffects: PlacedEffect[]; // mines + zones currently on the board
  goldenTile: PlacedEffect | null; // at most one active golden tile
  activeRoundModifiers: RoundModifier[]; // chaos round-wide effects for this round

  activeAfflictions: Affliction[]; // per-player handicaps in force this round
  pendingAfflictions: Affliction[]; // armed this round, activated next round
  roundScoreBonus: Record<string, number>; // playerId -> bonus added to this round's score

  roundResult: RoundResult | null;
  reward: RewardState | null;

  nemesis: NemesisStats;
  showdown: ShowdownState | null;
  showdownsCompleted: Record<string, boolean>; // canonical pair key -> true; prevents repeat showdowns

  pendingEvents: GameEvent[]; // FIFO queue rendered by the event modal
  log: LogEntry[];
}
