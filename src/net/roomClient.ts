"use client";

import PartySocket from "partysocket";
import type { ClientIntent, ServerMessage } from "./messages";

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface RoomClient {
  send(intent: ClientIntent): void;
  close(): void;
}

/** Thin wrapper over PartySocket: connect to a room, send intents, receive snapshots. */
export function connectRoom(opts: {
  host: string;
  roomCode: string;
  deviceId: string;
  onState: (msg: ServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}): RoomClient {
  // Room codes are generated uppercase (for display) but connections are
  // case-insensitive, since both create and join flows funnel through here.
  const socket = new PartySocket({
    host: opts.host,
    party: "darts-room", // kebab-case of the `DartsRoom` server class name
    room: opts.roomCode.toLowerCase(),
    id: opts.deviceId,
  });

  opts.onStatusChange?.("connecting");
  socket.addEventListener("open", () => opts.onStatusChange?.("open"));
  socket.addEventListener("close", () => opts.onStatusChange?.("closed"));
  socket.addEventListener("error", () => opts.onStatusChange?.("error"));
  socket.addEventListener("message", (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      opts.onState(msg);
    } catch {
      // ignore malformed frames
    }
  });

  return {
    send: (intent: ClientIntent) => socket.send(JSON.stringify(intent)),
    close: () => socket.close(),
  };
}
