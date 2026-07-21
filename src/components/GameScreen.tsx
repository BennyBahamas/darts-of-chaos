"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { Scoreboard } from "./Scoreboard";
import { BoardSummary, RoundLog } from "./BoardSummary";
import { Dartboard, BoardLegend } from "./Dartboard";
import { ThreeDartInput } from "./DartInput";
import { getChaosDef } from "@/game/effects/registry";

type Tab = "play" | "scoreboard" | "effects";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "play", label: "Play", icon: "🎯" },
  { key: "scoreboard", label: "Scoreboard", icon: "🏆" },
  { key: "effects", label: "Effects", icon: "🌀" },
];

export function GameScreen() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const myPlayerId = useGame((s) => s.myPlayerId);
  const myCurrentDarts = useGame((s) => s.myCurrentDarts);
  const setDart = useGame((s) => s.setDart);
  const submitTurn = useGame((s) => s.submitTurn);
  const [tab, setTab] = useState<Tab>("play");
  const [bigScreen, setBigScreen] = useState(false);

  const current = game.players[game.currentPlayerIndex];
  const isOnline = mode === "online";
  const isMyTurn = !isOnline || myPlayerId === current?.id;
  const activeDarts = isOnline ? myCurrentDarts : game.currentDarts;

  return (
    <div className="mx-auto max-w-xl pb-24">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">🎯 Darts of Chaos</h1>
        <div className="flex items-center gap-3">
          {isOnline && (
            <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setBigScreen((v) => !v)}>
              {bigScreen ? "exit big screen" : "big screen"}
            </button>
          )}
          <div className="text-sm text-slate-400">
            Round <b className="text-slate-100">{game.round}</b> / {game.maxRounds}
          </div>
        </div>
      </header>

      {tab === "play" && (
        <div className="space-y-4">
          {game.activeRoundModifiers.length > 0 && (
            <div className="space-y-2">
              {game.activeRoundModifiers.map((m) => {
                const def = getChaosDef(m.defId);
                if (!def) return null;
                return (
                  <div
                    key={m.defId}
                    className="rounded-lg border border-fuchsia-500/50 bg-fuchsia-500/10 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fuchsia-300">🌀 {def.name}</span>
                      <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs text-fuchsia-400">
                        active this round
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-fuchsia-200/80">{def.description}</p>
                  </div>
                );
              })}
            </div>
          )}

          <Dartboard />

          {!bigScreen && current && (
            <div className="card space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="label">Now throwing</div>
                <div className="text-sm text-slate-400">
                  Player {game.currentPlayerIndex + 1} of {game.players.length}
                </div>
              </div>
              <div className="text-2xl font-bold text-emerald-300">{current.name}</div>
              {game.activeAfflictions.filter((a) => a.playerId === current.id).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {game.activeAfflictions
                    .filter((a) => a.playerId === current.id)
                    .map((a) => (
                      <span
                        key={a.id}
                        className="rounded-md border border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200"
                      >
                        {a.icon} {a.label}
                      </span>
                    ))}
                </div>
              )}
              {isMyTurn ? (
                <>
                  <ThreeDartInput darts={activeDarts} onSet={setDart} onSubmit={submitTurn} submitLabel="Submit turn" />
                  <p className="text-xs text-slate-500">
                    Enter {activeDarts.length === 1 ? "the dart" : `all ${activeDarts.length} darts`} for{" "}
                    {current.name}, then submit. Mines may trigger on submit.
                  </p>
                </>
              ) : (
                <p className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
                  Waiting for {current.name}…
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "scoreboard" && (
        <div className="space-y-4">
          <Scoreboard />
        </div>
      )}

      {tab === "effects" && (
        <div className="space-y-4">
          <BoardSummary />
          <BoardLegend />
          <RoundLog />
        </div>
      )}

      {!bigScreen && <TabBar tab={tab} onChange={setTab} />}
    </div>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`min-h-11 flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition-colors ${
              tab === t.key ? "text-emerald-300" : "text-slate-500"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
