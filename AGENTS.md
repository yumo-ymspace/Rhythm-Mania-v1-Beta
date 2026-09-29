# AGENTS.md - RhythmMania source guide

Source code is authoritative. This file is just a navigation aid.

`package.json` version is `latest`; `metadata.json` is `v1 Beta`; `index.html` title and `api/config.ts` + `api/health.ts` fallbacks are `0.9.8`.

Work only in the `Rhythm-Mania-v1-Beta` folder. Never touch sibling `rhythm-mania` or `rhythm-mania-beta` folders.

## 1. Runtime And Commands

React 19 + Vite 8 + Tailwind 4 + TypeScript 5.9 (strict, `@/*` alias). JSZip, Motion, Lucide, SparkMD5. `dotenv` only in `api/_lib/env.ts`; `@vercel/node` is a devDependency. ESM (`"type": "module"`). No Babylon dependency.

| Purpose | Command |
| --- | --- |
| Dev | `npm run dev` (`vite --port=3000 --host=0.0.0.0`) |
| Typecheck | `npm run lint` (`tsc --noEmit`) |
| Build | `npm run build` |
| Preview | `npm run preview` |
| Clean | `npm run clean` |
| Tests | `npm test` (`vitest run`, Node, `tests/**/*.test.ts`) |

`vite.config.ts`: `@` alias + ignores `docs/visual-refs/**`. No port/host, no Babylon chunk. `src/main.tsx`: StrictMode + registers `/sw.js` on load. SW caches are `rhythm-mania-cache-v2` and `rhythm-mania-beatmaps-v2`; skips `/api/` and non-GET.

## 2. Layout

```text
api/_lib/ (env, mirrorCatalog, response, replayVerification)
api/config.ts, api/health.ts, api/catalog-router.ts, api/catalog/_search.ts
public/ avatars/ (preset_01.png only), backgrounds/, icons/, fonts/, sounds/, skin/, beatmaps/, cursor/, sw.js, manifest, sitemap, robots
src/ main.tsx, App.tsx, audio/, components/ (+settings/), render/, ruleset/mania/, ui/lazer/, utils/, types.ts
tests/ Node-only Vitest
```

No `database/` dir. No auth/replay/profile API routers. Only API rewrite in `vercel.json` is `/api/catalog/:path*`; SPA fallback excludes `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `sw.js`, `icons/`, `backgrounds/`, `avatars/`, `skin/`.

## 3. Routes And State

`src/App.tsx`: `/` + unknown = menu; `/select`, `/play` (needs beatmap), `/results` (needs score+beatmap), `/history`, `/skins`; `/settings` = menu + settings drawer; `/profile/*` retired to menu; no `/calibrate` route. Settings + catalog are global overlays. `App` owns beatmap, replay, score, hit-errors, custom maps, popstate, settings persistence, media cleanup. Fullscreen is `FullscreenManager` + `GameplayCanvas`, not `App`. No app mute flag (MU mod + volumes). 18+ text only in `README.md`.

## 4. Settings And Persistence

`GameSettings` in `src/types.ts`; defaults in `defaultSettings.ts`; sanitize in `securityLimits.ts`. New/broken settings checklist: add the key to ALL of `types.ts` + `defaultSettings.ts` + `sanitizeSettings()` in `securityLimits.ts` + the `safePayload` allowlist in `App.tsx updateSettings()` + `settingsRegistry.tsx` (if user-facing) + consumers. A setting missing from either allowlist (`sanitizeSettings` drops it on load, `safePayload` drops it on every update — silent because optional `?:` keys still typecheck) will not persist/work. Defaults: WebGL2-only playfield (no `renderEngine` / `allowCanvasFallback` settings), 4K, scroll `21`. Clamps: playfield width `20..50`, scroll `5..80`, offsets `-1000..1000`. `rhythmmania-3d` skin id maps to `argon`. No `babylon` engine, no `babylonFloor`, no `limitDprToOne` (now `renderDpr: 1 | 1.5 | 2`, default `1.5`). `upsurfaceNoteMode` is passthrough, always shown. Sections: General, Gameplay, Visual, Audio, Input, Miscellaneous. `localDisplayName` max 32 chars, copied to `playedBy`. Mod sanitize: base mods + `DA:`/`AC:` + `K1`-`K10`, with EZ/HR, rate-mod, NF/SD/PF/AC, AT/CN, RD/MR, cover-mod, IN/HO/NR, DA, K exclusivity.

LocalStorage keys (`rhythm_mania_v1_`): `settings`, `custom_maps` (legacy migration), `play_history`, `history_limit` (default 50, 5..500/unlimited), `last_selected_map_id`, `last_diff_by_song`, `favorite_songs`, `catalog_set_metadata`, `mod_presets`. IndexedDB `RhythmManiaDB` v6: `beatmaps`, `packages`, `backgrounds`. Blob cache default 8, media instance 12. Video element tracked in `mediaRegistry.ts`.

## 5. Beatmaps And Import

Pipeline: `.osu/.osz/.zip` (no `.osk`) -> JSZip -> `parseBeatmap()` (osu! mode 3 only, 1K-10K) -> IndexedDB -> `unpackBeatmap()` -> Blob URLs + AudioEngine + optional video. Limits: 100 MiB compressed, 250 MiB extracted, 500 entries, 80 MiB/entry, 20k notes, 5k timing points, 2 MiB `.osu`, 2048-char URLs. `isSafeAssetUrl`: relative, same-origin http(s), `blob:` only. Audio fallback `.mp3/.ogg`; video `mp4/m4v/webm/ogv`; backgrounds `jpg/jpeg/png/bmp/webp`.

## 6. Gameplay And Replays

`GameplayCanvas.tsx` owns live + replay sessions. Rate via `getSpeedMultiplier` (DT/NC 1.5, HT/DC 0.75); previews use `previewPlayer`; video via `VideoSyncController`. Six judgements (marvelous..miss); HR x1.4, EZ x1/1.4; DT/NC x1.5 and HT/DC x0.75 scale song-time windows. Score weights 305/300/200/100/50/0; combo base 300 for marvelous/perfect, log combo. Mod multipliers in `MOD_SCORE_MULTIPLIERS` (NF/EZ 0.5, HT/DC 0.3, CS/HO/NR 0.9, DA/WU/WD/AS 0.5, CN 0.0, K1-K10 0.9, rest 1.0). Grades SS-F.

Song Select: one Local list (match beatmap id/hash/chart revision/catalog map id; sort score, accuracy, timestamp). Mods: EZ NF HT DC NR HR SD PF DT NC FI HD Cover FL AC AT(AP) CN RD DS MR DA CL IN CS HO WU WD MU AS + K1-K10. AT+CN = autoplay, never recorded. K mods remap 1-10 via `convertBeatmapKeyCount`, id suffix `_converted_<N>k`. HP base 0.8 (drain>5) else 1.2; EZ x0.5 (+2 lives), HR x1.4.

Holds v1/v2/v3, live default v3 (`LAZER_HOLD_RULES_VERSION = 3`, 1.5x tail lenience). V2 tick interval default 50ms, range 10..100. Replays: timestamped lane frames + initial neutral frame, binary-search cursor, schema v3, local frame cap 1,000,000. No server upload. Export envelope `rhythmmania-replay-export`, import caps 64 MiB / 500 records, imported = local-only.

## 7. Renderers

WebGL2-only playfield (`IPlayfieldRenderer`: init/resize/render/destroy/isReady; sole impl `WebGL2PlayfieldRenderer`, one shader + batched quads, `MAX_QUADS 5120`). `PlayfieldFrame` has no HUD; meters are `ManiaHud` dual vertical at ~6 Hz. Shared math: `laneLayout`, `playfieldLayout` (geometry, scroll, covers), `noteVisibility`, `scrollVelocity`, `skinTheme`, `tailSegments`, `argonSkin`, `flashlight` (FL view radius). Equal-width lanes 1K-10K; touch 60% zone split. No Canvas2D playfield code remains (`Canvas2DRenderer.ts`, `argonPlayfield.ts` deleted); FL vignette renders in-shader as a fullscreen `GLYPH_VIGNETTE` quad. `resolvePlayfieldStyle` picks the draw path: `argon` (default) or the RhythmPlus bar skins (`rhythmplus` slim filled 8px bars, `rhythmplus-dynamic` outlined bars). The RhythmMania Classic and circular skins were removed; stored values collapse to argon.

## 8. API

No database, no `pg`, no auth/replay/profile/catalog-activation endpoints (router 404s except `search`). `env.ts` only detects production. Live: `GET /api/config` (mode `[3]`, `accounts: false`, local leaderboards/replays, catalogSync + customBeatmaps true), `GET /api/health` (`ok`, version, timestamp, environment), `GET /api/catalog/search` (`q` required max 100, `s` = ranked/loved/graveyard/any). Search: catboy.best primary (`?query=&mode=3&status=`), Nekoha fallback; mania-only 2..9 keys; rows `osuapi_<id>`, `mirror`, `pending`. Archives download from `catboy.best/d/<id>` with Nekoha fallback; API never serves bytes. `replayVerification.ts`: canonical-chart decode + mirror bounds only. `sendJson`: JSON + nosniff + no-store. CSRF client-side only.

## 9. Server Persistence

None. No schema, sessions, or leaderboards. Scores/replays/profiles are local-only.

## 10. Tests

`vitest.config.ts`: Node, `tests/**/*.test.ts` (~47 files). Covers parser/limits, settings/history, score/judgement, holds, replays, scroll/visibility, mirror catalog, UI tokens/shells, flashlight radius, API handlers (health/config, CORS, catalog 404). No browser App/GameplayCanvas/renderer/AudioEngine/SW/PostgreSQL/real-download coverage. Changing timing: check `GameplayCanvas`, `holdTickRules`/`holdNote`/`judgementTiming`, replay sim/cursor, DT/HT + video sync, `replayVerification.ts`. Changing settings: follow the §4 checklist (types, defaults, sanitize, `safePayload`, registry/UI, persistence, consumers) — if a setting does not work/persist, check both allowlists first. Changing visuals: shared frame/math first, then the WebGL2 renderer (sole playfield renderer).

## 11. Tools and Thing I would want you to explicitly know. (Extra Importance)

### Pre-modification Changes

- When I ask you to do something or to implement somthing, first check if you
fully understand where and what I am asking you to do. 

- If you are slightly unclear or my wording was vague, please use more precise 
wording and ask me even if it seems clear to you.

- As a general rule of thumb, taller and higher is usually vertical, and
wider and thicker is usually horizontal, unless I explicitly said vertical or
horizontal.

### Fonts

- All webfonts are self-hosted from `public/fonts` and must never come from a
Google Fonts `@import` or any other third-party font CDN. 

- The current set is four variable-weight TTFs (`Inter-Variable.ttf`,
`Nunito-Variable.ttf`, `Orbitron-Variable.ttf`, `SpaceGrotesk-Variable.ttf`)
plus their `OFL-*.txt` license files, declared with `@font-face`
(`font-display: swap`) in `src/index.css` and precached in `public/sw.js`
`STATIC_ASSETS` so text renders offline and behind adblockers.

- When adding a font, keep only the needed variable file and weights, add
its `@font-face` block and precache entry, and verify no
`fonts.googleapis.com` / `fonts.gstatic.com` reference remains.


### Audio: zero-startup-delay playback

- Never start UI/menu sounds with `new Audio(src).play()` inside the click
handler. That pays fetch + demux + first-frame decode + `canplay` on the
gesture (very audible on the 3 MB `triangles.mp3` vs the ~50 KB d1/d2/d3).
Canonical paths: one-shots in `src/utils/menuSounds.ts`, menu loops in
`src/utils/menuMusic.ts` — both fetch + `decodeAudioData` to an
`AudioBuffer` ahead of time, then fire synchronously with
`source.start(0)`.
- New audible UI sound = same recipe: dedicated `AudioContext` with
`{ latencyHint: 'interactive' }`, `GainNode` for volume (never element
volume), fresh `BufferSource` per play, `armUnlock()` resume on
`pointerdown/keydown/touchstart`, `preload*()` from `src/main.tsx`, and
`warm*()` the exact src before its button becomes visible (see
`LoadingScreen.tsx` awaiting `warmMenuMusic()` before the start button).
Keep the HTMLAudio fallback only for undecoded/unsupported cases, and warm
in the background so the next play is instant.
- Keep bytes cache-warm too: list the file in
`src/utils/assetPreloader.ts` `BOOT_SOUNDS` and `public/sw.js`
`STATIC_ASSETS`. If the `.mp3` itself starts with silence, trim the file —
playback cannot remove baked-in leading silence (MP3 padding excepted via
`start(0, offset)`).

### Playwright MCP

- If I asked you to do any UI/frontend changes, and I did not tell you whether
to use Playwright MCP to verify or not, do not assume and keep asking me until
I tell you, then which you will remember for the rest of the session.

- To use Playwright MCP, first spin up the local development server (`npm run
  dev`). Vite binds to `0.0.0.0` on port `3000` by default; use the active
  port if Vite reports a different one.

- Use the Playwright MCP server (`playwright`) to navigate to
  `http://localhost:3000` (or the active origin) with `browser_navigate`.

- Take a viewport or full-page screenshot with `browser_take_screenshot` to
  evaluate layout, alignment, and responsiveness. Use `browser_resize` before
  screenshots when checking desktop versus mobile viewports.

- Inspect the visual output and iterate on CSS/components until the design
  requirements are met.

- Screenshots are for visual evaluation only. Use `browser_snapshot` to get
  element refs, then click, type, and navigate the changed flow the way a
  user would. A single render screenshot is not verification.

### Song Select Menu Slanted Corners

Slanted Song Select shells (the top-left song info wedge
`.lazer-song-wedge::before` and the top-right filter shell
`.lazer-song-filter-stack::before` in `src/ui/lazer/tokens.css`) get their
rounded corners with the **Slant Fillet** method: a true circular arc,
tangent to both the slanted edge and the straight edge, baked into the
`clip-path: polygon()` as sampled points. `border-radius` cannot be used
because the slant itself is a clip-path cut, and the background lives on
`::before` (painted behind content) so dropdown popups and inner content
are never clipped by it.

Follow these steps exactly when asked to creating or retuning one:

1. **Measure live heights.** `clip-path` mixes width-relative (`%`/px on x)
   and height-relative units, so a fixed pixel slant looks different on
   every box height. Start `npm run dev`, open the target screen at
   1600x900 (DPR 1), and read `getBoundingClientRect()` for the element
   plus the `::before` height (element height plus any `top` offset, e.g.
   the filter shell's `top: -8px` adds 8px). Reference numbers:
   wedge `::before` = 219.2px, filter `::before` = 166.5px.
2. **Match degrees, not widths.** Take the reference shell's *straight*
   slant portion only (excluding its corner curve): angle from vertical
   is `θ = atan(straight_width_px / straight_height_px)`. The filter
   shell runs 26px over 146.5px, so `θ ≈ 10.1°`. Size the new slant as
   `straight_width = straight_run × tan(θ)` on its own height (the wedge
   needs 199.2 × tan(10.1°) ≈ 35px). Verify `atan()` of the result lands
   within ~0.1° of θ.
3. **Cut a circular fillet, not a chamfer.** Let `R` be the corner radius
   and `φ` the material-side angle between the two edges (100° where a
   10°-from-vertical slant meets a horizontal edge). Each tangent point
   sits `T = R / tan(φ/2)` from the line-corner (where the extended
   slant meets the straight edge). Wedge: R16 → T ≈ 13.4px. Filter: R12
   → T ≈ 13.4px on its own geometry. Keep the radius-to-height ratio
   consistent across shells (12/166.5 = 16/219.2 ≈ 0.073) so matching
   corners read as equally round.
4. **Sample the arc every ~20°.** Convert each sample to
   `calc(100% - Xpx) calc(100% - Ypx)` (or plain px for left/top edges),
   keep fractional precision, and list points in winding order from the
   straight slant through the arc into the straight edge. Then check the
   segment angles flow monotonically (wedge: 10° → 21° → 39° → 61° →
   80° → 90°). Any vertical flat, direction reversal, or sudden jump
   (the old slant → vertical → round sequence) renders as a visible
   bulge or shoulder kink.
5. **Clear the cut and keep it flat.** Set the content padding on the cut
   side to `max_inset + 16px` (wedge: 52.3 + 16 = 68px right padding;
   filter: 32px slant + 16px = 48px left padding). Never put
   `filter: drop-shadow()` on the wedge element itself: it paints a dark
   halo onto the background art just outside the slant. The mobile
   breakpoint (<768px) must keep `clip-path: none` with a plain
   `border-radius`, since the slant insets are tuned for desktop heights.
6. **Verify like the original pass.** Confirm the new polygon in computed
   style, screenshot the corner at 1x and at 3x device scale (a 260x170
   CSS-px clip of the corner is enough to judge roundness), and run
   `npm run build`. Document the measured heights, θ, R, and T in the
   CSS comment above the `clip-path` so the next retune starts from
   numbers, not guesses.

### Post-modification Changes

- After substantive TypeScript changes, run `npm run lint` and `npm test`; run
`npm run build` for build-impacting changes.

- Playwright MCP not always needed, depending on what I told you that session.

- There may be other active concurrent edits happening while you are editing
as well, do not be alerted, it is just multiple people working on the codebase
as is normal. As long as they are not editing the exact same element/object as
you, you do not need to stop or be concerned. You may notify me if you want to
that you see other changes, but that's up to your discretion.
