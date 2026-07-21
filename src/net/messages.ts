// ============================================================================
// Shared message contract between the browser client (roomClient.ts,
// gameStore.ts) and the room server (party/server.ts). Both sides import this
// file directly, so it uses relative imports (not the `@/*` alias, which is
// Next-specific and unavailable from the Worker's separate tsconfig).
// ============================================================================

import type { ActionName } from "../game/actions";
import type { GameState } from "../game/types";

export interface LobbyEntry {
  deviceId: string;
  name: string;
  connected: boolean;
}

export type ClientIntent =
  | { kind: "JOIN"; deviceId: string; name: string }
  | { kind: "LEAVE"; deviceId: string }
  /** Host-only, gameOver-only: resets GameState to a fresh lobby, keeping the
   * same room code, connected roster, and host — a same-room rematch. This is
   * a room-lifecycle operation (like JOIN/LEAVE), not a GameState action, so
   * it doesn't go through ActionName/applyAction. */
  | { kind: "RESTART"; deviceId: string }
  | { kind: "ACTION"; deviceId: string; action: ActionName; payload?: unknown };

export type ServerMessage =
  | {
      kind: "STATE";
      version: number;
      gameState: GameState;
      seats: Record<string, string>; // playerId -> deviceId
      hostDeviceId: string | null;
      lobby: LobbyEntry[];
    }
  | { kind: "ERROR"; message: string };
