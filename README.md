<div align="center">

```
██████╗ ██╗  ██╗██╗   ██╗████████╗██╗  ██╗███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██╗ █████╗
██╔══██╗██║  ██║╚██╗ ██╔╝╚══██╔══╝██║  ██║████╗ ████║████╗ ████║██╔══██╗████╗  ██║██║██╔══██╗
██████╔╝███████║ ╚████╔╝    ██║   ███████║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║███████║
██╔══██╗██╔══██║  ╚██╔╝     ██║   ██╔══██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║██╔══██║
██║  ██║██║  ██║   ██║      ██║   ██║  ██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
```

**RhythmMania** · v1 Beta

Browser-native vertical-scroll rhythm game (osu!mania-style, mode 3 only, **1K–10K**).

### 🕹️ Play Now : **[https://www.rhythm-mania.com/](https://www.rhythm-mania.com/)**

[![License: PolyForm Perimeter](https://img.shields.io/badge/License-PolyForm_Perimeter-green)](https://polyformproject.org/licenses/perimeter/1.0.1)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

RhythmMania is an **18+ service**. Minors may not use the game, even with parental permission. See the [Terms of Service](https://terms-of-service.rhythm-mania.com) and [Privacy Policy](https://privacy-policy.rhythm-mania.com).

## What it is

Hit notes on a vertical playfield in time with music. Import `.osu` / `.osz` / `.zip` mania maps locally, or browse the online catalog (no login). Scores, replays, and settings are **local-only** — there are no accounts, no server leaderboards, and no replay uploads.

- **Playfield:** single WebGL2 renderer (batched quads), equal-width lanes, upscroll/downscroll, scroll speed `5–80` (default `21`).
- **Skins:** `argon` (default), `rhythmplus`, `rhythmplus-dynamic`.
- **Audio:** Web Audio gameplay clock, pre-decoded instant menu sounds, song previews while browsing, optional background video with PI drift sync.
- **Routes:** `/` menu, `/select`, `/play`, `/results`, `/history`. Unknown and legacy `/profile/*`, `/settings`, and `/skins` routes fall back to menu.

## Quick start

| Purpose | Command |
| --- | --- |
| Dev | `npm run dev` (port 3000) |
| Typecheck | `npm run lint` |
| Build | `npm run build` |
| Tests | `npm test` (Vitest, Node) |

Stack: React 19 + Vite 8 + Tailwind 4 + TypeScript 5.9 (strict), JSZip, Motion, Lucide, SparkMD5. PWA via `public/sw.js` + manifest.

## Beatmaps

Parser accepts osu! mode 3 only, 1K–10K. Local files go to IndexedDB; catalog sets stream in-browser from `catboy.best/d/<id>` with Nekoha fallback (the API never serves bytes).

Import limits: 100 MiB compressed, 250 MiB extracted, 500 entries, 80 MiB/entry, 20k notes, 5k timing points, 2 MiB `.osu`, 2048-char URLs.

## Gameplay

Six judgements (displayed as Perfect / Great / Good / Ok / Meh / Miss) with OD-interpolated lazer windows, scaled by HR (×1.4), EZ (÷1.4), and rate mods (DT/NC 1.5×, HT/DC 0.75×). Classic (CL) mod uses stable formulas.

| Judgement | Score | HP |
| --- | ---: | ---: |
| Perfect (marvelous) | 305 | +3 |
| Great (perfect) | 300 | +2 |
| Good (great) | 200 | +1 |
| Ok (good) | 100 | +0.2 |
| Meh (bad) | 50 | −3 |
| Miss | 0 | −10 |

HP is scaled by drain rate (0.8× when `hpDrainRate > 5`, else 1.2×; EZ ×0.5, HR ×1.4). Grades SS–F; F = HP depletion. Holds use lazer v3 rules with 1.5× tail lenience.

Mods include EZ NF HT DC HR SD PF DT NC FI HD Cover FL AT CN RD MR DA CL IN CS HO WU WD MU AS, plus `K1`–`K10` key conversion (`_converted_<N>k`). AT+CN is autoplay and is never recorded. Score multipliers: NF/EZ 0.5, HT/DC 0.3, CS/HO/NR/K 0.9, DA/WU/WD/AS 0.5, CN 0.0, rest 1.0.

Replays are timestamped lane frames (schema v3, 1M local frame cap), exportable as a `rhythmmania-replay-export` envelope (64 MiB / 500 records per import, always local-only).

## Settings & storage

Settings sections: General, Gameplay, Visual, Audio, Input, Miscellaneous. Notable defaults: 4K (`D F J K`), scroll `21`, offsets `0 ms`, playfield width `40%`, `renderDpr 1.5`, skin `argon`.

| Store | Data |
| --- | --- |
| IndexedDB `RhythmManiaDB` v6 | `beatmaps`, `packages`, `backgrounds` |
| `rhythm_mania_v1_settings` | Game settings |
| `rhythm_mania_v1_play_history` | Local scores + replay frames (limit default 50) |
| `rhythm_mania_v1_*` | `custom_maps` (legacy), `last_selected_map_id`, `last_diff_by_song`, `favorite_songs`, `catalog_set_metadata`, `mod_presets` |

## API

No database, no auth, no uploads. Three read-only endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `ok`, version, timestamp, environment |
| `GET /api/config` | Mode `[3]`, local leaderboards/replays, catalog + custom maps on |
| `GET /api/catalog/search` | `q` (required, ≤100 chars), `s` = ranked/loved/graveyard/any; catboy.best primary, Nekoha fallback |

## Project structure

```text
api/_lib/       env, mirrorCatalog, response, replayVerification
api/config.ts, api/health.ts, api/catalog-router.ts, api/catalog/_search.ts
public/         avatars/, backgrounds/, icons/, fonts/, sounds/, skin/, beatmaps/, cursor/, sw.js, manifest
src/            App.tsx, audio/, components/ (+settings/), render/, ruleset/mania/, ui/lazer/, utils/, types.ts
tests/          Node-only Vitest (~47 files)
```

`GameplayCanvas.tsx` owns live + replay sessions. Shared playfield math lives in `src/render/`; the sole renderer is `WebGL2PlayfieldRenderer`.

---

## License

Licensed under the [PolyForm Perimeter License 1.0.1](LICENSE.md). Community beatmaps, audio, and video may be third-party content. Privacy: `privacy@rhythm-mania.com`. Copyright: `copyright@rhythm-mania.com`.
