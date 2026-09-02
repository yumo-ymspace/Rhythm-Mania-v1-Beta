# Argon visual reference board (lazer mania)

Fair-use **local copies** of public screenshots used to check RhythmMania UI against osu!(lazer) **Argon**. Captured 2026-08-30.

**Do not copy these files into `public/`, the Vite bundle, or shipped assets.** Recreate Argon with original canvas/CSS. Do not ship the osu! logo, pink-circle mark, Torus, or `osu-resources` bitmaps.

Pixel-perfect vs `osu.exe` is not required. **Wrong HUD corner, slab-notes instead of Argon pieces, or a Global/RM board instead of Local ranking fails the matching visual task.**

## How later tasks use this board

1. `npm run dev`
2. Playwright `browser_navigate` to the local route
3. Exercise the user path
4. Screenshot desktop 1280×720 and mobile 390×844
5. Side-by-side vs the slot below (positions, hierarchy, colour family, spacing)

## Slots

| Slot | Folder | Primary stills | Use for |
|---|---|---|---|
| HUD | [`hud/`](hud/README.md) | Argon song-progress bars; 2023.1114 official video still (mania + combo) | TASK-052–054 |
| Playfield 4K | [`playfield-4k/`](playfield-4k/README.md) | Merged Argon hold/note PRs + 4K colour spec | TASK-050–051 |
| Song select | [`song-select/`](song-select/README.md) | osu-wiki Interface stills (**stable IA**, not Argon chrome) | TASK-060–062 |
| Results | [`results/`](results/README.md) | osu-wiki mania ranking still (**stable**, judgement names differ) | TASK-070 |
| Pause | [`pause/`](pause/README.md) | No public Argon pause still found; layout from `ppy/osu` source | TASK-043–044 |

Each slot README lists **source URL, date, what the file is, and a comparison checklist**.

## What is Argon vs what is only structure

- **Argon (use for pixels):** GitHub stills from `ppy/osu` mania Argon PRs/discussions, plus the official 2023.1114 video thumbnail that shows Argon mania notes and bottom combo.
- **Stable wiki (use for information architecture only):** song select carousel / footer / ranking panel, mania results grade hero. Lazer Argon restyles these; do not copy stable Default skin chrome.

## Source-of-truth links (no bitmap)

| Topic | URL | Retrieved |
|---|---|---|
| Argon HUD layout | https://github.com/ppy/osu/blob/master/osu.Game/Skinning/ArgonSkin.cs | 2026-08-30 |
| Argon mania transformer / column colours | https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Skinning/Argon/ManiaArgonSkinTransformer.cs | 2026-08-30 |
| Hold visual (darkened tail) | https://github.com/ppy/osu/pull/22402 | 2023-02-02 |
| Column colour proposal (shipped) | https://github.com/ppy/osu/discussions/21996 | 2023-04-04 / PR #23769 2023-06-07 |
| HUD counters + wedges | https://github.com/ppy/osu/pull/25226 | 2023-11-12 |
| Health bar | https://github.com/ppy/osu/pull/24980 | 2023-10-03 |
| Song progress | https://github.com/ppy/osu/pull/22144 | 2023-01-18 |
| Pause overlay | https://github.com/ppy/osu/blob/master/osu.Game/Screens/Play/PauseOverlay.cs and `GameplayMenuOverlay.cs` | 2026-08-30 |
| Official HUD video | https://www.youtube.com/watch?v=7MYYjseY-Do (changelog 2023.1114.0) | 2023-11-14 |
| Wiki Interface (stable IA) | https://osu.ppy.sh/wiki/en/Client/Interface | 2026-08-30 |

osu.ppy.sh changelog HTML itself is login-walled; use the GitHub PRs and the YouTube still instead.

## Global pass/fail (all visual tasks)

**Pass**

- Notes are short rounded Argon pieces with a bright top lip / arrow, not full-lane neon slabs
- 4K colours follow the shipped Argon table (see playfield slot)
- HUD: health top-left, score on wedges, accuracy (and PENAR) top-right, combo bottom-left, dual hit-error, progress bottom
- Song select: carousel + info wedge + **Local** ranking only + Mods / Random / Options / Play
- Results: large grade, Perfect→Miss column (lazer names), PENAR, Retry / Replay / Back
- Pause: dim overlay, Continue / Retry / Exit, ~200 ms fade

**Fail**

- Slab notes, HUD in the current RM toast corners, “pp” label, Global/Country/RM boards, osu! wordmark
