"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { generateRoomCode, saveRoom } from "@/net/session";

type Mode = "menu" | "create" | "join";

export function EntryScreen({ onPlayLocal }: { onPlayLocal: () => void }) {
  const enterOnline = useGame((s) => s.enterOnline);
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const createRoom = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const code = generateRoomCode();
    saveRoom({ roomCode: code, name: trimmed });
    enterOnline(code, trimmed);
  };

  const joinRoom = () => {
    const trimmed = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (!trimmed || !code) return;
    saveRoom({ roomCode: code, name: trimmed });
    enterOnline(code, trimmed);
  };

  if (mode === "menu") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">🎯 Darts of Chaos</h1>
        <p className="text-sm text-slate-400">
          One laptop for everyone, or each player on their own phone — pick how to play.
        </p>
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={onPlayLocal}>
            📋 Play locally on this device
          </button>
          <button className="btn-ghost w-full" onClick={() => setMode("create")}>
            ➕ Create room
          </button>
          <button className="btn-ghost w-full" onClick={() => setMode("join")}>
            🔑 Join room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{mode === "create" ? "Create room" : "Join room"}</h1>
      <div className="card space-y-3">
        <label className="flex flex-col gap-1">
          <span className="label">Your name</span>
          <input
            className="sel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
          />
        </label>
        {mode === "join" && (
          <label className="flex flex-col gap-1">
            <span className="label">Room code</span>
            <input
              className="sel uppercase tracking-widest"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="ABCDE"
              maxLength={8}
            />
          </label>
        )}
        <button
          className="btn-primary w-full"
          onClick={mode === "create" ? createRoom : joinRoom}
          disabled={!name.trim() || (mode === "join" && !joinCode.trim())}
        >
          {mode === "create" ? "Create & open lobby" : "Join lobby"}
        </button>
        <button className="btn-ghost w-full" onClick={() => setMode("menu")}>
          ← Back
        </button>
      </div>
    </div>
  );
}
