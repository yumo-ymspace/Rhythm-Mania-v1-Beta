# AGENTS.md - RhythmMania source guide

This file is a navigation aid for the repository, not a behavioral contract.
The executable source is authoritative. Verify claims against `package.json`,
the TypeScript/TSX implementation, API handlers, SQL schema, build/runtime
configuration, and tests. Do not treat this file, UI copy, comments, or other
prose files as a source of truth when they disagree with code.

The current package and application version is `0.9.3`. `package.json` uses
`latest`; `metadata.json` and `index.html` use the `v0.9.3` form.

## Repository Privacy And Secrets

This is a private repository. Production secrets are injected by the
deployment environment and are intentionally not committed to the repository.
Never open, read, print, search, or otherwise inspect `.env.prod` or
`.env.beta`. Do not assume production secrets, credentials, or database values
are available in the worktree. Treat any other environment files as sensitive
unless the user explicitly asks for a safe, non-secret configuration change;
never include secret values in logs, patches, test fixtures, or responses.

## Workspace Scope

Work only in the `RhythmMania-Beta` folder. Never open, read, search, modify,
or otherwise touch the sibling `rhythm-mania` folder. The beta folder is the
only authorized project workspace for this repository.

## 1. Runtime And Commands

RhythmMania is a React/Vite browser application with optional Vercel-style API
functions. Local gameplay, imported maps, and local history can run without a
working database. Account, profile, cloud catalog, and online replay features
use the API and PostgreSQL.

The implementation currently uses:

- React 19 and `react-dom` 19.
- TypeScript 5.9 with strict checking and the `@/*` root alias.
- Vite 8 with the React and Tailwind CSS 4 plugins.
- Babylon.js 9 for the optional 3D playfield renderer.
- JSZip for archive handling, Motion for UI transitions, Lucide icons, and SparkMD5 for client chart checksums.
- `dotenv` and `@vercel/node` for the server-side API code.
- Vitest for the Node-only test suite.
- ECMAScript modules (`package.json` has `"type": "module"`).

Available commands are defined only by `package.json`:

| Purpose | Command | Implementation |
| --- | --- | --- |
| Development | `npm run dev` | Vite on port `3000`, bound to `0.0.0.0` |
| Typecheck | `npm run lint` | `tsc --noEmit`; this is not ESLint |
| Production build | `npm run build` | `vite build` |
| Preview | `npm run preview` | `vite preview` |
| Clean build output | `npm run clean` | Removes `dist` with Node `fs.rmSync` |
| Tests | `npm test` | `vitest run` |

`tsconfig.json` targets ES2022, includes DOM libraries, uses bundler module
resolution, and excludes `dist`. `vite.config.ts` aliases `@` to the
repository root and places `@babylonjs/core` in a separate `babylon` build
chunk. `dist` is generated build output and is excluded from typechecking.

`src/main.tsx` renders `App` under React `StrictMode` and registers
`/sw.js` after window load when service workers are available. The service
worker uses `rhythm-mania-cache-v2` for the app shell/backgrounds and
`rhythm-mania-beatmaps-v2` for selected beatmap/media extensions. It does not
cache `/api/` requests or non-GET requests.

## 2. Repository Layout

```text
api/
  _lib/                         Auth helpers, environment, response, replay verification
  config.ts                     GET /api/config
  health.ts                     GET /api/health
  catalog-router.ts             /api/catalog/* dispatcher
  catalog/                      Catalog search handler module
database/
  schema.sql                    Legacy PostgreSQL table/index definitions
public/
  avatars/                      Preset avatars
  backgrounds/                  Menu and history artwork
  icons/                        PWA/favicon icons
  manifest.webmanifest          PWA manifest
  sw.js                         Optional service worker
src/
  main.tsx                      React entrypoint
  App.tsx                       SPA route state, persistence, auth, and screen composition
  audio/                        Web Audio gameplay engine
  components/                   Screens, gameplay, overlays, settings, and skins
  render/                       Shared playfield math and renderer implementations
  ruleset/mania/                Shared mania window, score, and (later) hold/HP helpers
  utils/                        Parser, storage, replay, media, input, auth, and security helpers
  types.ts                      Shared domain types
tests/                          Node-only Vitest regression tests
```

`vercel.json` rewrites two API namespaces to the grouped routers. The
grouped routers import the handler modules; the checked-in top-level API
entrypoints are `config.ts`, `health.ts`, and those two routers. Non-API
paths are rewritten to `index.html` for the SPA.

## 3. Frontend Routes And State

`src/App.tsx` resolves these paths:

- `/` and unknown paths render the main menu.
- `/select` renders Song Select.
- `/play` renders gameplay when a beatmap is selected.
- `/results` renders results when score and beatmap state exist.
- `/history` renders personal local history.
- `/skins` renders the skin/style screen.
- `/settings` renders the menu with the settings drawer open; it is not a separate settings screen.
- `/profile` and `/profile/<segment>` are retired and fall back to the main menu.

`GameScreen` also contains `settings` and `calibrate` values, but route
resolution has no rendered branch for `/calibrate`; an unknown path falls back
to the menu. Settings and the online catalog are global overlays mounted by
`App`, not independent URL screens. Personal history remains at `/history`.

The normal flow is menu, Song Select, gameplay, results, with history/replay
watching and skins reachable from the surrounding UI. `App` also owns:

- Selected beatmap, active replay, score, hit-error samples, and custom maps.
- Browser history navigation and `popstate` handling.
- Fullscreen state, mute state, and settings persistence.
- Cleanup of media resources around gameplay, retry, result viewing, and deletion.

The legal notices display an 18+ requirement, but the implementation has no
age field, age check, or runtime access gate around local gameplay, OAuth,
profiles, or connected services. This is an intentional side effect to
preserve; treat the legal text and enforcement behavior as separate facts.

## 4. Settings And Local Persistence

`GameSettings` is declared in `src/types.ts`, defaults are in
`src/components/settings/defaultSettings.ts`, and hostile persisted values are
normalized by `sanitizeSettings` in `src/utils/securityLimits.ts`.

Important current defaults and rules:

- Default renderer is Canvas2D (`renderEngine: 'canvas'`). The default key mode is 4K and default scroll speed is `21`.
- Canvas playfield width is clamped to `20..50`; Babylon width is clamped to `40..90`.
- Scroll speed is clamped to `5..80`. Audio and visual offsets are clamped to `-1000..1000` during settings sanitization.
- `renderEngine` becomes Babylon when `renderEngine` is `babylon` or `skinId` is `rhythmmania-3d`; otherwise it is Canvas2D.
- Babylon forces `upsurfaceNoteMode` to `false`. The settings registry hides the scroll-direction row while Babylon is selected, and gameplay sanitization also enforces the value.
- `limitDprToOne` is always written as `false` by the normal settings sanitizers/update path, even though renderer code still reads the field. This is intentional.
- `babylonFloor` is the only explicitly Babylon-only settings-registry row. It defaults to enabled.
- The settings registry sections are General, Graphics, Gameplay, Audio, Input, and Maintenance.
- `localDisplayName` is an optional device-local player name (max 32 sanitized characters). It is not an account. New history rows copy it into `playedBy` when non-empty.
- Modifier sanitization whitelists known gameplay modifiers, removes duplicates,
  and enforces EZ/HR, HT/DT, and single-K-mod exclusivity for persisted values.

Persistent browser keys currently used by the source are:

| Key | Data |
| --- | --- |
| `rhythm_mania_v1_settings` | Sanitized `GameSettings` |
| `rhythm_mania_v1_custom_maps` | Legacy localStorage map fallback/migration source |
| `rhythm_mania_v1_play_history` | Sanitized local play-history records |
| `rhythm_mania_v1_history_limit` | History retention setting; default 50, or 5..500/unlimited |
| `rhythm_mania_v1_last_selected_map_id` | Song Select selection |
| `rhythm_mania_v1_last_diff_by_song` | Last difficulty per song group |
| `rhythm_mania_v1_favorite_songs` | Favorited Song Select groups |
| `rhythm_mania_v1_catalog_set_metadata` | Local catalog title/artist/creator/approved cover metadata |

Google OAuth handoffs also use short-lived localStorage keys with the
`rhythm_mania_google_auth_` prefix. Catalog search/download needs no account:
`GET /api/catalog/search` is unauthenticated (catboy.best primary, Nekoha
fallback) and archive downloads fetch public mirror bytes directly.

`src/utils/storageManager.ts` opens IndexedDB database `RhythmManiaDB` version
3 with two object stores:

- `beatmaps`, keyed by beatmap id.
- `packages`, keyed by package id and containing retained ZIP buffers.

IndexedDB records are sanitized when read. Package/map staging is transactional
across the two stores. The legacy custom-map localStorage value is migrated
into IndexedDB when no IndexedDB maps are available. `SimpleBlobCache` keeps
three media entries and releases replaced/evicted Blob URLs through
`AssetLifecycleManager`. `TempMemoryCache` temporarily keeps package buffers
while they are being unpacked. `GameplayMediaRegistry` tracks the active video
element.

## 5. Beatmaps, Import, And Media

The client pipeline is:

```text
.osu/.osz/.zip input or approved catalog archive
  -> JSZip / RobustZipResolver
  -> parseBeatmap()
  -> sanitized Beatmap/SavedBeatmap in IndexedDB
  -> unpackBeatmap()
  -> typed Blob URLs, AudioEngine, and optional HTML video
```

`SongSelect` accepts only `.osu`, `.osz`, and `.zip`. There is no `.osk` skin
package importer in the current source. Single `.osu` files are parsed
directly. Archives are scanned for `.osu` entries, then playable difficulties
are staged with the package.

`parseBeatmap()` supports osu! mode 3 (mania) only. Legacy osu!standard
support, including slider-to-hold conversion, has been removed. Playable mania
key counts are 2K through 8K. It reads General, Metadata, Difficulty, Events,
TimingPoints, and HitObjects data, including audio/video/background paths,
breaks, timing points, BPM, hit samples, and holds. Hold tail times are rounded
to integer milliseconds by `parseHoldTailTime`.

Client import limits are defined in `src/utils/securityLimits.ts`:

- Compressed package: 100 MiB.
- Total extracted package budget: 250 MiB.
- ZIP entries: 500.
- Single entry: 80 MiB.
- Notes: 20,000.
- Timing points: 5,000.
- `.osu` text: 2 MiB of UTF-8 bytes.
- Media URL length: 2,048 characters.

`validateZipLimits` first checks JSZip's advertised entry sizes. The actual
extraction path uses `extractZipEntry` and a shared `ZipExtractionBudget` to
count bytes returned by decompression. Do not describe the preflight function
alone as an actual-decompressed-byte check.

`isSafeAssetUrl` permits relative paths, same-origin absolute HTTP(S) URLs, and
`blob:` URLs while rejecting protocol-relative, cross-origin, executable, and
`data:` URLs. Imported beatmap media uses this contract, but catalog cover
URLs, Google profile pictures, and some profile/avatar surfaces are separate
code paths and are not universally passed through this validator.

`unpackBeatmap` resolves audio, browser-playable video (`mp4`, `m4v`, `webm`,
`ogv`), backgrounds, and hitsounds from package entries. Unsupported video
containers receive a warning and use the static background path. Blob URLs are
created and revoked through `AssetLifecycleManager`; failed extraction releases
URLs created during that attempt.

## 6. Gameplay And Replays

`src/components/GameplayCanvas.tsx` owns a live session and replay spectator
session. It handles media loading, countdown, keyboard input, touch input,
judgement, auto-miss, hold state, score/HP/combo/accuracy, replay recording or
simulation, video sync, renderer calls, pause, retry, seeking, finish, and
teardown.

`AudioEngine` uses the Web Audio clock as the gameplay timeline. It loads local
audio through a safe asset URL, applies DT (`1.5`) or HT (`0.75`) playback rate,
plays map hitsounds, and falls back to a procedural synth sequencer when the
track cannot be decoded. Song Select previews use a separate HTMLAudio-based
`previewPlayer`. `VideoSyncController` phase-locks optional background video
to the gameplay audio time and playback rate.

Judgement uses six windows: marvelous, perfect, great, good, bad, and miss.
The implementation interpolates the osu!lazer-style OD ranges and scales the
windows for HR (`1.4`) or EZ (`1 / 1.4`); DT and HT do not change judgement
windows. Visual offset changes note rendering time, while judgement remains on
the gameplay/audio timeline.

Scoring in `src/ruleset/mania/scoreProcessor.ts` uses:

- Accuracy weights 305/300/200/100/50/0 for marvelous through miss.
- Logarithmic combo scoring with a 150,000 combo portion and 850,000 accuracy portion.
- Mod multipliers for NF, EZ, HT, HR, HD, DT, and K2-K9.
- Grades SS, S, A, B, C, D, and F from the current accuracy/count rules.

Song Select shows a single **Local** score list for the selected chart (history
rows matching beatmap id / hash / catalog chart id), sorted by score then
accuracy. There is no Global, Country, or remote RM board on this screen.

The Song Select UI exposes NF, EZ, HT, HR, HD, DT, AT, and K2-K9. AT is
deterministic perfect play, marks `ScoreState.isAutoplay`, and is not eligible
for server upload. NF prevents live failure and uses a 0.5 score multiplier.
HD changes visual opacity. K mods clone and remap columns through
`convertBeatmapKeyCount`, changing the local map id to a `_converted_Nk`
suffix. EZ/HR are HP modifiers, and the gameplay HP multiplier
scales the beatmap HP factor by 0.5 for EZ or 1.4 for HR. They also change
their respective judgement windows.

Hold behavior has two client rule versions:

- Version 1 is the legacy continuous-hold path with release grace.
- Version 2 uses a client interval default of 50 ms, valid interval range 10..100 ms, middle ticks strictly outside endpoint Bad windows, silent successful ticks, and one scored miss for each uninterrupted missed-tick run. The live path requires a release/re-press after a missed hold head before clearing tail ticks.

Replay frames contain timestamped boolean lane arrays. New live runs start with
an initial neutral frame. Playback uses `replayCursor.ts` and binary-search
helpers rather than scanning the full frame list on every render frame. Local
replay records are created as schema version 2 and include catalog identity,
beatmap hash, settings, mods, upload fields, and hold-rule metadata in memory.

Local history sanitization allows up to 1,000,000 replay frames. Remote client
normalization and server upload validation cap replay frames at 100,000, and the
server JSON payload is capped at 8 MiB.

Hold-rule metadata is preserved through local sanitization, server replay columns,
upload/download responses, and pending-replay promotion. The server verifier also
tracks the version-2 `tailRequiresRepress` state used by live gameplay.

`replayTransfer.ts` uses the `rhythmmania-replay-export` envelope, caps import
text at 64 MiB and records at 500, sanitizes every record, and marks imported
records as `imported`, local-only, and non-uploadable. Raw hit-error samples
are session-only; history retains Unstable Rate, sample count, and per-column
judgement counts.

## 7. Renderers

Both renderers implement the contract in `src/render/types.ts`:

```ts
interface IPlayfieldRenderer {
  init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void>;
  resize(width: number, height: number, dpr: number): void;
  render(frame: PlayfieldFrame): void;
  destroy(): void;
}
```

`GameplayCanvas` builds one `PlayfieldFrame` per animation frame. Shared math
and contracts live in:

| Module | Role |
| --- | --- |
| `render/types.ts` | Renderer, frame, visible-note, and visual-settings contracts |
| `render/laneLayout.ts` | Lane colors and equal-width column styles |
| `render/playfieldLayout.ts` | 2D lane geometry, scroll factor, note positions, Hidden opacity |
| `render/noteVisibility.ts` | Visible-note culling, hold geometry, and opacity |
| `render/scrollVelocity.ts` | Cumulative timing-point/SV scroll model |
| `render/skinTheme.ts` | Skin color resolution |
| `render/tailSegments.ts` | Hold-tail segment merging |

Canvas2D renders lanes, holds, note heads/endpoints, receptors, particles,
mobile touch-zone visuals, and its hit-error meter in the main 2D canvas.
The playfield context is acquired with `{ alpha: false, desynchronized: true }`,
then `{ alpha: false }`, then a default 2D context if those options fail.
`AudioEngine` constructs `AudioContext` with `{ latencyHint: 'interactive' }`
and falls back to a no-options constructor.
Canvas and touch lanes are equal width for 2K-9K. The touch adapter maps its
interaction surface into equal-width lanes; normal touch uses a lower/upper
vertical zone based on scroll direction, while Babylon uses full-surface touch.

Babylon is dynamically imported when selected. It creates a perspective
converging runway with six active layers: Background, Lane, Hold, Note,
Receptor, and Particle. It uses the shared frame for note state/colors but
ignores the shared 2D `columns[].x`/`width` geometry. It computes equal runway
lanes from key count and derives near-plane width from
`playfieldWidthPercent` and the camera projection.

Babylon details that are directly implemented:

- Notes are emissive slabs; hold bodies are tapered frustum-like slabs; lane separators converge toward the far end; the receptor is a glowing line.
- The camera framing is fixed. Only the frame's on-hit shake changes camera position.
- The camera pipeline enables a fixed bloom configuration in `BabylonSceneFactory`; there is no user bloom setting.
- The `babylonFloor` setting toggles the dark matte floor.
- Particles are consumed from the shared frame and are capped to 80 in `ParticleLayer`; `disableParticles` gates them upstream and in the layer.
- Babylon locks downward scroll through settings sanitization. Shared reverse/frozen SV math can still affect projected note depth, so “always depth-to-near” is only true for normal positive SV input.
- The Babylon hit-error meter is a separate 280x24 HTML `<canvas>` drawn directly by the gameplay animation loop. It is not a DOM text/direct-style meter.
- If Babylon initialization fails, gameplay asks `App` to switch back to Canvas2D.

## 8. API And Database

The API environment is read by `api/_lib/env.ts`:

- Database URL: `DATABASE_URL` or `POSTGRES_URL`.
- Discrete database fields: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, each with a `POSTGRES_*` equivalent.
- TLS: `PGSSLMODE`, default `verify-full`; production rejects `disable` unless `ALLOW_INSECURE_PG_TLS` is explicitly truthy.
- Session/auth: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Runtime detection: `NODE_ENV` and `VERCEL_ENV`.
- Hold verification: client `VITE_HOLD_TICK_INTERVAL_MS` defaults to 50 ms; server `HOLD_TICK_INTERVAL_MS` must be an explicit integer from 10..100 for version-2 replay uploads. The server does not use the client default when the variable is absent.

Production requires a configured `SESSION_SECRET` of at least 32 characters.
Development generates a process-local random secret, invalidating development
sessions when the process restarts. PostgreSQL uses a pooled connection with
maximum 10 connections, 30-second idle timeout, and 5-second connection
timeout. SQL calls use parameterized values in the current handlers.

### Routes

Direct functions:

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/config` | GET | Metadata version, supported mode `[3]`, and feature flags |
| `/api/health` | GET | Environment/database diagnostics; returns HTTP 200 with connection/error fields even when the database is unavailable |

Authentication router:

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/auth/me` | GET | Current session user or `null` |
| `/api/auth/logout` | POST | Same-origin session deletion and cookie clearing |
| `/api/auth/google/url` | GET | Google OAuth URL and short-lived state cookie |
| `/api/auth/google/callback` | OAuth callback | Exchanges code, creates/updates a user, creates a 30-day session, and returns an HTML popup handoff |

Replay router:

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/replays/upload` | POST | Authenticated, same-origin, CSRF-checked upload and optional authoritative verification |
| `/api/replays/list` | GET | Up to 50 leaderboard rows for an active canonical chart revision |
| `/api/replays/get` | GET | Replay view access; owner-only `purpose=download` |

Profile router:

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/profile/me` | GET, PATCH | Read/update the signed-in profile |
| `/api/profile/handle-check` | GET | Authenticated handle availability check |
| `/api/profile/get` | GET | Public profile by 16-character user id or handle, or current profile when authenticated without a target |
| `/api/profile/search` | GET | Process-local rate-limited profile search, maximum 20 database results |
| `/api/profile/avatar` | GET, POST | Fetch stored avatar or upload a base64 JPEG/PNG/WebP avatar |
| `/api/profile/avatar/preset` | POST | Select `preset_01` through `preset_08` |

Catalog router:

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/catalog/search` | GET | Unauthenticated mirror search (catboy.best primary, Nekoha fallback) for ranked/loved/graveyard mania |
| `/api/catalog/set` | GET | Authenticated cloud-set descriptor |
| `/api/catalog/chart` | GET | Authenticated chart-revision descriptor |
| `/api/catalog/register-download` | POST | Authenticated Google session plus osu! bearer token; registers/replaces a pending set token |
| `/api/catalog/activate-download` | POST | Authenticated private mirror verification and catalog activation, or HTTP 202 pending |
| `/api/catalog/download` | GET | Always HTTP 410; the API does not serve archives |

Cookie-authenticated mutations use same-origin validation and a signed
double-submit CSRF token. The server names are `rm_session_token`,
`rm_csrf_token`, and `X-CSRF-Token`. JSON responses normally set
`X-Content-Type-Options: nosniff`; OAuth HTML handoffs set `Content-Type`,
`Cache-Control: no-store`, `Pragma: no-cache`, and `nosniff`. The avatar binary
response is a separate direct response and does not use the JSON helper.

The request-origin helper derives origin from forwarded host/protocol headers
or `Host`; deployment must ensure those proxy headers are trustworthy. OAuth
callbacks accept only GET and the osu! callback embeds access and refresh
tokens in its short-lived popup/localStorage handoff. `/api/health` returns a
generic database diagnostic while logging only the error class.

### Catalog Flow

Catalog search needs no account. `GET /api/catalog/search` queries catboy.best
(`https://catboy.best/api/search?query=`) first and falls back to Nekoha
(`https://mirror.nekoha.moe/api/search`) when catboy errors or has no eligible
sets. The API only returns sets with ranked, loved, or graveyard status and
eligible 2K-9K mania charts (mania key count is read from the mirror `CS`/`cs`
field, checksums are mirror .osu MD5s).

Browser archives are downloaded directly from `https://catboy.best/d/<id>`.
The client falls back to `https://mirror.nekoha.moe/api/download/<id>` when the
Catboy request fails or returns a non-OK status. Google-linked
downloads first register a 30-minute pending server catalog token. Activation
privately fetches from the approved mirrors, verifies the archive/checksums,
parses server canonical mania charts, and marks matching PostgreSQL revisions
active. The API never returns the archive bytes.

The server verifier bounds approved hosts, redirects, request time, compressed
bytes, actual decompressed bytes, entry count/size, chart text, notes, timing
points, mode, key count, and checksum. The client and server maintain separate
limit constants; changes to one do not automatically change the other.

Catalog search has no application-level rate-limit check in the current handler,
although `catalog_search_rate_limits` exists in the SQL schema. Pending
registrations have no source-level cleanup job. Catalog activation promotes
pending replays after canonical chart verification.

### Replay Trust And Current Behavior

The authoritative replay identity is `chartRevisionId` plus the registered
checksum. The server accepts only mode 3 chart revisions with matching key
count/checksum. Active revisions with server-produced `canonical_chart` are
verified by `verifyReplayAgainstChart`; otherwise the row is retained as
`upload_status = 'pending'` and is not leaderboard-competitive.

The upload path rejects autoplay, malformed frames, invalid modifiers,
checksum/key mismatches, and version-2 hold intervals that do not equal the
explicit server interval. It does not reject a verified failed run: a failed
verified replay can be stored as `uploaded`, while leaderboard/profile queries
filter `is_failed = false`.

Leaderboard listing filters `upload_status = 'uploaded'`, non-failed state,
active catalog set, active revision, and non-null canonical chart, then limits
to 50 rows. Pending rows are re-verified and promoted during catalog
activation. Converted K-mod records are local-only because their key count no
longer matches the registered chart revision.

Public replay detail access is less restrictive than leaderboard listing: a
non-owner may view an uploaded replay when `canonical_chart` is non-null even
if the set/revision is not active. Only the owner may request download. The
profile aggregate/recent-play queries filter uploaded, non-failed,
chart-linked rows, but do not apply the active-set/active-revision/canonical
predicates used by the leaderboard query.

## 9. Database Contract

`database/schema.sql` runs in a transaction and uses `CREATE TABLE IF NOT
EXISTS`; it is not a migration runner. Existing incompatible tables are not
reshaped. The script has an explicit `ADD COLUMN IF NOT EXISTS canonical_chart`
compatibility statement.

The schema defines these tables:

- `users`: 16-character alphanumeric `VARCHAR` public ids, Google identity, username, email, role, and avatar URL.
- `sessions`: expiring sessions cascading from users.
- `beatmap_sets`: osu! catalog set metadata and `pending|active` state.
- `beatmap_difficulties`: legacy difficulty joins.
- `beatmap_chart_revisions`: chart revision identity, checksum, 2K-9K mania metadata, active/current flags, and optional server canonical JSON.
- `replays`: score fields, score state, replay frames, settings, mods, source, upload status, hold-rule metadata, and chart references.
- `user_profiles`: display name, unique handle, bio, social links, and activity fields.
- `user_avatars`: uploaded avatar MIME/data blobs.
- `catalog_search_rate_limits`: a user/window counter table currently not referenced by the catalog search handler.

SQL does not enforce replay score ranges, frame structure, modifier legality, or
upload-status semantics; those checks are in API code. Hold-rule version and
interval columns are present for replay parity and default legacy rows to v1.

## 10. Verification And Maintenance

The configured Vitest environment is Node and includes only
`tests/**/*.test.ts`. Current tests cover parser and archive limits, settings
and history sanitization, score/judgement math, hold ticks, replay cursors,
replay verification, scroll math/visibility, catalog registration policy, and
profile URL/social-link validation.

The test suite does not instantiate the browser `App`, `GameplayCanvas`,
Canvas2D renderer, Babylon renderer, AudioEngine, touch adapter, service
worker, HTTP handlers, OAuth flows, PostgreSQL, or real mirror downloads.
Passing tests therefore does not replace browser/API integration checks.

When changing gameplay timing, inspect all of these together:

- Live head/tail judgement and auto-miss in `GameplayCanvas.tsx`.
- Hold tick helpers and hold grace in `holdTickRules.ts` and `src/ruleset/mania/judgementTiming.ts`.
- Replay simulation, cursor/seek behavior, and record creation.
- DT/HT playback rate, pause/resume, countdown, and video synchronization.
- Server parsing and verification in `api/_lib/replayVerification.ts`.

When changing a setting, update `GameSettings`, defaults, `sanitizeSettings`,
the settings registry/UI, persistence, and every gameplay/render consumer.
When changing import/storage behavior, inspect single-file import, archive
staging, IndexedDB cleanup, unpacking, Blob URL ownership, and legacy
localStorage migration. When changing visuals, update shared frame/math
contracts first, then both renderers; preserve equal-width lanes and document
intentional Babylon divergence in executable behavior/tests rather than relying
on this file.

All webfonts are self-hosted from `public/fonts` and must never come from a
Google Fonts `@import` or any other third-party font CDN. The current set is
four variable-weight TTFs (`Inter-Variable.ttf`, `Nunito-Variable.ttf`,
`Orbitron-Variable.ttf`, `SpaceGrotesk-Variable.ttf`) plus their `OFL-*.txt`
license files, declared with `@font-face` (`font-display: swap`) in
`src/index.css` and precached in `public/sw.js` `STATIC_ASSETS` so text renders
offline and behind adblockers. When adding a font, keep only the needed
variable file and weights, add its `@font-face` block and precache entry, and
verify no `fonts.googleapis.com` / `fonts.gstatic.com` reference remains.

After substantive TypeScript changes, run `npm run lint` and `npm test`; run
`npm run build` for build-impacting changes. Because the repository contains
browser-only paths and optional API/database paths, use targeted browser and
integration smoke tests when those paths change.

### Visual UI Development Rules

- For any UI/frontend changes, spin up the local development server (`npm run
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

### Slant Fillet Corners

Slanted Song Select shells (the top-left song info wedge
`.lazer-song-wedge::before` and the top-right filter shell
`.lazer-song-filter-stack::before` in `src/ui/lazer/tokens.css`) get their
rounded corners with the **Slant Fillet** method: a true circular arc,
tangent to both the slanted edge and the straight edge, baked into the
`clip-path: polygon()` as sampled points. `border-radius` cannot be used
because the slant itself is a clip-path cut, and the background lives on
`::before` (painted behind content) so dropdown popups and inner content
are never clipped by it.

Follow these steps exactly when creating or retuning one:

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
