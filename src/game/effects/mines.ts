// ============================================================================
// Mine card pool. Hidden, player-created, one-time trigger.
// Add new mines here — the engine picks them up automatically.
//
// A mine's onTrigger fires the moment the victim hits its segment. Effects that
// punish the *next* round (reduced darts, off-hand) call api.addAffliction,
// which arms a one-round handicap that activates at the start of the next round.
// ============================================================================

import { segmentMultiplier } from "../darts";
import { registerMines, type MineDef } from "./registry";

const MINES: MineDef[] = [
  {
    id: "landmine",
    name: "Landmine",
    description: "Hidden. Loses 10 Total Score and drinks 2 (×2 Double, ×3 Triple).",
    onTrigger: (api, { effect, victimId }) => {
      const mult = segmentMultiplier(effect.segment);
      const SCORE_HIT = 10 * mult;
      const DRINKS = 2 * mult;
      api.adjustScore(victimId, -SCORE_HIT);
      api.creditNemesis(effect.creatorId, victimId, { drinks: DRINKS, scoreDamage: SCORE_HIT, directAttack: true });
      const owner = effect.creatorId ? api.playerName(effect.creatorId) : "the board";
      const multLabel = mult > 1 ? ` ×${mult}` : "";
      api.addEvent({
        type: "mine",
        title: "💣 MINE REVEALED",
        lines: [
          `Owner: ${owner}`,
          `Effect: Landmine${multLabel}`,
          `${api.playerName(victimId)} stepped on it!`,
          `-${SCORE_HIT} Total Score and drink ${DRINKS}.`,
        ],
      });
      api.log(`${api.playerName(victimId)} hit a Landmine on ${effect.segment}: -${SCORE_HIT}, drink ${DRINKS}.`);
    },
  },
  {
    id: "hangoverMine",
    name: "Hangover Mine",
    description: "Hidden. Drinks 2. No score penalty (×2 Double, ×3 Triple).",
    onTrigger: (api, { effect, victimId }) => {
      const mult = segmentMultiplier(effect.segment);
      const DRINKS = 2 * mult;
      api.creditNemesis(effect.creatorId, victimId, { drinks: DRINKS, directAttack: true });
      const owner = effect.creatorId ? api.playerName(effect.creatorId) : "the board";
      const multLabel = mult > 1 ? ` ×${mult}` : "";
      api.addEvent({
        type: "mine",
        title: "💣 MINE REVEALED",
        lines: [
          `Owner: ${owner}`,
          `Effect: Hangover Mine${multLabel}`,
          `${api.playerName(victimId)} stepped on it!`,
          `Drink ${DRINKS}.`,
        ],
      });
      api.log(`${api.playerName(victimId)} hit a Hangover Mine on ${effect.segment}: drink ${DRINKS}.`);
    },
  },
  {
    id: "butterfingersMine",
    name: "Butterfingers Mine",
    description: "Hidden. Throws one fewer dart next round.",
    onTrigger: (api, { effect, victimId }) => {
      api.addAffliction(victimId, { type: "reducedDarts", label: "−1 dart", icon: "🎯" });
      api.creditNemesis(effect.creatorId, victimId, { directAttack: true });
      const owner = effect.creatorId ? api.playerName(effect.creatorId) : "the board";
      api.addEvent({
        type: "mine",
        title: "💣 MINE REVEALED",
        lines: [
          `Owner: ${owner}`,
          "Effect: Butterfingers Mine",
          `${api.playerName(victimId)} stepped on it!`,
          "They throw one fewer dart next round.",
        ],
      });
      api.log(`${api.playerName(victimId)} hit a Butterfingers Mine: -1 dart next round.`);
    },
  },
  {
    id: "offHandMine",
    name: "Wrong-Hand Mine",
    description: "Hidden. Must throw with off hand next round.",
    onTrigger: (api, { effect, victimId }) => {
      api.addAffliction(victimId, { type: "offhand", label: "off-hand only", icon: "🤚" });
      api.creditNemesis(effect.creatorId, victimId, { directAttack: true });
      const owner = effect.creatorId ? api.playerName(effect.creatorId) : "the board";
      api.addEvent({
        type: "mine",
        title: "💣 MINE REVEALED",
        lines: [
          `Owner: ${owner}`,
          "Effect: Wrong-Hand Mine",
          `${api.playerName(victimId)} stepped on it!`,
          "They must throw with their off hand next round.",
        ],
      });
      api.log(`${api.playerName(victimId)} hit a Wrong-Hand Mine: off-hand throws next round.`);
    },
  },
];

registerMines(MINES);
export default MINES;
