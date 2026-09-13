# RhythmMania plan (lazer-offline visuals)

**Status:** living plan (2026-09-12, visual-refs refresh). Mechanical work TASK-001–082 stays **done**. It is not reopened.
**Target client:** osu!(lazer) mania, recreated in the browser from `visual-refs/` stills. Not osu!(stable). Not the current RhythmMania chrome. Not `DESIGN.md`.
**Current app:** RhythmMania `v0.9.8` (`metadata.json` / `index.html`; `package.json` `"version": "latest"`).
**Execution rule:** one numbered **pending** task at a time. Do not start the next until the current one is implemented, tested, and (if visual) Playwright-checked against the mapped stills in `visual-refs/`. Never batch two tasks unless the user explicitly says to.

**Product shape:** an **offline osu!(lazer)-style mania client** in the browser. No Google login, no RhythmMania accounts, no PostgreSQL, no global/RM leaderboards. Scores live on this device. The only network features remain mirror catalog search + archive download. **No osu! API v2 search. No osudl.org.**

This file is the agent-facing plan. **`visual-refs/` is the visual source of truth.** `DESIGN.md` is ignored for all new visual work. Current screens are implementation starting points, not the design target — rebuild them to match the stills.

---

## 0. Product and legal constraints (keep)

osu!(lazer) is a trademarked product. `ppy/osu` is MIT-licensed. **Official artwork, the osu! logo, the pink-circle mark, “ppy”, Torus as a branded drop-in, and osu! beatmaps are not ours to ship.**

Stance:

- **Gameplay, scoring, mods, HUD layout, song select IA, results, pause/fail:** match lazer mania. No “intentional stable-mania” leftovers on **new** plays.
- **Visuals:** recreate lazer **from the stills**, including shear, colour, type scale, idle motion, hover, and screen transitions. Draw original geometry/CSS/canvas. Do **not** copy `osu-resources` bitmaps, samples, or the osu! wordmark.
- **Brand text:** RhythmMania name stays. The menu cookie is a **RhythmMania** disc (pink fill, white ring, “RM” or the RhythmMania wordmark) — never the letters “osu!”. The live performance rating is **PENAR** (never labelled “pp”).
- **Fonts:** **Inter / Space Grotesk / JetBrains Mono** (user-confirmed). Torus is forbidden. Space Grotesk stands in for Torus Alternate on large titles (`paused`, `failed`, menu labels).
- **Beatmaps:** keep `.osu`/`.osz` import.

Out of scope (unchanged product):

- other rulesets as playable modes, editor, multiplayer, playlists, storyboards, chat, wiki, medals, skin JSON editor
- **computing** a full osu! pp value (PENAR UI + data slots exist; formula is still stubbed — TASK-090)
- Google OAuth, RhythmMania user accounts, profiles-as-a-service
- PostgreSQL and any score/user tables
- Global, country, or RM-hosted leaderboards
- Replay upload, server verification-for-ranking, catalog register/activate
- `/profile` as an online identity surface

**Visual chrome vs product wiring:** stills include Edit, Multi, Playlists, and a full lazer toolbar. Recreate those controls so the screen matches. Wire only what this client has. Unwired controls stay visible, dimmed, and inert (lazer-style disabled), with a short tooltip. Do **not** delete them to “simplify.”

In scope:

- Solo mania ruleset (already aligned; do not regress)
- Lazer session surfaces from `visual-refs/`, including feel and animation
- Local ranking only
- Mirror mania search + .osz download (existing catalog path; **no TASK-C queue in this plan**)
- PENAR HUD slot (stub until TASK-090)

---

## Execution protocol (mandatory)

1. Work **only** the next pending `TASK-V-*` in the serial queue. Default next is `TASK-V-010`. Do not revive TASK-001–082. Do not revive the retired TASK-C-* catalog queue.
2. Read the task’s stills **before** touching code. The still wins over the current component. `DESIGN.md` is not a reference.
3. Implement only that task. Run its verification.
4. Mark it done in this plan only after verification evidence exists.
5. Stop and report. Do not “while I’m here” extra polish.
6. Visual tasks: Playwright MCP → `browser_navigate` local app → exercise the path the way a user would → screenshot **1280×720** and **390×844** → compare to the mapped file(s) in `visual-refs/`. A single render screenshot is not verification. Confirm hover, press, enter, exit, and reduced-motion.

**Never copy refs into `public/`.**

---

## Offline client architecture (keep)

osu!(lazer) without a login still lets you play imported maps and see **your** scores. That remains the target.

### Keep (local)

- IndexedDB beatmaps/packages (`storageManager.ts`)
- `rhythm_mania_v1_play_history` as the only score store
- Local replays (watch/export/import). Imported replays stay local-only
- Settings, skins, bindings, last-selected map, favorites
- Song-select **Local** list: history for the selected chart, score then accuracy. No Global / Country / RM tabs as live data
- Results: this run vs that local list only
- Optional **local display name** (default “Player”)

### Keep (network, no database)

Existing catalog search + three-mirror download stay as currently specified in code. This plan does **not** schedule catalog work. Do not mix catalog backend changes into a visual task.

---

## What is already done (TASK-001 … TASK-082)

Do **not** re-implement. Summary only:

| Cluster | IDs | Outcome |
|---|---|---|
| Foundation | 001–004 | Canvas2D Argon default; Babylon extra; `desynchronized` + interactive AudioContext |
| Offline cut | 005–009 | No Google/profile/upload/Postgres; Local board |
| Windows / names / rate | 010–012 | Perfect/Great/Good/Ok/Meh display; OD fixtures; DT/HT SpeedMultiplier |
| Holds + HP | 020–023 | Head + ComboBreak body + 1.5× tail + Meh cap; ManiaHealthProcessor |
| Mods | 030–037 | Lazer multipliers; HD/FI/Cover/FL; 1K–10K; SD/PF/NC; Mirror/CS/Invert/Hold Off/NR; DA/Classic |
| Session | 041–044 | Lead-in + skip intro; scroll lock in play; pause/fail overlays **exist** (rebuild visually in TASK-V-070/071) |
| Argon playfield + HUD | 050–054 | Notes/holds/receptors/colours; HUD slots; PENAR **stub** — **rebuild to stills** in TASK-V-060…062 |
| Menus | 060–082 | Select / mods / catalog / results / history / menu / settings / skins **exist as product surfaces** — **rebuild to stills** in the V queue |

**Old-replay compatibility (keep):** new plays `rulesetVersion` 3; local replay sim still watches v2 tick records.

The previous visual queue (TASK-V-001 tokens, V-043 Exit label, V-050 filled arrow, V-060 wedge, …) is **retired**. Those IDs must not be reused. New work uses the IDs in **§ Active work** below. Prior visual commits may remain in the tree; they are not the target.

---

## Design principles (visual rebuild)

1. **`visual-refs/` is the spec.** If the current screen disagrees with a still, the still wins. If `DESIGN.md` disagrees with a still, ignore `DESIGN.md`.
2. **Lazer feel is part of the spec.** Layout without the motion is unfinished. Every surface ships enter, exit, hover, and reduced-motion together.
3. **Recreate, do not copy.** Original geometry/CSS/canvas. No osu! trademarks, no `osu-resources` bitmaps, no shipped osu samples.
4. **One ruleset module** in `src/ruleset/mania/`. Visual tasks must not change windows, score, HP, or holds.
5. **Canvas2D Argon is the reference renderer.** Babylon is an extra skin, not the visual source of truth.
6. **PENAR occupies the Argon PP slot.** Never label it pp. Stub stays `—` until TASK-090.
7. **Settings still sanitize.** New fields go through `GameSettings` + `sanitizeSettings` + registry + consumers together.
8. **Argon tokens stay scoped** to `html[data-skin="argon"]` (and the new lazer chrome tokens live on `html[data-ui="lazer"]` or equivalent). Do not globally restyle legacy skins.

---

## Visual source of truth

All stills live under `visual-refs/`. Paths below are relative to that folder.

Duplicate captures exist under `hud/` and `song-select/` (typos in filenames). Use the **canonical path** in the left column; the duplicate is contrast only.

| Canonical still | Surface | What it locks |
|---|---|---|
| `hud/first menu 1.png` | Main menu **idle** | Full-bleed triangle field, centred cookie, spectrum bars around the ring, no button bar, no toolbar |
| `hud/first menu 2.png` + `first menu 3.png` | Main menu **top-level** | Toolbar, grey button strip, cookie overlapping the strip, Settings / Play / Edit / Browse / Exit parallelograms, floating outline triangles |
| `hud/first menu on hover.png` | Main menu **play submenu** | Same strip; Settings replaced by Back; Play/Edit/Browse/Exit replaced by Solo / Multi / Playlists, all purple |
| `song-select/song select.png` | Song Select V2 (Mach Roger) | Blurred beatmap BG, left title/stats/ranking, right carousel, footer Back/Mods/Random/Options, cookie parked bottom-right |
| `hud/songselect.jpg` | Song Select **expanded set** | AstroNotes: selected difficulty cyan bar, local grade letter on a row (`A`), RANKED pill, Local empty “No records yet!” |
| `hud/songslect.jpg` | Song Select **collapsed carousel** | Sets only (no open diffs); includes a **LOCAL** status pill on imported maps |
| `hud/songslect (2).jpg` | Song Select graveyard set | GRAVEYARD pill, BPM **range** `135-520 (mostly 270)`, Local empty state, expanded diffs |
| `hud/songselct onhober playing.jpg` | Toolbar tooltip | Hover now-playing: title `now playing`, subtitle `manage the currently playing track`, shortcut `F6` |
| `hud/songselct onhover playing songs.jpg` | **Now playing** overlay | Mini player: cover, title, artist, shuffle, prev/pause/next, queue; now-playing toolbar icon **pink** |
| `hud/onhover smth else.jpg` | Toolbar tooltip | Hover listing: `beatmap listing` / `browse for new beatmaps` / `CTRL-B`; listing icon highlighted |
| `hud/on hover top bar smth.jpg` | Toolbar tooltip | Hover wiki: `wiki` / `knowledge base` (visual; wiki stays unwired) |
| `hud/option menu.png` | Song Select **Options** popover | Dark rounded panel; General / For all difficulties / For selected difficulty rows |
| `hud/mod menu.png` | Mod Select idle | Sheared columns, search `tab to search…`, Customise, footer Back + Mods + Deselect All + chart chips |
| `hud/mods.jpg` | Mod Select scrolled | Conversion (Random, Dual Stages, Mirror, DA, Classic, Invert, CS, Hold Off, One Key…) + Fun (Wind Up/Down, Muted, Adaptive Speed); hover tooltip |
| `hud/mod2.jpg` | Mod incompatibility tooltip | Perfect: “SS or quit. Incompatible with:” + hex icons |
| `hud/mod3.jpg` | Mod selected + rate | Nightcore row filled red; HT selected; footer rate pill `NC 1.00x` and BPM scaled |
| `hud/modcustomise.jpg` | Customise dropdown | Green “Customise” header, Nightcore speed slider, `NC` chip |
| `hud/modunranked.jpg` | Unranked mods | Autoplay selected (blue fill); yellow **UNRANKED** pill on the rate bar and footer chip |
| `hud/pre game stage.png` | Player loader | Blurred BG, centred metadata + banner, right Visual/Audio/Input groups with yellow sliders, footer Back |
| `hud/beatmaplisting.jpg` | Browse listing (in-client) | Overlay with toolbar listing icon **pink**; expanded filters; **3-column** cards; footer Back |
| `hud/beatmaplistingnosongs.jpg` | Listing empty | Same chrome; centred empty illustration + copy `… nope, nothing found.` |
| `pause/pausef.png` | Pause | Dimmed playfield, yellow `paused`, sheared Continue/Retry/Quit, retry/progress/accuracy, triangle pattern in buttons |
| `pause/failed.png` | Fail | Same language; yellow `failed`; Retry + Quit only; grey save-replay strip at bottom |
| `playfield-4k/Screenshot 2026-09-12 192641.png` | HUD + 4K playfield | Health wedge, judgement boxes, rank pill, coloured lanes, rice chevrons, MISS text, receptors |
| `playfield-4k/Screenshot 2026-09-12 192820.png` | Countdown | Centre ring `2`, empty receptors with key-overlay dots, accuracy/pp wedges |
| `playfield-4k/Screenshot 2026-09-12 192855.png` | In-play HUD | Health drain, key overlay press (`×`), judgement, notes |
| `playfield-4k/lazer-argon-mania-gameplay.png` | Argon notes (close) | Filled chevron rice, white foot, hold body + minus head, receptor flash |
| `playfield-4k/osu_2026-09-12_19-55-36.jpg` … `19-56-12.jpg` | Live HUD / replay | Score **inside** the health capsule; combo on the rank pill; dual hit-error; B1–B4 counters; bottom progress bar; right-side visual-settings gear; replay “Watching …” + playback overlay |
| `playfield-4k/argon-column-colour-spec.png` + `argon-column-colours-1k-10k.png` | Column colours 1K–10K | Palette + rice/hold construction. **Shipped Argon colours**, not the “UPDATED” mock rows unless a still of live lazer contradicts the live gameplay shots |
| `results/osu_2026-09-12_19-51-20.jpg` | Results (grade A, side #2) | Centre grade card + overlapping avatar; ring; score; stats grid; side local-score card; footer Back + export |
| `results/osu_2026-09-12_19-51-31.jpg` | Results (grade C, side #1) | Clicking a side card **swaps** it into the centre; previous run becomes the side card |

Pixel-perfect vs `osu.exe` is not required. Fail: wrong HUD corner, slab notes, stable chrome, Global/RM live boards, osu! branding, motion that feels like generic Material/Tailwind instead of lazer.

---

## Lazer motion language (mandatory for every V task)

Do not invent a second motion system. Put shared tokens in one module (suggested: `src/ui/lazer/motion.ts` + CSS variables on `html[data-ui="lazer"]`) during TASK-V-001. Later tasks **use** those tokens.

osu!framework `Easing.OutQuint` is the house ease. Map it; do not substitute Tailwind `ease-out`.

| Token | Value | Use |
|---|---|---|
| `--lazer-ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Almost every UI settle (buttons expand, overlays, logo scale) |
| `--lazer-ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Logo return to centre; button contract; click flash fade |
| `--lazer-ease-in-sine` | `cubic-bezier(0.12, 0, 0.39, 0)` | Button-bar flatten; entering-mode contract |
| `--lazer-ease-in-out-sine` | `cubic-bezier(0.37, 0, 0.63, 1)` | Hover icon tilt on beat |
| `--lazer-ease-out-elastic` | Motion spring `{ type: "spring", duration: 0.5, bounce: 0.35 }` | Menu button hover **width** only |
| `--lazer-shear` | `skewX(-11.31deg)` ≡ `Vector2(0.2, 0)` | Footer buttons, listing cards’ sibling language, song-select chips. **Unshear** inner text/icons with `skewX(11.31deg)` |
| `--lazer-menu-wedge` | `20 / 100` → `skewX(-11.31deg)` on 100px-tall menu buttons | Main-menu parallelograms (`WEDGE_WIDTH / BUTTON_AREA_HEIGHT`) |
| `--lazer-pink` | `#e967a1` | Cookie fill |
| `--lazer-pink-light` | `#ff7db7` | Cookie inner triangles |
| `--lazer-yellow` | `#ffcc22` | `paused` / `failed` titles |
| `--lazer-yellow-dark` | `#eeaa00` | Retry |
| `--lazer-green` | `#88b300` | Continue (pause) |
| `--lazer-quit` | `rgb(170, 27, 39)` | Quit |
| `--lazer-play` | `rgb(102, 68, 204)` | Play / Solo |
| `--lazer-edit` | `rgb(238, 170, 0)` | Edit |
| `--lazer-browse` | `rgb(165, 204, 0)` | Browse |
| `--lazer-exit` | `rgb(238, 51, 153)` | Exit |
| `--lazer-back` | `rgb(51, 58, 94)` | Menu Back |
| `--lazer-settings` | `rgb(85, 85, 85)` | Settings parallelogram |
| `--lazer-bar-gray` | `rgb(50, 50, 50)` | Menu button strip |
| `--lazer-back-footer` | `#e91e8a` (match `song-select/song select.png` Back) | Footer Back |

**Hard numbers from lazer source (recreate, don’t guess):**

| Motion | Duration | Ease | Notes |
|---|---|---|---|
| Menu button expand (contracted → expanded) | **500ms** | OutExpo | Width 0 → 140px; fade-in at 500/6 ≈ **83ms** |
| Menu button contract | **500ms** | OutExpo | Width → 0; fade-out 500ms |
| Menu button explode (leaving a submenu) | **200ms** | OutExpo | Width ×2; fade-out 150ms |
| Menu button hover width | **500ms** | OutElastic | Width × **1.5**, height unchanged |
| Menu icon hover bounce | half-beat | Out then In | `HOVER_SCALE = 1.2`, `BOUNCE_COMPRESSION = 0.9`, `BOUNCE_ROTATION = 8deg`, alternate direction per beat |
| Button-bar fade | **300ms** | (linear fade) | Alpha 0↔1 |
| Button-bar flatten (idle) | **300ms** | InSine | Scale Y → 0 |
| Button-bar restore | **400ms** | OutQuint | Scale Y → 1 |
| Logo idle → top-level | **200ms** | In | Scale 1 → 0.5, track into the strip; then **Impact** (brief overshoot) |
| Logo top-level → idle | **800ms** | OutExpo | Move to centre, scale 0.5 → 1. Delay = `barAlpha * 150` |
| Initial → top-level bar delay | **150ms** | — | Buttons start after this |
| Overlay pop-in/out (pause/fail) | **200ms** | **In** (not Out) | Lazer `GameplayMenuOverlay.TRANSITION_DURATION` |
| Overlay background | alpha **0.75** black | — | Playfield stays visible underneath |
| Screen logo park (select) | **~5000ms** first arrive / **300ms** fade | OutQuint | Cookie to bottom-right, scale ~0.2 of menu size |
| Click flash on menu button | 800ms OutExpo from 0.9 alpha | Additive white | |
| Toolbar tooltip | **150ms** | OutQuint | Fade + 4px translateY; no elastic |
| Now-playing / Customise popover | **180ms** | OutQuint | Scale 0.95→1 from the icon |
| Results hero card | **350ms** | OutQuint | Scale 0.95→1 + fade; side cards stagger 50ms |
| Carousel expand | **200–400ms** | OutQuint | Layout animation, interruptible |

**Properties:** `transform` and `opacity` only (shear is a transform). Never `transition: all`. Never `scale(0)` — menu buttons collapse on **width**, which is the one layout exception lazer itself uses; implement that width animation with Motion so it can be interrupted.

**Reduced motion:** keep colour/opacity; drop triangle drift, logo pulse scale, elastic hover, icon beat-bounce. Overlays may still fade (≤200ms).

**Tool:** Motion (`motion` is already a dependency) for springs, layout, and interruptible menu states. CSS for predetermined fades.

**Do not** animate keyboard-only 100+/day toggles (settings rows, binding matrix). **Do** animate screen changes, the menu button system, overlays, carousel selection, and listing expand — those are lazer’s personality.

---

## PENAR (keep)

Lazer’s Argon HUD has a performance counter under accuracy. RhythmMania ships the **same slot** as **PENAR**. Already stubbed. Visual tasks show the slot; they must never print “pp”. Formula remains **TASK-090**.

---

## Low-latency rendering (keep)

Unchanged. Visual HUD is a DOM overlay with `pointer-events: none` during play. Do not add PixiJS / Three.js / a second scene graph for 2D Argon. Babylon stays a dynamically imported skin.

---

## Key decisions (keep + visual lock-ins)

1. Mechanical target = **current lazer mania**. Visual target = **`visual-refs/` stills**, including motion.
2. New holds = head + ComboBreak body + 1.5× tail. v2 ticks only for old replays.
3. Recreate lazer closely; no osu! trademarks or resource bitmaps.
4. Canvas2D + `desynchronized` is the low-latency reference; Babylon is extra.
5. **PENAR** occupies the Argon PP slot; formula stubbed until TASK-090.
6. Judgement **display** names = Perfect/Great/Good/Ok/Meh. Do not rename internals in `scoreProcessor.ts` as a visual task.
7. **Offline client:** no Google, no Postgres, no RM/global leaderboards. Local scores only.
8. Song Select is **V2** as in `song-select/song select.png`.
9. Pause/fail third button visible label is **Quit** (as in the stills). Keep `onExit` / `pause-quit-btn` ids.
10. Default skin stays `argon`. Column colours from live gameplay stills + the 1K–10K chart. Do not redesign the table from the “UPDATED” mock annotations.
11. Menu cookie is a RhythmMania disc. Spectrum bars, pulse, and triangle field stay.
12. Toolbar / Edit / Multi / Playlists are **visual**. Solo, Settings, Browse, Back, Exit (confirm), Mods, Random, Options, Local ranking are **wired**.
13. Browse opens the **in-client** beatmap-listing overlay (`hud/beatmaplisting.jpg`), with the listing toolbar icon highlighted. It is not osu-web and not the old catalog drawer.
14. Results chrome is the **shipped lazer results card** in `visual-refs/results/`. Those stills are osu!standard (slider tick/end). Copy **layout and motion**; mania judgement rows stay Perfect→Miss; the PP cell is **PENAR**.
15. Local ranking empty copy is **“No records yet!”** (`hud/songselect.jpg`), not “Please sign in…”.
16. Toolbar hover is a two-line tooltip (title + subtitle + shortcut). Now-playing is a real mini-player overlay. Wiki/news/chat stay visual.

---

## Active work: lazer visual rebuild

This is a **rebuild**, not gap-polish. Each task replaces the current look of that surface until it matches the stills at 1280×720, then checks 390×844 for usable hit targets (shear must not clip buttons off-screen; at 390×844 drop or reduce shear on controls, keep the colour language).

### Serial visual task queue

| ID | Status | Surface | Primary stills |
|---|---|---|---|
| **TASK-V-001** | **done** | Motion tokens + shared primitives | (all; no screen rebuild yet) |
| **TASK-V-010** | **done** | Main menu idle | `hud/first menu 1.png` |
| **TASK-V-011** | **done** | Main menu button system | `hud/first menu 2.png`, `first menu 3.png`, `first menu on hover.png` |
| **TASK-V-012** | **done** | Toolbar + hover tooltips | `hud/first menu 2.png`, `songselct onhober playing.jpg`, `onhover smth else.jpg`, `on hover top bar smth.jpg` |
| **TASK-V-013** | skipped | Now-playing overlay | `hud/songselct onhover playing songs.jpg` |
| **TASK-V-020** | **done** | Song Select shell + footer + parked cookie | `song-select/song select.png`, `hud/songslect (2).jpg` |
| **TASK-V-021** | **done** | Carousel (collapsed + expanded) | `hud/songslect.jpg`, `hud/songselect.jpg`, `hud/songslect (2).jpg` |
| **TASK-V-022** | **done** | Left title / stats / ranking | `hud/songselect.jpg`, `hud/songslect (2).jpg` |
| **TASK-V-023** | pending | Search / star / sort / group | `hud/songselect.jpg` |
| **TASK-V-024** | pending | Options popover | `hud/option menu.png` |
| **TASK-V-030** | pending | Mod Select overlay chrome + columns | `hud/mod menu.png`, `hud/mods.jpg` |
| **TASK-V-031** | pending | Mod selection, tooltips, rate, unranked | `hud/mod2.jpg`, `hud/mod3.jpg`, `hud/modunranked.jpg` |
| **TASK-V-032** | pending | Mod Customise dropdown | `hud/modcustomise.jpg` |
| **TASK-V-040** | pending | Beatmap listing (Browse) | `hud/beatmaplisting.jpg`, `hud/beatmaplistingnosongs.jpg` |
| **TASK-V-050** | pending | Player loader | `hud/pre game stage.png` |
| **TASK-V-060** | pending | Playfield notes / holds / receptors / colours | `playfield-4k/*` |
| **TASK-V-061** | pending | Argon HUD | `playfield-4k/Screenshot *.png`, `osu_2026-09-12_19-55-*.jpg`, `19-56-*.jpg` |
| **TASK-V-062** | pending | Countdown + judgement popups | `playfield-4k/Screenshot 2026-09-12 192820.png`, `192641.png` |
| **TASK-V-063** | pending | Replay spectator HUD / playback overlay | `playfield-4k/osu_2026-09-12_19-55-50.jpg`, `19-55-36.jpg` |
| **TASK-V-070** | pending | Pause overlay | `pause/pausef.png` |
| **TASK-V-071** | pending | Fail overlay | `pause/failed.png` |
| **TASK-V-080** | pending | Results | `results/osu_2026-09-12_19-51-20.jpg`, `19-51-31.jpg` |

**Next visual task: TASK-V-023.**

---

### TASK-V-001 — Motion tokens + shared primitives

**Status:** done (2026-09-12). No full screen redesign in this task.

**Work:**

1. Add `html[data-ui="lazer"]` (set from `App` when the Argon/lazer chrome is active).
2. CSS variables for every token in **§ Lazer motion language**.
3. Shared primitives (new folder e.g. `src/ui/lazer/`):
   - `Shear` wrapper (`skewX(-11.31deg)` + unshear children)
   - `LazerCookie` — pink disc `#e967a1`, white ring, inner triangles, spectrum bars hook, BPM pulse hook. **No “osu!” text.** Placeholder “RM” is fine until branding art exists.
   - `FooterBackButton` — pink sheared pill, `< Back`, matching `song-select/song select.png`
   - Motion helpers: `lazerEase`, durations as named constants
4. `prefers-reduced-motion` media + a `useReducedMotion` path.
5. Do **not** restyle MainMenu/SongSelect yet. Wire the attribute and tokens only. A tiny Story-less smoke: cookie renders in isolation or behind a `?debug=lazer-cookie` is optional; Playwright on `/` confirming `data-ui="lazer"` and cookie tokens is enough.

**Files (expected):** `src/index.css` or a new `src/ui/lazer/tokens.css`, `src/ui/lazer/motion.ts`, `src/ui/lazer/LazerCookie.tsx`, `src/ui/lazer/Shear.tsx`, `src/ui/lazer/FooterBackButton.tsx`, `src/App.tsx` (attribute only).

**Verify:** `npm run lint` && `npm test`. Playwright: `/` has `data-ui="lazer"`. Reduced-motion CSS present. No visual claim that the menu now “looks like lazer.”

**Verification (done):** `npm run lint` pass; `npm test` 352/352 including `tests/task-v-001-lazer-tokens.test.ts`. Playwright `/` → `html[data-ui="lazer"]` + cookie CSS vars; menu chrome unchanged. `?debug=lazer-cookie` renders RM cookie + sheared Back. 390×844 drops shear (`--lazer-shear: 0deg`).

---

### TASK-V-010 — Main menu idle

**Status:** done (2026-09-12).

**Stills:** `hud/first menu 1.png`

**Work:** Rebuild `MainMenu.tsx` idle state.

- Full-viewport dark blue triangle field (`#1a2332`–`#0d1520` range). Filled triangles drift slowly; outline triangles spawn and fade (~120ms fade, new triangle ~every 22ms in lazer — cap spawn rate in the browser so it stays cheap; visual density like the still).
- Centre `LazerCookie`, large. Spectrum bars radiate from the ring (audio analyser when menu music/preview is playing; idle 60 BPM pulse if silent).
- **No** button strip, **no** toolbar, **no** stacked Play/History/Skins cards.
- Click cookie, Enter, or any non-modifier key → go to top-level (implemented in V-011; this task may leave a stub state flag).
- Custom cursor is **not** required (browser cursor is fine). Do not ship the osu! cursor bitmap.

**Feel:** cookie scale-pulses on beat (small, ~4% amplitude, damped). Triangles are ambient, not a loading spinner.

**Verify:** Playwright 1280×720 vs `first menu 1.png` — cookie centred, no bar, triangle field present. 390×844: cookie still centred and tappable.

**Verification (done):** `npm run lint` pass; `npm test` 356/356 including `tests/task-v-010-main-menu-idle.test.ts`. Playwright `/` at 1280×720: navy triangle field, centred RM cookie (640×360 in 1280×720), spectrum, no header/bar/cards. Click cookie / Enter / letter key → `data-menu-phase="top-level"` (stub, no button strip). Esc → idle. 390×844: cookie 200×200 centred (195, 422) and tappable. Reduced motion: pulse and idle-bar animations `none`. `/select` still shows the legacy header.

---

### TASK-V-011 — Main menu button system

**Stills:** `hud/first menu 2.png`, `first menu 3.png`, `hud/first menu on hover.png`

**Work:** Implement lazer `ButtonSystem` states: `Initial` (V-010) → `TopLevel` → `Play`.

Top-level (from still 2/3):

- 100px-tall grey strip (`--lazer-bar-gray`) across the viewport, vertically centred.
- Cookie scales to **0.5** and sits **on** the strip, overlapping Settings on the left and Play on the right.
- Parallelograms (wedge 20px / height 100px), **negative spacing** so they nest: **settings** grey `rgb(85,85,85)` · **play** purple `rgb(102,68,204)` · **edit** orange `rgb(238,170,0)` · **browse** lime `rgb(165,204,0)` · **exit** pink `rgb(238,51,153)`.
- Icon above lowercase label (settings / play / edit / browse / exit).
- Hover: width ×1.5, 500ms OutElastic; icon beat-bounces while hovered.
- Click Play (or cookie while top-level) → Play submenu.
- Click Settings → existing settings overlay (chrome restyle is later; opening it is enough).
- Edit: visible, disabled.
- Browse → listing overlay (stub route/flag until V-040; a placeholder full-screen is OK if V-040 has not landed — do not build the listing UI here).
- Exit → lazer-style confirm (hold or two-click). Confirming returns to idle or shows a short goodbye; do not `window.close()`.

Play submenu (from `first menu on hover.png` — that filename is the **play submenu**, not a hover of Play):

- Settings parallelogram becomes **back** (`rgb(51,58,94)`, left-arrow).
- Right side: **solo** / **multi** / **playlists**, purple family `rgb(102,68,204)` and `rgb(94,63,186)`.
- Solo → `/select`. Multi and Playlists: visible, disabled.
- Back / Esc → top-level.
- Idle timeout may collapse to Initial (lazer does this); 15s is fine.

State animation: contracted width 0, expanded 140px, exploded width ×2 as in **§ Lazer motion language**. Buttons that do not belong to the current state contract or explode; they must not pop.

**Verify:** exercise idle → top-level → play → solo. Screenshot each of the three stills at 1280×720. Hover Play at 2× duration in DevTools and confirm elastic width, not a CSS `ease`. Esc returns. Reduced-motion: bar appears without elastic.

**Verification (done):** `npm run lint` passed (0 errors); unit tests passed (`tests/task-v-011-main-menu-button-system.test.ts` 3/3, `tests/gameplay-logic.test.ts` 14/14). Playwright visual verification verified:
- Viewport 1280×720: Centred 100px bar (`--lazer-bar-gray`), cookie scaled to 0.5 with settings on left and play on right overlapping. Skewed parallelograms with correct hex/rgb tokens (`settings`, `play`, `edit`, `browse`, `exit`).
- Hover: width spring to 210px (1.5×), icon beat bounce.
- Transition to `play` submenu: smooth contraction/expansion with `back` (`rgb(51,58,94)`), `solo` (`rgb(102,68,204)`), `multi` (disabled), `playlists` (disabled).
- Back button / Escape navigates back to top-level.
- Exit button opens exit confirmation modal; confirming gracefully returns to idle cookie state.
- Viewport 390×844: Scaled gracefully with centred layout without overlapping or broken layout.

---

### TASK-V-012 — Toolbar + hover tooltips

**Stills:** `hud/first menu 2.png` top edge; `hud/songselct onhober playing.jpg`; `hud/onhover smth else.jpg`; `hud/on hover top bar smth.jpg`.

**Work:** Persistent top toolbar, ~40px, near-black.

Left: settings gear, home, four ruleset dots (osu / taiko / catch / mania). **Mania is the only active** (cyan underline like the still). Other rulesets visible, disabled.

Right: news, changelog, wiki, social, chat, world, **beatmap listing**, now-playing, then local display name + avatar, clock `h:mm:ss AM/PM` + `running hh:mm:ss`, bell. Wire: Settings, Home (→ menu Initial), **listing** (→ V-040 overlay), **now-playing** (→ V-013). Clock is live. Guest/name is the local display name.

**Hover tooltip** (from the three hover stills): a compact dark panel **below** the icon with **bold title**, grey subtitle, optional **shortcut** on the right (`F6`, `CTRL-B`). Active icon fills **pink**. Do not navigate wiki/news/chat.

Toolbar **hides** on menu Initial (idle cookie) and **shows** after the 200ms logo impact, matching lazer. Present on select, listing, mods, loader, results. Absent during live play (replay overlay is V-063).

**Verify:** tooltips vs the three hover stills. Listing icon goes pink when the listing overlay is open (`hud/beatmaplisting.jpg`). 390×844: collapse to settings + home + listing + clock; do not overflow.

**Verification (done):** `npm run lint` passed (0 errors); all unit tests passed (`363/363` across 30 suites, including `tests/task-v-012-toolbar.test.ts`).
- Left cluster: settings gear, home button, and 4 ruleset buttons (osu!, taiko, catch, mania) with mania active and adorned with a glowing cyan underline.
- Right cluster: aux tools (news, changelog, wiki, social, chat, world), listing button (opens catalog, turns pink when open, shortcut Ctrl+B), now-playing button (shortcut F6, turns pink when open), profile badge (displays user local display name + avatar), live updating clock (`h:mm:ss AM/PM` + `running hh:mm:ss`), and notifications bell with badge.
- Tooltip panel: compact dark floating panel below hovered elements featuring bold title, description subtitle, and optional gold shortcut tag.
- Visibility logic: hides during menu idle and live play; reveals on menu top-level, song select, history, results, and skins.
- Mobile collapse: rulesets, aux tools, profile badge, and running timer collapse smoothly on narrow mobile screens (390×844) without overflow.

**Notification system design (locked):**

All in-game notifications (coming-soon toasts, system events, future real events) share one unified pipeline:

1. **Visual style:** Use the existing `.lazer-coming-soon` pill from the first-menu horizontal bar — dark `rgb(48, 48, 51)` background, rounded pill with info icon, title + detail copy, dismiss × button.
2. **Delivery:** A notification is pushed into the top-right notification panel's list (the bell drawer) immediately when it is created. The unread badge count on the bell increments.
3. **Auto-dismiss toast:** The pill also appears as a floating auto-dismiss toast in the top-right corner (below the toolbar) for a short period (e.g. ~4 s). When the toast auto-disappears, the notification is **not** removed from the panel — it stays in the bell drawer as an unread item.
4. **Manual dismiss:** The user must explicitly dismiss a notification inside the bell drawer (via the × button or "Clear all") for it to be permanently removed. Only then does the badge count decrement.
5. **No fake/seed items:** No hardcoded placeholder notifications are pre-loaded. The panel starts empty. Real events populate it at runtime.
6. **Future wiring:** Any new feature that emits a user-facing notification (e.g. screenshot saved, import completed, update available) must call `pushNotification(title, detail)` via the shared API so it flows through this single system.

---

### TASK-V-013 — Now-playing overlay

**Status:** skipped.

**Stills:** `hud/songselct onhover playing songs.jpg` (dup: `song-select/osu_2026-09-12_19-53-49.jpg`)

**Work:** Clicking the toolbar music icon (or `F6`) opens a small player **under the right side of the toolbar**.

- Cover art, title, artist
- Shuffle, prev, **pause/play**, next, queue
- Thin yellow progress bar along the bottom of the card
- Icon stays pink while open
- Controls the same preview/track the song-select carousel is using. Next/prev can walk the current carousel list.

**Feel:** origin-aware pop from the music icon, 150–200ms OutQuint, scale 0.95→1. Click-outside or F6 again closes. Reduced-motion: fade only.

**Verify:** open from song select vs still. Pause stops preview audio. 390×844: card stays on-screen.

---

### TASK-V-020 — Song Select shell

**Status:** done (2026-09-13).

**Stills:** `song-select/song select.png`, `hud/songslect (2).jpg`

**Work:** Rebuild the frame of `SongSelect.tsx`. Not the carousel guts yet (V-021) and not the left wedge guts yet (V-022).

- Beatmap background, full-bleed. `song select.png` is more blurred; `songslect (2).jpg` shows the BG art more clearly with a dark left wedge. Match **`songslect (2).jpg` / `songselect.jpg`**: readable art, dark translucent left panel, not a uniform blur wash.
- Toolbar from V-012.
- Footer: sheared **Back** (pink, left), **Mods**, **Random**, **Options** (dark). Labels + icons as in the still. Back → main menu (logo shared-element to centre). Mods opens V-030 (stub overlay OK). Random picks another set. Options opens V-024 (stub OK).
- `LazerCookie` parked **bottom-right**, small (~0.2 of menu size), white ring, triangles on, pulse on preview BPM. Clicking it starts the selected chart (lazer: logo is the start control).
- Shared-element transition from menu: cookie travels from strip-centre to bottom-right,  OutQuint, interruptible.

**Verify:** 1280×720 frame vs `songslect (2).jpg` (footer, cookie corner, readable BG, toolbar, dark left panel). 390×844: footer buttons remain tappable; cookie may shrink further. Navigate menu → select → Back and confirm the cookie **moves**, it does not teleport.

---

### TASK-V-021 — Carousel

**Status:** done (2026-09-13).

**Stills:** `hud/songslect.jpg` (collapsed), `hud/songselect.jpg` (expanded + local grade), `hud/songslect (2).jpg` (graveyard expanded).

**Work:**

- Right-aligned stacked set panels. Unselected sets are compact (`hud/songslect.jpg`): title, artist, **RANKED / LOVED / GRAVEYARD / LOCAL** pill, key-count colour dots.
- Selected set **expands**: group header plus one row per difficulty. Expansion is a layout animation (OutQuint, ~200–400ms), not a pop.
- Difficulty rows: `[4K] Easy mapped by …`, star number on a coloured pill, 10-dot meter. Selected difficulty has a bright cyan right bar and sits further left.
- Local grade letter on a difficulty row when this device has a score (`A` on EXPERT in `hud/songselect.jpg`).
- **LOCAL** pill for imported/non-catalog maps (`Odo` in `hud/songslect.jpg`).
- Vertical scroll, current selection vertically centred-ish. Keyboard up/down, wheel, click.
- Enter / cookie starts the selected difficulty.

Do not build Global ranking. Do not add convert diffs if the product filter is mania-only.

**Verify:** collapsed vs `songslect.jpg`; expanded vs `songselect.jpg` and `songslect (2).jpg`. Keyboard moves selection with layout animation.

---

### TASK-V-022 — Left title, stats, ranking

**Status:** done (2026-09-13).

**Stills:** `hud/songselect.jpg`, `hud/songslect (2).jpg` (empty Local). `hud/option menu.png` is the Options popover, not the ranking empty state.

**Work:**

- Top-left: status pill (RANKED green / GRAVEYARD grey / LOCAL), **title** large, **artist** under, preview transport, favourite heart, length, BPM.
- BPM may be a **range** with typical value: `135-520 (mostly 270)` as in `songslect (2).jpg`. Use the map’s timing points; do not invent a single BPM when the map has a range.
- Difficulty line: star pill + `Normal mapped by …`
- Stats row: Notes, Hold Notes, Key Count, Accuracy (OD), HP Drain.
- Tabs: Details | Ranking. Ranking is the default in the stills.
- Ranking toolbar: Scope default **Local**, Sort Score, Selected Mods. Global/Country may exist as closed dropdown items; choosing them shows an offline empty, **not** a sign-in prompt. Live data is Local only.
- Empty Local copy, centred on the left: info icon + **“No records yet!”** (`hud/songselect.jpg`). Do **not** use “Please sign in to view online leaderboards!”
- Score list is this-device history only, score then accuracy.

**Verify:** empty Local vs `songselect.jpg`. A known history row appears when present. Graveyard metadata vs `songslect (2).jpg`. No live Global/RM fetch.

---

### TASK-V-023 — Filters

**Stills:** `hud/songselect.jpg` top-right.

**Work:** Search field (`search…`, match count under, e.g. `64 matches`), **Star Rating** rainbow slider, **Show converts**, Sort / Group / Collection dropdowns. Filtering must actually filter the carousel. Collection can map to favorites if we have no collections model — label it as in the still, implement favorites as the only collection.

**Verify:** type a title, match count updates, carousel filters. Star slider hides out-of-range maps.

---

### TASK-V-024 — Options popover

**Stills:** `hud/option menu.png`

**Work:** Footer **Options** opens a dark rounded panel, centred-left over the select BG.

Rows, in still order:

- General: Manage collections… (may no-op with tooltip if no collections)
- For all difficulties: Delete… (delete set, existing confirm)
- For selected difficulty: Play, Edit (disabled), Details…, Copy link (disabled if no catalog id), Remove from played, Clear all local scores
- Hide (closes)

Do not add History as a new row. Play starts the chart. Clear all local scores uses existing history APIs.

**Feel:** popover origin is the Options button (`transform-origin` at the footer control). 200–250ms OutQuint, scale 0.95→1 + fade. Exit the way it entered.

**Verify:** open/close vs still. Delete and clear remain confirmed. Edit/Copy stay visible and disabled when they must.

---

### TASK-V-030 — Mod Select chrome + columns

**Stills:** `hud/mod menu.png` (left columns), `hud/mods.jpg` (Conversion + Fun).

**Work:** Rebuild `ModSelectOverlay.tsx` chrome and the full column strip. Selection behaviour is V-031.

- Dimmed song select behind.
- Top banner: “Mod Select” + description, close X, search (`tab to search…` when empty).
- **Customise** control top-right (opens in V-032; this task only places the control).
- Horizontal sheared columns, scroll to reach Fun:
  - Personal Presets — yellow (`+` empty slot)
  - Difficulty Reduction — green (EZ, NF, HT, DC, NR, …)
  - Difficulty Increase — red (HR, SD, PF, DT, NC, FI, HD, Cover, FL, AC, …)
  - Automation — blue (AT, Cinema)
  - Conversion — purple (Random, Dual Stages, Mirror, DA, Classic, Invert, CS, Hold Off, One Key, …)
  - Fun — pink (Wind Up, Wind Down, Muted, Adaptive Speed)
- Each row: hex icon, name, one-line description. Hover tooltip with the longer blurb (`hud/mods.jpg` “Feeling nostalgic?”).
- Footer: Back, Mods (green, active), Deselect All, then chart chips (stars, BPM, KC, OD, HP, Ranked, rate).

Keep existing exclusivity rules. Dual Stages stays visible and disabled (TASK-092). Cinema / Wind Up / Muted may be visual-only if not implemented — still render the row.

**Feel:** overlay fades 200ms; columns stagger in 30–80ms left→right, OutQuint. Closing reverses.

**Verify:** 1280×720 vs `mod menu.png`; scroll right vs `mods.jpg`. 390×844: horizontal scroll, footer not clipped.

---

### TASK-V-031 — Mod selection, tooltips, rate, unranked

**Stills:** `hud/mod2.jpg`, `hud/mod3.jpg`, `hud/modunranked.jpg`

**Work:**

- Selected row **fills** with the column colour (NC red in `mod3.jpg`, AT blue in `modunranked.jpg`). Icon inverts to dark on the fill.
- Hover on an unselected mod: dark tooltip with description + **“Incompatible with:”** hex icons (`mod2.jpg` Perfect vs EZ/NF/SD/AT).
- Rate mods (HT/DT/NC/DC) show a **rate pill** on the footer track (`NC 1.00x` in `mod3.jpg`) and scale the BPM chip (180 → 405 at NC).
- Autoplay / other score-ineligible mods: yellow **UNRANKED** pill on the track **and** the footer status chip (`modunranked.jpg`). Ranked chip becomes Unranked yellow.
- Deselect All clears fills, rate pill, and Unranked.

Do not change multiplier math.

**Verify:** select NC vs `mod3.jpg`; select AT vs `modunranked.jpg`; hover Perfect vs `mod2.jpg`.

---

### TASK-V-032 — Mod Customise

**Stills:** `hud/modcustomise.jpg`

**Work:** Customise dropdown from the top-right control.

- Green header “Customise” with caret up while open.
- One section per selected customisable mod (Nightcore: “Speed increase” slider + `NC` chip).
- Origin-aware from the Customise button, 150–200ms OutQuint.
- Slider must actually change NC/DT/HT rate if the ruleset already supports a rate setting; otherwise keep 1.00× and still show the control.

**Verify:** NC selected → open Customise vs still. Close on second click / overlay click.

---

### TASK-V-040 — Beatmap listing (Browse)

**Stills:** `hud/beatmaplisting.jpg`, `hud/beatmaplistingnosongs.jpg`

**Work:** Rebuild `OnlineBeatmapCatalog.tsx` as the **in-client listing overlay** (lazer Browse), opened from menu Browse **or** the toolbar listing icon.

- Full overlay over the current screen; toolbar stays up with the **listing icon pink**.
- Title “beatmap listing” with a **RhythmMania** mark, not the osu! cookie / osu-web “osu!” logomark.
- Search `type in keywords…`.
- Expanded filter rows as in the still: General, Mode, Categories, Genre, Language, Extra, Rank Achieved, Played, Explicit Content. **Mode defaults to osu!mania; other modes are inert.** Categories that this client can honour: Ranked / Loved / Graveyard. Remaining chips may display and no-op rather than be deleted.
- Sort by Title / Artist / Difficulty / Ranked / Rating / Plays / Favourites / Relevance.
- Grid vs list toggles (still shows 3-column grid).
- **Three-column** cards: cover, title, artist, mapper, RANKED pill, key-mode dots, FEATURED ARTIST chip when present.
- Footer **Back** (small pink, bottom-left) closes the overlay.
- Empty query/no hits: centred original empty illustration (do **not** copy the still’s character art) + copy **“… nope, nothing found.”** (`beatmaplistingnosongs.jpg`).
- Download/import uses the **existing** archive download helper. Do not change mirror failover in this task.

**Verify:** populated grid vs `beatmaplisting.jpg`. Nonsense query vs `beatmaplistingnosongs.jpg`. Toolbar listing icon pink while open. 390×844: single column, Back tappable.

---

### TASK-V-050 — Player loader

**Stills:** `hud/pre game stage.png`

**Work:** New screen between Song Select and gameplay (`/play` may keep the route; the loader is the first paint).

- Full-bleed **heavily blurred** beatmap art.
- Centre: small cookie, title, artist, cropped banner, difficulty name, star pill, Source / Mapper.
- Right: three translucent groups with **yellow** sliders/toggles — Visual (Background dim, Background blur, Storyboard/video, Beatmap skins, Beatmap colours, Combo colour normalisation), Audio (Beatmap hitsounds, Audio offset this beatmap), Input (Disable clicks during gameplay).
- Wire dim, blur, hitsounds, and this-beatmap offset to existing settings/sanitizers. Skins/colours/storyboard may be visual toggles no-oping if unsupported.
- Footer Back (pink) returns to select.
- After a short ready delay (or on cookie click), go to countdown (V-062). Do not skip this screen.

**Feel:** metadata fades in; settings groups slide from the right 300–400ms OutQuint.

**Verify:** select → loader matches still. Back returns. Dim slider changes playfield dim on the subsequent play.

---

### TASK-V-060 — Playfield notes, holds, receptors, colours

**Stills:** `playfield-4k/lazer-argon-mania-gameplay.png`, `Screenshot 2026-09-12 192641.png`, `192855.png`, `osu_2026-09-12_19-55-36.jpg` … `19-56-12.jpg`, `argon-column-colours-1k-10k.png`, `argon-column-colour-spec.png`

**Work:** Rebuild Canvas2D Argon drawing in `argonPlayfield.ts` / `Canvas2DRenderer.ts` to the **live gameplay stills**.

- Rice: rounded rect, **filled** chevron pointing to the receptor, **white foot** along the hit edge. Not a stroke-only arrow.
- Hold: darker/opaque body, **minus** icon on the head, white foot on the tail, gradient so stacked LNs separate (see spec still). Live stills `19-55-41` / `19-55-50` show long LN bodies in column colour with a minus head.
- Receptors: pale rounded caps; pressed column **flashes white** (`19-55-36` column 4, `19-55-55` all four).
- Lane tint: translucent column colours matching 4K stills (yellow / orange / pink / purple).
- Column colour table: follow `argon-column-colours-1k-10k.png` **OK** rows and live stills. Do not apply the “UPDATED” mock colours unless a live lazer still shows them.
- Key overlay under receptors: hollow ovals + 3-dot clusters in column colour. Pressed state shows `×` in the oval (`192855.png`).

**Do not** change judgement timing or hold rules.

**Verify:** 4K screenshot vs `192641` / `lazer-argon-mania-gameplay` / `19-56-12.jpg`. Optional 7K/9K colour-only shots vs the 1K–10K chart. Playwright can capture a paused/autoplay frame if AT is available.

---

### TASK-V-061 — Argon HUD

**Stills:** `playfield-4k/Screenshot 2026-09-12 192641.png`, `192855.png`, `osu_2026-09-12_19-55-36.jpg`, `19-55-41.jpg`, `19-55-55.jpg`, `19-56-07.jpg`, `19-56-12.jpg`

**Work:** Rebuild `ManiaHud.tsx` to the **live** stills (they supersede the earlier screenshots where they disagree).

- Top-left health **capsule**: judgement boxes **and the running score drawn as the Argon digit font inside the bar** (`19-55-36` and later). Health fill is the capsule outline/tail, not a separate DOM score.
- Rank pill under the bar: `#1` + avatar + name + score + **accuracy + combo** (`100.00%` / `13x`).
- Centre playfield: combo as the same Argon digit font (`19-55-36` shows `12`; `19-56-07` shows `783`).
- Top-right: ACCURACY wedge and PP wedge. PP cell is **PENAR** (stub `—` or the stub number); **never the label “pp”**.
- **Dual** vertical hit-error meters, left **and** right of the playfield (`19-55-36`).
- Bottom: elapsed `m:ss` left, remaining right, **thin white progress bar** across the full width. Hovering the bar shows remaining + percent (`4:32 (67%)` in `19-56-07.jpg`). Keep the 64-bin density contract if a histogram is already drawn inside/near this bar; do not invent a second progress UI.
- Bottom-right: per-column hit counters `B1 B2 B3 B4` with running counts (`19-56-12.jpg`).
- Right-edge: large blue **visual-settings** gear and a smaller settings gear. Gear opens the same Visual/Audio groups as the player loader (V-050), as a slide-in during pause/replay (wired in V-063 for replay; during live play the gear may open the same panel).

**Verify:** layout vs `19-55-36` / `19-56-12`. Score is inside the capsule. PENAR is not labelled pp. 390×844: HUD readable, not covering receptors.

---

### TASK-V-062 — Countdown + judgement popups

**Stills:** `playfield-4k/Screenshot 2026-09-12 192820.png` (countdown `2`), `192641.png` (`MISS`), `lazer-argon-mania-gameplay.png` + `19-55-36.jpg` (`PERFECT`)

**Work:**

- Centre countdown: dark disc, white arc, large number. Arc drains with the beat. Numbers 3-2-1 then go.
- Judgement popup: spaced tracking letters (`P E R F E C T` cyan, `M I S S` red) at playfield centre, fade/scale OutQuint, particles on Perfect as in the close still.

**Verify:** loader → countdown screenshot. Force a miss in AT-off or a replay and capture MISS typography vs still.

---

### TASK-V-063 — Replay spectator HUD

**Stills:** `playfield-4k/osu_2026-09-12_19-55-50.jpg`, `19-55-36.jpg`, `19-55-41.jpg`

**Work:** When watching a local replay (not a live play):

- Top line: `Watching <name> play <artist> - <title> [<diff>] on <date>` (`19-55-41` / `19-55-50`).
- Right **PLAYBACK** panel: skip-to-start, back, prev, pause, next, forward, skip-to-end; **Playback speed** yellow slider (`1.00x`).
- **VISUAL SETTINGS** + **AUDIO SETTINGS** groups under it — same rows as the player loader, including “Previous play too short to use for calibration” copy when it applies (`19-55-50.jpg`).
- Collapsed state: only the blue gear + small gear (`19-55-36.jpg`). Gear expands the panel (OutQuint, ~200ms).
- Do not show this chrome on a live play. Live play keeps V-061 only.

**Verify:** watch a local replay vs `19-55-50.jpg` (expanded) and `19-55-36.jpg` (collapsed). Pause/seek uses existing replay cursor code; do not change judgement.

---

### TASK-V-070 — Pause overlay

**Stills:** `pause/pausef.png`

**Work:** Rebuild `PauseOverlay.tsx` pause mode.

- Playfield remains visible, **black 0.75**.
- Title `paused` — yellow `#ffcc22`, lowercase, wide letter-spacing (Torus Alternate stand-in: Space Grotesk), **no** extra artist/title/mod chips (those are not in the still).
- Three **full-width sheared** bars, height 80, 2px gap, horizontal inset ~50px: **Continue** green, **Retry** `#eeaa00`, **Quit** `rgb(170,27,39)`. Triangle pattern inside the bars (same family as the menu field).
- Below: `Retry count: **N**` / `Song progress: **N%**` / `Accuracy: **N.NN%**` — exact labels from the still, not `retries:`.
- Fade **200ms Easing.In**. Esc = Continue. R = Retry.
- Do not round the bar ends into a card. They are parallelograms.

**Verify:** 1280×720 vs `pausef.png`. 390×844: bars usable, text not clipped. Reduced-motion: fade only.

---

### TASK-V-071 — Fail overlay

**Stills:** `pause/failed.png`

**Work:** Same overlay family as V-070.

- Title `failed`.
- **Retry** + **Quit** only (no Continue).
- Same stats block.
- Bottom **grey strip** with a centred save/download control (wire to existing replay export if cheap; otherwise visible inert).
- Esc = Quit.

**Verify:** fail a run (or overlay flag) vs `failed.png`.

---

### TASK-V-080 — Results

**Stills:** `results/osu_2026-09-12_19-51-20.jpg` (centre A, side #2), `results/osu_2026-09-12_19-51-31.jpg` (centre C, side #1).

Those captures are **osu!standard** (slider tick / slider end). Copy **chrome, layout, and motion**. Do **not** port slider rows into mania. Mania stats use Perfect → Great → Good → Ok → Meh → Miss. The PP cell is **PENAR** (stub `—`), never labelled “pp”.

**Work:** Rebuild `ResultsScreen.tsx`.

- Full-bleed **blurred** beatmap background. Toolbar from V-012.
- **Centre card:** avatar overlapping the top edge, local display name, title, artist, **grade ring** with coloured judgement segments and a huge grade letter, big score, star pill + small circle, difficulty name, mapper.
- Stats grid under the score: ACCURACY, MAX COMBO (`n/n`), PENAR; then the six mania judgements; hold-related counts if we already store them (do not invent slider tick/end).
- Played-on date at the bottom of the card.
- **Side card(s):** other local scores for this chart. Rank `#n`, avatar, name, judgement mini-list, max combo, accuracy, score, grade letter on a coloured chip. `19-51-20` shows the lower score as `#2` on the right; `19-51-31` shows the higher score as `#1` on the left after swap.
- Clicking a side card **swaps** it into the centre (shared-element / layout animation, OutQuint ~300ms). The previous centre score becomes the side card.
- Footer: pink **back**, wide green **export/download** (checkmark when saved), two dark icon buttons (score list / favourite). Back → song select. Export uses existing local replay export.
- No Global/Country/online panels.

**Feel:** card scales in from ~0.95 + fade, 300–400ms OutQuint, after gameplay. Side cards stagger 50ms after the hero.

**Verify:** a run that produces two local scores — screenshot both “this play in centre” and “other play in centre” vs the two stills. PENAR cell is not “pp”. 390×844: centre card first, side cards stacked under it, footer tappable.

---

## PR grouping (when the user allows more than one task per PR)

- **PR-V1:** TASK-V-001
- **PR-V2:** TASK-V-010 + V-011 + V-012 + V-013 (main menu + toolbar + now-playing)
- **PR-V3:** TASK-V-020 … V-024 (song select)
- **PR-V4:** TASK-V-030 + V-031 + V-032 (mods)
- **PR-V5:** TASK-V-040 (listing)
- **PR-V6:** TASK-V-050 (player loader)
- **PR-V7:** TASK-V-060 + V-061 + V-062 (play)
- **PR-V8:** TASK-V-063 (replay HUD)
- **PR-V9:** TASK-V-070 + V-071 (pause/fail)
- **PR-V10:** TASK-V-080 (results)

Default remains **one pending task at a time**. Each implementation PR: `npm run lint` && `npm test`. Visual PRs: Playwright 1280×720 + 390×844 vs the mapped stills.

Escape hatch: `skinId` → `rhythmmania` and `data-skin=legacy` must still render the old skins. Lazer chrome is the default Argon path.

---

## Future directions (not the current queue)

| ID | Direction |
|---|---|
| **TASK-090** | Implement `computePenar`. Still **never** labelled pp. |
| **TASK-091** | WebGL2 note instancing **only if** Canvas2D profiling proves >8ms paint on 20k-note maps. |
| **TASK-092** | Dual Stages / 2P input. Skip until two input maps exist. |
| Nightcore | Extra NC tick/pitch polish if still short of lazer. Rate UI is V-031/V-032. |
| Global settings overlay | No dedicated still. Player-loader (V-050) and replay visual settings (V-063) lock the yellow-slider language. Do not restyle the global settings drawer until a still exists. |
| History / Skins screens | No stills. Keep routes working; do not invent lazer chrome for them. |

Do not add Pixi/Three for 2D Argon. Do not restore Google, Postgres, global boards, or replay upload. Do not reopen a TASK-C catalog queue from this file.

---

## Open questions

**Resolved**

1. Brand vs playfield: Argon-close in play; RhythmMania cookie/wordmark on menu. Never ship “osu!”.
2. Local ranking sort: total score desc, then accuracy.
3. Pause/fail label: **Quit**, as in the stills.
4. Song Select: **V2** still.
5. Typography: Inter / Space Grotesk / JetBrains Mono.
6. Visual spec: `visual-refs/` only. `DESIGN.md` ignored. Current UI is not the target.
7. Catalog backend: not in this queue.
8. Results chrome: shipped lazer card from `visual-refs/results/`. Mania judgements, PENAR instead of pp, no slider rows.
9. Local empty ranking: “No records yet!”

**Pending**

10. Whether disabled Edit / Multi / Playlists should stay forever or hide behind a flag later. Default: stay visible and disabled.
11. Menu Exit confirm copy (browser cannot quit an app). Default: confirm → return to idle cookie.
12. Listing empty illustration: original drawing vs a geometric placeholder. Default: original (no copied character).

---

## Risks

- Rebuild will look “worse” mid-queue while menu is lazer and select is still old. That is expected; do not mix surfaces inside one task to hide it.
- Canvas vs osu!framework clocks will not be bit-identical.
- Triangle field and elastic hover can be expensive; cap particle count; keep playfield on Canvas2D.
- Shear at 390×844 must not clip hit targets — drop shear on small viewports, keep colour.
- PENAR stub must look intentional (`—`).
- Visual-ref PNGs/JPGs stay in `visual-refs/` — never `public/`.
- Results stills are standard-mode; do not ship slider tick/end on a mania results card.
- Listing empty-state character in `beatmaplistingnosongs.jpg` is not ours to copy.
- Do not copy osu-resources audio. UI ticks can be original one-shots; silence is better than a ripped osu sample.

---

## First session after this revision

**TASK-V-001 is done.** Next is **TASK-V-010** (main menu idle).

After **every** TypeScript change: `npm run lint` && `npm test`. After **every** visual task: Playwright vs the mapped stills. `npm run build` when Vite/CSS/chunks change.
