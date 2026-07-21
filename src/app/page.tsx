"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/store/gameStore";
import { getDeviceId, getSavedRoom } from "@/net/session";
import { EntryScreen } from "@/components/EntryScreen";
import { Lobby } from "@/components/Lobby";
import { SetupScreen } from "@/components/SetupScreen";
import { GameScreen } from "@/components/GameScreen";
import { RewardScreen } from "@/components/RewardScreen";
import { ShowdownScreen } from "@/components/ShowdownScreen";
import { EventModal } from "@/components/EventModal";

type View = "entry" | "playing";

export default function Page() {
  // Gate rendering until the client has hydrated the persisted store, so SSR
  // markup matches and localStorage state is respected.
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("entry");
  const enterOnline = useGame((s) => s.enterOnline);
  const mode = useGame((s) => s.mode);
  const phase = useGame((s) => s.game.phase);

  useEffect(() => {
    setMounted(true);
    const saved = getSavedRoom();
    if (saved) {
      enterOnline(saved.roomCode, saved.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // EntryScreen's create/join, Lobby's "Leave room", GameOver's "Leave room",
  // and the footer's "reset everything" link all just call the store's
  // enterOnline/leaveOnline/resetGame — none of them know about `view`.
  // Instead of threading a callback through four components, react to `mode`
  // here in both directions: online -> show the game UI, back to local after
  // having been online -> back to the entry screen.
  const wasOnline = useRef(false);
  useEffect(() => {
    if (mode === "online") {
      wasOnline.current = true;
      setView("playing");
    } else if (wasOnline.current) {
      wasOnline.current = false;
      setView("entry");
    }
  }, [mode]);

  if (!mounted) {
    return <main className="p-6 text-slate-500">Loading Darts of Chaos…</main>;
  }

  if (view === "entry") {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <EntryScreen onPlayLocal={() => setView("playing")} />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      {phase === "setup" && (mode === "online" ? <Lobby /> : <SetupScreen />)}
      {phase === "roundActive" && <GameScreen />}
      {(phase === "reward" || phase === "rewardPlacement") && <RewardScreen />}
      {phase === "showdown" && <ShowdownScreen />}
      {phase === "gameOver" && <GameOver />}
      <EventModal />
      <Footer />
    </main>
  );
}

function GameOver() {
  const game = useGame((s) => s.game);
  const mode = useGame((s) => s.mode);
  const hostDeviceId = useGame((s) => s.hostDeviceId);
  const resetGame = useGame((s) => s.resetGame);
  const newGameSamePlayers = useGame((s) => s.newGameSamePlayers);
  const leaveOnline = useGame((s) => s.leaveOnline);
  const restartOnline = useGame((s) => s.restartOnline);
  const ranked = [...game.players].sort((a, b) => b.totalScore - a.totalScore);
  const isHost = getDeviceId() === hostDeviceId;

  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <h1 className="text-3xl font-extrabold">🏁 Game Over</h1>
      {ranked[0] && <p className="text-xl text-emerald-300">🏆 {ranked[0].name} wins!</p>}
      <ol className="card space-y-1 text-left">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between">
            <span>
              {i + 1}. {p.name}
            </span>
            <b className="font-mono">{p.totalScore}</b>
          </li>
        ))}
      </ol>
      {mode === "online" ? (
        <div className="flex gap-2">
          {isHost && (
            <button className="btn-primary flex-1" onClick={restartOnline}>
              Restart game (same room)
            </button>
          )}
          <button className="btn-ghost flex-1" onClick={leaveOnline}>
            Leave room
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={newGameSamePlayers}>
            Rematch (same players)
          </button>
          <button className="btn-ghost flex-1" onClick={resetGame}>
            New setup
          </button>
        </div>
      )}
    </div>
  );
}

function Footer() {
  const mode = useGame((s) => s.mode);
  const resetGame = useGame((s) => s.resetGame);
  const leaveOnline = useGame((s) => s.leaveOnline);
  return (
    <footer className="mx-auto mt-8 max-w-5xl text-center">
      <button
        className="text-xs text-slate-600 hover:text-slate-400"
        onClick={mode === "online" ? leaveOnline : resetGame}
      >
        {mode === "online" ? "leave room" : "reset everything"}
      </button>
    </footer>
  );
}
