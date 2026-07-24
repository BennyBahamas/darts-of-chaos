// ============================================================================
// The multiplayer room server — one Durable Object instance per room code.
// SQLite-backed (required for the Workers Free plan) with hibernation enabled
// (`static options`) so idle rooms don't stay pinned in memory or billed.
//
// This class is the sole authority over GameState: it never lets a client
// mutate state directly. Every intent is authorized, applied via the same
// `applyAction` used by local mode, persisted, then broadcast to everyone.
//
// Relative imports only (not the `@/*` alias) — this file is bundled by
// Wrangler, not Next, and has its own tsconfig (party/tsconfig.json).
// ============================================================================

import { routePartykitRequest, Server } from "partyserver";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import "../src/game/effects"; // register all effect pools (mines/zones/golden/chaos) — this Worker is a separate bundle from the Next app, so it needs its own copy of this side-effect import
import type { ActionName } from "../src/game/actions";
import { applyAction } from "../src/game/actions";
import { emptyGameState } from "../src/game/engine";
import type { GameState } from "../src/game/types";
import type { ClientIntent, LobbyEntry, ServerMessage } from "../src/net/messages";

interface ConnState {
  deviceId: string;
}

interface PersistedRoom {
  gameState: GameState;
  seatMap: Record<string, string>; // playerId -> deviceId
  hostDeviceId: string | null;
  lobby: LobbyEntry[];
  version: number;
}

const STORAGE_KEY = "room";
const rng = () => Math.random();

function freshRoom(): PersistedRoom {
  return { gameState: emptyGameState(), seatMap: {}, hostDeviceId: null, lobby: [], version: 0 };
}

/**
 * Server-enforced authorization — never trust the client. Returns an error
 * message if the intent is rejected, or null if it may proceed.
 *
 * `startGame` is the one remaining genuine "is everyone ready" group-pacing
 * moment with no single obvious owner, so it stays host-only. Round results
 * -> reward is now automatic (folded into `resolveRound`, no action to gate).
 * `finishReward` and `finishShowdown` just continue past a flow one specific
 * player (or pair) already fully controlled — gating those to that player
 * removes a pointless "wait for the host" step. Double-firing is guarded
 * against independently in `applyAction`/`finishShowdownFix`, not by relying
 * on "only one identity is authorized" — two authorized devices could still
 * both fire in theory, so the idempotency guards there are load-bearing.
 */
function authorize(
  g: GameState,
  seatMap: Record<string, string>,
  hostDeviceId: string | null,
  deviceId: string,
  action: ActionName,
  payload: unknown
): string | null {
  switch (action) {
    case "startGame":
      return deviceId === hostDeviceId ? null : "Only the host can do that.";
    case "submitTurn": {
      const current = g.players[g.currentPlayerIndex];
      return current && seatMap[current.id] === deviceId ? null : "It's not your turn.";
    }
    case "chooseCard":
    case "setRewardSegment":
    case "setRewardTarget":
    case "confirmPlacement":
    case "finishReward": {
      const winnerId = g.reward?.winnerId;
      return winnerId && seatMap[winnerId] === deviceId ? null : "Only the round winner can do that.";
    }
    case "setShowdownDart": {
      const { who } = payload as { who: "a" | "b" };
      if (!g.showdown) return "No showdown in progress.";
      const expected = who === "a" ? g.showdown.aId : g.showdown.bId;
      return seatMap[expected] === deviceId ? null : "Not your throw.";
    }
    case "advanceShowdownThrower":
      return g.showdown && seatMap[g.showdown.aId] === deviceId ? null : "Not your throw.";
    case "resolveShowdown":
      return g.showdown && seatMap[g.showdown.bId] === deviceId ? null : "Not your throw.";
    case "finishShowdown":
      return g.showdown && (seatMap[g.showdown.aId] === deviceId || seatMap[g.showdown.bId] === deviceId)
        ? null
        : "Not your showdown.";
    case "dismissEvent":
    case "dismissAllEvents":
      return null;
    case "assignDrink": {
      // Target by eventId, not array position — a device may have other,
      // still-undismissed (locally, per-device) events ahead of its own
      // assign event, and more than one assign event could be pending at once.
      const { eventId } = payload as { eventId: string };
      const giverId = g.pendingEvents.find((e) => e.id === eventId)?.assign?.giverId;
      return giverId && seatMap[giverId] === deviceId ? null : "Not your tile to assign.";
    }
    default:
      return "Unknown action.";
  }
}

export class DartsRoom extends Server<Env> {
  static options = { hibernate: true };

  room: PersistedRoom = freshRoom();

  async onStart() {
    const saved = await this.ctx.storage.get<PersistedRoom>(STORAGE_KEY);
    if (saved) this.room = saved;
  }

  onConnect(connection: Connection, _ctx: ConnectionContext) {
    connection.send(JSON.stringify(this.snapshot()));
  }

  async onMessage(connection: Connection<ConnState>, message: WSMessage) {
    if (typeof message !== "string") return;
    let intent: ClientIntent;
    try {
      intent = JSON.parse(message) as ClientIntent;
    } catch {
      return;
    }

    // Tag every connection with its deviceId so onClose (which only gets the
    // connection, not the last message) can find the right lobby entry. Uses
    // Connection.setState, which survives hibernation — a plain in-memory Map
    // would not.
    connection.setState({ deviceId: intent.deviceId });

    if (intent.kind === "JOIN") {
      this.handleJoin(intent.deviceId, intent.name);
      await this.persistAndBroadcast();
      return;
    }

    if (intent.kind === "LEAVE") {
      this.handleLeave(intent.deviceId);
      await this.persistAndBroadcast();
      return;
    }

    if (intent.kind === "RESTART") {
      this.handleRestart(intent.deviceId);
      await this.persistAndBroadcast();
      return;
    }

    const denyReason = authorize(
      this.room.gameState,
      this.room.seatMap,
      this.room.hostDeviceId,
      intent.deviceId,
      intent.action,
      intent.payload
    );
    if (denyReason) {
      connection.send(JSON.stringify({ kind: "ERROR", message: denyReason } satisfies ServerMessage));
      return;
    }

    if (intent.action === "startGame") {
      this.startGameFromLobby(intent.payload as { maxRounds?: number } | undefined);
    } else {
      applyAction(this.room.gameState, intent.action, intent.payload, rng);
    }
    await this.persistAndBroadcast();
  }

  async onClose(connection: Connection<ConnState>) {
    const deviceId = connection.state?.deviceId;
    if (!deviceId) return;

    const entry = this.room.lobby.find((l) => l.deviceId === deviceId);
    if (entry) entry.connected = false;

    if (this.room.hostDeviceId === deviceId) {
      // Auto-promote the first other connected seated player — simpler than
      // a manual "claim host" button, and the game survives either way.
      const nextHost = this.room.lobby.find((l) => l.connected && l.deviceId !== deviceId);
      if (nextHost) this.room.hostDeviceId = nextHost.deviceId;
    }
    await this.persistAndBroadcast();
  }

  // ---- lobby / seating ------------------------------------------------------

  private handleJoin(deviceId: string, name: string) {
    const existing = this.room.lobby.find((l) => l.deviceId === deviceId);
    if (existing) {
      existing.connected = true;
      if (name) existing.name = name;
    } else {
      this.room.lobby.push({ deviceId, name: name || "Player", connected: true });
    }
    // Promote to host if there's no host yet, OR the current host isn't
    // actually connected (e.g. they left permanently while no one else was
    // around — onClose's promotion had no one to hand off to at the time).
    const hostStillConnected = this.room.lobby.some((l) => l.deviceId === this.room.hostDeviceId && l.connected);
    if (!hostStillConnected) this.room.hostDeviceId = deviceId;
  }

  private handleLeave(deviceId: string) {
    // Only actually remove from the roster pre-game. Once seated, a
    // disconnect (onClose) just flags presence — removing them would shift
    // currentPlayerIndex and every other index-based reference.
    if (this.room.gameState.phase !== "setup") return;
    this.room.lobby = this.room.lobby.filter((l) => l.deviceId !== deviceId);
    if (this.room.hostDeviceId === deviceId) {
      this.room.hostDeviceId = this.room.lobby[0]?.deviceId ?? null;
    }
  }

  /** Host-only, gameOver-only: fresh lobby, same room/roster/host — a same-room rematch. */
  private handleRestart(deviceId: string) {
    if (this.room.hostDeviceId !== deviceId) return;
    if (this.room.gameState.phase !== "gameOver") return;
    this.room.gameState = emptyGameState();
    this.room.seatMap = {};
  }

  private startGameFromLobby(payload: { maxRounds?: number } | undefined) {
    const seated = this.room.lobby.filter((l) => l.connected);
    if (seated.length < 2) return;
    const players = seated.map((l) => ({ id: `p_${l.deviceId}`, name: l.name, totalScore: 0 }));
    this.room.gameState.players = players;
    this.room.seatMap = Object.fromEntries(players.map((p, i) => [p.id, seated[i].deviceId]));
    applyAction(this.room.gameState, "startGame", payload, rng);
  }

  // ---- persistence / broadcast -----------------------------------------------

  private snapshot(): ServerMessage {
    return {
      kind: "STATE",
      version: this.room.version,
      gameState: this.room.gameState,
      seats: this.room.seatMap,
      hostDeviceId: this.room.hostDeviceId,
      lobby: this.room.lobby,
    };
  }

  private async persistAndBroadcast() {
    this.room.version += 1;
    await this.ctx.storage.put(STORAGE_KEY, this.room);
    this.broadcast(JSON.stringify(this.snapshot()));
  }
}

interface Env {
  DartsRoom: DurableObjectNamespace<DartsRoom>;
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routePartykitRequest(request, env)) || new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
