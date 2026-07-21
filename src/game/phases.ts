// ============================================================================
// 2. GAME PHASES
// The phase-based state machine. This file documents transitions and provides
// small helpers; the store (gameStore.ts) performs the actual transitions.
// ============================================================================
//
//   setup
//     │  startGame()
//     ▼
//   roundActive ──submitTurn() per player──┐
//     │  (last player submitted)           │ (dart triggers may queue events)
//     ▼                                     │
//   reward  ◀──────────────────────────────── engine resolves the round AND
//     │                                       builds the reward in one step —
//     │                                       no separate confirmation; round
//     │                                       results (scores/drinks) stay
//     │                                       visible via `roundResult` here.
//     │  chooseCard(card)
//     ├── chaos  → resolved immediately → next round / gameOver
//     └── mine|zone → rewardPlacement
//                        │  confirmPlacement()
//                        ▼
//                   next round / gameOver
//
//   showdown  — can interrupt at round end when a rivalry is intense.
//               Resolves, then returns to the normal flow.
//
//   gameOver  — after maxRounds completes.
// ============================================================================

import type { GamePhase } from "./types";

export const PHASES: Record<string, GamePhase> = {
  SETUP: "setup",
  ROUND_ACTIVE: "roundActive",
  REWARD: "reward",
  REWARD_PLACEMENT: "rewardPlacement",
  SHOWDOWN: "showdown",
  GAME_OVER: "gameOver",
};

/** Phases during which the operator is entering darts. */
export function isDartEntryPhase(phase: GamePhase): boolean {
  return phase === "roundActive" || phase === "showdown";
}
