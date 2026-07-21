# 🎯 Darts of Chaos — Local MVP

Laptop-first, single-screen drinking dart game. One laptop runs everything; one
operator enters every player's darts; everyone watches the same screen. No
backend, no login, no multiplayer, no room codes. State persists to
`localStorage`.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Build / start:

```bash
npm run build && npm start
```

## How a game flows

1. **Setup** — add ≥2 players, start.
2. **Round (×10)** — operator enters 3 darts per player using dropdowns
   (`S/D/T` + number, or `OB/IB/MISS`), then submits each turn. Mines, golden
   tiles and zones can trigger on submit and pop an event modal.
3. **Round results** — highest round score wins; losers drink 1; last place
   drinks 2.
4. **Reward** — the winner picks one of three cards: **Mine**, **Zone Effect**,
   or **Chaos**. Mine/Zone need a segment (and optional target); Chaos is rolled
   randomly by the app.
5. Repeat until round 10, then **Game Over** with a rematch option.
6. **Nemesis Showdown** can interrupt at round end when a rivalry is intense.

## Architecture (logic lives outside React)

```
src/
  game/
    types.ts        # 1. all shared types
    phases.ts       # 2. phase state machine (documented)
    darts.ts        # dart parsing + scoring helpers
    nemesis.ts      # nemesis tracking + showdown selection + easter eggs
    engine.ts       # 4. core engine + documented effect-resolution order
    effects/        # 5. data-driven card pools
      registry.ts   #    definition interfaces + EffectAPI + registries
      mines.ts      #    Mine pool   (Landmine, Hangover, Butterfingers, Wrong-Hand)
      zones.ts      #    Zone pool   (targeted reward curses + Public Tiles, every round)
      chaos.ts      #    Chaos pool  (6 effects incl. Hidden Fortune)
      golden.ts     #    Golden pool (Crown Heist)
  store/
    gameStore.ts    # 3. Zustand store + actions + localStorage persistence
  components/       # dumb-ish React views; no game rules here
  app/              # Next.js app-router shell
```

**Phases:** `setup → roundActive → roundResults → reward (→ rewardPlacement) →
[showdown] → roundActive … → gameOver`.

**Effect resolution order** (documented in `engine.ts`):

- Per dart on submit: score → **Golden** → **Mine** → **Zone**.
- On round resolve: round-wide chaos (Triple Fever → round score; Bull Madness →
  total) → add round scores → winner/last → drinks (+ Happy Hour) → reveal &
  remove untriggered mines / expire zones → clear modifiers → nemesis → maybe
  showdown.
- During reward: immediate chaos resolves now; round-wide chaos arms the *next*
  round; Hidden Fortune spawns a golden tile (round ≥ 5, max one active);
  mine/zone are placed for the next round.

## Adding content (data-driven, no component edits)

Drop a new definition object into the matching pool file:

- **Mine** → `effects/mines.ts` (`MineDef`, implement `onTrigger`). Mines that
  punish the *next* round (fewer darts, off-hand) call `api.addAffliction`,
  which arms a one-round, per-player handicap (see `Affliction` in `types.ts`).
- **Zone** → `effects/zones.ts` (`ZoneDef`, `onTrigger`). `target: "chosen"`
  makes the effect land on the creator's chosen target on ANY hit (player reward
  curses); the default `"hitter"` affects whoever hits it. Flag `wild: true` to
  put it in the Public Tile pool (the app spawns ~5 on random open segments at
  the start of EVERY round; `firstHitOnly: true` makes a one-shot tile). Counts
  are tuned by `PUBLIC_TILES_MIN/MAX` in `engine.ts`.
- **Golden** → `effects/golden.ts` (`GoldenDef`, `onTrigger`).
- **Chaos** → `effects/chaos.ts` (`ChaosDef`; pick `kind`:
  `immediate` / `roundWide` / `spawnGolden` and provide the relevant hooks:
  `resolve`, `roundScoreBonus`, `totalScoreBonusOnResolve`, `drinkModifier`).

Each effect only ever talks to the game through `EffectAPI`
(`adjustScore`, `creditNemesis`, `addEvent`, `log`, `leaderId`, `rng`, …), which
keeps rules out of components and out of the store.

## MVP notes / simplifications

- Tie-breaking: round winner = first player with the max score; last place =
  a min-score player who isn't the winner. Good enough for a party MVP.
- No SVG dartboard yet — dart entry is dropdowns/buttons by design.
- Mine effect (`Landmine`) and zone effects are sensible defaults; the spec left
  their concrete numbers open, so they're easy to retune in the pool files.
- Nemesis Showdown intensity threshold and chance live in `nemesis.ts`.
