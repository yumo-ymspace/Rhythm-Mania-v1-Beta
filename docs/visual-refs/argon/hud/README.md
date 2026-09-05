# Slot: HUD (osu!lazer client only)

Target: lazer Argon **after** 2023.1114 (`ArgonSkin.GetDrawableComponent` / PR #25226). Combo sits bottom-left; accuracy and the PP counter (we label **PENAR**) sit top-right. An older 2022 playfield still in `../playfield-4k/argon-notes.png` shows score/acc **on the stage** — that HUD placement is obsolete.

## Files

| File | Source | Date | What to look at |
|---|---|---|---|
| `argon-song-progress-bar.png` | https://user-images.githubusercontent.com/191335/212855847-d8170579-4d1a-4f53-947f-13577782646d.png from [PR #22144](https://github.com/ppy/osu/pull/22144) (peppy) | 2023-01-17 | Bottom Argon progress: time label, rounded white fill, density graph behind |
| `argon-song-progress-additive.png` | https://user-images.githubusercontent.com/39100084/212154037-e09ff6bc-78bd-451a-b533-8820bcf345bd.png from PR #22144 | 2023-01-12 | Segmented density (past dim, future tinted); time at right |
| `official-video-2023-1114-hud.jpg` | https://i.ytimg.com/vi/7MYYjseY-Do/maxresdefault.jpg — [lazer updates 2023-11-14](https://www.youtube.com/watch?v=7MYYjseY-Do) | 2023-11-14 | Official still: Argon 4K notes on a phone; **combo bottom** (`533x`); playfield colours. Title-card osu! mark is **not** to be copied |
| `lazer-timing-bar-thumb.jpg` | https://i.ytimg.com/vi/wkLweSoz9YQ/maxresdefault.jpg — [lazer updates: inconsistent hit windows](https://www.youtube.com/watch?v=wkLweSoz9YQ) | 2025-07-12 | Official title card whose foreground is the lazer timing distribution bar (Early … Late with window colour segments). Title text/logo overlay is **not** to be copied; compare the bar's segment colours and Early/Late labelling against our hit-error meter |

Hotlink of PR #22144’s full gameplay PNG (`211904333-…png`) returned HTTP 403 on 2026-08-30; use the two progress stills plus the video thumbnails.

Layout numbers from `ArgonSkin.cs` (2026-08-30 master), not from the 2022 still:

- Health: top-left `ArgonHealthDisplay`, ~300×30, ~(50, 20), short accent line
- Two `ArgonWedgePiece` ~380×72 behind score (second offset 4,5)
- Score: `ArgonScoreCounter`, no “Score” label, origin top-right on the wedges
- Accuracy: top-right ~(−20, 20)
- PP / **PENAR**: under accuracy (`accuracy.Y + DrawHeight + 10`), scale ~0.8
- Song progress: bottom, scale X 0.9
- Key counter: bottom-right, above progress
- Combo: bottom-left, scale 1.3
- Two `BarHitErrorMeter`s, centre-left and centre-right (right X-flipped)

## Comparison checklist (TASK-052–054)

- [x] Health is a short horizontal bar **top-left**, not a side drain
- [x] Score sits on stacked **wedges**, tabular digits, no “Score” caption
- [x] Accuracy **top-right**; PENAR directly under it; never labelled “pp”
- [x] Combo **bottom-left**, large
- [x] Hit-error: **two** vertical bars, left and right of the stage
- [x] Progress bar full-width bottom; density optional
- [x] Key counter bottom-right
- [x] Judgement pop ~180px above receptor, ~25px type (`DefaultManiaJudgementPiece`)
- [x] No Home/Fullscreen/Pause cluster on the playfield (Esc + overlay)
