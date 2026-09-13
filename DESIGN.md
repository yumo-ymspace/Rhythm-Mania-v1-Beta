# RhythmMania Visual Design Specification

**osu!(lazer) client chrome, recreated in-browser**

| Field | Value |
|---|---|
| **Document** | RhythmMania visual / interaction design specification |
| **Author** | Design (draft) |
| **Date** | 2026-09-12 |
| **Status** | Draft |
| **App version** | `v0.9.8` (`metadata.json` / `index.html`); `package.json` `"version": "latest"`. Visual target for remaining `TASK-V-*` work. |
| **Visual SoT** | Every still under `visual-refs/` (measured). Not the previous `DESIGN.md`. Not the current React chrome. |
| **Behaviour SoT** | `plan.md` product IA, except where this document records a **user-locked override** |
| **Audience** | Senior engineers implementing the lazer visual rebuild |

This is a **visual and interaction specification**, not a backend architecture document. Gameplay windows, scoring, holds, HP, and mods multipliers are already shipped (`TASK-001`–`082`) and must not be reopened here. Catalog **chrome** is in this spec; catalog **search/download hosts** are not — see Key Decisions.

---

## Overview

RhythmMania is an **offline osu!(lazer)-style mania client in the browser**. The current screens are product-complete enough to play, import, score locally, and download from mirrors, but their chrome is not the lazer client. This spec rebuilds every session surface from the captures in `visual-refs/` so an engineer can implement layout, colour, type, motion, and states **without opening osu!**.

The proposed solution **extends the in-tree lazer UI module** (`html[data-ui="lazer"]` via `applyLazerChrome`, `src/ui/lazer/tokens.css`, `LazerCookie`, `Shear`, `FooterBackButton`, `motion.ts`). It recreates osu!(lazer) geometry in original CSS/canvas: sheared parallelograms, the RhythmMania cookie (never the osu! mark), Argon playfield (Canvas2D source of truth), Local-only ranking, and a PENAR slot where lazer shows PP. Official artwork, the pink-circle osu! logo, Torus, “ppy”, and osu-resources bitmaps are **not shipped**. Brand text is **RhythmMania**. Performance rating is **PENAR**, never labelled “pp”.

---

## Background & Motivation

`plan.md` locks the mechanical target to current lazer mania and the visual target to `visual-refs/`. The previous `DESIGN.md` described an arcade/indigo/cyan language that is **not** this product. `docs/lazer-visual-plan.md` does not exist. Remaining work is the serial `TASK-V-*` queue plus the surfaces this spec adds (global toolbar, PlayerLoader, in-client listing overlay, coming-soon wedges).

Pain points this spec removes:

- Implementers guessing pixels from memory or mixing stills of different resolutions.
- Product-IA drift (Global boards, osu! API search, Google login) leaking back into chrome.
- Shipping trademarked marks, mascots, or Torus.
- Treating Babylon 3D as the Argon source of truth.

Current implementation starting points (rebuild targets, not visual truth): `src/components/MainMenu.tsx`, `SongSelect.tsx`, `ManiaHud.tsx`, `ModSelectOverlay.tsx`, `OnlineBeatmapCatalog.tsx`, `PauseOverlay.tsx`, `ResultsScreen.tsx`, `GameplayCanvas.tsx`, `src/render/argonPlayfield.ts`, `src/render/argonSkin.ts`, `src/index.css`. Shared chrome already lives in `src/ui/lazer/` (imported from `src/index.css`; `App.tsx` calls `applyLazerChrome`). `plan.md` may still mark TASK-V-001 pending; the tree has moved — new work is a **delta**, not a greenfield duplicate.

---

## Goals & Non-Goals

### Goals

1. Recreate lazer **session chrome** from the stills, including idle motion, hover, enter/exit, and reduced-motion.
2. Give every surface: layout regions + z-order, 1366×768 design units **and** a CSS mapping rule, sampled colour tokens, type, geometry, states, motion, and a “what is not copied” list.
3. Keep the offline product: Local ranking only, device history (`rhythm_mania_v1_play_history` / IndexedDB). Listing **chrome** matches lazer; search/download stay on the live helper until a non-visual catalog task lands.
4. Keep Canvas2D Argon as the playfield visual/latency source of truth. Babylon is an extra skin.
5. Preserve equal-width mania lanes, 64-bin density histogram, judgement display names Perfect → Great → Good → Ok → Meh → Miss, and the PENAR stub (`—`).

### Non-Goals

- Computing a real osu! pp / PENAR formula (TASK-090).
- Playable osu! / taiko / catch, editor, multiplayer, playlists, storyboards, chat, wiki, medals, skin JSON editor.
- Google OAuth, RM accounts, PostgreSQL, global/RM leaderboards, replay upload.
- Mixing catalog **backend** (hosts, auth, failover) into a visual PR. Live search is still Bearer + `/api/catalog/search`; live download is Catboy then osudl.org on 404. Planned unauthenticated hinai / osu.direct / Catboy hosts live in the retired `TASK-C-*` contract if revived — a **dependency of the listing product**, not of overlay chrome.
- Restyling Settings / Skins / History chrome in the current visual queue (`plan.md`: no stills; keep routes working). Those surfaces are specified only as a gated appendix.
- Copying `osu-resources` bitmaps, samples, the osu! wordmark, official mascots, or Torus.
- Redesigning `limitDprToOne` (sanitizers always write `false`).
- Reopening TASK-001–082 mechanics.
- Pixel-identical match to `osu.exe` GPU output. Fail the review if HUD corners, note construction, chrome family, or branding are wrong.

---

## Key Decisions

User-locked (do not re-open) plus architectural choices this spec had to make.

| Decision | Choice | Rationale |
|---|---|---|
| Catalog chrome vs data | **Chrome** (this spec / visual PRs): in-client overlay from `hud/beatmaplisting.jpg` + `beatmaplistingnosongs.jpg`. Ignore osu-web PNGs. Consumes **whatever search API exists**. **Live hosts:** `GET /api/catalog/search` (Bearer osu! token; 401 “Connect osu! to search the catalog”) and download `https://catboy.best/d/<id>` then, on HTTP 404 only, `https://osudl.org/s/<id>` (`osuTokenManager.ts`). **Planned hosts** (product IA / `TASK-C-*` if revived, **not** a visual PR): unauthenticated search hinai → osu.direct → Catboy; download Catboy → osu.direct → hinai; token-gate removed. Overlay chrome **must ship** against the live helper; do not wait for hinai/osu.direct. | User lock on chrome. `plan.md` forbids mixing catalog backend into a visual task. |
| Main menu options | Show **all** lazer options (settings, play, edit, browse, exit; play → solo / multi / playlists). Unavailable items visible, slightly greyed, “Coming soon”. | User lock. Do not delete chrome to simplify. |
| Global toolbar | Recreate the stills **except omit** ruleset icons, news, chat, social. Keep settings, home, changelog, wiki, beatmap listing, globe, now-playing, local name + avatar, clock, bell. Out-of-scope destinations: greyed / coming-soon unless a real route exists. | User lock (overrides `plan.md` TASK-V-012 ruleset dots). Rankings (people) is present in stills between wiki and listing; **keep it, coming-soon** — it was not in the omit list. |
| Pause / fail red button | Label **Quit**, not Exit. Keep `onExit` / `pause-quit-btn` ids. | User lock; stills win over older plan copy. |
| Song Select ranking | Lazer chrome (Details / Ranking, Scope / Sort / Selected Mods) but **Local only**. No Global tab. No “Please sign in to view online leaderboards!”. Empty copy **“No records yet!”**. | User lock. Stills that show Global + sign-in (`song-select/song select.png`) are layout references only for the rest of V2. |
| Results | Layout from `visual-refs/results/osu_2026-09-12_19-51-20.jpg` and `19-51-31.jpg` (osu!standard captures). Adapt judgements to mania; PP cell → **PENAR** (`—` while stubbed). After a just-finished play, add Retry / Replay without breaking the history-browse footer. | User lock. See §12 for the mapping. |
| PlayerLoader | **Include**, matching `hud/pre game stage.png`. Replace osu! mark with RhythmMania cookie. | User lock. First paint of `/play`. |
| Coordinate system | Stills are **1366×768 du**. Toolbar/footer **bars** are `100%` viewport. Listing **panel** is inset (x=102–1264 du desktop; 8px inset compact — not edge-to-edge). Only **inner** sizes multiply `--rm-u`. Desktop ≥721px: `--rm-u: min(100vw / 1366, 100vh / 768)` in CSS. ≤720px: `--rm-u: 1`. Chrome shear-off at **`max-width: 720px`** (axis-aligned compact band). | User-required dual labelling. 1365×767 PNGs are 1px crops of 1366×768. |
| Coming-soon pattern | Opacity **0.50**, no grayscale wash that changes hue, `cursor: default`, click no-op, tooltip **“Coming soon”**. Hover captions still show the lazer title/subtitle. | One pattern for menu wedges, toolbar icons, mods, listing filters, and footer extras. |
| Listing mode | **osu!mania locked selected**. Other modes visible, greyed, unclickable. Converts dropped (Show converts greyed on Song Select). | Product is mania-only. |
| Empty listing art | Keep layout + copy **“… nope, nothing found.”** Do **not** copy the empty-listing character. Type-only empty state; optional original triangle-field motif in the illustration slot. | Legal: official mascots are not ours. |
| Logo | Pink disc `#e967a1`, white ring, inner triangles, spectrum bars, **“RM”** (or RhythmMania wordmark if art exists). Never “osu!”. | Legal + still construction. |
| Fonts | **Inter / Space Grotesk / JetBrains Mono**. Torus is forbidden. Space Grotesk stands in for Torus Alternate on large titles. PR-V1 **extends** the Google Fonts query with Space Grotesk **600**. Score/combo use JetBrains Mono **700** (already loaded) — do not specify 800–900. | User lock + current `src/index.css` weights. |
| Argon column colours | Cite `getArgonColumnColor` / `argonPaletteForKeyCount` in `src/render/argonSkin.ts`. Do **not** apply “UPDATED” mock rows from the colour-spec stills. | Live gameplay stills + shipped table. |
| Results action mapping | History-browse footer from stills: Back, download (green), playlist (coming-soon), heart (favourite). **Just-finished play** inserts Retry + Replay (watch) in the gap between Back and the green cluster **without translating** Back or green. Exact widths in §12. Compact wrap/priority in §12 / §16. | User lock; stills lack Retry/Replay because they are history browse. |
| Song Select V2 wedge | Decorative left metadata **500 du ±20** on desktop. No shear at 390×844. | User lock (~480–520). |
| Density histogram | 64 bins in map time, rate-invariant (`computeSongDensityBins`). | Already shipped; HUD must keep it. |
| Canvas2D vs Babylon | Canvas2D Argon is SoT. Babylon (`rhythmmania-3d`) is an **EXTRA** skin, not Argon SoT and not a visual review target. | Existing renderer split. TASK-090 is the PENAR formula, not skins. |
| Shared primitives | **Delta** on `src/ui/lazer/` (`tokens.css`, `applyLazerChrome`, `LazerCookie`, `Shear`, `FooterBackButton`, `motion.ts` / `useLazerReducedMotion`). Add `ComingSoon` and `--rm-u`. Do not duplicate files. | Tree already shipped V-001 primitives. |
| Display name | Persist `localDisplayName: ''`. Render fallback **`Guest`** (stills: menu chip, pause rank pill). One constant. | `defaultSettings.ts` empty; `SongSelect.tsx` already falls back to Guest. |
| Parked cookie | **200 du** diameter (±20 du still-diff). Stills win over plan’s ~0.2× menu (~96 du). | Measured clipped disc on Song Select stills. |
| Rankings toolbar icon | Keep, **coming-soon** (no global boards). | Present in stills; not in the omit list. |
| PlayerLoader fields | See §7 table. `backgroundDim` exists. Play blur: **coming-soon**. Hitsounds toggle = `hitsoundVolume > 0`. Per-map offset: App-owned **`playSessionOffsetMs: number`** (not `GameSettings`). PlayerLoader writes it; App passes `settings.audioOffset + playSessionOffsetMs` into `GameplayCanvas`; **clear on leaving `/play`**. Do not persist via `sanitizeSettings`. Auto-advance: **decode + 400ms**. | Still has no click-to-start; do not invent persistence in a visual PR. |
| History entry | Keep route `/history`. Add Song Select Options → **View play history**. Results already browses local scores. **No** main-menu History wedge (lazer has none). Settings / Skins / History **chrome restyle is gated** (appendix; not PR-V15–V17 in the current queue). | `plan.md` forbids inventing those screens without stills; menu rebuild must not orphan History. |
| Cinema | `CN` stays the shipped cinema/autoplay path (`GameplayCanvas` hides `.playfield-chassis-container`). Do **not** alias to `disableVideo`. | Still: “Watch the video without visual distractions.” |
| Exit confirm | Copy **“Return to the title screen?”**. Confirm → menu **Initial**. Never `window.close()`. | User lock. No still. |
| Details tab | Source, tags, mapper. Inter 13. Spacing unverified (no filled still). | User lock. |
| Toolbar extras | Changelog, wiki, globe, **notifications bell**: **coming-soon**. Do **not** open osu! web. | User lock. Rankings already coming-soon. |
| Results grade ticks | Infer from lazer MIT (`AccuracyCircle` / `GradedCircles` / `ScoreProcessor`). Stills remain SoT for A and C placement. SS/S/F from source. See §12. | User lock. |
| Listing view | **Grid only.** No working list view. Omit the list-mode button (still shows grid + list icons; ship grid only, active). | User lock. |
| Calibration copy | In-play overlay: keep still string **`Previous play: Previous play too short to use for calibration`** (red) when the offset wizard has no sample. | User lock. |

---

## Stills inventory

All paths relative to `visual-refs/`. Native sizes measured with Pillow. **1365×767 PNG** captures are treated as **1366×768 du** (1px crop). Cropped playfield screenshots are **not** full-frame; use the 1366×768 HUD JPEGs as HUD SoT and the crops as note/receptor close-ups.

| Still | Native px | Surface |
|---|---|---|
| `hud/first menu 1.png` | 1365×767 | Main menu idle |
| `hud/first menu 2.png` | 1365×767 | Main menu top-level + toolbar |
| `hud/first menu 3.png` | 1365×767 | Same top-level (clock tick) |
| `hud/first menu on hover.png` | 1365×767 | Play submenu (filename is the submenu, not a Play hover) |
| `hud/option menu.png` | 1365×767 | Song Select Options popover |
| `hud/pre game stage.png` | 1365×767 | PlayerLoader |
| `hud/mod menu.png` | 1365×767 | Mod Select (reduction + increase + automation) |
| `hud/mods.jpg` | 1366×768 | Mod Select scrolled (conversion + fun + tooltip) |
| `hud/mod2.jpg` | 1366×768 | Incompatibility tooltip |
| `hud/mod3.jpg` | 1366×768 | Nightcore selected + rate slider |
| `hud/modcustomise.jpg` | 1366×768 | Customise dropdown |
| `hud/modunranked.jpg` | 1366×768 | Autoplay + UNRANKED badge |
| `hud/songselect.jpg` | 1366×768 | Song Select V2 expanded + Local empty |
| `hud/songslect.jpg` | 1366×768 | Carousel collapsed |
| `hud/songslect (2).jpg` | 1366×768 | Graveyard set expanded, Local empty |
| `hud/songselct onhober playing.jpg` | 1366×768 | Toolbar “now playing” hover caption |
| `hud/songselct onhover playing songs.jpg` | 1366×768 | Now-playing popover |
| `hud/on hover top bar smth.jpg` | 1366×768 | Toolbar “wiki” caption |
| `hud/onhover smth else.jpg` | 1366×768 | Toolbar “beatmap listing” caption |
| `hud/onhover smth.jpg` | 1366×768 | Now-playing popover (same as playing-songs) |
| `hud/beatmaplisting.jpg` | 1366×768 | **In-client listing** (target) |
| `hud/beatmaplistingnosongs.jpg` | 1366×768 | Empty listing (copy only; no character art) |
| `pause/pausef.png` | 1365×767 | Pause |
| `pause/failed.png` | 1365×767 | Fail |
| `playfield-4k/lazer-argon-mania-gameplay.png` | 1287×1029 | Argon notes/holds/receptors close-up |
| `playfield-4k/argon-column-colour-spec.png` | 2459×5668 | Geometry notes; **not** the colour table to ship |
| `playfield-4k/argon-column-colours-1k-10k.png` | 2396×1600 | 1K–10K; ship **OK** rows only |
| `playfield-4k/Screenshot 2026-09-12 192641.png` | 1114×646 | Cropped 4K HUD + miss |
| `playfield-4k/Screenshot 2026-09-12 192820.png` | 1133×621 | Countdown |
| `playfield-4k/Screenshot 2026-09-12 192855.png` | 1137×626 | Key overlay press |
| `playfield-4k/osu_2026-09-12_19-55-36.jpg` … `19-56-12.jpg` | 1366×768 | Full Argon HUD, spectator, playback overlay |
| `results/osu_2026-09-12_19-51-20.jpg` | 1366×768 | Results (this play) + side card |
| `results/osu_2026-09-12_19-51-31.jpg` | 1366×768 | Results browsing another local score |
| `song-select/song select.png` | 1365×767 | V2 shell (Global in still — **do not ship Global**) |
| `song-select/osu_2026-09-12_19-53-*.jpg` | 1366×768 | Duplicates of hud song-select / toolbar hovers |

**Ignore as implementation targets:** `hud/beatmaplisting.png`, `beatmaplistingonhover.png`, `beatmaplistingonhover2.png` if they remain (osu-web).

---

## Design coordinate system

osu!(lazer) stills in this repo are window captures at **1366×768**. Lazer source authors some overlays against `ScalingContainerTargetDrawSize = (1024, 768)` (`OsuGame.cs`); **this spec does not mix those spaces**. Every number labelled **du** is a pixel on a 1366×768 still.

C# constants (`Toolbar.HEIGHT = 40`, `ButtonArea.BUTTON_AREA_HEIGHT = 100`, `ButtonSystem.BUTTON_WIDTH = 140`, `WEDGE_WIDTH = 20`) are **source defaults**. PNG measurements are **stills**. Where they disagree, stills win for still-diff; cite both (e.g. strip **96 du measured / 100 du C#**, ±4 du tolerance).

### CSS mapping

Extend `src/ui/lazer/tokens.css` (already imported from `src/index.css`). Existing `--lazer-shear: -11.31deg` is an angle, not a `skewX()` function — keep that shape.

```css
@media (min-width: 721px) {
  html[data-ui="lazer"] {
    --rm-u: min(100vw / 1366, 100vh / 768);
  }
}
@media (max-width: 720px) {
  html[data-ui="lazer"] {
    --rm-u: 1; /* do not shrink hit targets */
    --lazer-shear: 0deg;
    --lazer-unshear: 0deg;
  }
}
```

No JS or container-query fork. `--lazer-shear` remains an angle token (`-11.31deg` desktop).

**What multiplies `--rm-u`:** inner widths/heights, font-size, padding, gap, cookie size, card size, icon glyphs. **What does not:** toolbar/footer **bar width** (`100%` viewport), overlay scrim, playfield canvas backing store. Listing **panel** is not 100% — inset 102–1264 du (§5).

A size of `N` du becomes `calc(N * var(--rm-u))` on desktop. Compact (≤720px CSS or 390×844): **axis-aligned** (chrome shear-off at 720px), min tap **44 CSS px**, no `--rm-u` shrink.

**Playfield canvas** sizes to the actual backing store (`desynchronized` 2D context). Never mix unlabeled px from the cropped 1114×646 screenshots with 1366×768 du. Remaining “ish” sizes in this spec are replaced with a **single du ± tolerance**.

---

## Proposed Design

### 1. Design tokens & type scale

Scope: chrome tokens on `html[data-ui="lazer"]` **in the existing** `src/ui/lazer/tokens.css`. Argon playfield tokens stay on `html[data-skin="argon"]`. Do not restyle legacy skins. Do not create a second tokens file.

#### Motion (from osu!framework + `plan.md`; do not substitute Tailwind `ease-out`)

| Token | Value | Use |
|---|---|---|
| `--lazer-ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Settle (overlays, logo scale, carousel) |
| `--lazer-ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Logo return; button contract; click flash |
| `--lazer-ease-in-sine` | `cubic-bezier(0.12, 0, 0.39, 0)` | Button-bar flatten |
| `--lazer-ease-in-out-sine` | `cubic-bezier(0.37, 0, 0.63, 1)` | Hover icon tilt on beat |
| `--lazer-ease-out-elastic` | Motion spring `{ type: "spring", duration: 0.5, bounce: 0.35 }` | Menu button **hover width only** |
| `--lazer-motion-overlay` | `200ms` + Easing.In | Pause/fail (`GameplayMenuOverlay.TRANSITION_DURATION`) |
| `--lazer-motion-toolbar` | `500ms` OutQuint | Toolbar slide (`Toolbar` `transition_time`) |

Properties: `transform` and `opacity` only (shear is a transform). Never `transition: all`. Never `scale(0)` for menu buttons — they collapse on **width**.

#### Chrome colours (sampled + lazer source)

| Token | Hex / rgb | Sample / source |
|---|---|---|
| `--lazer-pink` | `#e967a1` | Cookie fill (plan + menu2 cookie `#ea5e9d`) |
| `--lazer-pink-light` | `#ff7db7` | Cookie inner triangles |
| `--lazer-cookie-ring` | `#ffffff` | Idle ring |
| `--lazer-yellow` | `#ffcc22` | `paused` / `failed` titles |
| `--lazer-yellow-dark` | `#eeaa00` | Retry; sampled pause retry `#eeaa00` / `#f4af00` |
| `--lazer-green` | `#88b300` | Continue; sampled pause Continue |
| `--lazer-quit` | `rgb(170, 27, 39)` `#aa1b27` | Quit; sampled |
| `--lazer-play` | `rgb(102, 68, 204)` `#6644cc` | Play / Solo; sampled |
| `--lazer-multi` | `rgb(94, 63, 186)` `#5e3fba` | Multi / Playlists |
| `--lazer-edit` | `rgb(238, 170, 0)` `#eeaa00` | Edit; sampled |
| `--lazer-browse` | `rgb(165, 204, 0)` `#a5cc00` | Browse; sampled |
| `--lazer-exit` | `rgb(238, 51, 153)` `#ee3399` | Exit; sampled |
| `--lazer-back` | `rgb(51, 58, 94)` `#333a5e` | Menu Back |
| `--lazer-settings` | `rgb(85, 85, 85)` `#555555` | Settings parallelogram; sampled |
| `--lazer-bar-gray` | `rgb(50, 50, 50)` `#323232` | Menu strip; sampled |
| `--lazer-toolbar` | `#191919` | Toolbar; sampled (`OsuColour.Gray(0.1)`) |
| `--lazer-back-footer` | In-tree `#e91e8a` | Keep as mid fill on `FooterBackButton` (min-width **210px**, height **50px** today) |
| `--lazer-back-footer-dark` | `#de31ae` | Add. `ScreenBackButton` darker; sampled `#de31ac` |
| `--lazer-back-footer-light` | `#ff86dd` | Add. `ScreenBackButton` lighter. Gradient/slab uses dark→light; still-diff vs `#de31ae` |
| `--lazer-triangle-bg-dark` | `#172639` | Idle field corner |
| `--lazer-triangle-bg` | `#182439` … `#20324a` | Idle field |
| `--lazer-overlay-scrim` | `rgba(0,0,0,0.75)` | Pause/fail (`background_alpha = 0.75`) |
| `--lazer-coming-soon-opacity` | `0.50` | Disabled chrome |

#### Argon playfield colours (`html[data-skin="argon"]` + `argonSkin.ts`)

Do not redesign. Cite:

```ts
ARGON_COLOUR_SPECIAL = '#a96aff'
ARGON_COLOUR_YELLOW  = '#ffc528'
ARGON_COLOUR_ORANGE  = '#fc6d01'
ARGON_COLOUR_PINK    = '#d5235a'
ARGON_COLOUR_PURPLE  = '#cb3cec'
ARGON_COLOUR_CYAN    = '#48c6ff'
ARGON_COLOUR_GREEN   = '#64c05c'
ARGON_NOTE_HEIGHT = 42
ARGON_NOTE_ACCENT_RATIO = 0.82
ARGON_CORNER_RADIUS = 3.4
ARGON_COLUMN_GAP = 1
--argon-accent: #66ccff
```

`--argon-wedge-radius: 10px` remains for any leftover wedge math; the **HUD stills do not use the old double-wedge** — see §8.

#### Type

| Role | Family | Weight | Size (du) | Tracking | Colour | Transform |
|---|---|---|---|---|---|---|
| Menu button labels | Space Grotesk | 500 | 16 | 0 | `#ffffff` | lowercase |
| `paused` / `failed` | Space Grotesk | **600** | 48 | 5 du | `#ffcc22` | lowercase |
| Song title (select) | Space Grotesk | 700 | **30** | −0.02em | `#ffffff` | none |
| Artist | Inter | 500 | 14 | 0 | `#ffffff` ~80% | none |
| Toolbar icon captions | Inter | 700 / 400 | 14 / 12 | 0 | `#ffffff` | title lowercase |
| Footer Back | Inter | 500 | 18 | 0 | `#ffffff` | none (`Back`) — matches in-tree `FooterBackButton` |
| Footer Mods/Random/Options | Space Grotesk | 500 | 16 | 0 | `#ffffff` | none |
| Score / combo / clocks | JetBrains Mono | **700** | see surface | tabular | `#ffffff` | none |
| Judgement popups | Space Grotesk | **600** | 24 | 0.35em | judgement colour | uppercase, letter-spaced (`P E R F E C T`) |
| Mod row title | Inter | 600 | 14 | 0 | `#ffffff` | none |
| Mod row description | Inter | 400 | 12 | 0 | `#ffffff` 55% | none |
| Listing title | Inter | 500 | 20 | 0 | `#ffffff` | lowercase `beatmap listing` |
| Results grade letter | Space Grotesk | 700 | **120** ±8 | 0 | grade colour | uppercase |
| Coming-soon tooltip | Inter | 500 | 12 | 0 | `#ffffff` | none |

PR-V1 extends the Google Fonts query in `src/index.css` with Space Grotesk **600** (titles). Inter 600 and JetBrains Mono 700 are already loaded. Do not add Torus. Do not specify 800–900.

#### Shared primitives — **delta** on `src/ui/lazer/`

Already shipped (do not recreate):

| File | Role |
|---|---|
| `src/ui/lazer/tokens.css` | `--lazer-*` eases, colours, durations; **extend chrome shear-off to `max-width: 720px`** (in-tree is 480px); cookie default **280px**; footer-back min-width **210px** / height **50px** / fill `#e91e8a` |
| `src/ui/lazer/motion.ts` | `LAZER_*` constants, `applyLazerChrome`, `useLazerReducedMotion`, `resolveLazerChrome` |
| `src/ui/lazer/LazerCookie.tsx` | Disc, ring, triangles, spectrum, `RM` mark. Size is `--lazer-cookie-size` / prop, not a new component |
| `src/ui/lazer/Shear.tsx` | `lazer-shear` / `lazer-unshear` classes |
| `src/ui/lazer/FooterBackButton.tsx` | Pink sheared Back |
| `src/ui/lazer/index.ts` | Public exports |
| `src/App.tsx` | `applyLazerChrome(settings)` |

**Add in PR-V1 (delta only):**

- `--rm-u: min(100vw / 1366, 100vh / 768)` at `min-width: 721px`; `--rm-u: 1` and **chrome shear-off** at `max-width: 720px` (move the in-tree 480px shear-off up so 481–720 is axis-aligned)
- `--lazer-back-footer-dark` / `--lazer-back-footer-light`; keep `--lazer-back-footer: #e91e8a` as mid
- `ComingSoon.tsx` — opacity 0.50, tooltip “Coming soon”, no hue-shifting grayscale
- Cookie size **props**: idle **480 du**, top-level **220 du** (±8; PNG white box ~222, not 0.5×480=240), parked **200 du ±20**, PlayerLoader **72 du**
- Footer Back target width **240 du** on Song Select (C# `BUTTON_WIDTH`); keep 210px min as a floor until that screen lands

Point implementers at `applyLazerChrome` / `useLazerReducedMotion`. No `?debug=` requirement beyond existing `LazerDebugSmoke`.

#### What is not copied

osu! wordmark, pink-circle logo geometry as a trademark, ppy marks, Torus files, osu-resources bitmaps, official mascots (including the empty-listing character), osu! cursor bitmap.

---

### 2. Global toolbar + now-playing popover + hover captions

**Stills:** `hud/first menu 2.png` (idle strip), `hud/songselct onhober playing.jpg`, `on hover top bar smth.jpg`, `onhover smth else.jpg`, `songselct onhover playing songs.jpg` / `onhover smth.jpg`.

**Lazer source:** `osu.Game/Overlays/Toolbar/Toolbar.cs` — `HEIGHT = 40`, `TOOLTIP_HEIGHT = 30`, `transition_time = 500`.

#### Layout (1366×768)

```
z20 Toolbar 40du, #191919, full width
  LEFT:  [Settings] [Home]                         (no ruleset icons)
  RIGHT: [Changelog] [Wiki] [Rankings*] [Listing] [Globe] [Music] | [Name] [Avatar] [Clock] [Bell]
z21 Hover caption (30du tall, two lines) drops below the hovered icon
z22 Now-playing popover (only if Music is active)
```

\*Rankings = people icon in the stills; **coming-soon** (no global boards). Omitted entirely: ruleset selector, news, chat, social.

| Region | Geometry (du) | Notes |
|---|---|---|
| Bar | 1366×40, y=0 | `#191919`. Gradient under captions: 80du tall black 70%→0 when any toolbar hover (`ToolbarBackground`) |
| Icon button | 40×40 hit; glyph ~18 | White icons, 1du cyan underline on the **active destination** (home on menu, listing icon when listing open — stills show listing as `#e91e8a` fill when that overlay is open) |
| User chip | name Inter 13 + 28×28 avatar | Persist `localDisplayName: ''`; display **`Guest`** |
| Clock | JetBrains Mono 11–12 | `h:mm:ss AM/PM` + second line `running hh:mm:ss` in pink `#e967a1` (stills) |
| Bell | 40×40 | Badge count if we ever have local notices; otherwise empty. **Coming-soon** click |

#### Hover captions (measured from stills)

Two-line, right-aligned under the icon, white:

| Icon | Title | Subtitle | Shortcut in still |
|---|---|---|---|
| Wiki | `wiki` | `knowledge base` | (none visible) |
| Beatmap listing | `beatmap listing` | `browse for new beatmaps` | `CTRL-B` |
| Now playing | `now playing` | `manage the currently playing track` | `F6` |

Unverified (no still; lazer knowledge — mark in implementation comments): Settings `settings` / `change settings`; Home `home` / `return to main menu`; Changelog `changelog` / `view the changelog`; Globe / Rankings / Bell — coming-soon titles matching lazer if we can cite source later; until then use the visible still captions only and a generic “Coming soon” on click.

Caption type: title Inter 700 14 white; subtitle Inter 400 12 white 70%.

#### Now-playing popover

From `hud/songselct onhover playing songs.jpg`:

- Anchored top-right under the music icon (icon turns **pink filled** while open).
- Size **320×90 du** (±12 du still-diff).
- Cover fills the panel; title + artist top-right; transport row: shuffle, prev, pause/play, next, playlist (hamburger).
- Yellow progress bar `#eeaa00` along the bottom (~3 du).
- Shuffle and playlist: **coming-soon** if we have no queue model; prev/next/pause wire to `previewPlayer`.

#### States

| State | Behaviour |
|---|---|
| Hidden | Menu **Initial** (idle cookie). Gameplay. Fade/slide 500ms OutQuint (`MoveToY(-HEIGHT)`). |
| Visible | Top-level menu, play submenu, Song Select, listing, PlayerLoader, Results, Settings/Skins/History overlays. |
| Active destination | Pink fill on listing icon when listing open; pink fill on music when popover open; home when on menu. |
| Coming-soon | Opacity 0.50 + tooltip. Hover caption still appears. |
| Compact 390×844 | **Must keep (wired):** Settings, Home, **Listing**, Music, Clock. Name+avatar if they fit (≥44px leftover); otherwise name hides, avatar stays if 28px fits. **Overflow only coming-soon:** Changelog, Wiki, Rankings, Globe, Bell. Overflow control: 40×40 `···` button, axis-aligned, no shear, opens a **bottom sheet** (not a hover caption) listing those icons at 44px rows. Do **not** drop Listing. |

#### Wiring

| Control | Destination |
|---|---|
| Settings | Existing `SettingsDrawer` |
| Home | Main menu Initial |
| Beatmap listing | Listing overlay (§5) |
| Music | Now-playing popover |
| Clock | Live, no click |
| Name / avatar | No account. Opens Settings → General (display name). Do not invent a profile. |
| Changelog, wiki, rankings, globe, bell | Coming soon |

#### Shortcuts

| Key | Action |
|---|---|
| `F6` | Toggle now-playing popover |
| `Ctrl+B` | Open listing overlay |
| `Esc` | Close the topmost overlay (listing, mods, settings, now-playing, options). Menu Esc still goes Play→TopLevel→Initial. |

Coming-soon icons may **show** a shortcut in the caption; the key still no-ops.

#### Motion

Toolbar show: after logo impact, **200ms** delay then 500ms OutQuint slide from y=−40. Hide: 500ms InQuint + fade.

#### What is not copied

osu! ruleset icon artwork as trademarks; use simple geometric stand-ins if any ruleset glyph were ever shown (they are omitted). No osu! user cards.

---

### 3. Main menu (idle logo, wedge bar, coming-soon)

**Stills:** `hud/first menu 1.png`, `first menu 2.png`, `first menu 3.png`, `first menu on hover.png`.

**Lazer source:** `ButtonSystem.cs`, `MainMenuButton.cs`, `ButtonArea.cs`.

#### States

```
Initial  --click cookie / Enter / any non-modifier key-->  TopLevel
TopLevel --Play or cookie-->  Play
Play     --Solo-->  /select (EnteringMode)
Play     --Back / Esc-->  TopLevel
TopLevel --Esc / idle 15s-->  Initial
```

Idle timeout 15s is acceptable (lazer uses idle tracker). Do not `window.close()` on Exit.

#### Z-order

```
z0  Triangle field canvas (full viewport)
z1  Spectrum bars (behind cookie)
z2  Button strip (TopLevel / Play only)
z3  LazerCookie
z4  Toolbar (not on Initial)
z5  Exit confirm (modal)
```

#### Idle (Initial) — `first menu 1.png`

| Element | Geometry | Colour / motion |
|---|---|---|
| Field | Full viewport | `#172639`–`#20324a`. Filled triangles drift; outline triangles spawn/fade. Lazer spawn ~every 22ms / fade ~120ms — **cap** browser spawn (e.g. max 80 triangles, spawn every 50ms) so it stays cheap. Density like the still. |
| Cookie | Centre. Outer diameter **480 du ±16** (white ring measured 478–501). Inner pink ~434 du. Ring thickness ~22 du. Drive with `LazerCookie` size prop (in-tree default 280px is **not** idle). | Fill token `#e967a1` (plan / `--lazer-pink`). PNG cookie in `first menu 2.png` samples `#ea5e9d` — **±6** still-diff, do not fork the token. Ring `#ffffff`. Inner faint triangles `#ff7db7` @ low alpha. **RM** in Space Grotesk 700 ~64 du white, never “osu!”. |
| Spectrum | Radiate from ring | Audio analyser when menu music/preview plays; else idle **60 BPM** pulse. |
| Pulse | Scale ±4% on beat, damped | OutQuint; disabled under reduced motion. |
| Toolbar / strip | **Absent** | |

Click cookie, Enter, or any non-modifier key → TopLevel. Custom cursor **not** required.

#### TopLevel — `first menu 2.png` / `3.png`

| Element | Geometry | Colour |
|---|---|---|
| Strip | **96 du measured** at x=40 on `first menu 2.png` (y=357–452). C# `BUTTON_AREA_HEIGHT = 100`. Implement **100 du** source default, **±4 du** still-diff. Full width, vertically centred. | `#323232` |
| Cookie | Top-level diameter **220 du ±8** (PNG white box ~222, not 0.5×480). Sits **on** the strip, overlapping Settings (left) and Play (right) | Same disc |
| Buttons | Parallelograms, height = strip, expanded width **140** (C# `BUTTON_WIDTH`), wedge 20 (C# `WEDGE_WIDTH`). **Negative spacing −20 du** so they nest. | See tokens |
| Content | Icon 32 du above lowercase label 16 du | White, drop shadow |

Button order, left → right of cookie:

| Button | Colour | Wired | Notes |
|---|---|---|---|
| settings | `#555555` | Opens settings overlay | |
| **cookie** | — | Play submenu while TopLevel | |
| play | `#6644cc` | Play submenu | |
| edit | `#eeaa00` | **Coming soon** | Visible |
| browse | `#a5cc00` | Listing overlay | |
| exit | `#ee3399` | Confirm → Initial | Do not `window.close()` |

Measured strip colours at y≈383 match the table exactly (`#555555`, `#6644cc`, `#eeaa00`, `#a5cc00`, `#ee3399`, far-right `#323232`).

#### Play submenu — `first menu on hover.png`

Settings parallelogram **becomes** Back `#333a5e` (left arrow + `back`). Right of cookie: **solo** `#6644cc`, **multi** `#5e3fba`, **playlists** `#5e3fba`. Solo → `/select`. Multi and Playlists: coming-soon. No Daily Challenge (not in the still).

#### Motion (lazer hard numbers)

| Action | Duration | Ease |
|---|---|---|
| Expand contracted→expanded | 500ms | OutExpo. Width 0→140. Fade-in at 500/6 ≈ 83ms |
| Contract | 500ms | OutExpo. Width → 0; fade 500ms |
| Explode (leaving a submenu) | 200ms | OutExpo. Width ×2; fade-out 150ms |
| Hover width | 500ms | OutElastic. Width × **1.5**, height unchanged |
| Icon beat-bounce while hovered | half-beat | Out then In. `HOVER_SCALE = 1.2`, `BOUNCE_COMPRESSION = 0.9`, `BOUNCE_ROTATION = 8deg`, alternate direction |
| Bar fade | 300ms | linear alpha |
| Bar flatten (idle) | 300ms | InSine, scaleY → 0 |
| Bar restore | 400ms | OutQuint, scaleY → 1 |
| Logo idle → top-level | 200ms | In, scale 1→0.5 into the strip, then Impact overshoot |
| Logo top-level → idle | 800ms | OutExpo to centre, scale 0.5→1. Delay = `barAlpha * 150` |
| Initial → top-level bar delay | 150ms | buttons start after this |
| Click flash | 800ms OutExpo from 0.9 alpha | additive white |

Coming-soon wedges **do** hover-widen (personality) but clicks no-op + tooltip.

#### Exit confirm (no still)

Lazer-style two-click / hold. Copy **“Return to the title screen?”** Confirm → Initial. Never `window.close()`.

#### Compact 390×844

Cookie remains centred and tappable. Strip becomes a **vertical stack** of axis-aligned 48px-tall buttons (no shear) or a horizontally scrollable unsheared strip. Do not clip parallelograms off-screen.

#### What is not copied

“osu!” lettering, osu! icon on the Play button (use a generic play/person glyph), osu! cursor.

---

### 4. Song Select V2

**Stills:** `hud/songselect.jpg` (expanded + Local empty), `hud/songslect.jpg` (collapsed), `hud/songslect (2).jpg` (graveyard expanded), `hud/option menu.png` (options + Local empty), `song-select/song select.png` (shell / carousel only — **ignore Global / sign-in copy**).

**Lazer source:** Song Select V2; `BACKGROUND_BLUR ≈ 20`; `ScreenFooter.HEIGHT = 50`; `ScreenFooterButton` 116×75, corner radius 10, shear `Vector2(0.2,0)`; `ScreenBackButton` width 240; logo facade `(-76, -36)` from bottom-right centre.

#### Frame

```
z0  Beatmap background, full-bleed, blur 20 (CSS `filter: blur(20px)` on a scaled layer, not on the UI)
z1  Dim / gradient so left metadata and right carousel read
z2  Left metadata wedge (~480–520 du) + Details/Ranking
z3  Right carousel
z4  Top-right search / star / group / collection
z5  Footer (50 du) + parked cookie
z6  Toolbar
z7  Options popover / Mod overlay / Listing (when open)
```

ASCII (desktop 1366×768):

```
┌ toolbar 40 ─────────────────────────────────────────────────────────┐
│ RANKED  Title                          [search…]  [★ slider] [conv.]│
│ Artist  ▶ ♥  length  BPM               Sort  Group  Collection      │
│ ★ 1.46 Easy mapped by …                                             │
│ Notes Holds  KC  OD  HP          ┌ expanded set ───────────────┐    │
│ Details | Ranking  Scope Local    │ difficulty rows (selected)  │    │
│                                   └─────────────────────────────┘    │
│  i  No records yet!               collapsed sets…                    │
│                                                                      │
│ [ < Back ]  [Mods] [Random] [Options]                    (cookie)    │
└ footer 50 ───────────────────────────────────────────────────────────┘
```

#### Left metadata

| Item | Notes |
|---|---|
| Status pill | `RANKED` green, `LOVED` pink, `GRAVEYARD` grey, `LOCAL` grey — Inter 700 10, uppercase, 4 du radius |
| Title | Space Grotesk 700 ~30 du white |
| Artist | Inter 500 14 white 80% |
| Counts row | **Not preview transport.** Stills show `▶ {playcount}  ♥ {favourite count}  ⏱ {length}  🎵 {BPM}` (e.g. `▶ 89,299  ♥ 736  ⏱ 02:23  🎵 210`). Offline stand-in: **playcount** = local history rows for this chart (or `—` if zero — do not invent an osu! playcount). **♥** = favourite **toggle** on `rhythm_mania_v1_favorite_songs`; show local favourite state, not osu!’s 736. Length `m:ss`. BPM or BPM range `135-520 (mostly 270)` when the map has a range. Preview prev/pause/next live **only** in the toolbar now-playing popover (§2). |
| Difficulty line | Star pill (cyan/green by rating) + `{diff} mapped by {mapper}` |
| Stats | Notes, Hold Notes, Key Count, Accuracy (OD), HP Drain — Inter 12, muted labels, white values |
| Tabs | `Details` \| `Ranking` (underline on active). Ranking is the default in the Local stills. |
| Ranking toolbar | **Scope: Local only** (chip, not a Global dropdown). Sort: Score. Selected Mods chip. |
| Empty | Info icon + **“No records yet!”** (white 70%). Person+lock / sign-in copy is forbidden. |
| Filled | This-device history for beatmap id / hash / catalog chart id, score then accuracy. Click a row → Results for that record. |

Details tab (**user lock**): source, tags, mapper. Inter 13. No filled still — spacing unverified.

Decorative wedge width **500 du ±20** on desktop (user lock 480–520). The stills show a dark translucent left panel that shears into the background around x≈500–640; implement a 500 du panel with a soft right fade, not a hard clip.

#### Carousel (right)

- Right-aligned stacked set panels. Vertical scroll. Keyboard up/down, wheel, click.
- **Collapsed:** title, artist, status pill, key-count colour dots, cover strip. Dimmer.
- **Expanded:** group header + one row per difficulty. Selected difficulty has a **bright cyan right bar** and sits further left (selected offset).
- Difficulty row: `[4K] {name} mapped by {mapper}`, star number on a coloured pill, 10-dot meter.
- Selection layout-animates OutQuint 200–400ms, not a snap.
- Enter / cookie starts the selected difficulty → PlayerLoader.
- No convert difficulties. No Global ranking on the card.

#### Search / star / group / collection (top-right)

From `hud/songselect.jpg`:

| Control | Behaviour |
|---|---|
| Search `search…` | Filters carousel. Match count under field (`64 matches` in still — live count). |
| Star Rating rainbow slider | `0.0` … `∞`. Hides out-of-range maps. |
| Show converts | **Visible, greyed, coming-soon / no-op.** Product is mania-only (user: drop converts). |
| Sort | Title / Artist / Difficulty / … — actually sorts local library. |
| Group | None / … — Group None is the still default. |
| Collection | Label as in the still. Only real collection is **favorites**. “All beatmaps” default. |

#### Footer

| Button | Size (du) | Colour | Wired |
|---|---|---|---|
| Back | 240 wide, sheared, pink `#de31ae`/`#ff86dd` | Menu (cookie shared-element to centre) | |
| Mods | 116×75, radius 10, sheared | Dark; **green fill when overlay open** (see mod stills) | Opens Mod Select |
| Random | 116×75 | Dark | Another set |
| Options | 116×75 | Dark; purple-tint when open (`option menu.png`) | Options popover |

Icon above label, accent bar along the sheared bottom (5×100 inner, radius 3). Hover lighten 0.2, 150ms OutQuint. Flash 800ms OutQuint on click (`ScreenFooterButton`).

Footer background: dark `#1a1e27`–`#22272a` (sampled), height 50, full width. Buttons sit with `Y = CORNER_RADIUS` so they overlap the bar (lazer).

#### Parked cookie

Bottom-right, overlapping footer. Diameter **200 du ±20**, white ring and triangles, pulsing on preview BPM. Clicking it **starts** the selected chart. Shared-element from menu strip-centre, OutQuint, interruptible. (Plan text ~0.2 of menu size is **not** used.)

#### Options popover — `hud/option menu.png`

Dark rounded panel **280×520 du** (±16 du), origin at the Options button, 200–250ms OutQuint scale 0.95→1 + fade.

Rows in still order:

- **General:** Manage collections… — coming-soon if no collections model (tooltip).
- **For all difficulties:** `{set} - {title} ({mapper})` + Delete… (existing confirm, deletes set).
- **For selected difficulty:** Play (starts), Edit (**coming-soon**), Details… (may scroll to Details tab), Copy link (disabled / coming-soon if no catalog id), Remove from played, Clear all local scores (existing history APIs).
- **View play history** — navigates to `/history`. **Add this row** (not in the still; required so the menu rebuild does not orphan History; place under General).
- **Hide** (pink text) closes.

Do not add a main-menu History wedge.

#### Compact 390×844

- No shear on footer or chips.
- Wedge becomes a **top metadata stack** (full width, auto height).
- Carousel full width below.
- Search row stacks under toolbar.
- Cookie shrinks (~96 CSS px) or hides behind the start path (footer Play). Footer buttons remain tappable (min 44px).
- Ranking list full width.

#### What is not copied

osu! cookie in the corner; Global tab; sign-in empty state; convert diffs as playable rows.

---

### 5. Beatmap listing overlay (lazer in-client)

**Stills:** `hud/beatmaplisting.jpg`, `hud/beatmaplistingnosongs.jpg`. **Not** osu-web PNGs.

Opened from menu Browse **or** toolbar listing icon (highlights pink).

**Chrome vs data (do not mix backend into PR-V8 / TASK-V-040):**

| Layer | Contract |
|---|---|
| Chrome (this spec) | Overlay layout, filters greyed table, empty copy, cards. Consumes the search function already imported by `OnlineBeatmapCatalog.tsx`. |
| Live data | Search: `GET /api/catalog/search` with Bearer osu! token (`api/catalog/_search.ts`; 401 copy “Connect osu! to search the catalog”). Download: `https://catboy.best/d/<id>` then **only on HTTP 404** `https://osudl.org/s/<id>` (`downloadBeatmapsetArchive` in `osuTokenManager.ts`). |
| No token | Keep listing chrome; show the existing connect-osu! / empty panel. Do not invent a second search client in the visual PR. |
| Planned (not this PR) | Unauthenticated search hinai → osu.direct → Catboy; download Catboy → osu.direct → hinai; token-gate removed. That is `TASK-C-*` if revived — **dependency of the listing product**, not of overlay chrome. Chrome **must ship** before those hosts exist. |

Visual PR must not change mirror failover or add hinai/osu.direct.

#### Layout

```
z0  Dimmed previous screen (menu or select)
z1  Panel x=**102** to x=**1264** (±8; width **1162 du**), y=40–768.
    Background ~#2d3236
z2  Title row, search, filter matrix, sort row, card grid / empty
z3  Footer Back (pink, bottom-left, same family as ScreenBackButton but compact in still)
z4  Toolbar (listing icon active)
```

| Region | Geometry / content |
|---|---|
| Title | Document icon (original geometry, **not** osu! mark) + `beatmap listing` Inter 500 20 white |
| Search | Full-width field, placeholder `type in keywords…`, magnifying glass |
| Filter matrix | Label column ~90 du + option chips. See wiring table |
| Sort row | `Sort by` Title Artist Difficulty Ranked Rating Plays Favourites + **grid icon only** (active). **Omit** the list-mode button. |
| Cards | **3 columns** on 1366. Cover **80×56 du** (±4). Title, `by {artist}`, `mapped by {mapper}`, RANKED pill, mode dots, optional FEATURED ARTIST chip |
| Empty | Centre copy **“… nope, nothing found.”** (ellipsis + nope). **No character.** Optional original triangle motif at ~40% opacity behind the type. |

#### Filter wiring (mania-only offline mirrors)

| Row | Visible options (from still) | Behaviour |
|---|---|---|
| General | Recommended difficulty, Include converted beatmaps, Subscribed mappers, Spotlighted beatmaps, Featured Artists | **All greyed / no-op.** Mirrors do not expose these. |
| Mode | Any, osu!, osu!taiko, osu!catch, **osu!mania** | **Lock osu!mania selected.** Others visible, greyed, unclickable. |
| Categories | Any, Has Leaderboard, Ranked, Qualified, Loved, Favourites, Pending, WIP, Graveyard, My Maps | **Wired:** Ranked, Loved, Graveyard (and Any = those three). **Greyed:** Has Leaderboard, Qualified, Favourites, Pending, WIP, My Maps. Default **Ranked** (still shows Has Leaderboard selected — do **not** copy that selection; we have no RM board). |
| Genre | Any + list | Greyed / no-op |
| Language | Any + list | Greyed / no-op |
| Extra | Has Video, Has Storyboard | Greyed / no-op |
| Rank Achieved | Silver SS … D | Greyed / no-op (no global ranks) |
| Played | Any, Played, Unplayed | Greyed / no-op (mirror has no play graph). Local-only filter against IndexedDB is allowed if cheap; otherwise greyed. |
| Explicit Content | Hide, Show | Greyed / no-op unless a mirror param exists — **no-op**. |

Sort: Title / Artist / Difficulty / Ranked wire if the mirror query supports them; Rating / Plays / Favourites greyed if the current helper cannot. **Grid only** — no list view, no list toggle.

Cards: click/download uses existing `downloadBeatmapsetArchive`. Hover/expand like lazer (cyan outline + difficulty rows) **if** we can do it without osu-web assets — recreate with CSS. No osu-web PNG target.

#### Motion

Overlay fade 200–300ms OutQuint. Panel does not shear. Card expand 200ms OutQuint height.

#### Compact

Single column cards. Filter rows stack or collapse into a “Filters” disclosure. Back remains tappable. Panel inset **8 CSS px** (not edge-to-edge); toolbar/footer stay `100%`.

#### What is not copied

osu! logo in the title, peppy/mascot empty art, osu-web card bitmaps.

---

### 6. Mod select overlay

**Stills:** `hud/mod menu.png`, `mods.jpg`, `mod2.jpg`, `mod3.jpg`, `modcustomise.jpg`, `modunranked.jpg`.

**Existing module:** `src/components/ModSelectOverlay.tsx` (`ALL_MODS`, exclusivity). Rebuild chrome; keep exclusivity rules.

#### Layout

Dimmed Song Select behind. Sheared colour columns, horizontal scroll. Top banner, search, Customise. Footer: Back, Mods (green while this overlay is the footer owner), Deselect All, chart chips.

Column headers (left → right), sheared, ~40 du tall:

| Column | Header colour (still) | Contents |
|---|---|---|
| Personal Presets | Yellow | `+` add — **coming-soon** (no presets model) |
| Difficulty Reduction | Lime | EZ, NF, HT, DC, NR, … |
| Difficulty Increase | Coral red | HR, SD, PF, DT, NC, FI, HD, Cover, FL, AC, … |
| Automation | Cyan | AT, Cinema |
| Conversion | Purple | RD, Dual Stages, MR, DA, Classic, Invert, CS, Hold Off, K1–K10 |
| Fun | Pink | WU, WD, MU, AS |

Each row: hex icon, name, one-line description. Selected row uses the column accent as a filled background (Nightcore in `mod3.jpg`).

#### Shipped vs coming-soon

**Clickable `ALL_MODS` rows:** NF, EZ, HT, NR, HR, SD, PF, AC, HD, FI, Cover, FL, DT, NC, AT, CN, MR, RD, CS, IN, HO, CL, DA, WU, WD, AS, MU.

**Conversion column** = those conversion `ALL_MODS` rows **plus** K1–K10 **generated** rows via existing `handleToggleKeyMod` (K-mods are **not** in the `ALL_MODS` array).

**Cinema (`CN`):** keep the shipped path. `GameplayCanvas.tsx` sets `isCinema` and hides `.playfield-chassis-container` (`opacity-0 pointer-events-none`); `isAutoplay` includes CN. **Do not** alias CN to `disableVideo` (that flag only suppresses background video; PlayerLoader “Storyboard / video” is `!disableVideo`).

**Visible, greyed, coming-soon:**

- **Dual Stages** (user lock)
- **Daycore (DC)** — in stills, not in `ALL_MODS`
- Any other still row we do not own
- Personal Presets `+`

Do not add unowned mechanics. Visual tasks must not change score multipliers.

#### Search / tooltips / customise / rate / unranked

| Still | Spec |
|---|---|
| Search `tab to search…` / `search…` | Filters rows by name/acronym |
| Tooltip (`mods.jpg`, `mod2.jpg`) | Dark 12-radius card: title, “Compatible with all mods” **or** “Incompatible with:” + hex chips |
| Customise (`modcustomise.jpg`) | Dropdown, green header. DA sliders wire to existing `DifficultyAdjustSettings` (OD/HP). Nightcore **Speed increase** slider is **chrome**: DT/NC/HT stay **fixed** 1.5 / 1.5 / 0.75 (`plan.md` V-032). Do not invent a variable rate `GameSettings` field in this visual task |
| Rate slider (`mod3.jpg`) | Show above footer when HT/DT/NC selected: capsule + icon + `0.75x` / `1.50x` (not a free 1.00× custom rate). Footer BPM chip uses that multiplier (180 → 270 DT / 405 if the still’s map is 270 BPM at 1.5×). Thumb is non-adjustable until a real rate setting exists |
| Unranked (`modunranked.jpg`) | Yellow `UNRANKED` badge when `isUnranked` is true: **AT or CN only** (current `ModSelectOverlay.tsx`). Do **not** mark WU/WD/AS unranked in a visual PR (that would be a ruleset change). Footer Mods button grows to fit |

#### Footer chips

Star, BPM, KC, OD, HP, Ranked/Unranked, rate. Values live from the selected chart × mods. **Rate chip = same multiplier as the capsule:** `0.75x` (HT), `1.50x` (DT/NC), **`1.00x` only when no HT/DT/NC**.

#### Motion

Overlay fade 200ms; columns stagger in 30–80ms left→right, OutQuint. Closing reverses. Compact: horizontal scroll, footer not clipped, shear reduced/off.

#### What is not copied

osu! hex bitmaps — redraw hexes in SVG. No Torus.

---

### 7. PlayerLoader pre-game

**Still:** `hud/pre game stage.png`. **Include** (user lock). First paint of `/play`; do not skip.

#### Layout

```
z0  Full-bleed beatmap art, heavily blurred (same 20 as select)
z1  Centre column: cookie, title, artist, cropped banner, difficulty, star, Source / Mapper
z2  Right column: Visual / Audio / Input groups
z3  Footer Back
z4  Toolbar
```

| Centre | Spec |
|---|---|
| Cookie | **72 du**, **RM**, not osu! (`LazerCookie` size prop) |
| Title | Space Grotesk 600 **28** white (`Mach Roger`) |
| Artist | Inter 500 14, letter-spaced uppercase (`MYUKKE.`) |
| Banner | **280×64 du** crop of the set cover (±8) |
| Difficulty | `Easy` Inter 500 16 |
| Star pill | Cyan capsule `★ 1.46` |
| Meta | `Source` / `Mapper` labels muted, values white |

#### Right groups (translucent dark cards, yellow controls `#eeaa00`)

Yellow sliders: track dark, fill + thumb `#eeaa00` / `#ffcc22`. Toggles: yellow capsules.

**PlayerLoader field table (V-050 — no invented persistence except as noted)**

| Still row | Control | Wire | Persistence |
|---|---|---|---|
| Background dim | Slider | `GameSettings.backgroundDim` (exists, 0–1) | Existing sanitizer |
| Background blur | Slider | **Coming soon** (greyed). Do not add `gameplayBackgroundBlur` in this visual PR; `menuBackgroundDim` is menus-only | None |
| Storyboard / video | Toggle | `disableVideo` **inverted** (on = allow video). Storyboard half is no-op / coming-soon | Existing |
| Beatmap skins | Toggle | Coming soon | None |
| Beatmap colours | Toggle | Coming soon | None |
| Combo colour normalisation | Slider | Coming soon | None |
| Beatmap hitsounds | Toggle | **On** ⇔ `hitsoundVolume > 0`. Off writes `0`. On restores last non-zero volume held in **component session memory** (default `DEFAULT_SETTINGS.hitsoundVolume` if none). Not a new boolean | Existing volume key |
| Audio offset (this beatmap) | Slider | Writes App-owned **`playSessionOffsetMs`** (number, clamp −1000…1000). Gameplay uses `settings.audioOffset + playSessionOffsetMs`. Not `onPatchSettings` | **Not persisted**; App clears on leaving `/play` |
| Disable clicks during gameplay | Toggle | Coming soon unless a real input flag exists | None |

**Do not alias Cinema (`CN`) to `disableVideo`.**

#### Motion / flow

Metadata fade in; settings groups slide from the right 300–400ms OutQuint. Back → Song Select.

**Start gameplay:** auto-advance after **audio decode + 400ms** (still has no click-to-start). Cookie click may start **early** but is not required. Then countdown (§9 / V-062).

Compact: settings stack **below** metadata, full width, no right column.

---

### 8. Gameplay HUD

**SoT (full frame):** `playfield-4k/osu_2026-09-12_19-55-36.jpg` through `19-56-12.jpg`.  
**Close crops:** `Screenshot 2026-09-12 192641.png`, `192855.png`.  
**Existing:** `src/components/ManiaHud.tsx` — rebuild; the current sheared double-wedge (`ArgonWedgePieces`, shear 0.8) is **not** in the live stills.

HUD is a DOM overlay, `pointer-events: none` during play (except the settings gear). Do not add a second scene graph.

#### Regions (1366×768)

```
z20 Health capsule + score digits          top-left
    Judgement boxes (5 diamonds + 1 square)
    Rank pill #1 + avatar + name + acc + combo
z20 ACCURACY segment boxes + PENAR boxes   top-right
    Spectator line + settings gears
z15 Combo (centre playfield, outlined digits)
    Judgement text (PERFECT / MISS)
z15 Hit-error meters                       left and right of playfield
z15 Key overlay ovals + 3-dot clusters     under receptors (playfield canvas)
z20 Key counters B1..Bn                    bottom-right
z20 Song progress + density                bottom
    Time m:ss left / remaining right
```

| Piece | Geometry / look (from 19-55-36 and siblings) |
|---|---|
| Health | Horizontal **capsule + tail**, **280×28 du** (±8), y=12, x=8. White fill; red when draining (`192855` shows a red sliver). Not a sheared card. |
| Score | **Inside** the capsule. Outlined JetBrains Mono / Space Grotesk 700, ~36 du, tabular, 6+ digits. Wireframe leading zeros in the Argon style. |
| Judgement boxes | Directly under the capsule, five rotated squares + one axis-aligned square (last). Fill as judgements occur. |
| Rank pill | Green-left capsule: `#1`, 28 du avatar, name, score, `100.00%`, `{n}x`. |
| ACCURACY | Tiny label `ACCURACY` Inter 9 uppercase. Row of ~5 hollow boxes that fill with accuracy (Argon segment display). **Do not** put a big `%` number in this corner — the pill already has accuracy. |
| PENAR | Tiny label **must not be `PP`**. Use `PENAR` (Inter 9). Two boxes as in the PP slot. Numeric value **`—`** while stubbed (`formatPenar`). Never print “pp”. |
| Combo | **Centre of the playfield**, large outlined digits (`21`, `92`, `132`, `783` in stills), ~48–64 du, white stroke. Current `ArgonComboCounter` bottom-left is wrong vs stills. |
| Hit error | Vertical rainbow bar + centre arrow, both sides in full HUD stills; left-only in some crops. Keep dual meters as in 19-55-*. |
| Progress | Bottom 8 du track, white fill. Optional density histogram (64 bins) sitting on the track (`19-56-07` shows a thick white bar + `4:32 (67%)`). Times: elapsed left `m:ss`, remaining right. |
| Key counters | `B1`…`Bn` labels + hit counts, bottom-right, Inter 11 / JetBrains Mono 16. |
| Spectator | `Watching {name} play {artist} - {title} ({version}) [{diff}] on {date}` Inter 12 white 80%, top-centre/right. Live play: hide. |
| Settings gear | Blue hex-circle ~40 du + smaller gear; opens in-play overlay (§10). `pointer-events: auto`. |

Judgement popup: centre, spaced tracking (`P E R F E C T` cyan `#48c6ff` / `#7ED7FD`, `M I S S` red). Particles on Perfect (close-up still). Fade/scale OutQuint.

Compact: hide key counters and spectator line; keep health, score, combo, hit error, progress. Do not cover receptors.

---

### 9. Argon playfield

**Stills:** `lazer-argon-mania-gameplay.png`, `192641`, `192820`, `192855`, 19-55-* HUD frames, colour charts.  
**Code:** `src/render/argonPlayfield.ts`, `argonSkin.ts`, `Canvas2DRenderer.ts`. Do not change judgement timing or hold rules.

#### Column colours (ship `getArgonColumnColor` / `argonPaletteForKeyCount`)

OK rows from `argon-column-colours-1k-10k.png` already match `ARGON_LAYOUT`:

| K | Columns L→R |
|---|---|
| 1 | Yellow |
| 2 | Green, Cyan |
| 3 | Green, Special, Cyan |
| 4 | Yellow, Orange, Pink, Purple |
| 5 | Pink, Orange, Yellow, Green, Cyan |
| 6 | Pink, Orange, Green, Cyan, Orange, Pink |
| 7 | Pink, Orange, Pink, Special, Pink, Orange, Pink |
| 8 | Purple, Pink, Orange, Green, Cyan, Orange, Pink, Purple |
| 9 | Purple, Pink, Orange, Yellow, Special, Yellow, Orange, Pink, Purple |
| 10 | Purple, Pink, Orange, Yellow, Green, Cyan, Yellow, Orange, Pink, Purple |

Do **not** apply 1k/3k/6k/7k/8k/10k “UPDATED” mock rows.

4K lane tints in live stills: translucent yellow / orange / pink / purple columns (alpha ~0.25–0.40 over the dimmed BG). `ARGON_COLUMN_GAP = 1`. Equal widths 2K–10K.

#### Rice (tap)

- Rounded rect, height `42 * noteSizeMultiplier`, corner `3.4`.
- **Filled** chevron pointing **to the receptor** (down in downscroll), white.
- **White foot** along the hit edge (~18% of height = `ARGON_NOTE_ACCENT_RATIO` inverse band).
- Not a stroke-only arrow.

#### Hold

- Body darker/more opaque than rice; gradient so stacked LNs separate (spec still “transparent gradient shadow”).
- **Minus** icon on the head (and on body ticks as in close-up).
- White foot on the tail.
- Head uses the same rounded-rect language as rice.

#### Receptors / keys / countdown

| Element | Spec |
|---|---|
| Receptor | Pale rounded cap per column; pressed column **flashes** white/gold bloom. Cite `osu_2026-09-12_19-55-36.jpg` **column 4** (rightmost of 4K) and `192855` pressed oval (`×`). Do not cite colour-spec “column 5–6” |
| Key overlay | Hollow oval in column colour + **3-dot cluster** below (`192820`). Pressed: `×` in the oval (`192855` column 2) |
| Lane dim | Translucent column colour; playfield BG is the beatmap art at `backgroundDim` |
| Countdown | Centre dark disc ~120 du, white arc draining with the beat, number 3-2-1 then go (`192820` shows `2`) |
| Skip intro | Existing TASK-041–044 control; visual: small skip chip if present — **no still**, keep functional, do not invent a second language |

Canvas2D is SoT. Babylon extra skin may approximate but is not the review target.

#### What is not copied

osu-resources note textures. Draw geometry in canvas.

---

### 10. In-play settings / replay playback overlay

**Still:** `playfield-4k/osu_2026-09-12_19-55-50.jpg` (open), `19-55-41.jpg` / `19-55-36.jpg` (collapsed gears).

Opened from the blue hex gear. Same Visual / Audio groups as PlayerLoader, docked **right**, dark cards, yellow sliders.

#### PLAYBACK (replay / spectator only)

Top-right card, label `PLAYBACK`:

- Transport: skip-to-start, rewind, previous-frame, pause, next-frame, fast-forward, skip-to-end
- `Playback speed` slider + `1.00x`
- Hamburger: coming-soon unless we have extra replay menus

Wire to existing replay seek/speed in `GameplayCanvas` / `replayCursor.ts`. Live play: **hide** this card.

#### Visual / Audio

Same rows as PlayerLoader. Extra line in still: `Previous play: Previous play too short to use for calibration` (red) — show when offset wizard has no sample; otherwise hide.

Motion: 200–300ms OutQuint from the right. Esc / gear again closes. Compact: bottom sheet, no shear.

---

### 11. Pause and fail

**Stills:** `pause/pausef.png`, `pause/failed.png`.  
**Lazer:** `GameplayMenuOverlay.cs` — `TRANSITION_DURATION = 200`, `button_height = 80`, `background_alpha = 0.75`, padding horizontal 50, spacing 2, title Torus Alternate 48 / spacing 5 / yellow.

Existing: `src/components/PauseOverlay.tsx`.

#### Shared

- Playfield remains visible, black **0.75**.
- Title lowercase Space Grotesk 600 48, tracking 5 du, `#ffcc22`. **No** extra artist/title/mod chips.
- Full-width **sheared** bars, height **80**, gap **2**, horizontal inset **50 du**. Triangle pattern inside (same family as the menu field). **Not** rounded cards.
- Stats, Inter 18, centred:

```
Retry count: **N**
Song progress: **N%**
Accuracy: **N.NN%**
```

Exact labels from the still (`Retry count:`, not `retries:`). Bold on the values.

Measured pause y at x=683: Continue 262–340 (`#88b300`), Retry 344–423 (`#eeaa00`), Quit 426–506 (`#aa1b27`). **80 du** C# `button_height` (±2 du).

Fade **200ms Easing.In** (not Out). Reduced motion: fade only.

#### Pause

Buttons: **Continue** green `#88b300`, **Retry** `#eeaa00`, **Quit** `#aa1b27`. Esc = Continue. R = Retry. Title `paused`.

#### Fail

Title `failed`. **Retry** + **Quit** only. Esc = Quit. Bottom strip **`#333333`** (sampled y=717–726 on `failed.png`), with a centred save control fill **`#4f4f4f`** and white download glyph. Do **not** use `#8d8d8d` (mis-sample of the icon). Wire the control to existing replay export if cheap; else visible coming-soon.

Compact: drop shear; bars remain 80 CSS px tall, 16px horizontal inset, text not clipped.

#### What is not copied

osu! wordmark in the playfield art (that's beatmap art). Triangle **pattern** is original geometry.

---

### 12. Results

**Stills:** `results/osu_2026-09-12_19-51-20.jpg` (this play in centre, older local on the right), `19-51-31.jpg` (browsing: older play in centre, this play on the left as `#1`).

Captures are **osu!standard** (Great/OK/Meh/Miss + slider tick/end + PP). Adapt as locked.

#### Layout

```
z0  Blurred beatmap BG
z1  Side score card(s) — other local scores, clickable
z2  Centre results card + overlapping avatar
z3  Footer actions
z4  Toolbar
```

Centre card (visual): dark `#3a3a3c`–`#454545`, **500 du ±24** wide, radius **20**, vertically centred. Avatar **72 du** overlaps the top edge. Player name under avatar (display **Guest** if `localDisplayName` is empty).

| Block | Spec |
|---|---|
| Title / artist | Space Grotesk 600 18 / Inter 12 uppercase |
| Grade ring | **200 du ±8**. Centre letter Space Grotesk **120**. Inner graded arc + outer rank badges. Stills (`19-51-20` A, `19-51-31` C) SoT for A/C. SS/S/D/F from lazer MIT — see table below. |
| Score | JetBrains Mono 700 ~40, tabular, with commas |
| Diff line | Star pill + `{creator}'s {diff}` + `mapped by {mapper}` |
| Stats grid | See mania mapping |
| Date | `Played on {date}` Inter 11 muted |

#### Grade ring ticks (lazer source)

Cite `osu.Game/Screens/Ranking/Expanded/Accuracy/AccuracyCircle.cs`, `GradedCircles.cs`, `osu.Game/Rulesets/Scoring/ScoreProcessor.cs` (mania uses these default cutoffs). Do not copy samples.

`CircularProgress` / `GradedCircle.Rotation = startProgress * 360`: **0° = 12 o’clock, clockwise**. `GRADE_SPACING_PERCENTAGE = 2/360` (~2° gap). `VIRTUAL_SS_PERCENTAGE = 0.01` (SS is a 1% / 3.6° band so it is visible).

Mania cutoffs (`accuracy_cutoff_*`): D **0**, C **0.70**, B **0.80**, A **0.90**, S **0.95**, SS/X **1.00**.

| Grade | Accuracy band | Arc start–end (CW from 12) | Badge (source) | Notes |
|---|---|---|---|---|
| D | 0.00–0.70 | 0°–252° | Mid-band 0.35 → **126°** (~4 o’clock). Still D chip on the right. | Large red/orange arc |
| C | 0.70–0.80 | 252°–288° | Mid 0.75 → **270°** (9 o’clock). Still SoT. | |
| B | 0.80–0.90 | 288°–324° | Mid 0.85 → **306°** | |
| A | 0.90–0.95 | 324°–342° | `Lerp(A,S,0.25)` = 0.9125 → **328.5°**. Still SoT (upper-left). | Pulled down to miss SS |
| S | 0.95–0.99 | 342°–356.4° | `Lerp(S, X−0.01, 0.25)` = 0.96 → **345.6°** | Same pull-down |
| SS | 0.99–1.00 | 356.4°–360° | Badge at **1.00 → 0° / 12 o’clock** | Virtual 1% band |
| F | — | **No tick** | Centre letter **F** only | `ScoreRank.F` / fail. `AccuracyCircle` skips badges when rank is F. Inner D–SS bands still draw. |

Silver S/SS (HD/FL/FI) use the same angles as S/SS (`AdjustRank`). Fail does not add an F notch.

#### Mania stats mapping

Stills:

```
ACCURACY | MAX COMBO | PP
GREAT    | OK        | MEH     | MISS
SLIDER TICK            | SLIDER END
```

Ship:

```
ACCURACY | MAX COMBO | PENAR
PERFECT  | GREAT     | GOOD    | OK
MEH                  | MISS
```

- ACCURACY `96.49%` (two decimals)
- MAX COMBO `119/227` (current / map max)
- PENAR `—` while stubbed (never `PP`)
- Six mania judgements, colours from `JUDGEMENT_COLORS` in `src/ruleset/mania/judgements.ts`
- **No slider tick/end rows.** Do not invent hold-tick rows unless a still appears.

Side cards: same judgement list, compact. Rank `#1` / `#2` top-left. Grade chip on the score. Clicking a card **swaps** it into the centre (still 19-51-31). List is local history for this chart only, score then accuracy.

#### Footer actions (1366 du)

Measured on `19-51-20.jpg` at y≈735–748: Back pink x=**0–93** (width ~94), green ~465–746.

**History-browse (match still — no Retry/Replay):**

| Control | x origin | Width × height (du) | Mapping |
|---|---|---|---|
| Back | **x=0** | **94 × 50** | Song Select, or `/history` if opened from History |
| Green download+check | **462** (do not translate) | **288 × 50** (±8) | Export replay (`replayTransfer`) when a replay exists; else coming-soon |
| Playlist | after green + 8 | **48 × 48** | Coming soon |
| Heart | after playlist + 8 | **48 × 48** | Favourite set (`rhythm_mania_v1_favorite_songs`) |

**Just-finished play:** insert Retry + Replay **in the gap** (x≈102–450) **without translating** Back or the green cluster.

| Control | Width × height (du) | Action |
|---|---|---|
| Retry | **108 × 50** | Restart chart (same as pause Retry) |
| Replay (watch) | **108 × 50** | Watch this run |

Hide Retry/Replay when browsing History.

**390×844 wrap / priority** (min 44 CSS px, no shear):

1. Row 1: Back (94) + Retry + Replay if just-finished (flex, wrap).
2. Row 2: Green (flex 1, min 120) + Heart (48).
3. **Drop first:** Playlist (coming-soon).
4. If still overflow: Heart stays on row 2; never shrink Back below 44px or move it off the left edge.

#### Motion

Card enter: 400ms OutQuint scale 0.96→1 + fade. Side cards stagger 60ms. Compact: single column, side cards as a horizontal scroller under the main card; footer uses the wrap rule above.

#### What is not copied

osu!standard slider rows; `PP` label; osu! grade assets — draw the ring in SVG/CSS.

---

### 13–15. Settings, Skins, History — **gated / unverified appendix**

`plan.md`: no dedicated stills; **do not restyle** the global settings drawer, skins page, or history screen until stills exist. This appendix is complete-for-the-document only. **Not in the current implementation queue** (no PR-V15–V17). Keep existing routes working.

#### 13. Settings overlay (unverified-no-still)

Opens from toolbar gear and menu Settings. Keep `SettingsDrawer` behaviour and **every registry id** (restyle-in-place only if a still arrives):

| Section | Registry ids |
|---|---|
| General | `localDisplayName`, `progressBarTop`, `enableSongPreview` |
| Graphics | `playfieldWidthPercent`, `backgroundDim`, `menuBackgroundDim`, `disableVideo`, `videoOffset`, `disableParticles`, `disableLaneShake`, `showFpsCounter`, `babylonFloor` |
| Gameplay | `scrollSpeed`, `lockScrollSpeedDuringPlay`, `showPenarDuringPlay`, `upsurfaceNoteMode`, `visualOffset`, `enableMapSV` |
| Audio | `musicVolume`, `previewVolume`, `masterVolume`, `hitsoundVolume`, `audioOffset`, `offsetWizard` |
| Input | `bindings` |
| Maintenance | `restoreDefaults` |

`limitDprToOne` is not a user-facing row. Until a still exists: **no left-dock restyle PR**.

#### 14. Skins screen (unverified-no-still)

Keep `/skins` and `SkinScreen.tsx`. One row per `SkinStyleId`:

| id | Label | Badge |
|---|---|---|
| `argon` | Argon | DEFAULT (Canvas2D SoT) |
| `rhythmmania` | RhythmMania Classic | LEGACY |
| `rhythmmania-3d` | RhythmMania 3D | **EXTRA** (not LEGACY; not Argon SoT) |
| `rhythmplus` | RhythmPlus Classic | LEGACY |
| `rhythmplus-dynamic` | RhythmPlus Dynamic | LEGACY |
| `circle` | Circle | LEGACY |

Do not invent a listing-like overlay until a still exists.

#### 15. History (unverified-no-still + locked **entry**)

Keep `/history` and `PersonalHistoryScreen.tsx` **working as-is**. Empty copy may already say enough; if touched later, use **“No records yet!”**.

**Entry points after the menu rebuild (locked):**

1. Route `/history` (bookmarkable).
2. Song Select Options → **View play history**.
3. Results side cards already browse local scores.

**No** main-menu History wedge (lazer has none). Do not restyle History into results-cards until a still exists.

---

### 16. Mobile 390×844

Mandatory checks (Playwright). Shear **must not** clip hit targets.

| Surface | Compact behaviour |
|---|---|
| Toolbar | **Keep:** Settings, Home, **Listing**, Music, Clock; name if it fits. Overflow **only** coming-soon (Changelog, Wiki, Rankings, Globe, Bell) via 40×40 `···` → 44px bottom sheet. Never drop Listing. Chrome **no shear** at `max-width: 720px`. |
| Menu wedges | Unsheared 48px rows or horizontal scroll. Cookie tappable. |
| Song Select | No shear. Wedge → top stack. Carousel full width. Cookie ≤96px or hidden. |
| Listing | 1 column. Filters in a disclosure. |
| Mods | Horizontal scroll. Footer unclipped. |
| PlayerLoader | Settings below metadata. |
| HUD | Health, score, combo, hit error, progress. Hide B-counters / spectator. |
| Pause/fail | Unsheared 80px bars, 16px inset. |
| Results | Main card full width; side cards horizontal scroll. Footer wrap: see §12 (drop playlist first). |
| Settings / skins / history | Full-screen sheets. |

Minimum tap **44 CSS px**. Decorative wedge **no shear**.

---

### 17. Reduced motion

`prefers-reduced-motion` + `useReducedMotion`.

**Keep:** colour, opacity fades ≤200ms, overlay presence.

**Drop:** triangle drift, logo pulse scale, elastic hover width, icon beat-bounce, spectrum idle animation (static bars OK), carousel overshoot.

Menu buttons may snap to expanded width. Pause/fail may still fade 200ms.

Use existing `useLazerReducedMotion()` and the `prefers-reduced-motion` block already in `src/ui/lazer/tokens.css` (durations → 0ms except `--lazer-dur-overlay: 200ms`). `html[data-skin="argon"] { --argon-motion: 0ms }` stays for playfield.

---

### 18. Token → file mapping

| Piece | Owns it |
|---|---|
| `html[data-ui="lazer"]`, chrome CSS variables, reduced-motion | **Existing** `src/ui/lazer/tokens.css` (extend) + `applyLazerChrome` in `App.tsx` |
| Eases, durations | **Existing** `src/ui/lazer/motion.ts` |
| `Shear`, `LazerCookie`, `FooterBackButton` | **Existing** `src/ui/lazer/*.tsx` |
| `ComingSoon` | **New** `src/ui/lazer/ComingSoon.tsx` (only new primitive) |
| Toolbar + captions + now-playing | `src/ui/lazer/Toolbar.tsx` (new), mounted from `App.tsx` |
| Main menu states | `src/components/MainMenu.tsx` |
| Song Select V2 | `src/components/SongSelect.tsx` |
| Options popover | `SongSelect.tsx` or `src/ui/lazer/BeatmapOptionsPopover.tsx` |
| Mod overlay | `src/components/ModSelectOverlay.tsx` |
| Listing | `src/components/OnlineBeatmapCatalog.tsx` (replace chrome; keep download helper) |
| PlayerLoader | new `src/components/PlayerLoader.tsx`, first paint of `/play` |
| HUD | `src/components/ManiaHud.tsx` |
| Playfield notes | `src/render/argonPlayfield.ts`, `argonSkin.ts`, `Canvas2DRenderer.ts` |
| In-play overlay | `GameplayCanvas.tsx` + PlayerLoader settings groups shared module |
| Pause / fail | `src/components/PauseOverlay.tsx` |
| Results | `src/components/ResultsScreen.tsx` |
| Settings | `src/components/settings/SettingsDrawer.tsx` + registry (IA unchanged) |
| Skins | `src/components/SkinScreen.tsx` |
| History | `src/components/PersonalHistoryScreen.tsx` |
| Argon CSS | `src/index.css` `html[data-skin="argon"]` |
| Judgement names/colours | `src/ruleset/mania/judgements.ts` (do not rename internals in `scoreProcessor.ts`) |
| PENAR stub | `src/utils/penar.ts` |
| Density 64-bin | `src/render/argonSkin.ts` `computeSongDensityBins` |
| Preview audio | `src/utils/previewPlayer.ts` |

**Never copy `visual-refs/` into `public/`.**

---

## API / Interface Changes

No HTTP API changes in visual PRs. Listing chrome consumes the **live** `GET /api/catalog/search` + Catboy/osudl helper. Changing hosts or dropping the token gate is **not** a visual PR (`TASK-C-*` if revived).

UI-level interfaces this spec adds:

```ts
type LazerMenuState = 'initial' | 'topLevel' | 'play';

type ComingSoonReason = 'coming-soon';

interface ToolbarProps {
  visible: boolean;
  active: 'home' | 'listing' | 'music' | 'none';
  displayName: string;
  onSettings(): void;
  onHome(): void;
  onListing(): void;
}

interface PlayerLoaderProps {
  beatmap: Beatmap;
  settings: GameSettings;
  playSessionOffsetMs: number;
  onPlaySessionOffsetChange(ms: number): void; // clamp −1000…1000; App-owned
  onBack(): void;
  onReady(): void; // countdown
  onPatchSettings(patch: Partial<GameSettings>): void; // dim, hitsoundVolume only — not offset
}
```

Settings patches still flow through `sanitizeSettings`. V-050 does **not** add `gameplayBackgroundBlur` or a persisted per-map offset map. **`playSessionOffsetMs` is App React state**, not `GameSettings`. `GameplayCanvas` effective offset = `settings.audioOffset + playSessionOffsetMs`. Clear `playSessionOffsetMs` to `0` when leaving `/play`.

---

## Data Model Changes

None for server. Client:

- No new persistent keys for chrome.
- Favourites already `rhythm_mania_v1_favorite_songs`.
- History already `rhythm_mania_v1_play_history`.
- PlayerLoader per-map offset: App-owned **`playSessionOffsetMs: number`**, not persisted, cleared when leaving `/play`. GameplayCanvas consumes `settings.audioOffset + playSessionOffsetMs`.
- Hitsounds: existing `hitsoundVolume` only.

---

## Alternatives Considered

**1. Keep current chrome, only restyle colours.**  
Rejected. Stills require different layout (cookie button system, V2 carousel, Argon HUD capsule, results ring). Colour tokens alone cannot get there.

**2. Embed a 1024×768 lazer-style design canvas and letterbox.**  
Closer to `ScalingContainerTargetDrawSize`, but every still is 1366×768 and C# constants already match those pixels. Letterboxing wastes mobile height. Chosen: 1366×768 du on desktop, a real compact layout at 390×844.

**3. Hide unavailable features (Edit, Multi, Playlists, wiki, …).**  
Rejected by user lock. Visible + coming-soon.

**4. Use osu-web listing PNGs as the visual target.**  
Rejected by user lock. Chrome is `beatmaplisting.jpg`.

**5. Treat Babylon as Argon SoT.**  
Rejected. Canvas2D is latency/visual SoT; Babylon is EXTRA.

**6. Listing data: keep osu! token search vs ship hinai/osu.direct in the visual PR vs local-only listing.**  
Chosen: **chrome-only visual PR** against the live Bearer + Catboy/osudl helper. Planned unauthenticated hinai → osu.direct → Catboy is `TASK-C-*` if revived — not a visual dependency. Local-only listing would make Browse a no-op.

**7. History entry: menu wedge vs route-only vs Options row.**  
Chosen: keep `/history` + Options “View play history” + Results local browse. **No** menu wedge (lazer has none). Chrome restyle gated until a still.

**8. Greenfield `src/ui/lazer/` vs extend in-tree module.**  
Chosen: **delta** on existing `tokens.css` / `applyLazerChrome` / primitives. Duplicating files would clobber V-001.

---

## Security & Privacy Considerations (brand + assets)

| Threat | Mitigation |
|---|---|
| Trademark / brand confusion | No osu! logo, wordmark, ppy, Torus, official mascots, osu-resources bitmaps. Cookie is original geometry + “RM”. Listing icon is original. |
| Shipping stills | `visual-refs/` stays out of `public/`. Playwright compares at dev-time only. |
| Asset XSS | Imported beatmap media still goes through `isSafeAssetUrl`. Catalog covers are a separate path (existing); do not loosen. |
| Offline privacy | No Google login, no RM accounts, no replay upload. Local display name is device-local (max 32). |
| Coming-soon destinations | Must not deep-link to osu.ppy.sh in a way that implies we are osu!. Wiki/changelog coming-soon; do not open osu! web as a substitute. |

Severity: **High** if a shipped build contains the osu! mark or mascot. Mitigation is the cookie/empty-state rules above.

---

## Observability (visual regression)

This is a visual spec; “observability” is **regression against stills**, not APM.

| Check | How |
|---|---|
| Layout | Playwright 1280×720 screenshot vs mapped still (scale still to 1280×720 for diff). Fail on HUD corner / missing cookie / Global tab / “pp” / osu! wordmark |
| Compact | Playwright **390×844**. Assert hit targets ≥44px, no sheared clip |
| Motion | Hover Play at 2× duration; elastic width not CSS `ease`. Reduced-motion: no pulse/elastic |
| Tokens | `/` has `html[data-ui="lazer"]`. Cookie tokens present |
| Unit | Existing Vitest stays green (`npm run lint`, `npm test`). Visual PRs do not claim “looks like lazer” from unit tests alone |

No production metrics required for chrome. Optional: count coming-soon clicks in local debug only — not a product analytics pipeline.

---

## Rollout Plan

Lazer chrome is the **default Argon path**. Escape hatch: `skinId → rhythmmania` and `data-skin=legacy` still render old skins (`plan.md`).

Staged by PR (see **PR Plan**). `applyLazerChrome` already sets `data-ui="lazer"` for Argon. Mid-queue mixed chrome (lazer menu + old select) is **expected**; do not mix surfaces inside one task to hide it. Settings/Skins/History restyles are **out of this queue**.

Rollback: revert the visual PR; mechanics are untouched. Do not feature-flag individual pixels beyond `data-ui`.

---

## Open Questions

None. Remaining leftovers were locked by the user on 2026-09-12.

---

## References

- Stills: `visual-refs/**` (this spec’s visual SoT)
- Product IA: `plan.md` (offline client, Local ranking, mirrors, PENAR stub, TASK-V queue)
- Lazer MIT source (numbers only, no assets):
  - `osu.Game/Screens/Ranking/Expanded/Accuracy/AccuracyCircle.cs` — `VIRTUAL_SS_PERCENTAGE`, `GRADE_SPACING_PERCENTAGE`, badge lerp
  - `osu.Game/Screens/Ranking/Expanded/Accuracy/GradedCircles.cs` — D–SS arc bands, `Rotation = startProgress * 360`
  - `osu.Game/Rulesets/Scoring/ScoreProcessor.cs` — mania grade cutoffs 1.00 / 0.95 / 0.90 / 0.80 / 0.70 / 0
  - `osu.Game/Screens/Menu/ButtonSystem.cs` — `BUTTON_WIDTH = 140`, `WEDGE_WIDTH = 20`
  - `osu.Game/Screens/Menu/MainMenuButton.cs` — hover ×1.5 OutElastic 500ms, bounce constants
  - `osu.Game/Screens/Menu/ButtonArea.cs` — `BUTTON_AREA_HEIGHT = 100`
  - `osu.Game/Overlays/Toolbar/Toolbar.cs` — `HEIGHT = 40`, `TOOLTIP_HEIGHT = 30`
  - `osu.Game/OsuGame.cs` — `SHEAR = (0.2, 0)`, `SCREEN_EDGE_MARGIN = 12`
  - `osu.Game/Screens/Footer/ScreenFooter.cs` — `HEIGHT = 50`, logo facade `(-76, -36)`
  - `osu.Game/Screens/Footer/ScreenFooterButton.cs` — 116×75, radius 10
  - `osu.Game/Screens/Footer/ScreenBackButton.cs` — width 240, `#DE31AE` / `#FF86DD`
  - `osu.Game/Screens/Play/GameplayMenuOverlay.cs` — 200ms In, 80px bars, 0.75 scrim
- In-tree: `src/ui/lazer/*` (extend), `src/render/argonSkin.ts`, `src/ruleset/mania/judgements.ts`, `src/utils/penar.ts`, `src/utils/osuTokenManager.ts`, `src/components/*`
- Fonts: Inter, Space Grotesk, JetBrains Mono via `src/index.css` (add Space Grotesk 600 in PR-V1)

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Mid-queue mixed chrome | Low (expected) | Serial TASK-V; do not “fix” other surfaces inside a task |
| Elastic hover + triangle field cost | Medium | Cap triangles; Motion only on menu width; playfield stays Canvas2D |
| Shear clipping at 390×844 | High | Compact layout, Playwright 390×844 gate |
| PENAR looking like a bug | Medium | Intentional `—` + `PENAR` label, never `pp` |
| Trademark slip | High | Cookie/empty-state/listing icon rules; screenshot CI for “osu!” text in chrome |
| Colour-spec “UPDATED” rows | Medium | Cite `argonSkin.ts` only |
| Catalog filters over-promising | Medium | Greyed table in §5 |
| Mixing catalog backend into V-040 | High | Chrome-only PR; live Catboy/osudl + token search |

---

## PR Plan

Independently reviewable PRs, ordered for a visual rebuild. Aligns with `plan.md` remaining TASK-V-001, V-010–013, V-020–024, V-030–032, V-040, V-050, V-060–063, V-070–071, V-080. **Not** TASK-090 (PENAR formula). **Not** Settings/Skins/History chrome (gated appendix). Default execution remains **one pending TASK-V at a time** unless the user batches.

Each visual PR: `npm run lint` && `npm test`; Playwright 1280×720 + 390×844 vs mapped stills **only for stills that the PR’s surfaces fully include**. `npm run build` when Vite/CSS/chunks change.

### PR-V1 — Lazer primitive delta

- **TASK:** V-001 (tree already has most of this — treat as delta)
- **Title:** Extend `src/ui/lazer/` (`--rm-u`, ComingSoon, Back colour pair, Space Grotesk 600)
- **Files:** `src/ui/lazer/tokens.css`, `motion.ts`, `ComingSoon.tsx` (new), `src/index.css` (font query), existing `LazerCookie` / `FooterBackButton` only if size/colour props need extending
- **Deps:** none
- **Description:** Do **not** add duplicate cookie/shear/footer files. Playwright: `/` has `data-ui="lazer"` (already true). No “looks like lazer menu” claim.

### PR-V2 — Main menu idle + button system (no toolbar still-match)

- **TASK:** V-010 + V-011
- **Title:** Rebuild main menu idle field and sheared button system
- **Files:** `src/components/MainMenu.tsx`, `src/ui/lazer/*`
- **Deps:** PR-V1
- **Description:** Initial / TopLevel / Play states. Coming-soon Edit / Multi / Playlists. Exit confirm → idle. **Still-match gate: `first menu 1.png` only.** Button-system smoke (idle → top-level → play → solo) without claiming still-match on `first menu 2/3` / `on hover` (those frames include the toolbar).

### PR-V3 — Global toolbar + now-playing (unlocks menu still-match)

- **TASK:** V-012 + V-013
- **Title:** Add lazer toolbar, hover captions, now-playing popover
- **Files:** `src/ui/lazer/Toolbar.tsx` (new), now-playing popover, `src/App.tsx`
- **Deps:** **PR-V2** (menu states exist so the toolbar can hide on Initial)
- **Description:** Omit ruleset / news / chat / social. Wire Settings, Home, Listing, Music. F6 / Ctrl+B. Compact keeps Listing. Coming-soon wiki/changelog/globe/bell/rankings behind `···` on 390×844. **Still-match `first menu 2.png`, `first menu 3.png`, `first menu on hover.png` happens in this PR**, not V2. Also captions / now-playing stills.

### PR-V4 — Song Select V2 shell + footer + cookie

- **TASK:** V-020
- **Title:** Rebuild Song Select frame, footer, parked cookie
- **Files:** `src/components/SongSelect.tsx`
- **Deps:** PR-V1, PR-V3
- **Description:** Blur 20, footer Back/Mods/Random/Options, cookie shared-element, compact unshear. Not carousel guts.

### PR-V5 — Carousel + left metadata + Local ranking + filters

- **TASK:** V-021 + V-022 + V-023
- **Title:** Song Select carousel, Local ranking, search/star/group
- **Files:** `src/components/SongSelect.tsx`
- **Deps:** PR-V4
- **Description:** Expanded/collapsed sets. Local only, “No records yet!”. Show converts greyed. Wedge **500 du ±20**. Left row is playcount/favourite/length/BPM — **not** preview transport.

### PR-V6 — Options popover

- **TASK:** V-024
- **Title:** Song Select Options popover
- **Files:** `src/components/SongSelect.tsx` or `src/ui/lazer/BeatmapOptionsPopover.tsx`
- **Deps:** PR-V4
- **Description:** Still-match `option menu.png` **except** the extra **View play history** row (allowed delta: same type as other General rows; must not push Hide off-screen). Compact: History remains tappable. Edit/Copy/Collections coming-soon where required.

### PR-V7 — Mod select overlay

- **TASK:** V-030 + V-031 + V-032
- **Title:** Rebuild Mod Select columns, tooltips, customise, unranked
- **Files:** `src/components/ModSelectOverlay.tsx`
- **Deps:** PR-V4
- **Description:** Full still overlay. Dual Stages + DC greyed. K1–K10 via `handleToggleKeyMod`. CN stays cinema/autoplay. Rate chrome uses 0.75/1.5. Unranked = AT|CN only.

### PR-V8 — In-client beatmap listing

- **TASK:** V-040
- **Title:** Replace catalog drawer with lazer beatmap listing overlay
- **Files:** `src/components/OnlineBeatmapCatalog.tsx`
- **Deps:** PR-V3 (toolbar icon)
- **Description:** **Chrome only.** `beatmaplisting.jpg` layout. Mode locked osu!mania. Ranked/Loved/Graveyard chips call the **live** search helper. Empty type-only “… nope, nothing found.” Do **not** change hosts, failover, or token gate. No osu.direct/hinai requirement.

### PR-V9 — PlayerLoader

- **TASK:** V-050
- **Title:** Add pre-play PlayerLoader
- **Files:** `src/components/PlayerLoader.tsx`, `src/App.tsx` (`playSessionOffsetMs` state), `GameplayCanvas.tsx` (effective offset = `audioOffset + playSessionOffsetMs`)
- **Deps:** PR-V4
- **Description:** Match `pre game stage.png`. RM cookie. Wire `backgroundDim`; hitsounds via `hitsoundVolume`; **`playSessionOffsetMs` App-owned, not sanitizeSettings**; blur/skins/colours coming-soon. Auto-advance decode+400ms. Do not alias CN to `disableVideo`. Clear offset on leaving `/play`.

### PR-V10 — Argon playfield notes / holds / receptors / colours

- **TASK:** V-060
- **Title:** Rebuild Canvas2D Argon note construction
- **Files:** `src/render/argonPlayfield.ts`, `argonSkin.ts`, `Canvas2DRenderer.ts`, `tests/argon-skin.test.ts`
- **Deps:** none (mechanics already shipped)
- **Description:** Filled chevron, white foot, minus holds, receptor flash, key overlay ovals. Colours from `getArgonColumnColor` only.

### PR-V11 — Argon HUD + countdown + judgement popups

- **TASK:** V-061 + V-062
- **Title:** Rebuild Argon HUD, countdown, judgement text
- **Files:** `src/components/ManiaHud.tsx`, countdown in `GameplayCanvas.tsx`
- **Deps:** PR-V10 recommended
- **Description:** Capsule health + in-bar score, PENAR slot `—`, centre combo, 64-bin progress. Countdown disc. PERFECT/MISS tracking.

### PR-V12 — Replay spectator HUD + in-play settings overlay

- **TASK:** V-063
- **Title:** Spectator line, key counters, playback/settings overlay
- **Files:** `ManiaHud.tsx`, `GameplayCanvas.tsx`, shared settings groups with PlayerLoader
- **Deps:** PR-V9, PR-V11
- **Description:** Match `19-55-50.jpg`. Playback card replay-only. Visual/Audio groups.

### PR-V13 — Pause and fail

- **TASK:** V-070 + V-071
- **Title:** Rebuild pause/fail overlays (Quit label)
- **Files:** `src/components/PauseOverlay.tsx`
- **Deps:** PR-V1
- **Description:** 80du sheared bars, triangle fill, exact stats labels, 200ms In, fail grey save strip.

### PR-V14 — Results

- **TASK:** V-080
- **Title:** Rebuild results card, mania stats, local side list
- **Files:** `src/components/ResultsScreen.tsx`
- **Deps:** PR-V3, PR-V5 (local list)
- **Description:** Grade ring, PENAR, Perfect→Miss grid, side cards, footer widths in §12 + Retry/Replay on fresh play (compact wrap).

### PR-V15 — Compact 390×844 sweep

- **TASK:** cross-cutting, after each surface **and** a final sweep
- **Title:** Compact layout: no shear clipping
- **Files:** tokens + each rebuilt surface in PR-V2–V14
- **Deps:** PR-V2–V14 as they land
- **Description:** Axis-aligned controls, 44px targets, Playwright 390×844. Toolbar keeps Listing. Results footer wrap rule.

**Blocked / not in this queue:** Settings drawer restyle, Skins overlay restyle, History restyle (appendix §13–15). They wait for stills. History **entry** is already in PR-V6 (Options row) + existing `/history` + Results browse.

---

*End of design specification. Visual truth is `visual-refs/`. Product IA is `plan.md` plus the user-locked overrides in Key Decisions. Do not implement from the previous DESIGN.md.*
