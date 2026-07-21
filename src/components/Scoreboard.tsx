"use client";

import { useGame } from "@/store/gameStore";

export function Scoreboard() {
  const game = useGame((s) => s.game);
  const ranked = [...game.players].sort((a, b) => b.totalScore - a.totalScore);
  const leaderId = ranked[0]?.id;

  return (
    <div className="card">
      <div className="label mb-2">Scoreboard</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-1">#</th>
            <th>Player</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => (
            <tr key={p.id} className="border-t border-slate-700/60">
              <td className="py-1">{i + 1}</td>
              <td>
                {p.name} {p.id === leaderId && <span title="leader">👑</span>}
              </td>
              <td className="text-right font-mono font-semibold">{p.totalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
