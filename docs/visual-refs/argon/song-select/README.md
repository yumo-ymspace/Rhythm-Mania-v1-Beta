# Slot: song select

No public **Argon/lazer** song-select screenshot was available without osu.ppy.sh login (changelog HTML is gated). These wiki stills are **osu!(stable) Interface** and are only for **information architecture**: carousel, info wedge, ranking panel, bottom tools.

Lazer Argon restyles the same regions (full-bleed cover + blur, wedge stats, **Local** board, Mods / Random / Options / Play). Do not copy stable pink cookie, Default skin panels, or Global ranking as the shipped look.

## Files

| File | Source | Date | What to look at |
|---|---|---|---|
| `wiki-stable-song-selection.jpg` | https://raw.githubusercontent.com/ppy/osu-wiki/master/wiki/Client/Interface/img/song-selection.jpg — [wiki Interface](https://osu.ppy.sh/wiki/en/Client/Interface) | wiki / retrieved 2026-08-30 | Full select: metadata top-left, ranking left, carousel right, footer tools |
| `wiki-stable-carousel.jpg` | …/img/beatmap-cards.jpg | same | Set cards vs expanded diffs |
| `wiki-stable-footer.jpg` | …/img/gameplay-toolbox.jpg | same | Back / Mode / Mods / Random / Options / Play |
| `wiki-stable-leaderboards.jpg` | …/img/leaderboards.jpg | same | Ranking panel chrome (we keep **Local only**) |
| `wiki-stable-mods.jpg` | …/img/game-modifiers.jpg | same | Mod overlay as a separate surface |
| `wiki-stable-main-menu.jpg` | …/img/main-menu.jpg | same | Menu IA only (TASK-080 later) |

## Comparison checklist (TASK-060–062)

- [ ] Full-bleed cover with light blur behind UI
- [ ] Carousel of sets; selected set expands to difficulty pills
- [ ] Info wedge: OD / HP / SR / BPM / length / keys
- [ ] Ranking panel is **Local** (this device’s scores, score desc). No Global / Country / RM tabs
- [ ] Empty state when the chart has no local plays
- [ ] Bottom: **Mods / Random / Options / Play** (Mode may stay as mania-only)
- [ ] Mod overlay: categories, incompatibility, live multiplier
- [ ] No Google/account chip required to browse or play local maps
