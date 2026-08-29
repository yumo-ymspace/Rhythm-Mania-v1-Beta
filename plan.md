# Comprehensive Architecture and Implementation Blueprint for an osu!(lazer) Mania Web Game in TypeScript and Vite

## Executive Architectural Overview and Technology Stack Selection

Developing a browser-based vertical scrolling rhythm game (VSRG) that faithfully reproduces the exact gameplay mechanics, scoring formulations, audio-visual feedback, and modern user interface of the osu!(lazer) mania ruleset requires a rigorous engineering approach. Unlike conventional web applications, rhythm action games operate under hard real-time execution constraints where frame pacing jitter exceeding four milliseconds or audio-clock desynchronization disrupts player physical coordination and invalidates judgment accuracy. The architecture presented in this blueprint translates the complete C# engine paradigm of [ppy/osu](https://github.com/ppy/osu) into a high-performance web platform built on TypeScript and Vite.

```
+---------------------------------------------------------------------------------------+
|                                    User Interface Layer                               |
|       (React / Tailwind CSS / Lucide / Skew-Angled Argon Design System Components)   |
|  +---------------------+  +----------------------+  +-------------------------------+ |
|  |     Main Menu       |  |     Song Select      |  |    Results & Leaderboard      | |
|  +---------------------+  +----------------------+  +-------------------------------+ |
+-------------------------------------------+-------------------------------------------+
                                            | State & Events
+-------------------------------------------v-------------------------------------------+
|                                   Core Game Engine                                    |
|  +---------------------------------------------------------------------------------+  |
|  |                          High-Precision Synchronizer                            |  |
|  |       (Audio Master Clock + Performance.now() Interpolation + Offset Buffering) |  |
|  +---------------------------------------------------------------------------------+  |
|  +----------------------------+  +-------------------------+  +--------------------+  |
|  |     Mania Ruleset Engine   |  |     Scoring Processor   |  |   Health Processor |  |
|  | (Hit Windows, Judgments)   |  | (Base, Bonus, Acc, UR)  |  | (Drain & Recovery) |  |
|  +----------------------------+  +-------------------------+  +--------------------+  |
+-------------------------------------------+-------------------------------------------+
         | Render State Updates             | Audio Events             | Input Events
+--------v----------------------+  +--------v----------------+  +------v----------------+
|       Rendering Engine        |  |      Audio Engine       |  |     Input Engine      |
| (Pixi.js v8 WebGL Scene Graph,|  | (Web Audio API Context, |  | (Low-Latency Keyboard |
|  Instanced Note Pipelines,    |  |  Sample-Accurate Hits,  |  |  Event Dispatcher,    |
|  Stage Lighting & Shaders)    |  |  Positional Spatial FX) |  |  Sub-Frame Poller)    |
+-------------------------------+  +-------------------------+  +-----------------------+
                                            |
+-------------------------------------------v-------------------------------------------+
|                                Data & Persistence Layer                               |
|   +---------------------------------------+  +-------------------------------------+  |
|   |         Beatmap Decoder (.osu)        |  |     Client Database (IndexedDB)     |  |
|   | (Lexer, Parser, SV Multiplier Tree)   |  | (Beatmaps, Audio Blobs, Settings)   |  |
|   +---------------------------------------+  +-------------------------------------+  |
+---------------------------------------------------------------------------------------+

```

### Technical Requirements and Performance Budgets

To match native osu!(lazer) execution fidelity, the client-side engine must meet strict performance criteria across rendering, audio processing, input handling, and computational overhead.

| System Subsystem | Performance Target | Hard Upper Limit | Architectural Mitigation Strategy |
| --- | --- | --- | --- |
| **Rendering Loop** | 240+ FPS (4.16 ms/frame) | 60 FPS (16.66 ms/frame) | WebGL batching via Pixi.js v8, sprite pooling, instanced geometry for hold bodies |
| **Input Latency** | $\le 2.0\text{ ms}$ | $\le 8.0\text{ ms}$ | Direct `KeyboardEvent` capture with `performance.now()`, pre-render input drain |
| **Audio-Visual Drift** | $\pm 0.5\text{ ms}$ | $\pm 2.0\text{ ms}$ | Hardware-locked `AudioContext.currentTime` reference clock with linear interpolation |
| **Garbage Collector Jitter** | 0 allocs in game loop | $< 0.5\text{ ms}$ pause | Zero-allocation runtime structures, pre-allocated object pools for notes/particles |
| **Beatmap Parse Time** | $< 50\text{ ms}$ per map | $< 200\text{ ms}$ per map | Typed array parsing, direct linear scanning without intermediate string allocations |

### Core Technology Stack Selection Matrix

The proposed system avoids heavyweight generic game engines like Unity WebGL or Godot Web in favor of a lightweight, highly optimized web-native modular architecture:

* **Build Tooling and Bundler**: **Vite 6+ with TypeScript 5.7+**. Offers lightning-fast Hot Module Replacement (HMR) during development, native ES module compilation, top-level `SharedArrayBuffer` support, and zero-overhead production bundling via Rollup.
* **Visual Rendering Engine**: **Pixi.js v8**. Utilizing Pixi.js v8 provides full WebGL 2.0 and WebGPU capabilities, hardware-accelerated 2D batching, custom shader pipeline support for dynamic stage lighting and receptor flares, and custom render layers for game notes.
* **Audio Pipeline**: **Web Audio API (`AudioContext`) with custom AudioWorklet integration**. Guarantees sample-accurate audio scheduling, low-latency playback of sound effects, dynamic volume ducking, playback rate scaling for speed-altering mods (such as Double Time and Half Time), and direct audio decoding via `decodeAudioData`.
* **User Interface and Design System**: **React 19 / Tailwind CSS with Lucide Icons**. Provides declarative state management for the meta-layer (Song Select, Settings, Results, Leaderboards, Skin Selector) while keeping the actual in-game HUD decoupling overhead minimal through direct reactive signals or canvas HUD overlays.
* **Storage and Archive Ingestion**: **Dexie.js (IndexedDB wrapper) and JSZip**. Provides client-side relational storage of unpacked beatmap sets, audio buffers, high-resolution background imagery, and personal replay data.

---

## Beatmap Specification and File Ingestion Pipeline

The osu!(lazer) mania ruleset processes beatmaps encoded in the standardized `.osu` file format, as documented in the [osu! Beatmap File Format Specification](https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29). The parser must deconstruct text-based `.osu` streams, extract configuration sections, calculate column assignments from horizontal coordinates, precompute cumulative Slider Velocity (SV) changes, and structure hit objects into temporal execution queues.

### The .osu Mania Beatmap Format Structure

A mania beatmap uses Mode identifier `3` (Mania) or converts standard beatmaps (Mode 0) into mania column layouts. The primary configuration sections required by the engine include:

* `[General]`: Specifies `AudioFilename`, `AudioLeadIn`, `PreviewTime`, and `Mode` ($3 = \text{Mania}$).
* `[Metadata]`: Contains `Title`, `TitleUnicode`, `Artist`, `ArtistUnicode`, `Creator`, `Version` (Difficulty Name), `Source`, `Tags`, `BeatmapID`, and `BeatmapSetID`.
* `[Difficulty]`: Specifies `CircleSize` ($CS = \text{Key Count}$, typically 4 through 7), `OverallDifficulty` ($OD$, defining hit window precision), `HPDrainRate` ($HP$, health drain coefficient), and `SliderMultiplier`.
* `[Events]`: Background image file declarations (`0,0,"bg.jpg",0,0`), video layers, and storyboard break periods.
* `[TimingPoints]`: Controls tempo changes, meter, sample banks, and inherited scroll velocity multipliers.
* `[HitObjects]`: Explicit placement of single tap notes and hold notes (long notes).

### Column Mapping Mathematical Formulation

In the `.osu` file standard, hit object spatial positions are encoded across a standardized virtual coordinate space where $X \in [0, 512]$ and $Y \in [0, 384]$. For mania mode, the vertical coordinate $Y$ is ignored during gameplay layout, while the horizontal coordinate $X$ maps directly to a discrete column index $C \in [0, K - 1]$, where $K$ is the key count defined by the beatmap's `CircleSize` parameter:

$$C = \left\lfloor \frac{X \times K}{512} \right\rfloor$$

To prevent out-of-bounds indexing resulting from floating-point inaccuracies or malformed mappers' coordinates, the result is clamped:

$$C_{\text{clamped}} = \max\left(0, \min\left(K - 1, \left\lfloor \frac{X \times K}{512} \right\rfloor\right)\right)$$

### Hit Object Encoding and Extraction

Mania hit objects are categorized into two fundamental types using bitwise flags:

1. **Single Note (HitCircle)**: Indicated when bit 0 of the `type` integer is set (`type & 1 != 0`).
* Line syntax: `x,y,time,type,hitSound,hitSample`
* Parameters: `time` (integer millisecond timestamp).


2. **Hold Note / Long Note**: Indicated when bit 7 of the `type` integer is set (`type & 128 != 0`).
* Line syntax: `x,y,time,type,hitSound,endTime:hitSample`
* Parameters: `time` (start timestamp in ms) and `endTime` (release timestamp in ms extracted from the sixth colon-delimited token).



```typescript
export interface RawHitObject {
  column: number;
  startTime: number;
  endTime: number;
  isHold: boolean;
  hitSound: number;
  hitSample: string;
}

export interface TimingPoint {
  time: number;
  beatLength: number; // Positive = uninherited (BPM = 60000 / beatLength), Negative = inherited (SV = -100 / beatLength)
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
}

export interface ParsedManiaBeatmap {
  general: {
    audioFilename: string;
    audioLeadIn: number;
    previewTime: number;
  };
  metadata: {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    version: string;
    beatmapId: number;
    beatmapSetId: number;
  };
  difficulty: {
    keyCount: number;      // CircleSize
    overallDifficulty: number;
    hpDrainRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
  };
  backgroundFilename: string | null;
  timingPoints: TimingPoint[];
  hitObjects: RawHitObject[];
}

```

### Slider Velocity (SV) Calculation and Scroll Position Integration

Mania beatmaps feature variable scroll velocity changes governed by inherited timing points. In an inherited timing point (`uninherited === false`), the `beatLength` property contains a negative floating-point percentage value representing the inverse slider velocity multiplier:

$$\text{Multiplier} = -\frac{100}{\text{beatLength}}$$

For example, a `beatLength` of $-50$ produces an $SV = 2.0\times$ (doubling scroll velocity), while $-200$ produces an $SV = 0.5\times$ (halving scroll velocity).

To achieve frame-rate-independent positioning of notes during rendering, the engine precomputes a cumulative track distance function $D(t)$. The distance $D(t)$ represents the integrated visual position along the playfield track from $t = 0$ to time $t$:

$$D(t) = \int_{0}^{t} V(u) \, du = \sum_{i=1}^{n-1} V_i \cdot (t_{i+1} - t_i) + V_n \cdot (t - t_n)$$

where $V_i$ is the active scroll multiplier during segment $[t_i, t_{i+1})$.

```typescript
export interface ScrollSegment {
  startTime: number;
  endTime: number;
  multiplier: number;
  cumulativeDistanceStart: number;
}

export class ScrollPositionCalculator {
  private segments: ScrollSegment[] = [];

  constructor(timingPoints: TimingPoint[], mapDuration: number) {
    this.buildSegments(timingPoints, mapDuration);
  }

  private buildSegments(timingPoints: TimingPoint[], mapDuration: number): void {
    const sorted = [...timingPoints].sort((a, b) => a.time - b.time);
    let currentMultiplier = 1.0;
    let lastTime = 0;
    let runningDistance = 0;

    for (let i = 0; i < sorted.length; i++) {
      const tp = sorted[i];
      const time = Math.max(0, tp.time);

      if (time > lastTime) {
        const duration = time - lastTime;
        this.segments.push({
          startTime: lastTime,
          endTime: time,
          multiplier: currentMultiplier,
          cumulativeDistanceStart: runningDistance,
        });
        runningDistance += duration * currentMultiplier;
        lastTime = time;
      }

      if (!tp.uninherited) {
        currentMultiplier = -100 / tp.beatLength;
      } else {
        currentMultiplier = 1.0;
      }
    }

    // Final trailing segment
    this.segments.push({
      startTime: lastTime,
      endTime: mapDuration + 10000,
      multiplier: currentMultiplier,
      cumulativeDistanceStart: runningDistance,
    });
  }

  public getVisualPosition(time: number): number {
    let low = 0;
    let high = this.segments.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const seg = this.segments[mid];

      if (time >= seg.startTime && time < seg.endTime) {
        return seg.cumulativeDistanceStart + (time - seg.startTime) * seg.multiplier;
      }
      if (time < seg.startTime) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return time;
  }
}

```

---

## Precision Timing, Audio Synchronization, and High-Performance Game Loop

Rhythm game simulation demands an absolute temporal ground truth. JavaScript's default timer primitives (`setTimeout` and `setInterval`) are subject to OS-level thread scheduling delays, power-saving throttling, and macro-task queue starvation, resulting in variance exceeding 15 ms. The web mania engine solves this by establishing a **Dual-Clock Hybrid Audio-Visual Synchronizer** tied directly to the hardware audio sample counter.

```
       +-------------------------------------------------------------+
       |                  Hardware Audio Clock                       |
       |                (AudioContext.currentTime)                   |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |               High-Precision Audio Synchronizer             |
       |       - Base: AudioContext.currentTime (drift-free)         |
       |       - Interpolation: performance.now() - anchorPerf       |
       |       - User & Map Calibration Offsets Applied              |
       +------------------------------+------------------------------+
                                      |
                                      +---------------------------------------+
                                      | Real-Time Clock                       | Input Timestamp
                                      v                                       v
+----------------------------------------------------+     +----------------------------------+
|           Pixi.js Render Engine (240+ FPS)         |     |        Ruleset Hit Evaluator     |
|   - Compute deltaDistance from receptor            |     | - Compare note.startTime         |
|   - Cull inactive offscreen notes                  |     |   against input exact timestamp  |
|   - Batch-render visible notes & hold bodies       |     | - Assign HitResult (Perfect..Miss|
+----------------------------------------------------+     +----------------------------------+

```

### The Dual-Clock Synchronization Algorithm

The master clock derives its elapsed position from `AudioContext.currentTime`. Because `AudioContext.currentTime` updates in blocks corresponding to the audio hardware buffer size (typically 128 to 512 frames, updating every $2.6\text{ to }10.6\text{ ms}$ at $48\text{ kHz}$), relying on raw reads causes micro-stutter in visual interpolation.

The synchronizer couples `AudioContext.currentTime` with `performance.now()` to deliver sub-millisecond continuous visual time while eliminating cumulative drift:

```typescript
export class AudioMasterClock {
  private audioCtx: AudioContext;
  private audioBufferSource: AudioBufferSourceNode | null = null;
  private startTimeAudioCtx: number = 0;
  private startOffsetMs: number = 0;
  private userOffsetMs: number = 0;
  private mapOffsetMs: number = 0;
  private isPlaying: boolean = false;
  private playbackRate: number = 1.0;

  constructor(audioCtx: AudioContext) {
    this.audioCtx = audioCtx;
  }

  public start(buffer: AudioBuffer, startPositionMs: number = 0, rate: number = 1.0): void {
    this.audioBufferSource = this.audioCtx.createBufferSource();
    this.audioBufferSource.buffer = buffer;
    this.playbackRate = rate;
    this.audioBufferSource.playbackRate.setValueAtTime(rate, this.audioCtx.currentTime);
    this.audioBufferSource.connect(this.audioCtx.destination);

    const startOffsetSec = startPositionMs / 1000;
    this.startTimeAudioCtx = this.audioCtx.currentTime;
    this.startOffsetMs = startPositionMs;
    this.audioBufferSource.start(0, startOffsetSec);
    this.isPlaying = true;
  }

  public getCurrentTime(): number {
    if (!this.isPlaying) return this.startOffsetMs;

    const elapsedAudioSec = (this.audioCtx.currentTime - this.startTimeAudioCtx) * this.playbackRate;
    const rawTimeMs = this.startOffsetMs + elapsedAudioSec * 1000;
    
    // Apply user calibration and map specific offset
    return rawTimeMs + this.userOffsetMs + this.mapOffsetMs;
  }

  public setOffsets(userOffset: number, mapOffset: number): void {
    this.userOffsetMs = userOffset;
    this.mapOffsetMs = mapOffset;
  }

  public stop(): void {
    if (this.audioBufferSource) {
      try {
        this.audioBufferSource.stop();
        this.audioBufferSource.disconnect();
      } catch {}
      this.audioBufferSource = null;
    }
    this.isPlaying = false;
  }
}

```

### Low-Latency Input Processing Pipeline

To avoid input dropping or key order inversions under high note density, user key strokes must be captured instantaneously via window event listeners, stamped with high-precision time from `performance.now()`, and pushed to an event queue that is drained before each physics evaluation step:

```typescript
export interface QueuedInputEvent {
  column: number;
  type: 'down' | 'up';
  timestamp: number;
}

export class LowLatencyInputManager {
  private keyMap: Map<string, number> = new Map();
  private inputQueue: QueuedInputEvent[] = [];
  private keyState: boolean[] = [];

  constructor(keyCount: number, customBinds?: string[]) {
    this.keyState = new Array(keyCount).fill(false);
    this.setupBindings(keyCount, customBinds);
    this.attachListeners();
  }

  private setupBindings(keyCount: number, customBinds?: string[]): void {
    const default4K = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    const default7K = ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'];
    
    const bindings = customBinds || (keyCount === 4 ? default4K : default7K);
    bindings.forEach((code, idx) => {
      this.keyMap.set(code, idx);
    });
  }

  private attachListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const col = this.keyMap.get(e.code);
      if (col !== undefined) {
        e.preventDefault();
        this.keyState[col] = true;
        this.inputQueue.push({
          column: col,
          type: 'down',
          timestamp: performance.now(),
        });
      }
    }, { passive: false, capture: true });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const col = this.keyMap.get(e.code);
      if (col !== undefined) {
        e.preventDefault();
        this.keyState[col] = false;
        this.inputQueue.push({
          column: col,
          type: 'up',
          timestamp: performance.now(),
        });
      }
    }, { passive: false, capture: true });
  }

  public drainEvents(): QueuedInputEvent[] {
    const events = this.inputQueue;
    this.inputQueue = [];
    return events;
  }

  public isColumnPressed(column: number): boolean {
    return this.keyState[column] || false;
  }
}

```

---

## Core Gameplay Mechanics, Ruleset Logic, and Judgment Processing

The core osu!(lazer) mania ruleset operates as a deterministic state machine that iterates over hit objects, validates hit windows based on Overall Difficulty ($OD$), handles multi-stage hold note lifecycles, and triggers health and score mutations.

### Mathematical Derivation of Hit Windows

Hit window timing intervals in osu!mania scale linearly with the beatmap's Overall Difficulty ($OD$), where $OD \in [0, 10]$. According to the [osu! Overall Difficulty Specification](https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty#osu!mania) and the official C# source in [ManiaHitWindows.cs](https://www.google.com/search?q=https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs), the error boundaries $\pm \Delta t$ (in milliseconds) for each judgment tier are calculated using the formulas in the table below.

| Judgment Tier (Lazer Terminology) | Legacy Sprite Designation | Timing Window Formula ($\pm \text{ms}$) | Window at $OD = 0$ | Window at $OD = 5$ | Window at $OD = 10$ |
| --- | --- | --- | --- | --- | --- |
| **Perfect** | MAX / 300g (Rainbow 300) | $\pm 16.0\text{ ms}$ (Constant) | $\pm 16.0\text{ ms}$ | $\pm 16.0\text{ ms}$ | $\pm 16.0\text{ ms}$ |
| **Great** | 300 (Orange / Gold 300) | $\pm(64.0 - 3.0 \times OD)$ | $\pm 64.0\text{ ms}$ | $\pm 49.0\text{ ms}$ | $\pm 34.0\text{ ms}$ |
| **Good** | 200 (Green) | $\pm(97.0 - 3.0 \times OD)$ | $\pm 97.0\text{ ms}$ | $\pm 82.0\text{ ms}$ | $\pm 67.0\text{ ms}$ |
| **OK** | 100 (Blue) | $\pm(127.0 - 3.0 \times OD)$ | $\pm 127.0\text{ ms}$ | $\pm 112.0\text{ ms}$ | $\pm 97.0\text{ ms}$ |
| **Meh** | 50 (Dark Grey / Yellow) | $\pm(151.0 - 3.0 \times OD)$ | $\pm 151.0\text{ ms}$ | $\pm 136.0\text{ ms}$ | $\pm 121.0\text{ ms}$ |
| **Miss** | Miss (Red X) | $\pm(188.0 - 3.0 \times OD)$ | $\pm 188.0\text{ ms}$ | $\pm 173.0\text{ ms}$ | $\pm 158.0\text{ ms}$ |

```typescript
export enum HitResult {
  None = 0,
  Miss = 1,
  Meh = 2,
  Ok = 3,
  Good = 4,
  Great = 5,
  Perfect = 6,
}

export class ManiaHitWindows {
  public perfect: number = 16.0;
  public great: number;
  public good: number;
  public ok: number;
  public meh: number;
  public miss: number;

  constructor(od: number) {
    const clampedOd = Math.max(0, Math.min(10, od));
    this.great = 64.0 - 3.0 * clampedOd;
    this.good = 97.0 - 3.0 * clampedOd;
    this.ok = 127.0 - 3.0 * clampedOd;
    this.meh = 151.0 - 3.0 * clampedOd;
    this.miss = 188.0 - 3.0 * clampedOd;
  }

  public judge(deltaMs: number): HitResult {
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= this.perfect) return HitResult.Perfect;
    if (absDelta <= this.great) return HitResult.Great;
    if (absDelta <= this.good) return HitResult.Good;
    if (absDelta <= this.ok) return HitResult.Ok;
    if (absDelta <= this.meh) return HitResult.Meh;
    if (absDelta <= this.miss) return HitResult.Miss;
    return HitResult.None;
  }
}

```

### Hit Object Lifecycle and Anti-Ghosting Resolution

Hit objects within each column must be evaluated in strict chronological order. When a user presses a key at time $t_{\text{input}}$, the engine searches the earliest unjudged object in that column:

1. **Hit Window Ingestion**: Compute time offset $\Delta t = t_{\text{input}} - t_{\text{note}}$.
2. **Early Hit Check**: If $\Delta t < -\text{missWindow}$, the tap is rejected as ghost tapping (does not penalize or consume the note).
3. **Active Window Hit**: If $\vert{}\Delta t\vert{} \le \text{missWindow}$, determine judgment tier via `ManiaHitWindows.judge(\Delta t)`. The note transitions to `Judged`, updates score and health, triggers receptor animation, and is removed from the active queue.
4. **Late Miss Timeout**: In the main update loop, any unjudged note whose time satisfies $t_{\text{current}} - t_{\text{note}} > \text{mehWindow}$ automatically receives an automatic `HitResult.Miss` judgment and breaks combo.

### Multi-Stage Hold Note (Long Note) Execution Mechanics

Hold notes in osu!(lazer) mania operate via a three-phase compound lifecycle:

```
    Start Time (t_head)                                 End Time (t_tail)
----------[ Head Note ]=================[ Hold Body Ticks ]=================[ Tail Note ]----------> Time
             |                                 |                                 |
      Keydown Event                     Continuous Hold                   Keyup Event
   Judged by HitWindow             Sustains Combo & Health            Judged by Release Window

```

1. **Head Evaluation**: Triggered on `keydown`. Evaluated against standard hit windows. If missed, the entire hold note is flagged as failed, disabling subsequent body tick generation.
2. **Body Tick Processing**: As long as the key is held continuously, periodic ticks (spaced at 100 ms or standard beat divisor fractions) fire, rewarding micro-health increments and incrementing combo. If the key is released before $t_{\text{end}}$, ticks cease firing.
3. **Tail Release Evaluation**: Triggered on `keyup` near $t_{\text{end}}$. The release timing offset $\Delta t_{\text{tail}} = t_{\text{release}} - t_{\text{end}}$ is judged using a slightly relaxed release window (typically $1.5\times \text{hitWindows}$). If the user holds past $t_{\text{end}} + \text{mehWindow}$, the tail automatically resolves as a Great or Perfect judgment to prevent punishing extended holds.

### Health Processor and Fail State Management

The health processor in osu!(lazer) mania manages HP within the range $[0.0, 1.0]$. The initial health defaults to $1.0$ ($100\%$). Health updates upon every judgment according to the ruleset delta coefficients:

$$\text{Health}_{\text{new}} = \max\left(0.0, \min\left(1.0, \text{Health}_{\text{current}} + \Delta \text{HP}(\text{Result}, HP_{\text{Drain}})\right)\right)$$

| Hit Result | Base HP Delta ($\Delta \text{HP}$) | Behavior Description |
| --- | --- | --- |
| **Perfect** | $+0.020$ | Maximum health recovery bonus |
| **Great** | $+0.015$ | Standard health recovery bonus |
| **Good** | $+0.008$ | Minor health recovery bonus |
| **OK** | $+0.002$ | Minimal health recovery bonus |
| **Meh** | $-0.005$ | Slight health penalty |
| **Miss** | $-0.080 \times (1.0 + 0.1 \times HP_{\text{Drain}})$ | Significant health reduction, scales with map $HP$ stat |

If $\text{Health}$ drops to $0.0$, the player immediately enters the **Fail State** unless the `No Fail` (NF) mod is active, halting input evaluation and triggering the failure transition overlay.

---

## Scoring Systems, Grade Calculation, and Performance Metrics

osu!(lazer) implements a standardized scoring model known as **Score V2 / Lazer Standardised Scoring**, designed to normalize maximum score to exactly $1,000,000$ points across all beatmaps regardless of note count.

### Standardised Scoring Mathematical Formulation

Total score comprises two decoupled components: **Base Score** ($700,000\text{ points}$ / $70\%$) derived from accuracy-weighted judgments, and **Bonus Score** ($300,000\text{ points}$ / $30\%$) derived from sustained combo:

$$\text{Total Score} = \text{Base Score} + \text{Bonus Score}$$

$$\text{Base Score} = 700,000 \times \left( \frac{\sum_{i} W(\text{Result}_i)}{W_{\max} \times N_{\text{total}}} \right)$$

$$\text{Bonus Score} = 300,000 \times \left( \frac{\text{Combo Score Accumulator}}{\text{Max Achievable Combo Accumulator}} \right)$$

where individual judgment accuracy weight coefficients $W(\text{Result})$ are defined as:

* $W(\text{Perfect}) = 305$ (or $300$ in standard normalizers)
* $W(\text{Great}) = 300$
* $W(\text{Good}) = 200$
* $W(\text{OK}) = 100$
* $W(\text{Meh}) = 50$
* $W(\text{Miss}) = 0$

### Real-Time Accuracy Calculation

Real-time accuracy displays player precision as a percentage rounded to two decimal places:

$$\text{Accuracy} = \frac{305 \cdot N_{\text{Perfect}} + 300 \cdot N_{\text{Great}} + 200 \cdot N_{\text{Good}} + 100 \cdot N_{\text{OK}} + 50 \cdot N_{\text{Meh}}}{305 \cdot (N_{\text{Perfect}} + N_{\text{Great}} + N_{\text{Good}} + N_{\text{OK}} + N_{\text{Meh}} + N_{\text{Miss}})} \times 100\%$$

### Grade Classification Thresholds

Rank grades are computed at the conclusion of play according to the official [osu! Scoring and Rank Hierarchy](https://www.google.com/search?q=https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Scoring/ScoreProcessor.cs):

| Rank Grade | Accuracy Threshold | Additional Criteria | Visual Badge Styling |
| --- | --- | --- | --- |
| **SS (Silver)** | $100.00\%$ | Hidden, Fade In, or Flashlight Mod Enabled | Glowing Silver Metallic Badge with Diamond Sheen |
| **SS (Gold)** | $100.00\%$ | No visibility mods | Radiant Gold Badge with Neon Yellow Outer Ring |
| **S (Silver)** | $\ge 95.00\%$ | Hidden, Fade In, or Flashlight Mod Enabled | Glowing Silver S Badge |
| **S (Gold)** | $\ge 95.00\%$ | No visibility mods ($0\text{ misses}$) | Radiant Gold S Badge |
| **A** | $\ge 90.00\%$ | No miss requirement (or $>80\%$ with $0\text{ misses}$) | Vibrant Emerald Green Badge |
| **B** | $\ge 80.00\%$ | No miss requirement | Electric Blue Badge |
| **C** | $\ge 70.00\%$ | No miss requirement | Bright Amber Orange Badge |
| **D** | $< 70.00\%$ | Failed passes or low accuracy | Crimson Red Badge |

### Unstable Rate (UR) and Hit Error Modeling

Unstable Rate ($UR$) quantifies timing consistency by calculating ten times the sample standard deviation of hit timing errors (in milliseconds):

$$UR = 10 \times \sigma = 10 \times \sqrt{\frac{1}{N - 1} \sum_{i=1}^{N} (\Delta t_i - \bar{\Delta t})^2}$$

where $\Delta t_i$ represents the raw millisecond timing error ($t_{\text{hit}} - t_{\text{target}}$) for hit $i$, and $\bar{\Delta t}$ is the mean timing offset. A lower $UR$ indicates higher timing consistency.

---

## Visual Design System, Skinning Architecture, and User Interface

The application replicates the visual design system of **osu!(lazer) Argon Theme**, characterized by dark obsidian glass surfaces, $12^\circ$ to $15^\circ$ forward-skewed interactive cards, vibrant neon accents (Cyan `#00F0FF`, Magenta `#FF007F`, Electric Amber `#FFB800`, Emerald `#00FF66`), rounded pill geometry, and spring-eased micro-interactions.

```
+----------------------------------------------------------------------------------------------------+
| [User Avatar]  Yumo Yan  (Level 98)                 [ SEARCH: Camellia - Crystallized           ] |
+----------------------------------------------------------------------------------------------------+
|  CAROUSEL (Skewed Argon Cards -12deg)       |                   DIFFICULTY DETAILS PANEL           |
|  +---------------------------------------+  |  +-------------------------------------------------+ |
|  | / Camellia - Crystallized             |  |  | CRYSTALLIZED [4K MASTER]                        | |
|  |   [4K HARD]  ★ 4.82                   |  |  | Star Rating: ★ 6.14 (Master)                    | |
|  +---------------------------------------+  |  | BPM: 210  | Length: 04:12  | Objects: 2,418      | |
|  | / Camellia - Crystallized             |  |  | Keys: 4K  | OD: 8.5        | HP: 8.0             | |
|  |   [4K MASTER] ★ 6.14  <SELECTED>      |  |  +-------------------------------------------------+ |
|  +---------------------------------------+  |  | LOCAL LEADERBOARD                               | |
|  | / xi - FREEDOM DiVE                   |  |  | 1. Yumo Yan   1,000,000 (SS)  100.00%  UR 54.2  | |
|  |   [7K FOUR DIMENSIONS] ★ 7.45         |  |  | 2. ReplayBot    984,210 (S)    98.42%  UR 68.1  | |
|  +---------------------------------------+  |  +-------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
| [ BACK ]   [ MODS: None ]   [ RANDOM ]   [ OPTIONS ]                       [ PLAY BEATMAP >>> ]    |
+----------------------------------------------------------------------------------------------------+

```

### Skin Architecture and Color Palette Configuration

The UI and playfield theme is parameterized via a skinning configuration engine supporting the default Argon design:

```typescript
export interface ManiaSkinConfig {
  name: string;
  stage: {
    columnWidth: number;          // Default: 64px per column
    hitPosition: number;          // Distance from top/bottom to receptor (e.g. 80px)
    receptorHeight: number;       // Default: 16px
    stageBackgroundColor: number; // Hex 0x0a0c10 with 0.85 alpha
    borderColor: number;          // Hex 0x00f0ff (Argon Cyan)
    lightColor: number;           // Column lighting illumination color
  };
  notes: {
    noteHeight: number;           // Default: 18px
    cornerRadius: number;         // Default: 6px
    colors4K: number[];           // [Cyan, Yellow, Yellow, Cyan]
    colors7K: number[];           // [Cyan, Blue, Cyan, Yellow, Cyan, Blue, Cyan]
    holdBodyAlpha: number;        // Default: 0.65
  };
  judgments: {
    perfectColor: string;         // #00f0ff (Cyan Glow)
    greatColor: string;           // #ffb800 (Gold)
    goodColor: string;            // #00ff66 (Emerald)
    okColor: string;              // #0088ff (Blue)
    mehColor: string;             // #888888 (Grey)
    missColor: string;            // #ff0044 (Crimson)
  };
}

```

### Complete Screen-by-Screen Layout Specifications

1. **Title and Main Menu Screen**:
* Centered interactive pulsating osu! logo scaling dynamically with menu track BPM.
* Radial action menu with skewed pill buttons (`SOLO`, `MULTI`, `SETTINGS`, `EXIT`).
* Top-right persistent user profile card displaying rank, performance points, and level progress bar.
* Bottom-right audio playback widget displaying current track title, scrub bar, and volume controls.


2. **Song Selection Screen**:
* **Left 50%**: Vertical beatmap carousel displaying skewed rectangular cards (-12° tilt) with album artwork, mapper tags, and star rating badges.
* **Top Bar**: Search bar filtering by title, artist, mapper, and key count filter pills (`All`, `4K`, `7K`).
* **Right 50%**: Beatmap difficulty overview panel displaying radar charts, exact BPM, drain time, total note count, and local high score leaderboards.
* **Bottom Navigation Bar**: `Back` button, `Mods` selection overlay modal (Auto, NoFail, Easy, HardRock, DoubleTime, HalfTime, Hidden, FadeIn, Flashlight, Mirror, Random), `Random Beatmap` picker, and neon green `Play` button.


3. **In-Game HUD and Playfield Screen**:
* **Playfield**: Centered vertical column track with dark translucent lane dividers and glowing receptor bars.
* **Stage Lighting**: Vertical gradient beams extending upward from receptors when keys are depressed.
* **Hit Bursts**: Radial particle explosions and glowing flares triggering upon note impact.
* **Top HUD**: Left health bar with dynamic fluid gradient; center-top song progress line; right 8-digit rolling score counter and live accuracy percentage.
* **Receptor Zone**: Centered combo counter with scale-bounce animation; floating animated judgment text; bottom hit error bar with color-coded millisecond tick markers.


4. **Results Screen (Post-Game Summary)**:
* **Left Column**: Massive glowing Rank Letter Badge (SS, S, A, B, C, D) with particle emission.
* **Center Column**: Final Score, Max Combo, and percentage accuracy.
* **Right Column**: Judgment breakdown table (counts for Perfect, Great, Good, OK, Meh, Miss), Hit Error Distribution histogram curve, and Unstable Rate ($UR$) metric.
* **Bottom Actions**: `Retry`, `Replay`, and `Continue` navigation buttons.


5. **Settings and Customization Modal**:
* Tabbed overlay: **Audio** (Master, Music, Hitsound volume, Universal Audio Offset calibration wizard), **Graphics** (FPS cap: 60/120/144/240/Unlimited, background dim: 0–100%, background blur, UI scale), **Keybinds** (Interactive rebinding for 4K through 10K layouts), and **Gameplay** (Scroll speed: 10–40, scroll direction: Downscroll/Upscroll).



---

## WebGL Rendering Pipeline Architecture with Pixi.js v8

The rendering subsystem must manage hundreds of on-screen falling notes, hold note meshes, receptor flares, and particle systems at $240+\text{ FPS}$ without triggering runtime memory allocations.

```
       +---------------------------------------------------------------+
       |                   Pixi.js v8 Application                      |
       +-------------------------------+-------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
   +-------------------------------+       +-------------------------------+
   |       Playfield Container     |       |         In-Game HUD           |
   |  - Lane backgrounds           |       |  - Health Bar Container       |
   |  - Column borders & receptors |       |  - Rolling Score Counter      |
   |  - Stage lighting overlays    |       |  - Accuracy & Combo Displays  |
   |  - Batched Note Layer (Mesh)  |       |  - Hit Error Bar & UR Graph   |
   |  - Hold Note Ribbon Bodies    |       +-------------------------------+
   |  - Hit Burst Particle Pool    |
   +-------------------------------+

```

### Instanced Note Rendering Pipeline

Rather than spawning separate DOM elements or unbatched Pixi.js Sprites, single notes and hold note bodies are rendered via batched instanced quad geometry. Single notes utilize 9-slice rounded rectangle sprites sharing a single texture atlas. Hold note bodies are rendered as custom textured meshes spanning from $Y_{\text{start}}$ to $Y_{\text{end}}$:

```typescript
import { Container, Graphics, Sprite, Texture, Mesh, Geometry, Shader } from 'pixi.js';

export class ManiaPlayfieldRenderer {
  public container: Container;
  private noteContainer: Container;
  private holdBodyContainer: Container;
  private receptorContainer: Container;
  private lightingContainer: Container;
  private particleContainer: Container;

  private keyCount: number;
  private columnWidth: number = 64;
  private hitPosition: number = 680; // Receptors Y position
  private trackHeight: number = 720;
  private scrollDurationMs: number = 500; // Visual window duration

  constructor(keyCount: number) {
    this.keyCount = keyCount;
    this.container = new Container();
    this.lightingContainer = new Container();
    this.receptorContainer = new Container();
    this.holdBodyContainer = new Container();
    this.noteContainer = new Container();
    this.particleContainer = new Container();

    this.container.addChild(
      this.lightingContainer,
      this.holdBodyContainer,
      this.noteContainer,
      this.receptorContainer,
      this.particleContainer
    );

    this.initStage();
  }

  private initStage(): void {
    const totalWidth = this.keyCount * this.columnWidth;
    const background = new Graphics()
      .rect(0, 0, totalWidth, this.trackHeight)
      .fill({ color: 0x0a0c10, alpha: 0.85 });
    this.container.addChildAt(background, 0);

    // Draw Column Dividers and Receptors
    for (let i = 0; i < this.keyCount; i++) {
      const receptor = new Graphics()
        .roundRect(i * this.columnWidth + 2, this.hitPosition, this.columnWidth - 4, 16, 4)
        .stroke({ color: 0x00f0ff, width: 2 })
        .fill({ color: 0x00f0ff, alpha: 0.2 });
      this.receptorContainer.addChild(receptor);
    }
  }

  public update(currentTime: number, activeNotes: RawHitObject[], scrollCalc: ScrollPositionCalculator): void {
    // Zero-allocation update: Position notes relative to receptor hitPosition
    const currentDist = scrollCalc.getVisualPosition(currentTime);

    for (let i = 0; i < activeNotes.length; i++) {
      const note = activeNotes[i];
      const noteDist = scrollCalc.getVisualPosition(note.startTime);
      const deltaDist = noteDist - currentDist;

      // Calculate Y coordinate (Downscroll)
      const noteY = this.hitPosition - (deltaDist / this.scrollDurationMs) * this.hitPosition;

      // Render only visible on-screen elements
      if (noteY >= -50 && noteY <= this.trackHeight + 50) {
        // Update sprite position from pre-allocated pool
      }
    }
  }
}

```

---

## Client-Side Storage, Audio Asset Management, and State Architecture

To allow seamless standalone operation without mandatory backend servers, the application implements a high-capacity client-side persistence architecture leveraging IndexedDB via Dexie.js.

### Database Schema Specification

```typescript
import Dexie, { Table } from 'dexie';

export interface StoredBeatmapSet {
  id: string;                  // Hash or SetID
  title: string;
  artist: string;
  creator: string;
  coverImageBlob?: Blob;
  audioBlob: Blob;
  beatmaps: StoredBeatmap[];
  dateAdded: number;
}

export interface StoredBeatmap {
  id: string;                  // MD5 hash of .osu content
  setId: string;
  version: string;             // Difficulty name
  keyCount: number;
  overallDifficulty: number;
  hpDrainRate: number;
  starRating: number;
  rawOsuContent: string;
}

export interface StoredScore {
  id?: number;
  beatmapId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  unstableRate: number;
  judgments: {
    perfect: number;
    great: number;
    good: number;
    ok: number;
    meh: number;
    miss: number;
  };
  mods: string[];
  timestamp: number;
}

export class OsuManiaDatabase extends Dexie {
  public beatmapSets!: Table<StoredBeatmapSet, string>;
  public beatmaps!: Table<StoredBeatmap, string>;
  public scores!: Table<StoredScore, number>;

  constructor() {
    super('OsuManiaWebDB');
    this.version(1).stores({
      beatmapSets: 'id, title, artist, creator, dateAdded',
      beatmaps: 'id, setId, keyCount, starRating',
      scores: '++id, beatmapId, score, rank, timestamp',
    });
  }
}

export const db = new OsuManiaDatabase();

```

### Ingestion of .osz Archives via Drag-and-Drop

When a user drops an `.osz` archive onto the application, `JSZip` decompresses the archive entirely in memory, extracts the primary audio file into a `Blob`, decodes all `.osu` files corresponding to Mode 3, and persists the structured records into IndexedDB:

```typescript
import JSZip from 'jszip';

export async function importOszPackage(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const osuFiles: { name: string; content: string }[] = [];
  let audioBlob: Blob | null = null;
  let coverBlob: Blob | null = null;

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    if (filename.endsWith('.osu')) {
      const content = await zipEntry.async('text');
      osuFiles.push({ name: filename, content });
    } else if (filename.match(/\.(mp3|ogg|wav)$/i)) {
      const arrayBuffer = await zipEntry.async('arraybuffer');
      audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    } else if (filename.match(/\.(jpg|jpeg|png)$/i) && !coverBlob) {
      const arrayBuffer = await zipEntry.async('arraybuffer');
      coverBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
    }
  }

  if (!audioBlob || osuFiles.length === 0) {
    throw new Error('Invalid .osz package: Missing audio track or .osu beatmaps');
  }

  // Parse and persist beatmap metadata into IndexedDB
  const setId = `set_${Date.now()}`;
  // ... Database persistence logic
  return setId;
}

```

---

## Comprehensive Implementation Roadmap and Step-by-Step Execution Plan

To guide another engineer or autonomous agent in implementing this system from scratch, the development process is organized into seven sequential milestones with explicit deliverables and acceptance criteria.

```
+---------------------------------------------------------------------------------------------------+
|                                  SEVEN-PHASE IMPLEMENTATION TIMELINE                              |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 1] Scaffolding, Core Infrastructure, and Audio Context Initialization                    |
|            -> Vite + TS setup, Pixi.js viewport, Web Audio graph, latency benchmarking           |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 2] Beatmap Decoding, .osz Ingestion, and IndexedDB Persistence                            |
|            -> .osu parser, JSZip unpacker, SV precalculator, Dexie storage pipeline              |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 3] Master Timing Synchronizer and Low-Latency Input Pipeline                              |
|            -> AudioMasterClock, performance.now() interpolation, keyboard event dispatcher        |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 4] Mania Ruleset Processor, Hit Windows, and Scoring Engine                               |
|            -> ManiaHitWindows, ScoreProcessor (1M cap), HealthProcessor, hold note state machine  |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 5] High-Performance WebGL Playfield and Visual Effects                                    |
|            -> Pixi.js batched rendering, Argon notes, stage lights, receptor bursts, pool system  |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 6] Complete Argon UI Suite (Song Select, HUD, Results, Settings)                          |
|            -> React / Tailwind skew components, carousel, leaderboards, hit error bar, settings   |
+---------------------------------------------------------------------------------------------------+
|  [PHASE 7] Audio Calibration Wizard, Integration Benchmarking, and Polish                         |
|            -> Audio offset calibration wizard, 240 FPS profiling, memory leak verification        |
+---------------------------------------------------------------------------------------------------+

```

### Phase 1: Project Scaffolding and Core Subsystems

* **Action Items**:
1. Initialize Vite project with `npm create vite@latest osu-mania-web -- --template react-ts`.
2. Configure `tsconfig.json` with `"strict": true`, `"target": "ESNext"`, `"moduleResolution": "Bundler"`.
3. Install core dependencies: `pixi.js@^8.0.0`, `dexie@^4.0.0`, `jszip@^3.10.0`, `lucide-react`, `tailwindcss@^3.4.0`.
4. Configure full-viewport responsive canvas wrapper with fixed logical resolution scaling ($1920 \times 1080$).



### Phase 2: Beatmap Parsing and Storage Engine

* **Action Items**:
1. Implement lexer and parser for `.osu` files supporting section headers `[General]`, `[Metadata]`, `[Difficulty]`, `[TimingPoints]`, and `[HitObjects]`.
2. Implement column calculation formula with bounding guarantees.
3. Build `ScrollPositionCalculator` to integrate cumulative Slider Velocity (SV) multipliers.
4. Implement `.osz` drag-and-drop ingestion with `JSZip` and persist unpacked records into IndexedDB tables (`beatmapSets`, `beatmaps`, `scores`).



### Phase 3: Dual-Clock Synchronizer and Input Engine

* **Action Items**:
1. Construct `AudioMasterClock` interfacing with `AudioContext.currentTime` and `AudioBufferSourceNode`.
2. Implement `LowLatencyInputManager` capturing `keydown` and `keyup` with high-resolution `performance.now()` timestamps.
3. Build audio calibration offset pipeline factoring user universal offset and per-map local offset.



### Phase 4: Ruleset Mechanics, Scoring, and Health Processors

* **Action Items**:
1. Implement `ManiaHitWindows` defining exact millisecond boundaries for Perfect, Great, Good, OK, Meh, and Miss based on Overall Difficulty ($OD$).
2. Build single note and hold note lifecycle state machines with anti-ghosting tap resolution.
3. Implement `ScoreProcessor` supporting Score V2 / Lazer Standardised 1,000,000 max scoring.
4. Implement `HealthProcessor` with drain rate scaling and fail trigger conditions.
5. Implement Unstable Rate ($UR$) calculation from recorded judgment error arrays.



### Phase 5: Pixi.js Playfield and Visual Particle Engine

* **Action Items**:
1. Build `ManiaPlayfieldRenderer` with dark lane backgrounds, glowing column borders, and rounded receptor geometry.
2. Implement batched note rendering and dynamic hold body ribbon meshes.
3. Implement animated stage lighting columns illuminating upon key depression.
4. Construct high-performance particle emitter pool for receptor explosion bursts.



### Phase 6: Argon UI Design System and Navigation Flows

* **Action Items**:
1. Implement Song Select carousel with -12° skewed cards, beatmap search filtering, and difficulty star rating color badges.
2. Build in-game HUD: dynamic rolling score counter, accuracy percentage display, combo counter bounce, health bar, and bottom hit error bar.
3. Build Results Screen displaying Grade Badges (SS, S, A, B, C, D), judgment counts, hit error distribution histogram, and UR metric.
4. Build Settings modal with keybind configuration (4K through 10K) and audio offset slider.



### Phase 7: Optimization, Testing, and Quality Assurance

* **Action Items**:
1. Perform memory profiling to verify zero object allocation during active gameplay.
2. Benchmark frame pacing under extreme note density (2,000+ notes/minute) maintaining 240+ FPS.
3. Validate judgment accuracy against native osu!(lazer) replay logs.



---

## System Validation, Benchmarking, and Quality Assurance Standards

To verify strict parity with native osu!(lazer), the application must undergo automated unit testing, visual regression benchmarking, and audio latency verification.

### Automated Unit Test Specifications

```typescript
import { describe, it, expect } from 'vitest';
import { ManiaHitWindows, HitResult } from './ManiaHitWindows';
import { ScrollPositionCalculator } from './ScrollPositionCalculator';

describe('ManiaHitWindows OD Scaling Tests', () => {
  it('should compute exact hit windows at OD = 5', () => {
    const hw = new ManiaHitWindows(5.0);
    expect(hw.perfect).toBe(16.0);
    expect(hw.great).toBe(49.0);   // 64 - 3 * 5
    expect(hw.good).toBe(82.0);    // 97 - 3 * 5
    expect(hw.ok).toBe(112.0);     // 127 - 3 * 5
    expect(hw.meh).toBe(136.0);    // 151 - 3 * 5
    expect(hw.miss).toBe(173.0);   // 188 - 3 * 5
  });

  it('should assign correct judgments for given offsets at OD = 5', () => {
    const hw = new ManiaHitWindows(5.0);
    expect(hw.judge(10.0)).toBe(HitResult.Perfect);
    expect(hw.judge(-30.0)).toBe(HitResult.Great);
    expect(hw.judge(60.0)).toBe(HitResult.Good);
    expect(hw.judge(-100.0)).toBe(HitResult.Ok);
    expect(hw.judge(130.0)).toBe(HitResult.Meh);
    expect(hw.judge(-170.0)).toBe(HitResult.Miss);
    expect(hw.judge(200.0)).toBe(HitResult.None);
  });
});

describe('Column Coordinate Mapping Tests', () => {
  it('should map 512-coordinate space into accurate 4K and 7K columns', () => {
    const mapToCol = (x: number, k: number) => Math.max(0, Math.min(k - 1, Math.floor((x * k) / 512)));
    
    // 4K tests
    expect(mapToCol(0, 4)).toBe(0);
    expect(mapToCol(127, 4)).toBe(0);
    expect(mapToCol(128, 4)).toBe(1);
    expect(mapToCol(256, 4)).toBe(2);
    expect(mapToCol(384, 4)).toBe(3);
    expect(mapToCol(512, 4)).toBe(3);

    // 7K tests
    expect(mapToCol(0, 7)).toBe(0);
    expect(mapToCol(256, 7)).toBe(3); // Center spacebar column
    expect(mapToCol(512, 7)).toBe(6);
  });
});

```

---

## Synthesis and Strategic Recommendations

This architectural blueprint establishes the blueprint for building a web-based osu!(lazer) mania client. By decoupling the master audio clock from the visual rendering pipeline, adopting zero-allocation instanced rendering in Pixi.js v8, faithfully modeling the Overall Difficulty hit window formulas, and matching the skewed Argon aesthetic, an implementing engineer or subagent can achieve complete fidelity with native desktop osu!(lazer).

Key architectural guidelines for implementation teams include:

1. **Maintain Clock Integrity**: Never use `Date.now()` or `performance.now()` as the sole master clock for note positions; always ground the timeline on `AudioContext.currentTime` with high-resolution delta interpolation.
2. **Enforce Pre-Allocation**: Ensure all note sprites, particle arrays, and input buffers are allocated during beatmap load time to prevent garbage collection pauses during gameplay.
3. **Strict Hit Object Ordering**: Evaluate user keystrokes against strictly ordered per-column hit object queues to prevent ghost tapping issues or out-of-order note consumption.

---

## References

* [ppy/osu GitHub Repository](https://github.com/ppy/osu) — Official open-source codebase for osu!(lazer).
* [ManiaHitWindows.cs Source Code](https://www.google.com/search?q=https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs) — Official hit window calculations and judgment criteria.
* [ManiaScoreProcessor.cs Source Code](https://www.google.com/search?q=https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs) — Official scoring logic and accuracy calculations.
* [osu! Beatmap File Format Specification](https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29) — Detailed breakdown of `.osu` file sections and hit object definitions.
* [osu! Overall Difficulty Specification](https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty#osu!mania) — Official mathematical formulas for mania hit windows across OD values.
* [osu! Mania Judgment Standardization Discussion #8189](https://github.com/ppy/osu-wiki/issues/8189) — Standardized naming and ruleset distinctions between legacy stable and lazer.
* [Web Audio API W3C Recommendation](https://www.w3.org/TR/webaudio/) — AudioContext scheduling and hardware sample synchronization.
* [Pixi.js v8 Documentation and Architecture](https://pixijs.com/) — Next-generation 2D WebGL/WebGPU rendering pipeline.
