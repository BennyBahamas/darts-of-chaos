"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/store/gameStore";

const ACCENT: Record<string, string> = {
  mine: "border-rose-500 text-rose-200",
  golden: "border-amber-400 text-amber-200",
  nemesis: "border-fuchsia-500 text-fuchsia-200",
  showdown: "border-rose-400 text-rose-200",
  easterEgg: "border-amber-300 text-amber-200",
  chaos: "border-fuchsia-400 text-fuchsia-200",
  info: "border-slate-500 text-slate-200",
};

export function EventModal() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const myPlayerId = useGame((s) => s.myPlayerId);
  const dismissedEventIds = useGame((s) => s.dismissedEventIds);
  const dismiss = useGame((s) => s.dismissEvent);
  const assignDrink = useGame((s) => s.assignDrink);

  // In online mode, dismissal is per-device (see gameStore.ts's dismissEvent)
  // so a fast reader on one phone can't yank a popup off someone else's
  // screen mid-read — each client filters the shared queue against its own
  // locally-dismissed ids. In local mode dismissedEventIds stays empty
  // (dismissEvent shifts the shared queue directly instead), so this
  // filter is a no-op there and behaves exactly as before.
  const visibleEvents = game.pendingEvents.filter((e) => !dismissedEventIds.includes(e.id));
  const evt = visibleEvents[0];
  const assign = evt?.assign;

  // A "Give N Drinks" tile resolves one drink per click and stays open until
  // fully given out (see engine.ts's assignDrink), so the same picker can be
  // tapped again for the next drink — including a different recipient. That
  // reuse was confusing without feedback (the grid looked identical before
  // and after a tap, like nothing happened). Track "which button did I just
  // press" locally for an immediate checkmark/disable, independent of
  // however long the state update takes to arrive.
  const [justPicked, setJustPicked] = useState<string | null>(null);
  useEffect(() => {
    setJustPicked(null);
  }, [evt?.id, assign?.amount]);

  if (!evt) return null;

  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "??";
  const isGiver = !assign || mode === "local" || myPlayerId === assign.giverId;

  const pick = (playerId: string) => {
    setJustPicked(playerId);
    assignDrink(evt.id, playerId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full max-w-md rounded-xl border-2 bg-slate-900 p-6 shadow-2xl ${ACCENT[evt.type] ?? ACCENT.info}`}>
        <div className="text-center text-2xl font-extrabold">{evt.title}</div>
        <div className="mt-4 space-y-1 text-center text-slate-100">
          {evt.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>

        {assign && !isGiver && (
          <p className="mt-6 text-center text-sm text-slate-400">
            Waiting for {name(assign.giverId)} to give the drink{assign.amount > 1 ? "s" : ""}…
          </p>
        )}

        {assign && isGiver && (
          <div className="mt-6 space-y-2">
            <div className="label text-center">
              Give {assign.amount} more drink{assign.amount > 1 ? "s" : ""} to…
            </div>
            <div className="grid grid-cols-2 gap-2">
              {game.players.map((p) => {
                const picked = justPicked === p.id;
                return (
                  <button
                    key={p.id}
                    disabled={justPicked !== null}
                    className={`min-h-11 rounded-md border px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                      picked
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                        : "border-slate-700 bg-slate-800 text-slate-100 hover:border-emerald-500"
                    }`}
                    onClick={() => pick(p.id)}
                  >
                    {picked ? "✓ " : ""}
                    {p.name}
                    {p.id === assign.giverId ? " (self)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!assign && (
          <button className="btn-primary mt-6 w-full" onClick={() => dismiss(evt.id)}>
            Continue
          </button>
        )}

        {visibleEvents.length > 1 && (
          <p className="mt-2 text-center text-xs text-slate-500">{visibleEvents.length - 1} more event(s)…</p>
        )}
      </div>
    </div>
  );
}
