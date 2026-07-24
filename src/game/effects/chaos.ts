// ============================================================================
// Chaos card pool. The winner picks "Chaos"; the app randomly selects one of
// these. Kinds: immediate (resolve now), roundWide (affect next round),
// spawnGolden (drop a golden tile). Add new chaos effects here.
// ============================================================================

import { isBull } from "../darts";
import { registerChaos, type ChaosDef, type EffectAPI } from "./registry";

export const HIDDEN_FORTUNE_ID = "hiddenFortune";
export const GOLDEN_MIN_ROUND = 5; // golden can only appear after round 5
export const NATURAL_GOLDEN_CHANCE = 0.25; // per eligible round end, if none active

const CHAOS: ChaosDef[] = [
  {
    id: "tripleFever",
    name: "Triple Fever",
    description: "Every Triple hit gains +5 Round Score this round.",
    kind: "roundWide",
    roundScoreBonus: (dart) => (dart.zone === "T" ? 5 : 0),
  },
  {
    id: "happyHour",
    name: "Happy Hour",
    description: "All drink penalties gain +1 this round.",
    kind: "roundWide",
    drinkModifier: (base) => (base > 0 ? base + 1 : base),
  },
  {
    id: "bullMadness",
    name: "Bull Madness",
    description: "Every Bull hit grants +10 Total Score this round.",
    kind: "roundWide",
    totalScoreBonusOnResolve: (darts) => darts.filter(isBull).length * 10,
  },
  {
    id: "heavyHand",
    name: "Heavy Hand",
    description: "Everyone must throw their first dart with their off-hand this round. No cheating.",
    kind: "roundWide",
  },
  {
    id: "crownPressure",
    name: "Crown Pressure",
    description: "Immediately: the current leader loses 5 Total Score.",
    kind: "immediate",
    resolve: (api: EffectAPI, winnerId: string) => {
      const leaderId = api.leaderId();
      if (!leaderId) return;
      api.adjustScore(leaderId, -5);
      api.creditNemesis(winnerId, leaderId, { scoreDamage: 5, directAttack: true });
      api.log(`Crown Pressure: leader ${api.playerName(leaderId)} loses 5 Total Score.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Crown Pressure",
        lines: [`The leader ${api.playerName(leaderId)} loses 5 Total Score.`],
      });
    },
  },
  {
    id: "randomMisfortune",
    name: "Random Misfortune",
    description: "Immediately: a random player loses 10 Total Score.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const victim = players[Math.floor(api.rng() * players.length)];
      api.adjustScore(victim.id, -10);
      api.log(`Random Misfortune: ${api.playerName(victim.id)} loses 10 Total Score.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Random Misfortune",
        lines: [`${api.playerName(victim.id)} loses 10 Total Score.`],
      });
    },
  },
  {
    id: HIDDEN_FORTUNE_ID,
    name: "Hidden Fortune",
    description: "Spawns a Golden tile (only after round 5; max one active).",
    kind: "spawnGolden",
    minRound: GOLDEN_MIN_ROUND,
    // The actual spawn is handled in the engine because it needs board access;
    // see engine.spawnGolden(). This resolve is a no-op marker.
    resolve: () => {},
  },
  // ---- New chaos effects ----------------------------------------------------
  {
    id: "publicAccusation",
    name: "Public Accusation",
    description: "A random player is accused of smelling like a fart and receives a random punishment.",
    kind: "immediate",
    resolve: (api: EffectAPI, winnerId: string) => {
      const others = api.state.players.filter((p) => p.id !== winnerId);
      const pool = api.state.players;
      const victim = (others.length > 0 ? others : pool)[Math.floor(api.rng() * (others.length > 0 ? others.length : pool.length))];
      if (!victim) return;
      const roll = Math.floor(api.rng() * 4);
      let effectLine = "";
      if (roll === 0) {
        api.creditNemesis(winnerId, victim.id, { drinks: 2, directAttack: true });
        effectLine = `${api.playerName(victim.id)} drinks 2.`;
      } else if (roll === 1) {
        api.adjustScore(victim.id, -10);
        api.creditNemesis(winnerId, victim.id, { scoreDamage: 10, directAttack: true });
        effectLine = `${api.playerName(victim.id)} loses 10 Total Score.`;
      } else if (roll === 2) {
        api.addAffliction(victim.id, { type: "reducedDarts", label: "−1 dart", icon: "🎯" });
        api.creditNemesis(winnerId, victim.id, { directAttack: true });
        effectLine = `${api.playerName(victim.id)} throws one fewer dart next round.`;
      } else {
        api.addAffliction(victim.id, { type: "offhand", label: "off-hand only", icon: "🤚" });
        api.creditNemesis(winnerId, victim.id, { directAttack: true });
        effectLine = `${api.playerName(victim.id)} throws off-hand next round.`;
      }
      api.log(`Public Accusation: ${api.playerName(victim.id)} accused. ${effectLine}`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Public Accusation",
        lines: [`${api.playerName(victim.id)} has been accused of smelling like a fart.`, effectLine],
      });
    },
  },
  {
    id: "taxAudit",
    name: "Tax Audit",
    description: "A random player loses 15 Total Score. The IRS has questions.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const victim = players[Math.floor(api.rng() * players.length)];
      api.adjustScore(victim.id, -15);
      api.log(`Tax Audit: ${api.playerName(victim.id)} loses 15 Total Score.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Tax Audit",
        lines: ["The IRS has questions.", `${api.playerName(victim.id)} loses 15 Total Score.`],
      });
    },
  },
  {
    id: "snitch",
    name: "Snitch",
    description: "Random player drinks 2. One hidden mine location is revealed to everyone.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const victim = players[Math.floor(api.rng() * players.length)];
      const mines = api.state.placedEffects.filter((e) => e.kind === "mine" && !e.triggered);
      const lines = [`${api.playerName(victim.id)} drinks 2.`];
      if (mines.length > 0) {
        const mine = mines[Math.floor(api.rng() * mines.length)];
        lines.push(`⚠️ A mine has been revealed on ${mine.segment}!`);
        api.log(`Snitch: mine revealed on ${mine.segment}.`);
      } else {
        lines.push("No hidden mines on the board to reveal.");
      }
      api.log(`Snitch: ${api.playerName(victim.id)} drinks 2.`);
      api.addEvent({ type: "chaos", title: "🌀 CHAOS — Snitch", lines });
    },
  },
  {
    id: "luckyBastard",
    name: "Lucky Bastard",
    description: "Random player gains +15 Total Score or has one negative affliction removed.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const lucky = players[Math.floor(api.rng() * players.length)];
      const negativeAfl = api.state.activeAfflictions.filter((a) => a.playerId === lucky.id);
      const useRemove = negativeAfl.length > 0 && api.rng() < 0.5;
      let effectLine = "";
      if (useRemove) {
        const removed = negativeAfl[Math.floor(api.rng() * negativeAfl.length)];
        api.state.activeAfflictions = api.state.activeAfflictions.filter((a) => a.id !== removed.id);
        effectLine = `${removed.label} affliction removed.`;
        api.log(`Lucky Bastard: ${api.playerName(lucky.id)} had "${removed.label}" removed.`);
      } else {
        api.adjustScore(lucky.id, 15);
        effectLine = "+15 Total Score.";
        api.log(`Lucky Bastard: ${api.playerName(lucky.id)} gains 15 Total Score.`);
      }
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Lucky Bastard",
        lines: [`${api.playerName(lucky.id)} is the Lucky Bastard!`, effectLine],
      });
    },
  },
  {
    id: "mainCharacterSyndrome",
    name: "Main Character Syndrome",
    description: "Random player gains +10 Total Score but their round-end drinks are doubled next round.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const chosen = players[Math.floor(api.rng() * players.length)];
      api.adjustScore(chosen.id, 10);
      api.addAffliction(chosen.id, { type: "doubledDrinks", label: "double drinks", icon: "🍺🍺" });
      api.log(`Main Character Syndrome: ${api.playerName(chosen.id)} +10, drinks doubled next round.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Main Character Syndrome",
        lines: [
          `${api.playerName(chosen.id)} is the Main Character!`,
          "+10 Total Score.",
          "⚠️ Every drink next round is doubled. 🍺🍺",
        ],
      });
    },
  },
  {
    id: "reverseUno",
    name: "Reverse Uno",
    description: "A random player's Nemesis drinks 2 and loses 5. If no Nemesis, another random player suffers instead.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const target = players[Math.floor(api.rng() * players.length)];
      const nemId = api.nemesisOf(target.id);
      let victimId: string;
      let victimLine: string;
      if (nemId) {
        victimId = nemId;
        victimLine = `${api.playerName(nemId)} (${api.playerName(target.id)}'s Nemesis) drinks 2 and loses 5.`;
      } else {
        const others = players.filter((p) => p.id !== target.id);
        const fallback = others.length > 0 ? others[Math.floor(api.rng() * others.length)] : target;
        victimId = fallback.id;
        victimLine = `No Nemesis — ${api.playerName(fallback.id)} suffers instead: drinks 2 and loses 5.`;
      }
      api.adjustScore(victimId, -5);
      api.creditNemesis(target.id, victimId, { drinks: 2, scoreDamage: 5, directAttack: true });
      api.log(`Reverse Uno: ${api.playerName(target.id)} redirected — ${api.playerName(victimId)} drinks 2, -5.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Reverse Uno",
        lines: [`🔄 ${api.playerName(target.id)} says: NOT TODAY!`, victimLine],
      });
    },
  },
  {
    id: "courtOfPublicOpinion",
    name: "Court of Public Opinion",
    description: "Everyone votes for the most suspicious player. Most votes drinks 2.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      api.log("Court of Public Opinion: group votes — most suspicious player drinks 2.");
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Court of Public Opinion",
        lines: [
          "Everyone point at the most suspicious player!",
          "3… 2… 1… POINT!",
          "Most votes drinks 2.",
        ],
      });
    },
  },
  {
    id: "skillIssue",
    name: "Skill Issue",
    description: "Random player throws one fewer dart next round.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const victim = players[Math.floor(api.rng() * players.length)];
      api.addAffliction(victim.id, { type: "reducedDarts", label: "−1 dart", icon: "🎯" });
      api.log(`Skill Issue: ${api.playerName(victim.id)} loses a dart next round.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Skill Issue",
        lines: ["Have you tried being better?", `${api.playerName(victim.id)} throws one fewer dart next round.`],
      });
    },
  },
  {
    id: "heroMoment",
    name: "Hero Moment",
    description: "Random player gains +20 Total Score. If they finish last next round: -20 and drink 2.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const hero = players[Math.floor(api.rng() * players.length)];
      api.adjustScore(hero.id, 20);
      api.addAffliction(hero.id, { type: "heroChallenge", label: "hero challenge", icon: "🦸" });
      api.log(`Hero Moment: ${api.playerName(hero.id)} +20. Must not finish last next round!`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Hero Moment",
        lines: [
          `${api.playerName(hero.id)} is the Hero!`,
          "+20 Total Score.",
          "⚠️ Finish last next round and lose it all: -20 and drink 2.",
        ],
      });
    },
  },

  // ---- New chaos effects ----------------------------------------------------
  {
    id: "witchHunt",
    name: "Witch Hunt",
    description: "Winner points at any player right now. That player drinks 3. No debates.",
    kind: "immediate",
    resolve: (api: EffectAPI, winnerId: string) => {
      api.log(`Witch Hunt: ${api.playerName(winnerId)} points at someone — they drink 3.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Witch Hunt",
        lines: [
          `${api.playerName(winnerId)}, point at someone RIGHT NOW.`,
          "That player drinks 3. No debates.",
        ],
      });
    },
  },
  {
    id: "thunderdome",
    name: "Thunderdome",
    description: "Everyone except the round winner loses 5 Total Score.",
    kind: "immediate",
    resolve: (api: EffectAPI, winnerId: string) => {
      const others = api.state.players.filter((p) => p.id !== winnerId);
      for (const p of others) {
        api.adjustScore(p.id, -5);
        api.creditNemesis(winnerId, p.id, { scoreDamage: 5, directAttack: true });
      }
      api.log(`Thunderdome: everyone except ${api.playerName(winnerId)} loses 5 Total Score.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Thunderdome",
        lines: ["TWO ENTER. ONE LEAVES.", `${api.playerName(winnerId)} wins. Everyone else loses 5 Total Score.`],
      });
    },
  },
  {
    id: "roundTax",
    name: "Round Tax",
    description: "Everyone drinks 1. No exceptions.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      api.log("Round Tax: everyone drinks 1.");
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Round Tax",
        lines: ["The house always wins.", "Everyone drinks 1. No exceptions."],
      });
    },
  },
  {
    id: "lastPlaceLuck",
    name: "Last Place Luck",
    description: "The player currently in last place gains +15 Total Score.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const sorted = [...api.state.players].sort((a, b) => a.totalScore - b.totalScore);
      const last = sorted[0];
      if (!last) return;
      api.adjustScore(last.id, 15);
      api.log(`Last Place Luck: ${api.playerName(last.id)} gains +15 Total Score.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Last Place Luck",
        lines: [`${api.playerName(last.id)} is dead last.`, "Universe says: here's +15 Total Score. Stay in the game."],
      });
    },
  },
  {
    id: "doubleOrNothing",
    name: "Double or Nothing",
    description: "Random player next round: first dart counts double and all drinks are doubled. Don't finish first and lose ALL the doubled first dart points.",
    kind: "immediate",
    resolve: (api: EffectAPI) => {
      const players = api.state.players;
      if (players.length === 0) return;
      const chosen = players[Math.floor(api.rng() * players.length)];
      api.addAffliction(chosen.id, { type: "doubleOrNothing", label: "double or nothing", icon: "🎲" });
      api.log(`Double or Nothing: ${api.playerName(chosen.id)}'s round score is doubled next round.`);
      api.addEvent({
        type: "chaos",
        title: "🌀 CHAOS — Double or Nothing",
        lines: [
          `${api.playerName(chosen.id)} is all in!`,
          "Next round: first dart counts double, all drinks are doubled.",
          "⚠️ Don't finish first and lose ALL the doubled first dart points.",
        ],
      });
    },
  },

  {
    id: "minefield",
    name: "Minefield",
    description: "Place 3 hidden mines anywhere on the board — pick your spots carefully.",
    kind: "placeMines",
    placementCount: 3,
  },

  // ---- Nemesis chaos (only eligible once the winner has a Nemesis) ----------
  {
    id: "nemesisStrike",
    name: "Nemesis Strike",
    description: "☠️ Steal 5 Total Score from your Nemesis.",
    kind: "immediate",
    requiresNemesis: true,
    resolve: (api: EffectAPI, winnerId: string) => {
      const nemId = api.nemesisOf(winnerId);
      if (!nemId) {
        api.log("Nemesis effect fizzled - the player has no Nemesis.");
        return;
      }
      const STEAL = 5;
      api.adjustScore(nemId, -STEAL);
      api.adjustScore(winnerId, +STEAL);
      api.creditNemesis(winnerId, nemId, { scoreDamage: STEAL, directAttack: true });
      api.log(`Nemesis Strike: ${api.playerName(winnerId)} stole ${STEAL} from ${api.playerName(nemId)}.`);
      api.addEvent({
        type: "nemesis",
        title: "☠️ NEMESIS STRIKE",
        lines: [`${api.playerName(winnerId)} stole ${STEAL} Total Score from ${api.playerName(nemId)}.`],
      });
    },
  },
  {
    id: "nemesisCurse",
    name: "Nemesis Curse",
    description: "☠️ Your Nemesis loses 5 Total Score.",
    kind: "immediate",
    requiresNemesis: true,
    resolve: (api: EffectAPI, winnerId: string) => {
      const nemId = api.nemesisOf(winnerId);
      if (!nemId) {
        api.log("Nemesis effect fizzled - the player has no Nemesis.");
        return;
      }
      const HIT = 5;
      api.adjustScore(nemId, -HIT);
      api.creditNemesis(winnerId, nemId, { scoreDamage: HIT, directAttack: true });
      api.log(`Nemesis Curse: ${api.playerName(nemId)} loses ${HIT} Total Score.`);
      api.addEvent({
        type: "nemesis",
        title: "☠️ NEMESIS CURSE",
        lines: [`${api.playerName(nemId)} loses ${HIT} Total Score.`],
      });
    },
  },
  {
    id: "nemesisHangover",
    name: "Nemesis Hangover",
    description: "☠️ Your Nemesis drinks 2.",
    kind: "immediate",
    requiresNemesis: true,
    resolve: (api: EffectAPI, winnerId: string) => {
      const nemId = api.nemesisOf(winnerId);
      if (!nemId) {
        api.log("Nemesis effect fizzled - the player has no Nemesis.");
        return;
      }
      const DRINKS = 2;
      api.creditNemesis(winnerId, nemId, { drinks: DRINKS, directAttack: true });
      api.log(`Nemesis Hangover: ${api.playerName(nemId)} drinks ${DRINKS}.`);
      api.addEvent({
        type: "nemesis",
        title: "☠️ NEMESIS HANGOVER",
        lines: [`${api.playerName(nemId)} drinks ${DRINKS}.`],
      });
    },
  },
];

registerChaos(CHAOS);
export default CHAOS;
