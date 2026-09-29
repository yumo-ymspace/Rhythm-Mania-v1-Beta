# RhythmMania Visual Design Specification

**osu!(lazer) client chrome, recreated in-browser**

| Field | Value |
|---|---|
| **Document** | RhythmMania visual / interaction design specification |
| **Author** | Design (draft) |
| **Date** | 2026-09-12 |
| **Status** | Draft |
| **App version** | `package.json` `"version": "latest"`; `metadata.json` / `index.html` title `v1 Beta`. `api/config.ts` + `api/health.ts` fall back to `0.9.8` only when metadata is missing |
| **Visual SoT** | Every still under `visual-refs/` (measured). Not the previous `DESIGN.md`. Not the current React chrome |
| **Behaviour SoT** | Shipped behaviour in `src/` (gameplay, scoring, storage), except where this document records a **user-locked override** |
| **Audience** | Senior engineers implementing the lazer visual rebuild |

Visual + interaction spec only. Gameplay windows, scoring, holds, HP, and mod multipliers are shipped — do not reopen them. Catalog **chrome** is in scope; catalog **hosts** are settled (unauthenticated catboy.best → Nekoha, no token) and only summarised here.

---

## Overview

RhythmMania is an **offline osu!(lazer)-style mania client in the browser**: play, import, local scores, mirror downloads. This spec rebuilds every session surface from `visual-refs/` so an engineer can implement layout, colour, type, motion, and states **without opening osu!**.

Extend the in-tree lazer module (`html[data-ui]="lazer"`, `src/ui/lazer/tokens.css`, `motion.ts`, `LazerCookie`, `Shear`, `FooterBackButton`, `LazerToolbar`, `NowPlayingPanel`, `ButtonSystem`, `MenuButton`, `TriangleField`, `SongSelect*`, `ComingSoonNotifications`). Recreate lazer geometry in original CSS/canvas: sheared parallelograms, the RhythmMania cookie (never the osu! mark), WebGL2 Argon playfield (sole renderer), Local-only ranking, PENAR where lazer shows PP. Never ship official artwork, the osu! logo, Torus, "ppy", osu-resources bitmaps, or mascots. Brand text is **RhythmMania**; rating is **PENAR**, never "pp".

---

## Background & Motivation

Mechanical target: current lazer mania. Visual target: `visual-refs/`. The old arcade/indigo/cyan language is not this product. `docs/` contains only `rmr-format.md`; there is no `lazer-visual-plan.md`.

Removes: pixel-guessing from memory, product-IA drift (global boards, osu! API search, Google login) leaking into chrome, trademarked marks, treating anything but WebGL2 Argon as playfield truth.

Reference (not visual truth): `MainMenu`, `SongSelect`, `ManiaHud`, `ModSelectOverlay`, `OnlineBeatmapCatalog`, `PauseOverlay`, `ResultsScreen`, `GameplayCanvas`, `WebGL2PlayfieldRenderer`, `argonSkin`, `flashlight`, `src/index.css`. `applyLazerChrome` lives in `src/ui/lazer/motion.ts` and is called from `App.tsx`; extend the module, don't duplicate files.

---

## Goals & Non-Goals

**Goals**

1. Recreate lazer **session chrome** from stills, incl. idle motion, hover, enter/exit, reduced-motion.
2. Per surface: layout regions + z-order, 1366×768 design units **and** a CSS mapping rule, sampled tokens, type, geometry, states, motion, "not copied" list.
3. Keep the offline product: Local ranking only, device history (`rhythm_mania_v1_play_history` / IndexedDB v6). Listing chrome matches lazer; data stays on the live unauthenticated helper.
4. Keep WebGL2 Argon as playfield visual/latency SoT.
5. Preserve equal-width 1K–10K lanes, 64-bin density histogram (`computeSongDensityBins`), six judgements (internal `marvelous/perfect/great/good/bad/miss` → display `Perfect/Great/Good/Ok/Meh/Miss`), PENAR counter (`—` when uncalculated).

**Non-Goals**

- Playable osu!/taiko/catch, editor, multiplayer, playlists, storyboards, chat, wiki, medals, skin JSON editor.
- Google OAuth, RM accounts, PostgreSQL, global/RM leaderboards, replay upload.
- Restyling Settings / Skins / History chrome (no stills; appendix only).
- Copying osu-resources bitmaps, wordmark, mascots, Torus. Redesigning `renderDpr` (1/1.5/2, default 1.5; legacy `limitDprToOne` only migrates, never ships).
- Reopening shipped mechanics. Pixel-identical GPU match to `osu.exe` (fail review only on wrong HUD corners, note construction, chrome family, branding).

---

## Key Decisions

| Decision | Choice |
|---|---|
| Catalog chrome vs data | Chrome from `hud/beatmaplisting.jpg` + `beatmaplistingnosongs.jpg` (ignore osu-web PNGs). Data: unauthenticated `GET /api/catalog/search` (catboy.best primary `?query=&mode=3&status=`, Nekoha fallback; `q` required ≤100, `s` = ranked/loved/graveyard/any) + download `catboy.best/d/<id>` → `mirror.nekoha.moe/api/download/<id>` on any Catboy failure (`osuTokenManager.ts`). No Bearer token, no 401 connect copy, no osudl.org/hinai/osu.direct. Ship chrome against this helper |
| Menu options | Show all lazer options (settings, play, edit, browse, exit; play → solo/multi/playlists). Unavailable = visible, greyed, "Coming soon" |
| Toolbar | Stills minus ruleset icons, news, chat, social. Keep settings, home, changelog, wiki, rankings (coming-soon, present in stills), listing, globe, now-playing, name+avatar, clock, bell. No-route destinations greyed/coming-soon |
| Pause/fail red button | **Quit** (keep `onExit` / `pause-quit-btn` ids) |
| Song Select ranking | Lazer chrome (Details/Ranking, Scope/Sort/Selected Mods) but **Local only**. No Global tab, no sign-in copy. Empty: **"No records yet!"** (`song-select/song select.png` Global is layout-only) |
| Results | Layout from `results/osu_2026-09-12_19-51-20/31.jpg` (osu!standard captures). Mania judgements; PP cell → **PENAR**. Just-finished play inserts Retry/Replay between Back and the green cluster without translating either (§12) |
| PlayerLoader | Include (`hud/pre game stage.png`). RM cookie, not osu! mark. First paint of `/play` |
| Coordinates | Stills are **1366×768 du** (1365×767 PNGs = 1px crops). Bars = `100%` viewport; listing panel inset x=102–1264. Inner sizes × `--rm-u` (`min(100vw/1366, 100vh/768)` ≥721px; `1` ≤720px). Chrome shear-off `max-width: 720px` (proposal; in-tree `tokens.css` is still 480px) |
| Coming-soon | Opacity **0.50**, no hue-shifting grayscale, `cursor: default`, click no-op + "Coming soon" toast/tooltip; hover captions still show |
| Modes | **osu!mania locked selected**; others greyed/unclickable. Converts dropped on Song Select |
| Empty listing | Copy **"… nope, nothing found."**, type-only; optional original triangle motif. No official character |
| Logo | Pink disc `#e967a1`, white ring, inner triangles, spectrum bars, **"RM"**. Never "osu!" |
| Fonts | Self-hosted only (`public/fonts`: Inter/Nunito/Orbitron/SpaceGrotesk variable TTFs + OFL txts, `@font-face` in `src/index.css`, precached in `sw.js`). No Google Fonts `@import`, no `fonts.googleapis.com`. No JetBrains Mono in-tree — score/combo/clocks use Space Grotesk / tabular system stack. Space Grotesk variable covers 300–700; do not add Torus or 800–900 |
| Argon colours | Ship `getArgonColumnColor` / `argonPaletteForKeyCount` (`argonSkin.ts`). Ignore "UPDATED" mock rows in colour-spec stills |
| Song Select wedge | Decorative left metadata **500 du ±20** desktop; no shear at 390×844 |
| Primitives | Extend `src/ui/lazer/`; add `--rm-u`. New primitive is the existing `ComingSoonNotifications` pattern (there is no `ComingSoon.tsx`). Cookie sizes: idle **480**, top-level **220 ±8**, parked **200 ±20**, PlayerLoader **72 du**. Footer Back 240 du on Song Select (210px min floor until then) |
| Display name | Persist `localDisplayName: ''` (max 32, copied to `playedBy`); render **`Guest`** |
| History entry | Keep `/history`; add Song Select Options → **View play history**; Results browses local scores. No menu History wedge |
| Cinema | `CN` stays shipped cinema/autoplay (`GameplayCanvas` hides `.playfield-chassis-container`). Not `disableVideo` |
| Exit confirm | **"Return to the title screen?"** → menu Initial. Never `window.close()` |
| Details tab | Source, tags, mapper; Inter 13; spacing unverified (no filled still) |
| Toolbar extras | Changelog, wiki, globe, bell (+rankings): coming-soon, never open osu! web |
| Results ticks | Lazer MIT (`AccuracyCircle`/`GradedCircles`/`ScoreProcessor`); stills SoT for A/C; SS/S/F from source (§12) |
| Listing view | **Grid only**; omit list-mode button |
| Calibration copy | In-play: **`Previous play: Previous play too short to use for calibration`** (red) when wizard has no sample |
| Holds/replays | Live default hold v3 (`LAZER_HOLD_RULES_VERSION = 3`, 1.5× tail lenience); v2 tick default 50ms (10–100). Replays: lane frames + initial neutral frame, schema v3, local cap 1,000,000 frames; export envelope `rhythmmania-replay-export` (import caps 64 MiB/500 records, local-only). AT+CN = autoplay, never recorded. K-mods remap 1–10 via `convertBeatmapKeyCount`, id suffix `_converted_<N>k` |

---

## Stills inventory

Paths relative to `visual-refs/`. 1365×767 PNGs read as 1366×768 du. Cropped playfield shots are close-ups only; 1366×768 HUD JPEGs are HUD SoT.

| Still | Surface |
|---|---|
| `hud/first menu 1/2/3.png`, `first menu on hover.png` | Menu idle / top-level / play submenu |
| `hud/option menu.png` | Song Select Options + Local empty |
| `hud/pre game stage.png` | PlayerLoader |
| `hud/mod menu.png`, `mods.jpg`, `mod2.jpg`, `mod3.jpg`, `modcustomise.jpg`, `modunranked.jpg` | Mod Select states |
| `hud/songselect.jpg`, `songslect.jpg`, `songslect (2).jpg` | Select V2 expanded / collapsed / graveyard |
| `hud/songselct onhober playing.jpg`, `songselct onhover playing songs.jpg`, `onhover smth.jpg`, `on hover top bar smth.jpg`, `onhover smth else.jpg` | Toolbar captions + now-playing popover |
| `hud/beatmaplisting.jpg`, `beatmaplistingnosongs.jpg` | In-client listing + empty (target) |
| `pause/pausef.png`, `failed.png` | Pause / fail |
| `playfield-4k/lazer-argon-mania-gameplay.png`, `argon-column-colours-1k-10k.png` | Argon close-up / ship OK colour rows |
| `playfield-4k/argon-column-colour-spec.png` | Geometry notes only, not colour table |
| `playfield-4k/Screenshot … 192641/192820/192855.png` | Cropped HUD/miss/countdown/key-press |
| `playfield-4k/osu_2026-09-12_19-55-36.jpg` … `19-56-12.jpg` | Full Argon HUD, spectator, playback overlay |
| `results/osu_2026-09-12_19-51-20/31.jpg` | Results this-play / browsing |
| `song-select/song select.png` | V2 shell (Global = layout-only) |

Ignore osu-web listing PNGs if present. `settings/` stills exist but have no spec coverage yet.

---

## Design coordinate system

Numbers labelled **du** = pixels on a 1366×768 still. Do not mix lazer `ScalingContainerTargetDrawSize (1024,768)` space. C# constants (`Toolbar.HEIGHT=40`, `BUTTON_AREA_HEIGHT=100`, `BUTTON_WIDTH=140`, `WEDGE_WIDTH=20`) are source defaults; PNG measures are stills — cite both on conflict (e.g. strip 96 measured / 100 C#, ±4).

```css
@media (min-width: 721px) { html[data-ui="lazer"] { --rm-u: min(100vw / 1366, 100vh / 768); } }
@media (max-width: 720px) { html[data-ui="lazer"] { --rm-u: 1; --lazer-shear: 0deg; --lazer-unshear: 0deg; } }
```

`--rm-u` scales inner sizes/type/padding/gaps/cookies/cards/glyphs (`calc(N * var(--rm-u))`). It does not scale bar widths (`100%`), scrims, or canvas backing stores. Compact (≤720px / 390×844): axis-aligned, no shear, min tap 44 CSS px. Never mix cropped-screenshot px with 1366×768 du.

---

## Proposed Design

### 1. Tokens & type

Scope chrome tokens to existing `src/ui/lazer/tokens.css`; Argon tokens stay on `html[data-skin="argon"]`.

**Motion (osu!framework; not Tailwind `ease-out`):** OutQuint `cubic-bezier(0.22,1,0.36,1)` (settle), OutExpo `(0.16,1,0.3,1)` (logo return, contract, flash), InSine `(0.12,0,0.39,0)` (flatten), InOutSine `(0.37,0,0.63,1)` (beat tilt), OutElastic spring `{type:"spring",duration:0.5,bounce:0.35}` (menu hover width only). Overlay 200ms In (pause/fail `TRANSITION_DURATION`); toolbar 500ms OutQuint. Animate `transform`/`opacity` only; menu buttons collapse on width, never `scale(0)`; never `transition: all`.

**Chrome colours:** pink `#e967a1` (cookie; menu2 `#ea5e9d` ±6 still-diff, no fork), pink-light `#ff7db7`, ring `#fff`, yellow `#ffcc22` (paused/failed), yellow-dark `#eeaa00`, green `#88b300`, quit `#aa1b27`, play `#6644cc`, multi `#5e3fba`, edit `#eeaa00`, browse `#a5cc00`, exit `#ee3399`, back `#333a5e`, settings `#555555`, strip `#323232`, toolbar `#191919`, footer-back mid `#e91e8a` + dark `#de31ae` + light `#ff86dd`, triangle field `#172639`–`#20324a`, scrim `rgba(0,0,0,0.75)`, coming-soon opacity `0.50`.

**Argon (cite, don't redesign):** `#a96aff/#ffc528/#fc6d01/#d5235a/#cb3cec/#48c6ff/#64c05c`, `NOTE_HEIGHT 42`, `ACCENT_RATIO 0.82`, `CORNER_RADIUS 3.4`, `COLUMN_GAP 1`, `--argon-accent #66ccff`. Old double-wedge is not in stills.

**Type:** menu labels Space Grotesk 500/16 lowercase; `paused/failed` Space Grotesk 600/48, tracking 5, yellow; select title Space Grotesk 700/~30; artist Inter 500/14; toolbar captions Inter 700/14 + 400/12; footer Back Inter 500/18 (`Back`), Mods/Random/Options Space Grotesk 500/16; score/combo/clocks Space Grotesk 700 tabular (no JetBrains Mono); judgement popups Space Grotesk 600/24, tracking 0.35em, uppercase spaced; mod rows Inter 600/14 + 400/12 at 55%; listing title Inter 500/20 lowercase; grade letter Space Grotesk 700/**120 ±8**; tooltips Inter 500/12.

**Delta on `src/ui/lazer/`:** add `--rm-u` + 720px shear-off; footer-back dark/light; cookie size props (see Key Decisions); Back 240 du on select. Reuse `applyLazerChrome`/`useLazerReducedMotion`. Shipped files include `motion`, `LazerCookie`, `Shear`, `FooterBackButton`, `LazerToolbar`, `NowPlayingPanel`, `ButtonSystem`, `MenuButton`, `TriangleField`, `SongSelectLeftPanel/Carousel/Footer`, `ComingSoonNotifications`, `LazerDebugSmoke` — do not recreate them.

**Not copied:** osu! wordmark/logo geometry, ppy, Torus files, osu-resources bitmaps, mascots incl. empty-listing character, osu! cursor bitmap.

---

### 2. Toolbar + now-playing + captions

Stills: `first menu 2.png`, song-select hover JPEGs. Source: `Toolbar.cs` (`HEIGHT=40`, `TOOLTIP_HEIGHT=30`, 500ms).

```
z20 Toolbar 40du #191919 full width — LEFT: Settings Home | RIGHT: Changelog Wiki Rankings* Listing Globe Music | Name Avatar Clock Bell
z21 Hover caption 30du two lines under icon | z22 Now-playing popover (Music active)
```

Icon buttons 40×40 (glyph ~18); 1du cyan underline on active destination; listing icon pink-filled when listing open. User chip: Inter 13 + 28×28 avatar, `Guest` fallback. Clock JetBrains-free mono stack 11–12: `h:mm:ss AM/PM` + pink `running hh:mm:ss`. Bell 40×40, coming-soon click.

Captions (title Inter 700/14, subtitle 400/12 at 70%): wiki `wiki/knowledge base`; listing `beatmap listing/browse for new beatmaps` (`CTRL-B`); now-playing `now playing/manage the currently playing track` (`F6`). Settings/Home/Changelog/Globe/Rankings/Bell captions unverified — use stills + generic "Coming soon" until sourced.

Now-playing popover: top-right under music icon (pink while open), **320×90 ±12**, cover fills panel, title/artist top-right, shuffle/prev/pause/next/playlist row, yellow `#eeaa00` progress ~3du. Shuffle/playlist coming-soon without a queue model; prev/next/pause wire to `previewPlayer`.

States: hidden on menu Initial + gameplay (500ms OutQuint slide/fade); visible on top-level/submenu/select/listing/PlayerLoader/Results/overlays; coming-soon 0.50 + caption. Compact keeps Settings, Home, **Listing**, Music, Clock (+name/avatar if ≥44px/28px fit); only coming-soon icons overflow into a 40×40 `···` bottom sheet (44px rows). Never drop Listing.

Wiring: Settings→drawer; Home→menu Initial; Listing→overlay; Music→popover; Clock→live; Name/avatar→Settings General (no profile); rest coming-soon. Shortcuts: `F6` popover, `Ctrl+B` listing, `Esc` closes topmost overlay (menu Esc: Play→TopLevel→Initial). Motion: show 200ms delay + 500ms OutQuint from y=−40; hide 500ms InQuint + fade.

### 3. Main menu

Stills: `first menu 1/2/3/on hover.png`. Sources: `ButtonSystem/MainMenuButton/ButtonArea`.

States: `Initial --cookie/Enter/any non-modifier--> TopLevel --Play/cookie--> Play --Solo--> /select`; `Play --Back/Esc--> TopLevel`; `TopLevel --Esc/idle 15s--> Initial`. No `window.close()`.

Z: triangle canvas / spectrum / button strip (TopLevel/Play) / cookie / toolbar (not Initial) / exit modal.

Idle: full-viewport field `#172639`–`#20324a` (cap browser spawn, e.g. ≤80 triangles / 50ms; lazer ~22ms spawn / 120ms fade is too hot). Cookie **480 ±16** (ring 478–501, inner ~434, ring ~22), `#e967a1`, ring white, faint `#ff7db7` triangles, **RM** Space Grotesk 700 ~64. Spectrum radiates (analyser or 60 BPM idle); pulse ±4% damped OutQuint; no toolbar/strip.

TopLevel: strip **100 du** (C#; 96 measured ±4) full width centred `#323232`; cookie **220 ±8** overlapping Settings/Play; buttons height=strip, expanded 140, wedge 20, spacing −20. Icon 32 above lowercase 16, white + shadow. Order: settings `#555555` (drawer) | cookie | play `#6644cc` (submenu) | edit `#eeaa00` (soon) | browse `#a5cc00` (listing) | exit `#ee3399` (confirm→Initial).

Play submenu: Settings→Back `#333a5e`; solo `#6644cc`→`/select`; multi/playlists `#5e3fba` soon. No Daily Challenge.

Motion: expand/contract 500ms OutExpo (fade-in ≈83ms); explode 200ms (fade 150ms); hover width ×1.5 500ms OutElastic; beat-bounce half-beat (`HOVER_SCALE 1.2`, compression 0.9, rotation 8°, alternate); bar fade 300ms linear; flatten 300ms InSine; restore 400ms OutQuint; logo idle→strip 200ms In (1→0.5 + impact); strip→idle 800ms OutExpo (delay `barAlpha*150`); bar delay 150ms; click flash 800ms OutExpo from 0.9. Coming-soon wedges hover-widen, click no-ops. Exit confirm: "Return to the title screen?" → Initial. Compact: centred tappable cookie; unsheared 48px rows or scrolling strip.

### 4. Song Select V2

Stills: `songselect/songslect/songslect (2).jpg`, `option menu.png`, `song select.png` (Global layout-only).

Frame: `z0` BG full-bleed blur 20 (scaled layer) / `z1` dim-gradient / `z2` left wedge 500±20 + Details/Ranking / `z3` carousel / `z4` search/star/group/collection / `z5` footer 50 + parked cookie / `z6` toolbar / `z7` popovers.

Left: status pill (RANKED green, LOVED pink, GRAVEYARD/LOCAL grey; Inter 700/10, r4); title Space Grotesk 700 ~30; artist Inter 500/14 at 80%; counts row `▶ {local plays|—} ♥ {favourite toggle} ⏱ {m:ss} 🎵 {BPM|range}` (no invented osu! counts; preview transport lives only in now-playing popover); star pill + `{diff} mapped by {mapper}`; stats Notes/Hold Notes/Key Count/OD/HP (Inter 12, muted labels); tabs Details|Ranking (Ranking default); ranking toolbar Scope **Local only**, Sort Score, Selected Mods chip; empty info icon + "No records yet!"; filled = device history (id/hash/chart-revision/catalog id; score→accuracy→time; click→Results). Details tab: source/tags/mapper, Inter 13, unverified spacing. Wedge: 500 du panel + soft right fade, not hard clip.

Carousel (right): stacked set panels, wheel/keys/click scroll; collapsed (title/artist/pill/key dots/cover, dimmer); expanded (header + per-difficulty rows, selected = bright cyan right bar + left offset); row `[4K] {name} mapped by {mapper}` + star pill + 10-dot meter; OutQuint 200–400ms layout animation; Enter/cookie→PlayerLoader. No converts, no Global.

Top-right: `search…` (live `N matches`); star slider `0.0…∞`; Show converts greyed/no-op; Sort actually sorts library; Group (None default); Collection (All beatmaps default, favorites only real collection).

Footer: Back 240 sheared pink `#de31ae/#ff86dd` (menu; cookie shared-element to centre); Mods/Random/Options 116×75 r10 sheared (Mods green while open; Options purple-tint when open); icon-over-label + 5×100 accent bar r3; hover lighten 0.2 150ms OutQuint; click flash 800ms. Bar `#1a1e27`–`#22272a`, 50 full width; buttons overlap by `CORNER_RADIUS`. Parked cookie 200±20 bottom-right, preview-BPM pulse, click starts chart, interruptible shared-element.

Options popover (`option menu.png`): dark rounded **280×520 ±16** at Options button, 200–250ms OutQuint 0.95→1 + fade. Rows in still order: Manage collections (soon); set line + Delete (existing confirm); Play / Edit (soon) / Details… / Copy link (soon without catalog id) / Remove from played / Clear all local scores; **View play history → /history** (required addition, under General); Hide (pink) closes. No menu History wedge.

Compact: no shear; wedge→top stack; carousel full width; search stacks; cookie ≤96px or hidden behind footer Play; ranking full width; footer tappable ≥44px.

### 5. Listing overlay

Stills: `beatmaplisting.jpg/nosongs.jpg`. Opens from Browse or toolbar (pink active). Unauthenticated data contract above; chrome must not change failover or add hosts.

Layout: `z0` dimmed previous screen / `z1` panel x=**102–1264** (±8; 1162 wide) y=40–768 `#2d3236` / `z2` title/search/filters/sort/grid-or-empty / `z3` compact pink Back bottom-left / `z4` toolbar.

Title: original doc icon + `beatmap listing` Inter 500/20. Search full-width `type in keywords…` + loupe. Filter matrix (~90 label col + chips): Mode locks **osu!mania** (others greyed); Categories wires Ranked/Loved/Graveyard + Any, default **Ranked** (still's Has-Leaderboard selection is not copied; Has Leaderboard/Qualified/Favourites/Pending/WIP/My Maps greyed); General/Genre/Language/Extra/Rank-Achieved/Played/Explicit greyed (local-IndexedDB Played filter allowed only if cheap). Sort wires Title/Artist/Difficulty/Ranked if mirror supports; Rating/Plays/Favourites greyed otherwise. **Grid only** (3 cols at 1366; cover **80×56 ±4**; title/`by {artist}`/`mapped by {mapper}`/RANKED pill/mode dots/optional FEATURED ARTIST). Empty: **"… nope, nothing found."**, no character, optional 40% triangle motif. Cards use existing `downloadBeatmapsetArchive`; lazer-like cyan expand in pure CSS only.

Motion: overlay fade 200–300ms OutQuint; panel unsheared; card expand 200ms. Compact: 1 col; filters in disclosure; panel 8px inset; Back tappable.

### 6. Mods overlay

Stills: `mod*.png/jpg`. Keep `ModSelectOverlay.tsx` exclusivity; rebuild chrome. Dimmed select behind; sheared colour columns + horizontal scroll; banner, `tab to search…`, Customise; footer Back / Mods (green while owner) / Deselect All / chips.

Columns (~40 tall sheared headers): Presets yellow (`+` soon, no presets model) | Reduction lime (EZ NF HT **DC** NR) | Increase coral (HR SD PF DT NC FI HD Cover FL AC) | Automation cyan (AT, CN) | Conversion purple (RD DS MR DA CL IN CS HO + generated **K1–K10** via `handleToggleKeyMod`) | Fun pink (WU WD MU AS). Row: hex icon (redrawn SVG), name, one-liner; selected = column-accent fill (e.g. Nightcore).

Shipped vs soon: everything above except **DC + DS are in `ALL_MODS` with `comingSoon: true`** (greyed, never toggle; they are not absent). Presets `+` soon. No new mechanics or multiplier changes for chrome. `CN` keeps shipped cinema path (`isCinema` hides playfield chassis; `isAutoplay` includes CN) — never alias to `disableVideo`.

Search filters by name/acronym. Tooltip: dark r12 card ("Compatible with all mods" or "Incompatible with:" + hex chips). Customise dropdown green header: DA sliders wire to `DifficultyAdjustSettings` (OD/HP); Nightcore **Speed increase** is chrome — DT/NC/HT stay fixed 1.5/1.5/0.75, no variable-rate `GameSettings` field. Rate capsule above footer when HT/DT/NC: `0.75x`/`1.50x` (thumb fixed; `1.00x` only with none); footer BPM chip follows it. `UNRANKED` yellow badge when `isUnranked` (**AT/CN only** as coded); footer Mods grows to fit.

Motion: fade 200ms; columns stagger 30–80ms OutQuint; reverse on close. Compact: scroll, unclipped footer, reduced/off shear.

### 7. PlayerLoader

Still: `pre game stage.png`. First paint of `/play`; no skip. `z0` art blur 20 / `z1` centre column / `z2` right groups / `z3` Back / `z4` toolbar.

Centre: cookie **72 RM**; title Space Grotesk 600/**28**; artist Inter 500/14 uppercase-spaced; banner **280×64 ±8** cover crop; difficulty Inter 500/16; cyan star pill `★ 1.46`; muted Source/Mapper labels, white values.

Right cards (translucent dark; controls `#eeaa00/#ff22`-family yellow sliders/toggles): `backgroundDim` slider (exists 0–1); background blur **soon** (do not add `gameplayBackgroundBlur`); Storyboard/video toggle = `disableVideo` inverted (storyboard half soon); beatmap skins/colours, combo normalisation, disable-clicks: soon/none; hitsounds toggle = `hitsoundVolume > 0` (off writes 0; on restores last non-zero session value, default `DEFAULT_SETTINGS.hitsoundVolume`; no new boolean); per-map audio offset is a **proposal** (`playSessionOffsetMs`, App state, clamp ±1000, effective `audioOffset + session`, cleared on leaving `/play`) — **not in `GameSettings`/sanitizer/registry today, do not persist it**. Never alias CN to `disableVideo`.

Flow: metadata fade; groups slide right 300–400ms OutQuint; Back→select; auto-advance **decode + 400ms** (no click-to-start; cookie early-start optional). Compact: settings stack below metadata, full width.

---

### 8. Gameplay HUD

SoT: `19-55-36…19-56-12.jpg`; close-ups `192641/192855`; countdown `192820`. Rebuild `ManiaHud.tsx`; current sheared double-wedge is not in stills. DOM overlay, `pointer-events: none` except gear; no second scene graph.

```
z20 health capsule + score | judgement diamonds | rank pill + avatar/name/acc/combo || ACCURACY boxes + PENAR boxes | spectator + gears
z15 centre combo + judgement text | dual hit-error meters | key ovals + 3-dot clusters (canvas) 
z20 key counters B1..Bn bottom-right | progress + density bottom
```

Health: capsule+tail **280×28 ±8** at (8,12), white fill, red when draining. Score inside, outlined tabular ~36, 6+ digits, Argon wireframe zeros. Judgement boxes under capsule: five rotated squares + one axis square, fill on hit. Rank pill green-left: `#1`, 28 avatar, name, score, `100.00%`, `{n}x`. ACCURACY: Inter 9 label + ~5 hollow fill boxes (no big %; pill already has it). PENAR: label `PENAR` Inter 9 (never PP) + two boxes, `formatPenar` (`—` uncalculated). Combo centre-playfield outlined ~48–64 (not bottom-left). Hit-error: vertical rainbow + arrow, dual meters per full stills. Progress: 8du track + optional 64-bin histogram; elapsed `m:ss` left, remaining right. Counters `B1…Bn` Inter 11 / mono 16. Spectator `Watching {name} play {artist} - {title} ({version}) [{diff}] on {date}` Inter 12 at 80% (live: hidden). Gear: blue hex ~40 + small gear, `pointer-events: auto` → §10. Popup centre spaced (`P E R F E C T` cyan `#48c6ff/#7ED7FD`, `M I S S` red) + Perfect particles, OutQuint fade/scale. Compact: keep health/score/combo/error/progress; hide counters/spectator; never cover receptors.

### 9. Argon playfield

Stills + `WebGL2PlayfieldRenderer`/`argonSkin`/`flashlight`. No timing/hold changes. WebGL2 is SoT; RhythmPlus skins draw their own slim bars (filled classic / outlined dynamic, legacy lane colours) and are not review targets.

Ship `getArgonColumnColor` palette (L→R): 1 Yellow; 2 Green,Cyan; 3 Green,Special,Cyan; 4 Yellow,Orange,Pink,Purple; 5 Pink,Orange,Yellow,Green,Cyan; 6 Pink,Orange,Green,Cyan,Orange,Pink; 7 Pink,Orange,Pink,Special,Pink,Orange,Pink; 8 Purple,Pink,Orange,Green,Cyan,Orange,Pink,Purple; 9 Purple,Pink,Orange,Yellow,Special,Yellow,Orange,Pink,Purple; 10 Purple,Pink,Orange,Yellow,Green,Cyan,Yellow,Orange,Pink,Purple. Ignore "UPDATED" mocks. 4K stills: translucent tints alpha ~0.25–0.40, gap 1, equal widths.

Rice: rounded rect h`42×noteSizeMultiplier` r3.4; filled chevron toward receptor; white foot ~18% on hit edge; never stroke-only. Hold: darker/opaque body with gradient separation; minus icon on head (+body ticks); white tail foot; rice-like head. Receptor: pale rounded cap; pressed = white/gold bloom (cite 4K col 4 in `19-55-36`, pressed oval `192855`; not colour-spec cols 5–6). Key overlay: hollow oval in column colour + 3-dot cluster (`192820`); pressed `×` (`192855` col 2). Lane dim = column colour over art at `backgroundDim`. Countdown: centre disc ~120 + draining beat arc, 3-2-1-go (`192820` = 2). Skip chip: keep functional, no new language. No osu-resources textures — canvas geometry.

### 10. In-play settings / replay overlay

Still `19-55-50.jpg` (open) / `19-55-41/36` (gears). Blue hex gear; right-docked dark cards + yellow sliders (same Visual/Audio rows as PlayerLoader). Replay/spectator-only top card `PLAYBACK`: skip-start/rewind/prev-frame/pause/next-frame/fast-forward/skip-end + speed slider `1.00x` + hamburger (soon); wire to `GameplayCanvas`/`replayCursor`; live: hidden. Calibration red line when wizard has no sample (§Key Decisions). Motion 200–300ms OutQuint from right; Esc/gear closes. Compact: bottom sheet.

### 11. Pause & fail

Stills `pausef/failed.png`. Source `GameplayMenuOverlay.cs` (200ms, 80px bars, 0.75 scrim). Keep `PauseOverlay.tsx`.

Shared: visible playfield + black 0.75; lowercase Space Grotesk 600/48 tracking 5 `#ffcc22`; full-width sheared bars h**80**, gap 2, inset 50; triangle pattern (original geometry, not cards); stats Inter 18 centred with exact labels `Retry count: / Song progress: / Accuracy:` (bold values); measured pause y@683: Continue 262–340 `#88b300`, Retry 344–423 `#eeaa00`, Quit 426–506 `#aa1b27` (±2). Fade 200ms In; reduced-motion fade only.

Pause: Continue/Esc, Retry (`R`), Quit. Fail: `failed` + Retry/Quit only (Esc=Quit); bottom strip `#333333` (sampled y717–726) with centred `#4f4f4f` save control + white download glyph (not `#8d8d8d` icon mis-sample); wire to replay export if cheap else soon. Compact: unsheared 80px bars, 16px inset, unclipped text.

### 12. Results

Stills `19-51-20.jpg` (this play centre) / `19-51-31.jpg` (browsing; this play `#1` left). osu!standard captures — adapt: no slider rows, no PP.

`z0` blurred BG / `z1` side cards (other locals, clickable) / `z2` centre card + overlapping avatar / `z3` footer / `z4` toolbar. Centre: `#3a3a3c`–`#454545`, **500 ±24** wide, r20, centred; avatar **72** overlapping top; name (`Guest` fallback); title Space Grotesk 600/18, artist Inter 12 uppercase; grade ring **200 ±8**, letter Space Grotesk **120**; score mono ~40 tabular with commas; `★ {n} {creator}'s {diff} mapped by {mapper}`; `Played on {date}` Inter 11 muted.

Ring ticks (lazer MIT; 0°=12 o'clock CW; 2° gaps; SS virtual 1%/3.6°): D 0–0.70 → 0–252° (badge 126°); C 0.70–0.80 → 252–288° (badge 270°; still SoT); B 0.80–0.90 → 288–324° (306°); A 0.90–0.95 → 324–342° (badge 328.5°; still SoT); S 0.95–0.99 → 342–356.4° (345.6°); SS 0.99–1.00 → 356.4–360° (badge 0°); F no tick, letter only. Silver S/SS same angles.

Stats: `ACCURACY {96.49%} | MAX COMBO {119/227} | PENAR {formatPenar}` + six mania rows `PERFECT/GREAT/GOOD/OK/MEH/MISS` (`JUDGEMENT_COLORS`); side cards compact with `#1/#2` + grade chip; click swaps centre. Local chart history only.

Footer (1366 du; Back x=0 **94×50** → select (or `/history`); green download+check x=**462** **288×50 ±8** → `replayTransfer` export or soon; playlist 48×48 soon; heart 48×48 favourite): just-finished inserts Retry + Replay **108×50** in x≈102–450 gap without moving Back/green; History-browse hides them. 390×844 wrap (≥44px, no shear): row1 Back+Retry/Replay (flex wrap); row2 green (flex, min 120)+heart; drop playlist first; never shrink Back <44 or off left.

Motion: card 400ms OutQuint 0.96→1 + fade; sides stagger 60ms. Compact: main full width; sides horizontal scroll.

---

### 13–15. Settings, Skins, History — appendix (no stills; keep working)

**13. Settings** (`SettingsDrawer` + registry; IA unchanged). Actual rows: General `localDisplayName, menuCursorEnabled, enableSongPreview`; Visual `playfieldWidthPercent, backgroundDim, songSelectBackgroundDim, disableVideo, videoOffset, disableComboBurst, showFpsCounter, uncappedMenuMotion, renderDpr`; Gameplay `scrollSpeed, lockScrollSpeedDuringPlay, showPenarDuringPlay, upsurfaceNoteMode, visualOffset, enableMapSV`; Audio `musicVolume, previewVolume, launchMusicVolume, masterVolume, hitsoundVolume, audioOffset, compensateOutputLatency, offsetWizard(button)`; Input `bindings`; Misc `restoreDefaults`. There is no `progressBarTop/menuBackgroundDim/disableParticles/babylonFloor/limitDprToOne/gameplayBackgroundBlur` row (limitDprToOne only migrates to `renderDpr`).

**14. Skins** (`/skins`, `SkinScreen`). `skinId` is `argon` (default) or `custom` + `squareRenderStyle` (`rhythmplus` filled slim bars / `rhythmplus-dynamic` outlined); `rhythmmania-3d` collapses to argon. Classic/3D/circular as separate ids are removed. No listing-like overlay without a still.

**15. History** (`/history`, `PersonalHistoryScreen`). Entries: `/history` route, Options "View play history", Results side cards. No menu wedge. Untouched empty copy otherwise; if touched, "No records yet!".

---

### 16. Mobile 390×844

Playwright-mandatory; shear never clips targets. Toolbar keeps Settings/Home/Listing/Music/Clock (+name/avatar if fit); rest via `···` sheet. Menu: unsheared 48px rows/scroll, tappable cookie. Select: no shear, top stack, full-width carousel, cookie ≤96px/hidden. Listing: 1 col + filter disclosure. Mods: horizontal scroll, unclipped footer. PlayerLoader: settings below metadata. HUD: health/score/combo/error/progress only. Pause/fail: unsheared 80px bars, 16px inset. Results: full-width main, sides scrolled, §12 wrap. Settings/skins/history: full sheets. Min tap 44 CSS px.

---

### 17. Reduced motion

`prefers-reduced-motion` + `useLazerReducedMotion`. Keep colour/opacity fades ≤200ms + overlay presence. Drop triangle drift, logo pulse, elastic hover width (snap), beat-bounce, spectrum idle (static OK), carousel overshoot. Pause/fail fade stays. Tokens already zero durations except `--lazer-dur-overlay: 200ms`; `html[data-skin="argon"]{--argon-motion:0ms}`.

---

### 18. Token → file mapping

| Piece | Owns it |
|---|---|
| `data-ui`, chrome vars, reduced-motion | `src/ui/lazer/tokens.css` + `applyLazerChrome` (`motion.ts`, called from `App.tsx`) |
| Eases/durations | `src/ui/lazer/motion.ts` |
| `Shear`, `LazerCookie`, `FooterBackButton`, `LazerToolbar`, `NowPlayingPanel`, `ButtonSystem`, `MenuButton`, `TriangleField`, `SongSelectLeftPanel/Carousel/Footer`, `ComingSoonNotifications` | `src/ui/lazer/*.tsx` (no `ComingSoon.tsx`) |
| Menu states | `src/components/MainMenu.tsx` |
| Select V2 / options | `src/components/SongSelect.tsx` (+ `BeatmapOptionsPopover` if split) |
| Mods | `src/components/ModSelectOverlay.tsx` (`ALL_MODS` incl. coming-soon DC/DS; K-mods generated) |
| Listing | `src/components/OnlineBeatmapCatalog.tsx` (chrome only; helper stays) |
| PlayerLoader | new `src/components/PlayerLoader.tsx`, first paint of `/play` |
| HUD / notes / in-play | `ManiaHud.tsx` / `WebGL2PlayfieldRenderer.ts`, `argonSkin.ts`, `flashlight.ts` / `GameplayCanvas.tsx` + shared PlayerLoader groups |
| Pause/fail, Results, Settings, Skins, History | `PauseOverlay.tsx` / `ResultsScreen.tsx` / `settings/*` / `SkinScreen.tsx` / `PersonalHistoryScreen.tsx` |
| Argon CSS, judgements, PENAR, density, preview | `src/index.css` / `ruleset/mania/judgements.ts` (display names) / `utils/penar.ts` / `argonSkin.computeSongDensityBins` / `utils/previewPlayer.ts` |

Never copy `visual-refs/` into `public/`.

---

## API / Interface Changes

No HTTP changes. Listing consumes live `GET /api/catalog/search` + Catboy/Nekoha helper.

```ts
type LazerMenuState = 'initial' | 'topLevel' | 'play';
type ComingSoonReason = 'coming-soon';
interface ToolbarProps { visible: boolean; active: 'home'|'listing'|'music'|'none'; displayName: string; onSettings(): void; onHome(): void; onListing(): void; }
interface PlayerLoaderProps { beatmap: Beatmap; settings: GameSettings; onBack(): void; onReady(): void; onPatchSettings(patch: Partial<GameSettings>): void; }
// Proposed only: playSessionOffsetMs + onPlaySessionOffsetChange — not in types/sanitize/registry today.
```

Patches flow through `sanitizeSettings`. No `gameplayBackgroundBlur`, no persisted per-map offset map.

---

## Data Model Changes

None server-side. Client: no new persistent keys; favourites `rhythm_mania_v1_favorite_songs`; history `rhythm_mania_v1_play_history`; per-map offset + hitsound-restore are session-only proposals on existing `hitsoundVolume`/`audioOffset` (not new booleans/keys).

---

## Alternatives Considered

1. **Restyle colours only** — rejected: stills need new layout (button system, V2 carousel, HUD capsule, results ring).
2. **1024×768 letterboxed canvas** — rejected: stills are 1366×768 and C# constants already match; letterbox wastes mobile height. Chosen: 1366 du desktop + real 390×844 compact.
3. **Hide unavailable features** — rejected (user lock): visible + coming-soon.
4. **osu-web listing PNGs** — rejected: chrome is `beatmaplisting.jpg`.
5. **Anything but WebGL2 as Argon SoT** — rejected: single WebGL2 renderer.
6. **Token search / osudl / hinai / osu.direct in chrome scope** — rejected: unauthenticated catboy→Nekoha already ships; chrome consumes it. Local-only listing would make Browse a no-op.
7. **Menu History wedge** — rejected: `/history` + Options row + Results browse; lazer has no wedge.
8. **Greenfield lazer module** — rejected: extend in-tree `tokens.css`/`motion.ts`/primitives.

---

## Security & Privacy (brand + assets)

| Threat | Mitigation |
|---|---|
| Trademark confusion | No osu! logo/wordmark/ppy/Torus/mascots/bitmaps; RM cookie + original listing icon |
| Shipping stills | `visual-refs/` never in `public/`; Playwright dev-time only |
| Asset XSS | Beatmap media via `isSafeAssetUrl`; don't loosen catalog covers |
| Offline privacy | No login/accounts/upload; display name device-local ≤32 |
| Coming-soon links | Never deep-link osu.ppy.sh as a substitute; wiki/changelog stay soon |

Severity **High** if a build ships the osu! mark or mascot.

---

## Observability (visual regression)

| Check | How |
|---|---|
| Layout | Playwright 1280×720 vs mapped still (scale still). Fail on wrong HUD corner, missing cookie, Global tab, "pp", osu! wordmark |
| Compact | Playwright 390×844: targets ≥44px, no shear clip |
| Motion | Hover Play at 2×; elastic width not CSS ease. Reduced-motion: no pulse/elastic |
| Tokens | `/` has `html[data-ui="lazer"]`; cookie tokens present |
| Unit | `npm run lint`, `npm test` stay green; units never prove "looks like lazer" |

No prod metrics for chrome. Optional local-only coming-soon click counts.

---

## Rollout Plan

Lazer chrome is the default Argon path (`data-ui="lazer"`; RhythmPlus keeps `data-skin=legacy` slim-bar geometry). Mixed chrome across surfaces is expected mid-migration; keep each surface self-contained. Settings/Skins/History restyles out of scope. Rollback: revert chrome change; mechanics untouched; no per-pixel flags beyond `data-ui`.

---

## Open Questions

None. Leftovers locked 2026-09-12.

---

## References

- Stills: `visual-refs/**`
- Offline product: Local ranking, mirrors
- Lazer MIT (numbers only): `AccuracyCircle` (`VIRTUAL_SS_PERCENTAGE`, `GRADE_SPACING_PERCENTAGE`, badge lerp), `GradedCircles` (D–SS bands, `Rotation=startProgress*360`), `ScoreProcessor` (mania 1.00/0.95/0.90/0.80/0.70/0), `ButtonSystem` (140/20), `MainMenuButton` (hover ×1.5 elastic, bounce consts), `ButtonArea` (100), `Toolbar` (40/30), `OsuGame` (shear 0.2, margin 12), `ScreenFooter` (50, facade −76,−36), `ScreenFooterButton` (116×75 r10), `ScreenBackButton` (240, `#DE31AE/#FF86DD`), `GameplayMenuOverlay` (200ms In, 80px, 0.75)
- In-tree: `src/ui/lazer/*`, `argonSkin.ts`, `judgements.ts`, `penar.ts`, `osuTokenManager.ts`, `src/components/*`
- Fonts: self-hosted Inter/Nunito/Orbitron/SpaceGrotesk (`src/index.css`, `public/fonts`, `public/sw.js`)

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Mixed chrome mid-migration | Low | One surface per change |
| Elastic hover + triangle cost | Medium | Cap triangles; Motion on menu width; WebGL2 playfield |
| Shear clipping at 390×844 | High | Compact layout + Playwright gate |
| PENAR reads as bug | Medium | Intentional `—` + `PENAR`, never `pp` |
| Trademark slip | High | Cookie/empty-state/icon rules + screenshot CI |
| "UPDATED" colour rows | Medium | Cite `argonSkin.ts` only |
| Filters over-promising | Medium | §5 greyed table |
| Backend creep into chrome | High | Chrome-only; live catboy/Nekoha helper |
