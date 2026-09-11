# RhythmMania plan (lazer-offline + Argon visuals)

**Status:** living plan (2026-09-11). TASK-001 through TASK-082 from the legacy queue are **done**. They are not reopened.
**Target client:** osu!(lazer) mania + **Argon**, recreated (not copied).
**Current app:** RhythmMania `v0.9.8` (`metadata.json` / `index.html`; `package.json` `"version": "latest"`).
**Execution rule:** one numbered **pending** task at a time. Do not start the next until the current one is implemented, tested, and (if visual) Playwright-checked against `docs/visual-refs/argon/`. Never batch two tasks unless the user explicitly says to.

**Product shape:** an **offline osu!(lazer)-style mania client** in the browser. No Google login, no RhythmMania accounts, no PostgreSQL, no global/RM leaderboards. Scores live on this device (IndexedDB / local history), shown like lazer’s **Local** ranking. The only network features are **osu! API v2 search** and **archive download from catboy.best** (HTTP 404 fallback to osudl.org).

This document is the agent-facing plan. Detailed remaining visual geometry lives in `docs/lazer-visual-plan.md` (rev 4). If they disagree on **active visual work**, this file plus executable source win; `docs/lazer-visual-plan.md` is the geometry/spec appendix.

---

## 0. Product and legal constraints (keep)

osu!(lazer) is a trademarked product. `ppy/osu` is MIT-licensed. **Official artwork, the osu! logo, the pink-circle mark, “ppy”, Torus as a branded drop-in, and osu! beatmaps are not ours to ship.**

Stance:

- **Gameplay, scoring, mods, HUD layout, song select IA, results, pause/fail:** match lazer mania. No “intentional stable-mania” leftovers on **new** plays.
- **Visuals:** recreate Argon **very closely** (note shape, column colours, HUD wedges, health bar, hit-error bars, combo placement). Draw original geometry/CSS/canvas; do not copy `osu-resources` bitmaps or the osu! wordmark.
- **Brand text:** RhythmMania name stays. The live performance rating is **PENAR** (never labelled “pp”).
- **Fonts:** **Inter / Space Grotesk / JetBrains Mono** (user-confirmed). Torus is forbidden. Outfit / Nunito Sans is optional later (TASK-V-002) only if stills demand it.
- **Beatmaps:** keep `.osu`/`.osz` import.

Out of scope (unchanged):

- other rulesets, editor, multiplayer, storyboards, chat, wiki, medals, skin JSON editor
- **computing** a full osu! pp value (PENAR UI + data slots exist; formula is still stubbed — TASK-090)
- Google OAuth, RhythmMania user accounts, profiles-as-a-service
- PostgreSQL and any score/user tables
- Global, country, or RM-hosted leaderboards
- Replay upload, server verification-for-ranking, catalog register/activate
- `/profile` as an online identity surface

In scope:

- Solo mania ruleset (already aligned; do not regress)
- Argon-close session surfaces, **lazer-offline IA**, Local ranking
- osu! API v2 mania search + catboy.best (and 404→osudl.org)
- Optional osu! token (authorization-code or BYO) in localStorage for catalog only
- PENAR HUD slot (stub until TASK-090)
- Playwright vs Argon stills for remaining visual gaps

---

## Execution protocol (mandatory)

1. Work **only** the next pending `TASK-V-*` (or later `TASK-09x`) in **§ Active visual queue** / **§ Future directions**. Do not revive TASK-001–082.
2. Read the task’s files, implement only that task, run its verification.
3. Mark it done in this plan only after verification evidence exists.
4. Stop and report. Do not “while I’m here” extra polish.
5. Visual tasks: Playwright MCP → `browser_navigate` local app → exercise the path → screenshot 1280×720 and 390×844 → compare to `docs/visual-refs/argon/` (not `verify-*.png` as truth).

---

## Offline client architecture (keep)

osu!(lazer) without a login still lets you play imported maps and see **your** scores. That remains the target.

### Keep (local)

- IndexedDB beatmaps/packages (`storageManager.ts`)
- `rhythm_mania_v1_play_history` as the only score store
- Local replays (watch/export/import). Imported replays stay local-only
- Settings, skins, bindings, last-selected map, favorites
- Song-select **Local** list: history for the selected chart, score then accuracy. No Global / Country / RM tabs
- Results: this run vs that local list only
- Optional **local display name** (default “Player”). osu! token is a **catalog credential**, not an RM account

### Keep (network, no database)

| Endpoint | Role |
|---|---|
| `GET /api/catalog/search` | Bearer → osu! API v2 mania search (ranked/loved/graveyard, 2K–10K) |
| `GET /api/auth/osu/url` + callback / refresh / byo-token | Mint/refresh token to opener/localStorage only |
| `GET /api/config` | Version + `supportedMode: [3]` + flags (`accounts: false`, `leaderboards: local`) |
| `GET /api/health` | Process liveness; **do not** probe a database |

Download: `https://catboy.best/d/<setId>`, retry `https://osudl.org/s/<setId>` **only** on HTTP 404. Unpack into IndexedDB. Do not register/activate catalog on a server.

Search still needs a stateless hop to `osu.ppy.sh/api/v2`. OAuth client-secret exchange cannot live in the browser. Do not plan on deleting all `/api` unless CORS changes.

---

## What is already done (TASK-001 … TASK-082)

Do **not** re-implement. Summary only:

| Cluster | IDs | Outcome |
|---|---|---|
| Foundation | 001–004 | Canvas2D Argon default; Babylon extra; visual-ref board; `desynchronized` + interactive AudioContext |
| Offline cut | 005–009 | No Google/profile/upload/Postgres; Local board; catalog search + catboy only |
| Windows / names / rate | 010–012 | Perfect/Great/Good/Ok/Meh display; OD fixtures; DT/HT SpeedMultiplier |
| Holds + HP | 020–023 | Head + ComboBreak body + 1.5× tail + Meh cap; ManiaHealthProcessor |
| Mods | 030–037 | Lazer multipliers; HD/FI/Cover/FL; 1K–10K; SD/PF/NC; Mirror/CS/Invert/Hold Off/NR; DA/Classic; remaining fun mods (Dual Stages skipped) |
| Session | 041–044 | Lead-in + skip intro; scroll lock in play; pause/fail overlays |
| Argon playfield + HUD | 050–054 | Notes/holds/receptors/colours; LN mask; wedges/HP/score/acc/combo/meters/progress/keys; PENAR **stub** |
| Menus | 060–082 | Select V2 IA + Local; mods/catalog chrome; results grade-hero + display names; history; menu pulse; settings; skins |

**Old-replay compatibility (keep):** new plays `rulesetVersion` 3; local replay sim still watches v2 tick records.

---

## Design principles (keep)

1. **One ruleset module** in `src/ruleset/mania/`. Canvas, replay sim, and tests share it. There is **no ranked upload path**; do not revive `replayVerification.ts` “for later leaderboards.”
2. **Lazer is the spec; tests are the contract.** Do not regress windows, score, HP, or holds.
3. **Argon is the visual spec.** Recreate from `ArgonSkin` + `ManiaArgonSkinTransformer`. Playwright vs stills for UI.
4. **One task at a time.**
5. **Canvas2D Argon is the reference renderer.** Babylon is an extra skin, not the visual or latency source of truth.
6. **PENAR is a first-class HUD field with a stub calculator.** Never call it pp.
7. **Settings still sanitize.** New fields go through `GameSettings` + `sanitizeSettings` + registry + consumers together.
8. **`DESIGN.md` arcade language** remains for **legacy skins**. Argon tokens must be scoped (`html[data-skin="argon"]`), not a global restyle.

---

## PENAR (keep)

Lazer’s Argon HUD has a performance counter under accuracy. RhythmMania ships the **same slot** as **PENAR** (Performance Evaluation & Numerical Achievement Rating).

Already shipped (TASK-054): HUD label, results/history `—` while stubbed, settings toggle, `computePenar` returning `{ total: null, version: 'penar-stub-0', ... }`. Call sites stay in the score path so filling the formula is a later single-file change.

**Do not invent osu pp numbers.** Formula is **TASK-090** (future). Stub must look intentional (`—`), not like a broken pp port.

---

## Low-latency rendering (keep)

Rhythm games lose to input-to-audio and input-to-photon delay, not to prettier 3D.

| Layer | Choice |
|---|---|
| Clock | Web Audio `AudioContext.currentTime` — judgement must not use `performance.now()` alone |
| Loop | `requestAnimationFrame` |
| Playfield | **Canvas2D** `{ alpha: false, desynchronized: true }` |
| HUD | DOM overlay, `pointer-events: none` |
| Input | window `keydown`/`keyup` for play keys, off the React render path |
| Audio | `latencyHint: 'interactive'`; expose latency into offset wizard |
| DPR | do not fill 4K×DPR 3 if it tanks frame time |

**Do not add PixiJS / Three.js / a second scene graph for 2D Argon.**

Optional later: **TASK-091** WebGL2 instanced quads only if Canvas2D profiling shows >8ms paint on 20k-note maps. `OffscreenCanvas` worker only if hit-testing stays on the audio clock.

Babylon stays a **skin**, dynamically imported.

**HUD/meters when engine and skin disagree:** `skinId === 'argon'` → Argon `ManiaHud` meters win. Babylon HTML 280×24 meter only when `renderEngine === 'babylon' && skinId !== 'argon'`.

---

## Key decisions (keep + visual lock-ins)

1. Mechanical target = **current lazer mania**, not stable ScoreV1. Classic is a mod (already shipped).
2. New holds = head + ComboBreak body + 1.5× tail. v2 ticks only for old replays.
3. Recreate Argon closely; no osu! trademarks or resource bitmaps.
4. Mod multipliers follow lazer mania.
5. Canvas2D + `desynchronized` is the low-latency reference; Babylon is extra.
6. **PENAR** occupies the Argon PP slot; formula stubbed until TASK-090.
7. Judgement **display** names = Perfect/Great/Good/Ok/Meh (already in UI). Do not rename internals in `scoreProcessor.ts` as a visual task.
8. **DT/HT scale song-time windows via SpeedMultiplier.** UR is not rate-converted.
9. **Offline client:** no Google, no Postgres, no RM/global leaderboards. Local scores only.
10. Catalog = search proxy + catboy download. No catalog activation DB.
11. **Song Select target is V2** (user-confirmed). V1 stills are contrast only.
12. **Results chrome is shipped lazer**, not the in-progress Figma (user-confirmed). Figma is optional later TASK-V-070b.
13. Pause third button **visible label: Exit** (keep `onExit` / `pause-quit-btn` ids if renaming is churn).
14. Default skin stays `argon`. Colour API is `getArgonColumnColor` / `argonPaletteForKeyCount` (1K–10K). Do not redesign the table.
15. Song-progress density bins in **map time** (rate-invariant). DT/HT only move the elapsed clip.

---

## Active work: remaining Argon visuals

TASK-050–082 shipped the **structure**. Remaining work is **gap-only**. Full numbers: `docs/lazer-visual-plan.md`.

Honest remaining gaps:

| Surface | Already in code | Remaining |
|---|---|---|
| Playfield | roundRect notes, stroke chevron, darkened holds, oval keys, receptors | **Filled** rice arrow; optional taper; lane dim vs stills |
| HUD | Corners, wedges, combo 1.3, PENAR slot, dual meters, **width-only** progress | **64-bin density histogram** + still-diff |
| Pause | Stacked Continue / Retry / Quit, 200ms fade | Label **Quit → Exit**; still-diff |
| Song Select | V2 IA, Local board, footer | Decorative **wedge** (no shear at 390×844) |
| Mods/catalog | Overlays exist | Token/chip pass under `data-skin` |
| Results | Grade ring, lazer display names, Retry/Replay/Back | Layout vs **user stills** — **gated** |
| Menu / skins | Pulse + stacked actions | Still-diff / copy that 3D ≠ Argon SoT |
| Tokens | Mixed `--skin-accent` / hardcoded `#66CCFF` | Scope `--argon-*` to `html[data-skin="argon"]` |

**Results stills:** user will send shipped-lazer results + HUD/playfield captures. Do **not** start TASK-V-070 until files exist in `docs/visual-refs/argon/results/`. Extra HUD/playfield stills go in existing `hud/` and `playfield-4k/` slots. **Never copy refs into `public/`.**

Pixel-perfect vs `osu.exe` is not required. Fail: wrong HUD corner, slab notes, stable chrome, Global/RM boards, osu! branding.

### ID mapping (do not collide with old TASK-050 = playfield)

| Board / filename | Active ID | Surface |
|---|---|---|
| TASK-050–051, `playfield-4k/` | **TASK-V-050, TASK-V-051** | Playfield polish |
| TASK-052–054, `hud/` | **TASK-V-052, TASK-V-053** | HUD density / still-diff |
| TASK-043, `pause/` | **TASK-V-043** | Pause Exit label |
| TASK-060–062, `song-select/` | **TASK-V-060 … V-062** | Wedge / footer / mods-catalog |
| TASK-070, `results/` | **TASK-V-070** | Results layout (gated) |
| TASK-080, `task080-*` | **TASK-V-080** | Menu still-diff |
| (new) | TASK-V-001, V-002, V-090 | Tokens, optional type, skins copy |

**Never use TASK-V-050 for results.**

### Serial visual-only task queue

| ID | Status | Work | Verify |
|---|---|---|---|
| **TASK-V-001** | pending | `data-skin="argon"` + `--argon-*`; **no font change** | lint |
| **TASK-V-002** | optional / unstarted | Outfit only if later stills demand it | — |
| **TASK-V-050** | pending | Filled rice arrow (same `size` / `halfW` / `halfH` as `drawChevronDown`); 4K+7K+9K colour shots; **no table edits** | `playfield-4k` ~4 px |
| **TASK-V-051** | pending (same PR as V-050) | Oval still-diff; optional taper; **lane dim** | holds + `argon-notes.png` |
| **TASK-V-052** | pending | Density `Float32Array` length 64, map-time bins, one canvas in progress pill | `hud/argon-song-progress-*` |
| **TASK-V-053** | pending | HUD still-diff only (combo/PENAR already shipped) | `hud/` |
| **TASK-V-043** | pending | Visible **Exit**; do not rebuild pause stack | `pause/` |
| **TASK-V-060** | pending | Decorative wedge 480–520px desktop; **no shear at 390×844**; axis-aligned controls | `song-select/v2*` |
| **TASK-V-061** | pending | Footer chrome still-diff | v2 footer |
| **TASK-V-062** | pending | Mods/catalog tokens under `data-skin` | `task062*` |
| **TASK-V-070** | **blocked** | Shipped-lazer results layout vs user stills. No `scoreProcessor`. Not Figma. | `docs/visual-refs/argon/results/` |
| **TASK-V-080** | pending | Menu still-diff; pulse already reduced-motion | `task080*` |
| **TASK-V-090** | pending | Skins copy: 3D is not Argon SoT | SkinScreen |

**Next task for implementing agents: TASK-V-001 only.**

Density contract (do not invent another): bin `floor(t_map / audioDuration * 64)` clamped 0..63; one count per object at head time; compute once per beatmap identity; **do not** rebuild on DT/HT; elapsed clip uses playback clock.

### PR grouping (when the user allows more than one task per PR)

- **PR-V1:** TASK-V-001
- **PR-V2:** TASK-V-050 + V-051 (`argonPlayfield.ts` only)
- **PR-V3:** TASK-V-052
- **PR-V4:** TASK-V-060 + V-061
- **PR-V5:** TASK-V-043 + V-080 + V-090 (tiny chrome)
- **PR-V6:** TASK-V-062
- **PR-V7:** TASK-V-070 after stills

Each implementation PR: `npm run lint` and `npm test`. Visual PRs: Playwright 1280×720 + 390×844 vs the mapped slot.

Escape hatch: `skinId` → `rhythmmania` and `data-skin=legacy`.

---

## Future directions (keep)

These are **not** the current visual queue. Own sessions after Argon Canvas gaps are closed (or when the user asks).

| ID | Direction |
|---|---|
| **TASK-090** | Implement `computePenar` (mania-like difficulty × acc × miss × mods). Still **never** labelled pp. Leave call sites as they are. |
| **TASK-091** | WebGL2 note instancing **only if** Canvas2D profiling proves a frame-time problem (>8ms paint on 20k-note maps). |
| **TASK-092** | Dual Stages / 2P input. Skip until two input maps exist. |
| **TASK-V-002** | Optional Outfit/Nunito if HUD stills demand type churn (fonts otherwise stay Inter / Space Grotesk). |
| **TASK-V-070b** | Figma results redesign — **not** in the active queue. |
| Nightcore | Pitch already partly from rate; extra NC tick/pitch polish if still short of lazer. |
| OffscreenCanvas | Raster worker only if main-thread hit-testing stays on the audio clock. |

Do not add Pixi/Three for 2D Argon. Do not restore Google, Postgres, global boards, or replay upload.

---

## Open questions

**Resolved**

1. Brand vs Argon playfield: Argon-close in play; RhythmMania wordmark on menu only.
2. Local ranking sort: total score desc, then accuracy.
3. osu! OAuth: keep authorization-code **and** BYO; token is catalog-only.
4. Classic LN: Classic mod (shipped), not tick-LN for new plays.
5. PENAR formula: stub until TASK-090.
6. Results chrome: **shipped lazer** (not Figma now).
7. Song Select: **V2**.
8. Typography: **keep Inter / Space Grotesk**.

**Pending**

9. User will send **results + HUD/playfield stills**. TASK-V-070 stays blocked until `docs/visual-refs/argon/results/` has files.

---

## Risks (keep)

- Remaining visual work is polish; do not reopen mechanics as “visual.”
- Canvas vs osu!framework clocks will not be bit-identical.
- LN “repair via ticks” is gone for new plays (intentional).
- Dual Stages needs two input maps; skip until 2P exists.
- PENAR stub must look intentional (`—`).
- osu! API v2 still needs the search proxy.
- Song Select shear must not clip hit targets at 390×844.
- Visual-ref PNGs stay in `docs/` — never `public/`.

---

## First session after this revision

Start **TASK-V-001 only** (skin-scoped Argon CSS tokens). After that, TASK-V-050/051 (filled arrow + lane dim) unless the user batches with the PR plan.

After **every** TypeScript change: `npm run lint` && `npm test`. After **every** visual task: Playwright vs Argon refs. `npm run build` when Vite/CSS/chunks change.
