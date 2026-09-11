# RhythmMania plan (lazer-offline + Argon visuals)

**Status:** living plan (2026-09-11). TASK-001 through TASK-082 from the legacy queue are **done**. They are not reopened.
**Target client:** osu!(lazer) mania + **Argon**, recreated (not copied).
**Current app:** RhythmMania `v0.9.8` (`metadata.json` / `index.html`; `package.json` `"version": "latest"`).
**Execution rule:** one numbered **pending** task at a time. Do not start the next until the current one is implemented, tested, and (if visual) Playwright-checked against `docs/visual-refs/argon/`. Never batch two tasks unless the user explicitly says to.

**Product shape:** an **offline osu!(lazer)-style mania client** in the browser. No Google login, no RhythmMania accounts, no PostgreSQL, no global/RM leaderboards. Scores live on this device (IndexedDB / local history), shown like lazer’s **Local** ranking. The only network features are **mirror catalog search** (hinai → osu.direct → Catboy) and **archive download** (Catboy → osu.direct → hinai). **No osu! API v2 search. No osudl.org.**

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
- Mirror mania search + .osz download (hinai, osu.direct, Catboy). No official osu! search, no osudl.org
- osu! OAuth is **optional leftover**, not required for catalog search or download
- PENAR HUD slot (stub until TASK-090)
- Playwright vs Argon stills for remaining visual gaps

---

## Execution protocol (mandatory)

1. Work **only** the next pending task in the queue the user named. Default visual next is `TASK-V-001`. Catalog/mirror work is **§ Catalog mirrors (TASK-C-*)** — start **TASK-C-001** when implementing that workstream. Do not mix visual and catalog in one session unless the user batches. Do not revive TASK-001–082.
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
- Optional **local display name** (default “Player”). Catalog search **does not** need an osu! token.

### Keep (network, no database)

| Endpoint | Role |
|---|---|
| `GET /api/catalog/search` | **Unauthenticated** proxy: mania search via hinai, then osu.direct, then Catboy. Ranked/loved/graveyard, 2K–10K. **No** `osu.ppy.sh`, **no** Bearer |
| `GET /api/auth/osu/*` | Optional leftover. Not required for search/download. Do not delete in TASK-C unless the user asks |
| `GET /api/config` | Version + `supportedMode: [3]` + flags (`accounts: false`, `leaderboards: local`) |
| `GET /api/health` | Process liveness; **do not** probe a database |

Download (browser, not Vercel): `https://catboy.best/d/<setId>` → `https://osu.direct/api/d/<setId>` → hinai `GET https://mirror.hinamizawa.ai/d/<setId>` then fetch `download_url`. Retry the **next** mirror on any failure (not only 404). **Never** `osudl.org`. Unpack into IndexedDB. Do not register/activate catalog on a server.

Search stays on `/api/catalog/search` because CORS, User-Agent, and a single DTO. Do not call official osu! API. Do not stream .osz bytes through the Vercel function.

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
10. Catalog = unauthenticated mirror search proxy + three-mirror download. No osu! API search, no osudl.org, no catalog activation DB.
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
| **TASK-V-001** | **done** | `data-skin="argon"` + `--argon-*`; **no font change** | lint, test, Playwright scoped token verification |
| **TASK-V-002** | optional / unstarted | Outfit only if later stills demand it (fonts stay Inter/Space Grotesk) | — |
| **TASK-V-050** | **done** | Filled rice arrow (same `size` / `halfW` / `halfH` as `drawChevronDown`); 4K+7K+9K colour shots; **no table edits** | `playfield-4k` ~4 px |
| **TASK-V-051** | **done** | Oval still-diff; optional taper; **lane dim** | holds + `argon-notes.png` |
| **TASK-V-052** | pending | Density `Float32Array` length 64, map-time bins, one canvas in progress pill | `hud/argon-song-progress-*` |
| **TASK-V-053** | pending | HUD still-diff only (combo/PENAR already shipped) | `hud/` |
| **TASK-V-043** | pending | Visible **Exit**; do not rebuild pause stack | `pause/` |
| **TASK-V-060** | pending | Decorative wedge 480–520px desktop; **no shear at 390×844**; axis-aligned controls | `song-select/v2*` |
| **TASK-V-061** | pending | Footer chrome still-diff | v2 footer |
| **TASK-V-062** | pending | Mods/catalog tokens under `data-skin` | `task062*` |
| **TASK-V-070** | **blocked** | Shipped-lazer results layout vs user stills. No `scoreProcessor`. Not Figma. | `docs/visual-refs/argon/results/` |
| **TASK-V-080** | pending | Menu still-diff; pulse already reduced-motion | `task080*` |
| **TASK-V-090** | pending | Skins copy: 3D is not Argon SoT | SkinScreen |

**Next visual task: TASK-V-052 (Argon song progress density histogram).**

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

## Catalog mirrors (TASK-C-*) — replace osu! search and osudl

**Status:** pending. User-requested 2026-09-11/12. Independent of Argon visual queue.
**Goal:** search and download mania sets from **three mirrors**, no official osu! search, no osudl.org.
**Product rule:** keep `/api/catalog/search` as a **stateless, unauthenticated** proxy. Browser downloads .osz directly. Still no catalog register/activate DB.

### Current (remove)

- `api/catalog/_search.ts` requires Bearer; calls `searchEligibleOsuSetsWithToken` → `osu.ppy.sh/api/v2`.
- `downloadBeatmapsetArchive` in `src/utils/osuTokenManager.ts`: Catboy, then **osudl.org only on 404**.
- `searchOsuBeatmapSetId` needs `hasOsuConnection()` + token.
- `api/_lib/replayVerification.ts` `MIRROR_HOSTS` includes `osudl.org`.
- UI: “connect osu! to search”, “osudl fallback” (`OnlineBeatmapCatalog.tsx`).

### Target mirrors (research lock-in)

All three: **no API key**. Search returns a **flat JSON array of osu! v2 beatmapset objects** (`id`, `title`, `artist`, `creator`, `status`, `covers`, `beatmaps[]` with `mode_int`, `cs` = keys, `checksum`).

| Mirror | Search | Download |
|---|---|---|
| **hinai** `mirror.hinamizawa.ai` | `GET /api/v2/search?q=&mode=3&status=&amount=&offset=` (prefer this v2 array). Richer alt: `/v3/osu/beatmaps/search/v2` — **do not use** unless we add stars/BPM filters later | JSON cascade `GET /d/{setId}` → `{ success, download_url, source }`. **Do not** default to proxy `GET /api/v1/hinai/d/{id}` (1000/min, their bandwidth) |
| **osu.direct** | `GET https://osu.direct/api/v2/search?q=&mode=3&amount=` | `GET https://osu.direct/api/d/{setId}` |
| **Catboy (Mino)** | `GET https://catboy.best/api/v2/search?q=&mode=3` | `GET https://catboy.best/d/{setId}` (`n` suffix = no video) |

**Search failover (server):** hinai (2s timeout) → osu.direct → Catboy. Treat hinai `200 []` on ranked/loved as possible outage (`Cache-Control: no-store`) and try the next mirror. Do **not** merge three result lists by default (ranking differs; Catboy may return graveyard for the same query). Dedupe only if a later task explicitly merges.

**Download failover (browser):** Catboy → osu.direct → hinai `/d/{id}` then `download_url`. Advance on **any** non-OK (not only 404). Keep 100 MiB cap. No-video later if we add a setting; default with-video.

**Status map** for query `s`: `ranked` → `1` / `ranked`; `loved` → `4` / `loved`; `graveyard` → `-2` / `graveyard`; `any` → omit status. Always `mode=3`. Filter 2K–10K via `beatmaps[].mode_int === 3` and `cs` in 2..10; drop converts.

**hinai integration rules (from their docs):** `User-Agent: RhythmMania/<version> (+repo-or-contact)`. Unknown query params are **silently ignored**. Ranked/loved search is local; graveyard may fall through to osu.direct. They do **not** search-cascade to Catboy — we still use Catboy as **our** third search. CORS `*` on hinai JSON.

**Pagination:** mirrors use `offset`/`amount` (max ~100), not osu! `cursor_string`. Encode offset in `meta.cursor` or switch the catalog UI to offset. Sequential pages only.

**Do not:** call `osu.ppy.sh`; keep osudl.org; stream .osz through Vercel; require Bearer for search; loop Catboy ↔ hinai downloads.

### Serial catalog task queue

Work **one** pending `TASK-C-*` at a time when this workstream is active.

| ID | Status | Work | Files (expected) | Verify |
|---|---|---|---|---|
| **TASK-C-001** | pending | Shared v2 beatmapset → existing catalog DTO. Types, status/mode/key filters, 2K–10K mania, drop converts. Fixtures from live probes (hinai/osu.direct ranked FREEDOM DiVE; Catboy may differ). | `api/_lib/mirrorCatalog.ts` (new), tests `tests/mirror-catalog.test.ts` | `npm test` fixture parse; no network in CI |
| **TASK-C-002** | pending | Rewrite `GET /api/catalog/search`: **no Bearer**. `q` required, `s` ranked/loved/graveyard/any. Timeout 2s. Failover hinai → osu.direct → Catboy. Descriptive User-Agent. `id: mirror_${setId}`, `source: 'hinai'\|'osudirect'\|'catboy'`. Replace cursor with offset (or encode offset). 401 for missing token **gone**. | `api/catalog/_search.ts`, `api/_lib/osu.ts` (stop using search-with-token from this handler) | lint; unit test mapping; optional live smoke not required in CI |
| **TASK-C-003** | pending | `downloadBeatmapsetArchive`: Catboy → osu.direct → hinai JSON `download_url`. Status strings per host. Delete osudl.org. Same byte cap / stream reader. | `src/utils/osuTokenManager.ts` | lint; no `osudl` string left in download path |
| **TASK-C-004** | pending | `searchOsuBeatmapSetId` (replay missing-map): call `/api/catalog/search` **without** token. Do not require `hasOsuConnection()`. | `osuTokenManager.ts`, `App.tsx` auto-download comment | lint |
| **TASK-C-005** | pending | Server allowed download hosts: `catboy.best`, `osu.direct`, `mirror.hinamizawa.ai`, plus hosts hinai may hand off (`nekoha.moe`, `mirror.nekoha.moe` if used). **Remove `osudl.org`.** Do not revive register/activate. | `api/_lib/replayVerification.ts` (`MIRROR_HOSTS` / fetch list) | grep `osudl` empty in `api/` + `src/` (except changelog/plan history if any) |
| **TASK-C-006** | pending | Catalog UI: drop “connect osu! to search” / token gate for the search box. Drop osudl copy. Show which mirror answered if cheap (`source` on rows). Keep ranked/loved/graveyard chips. | `OnlineBeatmapCatalog.tsx` | Playwright: search box works without osu! login; empty-query still 400 |
| **TASK-C-007** | pending | Docs/copy only: README, AGENTS.md catalog rows, catalog overlay help. **Not** a source of truth vs code. | `README.md`, `AGENTS.md` if those lines still claim osu! API + osudl | grep those files |
| **TASK-C-008** | pending | Optional: CORS smoke from `localhost:3000` for Catboy GET `/d/`, osu.direct `/api/d/`, hinai `/d/{id}`. If a host blocks browser GET, skip it in the client cascade and document. | download helper + short comment | browser download of one small ranked set |

**Out of this queue:** deleting osu! OAuth routes; BYO token UI; adding Nerinyan/Sayobot/Beatconnect as extra search; hinai proxy streaming; merging three search pages; NSFW/star/BPM filter UI.

### PR grouping (catalog)

- **PR-C1:** TASK-C-001 + C-002 (search works without osu!)
- **PR-C2:** TASK-C-003 + C-004 + C-005 (download + hosts)
- **PR-C3:** TASK-C-006 + C-007 (UI + copy)
- **PR-C4:** TASK-C-008 if CORS needs a code change

Each: `npm run lint` && `npm test`. Browser smoke on C-006/C-008.

**Next catalog task: TASK-C-001 only** (when this workstream is started).

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
3. osu! OAuth: keep authorization-code **and** BYO in the repo for now; **catalog search/download must not require it** (TASK-C). Token is not an RM account.
4. Classic LN: Classic mod (shipped), not tick-LN for new plays.
5. PENAR formula: stub until TASK-090.
6. Results chrome: **shipped lazer** (not Figma now).
7. Song Select: **V2**.
8. Typography: **keep Inter / Space Grotesk**.

**Pending**

9. User will send **results + HUD/playfield stills**. TASK-V-070 stays blocked until `docs/visual-refs/argon/results/` has files.
10. Whether to delete unused osu! OAuth UI after TASK-C (user did not ask yet — leave routes).
11. Browser CORS on osu.direct download (TASK-C-008). If blocked, skip that hop.

---

## Risks (keep)

- Remaining visual work is polish; do not reopen mechanics as “visual.”
- Canvas vs osu!framework clocks will not be bit-identical.
- LN “repair via ticks” is gone for new plays (intentional).
- Dual Stages needs two input maps; skip until 2P exists.
- PENAR stub must look intentional (`—`).
- Catalog search proxy stays, but it must talk to **mirrors**, not osu! API v2 (TASK-C).
- Three mirrors rank the same query differently; do not merge result lists unless a later task says so.
- hinai `200 []` can mean outage; failover to the next search host.
- Song Select shear must not clip hit targets at 390×844.
- Visual-ref PNGs stay in `docs/` — never `public/`.

---

## First session after this revision

Two workstreams; **do not mix** unless the user batches:

- **Visual:** **TASK-V-001** is **done**. Next visual is **TASK-V-050 / TASK-V-051** (PR-V2 playfield filled arrow + lane dim). TASK-V-002 remains optional/unstarted (fonts stay Inter / Space Grotesk).
- **Catalog (user-requested):** **TASK-C-001** only (v2 set → catalog DTO + fixtures), then C-002 (search proxy).

After **every** TypeScript change: `npm run lint` && `npm test`. After **every** visual task: Playwright vs Argon refs. `npm run build` when Vite/CSS/chunks change.
