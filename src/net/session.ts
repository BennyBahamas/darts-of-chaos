// ============================================================================
// Client-only session bookkeeping in localStorage: "which device am I, which
// room was I in." Deliberately separate from the persisted Zustand store —
// this is connection identity, not GameState, so it never needs a store
// persist-version bump.
// ============================================================================

const DEVICE_ID_KEY = "darts-of-chaos:deviceId";
const SAVED_ROOM_KEY = "darts-of-chaos:savedRoom";

export interface SavedRoom {
  roomCode: string;
  name: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

let cachedDeviceId: string | null = null;

/** Stable per-browser identity, created once and reused across reloads/rejoins. */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const created = newId();
  localStorage.setItem(DEVICE_ID_KEY, created);
  cachedDeviceId = created;
  return created;
}

export function getSavedRoom(): SavedRoom | null {
  const raw = localStorage.getItem(SAVED_ROOM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedRoom;
  } catch {
    return null;
  }
}

export function saveRoom(room: SavedRoom): void {
  localStorage.setItem(SAVED_ROOM_KEY, JSON.stringify(room));
}

export function clearRoom(): void {
  localStorage.removeItem(SAVED_ROOM_KEY);
}

// Avoid ambiguous characters (O/0/I/1) — these get read aloud and typed on a
// phone keyboard by someone looking at someone else's screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 5): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
