import { describe, it, expect } from "vitest";
import "./effects/golden"; // registers golden defs into the registry (needed for Hidden Fortune)
import "./effects/mines"; // registers mine defs into the registry (needed for Minefield placement)
import "./effects/zones"; // registers zone defs into the registry (needed for Public Tile spawn)
import {
  confirmPlacement,
  emptyGameState,
  PUBLIC_DRINK_MIN_SINGLE,
  PUBLIC_DRINK_TILES,
  PUBLIC_OTHER_TILES_MAX,
  PUBLIC_OTHER_TILES_MIN,
  resolveChaosChoice,
  spawnWildTiles,
} from "./engine";
import { getChaosDef } from "./effects/registry";
import type { GameState } from "./types";

function stateReadyForChaos(): GameState {
  const state = emptyGameState();
  state.round = 6; // past GOLDEN_MIN_ROUND so the full pool is eligible
  state.players = [
    { id: "alice", name: "Alice", totalScore: 0 },
    { id: "bob", name: "Bob", totalScore: 0 },
  ];
  state.reward = {
    winnerId: "alice",
    offered: ["mine", "zone", "chaos"],
    mineDefId: "",
    zoneDefId: "",
    chosen: "chaos",
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
  return state;
}

describe("chaos pick no-repeat rule", () => {
  it("never repeats a chaos card from the last 3 picks", () => {
    const state = stateReadyForChaos();
    const picks: string[] = [];
    for (let i = 0; i < 30; i++) {
      state.reward!.resolved = false;
      state.reward!.chaosDefId = null;
      resolveChaosChoice(state, Math.random);
      const defId = state.reward!.chaosDefId!;
      const lastThree = picks.slice(-3);
      expect(lastThree).not.toContain(defId);
      picks.push(defId);
    }
  });

  it("caps chaosHistory at the last 3 picks", () => {
    const state = stateReadyForChaos();
    for (let i = 0; i < 5; i++) {
      state.reward!.resolved = false;
      state.reward!.chaosDefId = null;
      resolveChaosChoice(state, Math.random);
    }
    expect(state.chaosHistory.length).toBe(3);
  });
});

describe("Minefield chaos card", () => {
  it("is registered with kind placeMines and 3 placements", () => {
    const def = getChaosDef("minefield");
    expect(def?.kind).toBe("placeMines");
    expect(def?.placementCount).toBe(3);
  });

  it("confirmPlacement loops through all 3 mines before resolving", () => {
    const state = stateReadyForChaos();
    const reward = state.reward!;
    reward.chosen = "chaos";
    reward.chaosDefId = "minefield";
    reward.placementKind = "mine";
    reward.placementsRemaining = 3;
    reward.chosenDefId = "landmine";
    reward.needsPlacement = true;

    reward.selectedSegment = "T1";
    confirmPlacement(state, Math.random);
    expect(reward.resolved).toBe(false);
    expect(reward.placementsRemaining).toBe(2);
    expect(state.placedEffects).toHaveLength(1);
    expect(reward.selectedSegment).toBeNull(); // cleared to force a fresh pick next placement

    reward.selectedSegment = "T2";
    confirmPlacement(state, Math.random);
    expect(reward.resolved).toBe(false);
    expect(reward.placementsRemaining).toBe(1);
    expect(state.placedEffects).toHaveLength(2);

    reward.selectedSegment = "T3";
    confirmPlacement(state, Math.random);
    expect(reward.resolved).toBe(true);
    expect(reward.placementsRemaining).toBe(0);
    expect(state.placedEffects).toHaveLength(3);
    expect(state.placedEffects.every((e) => e.kind === "mine")).toBe(true);
    expect(state.placedEffects.map((e) => e.segment)).toEqual(["T1", "T2", "T3"]);
  });
});

describe("Public Tile spawn", () => {
  it("guarantees exactly PUBLIC_DRINK_TILES drink tiles, plus a random-range of other tiles", () => {
    const state = emptyGameState();
    state.players = [
      { id: "alice", name: "Alice", totalScore: 0 },
      { id: "bob", name: "Bob", totalScore: 0 },
    ];
    spawnWildTiles(state, Math.random);

    const drinkTiles = state.placedEffects.filter((e) => e.defId === "pubDrink");
    const otherTiles = state.placedEffects.filter((e) => e.defId !== "pubDrink");

    expect(drinkTiles).toHaveLength(PUBLIC_DRINK_TILES);
    expect(otherTiles.length).toBeGreaterThanOrEqual(PUBLIC_OTHER_TILES_MIN);
    expect(otherTiles.length).toBeLessThanOrEqual(PUBLIC_OTHER_TILES_MAX);

    // No two tiles share a segment.
    const segments = state.placedEffects.map((e) => e.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("puts at least PUBLIC_DRINK_MIN_SINGLE of the drink tiles on a Single segment", () => {
    const state = emptyGameState();
    state.players = [
      { id: "alice", name: "Alice", totalScore: 0 },
      { id: "bob", name: "Bob", totalScore: 0 },
    ];
    spawnWildTiles(state, Math.random);

    const drinkTiles = state.placedEffects.filter((e) => e.defId === "pubDrink");
    const onSingle = drinkTiles.filter((e) => e.segment.startsWith("S"));
    expect(onSingle.length).toBeGreaterThanOrEqual(PUBLIC_DRINK_MIN_SINGLE);
  });
});
