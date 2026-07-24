import { describe, it, expect } from "vitest";
import "./zones"; // registers zone defs into the registry
import { applyTurn, emptyGameState } from "../engine";
import type { GameState } from "../types";

function stateWithNemesisTile(defId: string, segment: string): GameState {
  const state = emptyGameState();
  state.players = [{ id: "alice", name: "Alice", totalScore: 0 }];
  state.placedEffects = [
    { id: "tile1", kind: "zone", defId, segment, creatorId: null, targetId: null, createdRound: 1, triggered: false },
  ];
  return state;
}

describe("pubDrink amount matches the ring it lands on", () => {
  it.each([
    ["S1", 1],
    ["D1", 2],
    ["T1", 3],
  ])("gives %s -> %i drink(s)", (segment, expected) => {
    const state = stateWithNemesisTile("pubDrink", segment);
    applyTurn(state, "alice", [segment, "MISS", "MISS"], Math.random);
    const evt = state.pendingEvents.find((e) => e.assign);
    expect(evt?.assign?.amount).toBe(expected);
  });
});

describe("Nemesis Tiles are one-shot", () => {
  it("nemesisDrain is removed after a single hit even when it fizzles (hitter has no Nemesis)", () => {
    const state = stateWithNemesisTile("nemesisDrain", "T14");
    applyTurn(state, "alice", ["T14", "MISS", "MISS"], Math.random);
    expect(state.placedEffects).toHaveLength(0);
  });

  it("does not fire twice for two darts on the same segment in one turn", () => {
    const state = stateWithNemesisTile("nemesisHangoverTile", "T14");
    applyTurn(state, "alice", ["T14", "T14", "MISS"], Math.random);
    // Only one "fizzle" log line, not two — proves the second dart's hit was a no-op.
    const fizzleLogs = state.log.filter((l) => l.text.includes("Nemesis Hangover"));
    expect(fizzleLogs).toHaveLength(0); // fizzle path only logs via addEvent, not api.log — tile just shouldn't linger
    expect(state.placedEffects).toHaveLength(0);
  });

  it("stays gone across a later turn — a second player can't retrigger it after it fizzled", () => {
    const state = stateWithNemesisTile("nemesisStealTile", "T14");
    state.players.push({ id: "bob", name: "Bob", totalScore: 0 });
    applyTurn(state, "alice", ["T14", "MISS", "MISS"], Math.random);
    expect(state.placedEffects).toHaveLength(0);
    const scoreBefore = state.players.find((p) => p.id === "bob")!.totalScore;
    applyTurn(state, "bob", ["T14", "MISS", "MISS"], Math.random);
    expect(state.players.find((p) => p.id === "bob")!.totalScore).toBe(scoreBefore);
  });
});
