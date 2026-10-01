/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import { IPlayfieldRenderer, PlayfieldFrame, InitOpts } from './types';
import {
  ARGON_COLUMN_GAP,
  ARGON_CORNER_RADIUS,
  ARGON_NOTE_ACCENT_RATIO,
  getArgonNoteHeight,
} from './argonSkin';
import { darkenCached, getCachedRgb01, lightenCached } from './colorCache';
import { getFlashlightRadius } from './flashlight';
import { getNoteVisualY } from './playfieldLayout';
import { resolvePlayfieldStyle } from './skinTheme';
import { isHoldBodyAnchored, isHoldSuccessfullyCompleted } from './noteState';
import { mergeVisibleTailSegments } from './tailSegments';

/**
 * Raw WebGL2 batched quad playfield renderer (Argon and RhythmPlus skins).
 *
 * SV parity is structural: this renderer never recomputes scroll positions.
 * All Y values come from `PlayfieldFrame` (built by `getVisibleNotes` with
 * the shared `ScrollModel`), so SV freeze/reverse, upscroll, and HD/FI
 * cover opacity all come from shared frame math. Only rasterization happens
 * here: notes, holds, receptors, and the Flashlight vignette.
 *
 * Design for low latency / high throughput:
 * - One shader program, one VAO/VBO, ~1 draw call per frame.
 * - Preallocated Float32Array ring (zero per-frame allocation in steady state).
 * - Opaque low-latency context (alpha:false, desynchronized, no AA, no
 *   preserveDrawingBuffer).
 * - No text, no textures, no readback.
 * - Argon note glyphs (rice chevron, hold-head bar) are procedural SDFs in
 *   the fragment shader, keyed by a per-vertex glyph id. Zero extra quads,
 *   zero extra draw calls.
 */

const VERTEX_SRC = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColorTop;
layout(location=2) in vec4 aColorBottom;
layout(location=3) in vec2 aUv;
layout(location=4) in vec2 aSize;
layout(location=5) in float aRadius;
layout(location=6) in float aGlyph;
uniform vec2 uResolution;
uniform float uDpr;
out vec4 vColorTop;
out vec4 vColorBottom;
out vec2 vUv;
out vec2 vSize;
out float vRadius;
out float vGlyph;
void main() {
  vec2 px = aPos * uDpr;
  vec2 clip = vec2(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vColorTop = aColorTop;
  vColorBottom = aColorBottom;
  vUv = aUv;
  vSize = aSize * uDpr;
  vRadius = aRadius * uDpr;
  vGlyph = aGlyph;
}
`;

const FRAGMENT_SRC = `#version 300 es
// highp (not mediump): uniforms shared with the vertex stage (uDpr,
// uGlyphFlip) must use identical precision in both stages or the link fails.
precision highp float;
in vec4 vColorTop;
in vec4 vColorBottom;
in vec2 vUv;
in vec2 vSize;
in float vRadius;
in float vGlyph;
uniform float uDpr;
uniform float uGlyphFlip;
uniform vec2 uVigCenter;
uniform float uVigRadius;
out vec4 outColor;
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec2 p = vUv * vSize;
  if (vGlyph > 2.5) {
    // Flashlight vignette (fullscreen quad): transparent hole of 0.45R at
    // the receptor, then the legacy ramp 0 -> 0.45 -> 0.88 -> 1.0.
    float dn = length((p - uVigCenter) / max(uVigRadius, 1e-3));
    float t = clamp((dn - 0.45) / 0.55, 0.0, 1.0);
    float va = t <= 0.0 ? 0.0 : (t < 0.5 ? mix(0.0, 0.45, t * 2.0) : (t < 0.8 ? mix(0.45, 0.88, (t - 0.5) / 0.3) : mix(0.88, 1.0, (t - 0.8) / 0.2)));
    outColor = vec4(0.0, 0.0, 0.0, va);
    return;
  }
  vec2 b = vSize * 0.5;
  float r = min(vRadius, min(b.x, b.y));
  vec2 q = abs(p - b) - b + r;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = fwidth(dist) + 1e-4;
  float alpha = 1.0 - smoothstep(-aa, aa, dist);
  if (alpha <= 0.001) discard;
  vec4 col = mix(vColorTop, vColorBottom, vUv.y);
  if (vGlyph > 0.5) {
    // Argon glyphs live on the note slab: rice chevron and hold-head bar,
    // both geometrically centered on the slab per the skin reference.
    float gy = mix(p.y, vSize.y - p.y, uGlyphFlip);
    float cx = vSize.x * 0.5;
    float gsize = min(20.0 * uDpr, vSize.x * 0.42);
    float aa2 = uDpr;
    // The glyph quad is the full-height note slab, so the note center is
    // the quad center.
    float cy = vSize.y * 0.5;
    float mask = 0.0;
    if (vGlyph < 1.5) {
      float halfW = gsize * 0.38;
      float halfH = gsize * 0.22;
      float t = max(4.2 * uDpr, gsize * 0.23);
      float cyy = cy;
      vec2 gp = vec2(p.x, gy);
      vec2 a = vec2(cx - halfW, cyy - halfH);
      vec2 bb = vec2(cx, cyy + halfH);
      vec2 c = vec2(cx + halfW, cyy - halfH);
      float d = min(segDist(gp, a, bb), segDist(gp, bb, c));
      mask = 1.0 - smoothstep(t * 0.5 - aa2, t * 0.5 + aa2, d);
    } else {
      float barH = 8.0 * uDpr;
      float cyy = cy;
      vec2 qq = abs(vec2(p.x - cx, gy - cyy)) - vec2(max(gsize * 0.5 - barH * 0.5, 0.0), 0.0);
      float d = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - barH * 0.5;
      mask = 1.0 - smoothstep(-aa2, aa2, d);
    }
    col.rgb = mix(col.rgb, vec3(1.0), mask);
  }
  col.a *= alpha;
  outColor = col;
}
`;

// Glyph ids for the aGlyph vertex attribute (SDF in the fragment shader).
const GLYPH_NONE = 0;
const GLYPH_CHEVRON = 1; // rice notes
const GLYPH_BAR = 2; // hold heads
const GLYPH_VIGNETTE = 3; // flashlight fullscreen vignette (radial, not SDF)

const FLOATS_PER_VERT = 16; // x,y + topRGBA + bottomRGBA + u,v + w,h + radius + glyph
const VERTS_PER_QUAD = 6;
const MAX_QUADS = 5120;
const BUFFER_FLOATS = MAX_QUADS * VERTS_PER_QUAD * FLOATS_PER_VERT;



export class WebGL2PlayfieldRenderer implements IPlayfieldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uDpr: WebGLUniformLocation | null = null;
  private uGlyphFlip: WebGLUniformLocation | null = null;
  private uVigCenter: WebGLUniformLocation | null = null;
  private uVigRadius: WebGLUniformLocation | null = null;
  // Flashlight vignette for the frame being uploaded (CSS px; null = off).
  // Stored at emission time, uploaded with the other uniforms.
  private vigRadiusCss: number | null = null;
  private buffer = new Float32Array(BUFFER_FLOATS);
  private quadCount = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private keyCount = 4;
  private onContextLost: ((e: Event) => void) | null = null;
  // Per-frame lane color scratch (max 10 lanes): reused to avoid 5×
  // Array(keyCount) allocations every rAF.
  private laneBaseScratch: Array<readonly [number, number, number] | null> = new Array(10).fill(null);
  private laneDarkLaneScratch: Array<readonly [number, number, number] | null> = new Array(10).fill(null);
  private laneDarkBodyScratch: Array<readonly [number, number, number] | null> = new Array(10).fill(null);
  private laneLightHeadScratch: Array<readonly [number, number, number] | null> = new Array(10).fill(null);
  private laneLightPulseScratch: Array<readonly [number, number, number] | null> = new Array(10).fill(null);

  async init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void> {
    this.destroy();
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      desynchronized: true,
      preserveDrawingBuffer: false,
      antialias: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 not available');
    if (gl.isContextLost()) throw new Error('WebGL2 context is lost');
    this.canvas = canvas;
    this.gl = gl;
    this.keyCount = opts.keyCount;

    const vs = this.compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL2 program creation failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL2 link failed: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    this.uResolution = gl.getUniformLocation(program, 'uResolution');
    this.uDpr = gl.getUniformLocation(program, 'uDpr');
    this.uGlyphFlip = gl.getUniformLocation(program, 'uGlyphFlip');
    this.uVigCenter = gl.getUniformLocation(program, 'uVigCenter');
    this.uVigRadius = gl.getUniformLocation(program, 'uVigRadius');

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('WebGL2 buffer creation failed');
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buffer.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    const attrib = (loc: number, offset: number, size: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attrib(0, 0, 2); // aPos
    attrib(1, 2, 4); // aColorTop
    attrib(2, 6, 4); // aColorBottom
    attrib(3, 10, 2); // aUv
    attrib(4, 12, 2); // aSize
    attrib(5, 14, 1); // aRadius
    attrib(6, 15, 1); // aGlyph
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL2 shader creation failed');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL2 compile failed: ${log}`);
    }
    return shader;
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas || !this.gl) return;
    this.cssWidth = width;
    this.cssHeight = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private pushQuadNumbers(
    x: number, y: number, w: number, h: number,
    tr: number, tg: number, tb: number, ta: number,
    br: number, bg: number, bb: number, ba: number,
    radius: number,
  ): void {
    if (w <= 0 || h <= 0) return;
    if (this.quadCount >= MAX_QUADS) return; // drop overflow; counters stay bounded
    const base = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERT;
    const buf = this.buffer;
    const x1 = x + w;
    const y1 = y + h;
    // Unrolled two triangles: (x,y)-(x1,y)-(x,y1) and (x1,y)-(x1,y1)-(x,y1).
    // No per-quad xs/ys/us/vs array allocations. Quad slots are reused
    // across frames, so the glyph lane (o+15) is explicitly zeroed here;
    // pushQuad patches it back for glyph quads only.
    // v0 (0,0)
    let o = base;
    buf[o] = x; buf[o + 1] = y;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 0; buf[o + 11] = 0; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    // v1 (1,0)
    o += FLOATS_PER_VERT;
    buf[o] = x1; buf[o + 1] = y;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 1; buf[o + 11] = 0; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    // v2 (0,1)
    o += FLOATS_PER_VERT;
    buf[o] = x; buf[o + 1] = y1;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 0; buf[o + 11] = 1; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    // v3 (1,0)
    o += FLOATS_PER_VERT;
    buf[o] = x1; buf[o + 1] = y;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 1; buf[o + 11] = 0; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    // v4 (1,1)
    o += FLOATS_PER_VERT;
    buf[o] = x1; buf[o + 1] = y1;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 1; buf[o + 11] = 1; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    // v5 (0,1)
    o += FLOATS_PER_VERT;
    buf[o] = x; buf[o + 1] = y1;
    buf[o + 2] = tr; buf[o + 3] = tg; buf[o + 4] = tb; buf[o + 5] = ta;
    buf[o + 6] = br; buf[o + 7] = bg; buf[o + 8] = bb; buf[o + 9] = ba;
    buf[o + 10] = 0; buf[o + 11] = 1; buf[o + 12] = w; buf[o + 13] = h; buf[o + 14] = radius; buf[o + 15] = 0;
    this.quadCount++;
  }

  private pushQuad(
    x: number, y: number, w: number, h: number,
    top: [number, number, number, number],
    bottom: [number, number, number, number],
    radius: number,
    glyph: number = GLYPH_NONE,
  ): void {
    // Two triangles in uv space: (0,0)-(1,0)-(0,1) and (1,0)-(1,1)-(0,1).
    // Slot A always carries the top stop, slot B the bottom stop; the
    // fragment shader mixes by uv.y. Glyph quads are rare (notes only), so
    // the 6-slot patch runs only when a glyph is actually requested.
    const before = this.quadCount;
    this.pushQuadNumbers(
      x, y, w, h,
      top[0], top[1], top[2], top[3],
      bottom[0], bottom[1], bottom[2], bottom[3],
      radius,
    );
    if (glyph !== GLYPH_NONE && this.quadCount > before) {
      const start = before * VERTS_PER_QUAD * FLOATS_PER_VERT;
      for (let k = 0; k < VERTS_PER_QUAD; k++) {
        this.buffer[start + k * FLOATS_PER_VERT + 15] = glyph;
      }
    }
  }

  private quadRgb(
    x: number, y: number, w: number, h: number,
    rgb: readonly [number, number, number], alpha: number, radius = 0,
    gradientRgb?: readonly [number, number, number], gradientAlpha?: number,
  ): void {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    if (gradientRgb !== undefined) {
      const ga = gradientAlpha ?? alpha;
      const gb = ga < 0 ? 0 : ga > 1 ? 1 : ga;
      this.pushQuadNumbers(x, y, w, h, rgb[0], rgb[1], rgb[2], a, gradientRgb[0], gradientRgb[1], gradientRgb[2], gb, radius);
    } else {
      this.pushQuadNumbers(x, y, w, h, rgb[0], rgb[1], rgb[2], a, rgb[0], rgb[1], rgb[2], a, radius);
    }
  }

  render(frame: PlayfieldFrame): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.vbo) return;
    if (gl.isContextLost()) return;
    const { width, height, columns, notes, settingsSlice } = frame;
    const receptorY = frame.receptorY;
    if (width <= 0 || height <= 0) return;

    this.quadCount = 0;

    const upscroll = !!settingsSlice.upsurfaceNoteMode;
    // Note/receptor size + opacity are permanently locked at 100% for all skins (non-adjustable).
    const noteScale = 1;
    const receptorScale = 1;
    const receptorOpacity = 1;
    const noteHeight = getArgonNoteHeight(settingsSlice);
    const keyCount = this.keyCount;

    // Per-column RGB resolved once per frame (no CSS parsing per note;
    // scratch arrays reused to avoid per-frame Array allocations).
    const laneBase = this.laneBaseScratch;
    const laneDarkLane = this.laneDarkLaneScratch;
    const laneDarkBody = this.laneDarkBodyScratch;
    const laneLightHead = this.laneLightHeadScratch;
    const laneLightPulse = this.laneLightPulseScratch;
    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      if (!col) { laneBase[i] = null; laneDarkLane[i] = null; laneDarkBody[i] = null; laneLightHead[i] = null; laneLightPulse[i] = null; continue; }
      const base = getCachedRgb01(col.color);
      laneBase[i] = base;
      laneDarkLane[i] = darkenCached(col.color, 3);
      laneDarkBody[i] = darkenCached(col.color, 0.6);
      laneLightHead[i] = lightenCached(col.color, 0.1);
      laneLightPulse[i] = lightenCached(col.color, 0.2);
    }
    const failedRgb = getCachedRgb01('rgb(48,52,64)');
    const whiteRgb = getCachedRgb01('#ffffff');
    const grayRgb = getCachedRgb01('rgb(196,196,196)');
    const separatorRgb = getCachedRgb01('rgb(71,85,105)');
    const laneGlowRgb = getCachedRgb01('rgb(59,130,246)');
    const failedOutlineRgb = getCachedRgb01('#64748b');

    // RhythmPlus bar skins share geometry: full column width, slim 8px bars.
    const playStyle = resolvePlayfieldStyle(settingsSlice);
    const isBarStyle = playStyle !== 'argon';
    const isDynamicBar = playStyle === 'rhythmplus-dynamic';
    const barH = 8 * noteScale;

    if (isBarStyle) {
      // Bar-skin lanes: separator lines + border + fixed-blue press glow.
      // No filled lane background (the playfield clear color shows through).
      const sepA = settingsSlice.laneSeparatorOpacity ?? 0.30;
      const borderA = Math.min(1, sepA * 1.5);
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (!col) continue;
        this.quadRgb(col.x, 0, 1, height, separatorRgb, sepA, 0);
        if (col.glow > 0) {
          const ga = 0.3 * col.glow;
          if (upscroll) this.pushQuadNumbers(col.x, 0, col.width, receptorY, laneGlowRgb[0], laneGlowRgb[1], laneGlowRgb[2], ga, laneGlowRgb[0], laneGlowRgb[1], laneGlowRgb[2], 0, 0);
          else this.pushQuadNumbers(col.x, receptorY, col.width, height - receptorY, laneGlowRgb[0], laneGlowRgb[1], laneGlowRgb[2], 0, laneGlowRgb[0], laneGlowRgb[1], laneGlowRgb[2], ga, 0);
        }
      }
      this.quadRgb(0, 0, width, 1, separatorRgb, borderA, 0);
      this.quadRgb(0, height - 1, width, 1, separatorRgb, borderA, 0);
      this.quadRgb(0, 0, 1, height, separatorRgb, borderA, 0);
      this.quadRgb(width - 1, 0, 1, height, separatorRgb, borderA, 0);
    } else {
      // Lanes (argon inset columns, darkened base + pressed overlay).
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (!col) continue;
        const ix = col.x + ARGON_COLUMN_GAP / 2;
        const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
        const dark = laneDarkLane[i];
        if (dark) this.quadRgb(ix, 0, iw, height, dark, 0.8, ARGON_CORNER_RADIUS);
        const press = Math.max(col.glow, col.pressed ? 1 : 0);
        if (press > 0) {
          // Pressed-lane glow, concentrated around the receptor: the bottom
          // third of the note lane above it and the top half of the key strip
          // below it, peak alpha at the judgement line (normal blending).
          const base = laneBase[i];
          if (base) {
            const peak = 0.5 * press;
            const above = receptorY / 3;
            const below = (height - receptorY) / 2;
            this.pushQuadNumbers(ix, receptorY - above, iw, above, base[0], base[1], base[2], 0, base[0], base[1], base[2], peak, 0);
            this.pushQuadNumbers(ix, receptorY, iw, below, base[0], base[1], base[2], peak, base[0], base[1], base[2], 0, 0);
          }
        }
      }
    }

    // Measure guide lines (visual only, osu!lazer mania parity): thin white
    // lines scrolling with the beat, brighter on the downbeat of every
    // time-signature group, fading out 150ms after crossing the receptor.
    // Never hit objects — drawn behind holds and notes.
    const frameBarLines = frame.barLines;
    if (settingsSlice.showBarLines !== false && frameBarLines && frameBarLines.length > 0) {
      const nowMs = frame.timeMs;
      for (let i = 0; i < frameBarLines.length; i++) {
        const guide = frameBarLines[i];
        const pastMs = nowMs - guide.time;
        const fade = pastMs <= 0 ? 1 : Math.max(0, 1 - pastMs / 150);
        if (fade <= 0.001) continue;
        const guideH = guide.major ? 1.7 : 1.2;
        const guideAlpha = (guide.major ? 0.5 : 0.2) * fade;
        this.quadRgb(0, guide.y - guideH / 2, width, guideH, whiteRgb, guideAlpha, 0);
      }
    }

    // Hold bodies. Segment Y values are already SV-projected by
    // getVisibleNotes; only the anchored start snaps to the receptor.
    // Pulse phase is constant for the frame: hoist the sin out of the loop.
    const pulsePhase = (frame.timeMs / 160) * Math.PI * 2;
    const pulseBase = 0.75 + 0.25 * Math.sin(pulsePhase);
    // Bar-skin hold geometry (legacy bar path): trims the endpoint join and
    // extends free ends by half a bar, with square joins. Single-radius SDF
    // quads cannot round one end only, so joined ends rely on the endpoint
    // cap drawn over the joint (same as the legacy overdraw).
    const useBarPadding = playStyle === 'rhythmplus';
    const barPad = (8 * noteScale) / 2;
    const barSegRect = (a: number, b: number, trimStart: boolean, trimEnd: boolean) => {
      const lowerY = Math.min(a, b);
      const upperY = Math.max(a, b);
      const startsAtLowerEdge = a <= b;
      const lowerExtension = startsAtLowerEdge ? (trimStart ? 0 : barPad) : (trimEnd ? 0 : barPad);
      const upperExtension = startsAtLowerEdge ? (trimEnd ? 0 : barPad) : (trimStart ? 0 : barPad);
      return { drawY: lowerY - lowerExtension, drawH: upperY - lowerY + lowerExtension + upperExtension };
    };
    // 2px dynamic-style outline: sides always, caps unless trimmed at the
    // endpoint join. Square corners (the legacy roundRect-4 arcs are not
    // representable in the single-radius batched quad).
    const barOutline = (x: number, y: number, w: number, h: number, rgb: readonly [number, number, number], alpha: number, skipTop: boolean, skipBottom: boolean) => {
      const t = 2;
      if (h > t * 2 && w > t) {
        this.quadRgb(x, y + t, t, h - t * 2, rgb, alpha, 0);
        this.quadRgb(x + w - t, y + t, t, h - t * 2, rgb, alpha, 0);
      }
      if (!skipTop && w > t * 2) this.quadRgb(x + t, y, w - t * 2, t, rgb, alpha, 0);
      if (!skipBottom && w > t * 2) this.quadRgb(x + t, y + h - t, w - t * 2, t, rgb, alpha, 0);
    };
    for (const n of notes) {
      if (n.type !== 'hold' || n.endY === undefined) continue;
      if (isHoldSuccessfullyCompleted(n)) continue;
      const col = columns[n.column];
      if (!col) continue;
      const anchored = isHoldBodyAnchored(n);
      let visualStartY = getNoteVisualY(n.bodyStartY ?? n.y, col.width, settingsSlice);
      if (anchored) visualStartY = receptorY;
      const visualEndY = getNoteVisualY(n.endY, col.width, settingsSlice);
      // A held long note is eaten by the receptor: once the held tail reaches
      // or passes the judgement line the whole body is consumed and must not
      // trail below it.
      if (anchored && (upscroll ? visualEndY <= receptorY : visualEndY >= receptorY)) {
        continue;
      }
      const bodySegments = n.tailSegments !== undefined
        ? n.tailSegments
        : [{ startY: visualStartY, endY: visualEndY }];
      const missed = n.missedTailSegments;
      // Avoid concat/merge allocs when there is nothing missed to union.
      let renderSegments = bodySegments;
      if (n.holdRulesVersion === 2 && missed && missed.length > 0) {
        const combined = new Array(bodySegments.length + missed.length);
        for (let s = 0; s < bodySegments.length; s++) combined[s] = bodySegments[s];
        for (let s = 0; s < missed.length; s++) combined[bodySegments.length + s] = missed[s];
        renderSegments = mergeVisibleTailSegments(combined);
      }
      const failed = !!n.isHoldFailed;
      const hitting = n.isHolding !== undefined
        ? n.isHolding
        : (n.isHit && !n.isReleased && !n.isHoldFailed);
      const pulse = hitting && !failed ? pulseBase : 0;
      const baseRgb = laneBase[n.column];
      if (isBarStyle) {
        if (!baseRgb) continue;
        const colW = col.width;
        const bw = colW * noteScale;
        const bx = col.x + (colW - bw) / 2;
        const fadeStart = n.opacity;
        const fadeEnd = n.endOpacity ?? n.opacity;
        // Legacy v2 bar padding: segments shift by half a bar so the body
        // meets the endpoint cap (classic style only).
        const needPadShift = useBarPadding && n.holdRulesVersion === 2;
        let barSegs = renderSegments;
        let barEp = n.endpointTailSegment;
        if (needPadShift) {
          barSegs = renderSegments.map((s) => ({
            startY: getNoteVisualY(s.startY, colW, settingsSlice),
            endY: getNoteVisualY(s.endY, colW, settingsSlice),
          }));
          barEp = n.endpointTailSegment
            ? {
              startY: getNoteVisualY(n.endpointTailSegment.startY, colW, settingsSlice),
              endY: getNoteVisualY(n.endpointTailSegment.endY, colW, settingsSlice),
            }
            : undefined;
        }
        const drawBarFill = (x: number, y: number, w: number, h: number, radius: number) => {
          if (h <= 0.5) return;
          if (y > height + 100 || y + h < -100) return;
          // Dynamic bodies are a 0.55-alpha lane wash; classic bodies are
          // solid. Both dim to the failed gray while failed (classic failed
          // is the legacy 0.5-alpha gray, dynamic a flat 0.55 wash).
          const c = failed ? failedOutlineRgb : baseRgb;
          const alphaScale = isDynamicBar ? 0.55 : (failed ? 0.5 : 1);
          const a0 = fadeStart * alphaScale;
          const a1 = fadeEnd * alphaScale;
          this.pushQuad(x, y, w, h, [c[0], c[1], c[2], a0], [c[0], c[1], c[2], a1], radius, GLYPH_NONE);
        };
        for (const seg of barSegs) {
          const epStart = barEp?.startY;
          const joinsStart = epStart !== undefined && Math.abs(seg.startY - epStart) < 0.001;
          const joinsEnd = epStart !== undefined && Math.abs(seg.endY - epStart) < 0.001;
          const r = barSegRect(seg.startY, seg.endY, joinsStart, joinsEnd);
          const startsLower = seg.startY <= seg.endY;
          const compact = Math.abs(seg.startY - seg.endY) <= Math.max(24, 20 * noteScale);
          drawBarFill(bx, r.drawY, bw, r.drawH, isDynamicBar && !compact ? 4 : 0);
          if (isDynamicBar) {
            const oc = failed ? failedOutlineRgb : baseRgb;
            barOutline(bx, r.drawY, bw, r.drawH, oc, Math.min(1, fadeStart), startsLower ? joinsStart : joinsEnd, startsLower ? joinsEnd : joinsStart);
          }
        }
        if (barEp) {
          const r = barSegRect(barEp.startY, barEp.endY, true, false);
          drawBarFill(bx, r.drawY, bw, r.drawH, isDynamicBar ? 4 : 0);
          if (isDynamicBar) {
            const oc = failed ? failedOutlineRgb : baseRgb;
            const startsLower = barEp.startY <= barEp.endY;
            barOutline(bx, r.drawY, bw, r.drawH, oc, Math.min(1, fadeStart), startsLower, !startsLower);
          }
        }
        if (n.hitSegmentStartY !== undefined && n.hitSegmentEndY !== undefined) {
          const hs = getNoteVisualY(n.hitSegmentStartY, colW, settingsSlice);
          const he = getNoteVisualY(n.hitSegmentEndY, colW, settingsSlice);
          const r = barSegRect(hs, he, false, false);
          if (baseRgb) this.pushQuad(bx, r.drawY, bw, r.drawH, [baseRgb[0], baseRgb[1], baseRgb[2], fadeStart], [baseRgb[0], baseRgb[1], baseRgb[2], fadeEnd], isDynamicBar ? 4 : 0, GLYPH_NONE);
        }
        continue;
      }
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const rw = iw * noteScale;
      const rx = ix + (iw - rw) / 2;
      const bodyRgb = failed ? failedRgb : laneDarkBody[n.column];
      const pulseRgb = laneLightPulse[n.column];
      for (const seg of renderSegments) {
        const topY = Math.min(seg.startY, seg.endY);
        const h = Math.abs(seg.endY - seg.startY);
        if (h <= 0.5) continue;
        if (topY > height + 100 || topY + h < -100) continue;
        const alpha = n.opacity * (failed ? 0.45 : 1);
        if (bodyRgb) this.quadRgb(rx, topY, rw, h, bodyRgb, alpha, ARGON_CORNER_RADIUS);
        if (pulse > 0 && pulseRgb) {
          const glowAlpha = 0.3 * pulse * n.opacity;
          this.pushQuadNumbers(rx, topY, rw, h, pulseRgb[0], pulseRgb[1], pulseRgb[2], glowAlpha, pulseRgb[0], pulseRgb[1], pulseRgb[2], 0, 0);
        }
      }
      if (n.hitSegmentStartY !== undefined && n.hitSegmentEndY !== undefined) {
        const hs = getNoteVisualY(n.hitSegmentStartY, col.width, settingsSlice);
        const he = getNoteVisualY(n.hitSegmentEndY, col.width, settingsSlice);
        if (baseRgb) this.quadRgb(rx, Math.min(hs, he), rw, Math.abs(he - hs), baseRgb, n.opacity, ARGON_CORNER_RADIUS);
      }
    }

    // Note heads + tails. Rice/hold-head notes are a single solid argon
    // slab (full-height vivid gradient + white judgement-side lip + white
    // glyph drawn procedurally in the shader), with no dark far-side cap
    // and no translucent overhang.
    // Like lazer argon there is no separation shadow: notes sit flush with
    // no transparent overhang on the far side. Hold tails reuse the hold
    // body treatment (same dark base + same hold pulse over the full piece,
    // no lip, no glyph) so the tail reads as one seamless structure with
    // the middle instead of a detached darker cap. The closure performs no
    // allocations: colors resolve to cached tuples and quads write directly
    // into the preallocated buffer.
    const drawNotePiece = (rx: number, topY: number, rw: number, column: number, opacity: number, variant: 'rice' | 'head' | 'tail', tailPulse = 0, tailFailed = false) => {
      if (topY > height + 100 || topY + noteHeight < -100) return;
      const o = opacity;
      if (o <= 0) return;
      const dark = laneDarkBody[column];
      const base = laneBase[column];
      const light = laneLightHead[column];
      if (!dark || !base) return;
      if (variant === 'tail') {
        // Seamless with the hold middle: same base color as the body
        // (failed gray when failed, otherwise the darkened lane color) and
        // the same hold pulse glow across the full piece height, so the end
        // fades in and out together with the middle instead of sitting dark.
        const tailBase = tailFailed ? failedRgb : dark;
        const tailAlpha = o * (tailFailed ? 0.45 : 1);
        if (tailBase) this.quadRgb(rx, topY, rw, noteHeight, tailBase, tailAlpha, ARGON_CORNER_RADIUS);
        if (tailPulse > 0 && !tailFailed) {
          const pulseRgb = laneLightPulse[column];
          if (pulseRgb) {
            const glowAlpha = 0.3 * tailPulse * o;
            this.pushQuadNumbers(rx, topY, rw, noteHeight, pulseRgb[0], pulseRgb[1], pulseRgb[2], glowAlpha, pulseRgb[0], pulseRgb[1], pulseRgb[2], 0, 0);
          }
        }
        return;
      }
      // Solid argon slab: one full-height vivid gradient (light far side
      // into the lane base at the judgement side) carrying the glyph, plus
      // the white judgement-side lip below. No dark cap on top, so the note
      // reads as a single solid colour.
      const solidTop = light ?? base;
      const glyph = variant === 'rice' ? GLYPH_CHEVRON : GLYPH_BAR;
      this.pushQuad(
        rx, topY, rw, noteHeight,
        [solidTop[0], solidTop[1], solidTop[2], o],
        [base[0], base[1], base[2], o],
        ARGON_CORNER_RADIUS,
        glyph,
      );
      const lipH = ARGON_CORNER_RADIUS * 2;
      const lipY = upscroll ? topY : topY + noteHeight - lipH;
      this.quadRgb(rx, lipY, rw, lipH, whiteRgb, o, lipH / 2);
    };

    for (const n of notes) {
      if (n.type === 'normal' && (n.isHit || n.isMissed)) continue;
      const col = columns[n.column];
      if (!col) continue;
      const shouldDrawHead = n.type === 'normal'
        ? (!n.isHit && !n.isMissed)
        : (n.isMissed || !n.isHit);
      if (isBarStyle) {
        // RhythmPlus bars: slim 8px timing bars, full column width. Classic
        // fills; dynamic outlines in white (hold heads outline only, normal
        // notes get a filled bar + white inner highlight).
        const colW = col.width;
        const bw = colW * noteScale;
        const bx = col.x + (colW - bw) / 2;
        const baseRgb = laneBase[n.column];
        if (!baseRgb) continue;
        if (shouldDrawHead) {
          const centerY = getNoteVisualY(n.y, colW, settingsSlice);
          let o = n.opacity;
          if (n.type === 'hold' && n.isHoldFailed) o *= 0.35;
          const by = centerY - barH / 2;
          if (isDynamicBar) {
            const isHoldHead = n.type === 'hold';
            if (!isHoldHead) {
              this.quadRgb(bx, by, bw, barH, baseRgb, o, 0);
            }
            barOutline(bx, by, bw, barH, whiteRgb, o, false, false);
            if (!isHoldHead) {
              this.quadRgb(bx + 3, centerY - 1, Math.max(1, bw - 6), 2, whiteRgb, 0.85 * o, 1);
            }
          } else {
            this.quadRgb(bx, by, bw, barH, baseRgb, o, 0);
          }
        }
        if (n.type === 'hold' && n.endY !== undefined) {
          const releaseDone = n.holdRulesVersion !== 2
            ? (n.isReleased && !n.isReleaseMissed)
            : n.isReleaseHit;
          // Head hit, never early-released, tail already at/past the receptor:
          // the held tail was consumed, so the cap must not trail below.
          const tailConsumed = n.holdRulesVersion === 3 && n.isHit && !n.isMissed &&
            n.earlyReleaseTime === undefined && !!n.isEndPassed;
          if (releaseDone || tailConsumed) continue;
          const centerY = getNoteVisualY(n.endY, colW, settingsSlice);
          let o = n.endOpacity ?? n.opacity;
          if (n.isHoldFailed) o *= 0.35;
          const by = centerY - barH / 2;
          if (isDynamicBar) {
            const oc = n.isHoldFailed ? failedOutlineRgb : baseRgb;
            if (!n.isHoldFailed) {
              // Legacy 5px glow stroke ≈ a translucent rect extended 2.5px.
              this.quadRgb(bx - 2.5, by - 2.5, bw + 5, barH + 5, oc, 0.35 * o, 4.5);
            }
            barOutline(bx, by, bw, barH, oc, Math.min(1, o), false, false);
          } else {
            this.quadRgb(bx, by, bw, barH, baseRgb, o, 0);
          }
        }
        continue;
      }
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const rw = iw * noteScale;
      const rx = ix + (iw - rw) / 2;
      if (shouldDrawHead) {
        const centerY = getNoteVisualY(n.y, col.width, settingsSlice);
        let opacity = n.opacity;
        if (n.type === 'hold' && n.isHoldFailed) opacity *= 0.35;
        drawNotePiece(rx, centerY - noteHeight / 2, rw, n.column, opacity, n.type === 'hold' ? 'head' : 'rice');
      }
      if (n.type === 'hold' && n.endY !== undefined) {
        const releaseDone = n.holdRulesVersion !== 2
          ? (n.isReleased && !n.isReleaseMissed)
          : n.isReleaseHit;
        // Head hit, never early-released, tail already at/past the receptor:
        // the held tail was consumed, so the cap must not trail below.
        const tailConsumed = n.holdRulesVersion === 3 && n.isHit && !n.isMissed &&
          n.earlyReleaseTime === undefined && !!n.isEndPassed;
        if (releaseDone || tailConsumed) continue;
        const centerY = getNoteVisualY(n.endY, col.width, settingsSlice);
        const tailOpacity = n.endOpacity ?? n.opacity;
        const tailFailed = !!n.isHoldFailed;
        const tailHitting = n.isHolding !== undefined
          ? n.isHolding
          : (n.isHit && !n.isReleased && !n.isHoldFailed);
        const tailPulse = tailHitting && !tailFailed ? pulseBase : 0;
        drawNotePiece(rx, centerY - noteHeight / 2, rw, n.column, tailOpacity, 'tail', tailPulse, tailFailed);
      }
    }

    // Receptors (target + lip + key pill + pressed glow). Key labels stay DOM-only.
    // Argon receptor: translucent white hit target with
    // a solid lip on the judgement line, plus the outlined oval key pill
    // below/above the receptor (hollow white ring idle, lane-color fill
    // when pressed). Rings are two rounded quads (outer white, inner fill);
    // still zero textures, zero extra draw calls.
    // Receptor target matches the normal note height (not the 82% accent
    // zone), so keys read at the same vertical size as incoming notes.
    const hitTargetH = noteHeight * receptorScale;
    const lipH = ARGON_CORNER_RADIUS * 2;
    const CORE_H = 46;
    if (isBarStyle) {
      // RhythmPlus receptor: a slim 4px full-width line. Pressed adds a
      // translucent lane-color pad, a white line, and the lane flash.
      const rh = 4;
      const ry = receptorY - rh / 2;
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (!col) continue;
        const base = laneBase[i];
        if (col.pressed && base) {
          this.quadRgb(col.x, ry - 3, col.width, rh + 6, base, 0.45 * receptorOpacity, 0);
          this.quadRgb(col.x, ry, col.width, rh, whiteRgb, receptorOpacity, 0);
          const ga = 0.35 * receptorOpacity;
          if (upscroll) {
            this.pushQuadNumbers(col.x, 0, col.width, receptorY, base[0], base[1], base[2], ga, base[0], base[1], base[2], 0, 0);
          } else {
            this.pushQuadNumbers(col.x, receptorY, col.width, height - receptorY, base[0], base[1], base[2], 0, base[0], base[1], base[2], ga, 0);
          }
        } else {
          this.quadRgb(col.x, ry, col.width, rh, whiteRgb, 0.45 * receptorOpacity, 0);
        }
      }
    } else {
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (!col) continue;
        const ix = col.x + ARGON_COLUMN_GAP / 2;
        const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
        const pressed = col.pressed;
        // Hit flash: every note / long-note-head hit lights the receptor and
        // fades with the decaying lane glow, so a quick tap still flashes it.
        const glow = col.glow;
        const flash = glow > 1 ? 1 : glow < 0 ? 0 : glow;
        const lit = pressed ? 1 : flash;
        const base = laneBase[i];
        const darkLane = laneDarkLane[i];
        if (lit > 0) {
          // White-hot core hugging the judgement line, fading into the lane.
          const coreAlpha = 0.45 * lit * receptorOpacity;
          if (upscroll) {
            this.pushQuadNumbers(ix, receptorY, iw, CORE_H, whiteRgb[0], whiteRgb[1], whiteRgb[2], coreAlpha, whiteRgb[0], whiteRgb[1], whiteRgb[2], 0, 0);
          } else {
            this.pushQuadNumbers(ix, receptorY - CORE_H, iw, CORE_H, whiteRgb[0], whiteRgb[1], whiteRgb[2], 0, whiteRgb[0], whiteRgb[1], whiteRgb[2], coreAlpha, 0);
          }
        }
        // Idle: translucent white. Pressed: fills with the lane colour
        // (near-opaque) while the white judgement lip stays on top.
        const targetY = upscroll ? receptorY : receptorY - hitTargetH;
        const tr = base ? whiteRgb[0] + (base[0] - whiteRgb[0]) * lit : whiteRgb[0];
        const tg = base ? whiteRgb[1] + (base[1] - whiteRgb[1]) * lit : whiteRgb[1];
        const tb = base ? whiteRgb[2] + (base[2] - whiteRgb[2]) * lit : whiteRgb[2];
        const targetAlpha = (0.3 + 0.6 * lit) * receptorOpacity;
        this.pushQuadNumbers(
          ix, targetY, iw, hitTargetH,
          tr, tg, tb, targetAlpha,
          tr, tg, tb, targetAlpha,
          ARGON_CORNER_RADIUS,
        );
        // Lip ramps gray -> white with the hit flash.
        const lipR = grayRgb[0] + (1 - grayRgb[0]) * lit;
        const lipG = grayRgb[1] + (1 - grayRgb[1]) * lit;
        const lipB = grayRgb[2] + (1 - grayRgb[2]) * lit;
        this.pushQuadNumbers(
          ix, receptorY - lipH / 2, iw, lipH,
          lipR, lipG, lipB, receptorOpacity,
          lipR, lipG, lipB, receptorOpacity,
          lipH / 2,
        );
        if (base && darkLane) {
          const ovalW = Math.min(22, iw * 0.42);
          const ovalH = 14;
          const ovalCY = upscroll ? receptorY - 30 : receptorY + 30;
          const cx = ix + iw / 2;
          if (pressed) {
            const glowAlpha = 0.28 * receptorOpacity;
            const ox = cx - (ovalW + 12) / 2;
            this.pushQuadNumbers(ox, ovalCY - (ovalH + 12) / 2, ovalW + 12, ovalH + 12, base[0], base[1], base[2], glowAlpha, base[0], base[1], base[2], 0, (ovalH + 12) / 2);
          }
          // Outer white ring.
          const outerW = ovalW + 4;
          const outerH = ovalH + 4;
          this.quadRgb(cx - outerW / 2, ovalCY - outerH / 2, outerW, outerH, whiteRgb, (pressed ? 0.95 : 0.7) * receptorOpacity, outerH / 2);
          // Inner fill: lane color when pressed, lane background when idle.
          if (pressed) {
            this.quadRgb(cx - ovalW / 2, ovalCY - ovalH / 2, ovalW, ovalH, base, 0.85 * receptorOpacity, ovalH / 2);
          } else {
            this.quadRgb(cx - ovalW / 2, ovalCY - ovalH / 2, ovalW, ovalH, darkLane, 0.8 * receptorOpacity, ovalH / 2);
          }
        }
      }

      // Argon lane-bottom dots: three decorative circles per lane (one top,
      // two below). Purely cosmetic, no gameplay meaning; they brighten with
      // the same press / hit flash as the receptor.
      const dotMargin = 14;
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (!col) continue;
        const dotBase = laneBase[i];
        if (!dotBase) continue;
        const glow = col.glow;
        const flash = glow > 1 ? 1 : glow < 0 ? 0 : glow;
        const lit = col.pressed ? 1 : flash;
        const dotR = Math.max(2, Math.min(3, col.width * 0.055)) * noteScale;
        const cx = col.x + col.width / 2;
        const bottomCY = height - dotMargin - dotR;
        const topCY = bottomCY - dotR * 2.1;
        const offX = dotR * 1.9;
        const w = 0.45 * lit;
        const dr = dotBase[0] + (1 - dotBase[0]) * w;
        const dg = dotBase[1] + (1 - dotBase[1]) * w;
        const db = dotBase[2] + (1 - dotBase[2]) * w;
        const da = (0.55 + 0.45 * lit) * receptorOpacity;
        this.pushQuadNumbers(cx - dotR, topCY - dotR, dotR * 2, dotR * 2, dr, dg, db, da, dr, dg, db, da, dotR);
        this.pushQuadNumbers(cx - offX - dotR, bottomCY - dotR, dotR * 2, dotR * 2, dr, dg, db, da, dr, dg, db, da, dotR);
        this.pushQuadNumbers(cx + offX - dotR, bottomCY - dotR, dotR * 2, dotR * 2, dr, dg, db, da, dr, dg, db, da, dotR);
      }
    }

    // Flashlight vignette draws last, over notes and receptors. Radius
    // math lives in flashlight.ts (combo steps + break easing, CSS px).
    this.vigRadiusCss = getFlashlightRadius(
      settingsSlice.selectedMods,
      frame.combo ?? 0,
      frame.timeMs,
      frame.breaks,
      width,
      height,
    );
    if (this.vigRadiusCss !== null && this.vigRadiusCss > 0) {
      this.pushQuad(
        0, 0, width, height,
        [0, 0, 0, 1],
        [0, 0, 0, 1],
        0,
        GLYPH_VIGNETTE,
      );
    }

    // Upload + draw in one shot.
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer, 0, this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.canvas!.width, this.canvas!.height);
    gl.uniform1f(this.uDpr, this.dpr);
    gl.uniform1f(this.uGlyphFlip, upscroll ? 1 : 0);
    if (this.vigRadiusCss !== null && this.vigRadiusCss > 0) {
      // Fragment math runs in device px (vSize folds in uDpr).
      gl.uniform2f(this.uVigCenter, (width * 0.5) * this.dpr, receptorY * this.dpr);
      gl.uniform1f(this.uVigRadius, this.vigRadiusCss * this.dpr);
    }
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * VERTS_PER_QUAD);
    gl.bindVertexArray(null);
  }

  isReady(): boolean {
    return this.gl !== null && !this.gl.isContextLost() && this.program !== null;
  }

  destroy(): void {
    if (this.canvas && this.onContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    }
    // NOTE: never lose the context here. The canvas node outlives the
    // renderer (same-kind re-init, StrictMode remount) and a lost context
    // makes every later getContext call return a dead context, blanking the
    // playfield. Just drop GL objects; the context stays reusable.
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.vbo = null;
    this.uResolution = null;
    this.uDpr = null;
    this.uGlyphFlip = null;
    this.uVigCenter = null;
    this.uVigRadius = null;
    this.vigRadiusCss = null;
    this.onContextLost = null;
    this.quadCount = 0;
  }
}
