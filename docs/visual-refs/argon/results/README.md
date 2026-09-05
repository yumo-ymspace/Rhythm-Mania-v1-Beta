# Slot: results (osu!lazer client only)

The osu!(stable) wiki stills that used to live here were **deleted on 2026-09-05** — do not re-add stable screenshots; compare against the lazer client only.

No public still image of the shipped lazer results screen has been captured yet (lazer results captures on the tracker are videos). Until a still is captured, use the linked lazer sources below plus a live lazer client.

## Lazer sources (no bitmap — open the links)

| Source | What it is | What to look at |
|---|---|---|
| [ppy/osu#33435](https://github.com/ppy/osu/issues/33435) (video, 2025.607.0-lazer) | Lazer results screen with local scores | Score panel layout, local-score rows, duplicate-row bug context |
| [ppy/osu#35060](https://github.com/ppy/osu/issues/35060) (video, 2025.912.0-lazer) | Lazer results action bar | How the bottom action bar presents itself |
| [Client result screen Figma](https://www.figma.com/design/a85wCm9QKEsCPo0C4lt9x9/Client-Result-Screen) via [r/osugame Sep 2025](https://www.reddit.com/r/osugame/comments/1m18vvx/new_iteration_of_lazer_result_screen_design/) | In-progress official lazer results redesign (mania grade circle, judgement stats, extended panel) | Direction of travel: grade hero ring, Perfect→Miss column, extended stats |
| [ppy/osu#24996](https://github.com/ppy/osu/issues/24996) | "Results screen design sucks" tracker + osu-web port proposal | Why the current screen is under redesign; do not copy the osu-web proposal bitmap as client chrome |
| [ppy/osu#30436](https://github.com/ppy/osu/discussions/30436) | Community lazer design review (song select + results, current and proposed) | Layout critique of the shipped results screen vs proposals |

## Wanted

Capture a still of the shipped lazer results screen (lazer `F12`) for a mania play and store it here as `lazer-results-mania.png` with source URL + version. Any capture must be the lazer client, never stable.

## Comparison checklist (TASK-070)

- [ ] Large grade display as the hero (SS/S/A/…)
- [ ] Score, accuracy, max combo, mods visible without hunting
- [ ] Judgement column uses **Perfect → Great → Good → Ok → Meh → Miss** (not Marvelous/Perfect/Great/Good/Bad, not stable MAX/300/200)
- [ ] Hit-error graph present
- [ ] PENAR shown as `—` while stubbed, never “pp”
- [ ] Actions: Retry / Replay / Back
- [ ] Any score list is **this device only**
- [ ] No stable Default ranking-panel art
