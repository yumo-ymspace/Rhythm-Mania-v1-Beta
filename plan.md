# RhythmMania → osu!(lazer) mania alignment

**Status:** research + design plan (revised)
**Target client:** osu!(lazer) mania + **Argon** default skin, as in `ppy/osu` master (2026-08)
**Current app:** RhythmMania 0.9.3
**Execution rule:** one numbered task at a time; do not start the next task until the current one is implemented, tested, and (if visual) Playwright-checked against Argon references.

**Product shape:** an **offline osu!(lazer)-style mania client** in the browser. No Google login, no RhythmMania accounts, no PostgreSQL, no global/RM leaderboards. Scores live on this device (IndexedDB / local history), shown like lazer’s **Local** ranking. The only network features are **osu! API v2 search** and **archive download from catboy.best** (existing 404 fallback to osudl.org).

This document is (1) what lazer mania/Argon actually does, (2) what RhythmMania does, (3) every current divergence that **must be converted to lazer behaviour**, (4) the offline-client cut, (5) PENAR hooks, (6) renderer latency, (7) a strict serial task queue.

Mechanics claims are grounded in `ppy/osu` source and osu-wiki.

---

## 0. Product and legal constraints

osu!(lazer) is a trademarked product. `ppy/osu` is MIT-licensed. **Official artwork, the osu! logo, the pink-circle mark, “ppy”, Torus as a branded drop-in, and osu! beatmaps are not ours to ship.**

Stance:

- **Gameplay, scoring, mods, HUD layout, song select IA, results, pause/fail:** match lazer mania. No “intentional stable-mania” leftovers.
- **Visuals:** recreate Argon **very closely** (note shape, column colours, HUD wedges, health bar, hit-error bars, combo placement). Draw original geometry/CSS/canvas; do not copy `osu-resources` bitmaps or the osu! wordmark.
- **Brand text:** RhythmMania name stays. The live performance rating is **PENAR** (never labelled “pp”).
- **Fonts:** geometric sans with similar optical size to Torus (Outfit / Nunito Sans) unless Torus is separately licensed.
- **Beatmaps:** keep `.osu`/`.osz` import.

Out of scope:

- other rulesets, editor, multiplayer, storyboards, chat, wiki, medals, skin JSON editor
- **computing** a full osu! pp value (PENAR UI + data slots stubbed)
- Google OAuth, RhythmMania user accounts, profiles-as-a-service
- PostgreSQL and any score/user tables
- Global, country, or RM-hosted leaderboards
- Replay upload, server verification-for-ranking, catalog register/activate
- `/profile` as an online identity surface

In scope:

- All solo mania ruleset behaviour
- All solo session surfaces, Argon-close, **lazer-offline information architecture**
- Local ranking panel (this browser’s scores for the selected chart)
- osu! API v2 mania search + catboy.best (and 404→osudl.org) download
- Optional osu! token (authorization-code or BYO) in localStorage so search works
- PENAR HUD slot
- Playwright vs Argon stills

---

## Execution protocol (mandatory for implementing agents)

1. Work **only** the next `TASK-NNN` whose status is `pending`. Never batch two tasks in one session unless the user explicitly says to.
2. Read the task’s files, implement only that task, run its verification.
3. Mark it done in this plan (or the live todo list) only after verification evidence exists.
4. Stop and report. Do not “while I’m here” extra polish.
5. Visual tasks must use Playwright MCP: `browser_navigate` to the local app, exercise the flow, `browser_take_screenshot`, then compare against the Argon reference board in `docs/visual-refs/argon/` (see TASK-003).

---

## 0b. Former “intentional not lazer” items — now **must match lazer**

These were listed as keep-as-RM. They are **bugs relative to the new target**. Each has a task.

| Divergence today | Lazer behaviour | Task |
|---|---|---|
| Judgement names Marvelous/Perfect/Great/Good/Bad | Perfect/Great/Good/Ok/Meh | TASK-010 |
| Hold v2 50ms ticks + miss-run + repress | Head + ComboBreak body + 1.5× tail + Meh cap | TASK-020–022 |
| Mod multipliers HD 1.15 / DT 1.25 / HR 1.10 / EZ 0.80 / K 0.90 | Lazer mania multipliers (EZ/NF 0.50; most increase mods 1.00; read `ManiaMod*` at implement time) | TASK-030 |
| Missing FI, Cover, FL, SD, PF, NC, Mirror, CS, Invert, Hold Off, NR, DA, Classic, … | Full mania mod catalog | TASK-031+ |
| HP ±3/2/1/0.2/−3/−10 | `ManiaHealthProcessor` (no passive drain) | TASK-023 |
| DT/HT do **not** scale windows | Lazer mania **does** apply `SpeedMultiplier` so real-time windows stay constant (`IManiaRateAdjustmentMod`; UR issue #30828) | TASK-012 |
| Countdown “Get Ready” | Lazer lead-in + skip intro, no piper countdown | TASK-041 |
| Scroll speed changeable mid-map | Lock scroll during play | TASK-042 |
| HUD: corner toasts, cyan tech chrome | Argon wedges, top-left HP, top-right acc+PENAR, bottom combo, dual hit-error | TASK-050–054 |
| Playfield: glowing full-lane slabs | Argon note/hold/key/hit-target pieces | TASK-050 |
| Song select dashboard cards | Lazer carousel + wedge + Mods/Random/Options | TASK-060 |
| Results custom two-column | Argon-like grade hero | TASK-070 |
| Main menu dashboard | Lazer-like logo pulse + stacked actions | TASK-080 |
| 2K–9K only | 1K–10K | TASK-033 |
| Babylon as equal default | Canvas2D Argon is the reference; Babylon is optional extra skin | TASK-001 |
| No performance counter | Argon has a PP counter top-right; we ship the same slot as **PENAR** | TASK-054 |
| Google login, RM accounts, Postgres, global/RM leaderboards, replay upload | Lazer **offline**: local ranking only; search/download still online | TASK-005–009 |

---

## 0c. Offline client architecture (lazer-offline, not a social app)

osu!(lazer) without a login still lets you play imported maps and see **your** scores on song select. Online ranking, friends, and profiles are absent. That is the target.

### Keep (local)

- IndexedDB beatmaps/packages (`storageManager.ts`)
- `rhythm_mania_v1_play_history` as the only score store
- Local replays (watch/export/import). Imported replays stay local-only, as today
- Settings, skins, bindings, last-selected map, favorites
- Song-select **Local** list: history rows for the selected `beatmapHash` / chart id, sorted by score (then accuracy), like lazer’s local board. No “Global” / “Country” / “RM” tabs
- Results: this run vs that local list only

### Keep (network, no database)

osu! API v2 is not CORS-open to arbitrary browser origins. A **stateless proxy** may remain; it must not read or write Postgres.

| Endpoint | Role after cut |
|---|---|
| `GET /api/catalog/search` | Forward Bearer token to osu! API v2 mania search (ranked/loved/graveyard, 2K–10K). **No** `catalog_search_rate_limits` table |
| `GET /api/auth/osu/url` + callback / refresh / byo-token | Mint or refresh an osu! token. Tokens go to the opener/localStorage only. **No** `users`/`sessions` rows |
| `GET /api/config` | Version + `supportedMode: [3]` + flags (`accounts: false`, `leaderboards: local`) |
| `GET /api/health` | Process liveness; **do not** probe the database |

Browser download path stays: `https://catboy.best/d/<setId>`, retry `https://osudl.org/s/<setId>` only on HTTP 404. Unpack into IndexedDB. **Do not** call register-download / activate-download (those existed to put canonical charts in Postgres for ranked replays).

### Delete or stop calling

- Google sign-in (`LoginModal`, `App` session bootstrap, `/api/auth/google/*`, `/api/auth/me`, `/api/auth/logout`)
- All `/api/profile/*` and `/profile` routes
- All `/api/replays/upload|list|get`
- `/api/catalog/set`, `/chart`, `/register-download`, `/activate-download`
- `database/schema.sql` as a runtime dependency; `DATABASE_URL` / `POSTGRES_*` / `SESSION_SECRET` / `GOOGLE_CLIENT_*`
- CSRF cookie pair used for account mutations (nothing left to mutate on a session)
- Remote leaderboard fetch in `SongSelect.tsx` (`fetchLeaderboardReplays`)
- Server replay verification as a ranking gate (`api/_lib/replayVerification.ts` is unused once upload is gone; do not keep a dead ranked path)

### Player identity

No Google username. Optional **local display name** in settings (localStorage), default “Player”, for local ranking rows and results. osu! token is only a **catalog credential**, not an RM account.

### Why a tiny API can still exist

Search needs a server-side or CORS-free hop to `osu.ppy.sh/api/v2`. OAuth client-secret exchange cannot live in the browser. That is not a “database.” If even those functions are later removed, the only remaining path is BYO token plus a user-side CORS workaround — do not plan on that; keep the stateless proxy.

---

## 1. Research sources

Primary:

- [osu!mania judgement wiki](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania) and [raw wiki](https://raw.githubusercontent.com/ppy/osu-wiki/master/wiki/Gameplay/Judgement/osu!mania/en.md)
- [Lazer vs stable gameplay differences](https://osu.ppy.sh/wiki/en/Help_centre/Upgrading_to_lazer) (mania section: hold heads/tails judged separately, hold ticks removed, OD-scaled Perfect)
- [`ManiaHitWindows.cs`](https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs)
- [`ManiaScoreProcessor.cs`](https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs)
- [`ScoreProcessor.cs`](https://raw.githubusercontent.com/ppy/osu/master/osu.Game/Rulesets/Scoring/ScoreProcessor.cs)
- [`ManiaHealthProcessor.cs`](https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/Scoring/ManiaHealthProcessor.cs)
- Hold objects: `HoldNote.cs`, `DrawableHoldNote.cs`, `DrawableHoldNoteTail.cs`, `DrawableHoldNoteBody.cs`, `TailNote.RELEASE_WINDOW_LENIENCE = 1.5`
- Mods: `ManiaRuleset.GetModsFor`, `ManiaModEasy` / `ManiaModHardRock` / `ManiaModHidden`, `IManiaRateAdjustmentMod`, [lazer mod list wiki](https://raw.githubusercontent.com/ppy/osu-wiki/master/wiki/Gameplay/Game_modifier_(lazer)/en.md)
- Argon: [`ArgonSkin.cs`](https://raw.githubusercontent.com/ppy/osu/master/osu.Game/Skinning/ArgonSkin.cs), `ManiaArgonSkinTransformer.cs` (`ArgonNotePiece`, `ArgonHoldBodyPiece`, column colours)

Secondary: lazer-client captures (2025.60x-lazer Song Select V1/V2 issue-report screenshots, official lazer-updates video thumbnails, Argon gameplay still from the colour-proposal PR), the in-progress results-redesign Figma, and Playwright-captured Argon stills stored locally as comparison boards (TASK-003). The osu!(stable) wiki stills were removed from `docs/visual-refs/argon/` on 2026-09-05; the board is lazer-only.

---

## 2. What lazer mania actually is

### 2.1 Judgement names and accuracy weights

Lazer names (and the values that feed **accuracy**):

| Lazer name | Common nickname | Accuracy base | RM name today |
|---|---|---|---|
| Perfect | MAX / rainbow 300 | **305** | Marvelous |
| Great | 300 | 300 | Perfect |
| Good | 200 | 200 | Great |
| Ok | 100 | 100 | Good |
| Meh | 50 | 50 | Bad |
| Miss | 0 | 0 | Miss |

Default `ScoreProcessor.GetBaseScoreForResult` gives Perfect **300** (same as Great). **Mania overrides Perfect to 305.** That is why a full-Great run is ~98.36% and cannot be SS.

**Rename in UI** to Perfect / Great / Good / Ok / Meh. Keep internal enum aliases during migration if needed, but displayed names, colors, and results counts must match lazer.

### 2.2 Hit windows (lazer default, not Classic)

`ManiaHitWindows` interpolates OD with `DifficultyRange(min@OD0, mid@OD5, max@OD10)`, then `floor(value * totalMultiplier) + 0.5`.

Default (non-Classic) ranges:

| Result | OD 0 | OD 5 | OD 10 |
|---|---|---|---|
| Perfect | 22.4 | 19.4 | 13.9 |
| Great | 64 | 49 | 34 |
| Good | 97 | 82 | 67 |
| Ok | 127 | 112 | 97 |
| Meh | 151 | 136 | 121 |
| Miss | 188 | 173 | 158 |

`totalMultiplier = speedMultiplier / difficultyMultiplier`.

- EZ sets `DifficultyMultiplier = 1/1.4` → windows ~40% more lenient.
- HR sets `DifficultyMultiplier = 1.4` → windows tighter. **Mania HR is unranked in lazer** (`ManiaModHardRock.Ranked => false`).
- Classic + not ScoreV2 uses stable formulas (`16` Perfect, `64-3×OD` Great, convert tables, `floor(x)+0.5`).
- A hit is inside a window if `abs(error) ≤ window` (inclusive after the +0.5 snap).
- **Late Meh is impossible:** once past the late Ok window, the object misses. Early hits before the Miss window are ignored (notelock/too-early).
- Rate mods: **match lazer mania, not stable.** `IManiaRateAdjustmentMod` sets `ManiaHitWindows.SpeedMultiplier` to the clock rate so **song-time windows grow with DT / shrink with HT** and **real-time window duration stays the same**. Unstable Rate in lazer mania is therefore **not** rate-converted (osu#30828). RhythmMania currently leaves windows unscaled; TASK-012 fixes this. Classic mod later restores stable-style windows without speed compensation.

### 2.3 Notes vs hold notes (this is the biggest mechanical gap)

**Rice (normal notes):** one judgement from timing error.

**Holds in lazer (current, not Classic/ScoreV1):**

A `HoldNote` is a parent with `IgnoreJudgement`. Nested objects:

1. **HeadNote** — judged like a rice note on press.
2. **TailNote** — judged like a rice note on **release**, with `timeOffset /= 1.5` (`RELEASE_WINDOW_LENIENCE`).
3. **HoldNoteBody** — invisible. Max result `IgnoreHit`, min result `ComboBreak`. Early release (key up before the tail is hittable) applies ComboBreak: **combo resets, accuracy unchanged**.

Additional rules from `DrawableHoldNote` / `DrawableHoldNoteTail`:

- Head/tail each increment combo on hit, break combo on miss.
- If the head was missed **or** the body recorded a hold-break, the tail is **capped at Meh** even if the release is Perfect/Great.
- You cannot start a hold in the tail’s late-lenience window.
- Re-press after dropping the hold is allowed for the tail, but the body is already ComboBreak and the tail is Meh-capped.
- No periodic hold ticks. Wiki: *“hold notes only give combo for the start and the end”*; ticks were removed (PR #25062). Missing the body still combo-breaks immediately on let-go.
- Hold parent result is max if tail hit, miss if tail missed.
- Optional sliding sample while held (`PlaySlidingSamples`).

**Classic / stable ScoreV1 holds** (not the default lazer target): one combined judgement from head error + tail error with 1.2/2.4 style tables. Only needed if we ship a Classic mod.

### 2.4 Scoring

`ManiaScoreProcessor.ComputeTotalScore`:

```
150000 * comboProgress
+ 850000 * Accuracy^(2 + 2 * Accuracy) * accuracyProgress
+ bonusPortion
```

then `round(total * modMultiplier)`.

- Accuracy = sum(base scores) / sum(max bases), max base 305 per accuracy-affecting object.
- Combo portion: each hit adds `comboBase(result) * min(max(0.5, log4(comboAfter)), log4(400))`. Perfect’s **combo** base is 300, not 305.
- ComboBreak (hold body drop) is scorable for combo only: it resets combo and therefore future combo-portion, but does not change accuracy numerator/denominator.
- Bonus portion is normally 0 for mania rice/LN.
- Two display modes exist in lazer (standardised 1,000,000 cap vs classic quadratic). Default target: **standardised**.

### 2.5 Grades

Mania override: if the generic rank would be S **and** there are no Good/Ok/Meh/Miss, promote to SS (X), because a Great-only run is not 100% acc.

Cutoffs: SS = all Perfect/Great; S ≥ 95%; A ≥ 90%; B ≥ 80%; C ≥ 70%; else D; F on fail.

Hidden/Flashlight do **not** produce silver SH/XH in mania the way standard does (mania HD multiplier is 1.00x).

### 2.6 HP / fail

Lazer mania **does not passively drain**. `ManiaHealthProcessor.ComputeDrainRate()` returns 0 after computing recovery multipliers (legacy quirk).

Health is 0..1. Increases from `ManiaHealthProcessor.GetHealthIncreaseFor` (stable-like numbers):

| Result | Increase |
|---|---|
| Miss (head/tail) | `-(HP+1)*0.00375` |
| Miss (other) | `-(HP+1)*0.0075` |
| Meh | `-(HP+1)*0.0016` |
| Ok | `0` |
| Good | `(0.004 - HP*0.0004) * HpMultiplierNormal` |
| Great | `(0.005 - HP*0.0005) * HpMultiplierNormal` |
| Perfect | `(0.0055 - HP*0.0005) * HpMultiplierNormal` |

Fail when health hits 0. EZ: extra lives (lazer Easy = 2 extra lives, instant refill, HP drain halved via difficulty). NF: never fail. SD: fail on combo break. PF: fail on anything below Great (mania “Perfect” mod has a setting for requiring rainbow Perfects).

RhythmMania today uses crude `hpDelta` of +3/+2/+1/+0.2/−3/−10 times a drain multiplier. That is **not** lazer.

### 2.7 Mods (mania-capable in lazer)

Categories from `ManiaRuleset` + wiki:

**Difficulty reduction:** Easy (0.50x, windows ×1.4, HP easier, extra lives), No Fail (0.50x), Half Time (rate 0.75, customisable), Daycore (HT + pitch down).

**Difficulty increase:** Hard Rock (windows ×1/1.4, **unranked**), Sudden Death, Perfect, Double Time (1.5x, customisable rate), Nightcore (DT + pitch + ticks), Fade In, Hidden (coverage grows with combo 160→400px on 768 reference, against scroll), Cover (player-set cover), Flashlight (near judgement line), Accuracy Challenge.

**Automation:** Autoplay, Cinema.

**Conversion:** Difficulty Adjust, Classic, Random (shuffle columns), Dual Stages (split playfield / co-op layout), Mirror, Invert (rice↔LN), Constant Speed (ignore SV), Hold Off (LN→rice), Key 1K–10K.

**Fun (mania):** Wind Up/Down, Muted, Adaptive Speed.

**System:** Score V2 (lazer scoring *is* this system).

**No Release:** mania-only reduction — tails auto-complete without a timed release.

Lazer mania **score multipliers for DT/HR/HD are 1.00x** on stable’s old table; difficulty-increase mods generally do not inflate mania score. RhythmMania currently uses HD 1.15, DT 1.25, HR 1.10, EZ 0.80, K-mods 0.90. That must change for lazer parity.

### 2.8 Playfield and HUD (Argon / default lazer)

Not a pixel spec from wiki; this is the information architecture every lazer mania screenshot shares:

**Playfield**

- Centered stage, equal-width columns, thin separators.
- Notes are short colored bodies (Argon: slightly tapered / stadium), not full-lane glowing slabs.
- 4K color convention: outer columns one hue, inner columns another (special column for odd key modes).
- Holds: head, tiled/stretched body, distinct tail cap; body is **consumed** (masked) as it passes the receptor while held.
- Receptor: hit target line/bar at the near edge; pressed columns light up.
- Scroll down by default; upscroll is a setting (lazer supports both). Extreme SV is clamped.
- Optional key overlay (which keys are down).
- Stage left or right: **vertical HP bar**.
- Breaks: playfield can dim; HD cover retracts during breaks.

**HUD (default, skinnable in lazer)**

- Score, large, top-right
- Accuracy + percent, under score
- Combo, large, **center of stage** (not a corner toast)
- Judgement sprite at receptor (Perfect/Great/… with combo-colored pops)
- Hit error bar, bottom center (early left / late right, colored by window)
- Song progress bar (top or bottom)
- Unstable rate / pp counters exist as optional HUD pieces — not required for v1
- Pause: overlay with Continue / Retry / Exit, beatmap title, mods
- Fail: similar overlay, Retry / Exit
- Skip intro: button when lead-in > ~5s (lazer uses skippable intro before first object)
- Countdown “Are you ready?” / piper-style is **not** lazer; lazer uses a short lead-in with skip

**Song select (lazer Song Select V2; see `docs/visual-refs/argon/song-select/`)**

- Full-bleed beatmap background (light blur, not a dark dashboard)
- Top-left **wedge**: set title/artist, mapper, stat pills. For mania: Notes, Hold Notes, Key Count, Approach Rate, Accuracy/OD, HP Drain (not stable's Circles/Sliders/Spinners/CS block)
- **Details / Ranking tabs** with a Scope selector (we keep **Local** scope only)
- Top filter bar: search, star-rating range, Sort / Group / Collection dropdowns
- Right **carousel** of sets; selected set expands to per-difficulty pills with star ratings
- Leaderboard panel with score, max combo, accuracy, grade per row; empty state when the chart has no plays
- Footer: **Back / Mods / Random / Options** (plus the osu! cookie start button, which we restyle without the trademark)
- Mod overlay: category columns, hexagonal (or rounded hex) mod buttons, multiplier, incompatibility, per-mod settings (DT rate, FL size, DA sliders, Cover height)
- Preview audio with dim; scroll-speed adjustable from select (lazer **forbids changing scroll speed mid-map**)

**Results (shipped lazer client; redesign in progress — see `docs/visual-refs/argon/results/`)**

- Grade display as the hero (SS/S/A/…; the official Figma redesign moves to a grade ring)
- Score, accuracy to 2 decimals, max combo
- Judgement column (**Perfect → Great → Good → Ok → Meh → Miss**, never stable MAX/300/200) with counts
- Hit error histogram + UR
- Mods
- Beatmap card
- Retry / Replay / Back (bottom action bar)
- Score context panel (we show **local** scores only; lazer shows leaderboard scope rows)
- No stable Default ranking-panel art; the results slot currently links lazer results videos + the redesign Figma until a lazer `F12` still is captured

**Main menu**

- Beat-synced logo
- Play / Edit / Browse / Settings / Exit style radial or stacked buttons
- Triangle/particle ambience
- Now-playing + user chip
- We keep RhythmMania destinations (Play, History, Skins, Profile, Settings) but restyle into this language

**Settings**

- Left category rail, search, immediate apply
- Sections map onto lazer: Gameplay (scroll, background dim, HUD), Audio (offset, volumes), Input (bindings per key mode), Graphics, Skin, Debug

### 2.9 Input and feel

- Per-column bindings, 1K–10K (RM is 2K–9K today).
- Empty-lane presses do **not** miss or break combo.
- Column notelock: you cannot hit a later object in the same column before the earlier one is judged.
- Scroll speed: user setting, BPM-scaled **or** fixed (Constant Speed is a mod; a setting “scale scroll with BPM” exists on stable and as CS mod on lazer).
- Visual offset vs audio offset: visual moves notes, judgement stays on audio clock (RM already does this).
- Replay: timestamped lane bitfields are enough for mania; seeking must not combo-break (lazer fixed this).

---

## 3. What RhythmMania already has (do not rewrite blindly)

Already close to lazer:

| Area | Current behaviour | Verdict |
|---|---|---|
| Window interpolation | `DifficultyRange` 22.4/19.4/13.9 … 188/173/158, `floor+0.5` | Keep |
| EZ/HR window scale | 1/1.4 and 1.4 | Keep |
| Accuracy weights | 305/300/200/100/50 | Keep |
| Score formula | 150k combo + 850k acc^(2+2acc) | Keep |
| Combo log | log4, cap 400, Perfect combo base 300 | Keep |
| Grade SS on Great+Perfect only | `computeGrade` | Keep, rename SS display to match lazer X/SS |
| Holds as 2 judgements | `countMapJudgements` hold = 2 | Keep the *count*, change the *body* |
| Replay frames | boolean lanes | Keep |
| Catalog search + catboy download | existing client + search proxy | Keep search/download; drop Google, register/activate, DB |
| Canvas2D + Babylon | both | Keep Canvas as default; Babylon is extra, not lazer |
| DT/HT audio rates | 1.5 / 0.75 | Keep; add Nightcore pitch later |

Everything else in the old “intentionally not lazer” table is **in scope to fix**. See **§0b**. Do not preserve those behaviours for new plays.

---

## 4. Design principles for the rebuild

1. **One ruleset module.** Extract judgement, score, HP, and hold state out of `GameplayCanvas.tsx` into `src/ruleset/mania/` so Canvas, replay sim, and `api/_lib/replayVerification.ts` call the same functions.
2. **Lazer is the spec; tests are the contract.** Port numeric tables from `ppy/osu` into Vitest fixtures.
3. **Argon is the visual spec.** Recreate layout, colour, and motion from `ArgonSkin` + `ManiaArgonSkinTransformer`. Playwright against reference stills is the acceptance test for UI tasks.
4. **One task at a time.** See Execution protocol.
5. **Compatibility flag for old replays.** `rulesetVersion: 3` for new plays. Verifier still understands hold-tick v2 rows.
6. **Canvas2D Argon is the reference renderer.** Babylon is an extra skin, not the design source of truth.
7. **PENAR is a first-class HUD field with a stub calculator.** Never call it pp in UI, API copy, or settings.
8. **Settings still sanitize.** New mods, 1K–10K, scroll lock, PENAR toggle go through `GameSettings` + `sanitizeSettings` + registry + consumers together.

---

## 4b. PENAR (Performance Evaluation & Numerical Achievement Rating)

Lazer’s Argon HUD has `ArgonPerformancePointsCounter` under accuracy (top-right, ~0.8 scale). RhythmMania ships the **same slot** with a different name.

**Do in the HUD/types work (TASK-054), not as a secret later patch:**

```ts
export interface PenarBreakdown {
  total: number | null;       // null = not yet computed
  version: string;            // e.g. 'penar-stub-0'
  starRating: number | null;
  accuracy: number;
  maxCombo: number;
  missCount: number;
  mods: string[];
}

export interface ScoreState {
  // existing fields...
  penar: PenarBreakdown | null;
}
```

- HUD: Argon-style counter, label **PENAR** (or a short “PENAR” with tooltip “Performance Evaluation & Numerical Achievement Rating”).
- Results + history + replay detail: same field, `—` while stubbed.
- Settings: “Show PENAR during play” toggle (default on, matching Argon PP visibility).
- `src/utils/penar.ts`: `computePenar(input): PenarBreakdown` returns `{ total: null, version: 'penar-stub-0', ... }` until a later dedicated task ports a mania difficulty formula. **Do not invent osu pp numbers.**
- API/replay JSON: optional `penar` object; server may ignore until computed.
- Leave call sites in the score apply path (`applyJudgement` / result finalize) so filling the formula is a single-file change.

---

## 4c. Low-latency rendering (thought, then a concrete default)

Rhythm games lose to input-to-audio and input-to-photon delay, not to “prettier 3D.”

**Keep, and tighten, the current architecture:**

| Layer | Choice | Why |
|---|---|---|
| Clock | Web Audio `AudioContext.currentTime` (already `AudioEngine`) | Judgement must not use `performance.now()` alone |
| Loop | `requestAnimationFrame` | vsync; do not use `setInterval` |
| Playfield | **Canvas2D** with `{ alpha: false, desynchronized: true }` | Chromium can skip compositor; lowest-effort latency win |
| HUD | DOM overlay, `pointer-events: none` | Argon typography is easier in CSS; do not redraw score every frame on the playfield canvas if it causes layout |
| Input | `keydown`/`keyup` on window, no React synthetic for play keys | Already mostly true; keep bindings off the React render path |
| Audio | `latencyHint: 'interactive'`; expose `baseLatency+outputLatency` into offset wizard | Matches felt sync |
| DPR | cap or `limitDprToOne` path remains; do not fill 4K×DPR 3 if it tanks frame time | |

**Do not add PixiJS / Three.js / a second scene graph for 2D Argon.** Extra frameworks fight Babylon, increase bundle, and do not fix Web Audio output latency.

**Optional later (own tasks, after Argon Canvas is correct):**

- WebGL2 instanced quads for notes if Canvas2D profiling shows >8ms paint on 20k-note maps (the import cap).
- `OffscreenCanvas` worker for raster only if main-thread hit-testing stays on the audio clock (workers cannot see key events without a copy).

Babylon stays a **skin**, dynamically imported, not the low-latency path.

---

## 5. Argon visual system (recreate closely)

Source of truth for layout: `ArgonSkin.GetDrawableComponent` (`MainHUDComponents`) and `ManiaArgonSkinTransformer`.

### 5.1 HUD layout (Argon)

From `ArgonSkin.cs` (global HUD):

- **Health:** top-left, `ArgonHealthDisplay`, width ~300, bar height 30, position ~(50, 20). Short horizontal accent line beside it.
- **Wedges:** two stacked `ArgonWedgePiece` (~380×72) behind score (slight 4,5 offset on the second).
- **Score:** `ArgonScoreCounter`, no “Score” label, sitting on the wedges (origin top-right relative to wedge).
- **Accuracy:** top-right ~(−20, 20).
- **PENAR:** directly under accuracy (`accuracy.Y + accuracy.DrawHeight + 10`), scale ~0.8. Lazer uses PP here.
- **Song progress:** bottom, scale X 0.9.
- **Key counter:** bottom-right, above progress.
- **Ruleset extras:** combo bottom-left (scale 1.3); **two** `BarHitErrorMeter`s, centre-left and centre-right (right one X-flipped).

Mania judgement piece: ~25px type, ~180px above receptor (`DefaultManiaJudgementPiece`).

Remove the current top-left Home/Fullscreen/Pause cluster from the playfield; pause is Esc + overlay.

### 5.2 Playfield (Argon mania)

Column colours from `ManiaArgonSkinTransformer` (recreate, do not copy sprites):

- Special column: `rgb(169, 106, 255)`
- Yellow `255,197,40` · Orange `252,109,1` · Pink `213,35,90` · Purple `203,60,236` · Cyan `72,198,255` · Green `100,192,92`

4K mapping follows lazer’s 1/2/2/1 note-type plus Argon’s colour table (implement by reading the transformer’s `getColourFor` / column index at TASK-050). Special column on odd key counts.

Notes: Argon note piece (short rounded body with a bright top edge / slight 3D lip — **not** full-lane neon slabs). Holds: distinct head, body, **darkened tail** (PR #22402). Body masks as it passes the receptor while held. Hit target: Argon receptor bar. Key area: press lighting under notes.

HD coverage: `min(400, 160 + 0.5*combo) / 768` of the 768-reference stage, against scroll; retract on breaks.

Default `skinId`: `argon`. Keep `rhythmmania`, `rhythmplus`, `circle`, `rhythmmania-3d` as legacy.

### 5.3 Tokens

- Surface near-black; stage dimmed cover.
- Product accent for **menu chrome only** (RhythmMania identity). Playfield uses Argon column/judgement colours.
- Tabular nums for score/acc/PENAR.
- Motion: judgement scale-in, combo bump, overlay 200ms. `prefers-reduced-motion` respected.

### 5.4 Playwright vs Argon photos

Store **fair-use reference stills of the lazer client** (2025.60x-lazer issue-report captures, official lazer-updates video thumbnails, Argon gameplay stills from `ppy/osu` PRs) in `docs/visual-refs/argon/` with a README: source URL, client version/date, what to compare (HUD corners, note shape, 4K colours, V2 wedge/carousel/footer, results grade). Stable-client stills were purged from the board on 2026-09-05 and must not be re-added. Do not ship those files in the production bundle.

Each visual task:

1. `npm run dev`
2. Playwright `browser_navigate` `http://localhost:3000/...`
3. Exercise the user path
4. `browser_take_screenshot` desktop 1280×720 and mobile 390×844
5. Side-by-side vs the matching ref: positions, hierarchy, colour family, spacing. Pixel-perfect vs osu.exe is not required; **wrong HUD corner or slab-notes fail the task**.

### 5.5 Song select / results / menu / settings

Match lazer Argon **structure** (Playwright vs refs):

- **Song select:** lazer V2 — full-bleed cover (light blur), top-left wedge with mania stats (Notes / Hold Notes / Key Count / AR / OD / HP), Details / Ranking tabs, top filter bar, right carousel of sets → difficulty pills with stars, **Local ranking only** (this device’s scores), footer **Back / Mods / Random / Options**, hexagonal category mod overlay. No Global/RM board, no stable footer chrome.
- **Results:** grade hero, score, acc, combo, mods, Perfect→Miss column, hit-error, PENAR, Retry / Replay / Back.
- **Menu:** beat-pulse RhythmMania wordmark, Play primary, History/Skins/Profile secondary, settings gear, quiet resource links.
- **Settings:** keep `settingsRegistry.tsx`; left rail; add scroll lock, HUD/PENAR toggles, 1K–10K binds.

---

## 6. Mechanical change list (executable)

### 6.1 New module layout

```
src/ruleset/mania/
  hitWindows.ts          // port ManiaHitWindows
  scoreProcessor.ts      // port ManiaScoreProcessor (move from scoreCalculator.ts)
  healthProcessor.ts     // port ManiaHealthProcessor
  holdNote.ts            // head / body ComboBreak / tail 1.5× / Meh cap
  judgements.ts          // names, colors, mapping
  mods/
    catalog.ts           // ids, incompat, multipliers, apply()
    hidden.ts fadeIn.ts cover.ts flashlight.ts ...
  grades.ts
```

`GameplayCanvas` becomes a session runner: clock, input, renderer frame, calls ruleset.

There is **no ranked upload path**. Hold/score tests live in Vitest against the same `src/ruleset/mania/` module. Delete or leave unreferenced `api/_lib/replayVerification.ts` after TASK-008 (do not keep a second scoring engine “for later leaderboards”).

### 6.2 Hold rewrite (replace v2 ticks for new plays)

State machine per hold:

```
idle → holding (head judged)
     → broken (early release → ComboBreak, combo=0)
     → tailJudged (release in 1.5× windows, cap Meh if broken or head miss)
     → complete
```

- Head uses normal windows.
- Tail uses `error / 1.5` against the same windows.
- Late tail after Ok window → Miss.
- Body does not emit Marvelous…Miss. It emits ComboBreak or IgnoreHit.
- ComboBreak must not increment `missCount` used for accuracy. Add `comboBreakCount` if we want stats; do not show it as a Miss in the results column unless we add a separate line.
- Remove `initializeHoldTailTicks` from the live path for `rulesetVersion >= 3`.
- Old **local** history rows may still carry v2 tick metadata; local replay watch can keep a v2 simulator. There is no server verifier.

This is the highest-risk change: live play, local replay sim, tests, and history records.

### 6.3 HP rewrite

Port `GetHealthIncreaseFor` with HP 0–10 and health 0–1 (display as bar). EZ extra lives: 2 refills. Fail overlay instead of instantly dumping to results (optional short delay like lazer).

### 6.4 Mod system rewrite

Replace tile list in `SongSelect.tsx` with a real catalog:

- Incompatibility matrix (EZ×HR, HT×DT×NC×DC, HD×FI×Cover, SD×NF, etc.).
- Per-mod settings: DT rate 1.01–2.0, HT 0.5–0.99, Cover height, DA OD/HP, FL combo scaling.
- Multipliers: EZ 0.5, NF 0.5, others 1.0 unless lazer source says otherwise; K-mods only when converting key count (lazer added convert key-mod penalties — follow current `ManiaModKey*` source at implement time).
- Apply functions: rate, windows, column remap, SV ignore, invert, hold-off, hidden coverage.

Priority is the serial TASK-030…037 list — one cluster per session, not a parallel dump. Dual Stages is TASK-092.

### 6.5 Naming migration

| Internal (can keep) | Display |
|---|---|
| marvelous | Perfect |
| perfect | Great |
| great | Good |
| good | Ok |
| bad | Meh |
| miss | Miss |

Update results, HUD, settings copy, replay export labels. Do not rename stored JSON fields in one step; map at read/write.

### 6.6 Scroll speed

- Lock changes while `isPlaying`.
- Song select: F3/F4 or Ctrl+/− style control plus slider.
- Document mapping from RM’s 5–80 to a displayed “time to receptor” ms so players from lazer can match feel. Implementation: compute `travelMs` from stage height and speed constant; expose both.
- DT/HT **do** apply `SpeedMultiplier` (TASK-012); do not leave windows unscaled.

### 6.7 Backend cut (no database)

- Strip `pg`, `DATABASE_URL`, Google env, session cookies.
- `vercel.json` rewrites: only config, health, osu auth, catalog **search**.
- Local history `rulesetVersion` is a **client** field on play records, not a SQL column.
- Do not migrate or rescore a remote leaderboard — it will not exist.

---

## 7. Gap-driven UI change list

| Screen | File(s) | Change |
|---|---|---|
| Playfield | `Canvas2DRenderer.ts`, `playfieldLayout.ts`, `noteVisibility.ts`, `skinTheme.ts` | Argon-like notes, hold masking, HD/FI/Cover/FL |
| HUD | `GameplayCanvas.tsx` (extract) | Score/acc/combo/HP/progress/hit-error layout |
| Pause/fail | new overlay components | Lazer-style dim + actions |
| Song select | `SongSelect.tsx` | Carousel, wedge, bottom bar, overlay mods, **local ranking panel** |
| Catalog | `OnlineBeatmapCatalog.tsx` | Search + catboy download only; Argon tokens |
| Results | `ResultsScreen.tsx` | Grade-hero; local score list, no remote |
| Menu | `MainMenu.tsx` | Logo pulse; **no Google sign-in** |
| Settings | `settings/*` | Visual pass; local display name; osu! token / BYO |
| Skins | `SkinScreen.tsx` | Argon default + legacy |
| History | `PersonalHistoryScreen.tsx` | Local only |
| Profile | `ProfileScreen.tsx` etc. | **Remove routes** (TASK-007) |

Mobile: lazer is tablet-friendly; we keep full-width touch lanes (already equal width) and a simplified carousel (vertical list is OK below `md`).

---

## 8. Testing and verification

### 8.1 Vitest (must expand)

- Windows at OD 0, 5, 8, 10, EZ, HR — match `floor(range)+0.5`
- DT 1.5 / HT 0.75 `SpeedMultiplier` (song-time window × rate)
- PENAR stub returns `total: null` and never emits a `"pp"` label
- Accuracy of mixed judgements
- Score of N Perfects (FC) = 1_000_000 * modMult
- Great-only FC grade = SS, accuracy ≈ 300/305
- Hold: head Perfect + tail Perfect = 2 Perfects, combo +2
- Hold: early release → ComboBreak, combo 0, tail later Perfect → stored as Meh, accuracy uses Meh
- Tail window 1.5×: a 20ms late release at OD5 Perfect window
- HP: no passive drain over 60s of idle objects; Miss drops by formula
- Local replay sim: v2 tick records still watchable; v3 ComboBreak records watchable
- No API replay-upload tests (that surface is removed)

### 8.2 Browser + Argon stills (required for every UI task)

1. Start `npm run dev` (port 3000 unless Vite prints another).
2. Playwright MCP: `browser_navigate`, then **click/type** the path a player would use. A single render screenshot is not enough.
3. `browser_resize` 1280×720 and 390×844; screenshot both.
4. Open the matching file under `docs/visual-refs/argon/` and compare HUD corners, note silhouettes, judgement names, mod overlay columns, results grade.
5. If layout is wrong, fix in the **same task**, then re-screenshot.

### 8.3 Commands after TypeScript changes

`npm run lint` and `npm test`; `npm run build` when Vite/CSS/chunks change.

---

## 9. Key decisions (revised)

1. Mechanical target = **current lazer mania**, not stable ScoreV1. Classic is a later mod.
2. New holds = head + ComboBreak body + 1.5× tail. v2 ticks only for old replays.
3. Recreate Argon **closely**; no osu! trademarks or resource bitmaps.
4. Shared ruleset module for client, tests, verifier.
5. Mod multipliers follow lazer mania.
6. Canvas2D + `desynchronized` is the low-latency reference; Babylon is extra.
7. **PENAR** occupies the Argon PP slot; formula stubbed (`total: null`) until a later PENAR-formula task.
8. Judgement names = Perfect/Great/Good/Ok/Meh.
9. **DT/HT scale song-time windows via SpeedMultiplier** (lazer mania). UR is not rate-converted.
10. **Offline client:** no Google, no Postgres, no RM/global leaderboards. Song select shows **local** scores only.
11. Catalog = osu! API v2 search (stateless proxy) + catboy.best download. No catalog activation/canonical DB.
12. Agents execute **one TASK-NNN at a time**.

---

## 10. Risks

- Scope is months; the serial task list is how we stay mergeable.
- Canvas vs osu!framework clocks will not be bit-identical.
- LN “repair via ticks” goes away for new plays.
- Hidden coverage is specified in 768px space.
- Dual Stages needs two input maps; skip until 2P exists.
- PENAR stub must look intentional (`—`), not like a broken pp port.
- osu! API v2 from the browser needs the remaining search proxy; removing **all** `/api` would break listing unless CORS changes.

---

## 11. Serial task queue

**Implementing agents: do exactly one task, then stop.**

Status starts as pending. Dependencies must be completed first.

### Foundation

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-001** | Declare Canvas2D Argon as reference renderer; Babylon remains optional skin; add `skinId: 'argon'` to types/defaults without drawing Argon yet **(done)** | `types.ts`, `defaultSettings.ts`, `SkinScreen.tsx` (list entry only) | `npm run lint`; settings still load |
| **TASK-002** | Extract `src/ruleset/mania/` and move existing window/score helpers unchanged **(done)** | `scoreCalculator.ts` → `scoreProcessor.ts`, `judgementTiming.ts`, new folder | tests still pass (behaviour freeze) |
| **TASK-003** | Create `docs/visual-refs/argon/README.md` + slot files (hud, playfield-4k, song-select, results, pause). Download/save public **lazer-client** screenshots with source URLs + client versions. **Do not import into `public/`.** Refreshed 2026-09-05: purged all stable wiki stills; song-select is lazer V1/V2 captures, playfield has a lazer gameplay still, results links lazer videos + redesign Figma pending an `F12` still. **(done)** | `docs/visual-refs/argon/*` | README lists each ref and comparison checklist |
| **TASK-004** | Canvas2D context: `{ alpha: false, desynchronized: true }` with feature-detect fallback; `AudioContext({ latencyHint: 'interactive' })` if not already **(done)** | `Canvas2DRenderer.ts`, `AudioEngine.ts` | play one map; no visual regression; lint |

### Offline cut (do before restyling song select)

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-005** | Remove Google sign-in UI and client session (`LoginModal`, `App` auth bootstrap, `/profile` nav). Optional local display name in settings. **(done)** | `App.tsx`, `MainMenu.tsx`, `LoginModal.tsx`, settings | Playwright: menu has no Sign in; play still works offline |
| **TASK-006** | Song select: delete `fetchLeaderboardReplays` / remote board. Render **Local** scores from `playHistory` for the selected chart only (score desc). No Global/RM tabs. **(done)** | `SongSelect.tsx` | Playwright: local rows only; empty state when no plays |
| **TASK-007** | Remove profile screens and routes (`/profile`, edit, search). History stays as local plays. **(done)** | `App.tsx`, `ProfileScreen.tsx`, `EditProfileScreen.tsx` | unknown `/profile/...` falls back to menu; lint |
| **TASK-008** | Stop calling replay upload/list/get. Remove upload eligibility chrome. Keep local export/import. Delete or unhook `api/replays*`, `replayClient.ts` network, `replayVerification.ts`. **(done)** | replay client, Results, History, `api/replays*` | Playwright: results has no Upload; export still works |
| **TASK-009** | Catalog: search proxy + catboy/osudl download only. Remove register-download, activate-download, set/chart APIs, Google-gated download. Gut Postgres from health/config. Drop unused routers. **(done)** | `OnlineBeatmapCatalog.tsx`, `api/catalog*`, `api/auth/google*`, `api/profile*`, `health.ts`, `config.ts` | search still lists mania sets with osu token; download unpacks locally; health does not mention database |

### Windows, names, rate

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-010** | Display names Perfect/Great/Good/Ok/Meh everywhere (HUD, results, history). Keep JSON field names mapped. **(done)** | Gameplay, Results, History | Playwright results + HUD vs Argon judgement labels |
| **TASK-011** | Vitest fixtures for OD 0/5/8/10 windows matching `floor(range)+0.5` **(done)** | `tests/` | `npm test` |
| **TASK-012** | Apply lazer `SpeedMultiplier` for DT/HT/NC (song-time windows × rate). UR not divided by rate. **(done)** | `hitWindows.ts`, gameplay, verifier | tests at 1.5× and 0.75×; one DT play |

### Holds + HP

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-020** | Implement hold head + 1.5× tail + Meh cap in ruleset module with tests only (not wired to canvas yet) **(done)** | `holdNote.ts`, tests | `npm test` |
| **TASK-021** | Wire live `GameplayCanvas` to TASK-020; disable ticks on `rulesetVersion` 3 **(done)** | `GameplayCanvas.tsx` | browser: LN drop combo-breaks, no tick misses; Playwright play |
| **TASK-022** | Local replay simulation: v2 tick records still watch; v3 ComboBreak watches **(done)** | replay sim, tests | watch one old and one new local replay |
| **TASK-023** | Port `ManiaHealthProcessor`; fail at 0; EZ extra lives; NF **(done)** | `healthProcessor.ts`, gameplay | tests + fail/NF Playwright |

### Mods (one cluster per task)

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-030** | Fix multipliers (EZ/NF 0.50, others per current `ManiaMod*` source); overlay shows live product **(done)** | `modifiers.ts`, SongSelect tiles | unit tests; select UI |
| **TASK-031** | Hidden + Fade In + Cover (coverage math, breaks retract) **(done)** | playfield, mods | Playwright HD/FI vs Argon HD look |
| **TASK-032** | Flashlight vignette **(done)** | playfield | Playwright |
| **TASK-033** | Key 1K–10K bindings + conversion; K-mod exclusivity **(done)** | settings, `keyCounts.ts` | lint + bind 4K/7K/10K |
| **TASK-034** | SD, PF, NC (pitch already from rate; NC ticks optional stub) **(done)** | mods, audio | Playwright fail-on-miss; NC rate |
| **TASK-035** | Mirror, Constant Speed, Invert, Hold Off, No Release **(done)** | mods, parser/gameplay | tests per mod |
| **TASK-036** | Difficulty Adjust + Classic (stable windows, no speed compensation) **(done)** | mods | tests |
| **TASK-037** | Random columns, remaining fun/system (Wind Up/Down, Adaptive Speed, Muted, Cinema, AC) **(done)** | mods | smoke; skip Dual Stages |

### Session chrome

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-041** | Remove “Get Ready” countdown; lazer-style lead-in + skip intro **(done)** | `GameplayCanvas.tsx`, `introSkip.ts` | Playwright skip button |
| **TASK-042** | Lock scroll speed during play; F3/F4 or Ctrl± on song select **(done)** | settings, SongSelect, GameplayCanvas | cannot change mid-map |
| **TASK-043** | Pause overlay (Continue / Retry / Exit) Argon-like **(done)** | new overlay | Playwright pause vs ref |
| **TASK-044** | Fail overlay (same pause container without Continue) **(done)** | `PauseOverlay` fail mode | Playwright vs pause refs |

### Argon playfield + HUD (do in this order)

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-050** | Argon notes/holds/receptors/column colours on Canvas2D; default `skinId: 'argon'` **(done)** | `Canvas2DRenderer.ts`, `skinTheme.ts`, `laneLayout.ts` | Playwright vs `playfield-4k` ref |
| **TASK-051** | Hold body masking while held **(done)** | renderer + note state | Playwright LN hold |
| **TASK-052** | Argon HUD: wedges, health top-left, score on wedges **(done)** | `ManiaHud` | Playwright vs `hud` ref |
| **TASK-053** | Accuracy top-right, dual hit-error bars, combo bottom-left, progress, key counter **(done)** | `ManiaHud` | Playwright vs `hud` ref |
| **TASK-054** | PENAR slot under accuracy; stub `computePenar`; settings toggle; results/history `—` **(done)** | `penar.ts`, HUD, Results, types | Playwright: label is PENAR not PP |

### Menus

| ID | Task | Touches | Verify |
|---|---|---|---|
| **TASK-060** | Song select carousel + wedge + bottom Mods/Random/Options + **local ranking panel** (no global). Wedge uses lazer V2 mania stats (Notes / Hold Notes / Key Count / AR / Accuracy / HP Drain) + Details/Ranking tabs + Local scope. **(done)** | `SongSelect.tsx` | Playwright vs `song-select` ref |
| **TASK-061** | Mod overlay visual (categories, hex-ish buttons, incompat) **(done)** | SongSelect | Playwright |
| **TASK-062** | Catalog overlay Argon tokens; search + catboy download only (TASK-009 already removed DB activation) **(done)** | `OnlineBeatmapCatalog.tsx` | Playwright search → download |
| **TASK-070** | Results grade-hero + judgement names + PENAR + local score list only | `ResultsScreen.tsx` | Playwright vs `results` ref |
| **TASK-071** | History restyle | `PersonalHistoryScreen.tsx` | Playwright |
| **TASK-080** | Main menu logo pulse + stacked actions; no account chip | `MainMenu.tsx` | Playwright |
| **TASK-081** | Settings rail restyle + PENAR/scroll-lock rows | `settings/*` | Playwright |
| **TASK-082** | Skin screen: Argon default, legacy listed | `SkinScreen.tsx` | Playwright |

### Later (own sessions)

| ID | Task |
|---|---|
| **TASK-090** | Implement `computePenar` formula (mania-like difficulty × acc × miss × mods). Still **never** labelled pp. |
| **TASK-091** | WebGL2 note instancing only if Canvas2D profiling proves a frame-time problem. |
| **TASK-092** | Dual Stages / 2P input. |

After **every** mechanical task: `npm run lint` && `npm test`. After **every** visual task: Playwright vs Argon refs.

---

## 12. Open questions (defaults)

1. **Brand vs Argon playfield?** Default: Argon-close in play; RhythmMania wordmark on menu only.
2. **Local ranking sort?** Default: total score desc, then accuracy, like lazer local.
3. **Keep osu! OAuth or BYO-only?** Default: keep both; token is catalog-only.
4. **Classic LN?** Default: Classic mod in TASK-036, not tick-LN.
5. **PENAR formula now?** Default: stub until TASK-090.

---

## 13. First session after approval

Start **TASK-001 only**. After the foundation slice, do **TASK-005–009 (offline cut)** before TASK-060 so song select is never restyled around a remote board.
