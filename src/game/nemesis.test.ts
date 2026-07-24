import { describe, it, expect } from "vitest";
import { credit, heatOf, nemesisOf, NEMESIS_THRESHOLD } from "./nemesis";
import type { NemesisStats } from "./types";

describe("heat-based Nemesis model", () => {
  it("score-only damage (25 pts = 5 heat) creates a Nemesis at the threshold", () => {
    const stats: NemesisStats = {};
    credit(stats, "attacker", "victim", { scoreDamage: 25 });
    const result = nemesisOf(stats, "victim");
    expect(result).not.toBeNull();
    expect(result?.attackerId).toBe("attacker");
    expect(result?.heat).toBe(NEMESIS_THRESHOLD);
  });

  it("20 pts score damage (4 heat) does not reach the threshold", () => {
    const stats: NemesisStats = {};
    credit(stats, "attacker", "victim", { scoreDamage: 20 });
    expect(nemesisOf(stats, "victim")).toBeNull();
  });

  it("drinks alone: 5 drinks = 5 heat = threshold", () => {
    const stats: NemesisStats = {};
    credit(stats, "attacker", "victim", { drinks: 5 });
    expect(nemesisOf(stats, "victim")).not.toBeNull();
  });

  it("direct attacks alone: 10 attacks × 0.5 = 5 heat = threshold", () => {
    const stats: NemesisStats = {};
    for (let i = 0; i < 10; i++) {
      credit(stats, "attacker", "victim", { directAttack: true });
    }
    expect(nemesisOf(stats, "victim")).not.toBeNull();
  });

  it("heat combines all three components correctly", () => {
    // 1 drink (1) + 15 pts (3) + 1 attack (0.5) = 4.5 — just below threshold
    const stats: NemesisStats = {};
    credit(stats, "attacker", "victim", { drinks: 1, scoreDamage: 15, directAttack: true });
    expect(nemesisOf(stats, "victim")).toBeNull();

    // push over with one more drink → 5.5 heat
    credit(stats, "attacker", "victim", { drinks: 1 });
    expect(nemesisOf(stats, "victim")).not.toBeNull();
  });

  it("heatOf computes correctly", () => {
    expect(heatOf({ drinks: 5, scoreDamage: 0, directAttacks: 0 })).toBe(5);
    expect(heatOf({ drinks: 0, scoreDamage: 25, directAttacks: 0 })).toBe(5);
    expect(heatOf({ drinks: 0, scoreDamage: 0, directAttacks: 10 })).toBe(5);
    // floor(19/5) = 3, not 4
    expect(heatOf({ drinks: 0, scoreDamage: 19, directAttacks: 0 })).toBe(3);
  });

  it("higher-heat attacker wins when two attackers both qualify", () => {
    const stats: NemesisStats = {};
    credit(stats, "low", "victim", { scoreDamage: 40 }); // 8 heat
    credit(stats, "high", "victim", { drinks: 12 }); // 12 heat
    const result = nemesisOf(stats, "victim");
    expect(result?.attackerId).toBe("high");
  });
});
