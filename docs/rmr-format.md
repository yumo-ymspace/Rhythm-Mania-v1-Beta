# `.rmr` File Reference

`.rmr` (MIME `application/x-rhythmmania-replay`) is a single UTF-8 JSON
document. It contains an **envelope** wrapping one or more **replay
records**. It stores score metadata + input frames only — no audio,
video, background, or chart data is embedded.

```
<envelope>
└─ records[]
   ├─ <record>            chart identity, score summary, provenance
   │  ├─ scoreState       full judgement breakdown
   │  ├─ replayFrames[]   timestamped lane states (the replay itself)
   │  ├─ recordedSettings settings snapshot
   │  └─ clientInfo       recording device info
   └─ <record> ...
```

---

## Envelope

Top-level object of the file.

| Field | Type | Value |
| --- | --- | --- |
| `format` | string | Always `"rhythmmania-replay-export"`. Identifies the file kind. |
| `schemaVersion` | integer | Replay schema version. Currently `3`. Older files may contain `2` or `1` (legacy records, migrated on import). |
| `exportedAt` | integer | Unix time in **milliseconds** (`Date.now()`) of when the file was exported. Informational only. |
| `records` | array | One or more replay records (see below). Single-run exports contain exactly one. |
| `exporter` | object \| null | Device info of the exporter, same shape as record `clientInfo`. `null` if collection failed. |
| `sourceSetIds` | integer[] (optional) | Unique catalog set ids (e.g. `[574811]`) present in this export, max 100. Convenience index only. Omitted when empty. |

### `schemaVersion` values

| Value | Indicates |
| --- | --- |
| `3` | Current. Record carries extended metadata (`sourceSetId`, `sourceChartId`, `beatmapDifficulty`, `playedBy`, `clientInfo`). |
| `2` | Previous generation. Has catalog identity fields but no extended export metadata. |
| `1` / missing | Legacy record. Minimal fields; hash/catalog identity are reconstructed on import when possible. |

---

## Record

Each entry of `records[]`.

### Chart identity

| Field | Type | Value |
| --- | --- | --- |
| `id` | string (≤ 50) | Unique record id. Live runs use `play_<ms>_<random>`, e.g. `"play_1787418027969_3b3dov9hg"`. |
| `timestamp` | integer | Run finish time, Unix **milliseconds**. Clamped to `0..2000000000000`. |
| `beatmapId` | string (≤ 100) | Played chart id. K-mod conversions append a `_converted_Nk` suffix (e.g. `..._converted_7k`) and no longer match the original chart. |
| `beatmapTitle` | string (≤ 100) | Song title. |
| `beatmapArtist` | string (≤ 100) | Song artist. |
| `beatmapDifficulty` | string (≤ 100, optional) | Difficulty name, e.g. `"Insane"`. Used to match the chart on import. |
| `keyCount` | integer | Lane count. Valid values `1..10`; anything else falls back to `4`. |
| `beatmapHash` | string (optional) | Local chart fingerprint. `fnv_<16 hex>` = hash of the `.osu` file text; `meta_<16 hex>` = hash of `title\|artist\|creator\|difficulty\|keyCount\|noteCount\|duration` when no file text exists. Prefix tells you which source was hashed. |
| `checksum` | string (≤ 128, optional) | Catalog `.osu` MD5 for online charts. |
| `checksumAlgorithm` | string (optional) | `"md5"` or `"sha256"`. Tells you how to interpret `checksum`. |
| `catalogSetId` | string \| null | Catalog set id, e.g. `"osuapi_12345"`. `null` = local/imported map, not an online chart. |
| `catalogMapId` | string \| null | Catalog chart id, e.g. `"osuapi_12345_b67890_<md5>"`. `null` = local map. |
| `chartRevisionId` | string \| null | Server chart-revision identity. `null` = no server revision. |
| `isServerCatalogMap` | boolean | `true` = this record points at a registered online chart revision. `false` = local map (also `false` for K-mod conversions, which break the revision match). |
| `sourceSetId` | integer \| null | Numeric catalog set id, e.g. `574811`. `null` for local maps. |
| `sourceChartId` | integer \| null | Numeric catalog chart id, e.g. `1217397`. `null` for local maps. |

### Score summary

| Field | Type | Value |
| --- | --- | --- |
| `score` | integer `0..1000000000` | Final score (combo portion + accuracy portion, times mod multiplier). |
| `accuracy` | number `0..100` | Accuracy percentage. Judgement weights: marvelous 305, perfect 300, great 200, good 100, bad 50, miss 0. |
| `maxCombo` | integer `0..100000` | Best combo reached. |
| `grade` | string | Rank letter (see grade table below). |
| `isFailed` | boolean | `true` = the run failed (HP hit 0). NF runs report `false`. |
| `mods` | string[] | Active mods (see mod table below). `[]` = no mods. |
| `recordedSettings` | object (optional) | Snapshot of the gameplay settings in effect (scroll speed, offsets, …). Display/audio only — timing was judged on the audio clock. |
| `playedBy` | string \| null (≤ 80) | Device-local display name. This is **not an account** — just a label typed into settings. `null` when unset. |

### `grade` values

Computed from accuracy + judgement counts (`scoreProcessor.ts:176`).
`failed` overrides everything.

| Value | Indicates |
| --- | --- |
| `SS` | 100% accuracy, **or** only marvelous/perfect judgements (no great/good/bad/miss). Perfect play. |
| `S` | Accuracy ≥ 95% (but not SS). |
| `A` | Accuracy ≥ 90%. |
| `B` | Accuracy ≥ 80%. |
| `C` | Accuracy ≥ 70%. |
| `D` | Accuracy below 70%. Cleared but poor. |
| `F` | Failed run (HP depleted). Always `F` when failed, regardless of accuracy. |

### `mods` values

Each string in `mods[]` is one active mod. Score multipliers from
`MOD_SCORE_MULTIPLIERS` (`modifiers.ts:34`).

| Value | Indicates | Score × |
| --- | --- | --- |
| `NF` | No Fail — HP cannot fail the run; `isFailed` reports `false`. | 0.5 |
| `EZ` | Easy — wider judgement windows, halved HP drain. | 0.5 |
| `HT` | Half Time — track plays at 0.75× rate. | 0.3 |
| `HR` | Hard Rock — tighter judgement windows, 1.4× HP drain. | 1.0 |
| `HD` | Hidden — notes fade out before the receptor (visual only). | 1.0 |
| `DT` | Double Time — track plays at 1.5× rate. | 1.0 |
| `AT` | Autoplay — deterministic perfect play, marks `scoreState.isAutoplay`. Never recorded to history, never uploadable. | — |
| `K1`…`K10` | Key-count conversion — chart remapped to N lanes via `convertBeatmapKeyCount`; `beatmapId` gains a `_converted_Nk` suffix and the record becomes local-only. | 0.9 |
| `SD` / `PF` | Sudden Death / Perfect — fail on first miss (PF: on anything below perfect). | 1.0 |
| `FI` / `Cover` (`CO`) / `FL` | Fade In / Cover / Flashlight — cover-based visual mods. | 1.0 |
| `MR` (`Mirror`) | Mirrored lanes. | 1.0 |
| `RD` (`Random`) | Randomized column mapping. | 1.0 |
| `NC` | Nightcore — DT variant. | 1.0 |
| `DC` (`Daycore`) | Daycore — HT variant. | 0.3 |
| `CS` (`ConstantSpeed`) | Constant scroll speed (ignores SV). | 0.9 |
| `IN` (`Invert`) | Inverted scroll. | 1.0 |
| `HO` (`HoldOff`) | Holds scored as taps. | 0.9 |
| `NR` (`NoRelease`) | No release judgement on holds. | 0.9 |
| `DA…` (`DifficultyAdjust`) | Custom OD/HP overrides (`DA:…` carries parameters). | 0.5 |
| `CL` (`Classic`) | Classic scoring feel. | 1.0 |
| `WU` / `WD` / `AS` | Wind Up / Wind Down / Adaptive Speed — variable rate. | 0.5 |
| `MU` (`Muted`) | Hitsounds muted. | 1.0 |
| `CN` (`Cinema`) | Cinema — zero-score spectator mod. | 0.0 |
| `AC…` (`AccuracyChallenge`) | Fail on accuracy drop below threshold. | 1.0 |

Aliases in parentheses are normalized on import (`Mirror→MR`,
`Cover/CO→Cover`, `HoldOff→HO`, etc.). Mutually exclusive mods
(EZ/HR, multiple rate mods, multiple K-mods, …) cannot co-occur —
the importer keeps the first and drops the rest.

### Provenance / rules

| Field | Type | Value |
| --- | --- | --- |
| `schemaVersion` | integer (optional) | Same versioning as the envelope (`3` current). |
| `replaySource` | string (optional) | Where the record came from (see table below). Every record imported from a file is restamped `"imported"`. |
| `uploadEligibility` | string (optional) | Why the record can/can't go to the server leaderboard (see table below). Imports are forced to `"ineligible_local_map"`. |
| `uploadStatus` | string (optional) | Sync state (see table below). File records are always `"local_only"`. |
| `holdRulesVersion` | `1` \| `2` \| `3` (optional) | Hold-note rule set used (see table below). Live play records `3`. |
| `holdTickIntervalMs` | integer `10..100` (optional) | Present **only** when `holdRulesVersion` is `2`. Tick spacing in ms (default 50). |

### `replaySource` values

| Value | Indicates |
| --- | --- |
| `"guest-local"` | Recorded on this device without an account. What live play writes. |
| `"account-local"` | Recorded on this device while signed in. |
| `"server-remote"` | Downloaded from the server (someone else's or your synced replay). |
| `"imported"` | Came from a `.rmr`/`.json` file import. Set unconditionally on import. |

### `uploadEligibility` values

| Value | Indicates |
| --- | --- |
| `"eligible"` | Can be uploaded to the leaderboard. |
| `"ineligible_local_map"` | Local or imported chart — no server revision to rank against. This is what file imports always get. |
| `"ineligible_autoplay"` | AT run. Never rankable. |
| `"ineligible_failed"` | Failed run. Never rankable. |
| `"ineligible_mode"` | Non-mania chart. Never rankable. |
| `"ineligible_no_replay_frames"` | No input frames recorded. Nothing to verify. |

### `uploadStatus` values

| Value | Indicates |
| --- | --- |
| `"local_only"` | Lives on this device only. All file records. |
| `"pending"` | Queued / awaiting server verification. |
| `"uploaded"` | Accepted by the server. |
| `"failed"` | Server rejected it. |

### `holdRulesVersion` values

| Value | Indicates |
| --- | --- |
| `1` | Legacy continuous-hold rules (hold until release, with release grace). |
| `2` | Ticked holds — tail sampled every `holdTickIntervalMs`; misses scored per uninterrupted missed-tick run; release/re-press required after a missed head. |
| `3` | Lazer hold rules. What current live play records. |

---

## `scoreState`

Full judgement breakdown. **Required** — a record without a
`scoreState` object is rejected. Counts are integers `0..100000`.

| Field | Type | Value |
| --- | --- | --- |
| `score` | integer | Final score (mirrors record `score`). |
| `combo` | integer `0..100000` | Combo at run end (often 0 if the run ended on a miss). |
| `maxCombo` | integer `0..100000` | Best combo (mirrors record `maxCombo`). |
| `hp` | number `0..100` | Remaining HP. `0` on a failed run. |
| `marvelousCount` | integer | Hits in the tightest window (weight 305). |
| `perfectCount` | integer | Hits in the perfect window (weight 300). |
| `greatCount` | integer | Hits in the great window (weight 200). |
| `goodCount` | integer | Hits in the good window (weight 100). |
| `badCount` | integer | Hits in the bad window (weight 50; breaks combo). |
| `missCount` | integer | Missed notes (weight 0; breaks combo). |
| `accuracy` | number `0..100` | Weighted accuracy percentage. |
| `completed` | boolean | `true` = chart played to the end. |
| `failed` | boolean | `true` = HP depleted. Forces grade `F`. |
| `recordId` | string (≤ 50) | Mirrors the record `id`; backfilled on import if missing. |
| `unstableRate` | number \| null (`0..10000`) | Timing-stability metric (ms-based). `null` = unavailable (e.g. no samples). Raw per-hit error samples are session-only and never stored. |
| `hitErrorSampleCount` | integer | Number of timing samples backing `unstableRate`. |
| `comboBreakCount` | integer (optional) | Times the combo was reset by a miss. |
| `columnJudgements` | array | Per-lane breakdown (see below). |
| `isAutoplay` | boolean (optional) | `true` = AT run. Present only on autoplay records. |
| `penar` | object \| null (optional) | Performance estimate (see below). |

Six judgement tiers exist: **marvelous → perfect → great → good → bad →
miss**, using interpolated osu!lazer-style OD windows, tightened ×1.4 by
HR / widened ×1.4 by EZ. DT/HT change rate, not windows.

### `columnJudgements[]`

One entry per lane that was played.

| Field | Type | Value |
| --- | --- | --- |
| `column` | integer `0..keyCount-1` | Lane index from the left, zero-based. Out-of-range entries are dropped on import. |
| `marvelousCount` / `perfectCount` / `greatCount` / `goodCount` / `badCount` / `missCount` | integers | That lane's judgement totals. Same weights as above. |

### `penar`

| Field | Type | Value |
| --- | --- | --- |
| `total` | number \| null (`0..100000`) | Estimated performance value. `null` = not computed. |
| `version` | string (≤ 50) | Estimator version, e.g. `"penar-stub-0"`. Tells you which formula produced `total`. |
| `starRating` | number \| null (`0..50`) | Chart difficulty used by the estimate. `null` = unknown. |
| `accuracy` | number `0..100` | Accuracy the estimate was computed from. |
| `maxCombo` | integer | Max combo the estimate was computed from. |
| `missCount` | integer | Miss count the estimate was computed from. |
| `mods` | string[] | Mods the estimate was computed with (≤ 20 entries). |

---

## `replayFrames[]`

The replay itself: a list of lane-state snapshots.

```json
{ "time": 120, "keysPressed": [true, false, false, false] }
```

| Field | Type | Value |
| --- | --- | --- |
| `time` | number `0..10000000` | Timestamp in **milliseconds** on the gameplay (audio-clock) timeline. May be fractional. Out-of-range frames are skipped on import. First frame is always `{ time: 0, all false }` (neutral state). |
| `keysPressed` | boolean[] | Lane states at that instant: `true` = held, `false` = released. **Length always equals `keyCount`** (index = lane from the left). One frame per press/release event; on import, short arrays pad with `false`, long ones truncate, duplicates at the same `time` collapse (last wins), and the list is sorted ascending. |

Cap: up to **1,000,000** frames per record locally. (Server uploads cap
at 100,000 — not a file limit.)

---

## `clientInfo` / `exporter`

Recording/exporting device info. String lengths are truncated as noted.

| Field | Type | Value |
| --- | --- | --- |
| `userAgent` | string (≤ 500) | Raw browser UA string. |
| `browser` | string | `"Edge"` / `"Opera"` / `"Chrome"` / `"Firefox"` / `"Safari"` / `"unknown"` (sniffed in that priority order). |
| `os` | string | `"Windows"` / `"macOS"` / `"Android"` / `"iOS"` / `"Linux"` / `"unknown"`. |
| `platform` | string (≤ 80) | `navigator.platform`. |
| `language` | string (≤ 20) | `navigator.language`, e.g. `"en-US"`. |
| `timezone` | string (≤ 80) | IANA zone, e.g. `"Asia/Tokyo"`. `"UTC"` fallback. |
| `timezoneOffset` | integer | `Date.getTimezoneOffset()` in minutes (e.g. `-540` = UTC+9). Sign is inverted vs UTC offset. |
| `screenWidth` / `screenHeight` | integers (optional) | Screen size in px. Absent outside browsers. |
| `appVersion` | string | App build. Record `clientInfo` reads the runtime version (fallback `"unknown"`); envelope `exporter` currently writes `"v1"`. |

---

## Minimal example

```json
{
  "format": "rhythmmania-replay-export",
  "schemaVersion": 3,
  "exportedAt": 1787418030996,
  "records": [
    {
      "id": "play_1787418027969_3b3dov9hg",
      "timestamp": 1787418027969,
      "beatmapId": "osuapi_574811_b1217397_c08b1db68e90151626f359626c2fb607",
      "beatmapTitle": "The Shortest Mashcore Ever",
      "beatmapArtist": "odaxelagnia",
      "keyCount": 4,
      "score": 4271,
      "accuracy": 9.006750241080038,
      "maxCombo": 3,
      "grade": "D",
      "isFailed": false,
      "scoreState": {
        "score": 4271, "combo": 0, "maxCombo": 3, "hp": 0,
        "marvelousCount": 4, "perfectCount": 7,
        "greatCount": 0, "goodCount": 0, "badCount": 0, "missCount": 100,
        "accuracy": 9.006750241080038,
        "completed": true, "failed": false,
        "recordId": "play_1787418027969_3b3dov9hg",
        "unstableRate": null, "hitErrorSampleCount": 0,
        "columnJudgements": [
          { "column": 0, "marvelousCount": 1, "perfectCount": 2, "greatCount": 0, "goodCount": 0, "badCount": 0, "missCount": 25 }
        ]
      },
      "replayFrames": [
        { "time": 0, "keysPressed": [false, false, false, false] },
        { "time": 120, "keysPressed": [true, false, false, false] }
      ],
      "mods": [],
      "schemaVersion": 3,
      "sourceSetId": 574811,
      "sourceChartId": 1217397,
      "replaySource": "guest-local",
      "uploadEligibility": "ineligible_local_map",
      "uploadStatus": "local_only",
      "holdRulesVersion": 3
    }
  ]
}
```

(Field set trimmed; real files also include catalog identity,
`clientInfo`, and full per-column judgements.)

---

## Import behavior (cheat sheet)

- File must be ≤ **64 MiB** UTF-8, valid JSON; a leading BOM is tolerated.
- Shapes accepted: top-level array, `{ records: [...] }`,
  `{ data: [...] }`, or a single record object (detected via `scoreState`).
- Max **500** records per file; the excess is rejected, first 500 kept.
- Bad values are repaired (clamped/coerced/truncated) or the record is
  dropped; every survivor is stamped `replaySource: "imported"`,
  `uploadEligibility: "ineligible_local_map"`,
  `uploadStatus: "local_only"` — imports are always local-only.
- Playback needs the chart locally. Matching order: exact `beatmapId`
  (or pre-`_converted_` base) → `catalogMapId` → `chartRevisionId` →
  `beatmapHash` → numeric set id (+ difficulty/keyCount) → title/artist
  (+ difficulty/keyCount).
