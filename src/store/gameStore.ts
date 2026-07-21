// ============================================================================
// 3. ZUSTAND STORE + ACTIONS
// The store holds the GameState under `game` and exposes actions that delegate
// to the shared `applyAction` dispatcher (src/game/actions.ts). Two modes:
//
//   - "local"  (default, unchanged from Phase 1): each action clones `game`,
//     runs `applyAction` against the clone, and commits it. Persisted to
//     localStorage as before.
//   - "online": each action instead sends a ClientIntent to the room server
//     via roomClient and returns — the store never runs the engine itself in
//     this mode. Incoming STATE broadcasts replace `game` wholesale. Online
//     session fields (mode, myPlayerId, lobby, hostDeviceId, connectionStatus,
//     myCurrentDarts) are deliberately NOT persisted (partialize only covers
//     `game`), so a stale online snapshot never survives a reload on its own —
//     page.tsx's saved-room check re-triggers enterOnline() instead.
//
// Round-turn dart entry is staged client-side in `myCurrentDarts` (there's no
// networked per-keystroke round-turn action, only batched `submitTurn`).
// Showdown dart entry has no local staging — `setShowdownDart` is itself a
// networked action per keystroke, landing directly in the authoritative
// `game.showdown.aDarts/bDarts`.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import "../game/effects"; // register all effect pools

import { applyAction, type ActionName } from "../game/actions";
import { emptyGameState } from "../game/engine";
import type { CardType, GameState, SegmentKey } from "../game/types";
import type { LobbyEntry, ServerMessage } from "../net/messages";
import { connectRoom, type ConnectionStatus, type RoomClient } from "../net/roomClient";
import { clearRoom, getDeviceId } from "../net/session";

const rng = () => Math.random();

let idc = 0;
const pid = () => `p_${Date.now().toString(36)}_${(idc++).toString(36)}`;

// Not store state: a RoomClient isn't serializable and doesn't belong in
// React-observed state. One room connection at a time.
let roomClient: RoomClient | null = null;

function sendOnline(action: ActionName, payload?: unknown) {
  roomClient?.send({ kind: "ACTION", deviceId: getDeviceId(), action, payload });
}

interface GameStore {
  game: GameState;
  mode: "local" | "online";

  // online-mode session fields (not persisted)
  myPlayerId: string | null;
  hostDeviceId: string | null;
  lobby: LobbyEntry[];
  connectionStatus: ConnectionStatus;
  myCurrentDarts: (string | null)[];
  /** Online mode only: plain informational events this device has personally
   * dismissed. Never sent over the network — see dismissEvent below. */
  dismissedEventIds: string[];

  // setup (local mode only — online rooms build players from the lobby)
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  setMaxRounds: (n: number) => void;
  startGame: (maxRounds?: number) => void;

  // round
  setDart: (index: number, raw: string | null) => void;
  submitTurn: () => void;

  // reward
  chooseCard: (card: CardType) => void;
  setRewardSegment: (seg: SegmentKey) => void;
  setRewardTarget: (id: string | null) => void;
  confirmPlacement: () => void;
  finishReward: () => void;

  // showdown
  setShowdownDart: (who: "a" | "b", index: number, raw: string | null) => void;
  advanceShowdownThrower: () => void;
  resolveShowdown: () => void;
  finishShowdown: () => void;

  // events
  dismissEvent: (eventId?: string) => void;
  assignDrink: (eventId: string, drinkerId: string) => void;

  // lifecycle
  resetGame: () => void;
  newGameSamePlayers: () => void;

  // online lifecycle
  enterOnline: (roomCode: string, name: string) => void;
  leaveOnline: () => void;
  restartOnline: () => void;
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => {
      const apply = (fn: (g: GameState) => void) =>
        set((store) => {
          const g = structuredClone(store.game) as GameState;
          fn(g);
          return { game: g };
        });

      /** Local mode runs `localFn` against a cloned draft; online mode sends the intent instead. */
      const dispatch = (action: ActionName, payload: unknown, localFn: (g: GameState) => void) => {
        if (get().mode === "online") {
          sendOnline(action, payload);
          return;
        }
        apply(localFn);
      };

      return {
        game: emptyGameState(),
        mode: "local",
        myPlayerId: null,
        hostDeviceId: null,
        lobby: [],
        connectionStatus: "closed",
        myCurrentDarts: [],
        dismissedEventIds: [],

        addPlayer: (name) =>
          apply((g) => {
            const trimmed = name.trim();
            if (!trimmed || g.phase !== "setup") return;
            g.players.push({ id: pid(), name: trimmed, totalScore: 0 });
          }),

        removePlayer: (id) =>
          apply((g) => {
            if (g.phase !== "setup") return;
            g.players = g.players.filter((p) => p.id !== id);
          }),

        setMaxRounds: (n) =>
          apply((g) => {
            if (g.phase !== "setup") return;
            g.maxRounds = Math.max(1, n);
          }),

        startGame: (maxRounds) => {
          const payload = maxRounds ? { maxRounds } : undefined;
          dispatch("startGame", payload, (g) => applyAction(g, "startGame", payload, rng));
        },

        setDart: (index, raw) =>
          set((store) => {
            if (store.mode === "online") {
              const next = [...store.myCurrentDarts];
              next[index] = raw;
              return { myCurrentDarts: next };
            }
            const g = structuredClone(store.game) as GameState;
            g.currentDarts[index] = raw;
            return { game: g };
          }),

        submitTurn: () =>
          dispatch("submitTurn", { darts: get().myCurrentDarts }, (g) =>
            applyAction(g, "submitTurn", { darts: g.currentDarts }, rng)
          ),

        chooseCard: (card) =>
          dispatch("chooseCard", { card }, (g) => applyAction(g, "chooseCard", { card }, rng)),

        setRewardSegment: (seg) =>
          dispatch("setRewardSegment", { segment: seg }, (g) =>
            applyAction(g, "setRewardSegment", { segment: seg }, rng)
          ),

        setRewardTarget: (id) =>
          dispatch("setRewardTarget", { targetId: id }, (g) =>
            applyAction(g, "setRewardTarget", { targetId: id }, rng)
          ),

        confirmPlacement: () =>
          dispatch("confirmPlacement", undefined, (g) => applyAction(g, "confirmPlacement", undefined, rng)),

        finishReward: () =>
          dispatch("finishReward", undefined, (g) => applyAction(g, "finishReward", undefined, rng)),

        setShowdownDart: (who, index, raw) =>
          dispatch("setShowdownDart", { who, index, raw }, (g) =>
            applyAction(g, "setShowdownDart", { who, index, raw }, rng)
          ),

        advanceShowdownThrower: () =>
          dispatch("advanceShowdownThrower", undefined, (g) =>
            applyAction(g, "advanceShowdownThrower", undefined, rng)
          ),

        resolveShowdown: () =>
          dispatch("resolveShowdown", undefined, (g) => applyAction(g, "resolveShowdown", undefined, rng)),

        finishShowdown: () =>
          dispatch("finishShowdown", undefined, (g) => applyAction(g, "finishShowdown", undefined, rng)),

        // Local mode: shift the shared queue (unchanged, single-viewer so
        // there's no "closes it for others" concern). Online mode: purely
        // local — never networked — so one device's fast "Continue" tap
        // can't yank an informational popup off someone else's screen while
        // they're still reading it. The shared assign-picker event doesn't
        // go through this at all; it resolves via assignDrink instead.
        dismissEvent: (eventId) => {
          if (get().mode === "online") {
            const id = eventId ?? get().game.pendingEvents.find((e) => !get().dismissedEventIds.includes(e.id))?.id;
            if (id) set((store) => ({ dismissedEventIds: [...store.dismissedEventIds, id] }));
            return;
          }
          apply((g) => applyAction(g, "dismissEvent", undefined, rng));
        },

        assignDrink: (eventId, drinkerId) =>
          dispatch("assignDrink", { eventId, drinkerId }, (g) =>
            applyAction(g, "assignDrink", { eventId, drinkerId }, rng)
          ),

        resetGame: () => {
          roomClient?.close();
          roomClient = null;
          clearRoom();
          set({
            game: emptyGameState(),
            mode: "local",
            myPlayerId: null,
            hostDeviceId: null,
            lobby: [],
            connectionStatus: "closed",
            myCurrentDarts: [],
            dismissedEventIds: [],
          });
        },

        newGameSamePlayers: () =>
          set((store) => {
            const names = store.game.players.map((p) => p.name);
            const fresh = emptyGameState();
            fresh.players = names.map((n) => ({ id: pid(), name: n, totalScore: 0 }));
            return { game: fresh };
          }),

        enterOnline: (roomCode, name) => {
          roomClient?.close();
          const deviceId = getDeviceId();
          const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:8787";
          set({
            mode: "online",
            game: emptyGameState(),
            myPlayerId: null,
            hostDeviceId: null,
            lobby: [],
            connectionStatus: "connecting",
            myCurrentDarts: [],
            dismissedEventIds: [],
          });

          let lastTurnKey = "";
          roomClient = connectRoom({
            host,
            roomCode,
            deviceId,
            onStatusChange: (status) => set({ connectionStatus: status }),
            onState: (msg: ServerMessage) => {
              if (msg.kind === "ERROR") {
                console.warn("Room error:", msg.message);
                return;
              }
              const myId = Object.entries(msg.seats).find(([, d]) => d === deviceId)?.[0] ?? null;
              const turnKey = `${msg.gameState.round}:${msg.gameState.currentPlayerIndex}`;
              const turnChanged = turnKey !== lastTurnKey;
              lastTurnKey = turnKey;
              set((store) => ({
                game: msg.gameState,
                myPlayerId: myId,
                hostDeviceId: msg.hostDeviceId,
                lobby: msg.lobby,
                myCurrentDarts: turnChanged
                  ? Array(msg.gameState.currentDarts.length).fill(null)
                  : store.myCurrentDarts,
              }));
            },
          });
          roomClient.send({ kind: "JOIN", deviceId, name });
        },

        leaveOnline: () => {
          if (roomClient) {
            roomClient.send({ kind: "LEAVE", deviceId: getDeviceId() });
            roomClient.close();
            roomClient = null;
          }
          clearRoom();
          set({
            mode: "local",
            game: emptyGameState(),
            myPlayerId: null,
            hostDeviceId: null,
            lobby: [],
            connectionStatus: "closed",
            myCurrentDarts: [],
            dismissedEventIds: [],
          });
        },

        restartOnline: () => {
          if (get().mode !== "online") return;
          roomClient?.send({ kind: "RESTART", deviceId: getDeviceId() });
        },
      };
    },
    {
      name: "darts-of-chaos",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ game: s.game }),
      version: 2,
      // Backfill fields added after a save was written so older in-progress
      // games rehydrate cleanly instead of crashing on undefined arrays.
      migrate: (persisted: any) => {
        const g = persisted?.game;
        if (g) {
          g.activeAfflictions ??= [];
          g.pendingAfflictions ??= [];
          g.roundScoreBonus ??= {};
          g.showdownsCompleted ??= {};
        }
        return persisted;
      },
    }
  )
);
