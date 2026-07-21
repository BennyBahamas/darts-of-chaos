"use client";

import { useGame } from "@/store/gameStore";
import { ThreeDartInput } from "./DartInput";

export function ShowdownScreen() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const myPlayerId = useGame((s) => s.myPlayerId);
  const setShowdownDart = useGame((s) => s.setShowdownDart);
  const advance = useGame((s) => s.advanceShowdownThrower);
  const resolve = useGame((s) => s.resolveShowdown);
  const finish = useGame((s) => s.finishShowdown);

  const sd = game.showdown;
  if (!sd) return null;
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "??";

  const isOnline = mode === "online";
  const isA = !isOnline || myPlayerId === sd.aId;
  const isB = !isOnline || myPlayerId === sd.bId;
  const isParticipant = isA || isB;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-rose-300">⚔️ Nemesis Showdown</h1>
      <p className="text-sm text-slate-400">
        {name(sd.aId)} vs {name(sd.bId)} — each throws 3 darts. Winner +15, loser −15 and drinks 3.
      </p>

      {sd.stage === "a" && (
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-emerald-300">{name(sd.aId)} throws</div>
          {isA ? (
            <ThreeDartInput
              darts={sd.aDarts}
              onSet={(i, raw) => setShowdownDart("a", i, raw)}
              onSubmit={advance}
              submitLabel={`Lock in & pass to ${name(sd.bId)}`}
            />
          ) : (
            <p className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
              Waiting for {name(sd.aId)}…
            </p>
          )}
        </div>
      )}

      {sd.stage === "b" && (
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-emerald-300">{name(sd.bId)} throws</div>
          {isB ? (
            <ThreeDartInput
              darts={sd.bDarts}
              onSet={(i, raw) => setShowdownDart("b", i, raw)}
              onSubmit={resolve}
              submitLabel="Resolve showdown"
            />
          ) : (
            <p className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
              Waiting for {name(sd.bId)}…
            </p>
          )}
        </div>
      )}

      {sd.stage === "result" && (
        <div className="card space-y-2">
          <div className="text-sm text-slate-400">Scores</div>
          <div className="flex justify-between text-lg">
            <span>
              {name(sd.aId)}: <b>{sd.aScore}</b>
            </span>
            <span>
              {name(sd.bId)}: <b>{sd.bScore}</b>
            </span>
          </div>
          <div className="text-xl font-bold text-emerald-300">{sd.winnerId && name(sd.winnerId)} wins!</div>
          {sd.message && <div className="text-lg italic text-amber-300">“{sd.message}”</div>}
          {isParticipant ? (
            <button className="btn-primary w-full" onClick={finish}>
              Continue →
            </button>
          ) : (
            <p className="text-center text-sm text-slate-500">
              Waiting for {name(sd.aId)} or {name(sd.bId)} to continue…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
