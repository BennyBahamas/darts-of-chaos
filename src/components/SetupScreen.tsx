"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";

export function SetupScreen() {
  const game = useGame((s) => s.game);
  const addPlayer = useGame((s) => s.addPlayer);
  const removePlayer = useGame((s) => s.removePlayer);
  const setMaxRounds = useGame((s) => s.setMaxRounds);
  const startGame = useGame((s) => s.startGame);
  const [name, setName] = useState("");

  const add = () => {
    if (!name.trim()) return;
    addPlayer(name);
    setName("");
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">🎯 Darts of Chaos</h1>
      <p className="text-sm text-slate-400">
        One laptop runs the whole game. Add everyone, then the operator enters all throws.
      </p>

      <div className="card space-y-3">
        <div className="label">Players</div>
        <div className="flex gap-2">
          <input
            className="sel flex-1"
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn-ghost" onClick={add}>
            Add
          </button>
        </div>

        <ul className="space-y-1">
          {game.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded bg-slate-900/60 px-3 py-2 text-sm">
              <span>{p.name}</span>
              <button className="text-rose-400 hover:text-rose-300" onClick={() => removePlayer(p.id)}>
                remove
              </button>
            </li>
          ))}
          {game.players.length === 0 && <li className="text-sm text-slate-500">No players yet.</li>}
        </ul>
      </div>

      <div className="card space-y-3">
        <div className="label">Rounds</div>
        <div className="flex gap-2">
          {[5, 8, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setMaxRounds(n)}
              className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors ${
                game.maxRounds === n
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-primary w-full" onClick={() => startGame()} disabled={game.players.length < 2}>
        Start game ({game.maxRounds} rounds)
      </button>
      {game.players.length < 2 && <p className="text-center text-xs text-slate-500">Add at least 2 players.</p>}
    </div>
  );
}
