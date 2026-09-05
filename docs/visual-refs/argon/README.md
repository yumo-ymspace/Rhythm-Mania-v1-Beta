# Argon visual reference board (osu!lazer client only)

Fair-use **local copies** of public screenshots of the **osu!(lazer) client** used to check RhythmMania UI against lazer **Argon**. Refreshed 2026-09-05: every osu!(stable) still was deleted; no stable-client image remains anywhere under this folder.

**Do not copy these files into `public/`, the Vite bundle, or shipped assets.** Recreate Argon with original canvas/CSS. Do not ship the osu! logo, pink-circle mark, Torus, or `osu-resources` bitmaps. (Some official video thumbnails contain a title-card osu! mark — it is labelled per-slot and is **not** to be copied.)

Pixel-perfect vs `osu.exe` is not required. **Wrong HUD corner, slab-notes instead of Argon pieces, stable-style chrome, or a Global/RM board instead of Local ranking fails the matching visual task.**

## How later tasks use this board

1. `npm run dev`
2. Playwright `browser_navigate` to the local route
3. Exercise the user path
4. Screenshot desktop 1280×720 and mobile 390×844
5. Side-by-side vs the slot below (positions, hierarchy, colour family, spacing)

## Slots

| Slot | Folder | Primary stills | Use for |
|---|---|---|---|
| HUD | [`hud/`](hud/README.md) | Argon song-progress PR stills, 2023.1114 official video thumbnail (mania + combo), hit-windows video timing-bar thumbnail | TASK-052–054 |
| Playfield 4K | [`playfield-4k/`](playfield-4k/README.md) | Lazer gameplay capture from the Argon colour-proposal PR (#22820) + merged Argon hold/note PR stills + shipped 4K colour spec | TASK-050–051 |
| Song select | [`song-select/`](song-select/README.md) | Lazer Song Select V1/V2 client captures from 2025.60x-lazer issue reports + official song-select re-design video thumbnail | TASK-060–062 |
| Results | [`results/`](results/README.md) | No still yet — lazer results videos, redesign Figma, and tracker links (stable stills deleted; capture a lazer `F12` still) | TASK-070 |
| Pause | [`pause/`](pause/README.md) | No public Argon pause still; layout from `ppy/osu` source | TASK-043–044 |

Each slot README lists **source URL, date, what the file is, and a comparison checklist**. Every bitmap is the lazer client; anything else is a labelled link, never a file.

## What is Argon vs what is only structure

- **Argon (use for pixels):** lazer client captures from `ppy/osu` mania Argon PRs/discussions, 2025.60x-lazer Song Select V1/V2 issue-report screenshots, and official lazer-updates video thumbnails.
- **Removed 2026-09-05:** all osu!(stable) wiki Interface stills (song select, footer, leaderboards, mods, main menu, results, mania gameplay). They described stable IA, not lazer chrome, and are gone.

## Source-of-truth links (no bitmap)

| Topic | URL | Retrieved |
|---|---|---|
| Argon HUD layout | https://github.com/ppy/osu/blob/master/osu.Game/Skinning/ArgonSkin.cs | 2026-08-30 |
| Argon mania transformer / column colours | https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Skinning/Argon/ManiaArgonSkinTransformer.cs | 2026-08-30 |
| Hold visual (darkened tail) | https://github.com/ppy/osu/pull/22402 | 2023-02-02 |
| Argon mania gameplay + colour proposal (shipped) | https://github.com/ppy/osu/pull/22820 | 2023-03-09 |
| Column colour proposal (shipped) | https://github.com/ppy/osu/discussions/21996 | 2023-04-04 / PR #23769 2023-06-07 |
| HUD counters + wedges | https://github.com/ppy/osu/pull/25226 | 2023-11-12 |
| Health bar | https://github.com/ppy/osu/pull/24980 | 2023-10-03 |
| Song progress | https://github.com/ppy/osu/pull/22144 | 2023-01-18 |
| Pause overlay | https://github.com/ppy/osu/blob/master/osu.Game/Screens/Play/PauseOverlay.cs and `GameplayMenuOverlay.cs` | 2026-08-30 |
| Official HUD video | https://www.youtube.com/watch?v=7MYYjseY-Do (changelog 2023.1114.0) | 2023-11-14 |
| Song Select V2 (small UI scaling report) | https://github.com/ppy/osu/issues/33462 (2025.605.3-lazer) | 2025-06-05 |
| Song Select V2 (mania 4K wedge) | https://github.com/ppy/osu/issues/33902 (2025.607.0-lazer) | 2025-06-27 |
| Song Select V1 vs V2 screenshots | https://github.com/ppy/osu/issues/34040 (2025.607.0-lazer) | 2025-07-06 |
| Song select re-design video | https://www.youtube.com/watch?v=H_a5Cqv7Tok | 2025-06-05 |
| Hit-windows video (timing bar) | https://www.youtube.com/watch?v=wkLweSoz9YQ | 2025-07-12 |
| Results redesign Figma | https://www.figma.com/design/a85wCm9QKEsCPo0C4lt9x9/Client-Result-Screen (via r/osugame Sep 2025) | 2025-09-05 |
| Results design tracker | https://github.com/ppy/osu/issues/24996 | 2026-09-05 |

osu.ppy.sh changelog HTML itself is login-walled; use the GitHub issues/PRs and the YouTube thumbnails instead.

## Global pass/fail (all visual tasks)

**Pass**

- Notes are short rounded Argon pieces with a bright top lip / arrow, not full-lane neon slabs
- 4K colours follow the shipped Argon table (see playfield slot)
- HUD: health top-left, score on wedges, accuracy (and PENAR) top-right, combo bottom-left, dual hit-error, progress bottom
- Song select: lazer V2 wedge + carousel + **Local** ranking only + Back / Mods / Random / Options
- Results: large grade, Perfect→Miss column (lazer names), PENAR, Retry / Replay / Back
- Pause: dim overlay, Continue / Retry / Exit, ~200 ms fade

**Fail**

- Slab notes, HUD in the old RM toast corners, “pp” label, Global/Country/RM boards, osu! wordmark, **any stable-client chrome**
