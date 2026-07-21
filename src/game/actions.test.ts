import { describe, it, expect } from "vitest";
import { applyAction } from "./actions";
import { emptyGameState } from "./engine";
import type { GameState } from "./types";

// Exercises the same `applyAction` call gameStore.ts makes in local mode —
// the room server's online path shares this exact function (verified
// separately over the real WebSocket protocol against a running Wrangler dev
// server), so this covers the local-mode call path specifically.
function stateWithAssignEvent(amount: number): GameState {
  const state = emptyGameState();
  state.players = [
    { id: "alice", name: "Alice", totalScore: 0 },
    { id: "bob", name: "Bob", totalScore: 0 },
    { id: "carol", name: "Carol", totalScore: 0 },
  ];
  state.pendingEvents = [
    {
      id: "evt1",
      type: "info",
      title: "🍺 GIVE A DRINK",
      lines: ["Alice gets to give a drink."],
      assign: { giverId: "alice", amount },
    },
  ];
  return state;
}

describe("assignDrink action", () => {
  it("self-assign is free: no Nemesis pair created, event dismissed, confirmation logged", () => {
    const state = stateWithAssignEvent(1);
    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "alice" }, Math.random);

    expect(state.nemesis).toEqual({});
    expect(state.pendingEvents.some((e) => e.id === "evt1")).toBe(false);
    const confirm = state.pendingEvents.find((e) => e.title === "🍺 DRINK ASSIGNED");
    expect(confirm?.lines[0]).toContain("Alice drinks 1 themselves");
  });

  it("assigning a single drink to another player credits the Nemesis pair and removes the event", () => {
    const state = stateWithAssignEvent(1);
    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "bob" }, Math.random);

    expect(state.pendingEvents.some((e) => e.id === "evt1")).toBe(false);
    const pair = state.nemesis["alice->bob"];
    expect(pair).toBeDefined();
    expect(pair.drinks).toBe(1);
    expect(pair.directAttacks).toBe(1);
    const confirm = state.pendingEvents.find((e) => e.title === "🍺 DRINK ASSIGNED");
    expect(confirm?.lines[0]).toContain("Alice gives Bob 1 drink");
  });

  it("a 2-drink tile resolves one drink per call and stays pending until both are given", () => {
    const state = stateWithAssignEvent(2);
    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "bob" }, Math.random);

    // First drink given — event still pending with 1 left, only 1 drink credited so far.
    const evt = state.pendingEvents.find((e) => e.id === "evt1");
    expect(evt?.assign?.amount).toBe(1);
    expect(state.nemesis["alice->bob"]?.drinks).toBe(1);

    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "bob" }, Math.random);

    // Second drink to the same person — event now fully resolved and removed.
    expect(state.pendingEvents.some((e) => e.id === "evt1")).toBe(false);
    expect(state.nemesis["alice->bob"]?.drinks).toBe(2);
    expect(state.nemesis["alice->bob"]?.directAttacks).toBe(2);
  });

  it("a 2-drink tile can be split across two different people", () => {
    const state = stateWithAssignEvent(2);
    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "bob" }, Math.random);
    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "carol" }, Math.random);

    expect(state.pendingEvents.some((e) => e.id === "evt1")).toBe(false);
    expect(state.nemesis["alice->bob"]?.drinks).toBe(1);
    expect(state.nemesis["alice->carol"]?.drinks).toBe(1);
  });

  it("no-ops if the referenced event isn't a drink-assign event", () => {
    const state = emptyGameState();
    state.players = [{ id: "alice", name: "Alice", totalScore: 0 }];
    state.pendingEvents = [{ id: "evt1", type: "info", title: "Something else", lines: [] }];

    applyAction(state, "assignDrink", { eventId: "evt1", drinkerId: "alice" }, Math.random);

    expect(state.pendingEvents).toHaveLength(1);
  });

  it("targets by eventId, not array position — resolving one assign event leaves an unrelated one untouched", () => {
    // Two players each hit a drink tile before either resolves theirs — a
    // real possibility now that plain events no longer shift out from under
    // an assign event in online mode (dismissal there is per-device/local).
    const state = emptyGameState();
    state.players = [
      { id: "alice", name: "Alice", totalScore: 0 },
      { id: "bob", name: "Bob", totalScore: 0 },
      { id: "carol", name: "Carol", totalScore: 0 },
    ];
    state.pendingEvents = [
      { id: "evtAlice", type: "info", title: "🍺 GIVE A DRINK", lines: [], assign: { giverId: "alice", amount: 1 } },
      { id: "evtBob", type: "info", title: "🍺 GIVE 2 DRINKS", lines: [], assign: { giverId: "bob", amount: 2 } },
    ];

    applyAction(state, "assignDrink", { eventId: "evtBob", drinkerId: "carol" }, Math.random);

    // evtBob still pending (1 of 2 given), evtAlice completely untouched.
    expect(state.pendingEvents.find((e) => e.id === "evtBob")?.assign?.amount).toBe(1);
    expect(state.pendingEvents.some((e) => e.id === "evtAlice")).toBe(true);
    expect(state.nemesis["bob->carol"]?.drinks).toBe(1);
  });
});
