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
import { darkenCached, getCachedRgb01, lightenCached, tupleWithAlpha } from './colorCache';
import { getNoteVisualY } from './playfieldLayout';
import { isHoldBodyAnchored, isHoldSuccessfullyCompleted } from './noteState';
import { mergeVisibleTailSegments } from './tailSegments';

/**
 * Raw WebGL2 batched quad playfield renderer (MVP: argon/default skins).
 *
 * SV parity is structural: this renderer never recomputes scroll positions.
 * All Y values come from `PlayfieldFrame` (built by `getVisibleNotes` with
 * the shared `ScrollModel`), so SV freeze/reverse, upscroll, and HD/FI
 * cover opacity behave exactly like Canvas2D. Only rasterization differs.
 *
 * Design for low latency / high throughput:
 * - One shader program, one VAO/VBO, ~1 draw call per frame.
 * - Preallocated Float32Array ring (zero per-frame allocation in steady state).
 * - Opaque low-latency context (alpha:false, desynchronized, no AA, no
 *   preserveDrawingBuffer).
 * - No text, no textures, no readback.
 */

const VERTEX_SRC = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aColorTop;
layout(location=2) in vec4 aColorBottom;
layout(location=3) in vec2 aUv;
layout(location=4) in vec2 aSize;
layout(location=5) in float aRadius;
uniform vec2 uResolution;
uniform float uDpr;
out vec4 vColorTop;
out vec4 vColorBottom;
out vec2 vUv;
out vec2 vSize;
out float vRadius;
void main() {
  vec2 px = aPos * uDpr;
  vec2 clip = vec2(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vColorTop = aColorTop;
  vColorBottom = aColorBottom;
  vUv = aUv;
  vSize = aSize * uDpr;
  vRadius = aRadius * uDpr;
}
`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec4 vColorTop;
in vec4 vColorBottom;
in vec2 vUv;
in vec2 vSize;
in float vRadius;
out vec4 outColor;
void main() {
  vec2 p = vUv * vSize;
  vec2 b = vSize * 0.5;
  float r = min(vRadius, min(b.x, b.y));
  vec2 q = abs(p - b) - b + r;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = fwidth(dist) + 1e-4;
  float alpha = 1.0 - smoothstep(-aa, aa, dist);
  if (alpha <= 0.001) discard;
  vec4 col = mix(vColorTop, vColorBottom, vUv.y);
  col.a *= alpha;
  outColor = col;
}
`;

const FLOATS_PER_VERT = 15; // x,y + topRGBA + bottomRGBA + u,v + w,h + radius
const VERTS_PER_QUAD = 6;
const MAX_QUADS = 4096;
const BUFFER_FLOATS = MAX_QUADS * VERTS_PER_QUAD * FLOATS_PER_VERT;



export class WebGL2PlayfieldRenderer implements IPlayfieldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uDpr: WebGLUniformLocation | null = null;
  private buffer = new Float32Array(BUFFER_FLOATS);
  private quadCount = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private keyCount = 4;
  private onContextLost: ((e: Event) => void) | null = null;

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

  private pushQuad(
    x: number, y: number, w: number, h: number,
    top: [number, number, number, number],
    bottom: [number, number, number, number],
    radius: number,
  ): void {
    if (w <= 0 || h <= 0) return;
    if (this.quadCount >= MAX_QUADS) return; // drop overflow; counters stay bounded
    const base = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERT;
    // Two triangles in uv space: (0,0)-(1,0)-(0,1) and (1,0)-(1,1)-(0,1).
    // Slot A always carries the top stop, slot B the bottom stop; the
    // fragment shader mixes by uv.y.
    const xs = [x, x + w, x, x + w, x + w, x];
    const ys = [y, y, y + h, y, y + h, y + h];
    const us = [0, 1, 0, 1, 1, 0];
    const vs = [0, 0, 1, 0, 1, 1];
    for (let i = 0; i < 6; i++) {
      const o = base + i * FLOATS_PER_VERT;
      this.buffer[o] = xs[i];
      this.buffer[o + 1] = ys[i];
      this.buffer[o + 2] = top[0];
      this.buffer[o + 3] = top[1];
      this.buffer[o + 4] = top[2];
      this.buffer[o + 5] = top[3];
      this.buffer[o + 6] = bottom[0];
      this.buffer[o + 7] = bottom[1];
      this.buffer[o + 8] = bottom[2];
      this.buffer[o + 9] = bottom[3];
      this.buffer[o + 10] = us[i];
      this.buffer[o + 11] = vs[i];
      this.buffer[o + 12] = w;
      this.buffer[o + 13] = h;
      this.buffer[o + 14] = radius;
    }
    this.quadCount++;
  }

  private quadRgb(
    x: number, y: number, w: number, h: number,
    rgb: readonly [number, number, number], alpha: number, radius = 0,
    gradientRgb?: readonly [number, number, number], gradientAlpha?: number,
  ): void {
    const top = tupleWithAlpha(rgb, alpha);
    const bottom = gradientRgb !== undefined
      ? tupleWithAlpha(gradientRgb, gradientAlpha ?? alpha)
      : top;
    this.pushQuad(x, y, w, h, top, bottom, radius);
  }

  render(frame: PlayfieldFrame): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.vbo) return;
    if (gl.isContextLost()) return;
    const { width, height, columns, notes, shake, settingsSlice } = frame;
    const receptorY = frame.receptorY;
    if (width <= 0 || height <= 0) return;

    this.quadCount = 0;
    let shakeX = 0;
    let shakeY = 0;
    if (shake > 0 && !settingsSlice.disableLaneShake) {
      shakeX = (Math.random() - 0.5) * shake;
      shakeY = (Math.random() - 0.5) * shake;
    }
    const X = (x: number) => x + shakeX;
    const Y = (y: number) => y + shakeY;

    const upscroll = !!settingsSlice.upsurfaceNoteMode;
    const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
    const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1;
    const receptorOpacity = settingsSlice.receptorOpacity ?? 1;
    const noteHeight = getArgonNoteHeight(settingsSlice);
    const keyCount = this.keyCount;

    // Per-column RGB resolved once per frame (no CSS parsing per note).
    const laneBase: Array<readonly [number, number, number] | null> = new Array(keyCount);
    const laneDarkLane: Array<readonly [number, number, number] | null> = new Array(keyCount);
    const laneDarkBody: Array<readonly [number, number, number] | null> = new Array(keyCount);
    const laneLightHead: Array<readonly [number, number, number] | null> = new Array(keyCount);
    const laneLightPulse: Array<readonly [number, number, number] | null> = new Array(keyCount);
    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      if (!col) continue;
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

    // Lanes (argon inset columns, darkened base + pressed overlay).
    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      if (!col) continue;
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const dark = laneDarkLane[i];
      if (dark) this.quadRgb(X(ix), Y(0), iw, height, dark, 0.8, ARGON_CORNER_RADIUS);
      const press = Math.max(col.glow, col.pressed ? 1 : 0);
      if (press > 0) {
        // Approximate the Canvas2D 'lighter' pressed gradient with a
        // bottom-weighted alpha gradient in normal blending.
        const base = laneBase[i];
        if (base) {
          const top = tupleWithAlpha(base, 0);
          const bottom = tupleWithAlpha(base, 0.6 * press);
          if (upscroll) this.pushQuad(X(ix), Y(0), iw, receptorY, top, bottom, 0);
          else this.pushQuad(X(ix), Y(receptorY), iw, height - receptorY, top, bottom, 0);
        }
      }
    }

    // Hold bodies. Geometry mirrors renderArgonPlayfield: segment Y values
    // are already SV-projected by getVisibleNotes; only the anchored start
    // snaps to the receptor, exactly like Canvas2D.
    for (const n of notes) {
      if (n.type !== 'hold' || n.endY === undefined) continue;
      if (isHoldSuccessfullyCompleted(n)) continue;
      const col = columns[n.column];
      if (!col) continue;
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const rw = iw * noteScale;
      const rx = ix + (iw - rw) / 2;
      const anchored = isHoldBodyAnchored(n);
      let visualStartY = getNoteVisualY(n.bodyStartY ?? n.y, col.width, settingsSlice);
      if (anchored) visualStartY = receptorY;
      const visualEndY = getNoteVisualY(n.endY, col.width, settingsSlice);
      const bodySegments = n.tailSegments !== undefined
        ? n.tailSegments
        : [{ startY: visualStartY, endY: visualEndY }];
      const missed = n.missedTailSegments;
      const renderSegments = n.holdRulesVersion === 2
        ? (missed && missed.length > 0
            ? mergeVisibleTailSegments(bodySegments.concat(missed))
            : bodySegments)
        : bodySegments;
      const failed = !!n.isHoldFailed;
      const hitting = n.isHolding !== undefined
        ? n.isHolding
        : (n.isHit && !n.isReleased && !n.isHoldFailed);
      let pulse = 0;
      if (hitting && !failed) {
        pulse = 0.75 + 0.25 * Math.sin((frame.timeMs / 160) * Math.PI * 2);
      }
      const bodyRgb = failed ? failedRgb : laneDarkBody[n.column];
      const pulseRgb = laneLightPulse[n.column];
      const baseRgb = laneBase[n.column];
      for (const seg of renderSegments) {
        const topY = Math.min(seg.startY, seg.endY);
        const h = Math.abs(seg.endY - seg.startY);
        if (h <= 0.5) continue;
        if (topY > height + 100 || topY + h < -100) continue;
        const alpha = n.opacity * (failed ? 0.45 : 1);
        if (bodyRgb) this.quadRgb(X(rx), Y(topY), rw, h, bodyRgb, alpha, ARGON_CORNER_RADIUS);
        if (pulse > 0 && pulseRgb) {
          const glow = tupleWithAlpha(pulseRgb, 0.3 * pulse * n.opacity);
          const transparent: [number, number, number, number] = [glow[0], glow[1], glow[2], 0];
          this.pushQuad(X(rx), Y(topY), rw, h, glow, transparent, 0);
        }
      }
      if (n.hitSegmentStartY !== undefined && n.hitSegmentEndY !== undefined) {
        const hs = getNoteVisualY(n.hitSegmentStartY, col.width, settingsSlice);
        const he = getNoteVisualY(n.hitSegmentEndY, col.width, settingsSlice);
        if (baseRgb) this.quadRgb(X(rx), Y(Math.min(hs, he)), rw, Math.abs(he - hs), baseRgb, n.opacity, ARGON_CORNER_RADIUS);
      }
    }

    // Note heads + tails. Base + accent + white lip approximate
    // drawArgonNotePiece (chevron/bar glyphs are MVP-simplified to a lip).
    const drawNotePiece = (rx: number, topY: number, rw: number, column: number, opacity: number, isTail: boolean) => {
      if (topY > height + 100 || topY + noteHeight < -100) return;
      const o = opacity;
      if (!isTail && o <= 0) return;
      const dark = laneDarkBody[column];
      const base = laneBase[column];
      const light = laneLightHead[column];
      if (!dark || !base) return;
      // Base shade (dark overlay gradient approximated as solid darkened).
      this.quadRgb(X(rx), Y(topY), rw, noteHeight, dark, o, ARGON_CORNER_RADIUS);
      const accentH = noteHeight * ARGON_NOTE_ACCENT_RATIO;
      const accentY = topY + noteHeight - accentH;
      const accentRgb = isTail ? dark : (light ?? base);
      const top = tupleWithAlpha(accentRgb, o);
      const bottom = tupleWithAlpha(base, o);
      this.pushQuad(X(rx), Y(accentY), rw, accentH, top, bottom, ARGON_CORNER_RADIUS);
      const lipH = ARGON_CORNER_RADIUS * 2;
      this.quadRgb(X(rx), Y(topY + noteHeight - lipH), rw, lipH, whiteRgb, o, lipH / 2);
    };

    for (const n of notes) {
      if (n.type === 'normal' && (n.isHit || n.isMissed)) continue;
      const col = columns[n.column];
      if (!col) continue;
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const rw = iw * noteScale;
      const rx = ix + (iw - rw) / 2;
      const shouldDrawHead = n.type === 'normal'
        ? (!n.isHit && !n.isMissed)
        : (n.isMissed || !n.isHit);
      if (shouldDrawHead) {
        const centerY = getNoteVisualY(n.y, col.width, settingsSlice);
        let opacity = n.opacity;
        if (n.type === 'hold' && n.isHoldFailed) opacity *= 0.35;
        drawNotePiece(rx, centerY - noteHeight / 2, rw, n.column, opacity, false);
      }
      if (n.type === 'hold' && n.endY !== undefined) {
        const releaseDone = n.holdRulesVersion !== 2
          ? (n.isReleased && !n.isReleaseMissed)
          : n.isReleaseHit;
        if (releaseDone) continue;
        const centerY = getNoteVisualY(n.endY, col.width, settingsSlice);
        let opacity = n.endOpacity ?? n.opacity;
        if (n.isHoldFailed) opacity *= 0.35;
        drawNotePiece(rx, centerY - noteHeight / 2, rw, n.column, opacity, true);
      }
    }

    // Receptors (target + lip + pressed glow). Key labels stay DOM-only.
    const hitTargetH = noteHeight * ARGON_NOTE_ACCENT_RATIO * receptorScale;
    const lipH = ARGON_CORNER_RADIUS * 2;
    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      if (!col) continue;
      const ix = col.x + ARGON_COLUMN_GAP / 2;
      const iw = Math.max(1, col.width - ARGON_COLUMN_GAP);
      const pressed = col.pressed;
      const targetY = upscroll ? receptorY : receptorY - hitTargetH;
      this.quadRgb(
        X(ix), Y(targetY), iw, hitTargetH,
        whiteRgb, (pressed ? 0.55 : 0.3) * receptorOpacity, ARGON_CORNER_RADIUS,
      );
      this.quadRgb(
        X(ix), Y(receptorY - lipH / 2), iw, lipH,
        pressed ? whiteRgb : grayRgb, receptorOpacity, lipH / 2,
      );
      if (pressed) {
        const base = laneBase[i];
        if (base) {
          const glow = tupleWithAlpha(base, 0.28 * receptorOpacity);
          const transparent: [number, number, number, number] = [glow[0], glow[1], glow[2], 0];
          const ovalW = Math.min(22, iw * 0.42);
          const ovalH = 14;
          const ovalY = upscroll ? receptorY - 30 - ovalH / 2 : receptorY + 30 - ovalH / 2;
          const ox = ix + (iw - ovalW) / 2 - 6;
          this.pushQuad(X(ox), Y(ovalY - 6), ovalW + 12, ovalH + 12, glow, transparent, (ovalH + 12) / 2);
        }
      }
    }

    // Upload + draw in one shot.
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer, 0, this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.canvas!.width, this.canvas!.height);
    gl.uniform1f(this.uDpr, this.dpr);
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
    this.onContextLost = null;
    this.quadCount = 0;
  }
}
