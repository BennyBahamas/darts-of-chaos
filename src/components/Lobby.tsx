"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { getDeviceId, getSavedRoom } from "@/net/session";

const ROUND_OPTIONS = [5, 8, 10, 15, 20];

/** Pre-game roster for an online room — shown instead of SetupScreen while phase is "setup". */
export function Lobby() {
  const lobby = useGame((s) => s.lobby);
  const hostDeviceId = useGame((s) => s.hostDeviceId);
  const connectionStatus = useGame((s) => s.connectionStatus);
  const startGame = useGame((s) => s.startGame);
  const leaveOnline = useGame((s) => s.leaveOnline);
  const [maxRounds, setMaxRounds] = useState(10);
  const [copied, setCopied] = useState(false);

  const myDeviceId = getDeviceId();
  const isHost = myDeviceId === hostDeviceId;
  const connectedCount = lobby.filter((l) => l.connected).length;
  const roomCode = getSavedRoom()?.roomCode ?? "";

  const copyCode = () => {
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">🎯 Room Lobby</h1>

      <div className="card space-y-2 text-center">
        <div className="label">Room code — share this</div>
        <button
          type="button"
          onClick={copyCode}
          className="mx-auto block rounded-md border border-emerald-500/60 bg-emerald-500/10 px-6 py-3 font-mono text-3xl font-bold tracking-[0.3em] text-emerald-300"
        >
          {roomCode}
        </button>
        <p className="text-xs text-slate-500">{copied ? "Copied!" : "Tap to copy"}</p>
      </div>

      <p className="text-sm text-slate-400">
        {connectionStatus !== "open"
          ? "Connecting…"
          : isHost
          ? "You're the host — start once everyone's in."
          : "Waiting for the host to start…"}
      </p>

      <div className="card space-y-2">
        <div className="label">Players ({connectedCount})</div>
        <ul className="space-y-1">
          {lobby.map((l) => (
            <li
              key={l.deviceId}
              className="flex items-center justify-between rounded bg-slate-900/60 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${l.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
                {l.name}
              </span>
              <span className="flex gap-2 text-xs text-slate-500">
                {l.deviceId === hostDeviceId && <span className="text-amber-300">host</span>}
                {l.deviceId === myDeviceId && <span>(you)</span>}
              </span>
            </li>
          ))}
          {lobby.length === 0 && <li className="text-sm text-slate-500">Waiting for players to join…</li>}
        </ul>
      </div>

      {isHost && (
        <div className="card space-y-3">
          <div className="label">Rounds</div>
          <div className="flex gap-2">
            {ROUND_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxRounds(n)}
                className={`min-h-11 flex-1 rounded-md border text-sm font-medium transition-colors ${
                  maxRounds === n
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={() => startGame(maxRounds)} disabled={connectedCount < 2}>
            Start game ({maxRounds} rounds)
          </button>
          {connectedCount < 2 && <p className="text-center text-xs text-slate-500">Need at least 2 players.</p>}
        </div>
      )}

      <button className="btn-ghost w-full" onClick={leaveOnline}>
        Leave room
      </button>
    </div>
  );
}
