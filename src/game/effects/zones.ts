// ============================================================================
// Zone pool. Two families share the ZoneDef shape:
//
//  • Player reward zones  (target: "chosen") — created by the round winner, who
//    picks a TARGET PLAYER and a segment. ANY hit on that segment makes the
//    target suffer; the creator earns Nemesis credit. Visible, last one round.
//
//  • Public Tiles         (wild: true, target: "hitter") — spawned by the app on
//    random segments at the start of EVERY round. Generic effects; the player
//    who hits the tile is the one affected. Some are one-shot (firstHitOnly).
//
// Add new entries here — the engine and reward/spawn pickers find them by flag.
// ============================================================================

import { segmentMultiplier } from "../darts";
import { registerZones, type ZoneDef } from "./registry";

const ZONES: ZoneDef[] = [
  // ---- Player reward zones (winner chooses the target player) --------------
  {
    id: "curseDrink1",
    name: "Curse: Target drinks 1",
    description: "Visible. Pick a target. Every hit drinks 1 (×2 Double, ×3 Triple).",
    badge: "🍺",
    target: "chosen",
    onTrigger: (api, { effect, victimId }) => {
      const drinks = 1 * segmentMultiplier(effect.segment);
      api.creditNemesis(effect.creatorId, victimId, { drinks, directAttack: true });
      const by = effect.creatorId ? ` (${api.playerName(effect.creatorId)}'s curse)` : "";
      api.addEvent({ type: "info", title: "🍺 CURSE", lines: [`${api.playerName(victimId)} drinks ${drinks}${by}.`] });
      api.log(`Curse on ${effect.segment}: ${api.playerName(victimId)} drinks ${drinks}${by}.`);
    },
  },
  {
    id: "curseDrink2",
    name: "Curse: Target drinks 2",
    description: "Visible. Pick a target. Every hit drinks 2 (×2 Double, ×3 Triple).",
    badge: "🍺2",
    target: "chosen",
    onTrigger: (api, { effect, victimId }) => {
      const drinks = 2 * segmentMultiplier(effect.segment);
      api.creditNemesis(effect.creatorId, victimId, { drinks, directAttack: true });
      const by = effect.creatorId ? ` (${api.playerName(effect.creatorId)}'s curse)` : "";
      api.addEvent({ type: "info", title: "🍺 CURSE", lines: [`${api.playerName(victimId)} drinks ${drinks}${by}.`] });
      api.log(`Curse on ${effect.segment}: ${api.playerName(victimId)} drinks ${drinks}${by}.`);
    },
  },
  {
    id: "curseScore5",
    name: "Curse: Target loses 5",
    description: "Visible. Pick a target. Every hit costs 5 Total Score (×2 Double, ×3 Triple).",
    badge: "-5",
    target: "chosen",
    onTrigger: (api, { effect, victimId }) => {
      const penalty = 5 * segmentMultiplier(effect.segment);
      api.adjustScore(victimId, -penalty);
      api.creditNemesis(effect.creatorId, victimId, { scoreDamage: penalty, directAttack: true });
      const by = effect.creatorId ? ` (${api.playerName(effect.creatorId)}'s curse)` : "";
      api.addEvent({ type: "info", title: "💢 CURSE", lines: [`${api.playerName(victimId)} loses ${penalty} Total Score${by}.`] });
      api.log(`Curse on ${effect.segment}: ${api.playerName(victimId)} -${penalty}${by}.`);
    },
  },

  // ---- Nemesis Tiles — auto-spawned once per round when any Nemesis exists ---
  // When hit, the HITTER's own Nemesis suffers (not a player-placed effect).
  // Scale by segment: S=×1, D=×2, T=×3. One-shot (firstHitOnly) like the
  // bonus tiles below — this is a single retribution event, not a repeatable
  // hazard, so it's consumed on the first hit whether it lands or fizzles.
  {
    id: "nemesisDrain",
    name: "Nemesis Drain",
    description: "Nemesis Tile. Land here and your Nemesis loses 5 pts (×2 Double, ×3 Triple). No Nemesis? Nothing happens.",
    badge: "-5",
    nemesisTile: true,
    firstHitOnly: true,
    onTrigger: (api, { effect, victimId }) => {
      const nemId = api.nemesisOf(victimId);
      if (!nemId) {
        api.addEvent({ type: "nemesis", title: "☠️ NEMESIS DRAIN", lines: [`${api.playerName(victimId)} has no Nemesis. Tile fizzles.`] });
        return;
      }
      const penalty = 5 * segmentMultiplier(effect.segment);
      api.adjustScore(nemId, -penalty);
      api.addEvent({ type: "nemesis", title: "☠️ NEMESIS DRAIN", lines: [`${api.playerName(victimId)} triggered the Nemesis tile!`, `${api.playerName(nemId)} (their Nemesis) loses ${penalty} Total Score.`] });
      api.log(`Nemesis Drain: ${api.playerName(victimId)} hit tile, ${api.playerName(nemId)} -${penalty}.`);
    },
  },
  {
    id: "nemesisHangoverTile",
    name: "Nemesis Hangover",
    description: "Nemesis Tile. Land here and your Nemesis drinks 2 (×2 Double, ×3 Triple). No Nemesis? Nothing happens.",
    badge: "🍺",
    nemesisTile: true,
    firstHitOnly: true,
    onTrigger: (api, { effect, victimId }) => {
      const nemId = api.nemesisOf(victimId);
      if (!nemId) {
        api.addEvent({ type: "nemesis", title: "☠️ NEMESIS HANGOVER", lines: [`${api.playerName(victimId)} has no Nemesis. Tile fizzles.`] });
        return;
      }
      const drinks = 2 * segmentMultiplier(effect.segment);
      api.creditNemesis(null, nemId, { drinks });
      api.addEvent({ type: "nemesis", title: "☠️ NEMESIS HANGOVER", lines: [`${api.playerName(victimId)} triggered the Nemesis tile!`, `${api.playerName(nemId)} (their Nemesis) drinks ${drinks}.`] });
      api.log(`Nemesis Hangover: ${api.playerName(victimId)} hit tile, ${api.playerName(nemId)} drinks ${drinks}.`);
    },
  },
  {
    id: "nemesisStealTile",
    name: "Nemesis Steal",
    description: "Nemesis Tile. Land here and steal 5 pts from your Nemesis (×2 Double, ×3 Triple). No Nemesis? Nothing happens.",
    badge: "+5",
    nemesisTile: true,
    firstHitOnly: true,
    onTrigger: (api, { effect, victimId }) => {
      const nemId = api.nemesisOf(victimId);
      if (!nemId) {
        api.addEvent({ type: "nemesis", title: "☠️ NEMESIS STEAL", lines: [`${api.playerName(victimId)} has no Nemesis. Tile fizzles.`] });
        return;
      }
      const amount = 5 * segmentMultiplier(effect.segment);
      api.adjustScore(nemId, -amount);
      api.adjustScore(victimId, +amount);
      api.addEvent({ type: "nemesis", title: "☠️ NEMESIS STEAL", lines: [`${api.playerName(victimId)} triggered the Nemesis tile!`, `Stole ${amount} pts from ${api.playerName(nemId)}.`] });
      api.log(`Nemesis Steal: ${api.playerName(victimId)} hit tile, stole ${amount} from ${api.playerName(nemId)}.`);
    },
  },

  // ==========================================================================
  // Public Tiles — app-spawned every round, hit by ANYONE (target: "hitter").
  // ==========================================================================
  {
    id: "pubDrink",
    name: "Give a Drink",
    description:
      "Public Tile. Anyone who hits this segment gets to give out drinks, one at a time, to any player(s) they choose (including themselves) — 1 on a Single, 2 on a Double, always 3 on a Triple.",
    badge: "🍺",
    wild: true,
    drinkTile: true,
    onTrigger: (api, { effect, victimId }) => {
      const amount = segmentMultiplier(effect.segment);
      api.addEvent({
        type: "info",
        title: amount > 1 ? `🍺 GIVE ${amount} DRINKS` : "🍺 GIVE A DRINK",
        lines: [`${api.playerName(victimId)} gets to give ${amount} drink${amount > 1 ? "s" : ""}.`],
        assign: { giverId: victimId, amount },
      });
      api.log(`${api.playerName(victimId)} hit a drink tile on ${effect.segment}: gives ${amount} drink${amount > 1 ? "s" : ""}.`);
    },
  },
  {
    id: "pubRound5",
    name: "+5 Round Score",
    description: "Public Tile. The first player to hit this segment gains +5 to this round's score.",
    badge: "+5R",
    wild: true,
    firstHitOnly: true,
    onTrigger: (api, { victimId }) => {
      api.addRoundScore(victimId, 5);
      api.addEvent({ type: "info", title: "✨ PUBLIC TILE", lines: [`${api.playerName(victimId)} gains +5 Round Score.`] });
      api.log(`${api.playerName(victimId)} hit a +5 Round Score tile.`);
    },
  },
  {
    id: "pubTotal5",
    name: "+5 Total Score",
    description: "Public Tile. The first player to hit this segment gains +5 Total Score.",
    badge: "+5T",
    wild: true,
    firstHitOnly: true,
    onTrigger: (api, { victimId }) => {
      api.adjustScore(victimId, +5);
      api.addEvent({ type: "info", title: "✨ PUBLIC TILE", lines: [`${api.playerName(victimId)} gains +5 Total Score.`] });
      api.log(`${api.playerName(victimId)} hit a +5 Total Score tile.`);
    },
  },
  {
    id: "pubBullBonus",
    name: "Bull Bonus",
    description: "Public Tile. The first player to hit this segment gains +10 Total Score.",
    badge: "+10",
    wild: true,
    firstHitOnly: true,
    onTrigger: (api, { victimId }) => {
      api.adjustScore(victimId, +10);
      api.addEvent({ type: "golden", title: "🎯 BULL BONUS", lines: [`${api.playerName(victimId)} gains +10 Total Score!`] });
      api.log(`${api.playerName(victimId)} hit a Bull Bonus tile: +10.`);
    },
  },
  {
    id: "pubHazard3",
    name: "Sinkhole",
    description: "Public Tile. Anyone who hits this segment loses 3 Total Score (whole round).",
    badge: "-3",
    wild: true,
    onTrigger: (api, { victimId }) => {
      api.adjustScore(victimId, -3);
      api.log(`${api.playerName(victimId)} hit a Sinkhole tile: -3.`);
    },
  },
];

registerZones(ZONES);
export default ZONES;
