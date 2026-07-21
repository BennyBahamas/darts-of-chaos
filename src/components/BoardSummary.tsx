"use client";

import { useGame } from "@/store/gameStore";
import { getZoneDef, getChaosDef } from "@/game/effects/registry";
import { segmentLabel } from "@/game/darts";

export function BoardSummary() {
  const game = useGame((s) => s.game);
  const name = (id: string | null) => (id ? game.players.find((p) => p.id === id)?.name ?? "??" : "app");

  const zones = game.placedEffects.filter((e) => e.kind === "zone");
  // Mines are completely hidden: no locations, icons, effects, or COUNT shown.
  // They persist on the board until triggered — never expire.

  return (
    <div className="card">
      <div className="label mb-2">Active effects</div>

      {game.goldenTile && (
        <div className="mb-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-sm text-amber-200">
          ⭐ ? Golden tile is in play on <b>{segmentLabel(game.goldenTile.segment)}</b> — effect hidden until hit.
        </div>
      )}

      <div className="text-sm text-slate-300">
        <div>
          Visible tiles &amp; zones:{" "}
          {zones.length === 0 ? (
            <span className="text-slate-500">none</span>
          ) : (
            <ul className="ml-4 list-disc">
              {zones.map((z) => {
                const def = getZoneDef(z.defId);
                const targeted = def?.target === "chosen";
                return (
                  <li key={z.id}>
                    <span className="mr-1">{def?.badge}</span>
                    {def?.name ?? "Zone"} on <b>{segmentLabel(z.segment)}</b>{" "}
                    {def?.firstHitOnly && <span className="text-amber-300">(first hit)</span>}{" "}
                    <span className="text-slate-500">
                      ({z.creatorId ? `by ${name(z.creatorId)}` : "public"}
                      {targeted && z.targetId ? ` → ${name(z.targetId)}` : ""})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function RoundLog() {
  const log = useGame((s) => s.game.log);
  const recent = [...log].slice(-12).reverse();
  return (
    <div className="card">
      <div className="label mb-2">Round Log</div>
      <ul className="space-y-1 text-xs text-slate-300">
        {recent.length === 0 && <li className="text-slate-500">Nothing yet.</li>}
        {recent.map((l) => (
          <li key={l.id}>
            <span className="text-slate-500">R{l.round}:</span> {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
