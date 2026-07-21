"use client";

import { useGame } from "@/store/gameStore";
import { allPlaceableSegments, segmentLabel } from "@/game/darts";
import { getChaosDef, getMineDef, getZoneDef } from "@/game/effects/registry";
import type { CardType } from "@/game/types";

export function RewardScreen() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const myPlayerId = useGame((s) => s.myPlayerId);
  const chooseCard = useGame((s) => s.chooseCard);
  const setRewardSegment = useGame((s) => s.setRewardSegment);
  const setRewardTarget = useGame((s) => s.setRewardTarget);
  const confirmPlacement = useGame((s) => s.confirmPlacement);
  const finishReward = useGame((s) => s.finishReward);

  const reward = game.reward;
  if (!reward) return null;
  const winner = game.players.find((p) => p.id === reward.winnerId);

  const isOnline = mode === "online";
  const isMyReward = !isOnline || myPlayerId === reward.winnerId;

  const mineDef = getMineDef(reward.mineDefId);
  const zoneDef = getZoneDef(reward.zoneDefId);

  // Concrete card descriptors shown to the winner. The Mine / Zone cards may be
  // a Nemesis variant when the winner already has a Nemesis.
  const cards: Record<CardType, { title: string; blurb: string; emoji: string }> = {
    mine: {
      title: mineDef?.name ?? "Mine",
      emoji: "💣",
      blurb: mineDef?.description ?? "Hidden trap on one segment.",
    },
    zone: {
      title: zoneDef?.name ?? "Zone Effect",
      emoji: "🟥",
      blurb: zoneDef?.description ?? "Visible effect on one segment.",
    },
    chaos: { title: "Chaos", emoji: "🌀", blurb: "Random chaos effect chosen by the app. No placement." },
  };

  const placingDef = reward.chosen === "mine" ? mineDef : zoneDef;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">
        🏆 {winner?.name} won round {game.round} — pick a reward
      </h1>

      {game.roundResult && <RoundResultsSummary />}

      {/* Step 1: choose a card */}
      {!reward.chosen && !isMyReward && (
        <p className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
          Waiting for {winner?.name} to pick a reward…
        </p>
      )}
      {!reward.chosen && isMyReward && (
        <div className="grid gap-3 sm:grid-cols-3">
          {reward.offered.map((card) => (
            <button
              key={card}
              className="card text-left transition hover:border-emerald-500 hover:bg-slate-800"
              onClick={() => chooseCard(card)}
            >
              <div className="text-3xl">{cards[card].emoji}</div>
              <div className="mt-1 font-semibold">{cards[card].title}</div>
              <div className="mt-1 text-xs text-slate-400">{cards[card].blurb}</div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: placement for mine/zone */}
      {reward.chosen && (reward.chosen === "mine" || reward.chosen === "zone") && !reward.resolved && (
        <div className="card space-y-3">
          <div className="font-semibold">
            Place your {placingDef?.name ?? (reward.chosen === "mine" ? "Mine" : "Zone")}
          </div>
          <p className="text-xs text-slate-400">{placingDef?.description}</p>

          {!isMyReward ? (
            <p className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
              Waiting for {winner?.name} to place it…
            </p>
          ) : (
            <>
              <div className={reward.needsTarget ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
                <label className="flex flex-col gap-1">
                  <span className="label">Segment</span>
                  <select
                    className="sel"
                    value={reward.selectedSegment ?? ""}
                    onChange={(e) => setRewardSegment(e.target.value)}
                  >
                    <option value="" disabled>
                      Choose a segment…
                    </option>
                    {allPlaceableSegments().map((s) => (
                      <option key={s} value={s}>
                        {segmentLabel(s)} ({s})
                      </option>
                    ))}
                  </select>
                </label>

                {reward.needsTarget && (
                  <label className="flex flex-col gap-1">
                    <span className="label">Target player (required)</span>
                    <select
                      className="sel"
                      value={reward.selectedTargetId ?? ""}
                      onChange={(e) => setRewardTarget(e.target.value || null)}
                    >
                      <option value="" disabled>
                        Choose a target…
                      </option>
                      {game.players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.id === reward.winnerId ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <button
                className="btn-primary"
                onClick={confirmPlacement}
                disabled={!reward.selectedSegment || (reward.needsTarget && !reward.selectedTargetId)}
              >
                Place it
              </button>
            </>
          )}
        </div>
      )}

      {/* Resolved summary */}
      {reward.resolved && (
        <div className="card space-y-3">
          {reward.chosen === "chaos" && reward.chaosDefId && (
            <div>
              <div className="text-sm text-slate-400">The app rolled a Chaos effect:</div>
              <div className="text-lg font-bold text-fuchsia-300">🌀 {getChaosDef(reward.chaosDefId)?.name}</div>
              <div className="text-sm text-slate-300">{getChaosDef(reward.chaosDefId)?.description}</div>
            </div>
          )}
          {(reward.chosen === "mine" || reward.chosen === "zone") && (
            <div className="text-sm text-slate-300">
              {placingDef?.name} placed on <b>{reward.selectedSegment && segmentLabel(reward.selectedSegment)}</b>.
            </div>
          )}
          {isMyReward ? (
            <button className="btn-primary w-full" onClick={finishReward}>
              {game.round >= game.maxRounds ? "Finish game →" : "Next round →"}
            </button>
          ) : (
            <p className="text-center text-sm text-slate-500">Waiting for {winner?.name} to continue…</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Scores/drinks from the round that just ended — stays visible through the whole reward phase. */
function RoundResultsSummary() {
  const game = useGame((s) => s.game);
  const rr = game.roundResult!;
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "??";
  const rows = [...rr.results].sort((a, b) => b.roundScore - a.roundScore);

  return (
    <div className="card space-y-2">
      <div className="label">Round {rr.round} results</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1">Player</th>
            <th className="text-right">Round score</th>
            <th className="text-right">Drinks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-t border-slate-700/60">
              <td className="py-1">
                {name(r.playerId)}{" "}
                {r.playerId === rr.winnerId && <span className="text-emerald-400">🏆 winner</span>}
                {r.playerId === rr.lastPlaceId && r.playerId !== rr.winnerId && (
                  <span className="text-rose-400">🪦 last</span>
                )}
              </td>
              <td className="text-right font-mono">{r.roundScore}</td>
              <td className="text-right">{"🍺".repeat(r.drinks) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
