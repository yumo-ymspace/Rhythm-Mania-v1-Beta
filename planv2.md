# osu!(lazer) Mania Web Port — Implementation Plan

## Goal

Build a playable TypeScript + Vite web client that reproduces **osu!(lazer) mania** as closely as possible: Argon UI (from `DESIGN.md`), real-time playfield, **lazer standardised scoring**, 2K–9K, full mania mod set, osu! OAuth profile, osu! API v2 search, catboy.best `.osz` download, and local `.osz` import.

Repo today is only `DESIGN.md` + `plan.md`. Those two files are the UI/architecture brief, **not** source of truth for mechanics. Several formulas in them do not match live lazer. This plan overrides them with ppy source and wiki.

## Confirmed product decisions

| Topic | Decision |
| --- | --- |
| Hosting | **Vite SPA + Vercel Serverless Functions** (same shape as [RhythmMania](https://github.com/yumo-ymspace/RhythmMania)). Not a static-only host. Not a long-running Node process. |
| osu! API | Authorization Code OAuth via a Vercel Function. `GET /api/v2/me?mode=mania` for real avatar, username, rank, pp. Secret stays in Vercel env. |
| Beatmaps | Official **osu API v2 search** proxied by a Vercel Function. **`.osz` download in the browser** from catboy.best (`Access-Control-Allow-Origin: *`). Also local `.osz` upload. |
| Database | Your **PostgreSQL**, reached from Vercel Functions (`DATABASE_URL`). Identity/tokens only. **No leaderboards.** |
| Scope | **Solo only.** MULTI/EDIT hidden. Native **2K–9K**. All lazer mania mods. Default lazer scoring. |

## Corrections vs repo `plan.md` / `DESIGN.md`

Verified against ppy/osu (`ManiaHitWindows.cs`, `ManiaScoreProcessor.cs`, `ManiaHealthProcessor.cs`, `IBeatmapDifficultyInfo.cs`) and [osu! wiki judgement](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania) + [lazer gameplay differences](https://osu.ppy.sh/wiki/en/Client/Release_stream/Lazer/Gameplay_differences_in_osu%21%28lazer%29).

### Hit windows (lazer default, not Classic)

Perfect is **not** a constant ±16 ms. Windows use `DifficultyRange(OD, min@0, mid@5, max@10)`, then `floor(value * speedMultiplier / difficultyMultiplier) + 0.5`.

| Result | OD 0 | OD 5 | OD 10 |
| --- | --- | --- | --- |
| Perfect | 22.4 | 19.4 | 13.9 |
| Great | 64 | 49 | 34 |
| Good | 97 | 82 | 67 |
| Ok | 127 | 112 | 97 |
| Meh | 151 | 136 | 121 |
| Miss | 188 | 173 | 158 |

DT/HT **do not shrink the gameplay window** in mania: `SpeedMultiplier` keeps windows independent of clock rate. EZ/HR scale via `DifficultyMultiplier`. Rate mods still speed audio and visual scroll.

Classic is available as a **mod** (CL) because you asked for all mania mods; default play without CL uses the lazer windows above.

### Scoring (lazer standardised)

Repo 700k/300k split is **wrong**. Official:

```
total = 150000 * comboProgress
      + 850000 * Accuracy^(2 + 2*Accuracy) * accuracyProgress
      + bonusPortion
```

- Perfect base accuracy weight = **305** (combo weight still 300).
- Great=300, Good=200, Ok=100, Meh=50, Miss=0.
- Accuracy = sum(base scores) / (305 * judged objects).
- **SS (X)**: every judgement is Perfect or Great (mania override of `RankFromScore`). S ≥95%, A ≥90%, B ≥80%, C ≥70%, else D. Hidden/FI/FL make S/SS **silver**. Misses do **not** demote mania S the way they do in standard.

### Hold notes (lazer)

- Head and tail are **two separate judgements** (ScoreV2-like).
- Tail release windows are **1.5×**.
- Early body release → `ComboBreak` (combo reset, no extra score object). **No 100 ms hold ticks.**
- Late Meh on head/tail is impossible → Miss.

Repo “body ticks every 100 ms” is stable, not lazer.

### Health

`ManiaHealthProcessor.ComputeDrainRate()` returns **0** — no continuous drain. HP only changes on results (HP Drain Rate in the miss/meh/good/great/perfect formulas). Fail at 0 unless No Fail.

### Slider velocity

Inherited (green) points set SV = `-100 / beatLength`. **Uninherited (red) BPM points do not reset SV to 1.0.** The sample `ScrollPositionCalculator` in repo `plan.md` is incorrect and must be rewritten.

### UI brief that we *do* keep

`DESIGN.md` Argon tokens, −12° skew + counter-skew, screen map (menu / song select / mods / play / pause / fail / results / settings), HUD placement. Column colors for **every** key count follow osu’s default note-type map (1 / 2 / S), not only 4K/7K:

| Keys | Pattern (1=cyan, 2=blue, S=yellow) |
| --- | --- |
| 2K | 1 1 |
| 3K | 1 S 1 |
| 4K | 1 2 2 1 |
| 5K | 1 2 S 2 1 |
| 6K | 1 2 1 1 2 1 |
| 7K | 1 2 1 S 1 2 1 |
| 8K | 1 2 1 2 2 1 2 1 |
| 9K | 1 2 1 2 S 2 1 2 1 |

Visual QA uses Playwright screenshots against Argon references, not invented palettes.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite 6 + TypeScript 5.7 strict + React 19 | Matches both briefs; HMR for UI |
| Meta UI | React + Tailwind + CSS variables from `DESIGN.md` | Song select, settings, results |
| Playfield | Pixi.js v8 WebGL, **not** DOM notes | 240 FPS target, pooling |
| Audio | `AudioContext` master clock + `performance.now()` interpolation | Sample-accurate timeline |
| Local store | Dexie / IndexedDB + JSZip | Imported/downloaded sets, settings, private local play history |
| Hosting | Vercel: Vite static assets + Serverless Functions in `api/` | Same pattern as RhythmMania |
| Database | Postgres from Functions only | OAuth users/sessions/tokens |
| Tests | Vitest + Playwright MCP | Ruleset parity + Argon screenshots |

**Never** put `OSU_CLIENT_SECRET` in a `VITE_*` variable. Vite inlines those into the browser bundle. Vercel env (and local `.env` for `vercel dev`) is the only place for secrets.

Layout (proposed, created on execute):

```
src/
  ui/                 React Argon screens
  engine/
    clock/            AudioMasterClock
    input/            key queue (code, not key)
    beatmap/          .osu parser, SV integrator, column map
    ruleset/          windows, notes/holds, score, health, UR
    audio/            decode, hitsounds, DT/NC/HT rate+pitch
    render/           Pixi playfield, Argon notes, HUD canvas bits
  storage/            Dexie schema
  api/                  Vercel Functions: OAuth, osu search proxy, /me
  database/schema.sql   Postgres tables (users, tokens, sessions only)
```

## What “Vercel site” means (your question)

It is **not** a static site. The usual name is a **Vite SPA with Vercel Serverless Functions** (Jamstack / serverless full-stack).

| Piece | Who runs it | Why |
| --- | --- | --- |
| React/Pixi UI, parser, playfield | Browser | Game loop, JSZip, IndexedDB |
| `POST osu.ppy.sh/oauth/token`, `GET /api/v2/me`, `GET /api/v2/beatmapsets/search` | **Vercel Function** | osu.ppy.sh sends **no CORS** — a browser `fetch` is blocked. Secret must not ship in JS. |
| `GET https://catboy.best/d/{setId}n` | **Browser** | Verified `Access-Control-Allow-Origin: *` on the download. Same as RhythmMania. |
| Postgres | Vercel Function via `DATABASE_URL` | No SQL from the browser. |

### How [RhythmMania](https://github.com/yumo-ymspace/RhythmMania) already does this

- `api/auth/osu/url` + `callback` + `refresh` — Function exchanges the code with `OSU_CLIENT_SECRET`.
- `GET /api/catalog/search` — Function calls official osu search with the user’s token.
- Client then downloads the `.osz` from **catboy.best** (Mino), osudl.org fallback.
- `DATABASE_URL` / `PG*` for Postgres. Env names in their `.env.example`: `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `DATABASE_URL`, `SESSION_SECRET`.

This port copies that split. Difference: **no** Google login, **no** replay upload, **no** catalog leaderboard tables.

## `.env` names (what you asked for)

Create `.env` at the repo root (gitignored). Copy from `.env.example`. Register the OAuth app at https://osu.ppy.sh/home/account/edit#oauth with callback **exactly** matching `OSU_REDIRECT_URI`.

```
# --- osu! API v2 OAuth (Authorization Code). SERVER ONLY. ---
OSU_CLIENT_ID=
OSU_CLIENT_SECRET=
OSU_REDIRECT_URI=http://localhost:5173/api/auth/osu/callback
# Production example: https://YOUR-DEPLOY.vercel.app/api/auth/osu/callback

# --- Postgres (your existing database) ---
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME

# --- Beatmap mirror ---
CATBOY_BASE_URL=https://catboy.best

# --- Session cookie signing ---
SESSION_SECRET=
```

| Name | Goes in browser? | Purpose |
| --- | --- | --- |
| `OSU_CLIENT_ID` | No (server reads it; id is not secret but we still keep one source) | OAuth application id |
| `OSU_CLIENT_SECRET` | **Never** | OAuth client secret |
| `OSU_REDIRECT_URI` | No | Must match the callback URL on the osu! OAuth app |
| `DATABASE_URL` | **Never** | Postgres connection string |
| `CATBOY_BASE_URL` | No | Mirror origin, default `https://catboy.best` |
| `SESSION_SECRET` | **Never** | Signs the login cookie |

There is **no** `VITE_OSU_CLIENT_SECRET`. Login is `GET /api/auth/osu/url` (Vercel Function), which redirects to `https://osu.ppy.sh/oauth/authorize`.

Same names as RhythmMania so you can reuse the OAuth app if the callback URL is added for this project.

Fill these in before we run the backend. You do not need to paste the secret into chat.

## OAuth + Postgres (no leaderboards)

Flow:

1. Profile chip → `GET /api/auth/osu/url` (Function) → osu authorize `identify public` + CSRF `state`.
2. `GET /api/auth/osu/callback` (Function) → `POST https://osu.ppy.sh/oauth/token`.
3. Function `GET https://osu.ppy.sh/api/v2/me?mode=mania`.
4. Upsert Postgres, set httpOnly session cookie, redirect to `/`.
5. Toolbar `GET /api/auth/me` → username, avatar, mania rank, pp, level.

Tables (and **only** these):

```
osu_users (
  osu_id        bigint primary key,
  username      text not null,
  avatar_url    text,
  cover_url     text,
  country_code  text,
  pp            double precision,
  global_rank   integer,
  level         double precision,
  updated_at    timestamptz not null
)

osu_oauth_tokens (
  osu_id        bigint primary key references osu_users(osu_id),
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scopes        text not null
)

sessions (
  id            uuid primary key,
  osu_id        bigint not null references osu_users(osu_id),
  expires_at    timestamptz not null
)
```

Refresh tokens on the server when `expires_at` is near. **No `scores` table. No ranks table. No friends board.**

Song select **omits Global / Friends / Local leaderboard tabs**. No score lists. Personal last-play stats can appear on results only, in IndexedDB, never in Postgres.

## Beatmap search and download

- **Search (Function):** `GET /api/catalog/search` proxies `https://osu.ppy.sh/api/v2/beatmapsets/search` with `m=3`, using the logged-in user’s token (refresh if needed). This is the only way to use official API v2 search; the browser cannot call osu.ppy.sh.
- **Download (browser):** `fetch('https://catboy.best/d/' + setId + 'n')` → Blob → JSZip → IndexedDB. No video. Fallback `https://osu.direct/d/{id}` if catboy fails (RhythmMania uses osudl.org). Catboy CORS is `*`; no Function needed for the file bytes (avoids Vercel 4.5 MB body limits on large `.osz`).
- **Upload (browser):** drag-and-drop / file picker, same IndexedDB path. Works logged out.
- Search UI requires osu login. Import and play do not.

## Mods (all lazer mania)

From `ManiaRuleset.GetModsFor`:

- Reduction: EZ, NF, HT, DC
- Increase: HR, SD, PF, DT, NC, HD, FI, FL, Cover, Accuracy Challenge
- Automation: AT, CN
- Conversion: 1K–10K (playable even if native charts are 2–9), RD, DS, MR, DA, CL, IN, CS, HO

Score multipliers come from each mod class in ppy/osu at implement time, not from the DESIGN.md table if they disagree.

Gameplay loop never allocates: pool notes, particles, input events. React is **off** the playfield; HUD numbers can be React *or* Pixi text — Pixi for combo/judgement (240 Hz), React for pause/results.

## Gameplay spec (implement exactly)

1. Parse `.osu` Mode 3. Column `floor(x * K / 512)` clamped `[0, K-1]`. Native **K = 2..9**. Key mods can force 1K–10K.
2. Per-column FIFO: ghost tap if input is earlier than miss window; consume earliest unjudged object in window; auto-miss after late miss window.
3. Holds: judge head on down; require hold through body; `ComboBreak` on early release; judge tail on up with 1.5× windows.
4. Clock: `rawMs = startOffset + (ctx.currentTime - startCtx) * rate * 1000 + userOffset + mapOffset`. Visual Y from precomputed distance `D(t)` vs `D(now)` and scroll duration (default 500 ms).
5. Input: `keydown`/`keyup` capture, ignore `repeat`, stamp `performance.now()`, drain queue before judgement each frame. Default binds 4K `D F J K`, 7K `S D F Space J K L`.
6. Mods: full lazer mania set listed above. Source multipliers win over `DESIGN.md`.
7. Results: grade, standardised score, judgement matrix, UR. Scores stay in IndexedDB for that browser only — not uploaded, not ranked.

## UI spec (from DESIGN.md + live Argon)

- Tokens: `--bg-base #08090D`, cyan `#00F0FF`, pink `#FF007F`, yellow `#FFCC00`, emerald `#00FF66`.
- Torus Pro with Inter fallback; Exo 2 tabular for score/acc/combo.
- Screens: title (BPM-pulsed logo; **SOLO / SETTINGS / EXIT**; MULTI and EDIT hidden), song select with API search + download + import, mod overlay (full set), Pixi playfield + HUD, pause/fail, results, settings (2K–9K binds). Profile chip is Guest until OAuth, then real osu mania stats.
- 4K colors C Y Y C; 7K C B C Y C B C.
- Visual QA: Playwright screenshot of each screen vs reference stills from [ppy/osu Argon mania skinning](https://github.com/ppy/osu/tree/master/osu.Game.Rulesets.Mania/Skinning/Argon) and official lazer screenshots. Iterate CSS/canvas until layout, skew, and judgment colors match.

## Beatmaps without API (always)

Drag-and-drop / file picker `.osz` still works with no login. Search and catboy download require the OAuth session.

Ship **one bundled original/CC sample chart** so the app is playable offline. Do **not** ship copyrighted ranked osu! sets in the repo.

## Rate limits and ToS notes (locked)

- osu API: ≤60 req/min, cache search, backoff. Docs: https://osu.ppy.sh/docs
- Official `.osz` download endpoint is lazer-only — we **do not** call it.
- catboy.best (Mino) is a community mirror you approved. Browser download (CORS `*`). Vercel is not used as a file proxy so large maps are not truncated.
- We never harvest mass score data into Postgres.

## Visual / research loop during implementation

1. Port formulas from ppy source, not wiki-only.
2. Screenshot Argon references (GitHub raw SVGs/PNGs + wiki judgement images).
3. After each UI PR: Vite preview → Playwright `browser_navigate` + `browser_take_screenshot` at 1920×1080 and 390×844; compare tokens, skew, HUD.
4. Vitest fixtures: OD 0/5/10 windows, column edges, score of all-Perfect = 1_000_000, SS with mixed Perfect/Great, ComboBreak on LN release.

## PR plan

| PR | Title | Depends | Deliverable |
| --- | --- | --- | --- |
| 1 | Vite React-TS scaffold, Argon tokens, `vercel.json`, `api/` stub, `.env.example` | — | `vercel dev` / `npm run dev` |
| 2 | Postgres identity tables + osu OAuth Functions + `/api/auth/me` | 1 | Profile chip shows real osu mania user |
| 3 | `.osu` parser + SV integrator + Dexie + `.osz` import | 1 | Local import lists in song select |
| 4 | AudioMasterClock + input queue + 2K–9K binds | 1 | Clock tests |
| 5 | Mania ruleset: windows, LN, score, health, UR, full mod set | 4 | Vitest vs lazer formulas |
| 6 | Pixi playfield + Argon notes/receptors/HUD | 3,5 | Play an imported map |
| 7 | `/api/catalog/search` (osu v2) + in-browser catboy download into Dexie | 2,3 | Search → download → play |
| 8 | Song select, mods overlay, settings, pause/fail, results | 6,7 | Full solo loop |
| 9 | Playwright visual pass + one original sample chart | 8 | Screenshot suite |

Out of v1: MULTI, EDIT, our leaderboard, score submit to osu, mass beatmap harvest.

## Key decisions (locked)

1. Lazer mechanics override repo `plan.md` when they conflict.
2. Pixi playfield / React chrome split; AudioContext master clock.
3. Vercel SPA + Functions (RhythmMania-style). OAuth secret only in Function env.
4. Postgres for identity/tokens only — **no leaderboards**.
5. Maps: official search via Function; catboy `.osz` in the browser; local upload.
6. Solo, 2K–9K, all lazer mania mods, default lazer scoring.
7. Playwright visual QA on every UI surface.

## What you need to provide when implementation starts

1. Fill `.env` (and Vercel project env) with `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `OSU_REDIRECT_URI`, `DATABASE_URL`, `SESSION_SECRET`. Do not paste secrets into chat.
2. OAuth callback: local `http://localhost:5173/api/auth/osu/callback`; add the Vercel production URL on the same osu app.
3. Postgres user can `CREATE TABLE` for the three identity tables. No score tables.
