# osu!(lazer) Mania Web Port — Implementation Plan

## Goal

Build a playable TypeScript + Vite web client that reproduces **osu!(lazer) mania** as closely as possible: Argon UI (from `DESIGN.md`), real-time playfield, **lazer standardised scoring**, 2K–9K, full mania mod set, osu! OAuth profile, osu! API v2 search, catboy.best `.osz` download, and local `.osz` import.

`DESIGN.md` is the UI/visual brief. This document is the product + architecture + mechanics spec. Several formulas in the original architecture brief (hit windows, scoring split, hold ticks, SV reset, health drain, leaderboards) **do not match live lazer**. This plan overrides them with ppy source and wiki. Implement against ppy/osu, not against those superseded numbers.

## Confirmed product decisions

| Topic | Decision |
| --- | --- |
| Hosting | **Vite SPA + Vercel Serverless Functions** (same shape as [RhythmMania](https://github.com/yumo-ymspace/RhythmMania)). Not a static-only host. Not a long-running Node process. |
| osu! API | Authorization Code OAuth via a Vercel Function. `GET /api/v2/me?mode=mania` for real avatar, username, rank, pp. Secret stays in Vercel env. |
| Beatmaps | Official **osu API v2 search** proxied by a Vercel Function. **`.osz` download in the browser** from catboy.best (`Access-Control-Allow-Origin: *`). Also local `.osz` upload. |
| Database | Your **PostgreSQL**, reached from Vercel Functions (`DATABASE_URL`). Identity/tokens only. **No leaderboards.** |
| Scope | **Solo only.** MULTI/EDIT hidden. Native **2K–9K**. All lazer mania mods. Default lazer scoring. |

---

## Corrections vs the superseded architecture brief / `DESIGN.md`

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

The 700k/300k split is **wrong**. Official:

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

“Body ticks every 100 ms” is stable, not lazer.

### Health

`ManiaHealthProcessor.ComputeDrainRate()` returns **0** — no continuous drain. HP only changes on results (HP Drain Rate in the miss/meh/good/great/perfect formulas from ppy source at implement time). Fail at 0 unless No Fail.

### Slider velocity

Inherited (green) points set SV = `-100 / beatLength`. **Uninherited (red) BPM points do not reset SV to 1.0.** Any `ScrollPositionCalculator` that sets `currentMultiplier = 1.0` on uninherited points is incorrect and must not be used.

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

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite 6 + TypeScript 5.7 strict + React 19 | HMR for UI; native ES modules |
| Meta UI | React + Tailwind + CSS variables from `DESIGN.md` | Song select, settings, results |
| Playfield | Pixi.js v8 WebGL, **not** DOM notes | 240 FPS target, pooling |
| Audio | `AudioContext` master clock + `performance.now()` interpolation | Sample-accurate timeline |
| Local store | Dexie / IndexedDB + JSZip | Imported/downloaded sets, settings, private local play history |
| Hosting | Vercel: Vite static assets + Serverless Functions in `api/` | Same pattern as RhythmMania |
| Database | Postgres from Functions only | OAuth users/sessions/tokens |
| Tests | Vitest + Playwright MCP | Ruleset parity + Argon screenshots |

**Never** put `OSU_CLIENT_SECRET` in a `VITE_*` variable. Vite inlines those into the browser bundle. Vercel env (and local `.env` for `vercel dev`) is the only place for secrets.

Layout (created on execute):

```
src/
  ui/                   React Argon screens
  engine/
    clock/              AudioMasterClock
    input/              key queue (code, not key)
    beatmap/            .osu parser, SV integrator, column map
    ruleset/            windows, notes/holds, score, health, UR
    audio/              decode, hitsounds, DT/NC/HT rate+pitch
    render/             Pixi playfield, Argon notes, HUD canvas bits
  storage/              Dexie schema
api/                    Vercel Functions: OAuth, osu search proxy, /me
database/schema.sql     Postgres tables (users, tokens, sessions only)
```

---

## Executive architecture

Rhythm action games fail if frame pacing jitter exceeds ~4 ms or the audio clock desyncs. The C# engine paradigm of [ppy/osu](https://github.com/ppy/osu) maps onto this web split:

```
+---------------------------------------------------------------------------------------+
|                                    User Interface Layer                               |
|       (React / Tailwind / Lucide / −12° Argon components from DESIGN.md)              |
|  +---------------------+  +----------------------+  +-------------------------------+ |
|  |     Main Menu       |  |     Song Select      |  |   Results (local stats only)  | |
|  |  SOLO / SETTINGS    |  |  search / import     |  |   no Global/Friends/Local LB  | |
|  +---------------------+  +----------------------+  +-------------------------------+ |
+-------------------------------------------+-------------------------------------------+
                                            | State & Events
+-------------------------------------------v-------------------------------------------+
|                                   Core Game Engine                                    |
|  +---------------------------------------------------------------------------------+  |
|  |                          High-Precision Synchronizer                            |  |
|  |       (Audio Master Clock + performance.now() interpolation + offsets)          |  |
|  +---------------------------------------------------------------------------------+  |
|  +----------------------------+  +-------------------------+  +--------------------+  |
|  |     Mania Ruleset Engine   |  |     Scoring Processor   |  |   Health Processor |  |
|  | (lazer windows, LN head/   |  | (150k combo + 850k acc  |  | (no continuous     |  |
|  |  tail, ComboBreak)         |  |  curve, UR)             |  |  drain)            |  |
|  +----------------------------+  +-------------------------+  +--------------------+  |
+-------------------------------------------+-------------------------------------------+
         | Render State Updates             | Audio Events             | Input Events
+--------v----------------------+  +--------v----------------+  +------v----------------+
|       Rendering Engine        |  |      Audio Engine       |  |     Input Engine      |
| (Pixi.js v8 WebGL, pooled     |  | (Web Audio API,         |  | (keydown/keyup        |
|  notes, hold bodies, HUD)     |  |  rate+pitch for DT/HT)  |  |  capture, no repeat)  |
+-------------------------------+  +-------------------------+  +-----------------------+
                                            |
+-------------------------------------------v-------------------------------------------+
|                         Data, persistence, and serverless                             |
|  +----------------------+  +----------------------+  +-----------------------------+  |
|  | .osu decoder + SV    |  | IndexedDB (Dexie)    |  | Vercel Functions            |  |
|  | JSZip .osz ingest    |  | maps, audio, local   |  | OAuth, /me, catalog search  |  |
|  |                      |  | play history         |  | Postgres identity only      |  |
|  +----------------------+  +----------------------+  +-----------------------------+  |
+---------------------------------------------------------------------------------------+
```

### Performance budgets

| Subsystem | Target | Hard upper limit | Mitigation |
| --- | --- | --- | --- |
| Rendering loop | 240+ FPS (~4.16 ms/frame) | 60 FPS | Pixi v8 batching, sprite pooling, instanced hold bodies |
| Input latency | ≤ 2.0 ms stamp | ≤ 8.0 ms | Direct `KeyboardEvent` + `performance.now()`, drain before judgement |
| Audio-visual drift | ± 0.5 ms | ± 2.0 ms | `AudioContext.currentTime` master + linear interpolation |
| GC jitter | 0 allocs in game loop | < 0.5 ms pause | Pre-allocated note/particle/input pools |
| Beatmap parse | < 50 ms per map | < 200 ms | Linear scan, typed arrays after parse |

Gameplay loop never allocates. React is **off** the playfield. Pixi for combo/judgement (240 Hz). React for pause/results/song select.

---

## What “Vercel site” means

It is **not** a static site. The name is a **Vite SPA with Vercel Serverless Functions** (Jamstack / serverless full-stack).

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

---

## `.env` names

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

---

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

---

## Beatmap search and download

- **Search (Function):** `GET /api/catalog/search` proxies `https://osu.ppy.sh/api/v2/beatmapsets/search` with `m=3`, using the logged-in user’s token (refresh if needed). This is the only way to use official API v2 search; the browser cannot call osu.ppy.sh.
- **Download (browser):** `fetch('https://catboy.best/d/' + setId + 'n')` → Blob → JSZip → IndexedDB. No video. Fallback `https://osu.direct/d/{id}` if catboy fails (RhythmMania uses osudl.org). Catboy CORS is `*`; no Function needed for the file bytes (avoids Vercel 4.5 MB body limits on large `.osz`).
- **Upload (browser):** drag-and-drop / file picker, same IndexedDB path. Works logged out.
- Search UI requires osu login. Import and play do not.

Drag-and-drop / file picker `.osz` still works with no login. Search and catboy download require the OAuth session.

Ship **one bundled original/CC sample chart** so the app is playable offline. Do **not** ship copyrighted ranked osu! sets in the repo.

### Rate limits and ToS (locked)

- osu API: ≤60 req/min, cache search, backoff. Docs: https://osu.ppy.sh/docs
- Official `.osz` download endpoint is lazer-only — we **do not** call it.
- catboy.best (Mino) is a community mirror you approved. Browser download (CORS `*`). Vercel is not used as a file proxy so large maps are not truncated.
- We never harvest mass score data into Postgres.

---

## Mods (all lazer mania)

From `ManiaRuleset.GetModsFor`:

- Reduction: EZ, NF, HT, DC
- Increase: HR, SD, PF, DT, NC, HD, FI, FL, Cover, Accuracy Challenge
- Automation: AT, CN
- Conversion: 1K–10K (playable even if native charts are 2–9), RD, DS, MR, DA, CL, IN, CS, HO

Score multipliers come from each mod class in ppy/osu at implement time, not from a `DESIGN.md` table if they disagree.

---

## Beatmap specification and ingestion

The parser follows the [osu! Beatmap File Format Specification](https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29). Gameplay uses Mode `3` (Mania). Do not convert Mode 0 charts in v1.

### `.osu` sections required

- `[General]`: `AudioFilename`, `AudioLeadIn`, `PreviewTime`, `Mode` (must be 3).
- `[Metadata]`: Title / TitleUnicode, Artist / ArtistUnicode, Creator, Version, Source, Tags, BeatmapID, BeatmapSetID.
- `[Difficulty]`: `CircleSize` = key count, `OverallDifficulty`, `HPDrainRate`, `SliderMultiplier`.
- `[Events]`: background image (`0,0,"bg.jpg",0,0`). Skip video.
- `[TimingPoints]`: tempo, meter, sample banks, inherited SV.
- `[HitObjects]`: taps and holds.

### Column mapping

Hit object `X ∈ [0, 512]`. `Y` is ignored for layout.

```
C = clamp(floor(X * K / 512), 0, K - 1)
```

Native **K = 2..9**. Key mods can force 1K–10K.

### Hit object encoding

1. **Single note**: `type & 1 != 0`. Line: `x,y,time,type,hitSound,hitSample`.
2. **Hold**: `type & 128 != 0`. Line: `x,y,time,type,hitSound,endTime:hitSample`. `endTime` is the first colon-delimited token of the sixth field.

```typescript
export interface RawHitObject {
  column: number;
  startTime: number;
  endTime: number;
  isHold: boolean;
  hitSound: number;
  hitSample: string;
}

export interface TimingPoint {
  time: number;
  beatLength: number; // uninherited: BPM = 60000 / beatLength; inherited: SV = -100 / beatLength
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
}

export interface ParsedManiaBeatmap {
  general: {
    audioFilename: string;
    audioLeadIn: number;
    previewTime: number;
  };
  metadata: {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    version: string;
    beatmapId: number;
    beatmapSetId: number;
  };
  difficulty: {
    keyCount: number; // CircleSize
    overallDifficulty: number;
    hpDrainRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
  };
  backgroundFilename: string | null;
  timingPoints: TimingPoint[];
  hitObjects: RawHitObject[];
}
```

### Slider velocity and scroll position

Inherited (green) timing points: `SV = -100 / beatLength`. Example: `beatLength = -50` → SV `2.0×`; `-200` → `0.5×`.

**Red (uninherited) BPM points change tempo only. They do not reset SV to 1.0.** SV persists until the next inherited point.

Precompute cumulative track distance so note Y is frame-rate independent:

```
D(t) = ∫ V(u) du  from 0 to t
```

Piecewise: for each segment `[t_i, t_{i+1})` with multiplier `V_i`, add `V_i * Δt`.

```typescript
export interface ScrollSegment {
  startTime: number;
  endTime: number;
  multiplier: number;
  cumulativeDistanceStart: number;
}

export class ScrollPositionCalculator {
  private segments: ScrollSegment[] = [];

  constructor(timingPoints: TimingPoint[], mapDuration: number) {
    this.buildSegments(timingPoints, mapDuration);
  }

  private buildSegments(timingPoints: TimingPoint[], mapDuration: number): void {
    const sorted = [...timingPoints].sort((a, b) => a.time - b.time);
    let currentMultiplier = 1.0;
    let lastTime = 0;
    let runningDistance = 0;

    for (let i = 0; i < sorted.length; i++) {
      const tp = sorted[i];
      const time = Math.max(0, tp.time);

      if (time > lastTime) {
        this.segments.push({
          startTime: lastTime,
          endTime: time,
          multiplier: currentMultiplier,
          cumulativeDistanceStart: runningDistance,
        });
        runningDistance += (time - lastTime) * currentMultiplier;
        lastTime = time;
      }

      if (!tp.uninherited) {
        currentMultiplier = -100 / tp.beatLength;
      }
      // else: BPM change only — do not reset currentMultiplier
    }

    this.segments.push({
      startTime: lastTime,
      endTime: mapDuration + 10000,
      multiplier: currentMultiplier,
      cumulativeDistanceStart: runningDistance,
    });
  }

  public getVisualPosition(time: number): number {
    let low = 0;
    let high = this.segments.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const seg = this.segments[mid];
      if (time >= seg.startTime && time < seg.endTime) {
        return seg.cumulativeDistanceStart + (time - seg.startTime) * seg.multiplier;
      }
      if (time < seg.startTime) high = mid - 1;
      else low = mid + 1;
    }
    return time;
  }
}
```

Visual Y (downscroll): `noteY = hitPosition - ((D(noteTime) - D(now)) / scrollDurationMs) * hitPosition`. Default scroll duration 500 ms.

---

## Precision timing, audio, and input

Do not use `setTimeout` / `setInterval` as the game clock. Master time is `AudioContext.currentTime`. Because that value steps with the audio buffer (typically 2.6–10.6 ms), interpolate with `performance.now()` for visuals.

Clock:

```
rawMs = startOffset + (ctx.currentTime - startCtx) * rate * 1000 + userOffset + mapOffset
```

```typescript
export class AudioMasterClock {
  private audioCtx: AudioContext;
  private audioBufferSource: AudioBufferSourceNode | null = null;
  private startTimeAudioCtx = 0;
  private startOffsetMs = 0;
  private userOffsetMs = 0;
  private mapOffsetMs = 0;
  private isPlaying = false;
  private playbackRate = 1.0;
  private anchorAudioTime = 0;
  private anchorPerf = 0;

  constructor(audioCtx: AudioContext) {
    this.audioCtx = audioCtx;
  }

  public start(buffer: AudioBuffer, startPositionMs = 0, rate = 1.0): void {
    this.audioBufferSource = this.audioCtx.createBufferSource();
    this.audioBufferSource.buffer = buffer;
    this.playbackRate = rate;
    this.audioBufferSource.playbackRate.setValueAtTime(rate, this.audioCtx.currentTime);
    this.audioBufferSource.connect(this.audioCtx.destination);

    this.startTimeAudioCtx = this.audioCtx.currentTime;
    this.startOffsetMs = startPositionMs;
    this.anchorAudioTime = this.startTimeAudioCtx;
    this.anchorPerf = performance.now();
    this.audioBufferSource.start(0, startPositionMs / 1000);
    this.isPlaying = true;
  }

  public getCurrentTime(): number {
    if (!this.isPlaying) return this.startOffsetMs;
    const audioNow = this.audioCtx.currentTime;
    if (audioNow !== this.anchorAudioTime) {
      this.anchorAudioTime = audioNow;
      this.anchorPerf = performance.now();
    }
    const interpolatedSec =
      (audioNow - this.startTimeAudioCtx) +
      ((performance.now() - this.anchorPerf) / 1000);
    return this.startOffsetMs + interpolatedSec * this.playbackRate * 1000
      + this.userOffsetMs + this.mapOffsetMs;
  }

  public setOffsets(userOffset: number, mapOffset: number): void {
    this.userOffsetMs = userOffset;
    this.mapOffsetMs = mapOffset;
  }

  public stop(): void {
    if (this.audioBufferSource) {
      try {
        this.audioBufferSource.stop();
        this.audioBufferSource.disconnect();
      } catch {
        /* already stopped */
      }
      this.audioBufferSource = null;
    }
    this.isPlaying = false;
  }
}
```

Rate mods: DT/NC/HT change `playbackRate` (and pitch for NC vs DT per lazer). Hitsounds scheduled on the same graph.

### Input

Capture `keydown`/`keyup` with `{ capture: true, passive: false }`. Ignore `repeat`. Stamp `performance.now()`. Drain the queue **before** judgement each frame. Bind by `e.code`, not `e.key`.

Default binds: 4K `KeyD KeyF KeyJ KeyK`; 7K `KeyS KeyD KeyF Space KeyJ KeyK KeyL`. Settings cover 2K–9K (and 1K/10K via key mods).

```typescript
export interface QueuedInputEvent {
  column: number;
  type: 'down' | 'up';
  timestamp: number;
}

export class LowLatencyInputManager {
  private keyMap = new Map<string, number>();
  private inputQueue: QueuedInputEvent[] = [];
  private keyState: boolean[] = [];

  constructor(keyCount: number, customBinds?: string[]) {
    this.keyState = new Array(keyCount).fill(false);
    this.setupBindings(keyCount, customBinds);
    this.attachListeners();
  }

  private setupBindings(keyCount: number, customBinds?: string[]): void {
    const default4K = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    const default7K = ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'];
    const bindings = customBinds ?? (keyCount === 7 ? default7K : default4K);
    bindings.forEach((code, idx) => this.keyMap.set(code, idx));
  }

  private attachListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const col = this.keyMap.get(e.code);
      if (col === undefined) return;
      e.preventDefault();
      this.keyState[col] = true;
      this.inputQueue.push({ column: col, type: 'down', timestamp: performance.now() });
    }, { passive: false, capture: true });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const col = this.keyMap.get(e.code);
      if (col === undefined) return;
      e.preventDefault();
      this.keyState[col] = false;
      this.inputQueue.push({ column: col, type: 'up', timestamp: performance.now() });
    }, { passive: false, capture: true });
  }

  public drainEvents(): QueuedInputEvent[] {
    const events = this.inputQueue;
    this.inputQueue = [];
    return events;
  }

  public isColumnPressed(column: number): boolean {
    return this.keyState[column] === true;
  }
}
```

Map input timestamps onto clock time by subtracting the same `performance.now()` ↔ audio-clock offset used by the interpolator.

---

## Gameplay spec (implement exactly)

1. Parse `.osu` Mode 3. Column `floor(x * K / 512)` clamped `[0, K-1]`. Native **K = 2..9**. Key mods can force 1K–10K.
2. Per-column FIFO: ghost tap if input is earlier than miss window; consume earliest unjudged object in window; auto-miss after late miss window.
3. Holds: judge head on down; require hold through body; `ComboBreak` on early release; judge tail on up with 1.5× windows. **No 100 ms body ticks.**
4. Clock and visual Y as above.
5. Input as above.
6. Mods: full lazer mania set. Source multipliers win over `DESIGN.md`.
7. Results: grade, standardised score, judgement matrix, UR. Scores stay in IndexedDB for that browser only — not uploaded, not ranked.

### Hit windows

```typescript
export enum HitResult {
  None = 0,
  Miss = 1,
  Meh = 2,
  Ok = 3,
  Good = 4,
  Great = 5,
  Perfect = 6,
}

/** DifficultyRange(od, min@0, mid@5, max@10) from IBeatmapDifficultyInfo. */
export function difficultyRange(od: number, min: number, mid: number, max: number): number {
  if (od > 5) return mid + ((max - mid) * (od - 5)) / 5;
  if (od < 5) return mid + ((mid - min) * (od - 5)) / 5;
  return mid;
}

export class ManiaHitWindows {
  public perfect: number;
  public great: number;
  public good: number;
  public ok: number;
  public meh: number;
  public miss: number;

  constructor(od: number, speedMultiplier = 1, difficultyMultiplier = 1) {
    const clampedOd = Math.max(0, Math.min(10, od));
    const scale = (min: number, mid: number, max: number) =>
      Math.floor((difficultyRange(clampedOd, min, mid, max) * speedMultiplier) / difficultyMultiplier) + 0.5;

    this.perfect = scale(22.4, 19.4, 13.9);
    this.great = scale(64, 49, 34);
    this.good = scale(97, 82, 67);
    this.ok = scale(127, 112, 97);
    this.meh = scale(151, 136, 121);
    this.miss = scale(188, 173, 158);
  }

  public judge(deltaMs: number): HitResult {
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= this.perfect) return HitResult.Perfect;
    if (absDelta <= this.great) return HitResult.Great;
    if (absDelta <= this.good) return HitResult.Good;
    if (absDelta <= this.ok) return HitResult.Ok;
    if (absDelta <= this.meh) return HitResult.Meh;
    if (absDelta <= this.miss) return HitResult.Miss;
    return HitResult.None;
  }
}
```

Exact min/mid/max constants must be copied from `ManiaHitWindows.cs` at implement time. The OD 0/5/10 table above is the acceptance fixture. CL mod uses Classic windows instead.

Mania: DT/HT `SpeedMultiplier` keeps windows independent of clock rate (do not shrink the window because audio is faster). EZ/HR use `DifficultyMultiplier`.

### Per-column FIFO

When the user presses at `t_input`, search the earliest unjudged object in that column:

1. `Δt = t_input - t_note`.
2. If `Δt < -missWindow` → ghost tap (do not consume, do not penalize).
3. If `|Δt| ≤ missWindow` → `judge(Δt)`, consume, update score/health/combo.
4. Each frame: unjudged notes with `t_now - t_note > missWindow` auto-miss.

Late Meh on head/tail is impossible → Miss (lazer). Port that rule from source, do not invent a Meh-after-timeout path.

### Holds

```
t_head                                              t_tail
[ Head judgement ]======== body (held) =========[ Tail judgement ]
     keydown              early release = ComboBreak      keyup
```

- Head: `keydown` vs standard windows. Separate score object.
- Body: must stay held. Early release → `ComboBreak` (combo reset, **no extra score object**). No 100 ms ticks.
- Tail: `keyup` vs **1.5×** windows. Separate score object.
- Holding past the late window: follow lazer tail miss / auto-complete rules from `HoldNoteTail` source, not a “always Perfect if held too long” shortcut unless source does that.

### Health

No continuous drain (`ComputeDrainRate` = 0). HP starts at 1.0, clamped `[0, 1]`, mutates only on judgement results. Exact `ΔHP(result, HPDrainRate)` from `ManiaHealthProcessor.cs` at implement time — do not use invented +0.020 / −0.080 tables.

Fail at 0 unless NF. SD/PF fail according to those mods.

### Scoring

```
total = 150000 * comboProgress
      + 850000 * Accuracy^(2 + 2*Accuracy) * accuracyProgress
      + bonusPortion
```

Accuracy weights: Perfect **305**, Great 300, Good 200, Ok 100, Meh 50, Miss 0. Combo contribution for Perfect is still 300.

```
Accuracy = sum(baseScores) / (305 * judgedObjects)
```

All-Perfect → 1_000_000 (plus bonus portion as in source). Port `bonusPortion` from `ManiaScoreProcessor` / shared standardised processor; do not invent a 300k combo bar.

### Grades

- **SS (X)**: every judgement is Perfect or Great (mania override of `RankFromScore`). Not “must be 100.00% Perfect-only”.
- S ≥ 95%, A ≥ 90%, B ≥ 80%, C ≥ 70%, else D.
- HD / FI / FL → silver S/SS.
- Misses do **not** demote mania S the way they do in standard.

### Unstable Rate

```
UR = 10 * sampleStdDev(hitErrorsMs)
```

Sample standard deviation (`N-1`). Include judged hits that produced an error sample per lazer (typically exclude misses with no hit). Port the exact inclusion set from source.

---

## UI spec (from DESIGN.md + live Argon)

Tokens: `--bg-base #08090D`, cyan `#00F0FF`, pink `#FF007F`, yellow `#FFCC00`, emerald `#00FF66`. Full token table lives in `DESIGN.md`.

Typography: Torus Pro with Inter fallback; Exo 2 tabular for score/acc/combo.

Geometry: outer cards `skewX(-12deg)`, inner content `skewX(+12deg)`. Motion: OutQuint panels, OutElastic combo, BPM-synced logo pulse.

Screens:

1. **Title** — BPM-pulsed logo; **SOLO / SETTINGS / EXIT**. MULTI and EDIT hidden. Top-right profile chip: Guest until OAuth, then real osu mania stats.
2. **Song select** — left carousel of −12° cards; top search + key-count pills; right difficulty panel (BPM, length, OD, HP, keys, objects). **No Global / Friends / Local leaderboard tabs.** Bottom: Back, Mods, Random, Play. API search + catboy download + local import.
3. **Mods overlay** — full lazer mania set listed above.
4. **Playfield** — centered columns, receptors, stage lighting, hit bursts. HUD: health left, progress top, score/acc right, combo + judgement at receptor, hit-error bar at bottom.
5. **Pause / fail** — Retry / Quit. Fail overlay if HP hits 0 without NF.
6. **Results** — rank badge, standardised score, max combo, accuracy, judgement matrix, hit-error histogram, UR. Retry / Continue. Local IndexedDB only.
7. **Settings** — Audio (volumes, universal offset), Graphics (FPS cap, dim, blur, UI scale), Keybinds 2K–9K, Gameplay (scroll speed, up/down).

4K note colors C Y Y C; 7K C B C Y C B C; other key counts from the 1/2/S table.

Song select wireframe (no leaderboard panel):

```
+----------------------------------------------------------------------------------------------------+
| [User Avatar]  Guest | or real osu user                             [ SEARCH ]  [ NOW PLAYING ]   |
+----------------------------------------------------------------------------------------------------+
|  CAROUSEL (−12° Argon cards)                |  DIFFICULTY DETAILS                                  |
|  set cards + difficulties                   |  title, SR, BPM, length, keys, OD, HP, objects       |
|                                             |  (no score list)                                     |
+----------------------------------------------------------------------------------------------------+
| [ BACK ]   [ MODS ]   [ RANDOM ]   [ IMPORT .osz ]                          [ PLAY >>> ]           |
+----------------------------------------------------------------------------------------------------+
```

Playfield renderer sketch (pool sprites; do not allocate in `update`):

```typescript
export class ManiaPlayfieldRenderer {
  public container: Container;
  private keyCount: number;
  private columnWidth = 64;
  private hitPosition = 680;
  private trackHeight = 720;
  private scrollDurationMs = 500;

  public update(currentTime: number, activeNotes: RawHitObject[], scrollCalc: ScrollPositionCalculator): void {
    const currentDist = scrollCalc.getVisualPosition(currentTime);
    for (let i = 0; i < activeNotes.length; i++) {
      const note = activeNotes[i];
      const deltaDist = scrollCalc.getVisualPosition(note.startTime) - currentDist;
      const noteY = this.hitPosition - (deltaDist / this.scrollDurationMs) * this.hitPosition;
      if (noteY >= -50 && noteY <= this.trackHeight + 50) {
        // position from pre-allocated pool
      }
    }
  }
}
```

Visual QA: Playwright screenshot of each screen vs [ppy/osu Argon mania skinning](https://github.com/ppy/osu/tree/master/osu.Game.Rulesets.Mania/Skinning/Argon) and official lazer screenshots. Iterate CSS/canvas until layout, skew, and judgment colors match.

---

## Client storage (IndexedDB)

Local only. Never a substitute for Postgres identity, and never a public leaderboard.

```typescript
export interface StoredBeatmapSet {
  id: string;
  title: string;
  artist: string;
  creator: string;
  coverImageBlob?: Blob;
  audioBlob: Blob;
  beatmaps: StoredBeatmap[];
  dateAdded: number;
}

export interface StoredBeatmap {
  id: string; // MD5 of .osu
  setId: string;
  version: string;
  keyCount: number;
  overallDifficulty: number;
  hpDrainRate: number;
  starRating: number;
  rawOsuContent: string;
}

export interface StoredLocalPlay {
  id?: number;
  beatmapId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  unstableRate: number;
  judgments: {
    perfect: number;
    great: number;
    good: number;
    ok: number;
    meh: number;
    miss: number;
  };
  mods: string[];
  timestamp: number;
}

export class OsuManiaDatabase extends Dexie {
  public beatmapSets!: Table<StoredBeatmapSet, string>;
  public beatmaps!: Table<StoredBeatmap, string>;
  public localPlays!: Table<StoredLocalPlay, number>;

  constructor() {
    super('OsuManiaWebDB');
    this.version(1).stores({
      beatmapSets: 'id, title, artist, creator, dateAdded',
      beatmaps: 'id, setId, keyCount, starRating',
      localPlays: '++id, beatmapId, timestamp',
    });
  }
}
```

`.osz` import: JSZip in memory → Mode 3 `.osu` texts + primary audio Blob + first image as cover → Dexie. Missing audio or zero mania difficulties → error. Videos ignored.

---

## Visual / research loop during implementation

1. Port formulas from ppy source, not wiki-only.
2. Screenshot Argon references (GitHub raw SVGs/PNGs + wiki judgement images).
3. After each UI PR: Vite preview → Playwright `browser_navigate` + `browser_take_screenshot` at 1920×1080 and 390×844; compare tokens, skew, HUD.
4. Vitest fixtures: OD 0/5/10 windows, column edges, score of all-Perfect = 1_000_000, SS with mixed Perfect/Great, ComboBreak on LN release, red timing points do not reset SV.

```typescript
describe('ManiaHitWindows OD Scaling Tests', () => {
  it('computes lazer windows at OD = 5 (not Classic ±16 Perfect)', () => {
    const hw = new ManiaHitWindows(5.0);
    expect(hw.perfect).toBe(19.4);
    expect(hw.great).toBe(49);
    expect(hw.good).toBe(82);
    expect(hw.ok).toBe(112);
    expect(hw.meh).toBe(136);
    expect(hw.miss).toBe(173);
  });
});

describe('Column Coordinate Mapping Tests', () => {
  it('maps 512-space into 4K and 7K', () => {
    const mapToCol = (x: number, k: number) =>
      Math.max(0, Math.min(k - 1, Math.floor((x * k) / 512)));
    expect(mapToCol(0, 4)).toBe(0);
    expect(mapToCol(127, 4)).toBe(0);
    expect(mapToCol(128, 4)).toBe(1);
    expect(mapToCol(256, 4)).toBe(2);
    expect(mapToCol(384, 4)).toBe(3);
    expect(mapToCol(512, 4)).toBe(3);
    expect(mapToCol(256, 7)).toBe(3);
    expect(mapToCol(512, 7)).toBe(6);
  });
});
```

Also: memory profile (zero alloc in the play loop), frame pacing at high density, and do not treat `Date.now()` as the master clock.

---

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

Phase mapping (same work, grouped):

| Phase | Covers PRs | Notes |
| --- | --- | --- |
| Scaffold + audio context | 1 | Vite, Tailwind tokens, Pixi viewport, `vercel.json` |
| Decode + IndexedDB | 3 | Parser, correct SV, JSZip, Dexie |
| Clock + input | 4 | Dual-clock, binds, offset |
| Ruleset | 5 | Windows, LN, score, health, UR, mods |
| Playfield | 6 | Pooled Pixi Argon stage |
| Argon UI suite | 8 | Screens; **no leaderboards**; MULTI/EDIT hidden |
| OAuth + catalog | 2, 7 | Functions + browser catboy |
| Polish / QA | 9 | Playwright, sample chart, 240 FPS check |

Out of v1: MULTI, EDIT, our leaderboard, score submit to osu, mass beatmap harvest.

---

## Key decisions (locked)

1. Lazer mechanics override any leftover brief numbers when they conflict.
2. Pixi playfield / React chrome split; AudioContext master clock.
3. Vercel SPA + Functions (RhythmMania-style). OAuth secret only in Function env.
4. Postgres for identity/tokens only — **no leaderboards**.
5. Maps: official search via Function; catboy `.osz` in the browser; local upload.
6. Solo, 2K–9K, all lazer mania mods, default lazer scoring.
7. Playwright visual QA on every UI surface.

---

## What you need to provide when implementation starts

1. Fill `.env` (and Vercel project env) with `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `OSU_REDIRECT_URI`, `DATABASE_URL`, `SESSION_SECRET`. Do not paste secrets into chat.
2. OAuth callback: local `http://localhost:5173/api/auth/osu/callback`; add the Vercel production URL on the same osu app.
3. Postgres user can `CREATE TABLE` for the three identity tables. No score tables.

---

## References

- [ppy/osu](https://github.com/ppy/osu)
- [ManiaHitWindows.cs](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs)
- [ManiaScoreProcessor.cs](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs)
- [ManiaHealthProcessor.cs](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaHealthProcessor.cs)
- [osu! beatmap file format](https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29)
- [osu!mania judgement](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania)
- [Gameplay differences in osu!(lazer)](https://osu.ppy.sh/wiki/en/Client/Release_stream/Lazer/Gameplay_differences_in_osu%21%28lazer%29)
- [osu! API docs](https://osu.ppy.sh/docs)
- [Web Audio API](https://www.w3.org/TR/webaudio/)
- [Pixi.js v8](https://pixijs.com/)
- This repo: `DESIGN.md` (Argon tokens and screen map)
