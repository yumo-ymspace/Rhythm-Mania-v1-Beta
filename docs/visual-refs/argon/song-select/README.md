# Slot: song select (osu!lazer client only)

All stills in this folder are captured from the **lazer client** (2025.60x-lazer issue reports and the official lazer-updates video series). The osu!(stable) wiki stills that used to live here were **deleted on 2026-09-05** — do not re-add stable screenshots; compare against lazer only.

## Files

| File | Source | Date | What to look at |
|---|---|---|---|
| `lazer-song-select-v2-mania-4k.png` | [ppy/osu#33902](https://github.com/ppy/osu/issues/33902) (2025.607.0-lazer) | 2025-06-27 | **Primary mania ref.** V2 wedge top-left for a 4K map: LOCAL tag, Notes / Hold Notes / Key Count / Approach Rate / Accuracy / HP Drain stats, Details / Ranking tabs, Scope selector. Right carousel with `[4K]` difficulty pills + star pills. Footer Back / Mods / Random / Options. Note the "Leaderboards are not available for this beatmap!" empty state |
| `lazer-song-select-v2-leaderboard.png` | [ppy/osu#33462](https://github.com/ppy/osu/issues/33462) (2025.605.3-lazer) | 2025-06-05 | V2 fullscreen leaderboard (rank, max combo, accuracy, score, grade pills) + right carousel with expanded difficulties. Reporter drew red annotations — ignore the red line/arrow, compare the client chrome |
| `lazer-song-select-v2-carousel.png` | [ppy/osu#33462](https://github.com/ppy/osu/issues/33462) (2025.605.3-lazer) | 2025-06-05 | Expanded-set carousel rows with per-difficulty star pills, Details / Local / Global / Country / Friend / Team scope tabs, personal-best row, bottom back / mods / random / options bar. Red annotation is the reporter's |
| `lazer-song-select-v1.png` | [ppy/osu#34040](https://github.com/ppy/osu/issues/34040) (2025.607.0-lazer) | 2025-07-06 | Reporter-labelled **Song Select V1** (lazer's previous select, not stable): banner wedge, stat sliders, left leaderboard, right card carousel, bottom mods / random / options |
| `lazer-song-select-v2.png` | [ppy/osu#34040](https://github.com/ppy/osu/issues/34040) (2025.607.0-lazer) | 2025-07-06 | Reporter-labelled **Song Select V2**: full-bleed cover, right-side difficulty pills. This shot was taken with an OS screenshot tool so some V2 elements are missing (that is the reported bug) — use the other V2 stills for full chrome |
| `lazer-updates-song-select-redesign-thumb.jpg` | `i.ytimg.com/vi/H_a5Cqv7Tok/maxresdefault.jpg` — [lazer updates: the song select re-design](https://www.youtube.com/watch?v=H_a5Cqv7Tok) | 2025-06-05 | Official title card; the blurred background is the V2 client (left leaderboard, right carousel, footer). The big osu! logo/title overlay is **not** to be copied |

## Lazer V2 information architecture (what to match)

- Top-left **wedge**: set title/artist, mapper, stats row. For mania: Notes, Hold Notes, Key Count, AR, OD/Accuracy, HP.
- **Details / Ranking tabs** with a Scope selector (our client keeps **Local** scope only).
- Top filter bar: search, star-rating range, Sort / Group / Collection dropdowns.
- Right **carousel**: sets expand to per-difficulty pills with star ratings.
- Footer: **Back / Mods / Random / Options** (and the osu! cookie start button).
- Ranking panel shows score, max combo, accuracy, grade per row; empty state when the chart has no plays.

## Comparison checklist (TASK-060–062)

- [x] Full-bleed cover with light blur behind UI
- [x] Wedge with mania stats (Notes / Hold Notes / Key Count / Approach Rate / Accuracy / HP Drain), not stable's metadata block
- [x] Carousel of sets; selected set expands to difficulty pills with stars
- [x] Ranking panel is **Local** (this device's scores, score desc). No Global / Country / RM tabs
- [x] Empty state when the chart has no local plays
- [x] Bottom: **Back / Mods / Random / Options**
- [x] Mod overlay: categories, incompatibility, live multiplier (TASK-061)
- [x] No Google/account chip required to browse or play local maps
- [x] No stable Default-skin panels, pink cookie art, or stable footer chrome
