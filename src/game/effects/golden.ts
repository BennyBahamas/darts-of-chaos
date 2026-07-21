// ============================================================================
// Golden tile effects. Golden is NOT a reward card — it only enters play via
// the Chaos "Hidden Fortune" effect. MVP ships one golden effect: Crown Heist.
// ============================================================================

import { registerGolden, type GoldenDef } from "./registry";

const GOLDEN: GoldenDef[] = [
  {
    id: "crownHeist",
    name: "Crown Heist",
    description:
      "If the trigger is not in first place, swap Total Score with the leader. If already first, take 5 from everyone else.",
    onTrigger: (api, { victimId }) => {
      const players = api.state.players;
      const leaderId = api.leaderId();
      const me = players.find((p) => p.id === victimId);
      if (!me) return;

      const lines: string[] = [];

      if (leaderId && leaderId !== victimId) {
        // Not first: swap totals with the current leader.
        const leader = players.find((p) => p.id === leaderId)!;
        const mine = me.totalScore;
        const theirs = leader.totalScore;
        me.totalScore = theirs;
        leader.totalScore = mine;
        api.creditNemesis(victimId, leaderId, {
          scoreDamage: Math.max(0, theirs - mine),
          directAttack: true,
        });
        lines.push(
          `${api.playerName(victimId)} swapped Total Score with the leader ${api.playerName(leaderId)}!`,
          `${api.playerName(victimId)}: ${mine} → ${theirs}.`,
          `${api.playerName(leaderId)}: ${theirs} → ${mine}.`
        );
        api.log(`Crown Heist: ${api.playerName(victimId)} swapped totals with ${api.playerName(leaderId)}.`);
      } else {
        // Already first: take 5 from everyone else.
        const STEAL = 5;
        let gained = 0;
        for (const p of players) {
          if (p.id === victimId) continue;
          p.totalScore -= STEAL;
          gained += STEAL;
          api.creditNemesis(victimId, p.id, { scoreDamage: STEAL, directAttack: true });
        }
        me.totalScore += gained;
        lines.push(
          `${api.playerName(victimId)} was already on the throne!`,
          `Took ${STEAL} Total Score from every other player (+${gained}).`
        );
        api.log(`Crown Heist: ${api.playerName(victimId)} taxed everyone for ${STEAL}.`);
      }

      api.addEvent({
        type: "golden",
        title: "⭐ GOLDEN REVEALED ⭐",
        lines: ["Crown Heist", ...lines],
      });
    },
  },
  {
    id: "revolution",
    name: "Revolution",
    description: "First place and last place swap Total Scores.",
    onTrigger: (api, { victimId }) => {
      const players = api.state.players;
      const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!first || !last || first.id === last.id) return;
      const firstScore = first.totalScore;
      const lastScore = last.totalScore;
      first.totalScore = lastScore;
      last.totalScore = firstScore;
      api.log(`Revolution: ${api.playerName(first.id)} and ${api.playerName(last.id)} swapped Total Scores.`);
      api.addEvent({
        type: "golden",
        title: "⭐ GOLDEN REVEALED ⭐",
        lines: [
          "Revolution!",
          `${api.playerName(first.id)} (was ${firstScore}) ↔ ${api.playerName(last.id)} (was ${lastScore})`,
          "First and last place swap Total Scores.",
        ],
      });
    },
  },
  {
    id: "bloodCrown",
    name: "Blood Crown",
    description: "If you have a Nemesis: they drink 5 and lose 15 Total Score. Otherwise: gain 15 Total Score.",
    onTrigger: (api, { victimId }) => {
      const nemId = api.nemesisOf(victimId);
      if (nemId) {
        api.adjustScore(nemId, -15);
        api.creditNemesis(victimId, nemId, { drinks: 5, scoreDamage: 15, directAttack: true });
        api.log(`Blood Crown: ${api.playerName(victimId)}'s nemesis ${api.playerName(nemId)} drinks 5 and loses 15.`);
        api.addEvent({
          type: "golden",
          title: "⭐ GOLDEN REVEALED ⭐",
          lines: [
            "Blood Crown!",
            `${api.playerName(victimId)}'s Nemesis ${api.playerName(nemId)} drinks 5 and loses 15 Total Score.`,
          ],
        });
      } else {
        api.adjustScore(victimId, 15);
        api.log(`Blood Crown: ${api.playerName(victimId)} has no Nemesis — gains 15 Total Score.`);
        api.addEvent({
          type: "golden",
          title: "⭐ GOLDEN REVEALED ⭐",
          lines: [
            "Blood Crown!",
            `${api.playerName(victimId)} has no Nemesis — gains 15 Total Score instead.`,
          ],
        });
      }
    },
  },
  {
    id: "kingsTax",
    name: "King's Tax",
    description: "Every other player drinks 2 and loses 5 Total Score. You gain 10 Total Score.",
    onTrigger: (api, { victimId }) => {
      const players = api.state.players;
      for (const p of players) {
        if (p.id === victimId) continue;
        p.totalScore -= 5;
        api.creditNemesis(victimId, p.id, { drinks: 2, scoreDamage: 5, directAttack: true });
      }
      api.adjustScore(victimId, 10);
      api.log(`King's Tax: ${api.playerName(victimId)} taxed everyone. +10 Total Score.`);
      api.addEvent({
        type: "golden",
        title: "⭐ GOLDEN REVEALED ⭐",
        lines: [
          "King's Tax!",
          "Every other player drinks 2 and loses 5 Total Score.",
          `${api.playerName(victimId)} gains 10 Total Score.`,
        ],
      });
    },
  },
  {
    id: "identityTheft",
    name: "Identity Theft",
    description: "You and a random other player swap Total Scores completely.",
    badge: "???",
    onTrigger: (api) => {
      const players = api.state.players;
      if (players.length < 2) return;
      const idxA = Math.floor(api.rng() * players.length);
      let idxB = Math.floor(api.rng() * (players.length - 1));
      if (idxB >= idxA) idxB++;
      const a = players[idxA];
      const b = players[idxB];
      const scoreA = a.totalScore;
      const scoreB = b.totalScore;
      api.adjustScore(a.id, scoreB - scoreA);
      api.adjustScore(b.id, scoreA - scoreB);
      api.log(`Identity Theft: ${api.playerName(a.id)} (${scoreA}) ↔ ${api.playerName(b.id)} (${scoreB}).`);
      api.addEvent({
        type: "golden",
        title: "⭐ GOLDEN REVEALED ⭐",
        lines: [
          "💀 Identity Theft!",
          `${api.playerName(a.id)} and ${api.playerName(b.id)} swap Total Scores.`,
          `${api.playerName(a.id)}: ${scoreA} → ${scoreB}`,
          `${api.playerName(b.id)}: ${scoreB} → ${scoreA}`,
        ],
      });
    },
  },
];

registerGolden(GOLDEN);
export default GOLDEN;
