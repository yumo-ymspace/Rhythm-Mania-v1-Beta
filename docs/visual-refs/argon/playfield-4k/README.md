# Slot: playfield 4K (osu!lazer client only)

Target: Argon mania notes / holds / keys / colours as shipped after [PR #22402](https://github.com/ppy/osu/pull/22402) (2023-02-02) and [PR #23769](https://github.com/ppy/osu/pull/23769) (2023-06-07). The stable `mania-gameplay.jpg` that used to live here was **deleted on 2026-09-05** — every file below is the lazer client.

## Files

| File | Source | Date | What to look at |
|---|---|---|---|
| `lazer-argon-mania-gameplay.png` | https://user-images.githubusercontent.com/191335/224012994-2e01f7f9-18b2-449e-b2ef-af1ae2a68d20.png from [PR #22820](https://github.com/ppy/osu/pull/22820) | 2023-03-09 | **Lazer client gameplay** built from the colour proposal: chevron notes with bright lip, coloured holds, centre judgement (`PERFECT`), score + live PP counter on top. Confirms lazer-only HUD pieces (live PP) alongside the note shapes |
| `argon-holds-downscroll.png` | https://user-images.githubusercontent.com/19603573/216203359-fabdd5c5-b80d-40ac-bb8d-b943bb2b55c1.png from PR #22402 (merged look) | 2023-02-02 | Downscroll: rounded head + white lip, hold body, **darkened tail**, arrow on head, receptor line, oval key lights |
| `argon-holds-upscroll.png` | https://user-images.githubusercontent.com/19603573/216203453-b1e6fa0b-0a2d-4a70-9a09-2e31b000f217.png from PR #22402 | 2023-02-02 | Same pieces, arrow/lip flip with scroll |
| `argon-holds-peppy-downscroll.png` | https://user-images.githubusercontent.com/191335/215730902-727e2aba-f832-4226-a4b2-31a56134280b.png from PR #22402 | 2023-01-31 | Close-up of head lip vs tail; white bar toward judgement |
| `argon-column-colours-1k-10k.png` | https://user-images.githubusercontent.com/50823728/229692176-58358cf1-6ee2-47b8-b16e-252ccdc70bd7.png — [discussion #21996](https://github.com/ppy/osu/discussions/21996) (peppy: shipped in #23769) | 2023-04-04 | **Shipped** 1K–10K colour rows. 4K = yellow / orange / pink / purple |
| `argon-column-colour-spec.png` | https://user-images.githubusercontent.com/50823728/218038463-b450f46c-ef21-4551-b133-f866be59970c.png (linked from `ManiaArgonSkinTransformer.cs`) | 2023-02-10 | Earlier colour + note-shape spec; use #21996 still for colours |
| `argon-notes.png` | https://user-images.githubusercontent.com/7066150/194705246-d0b8ecbb-e950-4514-b57c-d9e2a89e7e7b.png from [issue #20978](https://github.com/ppy/osu/issues/20978) | 2022-10-28 | Full 4K Argon stage: note shape, receptors, keys, dim cover. **HUD on this shot is pre-wedge** |

Transformer accent RGBs (recreate, do not copy sprites): special `169,106,255`; yellow `255,197,40`; orange `252,109,1`; pink `213,35,90`; purple `203,60,236`; cyan `72,198,255`; green `100,192,92`.

## Comparison checklist (TASK-050–051)

- [x] Notes are short rounded bodies with a bright top edge / 3D lip, **not** glowing full-lane slabs
- [x] 4K column colours: yellow, orange, pink, purple (left→right), matching `argon-column-colours-1k-10k.png`
- [x] Hold: distinct head, body, **darker tail** (no extra sprite on the end)
- [x] Body masks as it passes the receptor while held
- [x] Hit target is a thin receptor bar; keys are dim capsules that light on press
- [x] Stage cover is dim; beatmap art is not a bright full-bleed over notes
- [x] Judgement text centred on the stage, not a corner toast
- [x] No stable-skin stage art anywhere in this slot
