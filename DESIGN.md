# RhythmMania Interface System

## Direction

RhythmMania uses a compact, dark arcade interface for focused play setup. The
world is image-backed and atmospheric, with deep indigo surfaces, restrained
glass layering, cyan interaction accents, and warm pink background energy.
The UI should feel like a rhythm-game control room rather than a generic SaaS
dashboard.

## Surface Patterns

- Operate screens should stay dense and task-oriented.
- Use image art as a low-opacity backdrop with a dark directional overlay.
- Use translucent charcoal and indigo panels above the backdrop.
- Prefer subtle 1px white borders at low opacity over heavy outlines.
- Use shallow soft shadows for lifted previews and selected assets.
- Keep one focal element per screen. In the Skins menu this is the active
  playfield preview.

## Tokens

- Base canvas: `#17142b` / `#050508`.
- Raised panel: `#111119` with 70-95% opacity.
- Primary text: white or slate-100.
- Secondary text: slate-400 or white at 45-65% opacity.
- Interaction accent: cyan-200 through the existing `--skin-accent` tokens.
- Selection surface: white frame with dark check badge.
- Spacing base: 4px, with 8px and 12px component rhythm and 16px section
  separation.
- Radius scale: 6px controls, 8px compact panels, 12px major panels.

## Typography

- Use the existing Space Grotesk stack for interface text.
- Use JetBrains Mono only for measurements, bindings, or technical metadata.
- Headings use weight and tracking for hierarchy rather than oversized type.
- Compact labels may use 10-12px with clear line-height and sufficient
  contrast.

## Navigation

- The primary header uses icon-first controls that expand to text at the
  `sm` breakpoint.
- The Skins control uses the Lucide Paintbrush icon and sits after Beatmap
  Listing and before Settings.
- Active navigation uses the existing dark-blue selected surface and an
  inset highlight, not a bright saturated fill.

## Skins Menu

- The page title is `Skin Assets`, paired with the Paintbrush icon.
- The main layout is constrained to roughly 1120px and remains compact.
- The active playfield preview is paired with a narrow Equipped panel.
- Four style assets are exposed:
  - RhythmMania Style Rectangular
  - RhythmPlus Classic Style Rectangular
  - RhythmPlus Dynamic Style Rectangular
  - Circular Style
- Style assets are displayed as a three-column compact rail with a white
  selected frame and check badge.
- Style selection maps to `playfieldStyle` and `squareRenderStyle`, applies
  immediately, and persists through the existing settings pipeline.
- Skin tuning controls live on the same page in a two-column grid of compact
  dark panels. Each control has a label, short description, and reset affordance
  when changed from default.
- The skin menu owns per-lane colors, note and receptor sizing,
  note/receptor opacity, judgement opacity/size/position, and lane separator
  opacity.
- Skin preview images use `/skin/rhythmmania-style-rectangular.webp`,
  `/skin/rhythmplus-classic-style-rectangular.webp`, and
  `/skin/circular-style.webp`.

## Interaction And Accessibility

- Use native buttons and inputs for all controls.
- Every asset card exposes `aria-pressed` and has a visible keyboard focus
  ring.
- Selected states need both a visual frame and a semantic state.
- Keep hit areas at least 40px for navigation and reset controls.
- Changes should be immediate and should not require a save button.
- Respect reduced motion by keeping movement subtle and limiting transitions
  to transform, opacity, and color.
