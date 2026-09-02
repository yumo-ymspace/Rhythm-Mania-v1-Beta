# Slot: pause / fail

No public Argon pause screenshot was found (wiki has none; GitHub `PauseOverlay` issues did not attach a full overlay still; changelog pages require login). **Visual target is the executable layout in `ppy/osu`**, not a bitmap.

Sources (retrieved 2026-08-30):

- https://github.com/ppy/osu/blob/master/osu.Game/Screens/Play/PauseOverlay.cs
- https://github.com/ppy/osu/blob/master/osu.Game/Screens/Play/GameplayMenuOverlay.cs
- Fail overlay is the same container without Continue (`OnResume` omitted)

## Layout to match (from source)

- Full-screen black dim, alpha **0.75**
- Fade in/out **200 ms**
- Header: yellow, Torus-like geometric sans, size ~48, centred (“paused” / fail equivalent)
- Buttons stacked, height **80**, horizontal padding 50, 2px gap:
  1. **Continue** — green (`OnResume`) — pause only
  2. **Retry** — dark yellow
  3. **Quit / Exit** — `rgb(170, 27, 39)`
- Under buttons: retry count, song progress %, accuracy
- Back / Esc on pause triggers **Continue** (first button), not quit
- Overlay blocks playfield interaction; playfield may remain visible under the dim

## Comparison checklist (TASK-043–044)

- [ ] Esc opens this overlay; no on-canvas pause toast cluster
- [ ] Continue / Retry / Exit (fail: Retry / Exit only)
- [ ] Dimmed playfield, not a separate opaque settings page
- [ ] ~200 ms fade; respect `prefers-reduced-motion`
- [ ] No Google/upload chrome on the overlay
