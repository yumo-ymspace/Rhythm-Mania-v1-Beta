# Comprehensive Architectural Blueprint and UI/UX Specification for the osu!(lazer) Mania User Interface in TypeScript and Vite

## Design System Foundations, Visual Language, and Design Tokens

The user interface of osu!(lazer) for the mania ruleset is built upon the **Argon Design System**—a dark, high-contrast, geometric aesthetic characterized by skewed glassmorphic panels, vibrant neon accents, high-legibility typography, and physics-driven spring micro-animations. Translating this visual design system into a modern web client using TypeScript, React 19, Tailwind CSS, and Pixi.js v8 requires establishing design tokens, geometric transformations, and component hierarchies.

```
+----------------------------------------------------------------------------------------------------+
|                                    GLOBAL DESIGN SYSTEM ARCHITECTURE                               |
+----------------------------------------------------------------------------------------------------+
|  [Color Palette]          [Typography Hierarchy]     [Geometric Skew]      [Motion Physics]        |
|  - Dark Obsidian Glass    - Torus Pro / Inter        - -12deg Primary Axis - OutQuint (Eased UI)   |
|  - Argon Neon Cyan        - Exo 2 Tabular Numerals   - +12deg Text Counter - OutElastic (Combos)   |
|  - Gold / Emerald / Pink  - Uppercase Micro-Labels   - Pill & Wedge Shapes - BPM-Synced Pulse      |
+----------------------------------------------------------------------------------------------------+

```

### Color Palette and Design Tokens

The color space utilizes deep, low-luminance slate and obsidian backgrounds to provide high visual contrast for fast-falling musical notes, glowing receptor bursts, and colorful difficulty indicators.

| Design Token Name | Hex Code | Semantic Role in Mania UI | Tailwind CSS Mapping |
| --- | --- | --- | --- |
| `--bg-base` | `#08090D` | Master viewport canvas background | `bg-[#08090d]` |
| `--bg-surface-dark` | `#0D1017` | Playfield stage backdrop, carousel backing | `bg-[#0d1017]` |
| `--bg-surface-glass` | `rgba(18, 22, 34, 0.75)` | Translucent skewed cards, modal backings | `backdrop-blur-md bg-[#121622]/75` |
| `--border-glass` | `rgba(255, 255, 255, 0.12)` | Subtle specular edge highlight on cards | `border-white/12` |
| `--accent-cyan` | `#00F0FF` | Primary action glow, 4K outer lanes, Perfect | `text-[#00f0ff]`, `shadow-[#00f0ff]` |
| `--accent-pink` | `#FF007F` | Secondary highlight, Expert difficulty, S rank | `text-[#ff007f]` |
| `--accent-yellow` | `#FFCC00` | 4K inner lanes, Great judgment, Combo bounce | `text-[#ffcc00]` |
| `--accent-emerald` | `#00FF66` | Play button, Good judgment, Normal difficulty | `text-[#00ff66]` |
| `--accent-blue` | `#0088FF` | 7K intermediate lanes, OK judgment | `text-[#0088ff]` |
| `--accent-crimson` | `#FF1E56` | Miss judgment, Health critical alert, Fail | `text-[#ff1e56]` |
| `--text-primary` | `#FFFFFF` | Primary headers, scores, song titles | `text-white` |
| `--text-secondary` | `#A0AEC0` | Mapper metadata, BPM values, key labels | `text-slate-400` |

### Typography Hierarchy and Tabular Numerals

osu!(lazer) uses **Torus Pro** for standard interface text and **Exo 2** for high-impact numeric readouts. In a web client implementation, open-source font stacks deliver matching metrics:

```css
:root {
  --font-sans: 'Torus Pro', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-numeric: 'Exo 2', 'Torus Pro', monospace;
}

.tabular-numbers {
  font-family: var(--font-numeric);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

```

* **Header Titles (H1, Mod Titles)**: Bold uppercase, $20\text{px} - 28\text{px}$, tracking $+0.05\text{em}$.
* **Card Metadata (Artist, Mapper)**: Medium, $13\text{px} - 15\text{px}$, tracking normal.
* **Numeric HUD Readouts (Score, Acc, UR)**: Black tabular, $24\text{px} - 48\text{px}$, proportional digit widths to prevent layout jitter during rapid updates.
* **Micro-Badges (Key Count, Mod Tags)**: SemiBold uppercase, $10\text{px} - 11\text{px}$, tracking $+0.08\text{em}$.

### Geometric Language and Skew Matrix Mathematics

The signature visual identity of osu!(lazer) is the **$-12^\circ$ forward-skewed parallelogram** (or "wedge"). To prevent internal text, album art, and vector icons from distorting, an inverse affine transformation of $+12^\circ$ is applied to all child containers.

```
       +-------------------------------------------------------------+
       | Outer Card Container: skewX(-12deg)                         |
       |  +-------------------------------------------------------+  |
       |  | Inner Content Layer: skewX(+12deg)                    |  |
       |  | [Album Art]  Title Text  [★ 5.42]                     |  |
       |  +-------------------------------------------------------+  |
       +-------------------------------------------------------------+

```

The affine coordinate transformation matrix $M_{\text{skew}}$ for interactive cards is defined mathematically as:

$$M_{\text{skew}}(\theta) = \begin{bmatrix} 1 & \tan(\theta) & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1 \end{bmatrix}, \quad \text{where } \theta = -12^\circ \implies \tan(-12^\circ) \approx -0.212557$$

In CSS and Tailwind styling, this is cleanly expressed as:

```html
<div class="transform -skew-x-[12deg] rounded-xl bg-slate-900/80 border border-white/10 overflow-hidden shadow-lg transition-transform hover:scale-105">
  <!-- Counter-skewed child wrapper to keep contents upright -->
  <div class="transform skew-x-[12deg] p-4">
    <span class="text-white font-bold">Camellia - Crystallized</span>
  </div>
</div>

```

### Motion Physics, Easing Functions, and BPM Synchronization

Interface transitions in osu!(lazer) avoid linear interpolation, utilizing spring kinematics and higher-order polynomial decays:

* **UI Panel Transitions (`OutQuint`)**: Rapid entry with smooth deceleration:

$$f(t) = 1 - (1 - t)^5$$


* **Combo Bounce / Receptors (`OutElastic`)**: Spring overshoot for impact feedback:

$$f(t) = 2^{-10t} \cdot \sin\left(\frac{(t \cdot 10 - 0.75) \cdot 2\pi}{3}\right) + 1$$


* **Beat-Synchronized UI Pulsing**: Top-level containers pulse in scale and glow in lockstep with the menu track BPM. Every quarter note (beat fraction $b$), a transform pulse triggers:

$$\text{Scale}(t) = 1.0 + 0.04 \cdot \exp\left(-\frac{t - t_{\text{beat}}}{\tau}\right), \quad \tau \approx 0.15\text{ s}$$



---

## Global Header, Top Toolbar, and User Profile Component

The persistent global toolbar resides across the top of every screen (except active gameplay), providing navigational context, audio controls, search inputs, and profile status.

```
+----------------------------------------------------------------------------------------------------+
| [ < BACK ]   [ osu!mania ]                [ SEARCH (Ctrl+F) ]   [ NOW PLAYING ]   [ PROFILE CHIP ] |
+----------------------------------------------------------------------------------------------------+

```

```
+----------------------------------------------------------------------------------------------------+
| Top Toolbar Structure (Height: 56px, Skew-Styled, Backdrop Blur: 16px)                             |
+-------------------+--------------------+------------------------+-------------------+--------------+
| Left Navigation   | Ruleset Indicator  | Universal Search       | Music Controller  | User Profile |
| [ < BACK (Esc) ]  | [ 4K/7K MANIA ]    | [ Quick Filter...    ] | [ Track Title > ] | [ Level 98 ] |
+-------------------+--------------------+------------------------+-------------------+--------------+

```

### Top Toolbar Functional Specifications

1. **Back Button (`ESC`)**:
* Leftmost element; $-12^\circ$ skewed pill with glowing chevron icon.
* Hover state: Expands horizontally ($110\text{px} \to 130\text{px}$), shifts border color to Neon Cyan `#00F0FF`, plays `hover.wav`.
* Click action: Emits `click.wav`, navigates back one layer in the screen hierarchy.


2. **Ruleset / Keycount Indicator**:
* Displays the active mode badge (`osu!mania`).
* Shows active key configuration pill (`4K` or `7K`) with an icon resembling a 4-lane vertical keyboard.


3. **Universal Search Bar (`Ctrl+F` / `/`)**:
* Centered interactive text field with quick keyword matching (`artist:`, `creator:`, `bpm>`, `stars>=`).
* Keyboard shortcut indicator `[Ctrl+F]` rendered in a glowing keycap badge.


4. **Now Playing Music Controller**:
* Displays compact album art thumbnail, scrolling marquee text of `Artist - Title`, play/pause toggle, and track progress bar.
* Hovering reveals an interactive volume dropdown with separate sliders for Master, Music, and Effects.


5. **User Profile Chip**:
* Displays circular avatar encircled by a radial level progress ring (e.g., Level 98 at $64\%$).
* Shows username (`Yumo Yan`), Global Rank badge (`#1,234`), and Performance Points pill (`8,450 pp`).



---

## Title and Main Menu Screen

The title screen serves as the visual centerpiece, establishing the game's energy before navigating into song selection.

```
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                         +------------------+                                       |
|                                         |                  |                                       |
|                                         |    ( osu! )      |  <-- Main Logo (BPM Pulse + Glow)     |
|                                         |                  |                                       |
|                                         +------------------+                                       |
|                                                                                                    |
|                  +----------------------------------------------------------------+                |
|                  |  [ SOLO ]    [ MULTI ]    [ EDIT ]    [ SETTINGS ]    [ EXIT ]  |                |
|                  +----------------------------------------------------------------+                |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+

```

### Main Menu Visual Dynamics and Interactions

1. **Pulsating osu! Center Logo**:
* Centered $240\text{px} \times 240\text{px}$ vector logo with a dual-ring outer neon border (Cyan `#00F0FF` and Magenta `#FF007F`).
* **Beat Pulsing**: Scales from $1.0\times$ to $1.08\times$ on every musical downbeat with exponential decay.
* **Interactive Ripple**: Clicking the logo triggers an expanding translucent shockwave ring and plays a resonant acoustic bass hit.


2. **Skewed Action Ribbon (Main Menu Buttons)**:
* Horizontal row of five $-12^\circ$ skewed pill buttons: `SOLO`, `MULTI`, `EDIT`, `SETTINGS`, `EXIT`.
* **Hover Animation**: The hovered button scales up $1.10\times$, translates upward by $4\text{px}$, illuminates its background with a bright gradient fill, and pushes adjacent buttons outward.
* **Click Transition**: Clicking `SOLO` triggers a radial zoom-in transition into the Song Select carousel over $350\text{ms}$ using `OutQuint` easing.


3. **Background Parallax and Particle Layer**:
* Displays the currently selected beatmap's background artwork darkened by an $80\%$ dark dim vignette.
* A WebGL particle system spawns translucent geometric triangles that drift slowly upward, subtly deflecting away from the user's cursor position.



---

## Song Select Screen

The Song Select screen is the operational core of osu!(lazer) mania. It organizes beatmap libraries, displays detailed technical statistics, enables mod selection, and previews audio tracks.

```
+----------------------------------------------------------------------------------------------------+
| [HEADER] Filters: [All Keys] [4K] [7K]  |  Search: [ Camellia                 ]  | Sort: [Stars v] |
+------------------------------------------+---------------------------------------------------------+
| BEATMAP CAROUSEL (Infinite Virtual Stack)| SELECTED BEATMAP DETAILS PANEL                          |
|                                          |                                                         |
| +--------------------------------------+ | +-----------------------------------------------------+ |
| | / Camellia - Crystallized            | | | [ BANNER ARTWORK: Crystallized                    ] | |
| |   Mapper: Smooth / ★ 4.12            | | | Title: Crystallized | Artist: Camellia              | |
| +--------------------------------------+ | | Difficulty: [4K MASTER]                             | |
| | / Camellia - Crystallized (EXPANDED) | | +-----------------------------------------------------+ |
| |   +--------------------------------+ | | TECHNICAL RADAR & METRICS                             | |
| |   | [4K Normal] ★ 2.45             | | | Star Rating: ★ 6.14 (Master)  | Key Count: 4K         | |
| |   | [4K Hard]   ★ 4.12             | | | BPM: 210 | Length: 04:12      | OD: 8.5 | HP: 8.0     | |
| |   | [4K Master] ★ 6.14  <SELECTED> | | | Notes: 2,140 | Long Notes: 278 (11.5%)              | |
| |   +--------------------------------+ | +-----------------------------------------------------+ |
| +--------------------------------------+ | LEADERBOARDS: [LOCAL] [GLOBAL]                          |
| | / xi - FREEDOM DiVE                  | | 1. Yumo Yan    1,000,000 (SS)  100.00%  UR 54.2        |
| |   Mapper: Kurai / ★ 7.45             | | 2. ReplayBot     982,140 (S)    98.21%  UR 68.4        |
| +--------------------------------------+ | 3. GuestPlayer   894,000 (A)    91.40%  UR 98.1        |
+------------------------------------------+---------------------------------------------------------+
| [ < BACK ]   [ MODS: None ]   [ RANDOM (F2) ]   [ OPTIONS (F3) ]               [ PLAY MANIA >>> ]  |
+----------------------------------------------------------------------------------------------------+

```

### Beatmap Carousel (Wedge Card Stack)

The carousel is positioned on the left half of the viewport ($50\%$ width) and implements infinite virtualized scrolling to handle libraries with thousands of beatmaps at $240\text{ FPS}$.

1. **Set Header Card Structure**:
* Dimensions: Width $96\%$, Height $64\text{px}$, Skew $-12^\circ$.
* Visual Layers: Dark glass background (`#121622`/75), left-aligned $120\text{px}$ cropped album art thumbnail, primary title and artist text, mapper attribution, and highest difficulty star rating pill.


2. **Expanded Difficulty Hierarchy**:
* Clicking a set card expands an accordion container revealing individual difficulty rows indented by $16\text{px}$.
* Each difficulty row displays its keycount badge (`4K`, `7K`), difficulty version name (e.g., `[4K Insane]`), and a star rating badge with exact numeric value (e.g., `★ 5.42`).
* **Selected Difficulty State**: The active card shifts $24\text{px}$ to the right, gains a $2\text{px}$ Neon Cyan `#00F0FF` border, emits a soft cyan ambient drop-shadow (`box-shadow: 0 0 20px rgba(0,240,255,0.4)`), and routes audio preview playback to the song's `previewTime`.



### Difficulty Star Rating Color Spectrum

Star ratings in osu!(lazer) use standardized color grading to indicate physical execution difficulty:

| Star Rating Range ($\star$) | Tier Name | Primary Color | Hex Code | Visual Badge Characteristics |
| --- | --- | --- | --- | --- |
| **$0.00 - 1.99\star$** | Easy | Pale Cyan | `#4290FB` | Soft blue border, matte fill |
| **$2.00 - 2.69\star$** | Normal | Emerald Green | `#4FFB53` | Vibrant green border, soft glow |
| **$2.70 - 3.99\star$** | Hard | Bright Gold | `#FBE24F` | High-contrast yellow |
| **$4.00 - 5.29\star$** | Insane | Vivid Coral | `#FB8C4F` | Deep orange-red border |
| **$5.30 - 6.49\star$** | Expert | Hot Pink | `#FB4F78` | Radiant magenta glow |
| **$6.50 - 7.99\star$** | Master | Deep Violet | `#8F4FFB` | Intense purple neon bloom |
| **$8.00+\star$** | Grandmaster | Crimson Obsidian | `#1A0B2E` | Dark metallic obsidian with crimson neon aura |

### Difficulty Details and Leaderboards Panel

The right panel ($50\%$ width) renders the comprehensive technical breakdown of the selected difficulty:

1. **Banner Header**: Full-width cropped artwork banner with dark bottom gradient fade. Overlaid with title, unicode artist, mapper avatar, and difficulty name.
2. **Technical Statistics Grid**:
* **Star Rating Badge**: Prominent pill with star icon and tier color.
* **Key Count Badge**: Distinct `4K` or `7K` emblem.
* **BPM**: Displays single value or dynamic range (e.g., `180 - 240 BPM`).
* **Drain Time**: Formatted as `MM:SS`.
* **Object Counts**: Single Tap Notes count vs Long Notes (LN) count, including LN percentage indicator (e.g., `278 LNs (11.5%)`).
* **OD and HP**: Precise progress bars for Overall Difficulty ($OD$) and Health Drain Rate ($HP$).


3. **Leaderboard Tabs (`Local` / `Global` / `Friends`)**:
* Scrollable list of recorded scores.
* Each row displays: Numerical Placement (`#1`), Glowing Grade Badge (`SS`, `S`, `A`), Player Name, Total Score (`1,000,000`), Accuracy (`100.00%`), Max Combo (`2,140x`), Mod Badges (`HD`, `DT`), and Unstable Rate (`UR 54.2`).
* Clicking any score opens the full Results Screen modal in inspection mode.



### Bottom Action Bar

A full-width footer anchored to the bottom edge:

* `BACK` Button (`ESC`): Return to Main Menu.
* `MODS` Button (`F1`): Opens Mod Selection modal; displays currently active mod icons with cumulative score multiplier (e.g., `1.12x`).
* `RANDOM` Button (`F2`): Selects random beatmap; `Shift + F2` selects random difficulty within active set.
* `OPTIONS` Button (`F3`): Opens contextual menu (Delete map, Export `.osz`, Clear local scores).
* `PLAY` Button (`Enter` / `Space`): Giant glowing neon green wedge button on the right edge. On hover, pulses with bright green specular flare.

---

## Mod Selection Overlay Modal

When triggered via the bottom action bar or the `F1` shortcut, a full-screen frosted glass overlay (`backdrop-filter: blur(20px)`) animates into view.

```
+----------------------------------------------------------------------------------------------------+
| MOD SELECTION: [All] [Difficulty Reduction] [Difficulty Increase] [Automation] [Conversion]        |
+----------------------------------------------------------------------------------------------------+
|  DIFFICULTY REDUCTION (Score < 1.0x)   DIFFICULTY INCREASE (Score > 1.0x)    CONVERSION / SPECIAL  |
|  +---------------------------------+   +---------------------------------+   +-------------------+ |
|  | [ EZ ] Easy          (0.50x)    |   | [ HR ] Hard Rock     (1.06x)    |   | [ MR ] Mirror     | |
|  | [ NF ] No Fail       (0.50x)    |   | [ DT ] Double Time   (1.12x)    |   | [ RD ] Random     | |
|  | [ HT ] Half Time     (0.50x)    |   | [ NC ] Nightcore     (1.12x)    |   | [ 4K ] Key Mod    | |
|  +---------------------------------+   | [ HD ] Hidden        (1.06x)    |   +-------------------+ |
|                                        | [ FI ] Fade In       (1.06x)    |                         |
|                                        | [ FL ] Flashlight    (1.12x)    |                         |
|                                        +---------------------------------+                         |
+----------------------------------------------------------------------------------------------------+
| ACTIVE MODS: [ DT (1.5x Speed) ] [ HD (Fade Out) ]          | CUMULATIVE MULTIPLIER: 1.18x         |
| [ DESELECT ALL ]                                                           [ CLOSE MODS (Esc) ]    |
+----------------------------------------------------------------------------------------------------+

```

### Mod Classification Matrix for Mania

| Mod Identifier | Mod Name | Classification | Score Multiplier | Gameplay Effect in Mania Mode |
| --- | --- | --- | --- | --- |
| **EZ** | Easy | Reduction | $0.50\times$ | Larger hit windows, reduced HP drain rate, halved scroll speed |
| **NF** | No Fail | Reduction | $0.50\times$ | Player cannot fail even if HP drops to $0.0$ |
| **HT** | Half Time | Reduction | $0.50\times$ | Music playback rate slowed to $0.75\times$ speed |
| **HR** | Hard Rock | Increase | $1.06\times$ | Stricter hit windows (increased $OD$), increased HP drain rate |
| **DT** | Double Time | Increase | $1.12\times$ | Music playback rate accelerated to $1.50\times$ speed |
| **NC** | Nightcore | Increase | $1.12\times$ | $1.50\times$ speed with audio pitch shifted up (chipmunk filter) |
| **HD** | Hidden | Visibility | $1.06\times$ | Notes fade out midway down the stage before reaching receptors |
| **FI** | Fade In | Visibility | $1.06\times$ | Notes spawn invisible at top, fading in near the receptors |
| **FL** | Flashlight | Visibility | $1.12\times$ | Restricts visible playfield to a small radial beam around hit area |
| **MR** | Mirror | Conversion | $1.00\times$ | Horizontally inverts column mapping ($C_i \to C_{K - 1 - i}$) |
| **RD** | Random | Conversion | $1.00\times$ | Randomly shuffles column assignments across the chart |
| **AT** | Auto | Automation | $0.00\times$ | Perfect AI bot playback achieving 100% SS score |

---

## In-Game Playfield and HUD Layout

The in-game gameplay screen represents the highest-density real-time visual environment, coordinating falling notes, glowing receptors, particle flares, rolling HUD readouts, and timing error feedback.

```
+----------------------------------------------------------------------------------------------------+
| [HP BAR: ========================]      [ SONG PROGRESS: 01:42 / 03:15 ]     [ SCORE: 00,842,150 ] |
|                                                                              [ ACCURACY: 99.82%  ] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                       +-----------------------+                                    |
|                                       | |   |   |   |   |   | |                                    |
|                                       | |   | O |   |   | O | | <-- Falling Single Notes (Argon)   |
|                                       | |   |   |   |   |   | |                                    |
|                                       | | H |   |   |   |   | |                                    |
|                                       | | | |   |   |   |   | | <-- Hold Note Body (Ribbon Mesh)   |
|                                       | | T |   |   |   |   | |                                    |
|                                       | +---+---+---+---+---+ |                                    |
|                                       | |   COMBO: 1,420x   | | <-- Bouncing Combo Counter         |
|                                       | |     PERFECT!      | | <-- Floating Judgment Popups       |
|                                       | +===================+ | <-- Receptor Line (Hit Position)   |
|                                       |   / | \   / | \       | <-- Stage Lighting Gradient Beams  |
|                                       +-----------------------+                                    |
|                                         [---|||||*|||||---]     <-- Hit Error Bar & UR (54.2)      |
+----------------------------------------------------------------------------------------------------+

```

### Playfield Stage Geometry and Column Configurations

The playfield stage is centered horizontally on the canvas. The total width scales directly with key count $K$:

$$\text{Stage Width} = K \times W_{\text{col}}, \quad \text{where default } W_{\text{col}} = 64\text{px}$$

* **4K Stage Width**: $4 \times 64\text{px} = 256\text{px}$
* **7K Stage Width**: $7 \times 64\text{px} = 448\text{px}$
* **Stage Backdrop**: Deep obsidian `#0A0C10` with $85\%$ opacity, bordered on left and right by $2\text{px}$ vertical neon bevels.
* **Lane Dividers**: $1\text{px}$ semi-transparent white/cyan lines separating each column.

### Argon Note Styling and Column Color Symmetry

Argon notes feature a sleek pill shape with a $6\text{px}$ corner radius, a vibrant neon border, and a subtle inner gradient fill:

```
        +----------------------------+
        |   ARGON SINGLE TAP NOTE    |  Height: 18px, Corner Radius: 6px
        +----------------------------+
        
        +----------------------------+  <-- Hold Head Note (18px)
        | ########################## |
        | ########################## |  <-- Hold Body Ribbon (Translucent Mesh 65%)
        | ########################## |
        +----------------------------+  <-- Hold Tail Cap Note (Inverted Bevel)

```

The color assignments follow symmetrical column patterns to optimize peripheral visual parsing:

* **4K Symmetry (`Cyan - Yellow - Yellow - Cyan`)**:
* Lane 0: Neon Cyan `#00F0FF`
* Lane 1: Electric Yellow `#FFCC00`
* Lane 2: Electric Yellow `#FFCC00`
* Lane 3: Neon Cyan `#00F0FF`


* **7K Symmetry (`Cyan - Blue - Cyan - Yellow - Cyan - Blue - Cyan`)**:
* Lane 0: Neon Cyan `#00F0FF`
* Lane 1: Electric Blue `#0088FF`
* Lane 2: Neon Cyan `#00F0FF`
* Lane 3 (Center Spacebar): Electric Yellow `#FFCC00`
* Lane 4: Neon Cyan `#00F0FF`
* Lane 5: Electric Blue `#0088FF`
* Lane 6: Neon Cyan `#00F0FF`



### Receptors, Stage Lighting, and Hit Bursts

1. **Receptors**:
* Located at the receptor line ($80\text{px}$ from bottom edge for downscroll).
* Rendered as rounded rectangle outlines with subtle glowing borders.
* **Key Depression State**: When the bound key is held down, the receptor flashes pure white, scales down slightly ($0.95\times$), and emits an intense upward stage lighting beam.


2. **Stage Lighting (Key Area Beams)**:
* A linear gradient beam originating from the receptor and fading to zero alpha $250\text{px}$ up the column track.
* Colored to match the specific column's note tint.


3. **Hit Explosions (Particle Bursts)**:
* Triggered immediately upon note judgment.
* Consists of a central radial flare expanding from $20\text{px} \to 60\text{px}$ over $180\text{ms}$, accompanied by $8 - 12$ velocity-driven geometric sparks that disperse outward and fade.



### Real-Time Judgment Popup System

Judgments render directly above the receptor zone (approx. $90\text{px}$ above hit line) with tier-specific visual treatments:

```
+----------------------------------------------------------------------------------------------------+
| JUDGMENT TIER VISUAL SPECIFICATION MATRIX                                                         |
+------------+-------------+----------------------+--------------------+-----------------------------+
| Judgment   | Hex Color   | Scale Animation      | Duration & Fade    | Special Visual FX           |
+------------+-------------+----------------------+--------------------+-----------------------------+
| PERFECT    | `#00F0FF`   | 1.35x -> 1.00x Pop   | 450ms OutQuint     | Chromatic aberration glow   |
| GREAT      | `#FFCC00`   | 1.20x -> 1.00x Pop   | 400ms OutQuint     | Warm golden specular bloom  |
| GOOD       | `#00FF66`   | 1.10x -> 1.00x Pop   | 350ms OutQuint     | Emerald green text flare    |
| OK         | `#0088FF`   | 1.00x Static         | 300ms OutQuint     | Matte blue text             |
| MEH        | `#888888`   | 0.90x Static         | 250ms Linear       | Dim greyish-orange text     |
| MISS       | `#FF1E56`   | 1.40x -> 1.00x Drop  | 500ms OutElastic   | Screen shake + Red fracture |
+------------+-------------+----------------------+--------------------+-----------------------------+

```

### Combo Counter Dynamics

* **Location**: Centered above the judgment popup text.
* **Typography**: Bold tabular numerals, $36\text{px}$ font size.
* **Scale Bounce**: On every combo increment, scales from $1.20\times \to 1.00\times$ with `OutElastic` spring easing.
* **Milestone Flares**: At $100\text{x}$, $500\text{x}$, and $1,000\text{x}$ combo milestones, an ambient radial shockwave expands across the stage width with a celebratory audio chime.
* **Combo Break**: Upon receiving a `Miss`, the combo digits turn crimson red, drop downward $20\text{px}$, shatter into particles, and reset to $0\text{x}$.

### Health Display (HP Bar)

* **Location**: Top-left corner of the viewport ($320\text{px} \times 16\text{px}$).
* **Visual Structure**: Outer dark glass capsule containing an animated fluid fill.
* **Dynamic Gradients**:
* Health $> 50\%$: Cyan-to-Emerald gradient (`#00F0FF` to `#00FF66`).
* Health $25\% - 50\%$: Amber gradient (`#FFCC00` to `#FF8800`).
* Health $< 25\%$: Pulsing Crimson gradient (`#FF1E56` to `#FF0033`).


* **Low Health Warning**: When HP drops below $20\%$, a heavy red vignette encircles the entire screen perimeter, pulsing rhythmically in sync with an audible heartbeat cue.

### Hit Error Bar (Unstable Rate Meter)

Anchored horizontally directly beneath the playfield stage ($300\text{px} \times 10\text{px}$):

```
                       [ EARLY ]      CENTER (0ms)      [ LATE ]
                      +---------------------*---------------------+
                      | [MEH] [OK] [GOOD] [PERF] [GOOD] [OK] [MEH]|
                      +---------------------|---------------------+
                                            ^
                                     Mean Error Marker (Running Average)

```

1. **Zone Segments**: Symmetrical color-coded bands representing Perfect ($\pm 16\text{ms}$, Cyan), Great (Orange), Good (Green), OK (Blue), and Meh/Miss (Red).
2. **Hit Ticks**: Every registered tap spawns a $2\text{px}$-wide vertical line at its exact millisecond offset ($\Delta t$). Early hits appear on the left; late hits appear on the right. Ticks fade out over $2.0$ seconds.
3. **Running Mean Indicator**: A small glowing diamond indicator shifts dynamically along the bar representing the running average offset $\bar{\Delta t}$, allowing the player to detect whether they are consistently rushing or dragging.
4. **UR Readout**: Live numerical Unstable Rate displayed in compact tabular text below the bar (e.g., `UR: 54.23`).

---

## Pause, Resume, and Fail Overlays

The game lifecycle incorporates distinct state transitions for pausing and failing that preserve visual clarity without disrupting player focus.

### Pause Overlay (`ESC`)

1. **Visual Freeze**: The game audio pauses instantly; the WebGL playfield freezes in place; a dark glass overlay (`backdrop-filter: blur(16px) bg-[#08090d]/80`) fades in over $200\text{ms}$.
2. **Track Summary**: The center displays the song title, artist, active score, and current completion percentage.
3. **Action Buttons**: Vertical stack of three $-12^\circ$ skewed pill buttons:
* `CONTINUE` (Bright Cyan border, `ESC` / `Enter`): Triggers the Resume Countdown.
* `RETRY` (Warm Gold border, `Ctrl+R`): Restarts beatmap from $t = 0$.
* `QUIT` (Dark Slate border, `Q`): Exits back to Song Select.


4. **Resume Countdown Sub-State**: When `CONTINUE` is selected, the pause menu fades, revealing the frozen playfield with a massive centered countdown ring: `3... 2... 1... GO!`. Audio resumes smoothly with a $150\text{ms}$ volume ramp-in.

### Fail Overlay (HP Reaches 0.0)

1. **Failure Trigger**: When health reaches $0.0$, the audio executes a simulated tape-stop deceleration (pitch and playback rate dropping to $0$ over $600\text{ms}$).
2. **Shatter Effect**: The playfield stage fractures with visual screen shake, desaturating to black and white with a deep crimson vignette overlay.
3. **Failed Banner**: A large glowing crimson badge displays `FAILED`.
4. **Action Choices**: `RETRY` (Large glowing button) and `QUIT` (Return to song select).

---

## Results and Performance Breakdown Screen

Upon completing a beatmap, the game transitions to the Results Screen, presenting an exhaustive statistical breakdown of player performance.

```
+----------------------------------------------------------------------------------------------------+
| RESULTS: Camellia - Crystallized [4K MASTER]                                                       |
+----------------------------------------------------------------------------------------------------+
|  GRADE SHOWCASE             PRIMARY METRICS                     DETAILED JUDGMENT MATRIX           |
|                             TOTAL SCORE                         +--------------------------------+ |
|      +----------+           [ 1,000,000 ]                       | PERFECT (305): 2,140  (88.5%)  | |
|     /   ####     \                                              | GREAT   (300):   270  (11.2%)  | |
|    /   #    #     \         ACCURACY         MAX COMBO          | GOOD    (200):     8   (0.3%)  | |
|   |     ####       |        [ 99.85% ]       [ 2,418x ]         | OK      (100):     0   (0.0%)  | |
|   |         #      |                                            | MEH      (50):     0   (0.0%)  | |
|    \   #    #     /         PERFORMANCE      MODS USED          | MISS      (0):     0   (0.0%)  | |
|     \   ####     /          [ +342 pp ]      [ DT, HD ]         +--------------------------------+ |
|      +----------+                                               HIT ERROR & TIMING DISTRIBUTION    |
|       SS (GOLD)             FULL COMBO !                        +--------------------------------+ |
|                                                                 |     _/\_     UR: 54.2          | |
|                                                                 |    /    \    Mean: -1.2ms      | |
+----------------------------------------------------------------------------------------------------+
| [ < SONG SELECT ]                 [ WATCH REPLAY (F1) ]   [ RETRY (F2) ]         [ CONTINUE (Enter) ]|
+----------------------------------------------------------------------------------------------------+

```

### Grade Badge Visual Specifications

The rank grade is rendered as a prominent 3D-styled metallic badge with ambient particle emission:

```
+----------------------------------------------------------------------------------------------------+
| GRADE RANKING BADGE ASSET SPECIFICATIONS                                                          |
+------------+--------------------+-------------------------+----------------------------------------+
| Rank Grade | Accuracy Criteria  | Primary Color Gradient  | Visual Embellishments                  |
+------------+--------------------+-------------------------+----------------------------------------+
| SS (Silver)| 100% (HD / FI / FL)| Silver Chrome Gradient  | Diamond sparkle flare, metallic sheen  |
| SS (Gold)  | 100% Standard      | Radiant Gold (#FFD700)  | Radial gold particle burst, light rays |
| S (Silver) | >=95% (HD/FI/FL)   | Silver Chrome Gradient  | Silver sheen, gentle glow              |
| S (Gold)   | >=95% (0 Misses)   | Radiant Gold (#FFD700)  | Gold glow outline                      |
| A          | >=90%              | Emerald Green (#00FF66) | Green neon border                      |
| B          | >=80%              | Electric Blue (#0088FF) | Cyan-blue neon border                  |
| C          | >=70%              | Amber Orange (#FF9900)  | Orange border                          |
| D          | <70%               | Crimson Red (#FF1E56)   | Dim crimson border                     |
+------------+--------------------+-------------------------+----------------------------------------+

```

### Performance Metrics and Analysis Graphs

1. **Primary Score Counters**: Bold animated counters that rapidly increment from zero to final values upon screen entry:
* **Score Counter**: Tabular black font, scaling to $1,000,000$.
* **Accuracy Display**: Formatted to two decimal places (e.g., `99.85%`).
* **Max Combo Indicator**: Highlighted with a glowing green `FULL COMBO!` banner if no misses or combo breaks occurred.


2. **Detailed Judgment Matrix**: A two-column structured table displaying each judgment tier, corresponding point value ($305, 300, 200, 100, 50, 0$), exact count, and percentage share.
3. **Hit Error Distribution Graph**: A Gaussian histogram plotting hit frequency across millisecond offset bins from $-100\text{ms}$ to $+100\text{ms}$. Displays the calculated Unstable Rate ($UR = 10 \times \sigma$) and mean timing bias.

---

## Settings, Customization Drawer, and Key Binding Matrix

The Settings menu is designed as an interactive sliding drawer accessible via the top toolbar or `Ctrl+O`.

```
+----------------------------------------------------------------------------------------------------+
| SETTINGS & PREFERENCES: [ Audio ] [ Graphics ] [ Input / Keybinds ] [ Mania Gameplay ] [ Skinning ]|
+----------------------------------------------------------------------------------------------------+
|  MANIA KEY BINDING CONFIGURATION                                                                   |
|  Select Layout: [ 4K ]  [ 5K ]  [ 6K ]  [ 7K ]  [ 8K ]  [ 9K ]                                     |
|                                                                                                    |
|  4K Key Mapping:                                                                                   |
|  +-------------------+-------------------+-------------------+-------------------+                 |
|  | Column 1 (Left)   | Column 2 (Down)   | Column 3 (Up)     | Column 4 (Right)  |                 |
|  | [ Key: D ]        | [ Key: F ]        | [ Key: J ]        | [ Key: K ]        |                 |
|  +-------------------+-------------------+-------------------+-------------------+                 |
|                                                                                                    |
|  7K Key Mapping:                                                                                   |
|  +--------+--------+--------+-----------------------+--------+--------+--------+                   |
|  | Col 1  | Col 2  | Col 3  | Col 4 (Center Space)  | Col 5  | Col 6  | Col 7  |                   |
|  | [ S ]  | [ D ]  | [ F ]  | [ Spacebar ]          | [ J ]  | [ K ]  | [ L ]  |                   |
|  +--------+--------+--------+-----------------------+--------+--------+--------+                   |
|                                                                                                    |
|  MANIA GAMEPLAY OPTIONS                                                                            |
|  Scroll Speed Mode:       (o) Fixed Duration (ms)     ( ) BPM-Scaled Speed                         |
|  Scroll Speed Value:      [===========|==============] 500 ms (Speed 28.0)                         |
|  Scroll Direction:        (o) Downscroll              ( ) Upscroll                                 |
|  Stage Position:          ( ) Left         (o) Center        ( ) Right                             |
|  Column Width:            [========|==================] 64 px                                      |
|  Hit Position (Offset):   [===================|======] 80 px from bottom                           |
+----------------------------------------------------------------------------------------------------+

```

### Comprehensive Settings Specification Matrix

| Category | Setting Parameter | UI Control Type | Range / Options | Default Value |
| --- | --- | --- | --- | --- |
| **Audio** | Master Volume | Slider ($0 - 100\%$) | $0 - 100$ | $100\%$ |
|  | Music Volume | Slider ($0 - 100\%$) | $0 - 100$ | $80\%$ |
|  | Hitsound / Effect Volume | Slider ($0 - 100\%$) | $0 - 100$ | $100\%$ |
|  | Universal Audio Offset | Stepper / Slider | $\pm 300\text{ ms}$ | $0\text{ ms}$ |
| **Graphics** | Frame Pacing / Limiter | Segmented Toggle | `60`, `120`, `144`, `240`, `Unlimited` | `240 FPS` |
|  | Background Dim | Slider ($0 - 100\%$) | $0 - 100$ | $80\%$ |
|  | Background Blur | Slider ($0 - 100\%$) | $0 - 100$ | $40\%$ |
|  | UI Scaling | Slider ($80 - 150\%$) | $80 - 150$ | $100\%$ |
| **Mania** | Scroll Direction | Radio Buttons | `Downscroll`, `Upscroll` | `Downscroll` |
|  | Scroll Duration / Speed | Slider | $200\text{ ms} - 1000\text{ ms}$ | $500\text{ ms}$ (Speed 28) |
|  | Stage Position | Segmented Toggle | `Left`, `Center`, `Right` | `Center` |
|  | Column Width | Slider | $48\text{px} - 96\text{px}$ | $64\text{px}$ |
|  | Hit Error Bar Visibility | Toggle Switch | `Enabled`, `Disabled` | `Enabled` |
|  | Keybind Configuration | Interactive Rebind Grid | Any Keyboard Event Code | 4K: `D/F/J/K`, 7K: `S/D/F/Space/J/K/L` |

---

## Audio-Visual Sound Effects and UI Micro-Interactions

A faithful recreation of osu!(lazer) mania requires matching the acoustic feedback cues accompanying every interface interaction and gameplay event.

```
+----------------------------------------------------------------------------------------------------+
| AUDIO-VISUAL FEEDBACK MAPPING MATRIX                                                              |
+----------------------+--------------------+--------------------------------+-----------------------+
| User Action / Event  | Audio Sample Asset | Visual Animation / Effect      | Haptic / Shader FX    |
+----------------------+--------------------+--------------------------------+-----------------------+
| Button Hover         | `hover.wav`        | Skewed card scales 1.05x       | Specular border flash |
| Button Click         | `click.wav`        | Quick scale down to 0.95x      | Ripple shockwave      |
| Tab Switch           | `tab-select.wav`   | Underline slides with OutQuint | Opacity crossfade     |
| Mod Toggle (On)      | `check-on.wav`     | Mod icon rotates 6deg + glows  | Green border aura     |
| Mod Toggle (Off)     | `check-off.wav`    | Mod icon dims to grey          | None                  |
| Perfect Hit (MAX)    | `mania-hit.wav`    | Cyan receptor flare (60px)     | Radial particle burst |
| Great Hit (300)      | `mania-hit.wav`    | Gold receptor flare (45px)     | Soft golden sparks    |
| Combo Milestone      | `combo-cheer.wav`  | Stage-wide horizontal wave     | Accent flash          |
| Combo Break (Miss)   | `combobreak.wav`   | Digits shatter, screen shakes  | 4px camera shake      |
| Low Health Trigger   | `heartbeat.wav`    | Perimeter red vignette pulses  | Chromatic pulse       |
| Song Pass (Results)  | `applause.wav`     | Grade badge explodes into view | Ambient light rays    |
+----------------------+--------------------+--------------------------------+-----------------------+

```

---

## Synthesis and Strategic Implementation Blueprint for Developers

This exhaustive user interface and visual design blueprint covers every component, coordinate space, color code, animation curve, and interaction model of osu!(lazer) mania.

```
+----------------------------------------------------------------------------------------------------+
|                               FIVE-TIER UI IMPLEMENTATION ROADMAP                                  |
+----------------------------------------------------------------------------------------------------+
| [TIER 1] Design System Core (Tailwind tokens, Torus/Exo fonts, SkewContainer component)            |
| [TIER 2] Navigation & Song Select (Carousel virtualized stack, difficulty badges, details panel)   |
| [TIER 3] Mod Overlay & Settings Drawer (Category tabs, mod matrix, interactive key rebind grid)    |
| [TIER 4] Pixi.js Gameplay HUD (Argon notes, symmetrical colors, receptors, hit error bar)          |
| [TIER 5] Results Screen & Polish (Grade badge shaders, UR Gaussian graphs, audio sample routing)   |
+----------------------------------------------------------------------------------------------------+

```

### Key Engineering Directives

1. **Enforce Transform Symmetry**: Always pair outer `-skew-x-[12deg]` wrappers with inner `skew-x-[12deg]` content holders to maintain absolute vertical legibility for text and album artwork.
2. **Guarantee Tabular Numerals**: Apply `font-variant-numeric: tabular-nums` to all score, combo, accuracy, and timer elements to eliminate horizontal layout jitter.
3. **Strict Separation of UI and Canvas Layers**: Render high-frequency gameplay elements (falling notes, hold bodies, receptor bursts, lighting beams) on the Pixi.js WebGL canvas, while keeping meta-navigation (Song Select, Mod Overlay, Settings, Results) in declarative React/Tailwind layers.

---

## References

* [ppy/osu GitHub Repository](https://github.com/ppy/osu) — Official open-source codebase for osu!(lazer).
* [Argon Skinning Implementation in osu!(lazer)](https://www.google.com/search?q=https://github.com/ppy/osu/tree/master/osu.Game.Rulesets.Mania/Skinning/Argon) — Official source for Argon note pieces, hold bodies, and receptor visuals.
* [ManiaPlayfield.cs Source Code](https://www.google.com/search?q=https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Mania/UI/ManiaPlayfield.cs) — Stage layout, column geometry, and receptor positioning.
* [osu! Overall Difficulty Specification](https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty#osu!mania) — Hit window mathematical formulas and timing thresholds.
* [HitErrorMeter Components in osu!(lazer)](https://www.google.com/search?q=https://github.com/ppy/osu/tree/master/osu.Game/Screens/Play/HUD/HitErrorMeters) — Architecture of the visual hit error bar and Unstable Rate tracking.
* [Pixi.js v8 Architecture and Rendering Guide](https://pixijs.com/) — WebGL/WebGPU 2D rendering engine.
