// ============================================================================
// Shared action dispatch. Each named action's state-transition orchestration
// (which engine functions to call, in what order, with what guards) lives
// here exactly once, so the local Zustand store (src/store/gameStore.ts) and
// the multiplayer room server (party/server.ts) run identical logic — this
// module is the "network layer transports state, it does not reimplement
// rules" guardrail made concrete. It never touches React or the network.
//
// Assumes `state.players` is already populated before "startGame" runs:
// local mode populates it via addPlayer, online mode via the room server
// building it from the lobby. Everything after that point is shared.
// ============================================================================

import {
  advanceAfterReward,
  applyTurn,
  assignDrink as engineAssignDrink,
  chooseCard as engineChooseCard,
  confirmPlacement as engineConfirmPlacement,
  finishShowdownFix,
  freshDarts,
  resolveRound,
  resolveShowdown as engineResolveShowdown,
  spawnWildTiles,
  startNextRoundOrEnd,
} from "./engine";
import type { CardType, GameState, SegmentKey } from "./types";

export type ActionName =
  | "startGame"
  | "submitTurn"
  | "chooseCard"
  | "setRewardSegment"
  | "setRewardTarget"
  | "confirmPlacement"
  | "finishReward"
  | "setShowdownDart"
  | "advanceShowdownThrower"
  | "resolveShowdown"
  | "finishShowdown"
  | "dismissEvent"
  | "assignDrink";

export interface ActionPayloads {
  startGame: { maxRounds?: number } | undefined;
  submitTurn: { darts: (string | null)[] };
  chooseCard: { card: CardType };
  setRewardSegment: { segment: SegmentKey };
  setRewardTarget: { targetId: string | null };
  confirmPlacement: undefined;
  finishReward: undefined;
  setShowdownDart: { who: "a" | "b"; index: number; raw: string | null };
  advanceShowdownThrower: undefined;
  resolveShowdown: undefined;
  finishShowdown: undefined;
  assignDrink: { eventId: string; drinkerId: string };
  dismissEvent: undefined;
}

let idc = 0;
const uid = () => `act_${Date.now().toString(36)}_${(idc++).toString(36)}`;

/** Run one named action's state transition against a GameState draft. */
export function applyAction(state: GameState, action: ActionName, payload: unknown, rng: () => number): void {
  switch (action) {
    case "startGame": {
      const p = payload as ActionPayloads["startGame"];
      if (state.phase !== "setup") return; // idempotency guard: ignore a double-fired start
      if (state.players.length < 2) return;
      if (p?.maxRounds) state.maxRounds = Math.max(1, p.maxRounds);
      state.phase = "roundActive";
      state.round = 1;
      state.currentPlayerIndex = 0;
      state.currentDarts = freshDarts(state, state.players[0].id);
      state.roundThrows = {};
      state.log.push({ id: uid(), round: 1, text: "Game started." });
      spawnWildTiles(state, rng);
      return;
    }
    case "submitTurn": {
      const { darts } = payload as ActionPayloads["submitTurn"];
      if (state.phase !== "roundActive") return;
      const player = state.players[state.currentPlayerIndex];
      if (!player) return;
      applyTurn(state, player.id, darts, rng);
      if (Object.keys(state.roundThrows).length >= state.players.length) {
        resolveRound(state, rng);
      } else {
        const next = (state.currentPlayerIndex + 1) % state.players.length;
        state.currentPlayerIndex = next;
        state.currentDarts = freshDarts(state, state.players[next].id);
      }
      return;
    }
    case "chooseCard": {
      const { card } = payload as ActionPayloads["chooseCard"];
      if (!state.reward || state.reward.chosen) return;
      engineChooseCard(state, card, rng);
      return;
    }
    case "setRewardSegment": {
      const { segment } = payload as ActionPayloads["setRewardSegment"];
      if (state.reward) state.reward.selectedSegment = segment;
      return;
    }
    case "setRewardTarget": {
      const { targetId } = payload as ActionPayloads["setRewardTarget"];
      if (state.reward) state.reward.selectedTargetId = targetId;
      return;
    }
    case "confirmPlacement": {
      if (!state.reward || !state.reward.selectedSegment) return;
      if (state.reward.needsTarget && !state.reward.selectedTargetId) return;
      engineConfirmPlacement(state);
      state.phase = "reward";
      return;
    }
    case "finishReward": {
      if (state.reward?.resolved) advanceAfterReward(state, rng);
      return;
    }
    case "setShowdownDart": {
      const { who, index, raw } = payload as ActionPayloads["setShowdownDart"];
      if (!state.showdown) return;
      if (who === "a") state.showdown.aDarts[index] = raw;
      else state.showdown.bDarts[index] = raw;
      return;
    }
    case "advanceShowdownThrower": {
      if (state.showdown && state.showdown.stage === "a") state.showdown.stage = "b";
      return;
    }
    case "resolveShowdown": {
      if (state.showdown && state.showdown.stage === "b") engineResolveShowdown(state, rng);
      return;
    }
    case "finishShowdown": {
      if (!state.showdown) return; // idempotency guard: ignore a double-fired continue
      finishShowdownFix(state);
      startNextRoundOrEnd(state, rng);
      return;
    }
    case "dismissEvent": {
      state.pendingEvents.shift();
      return;
    }
    case "assignDrink": {
      const { eventId, drinkerId } = payload as ActionPayloads["assignDrink"];
      engineAssignDrink(state, eventId, drinkerId, rng);
      return;
    }
  }
}
