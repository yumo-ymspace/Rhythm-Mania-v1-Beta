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

import { hexToRgba } from './color';
import {
  ARGON_COLUMN_GAP,
  ARGON_CORNER_RADIUS,
  ARGON_NOTE_ACCENT_RATIO,
  argonDarken,
  argonLighten,
  getArgonNoteHeight,
} from './argonSkin';
import { isHoldBodyAnchored } from './noteState';
import { getNoteVisualY } from './playfieldLayout';
import { mergeVisibleTailSegments } from './tailSegments';
import type { PlayfieldFrame } from './types';

type NoteVariant = 'rice' | 'holdHead' | 'holdTail';

function columnInset(x: number, width: number): { x: number; width: number } {
  return { x: x + ARGON_COLUMN_GAP / 2, width: Math.max(1, width - ARGON_COLUMN_GAP) };
}

function drawChevronDown(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const halfW = size * 0.38;
  const halfH = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy - halfH);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx + halfW, cy - halfH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawArgonNotePiece(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  width: number,
  height: number,
  color: string,
  opacity: number,
  upscroll: boolean,
  variant: NoteVariant,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;

  if (upscroll) {
    const cx = x + width / 2;
    const cy = topY + height / 2;
    ctx.translate(cx, cy);
    ctx.scale(1, -1);
    ctx.translate(-cx, -cy);
  }

  ctx.beginPath();
  ctx.roundRect(x, topY, width, height, ARGON_CORNER_RADIUS);
  ctx.clip();

  const shade = ctx.createLinearGradient(x, topY, x, topY + height);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, topY, width, height);

  const accentH = height * ARGON_NOTE_ACCENT_RATIO;
  const accentY = topY + height - accentH;

  if (variant === 'holdTail') {
    ctx.fillStyle = argonDarken(color, 0.6);
    ctx.beginPath();
    ctx.roundRect(x, accentY, width, accentH, ARGON_CORNER_RADIUS);
    ctx.fill();
    const additive = ctx.createLinearGradient(x, accentY, x, accentY + accentH * 0.5);
    additive.addColorStop(0, hexToRgba(color, 0.4));
    additive.addColorStop(1, hexToRgba(color, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = additive;
    ctx.fillRect(x, accentY, width, accentH * 0.5);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    const accent = ctx.createLinearGradient(x, accentY, x, topY + height);
    accent.addColorStop(0, argonLighten(color, 0.1));
    accent.addColorStop(1, color);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(x, accentY, width, accentH, ARGON_CORNER_RADIUS);
    ctx.fill();

    const lipH = ARGON_CORNER_RADIUS * 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, topY + height - lipH, width, lipH, lipH / 2);
    ctx.fill();
  }

  if (variant === 'rice') {
    drawChevronDown(ctx, x + width / 2, topY + height / 2 + 4, Math.min(20, width * 0.42));
  } else if (variant === 'holdHead') {
    const barW = Math.min(20, width * 0.42);
    const barH = 5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x + (width - barW) / 2, topY + height / 2 + 2 - barH / 2, barW, barH, barH / 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawArgonHoldBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  opacity: number,
  isHitting: boolean,
  isFailed: boolean,
  isMaskedAtReceptor: boolean = false,
  upscroll: boolean = false,
  visualTime: number = 0,
): void {
  if (height <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = opacity * (isFailed ? 0.45 : 1);
  ctx.beginPath();
  if (isMaskedAtReceptor) {
    const radii: [number, number, number, number] = upscroll
      ? [0, 0, ARGON_CORNER_RADIUS, ARGON_CORNER_RADIUS]
      : [ARGON_CORNER_RADIUS, ARGON_CORNER_RADIUS, 0, 0];
    ctx.roundRect(x, y, width, height, radii);
  } else {
    ctx.roundRect(x, y, width, height, ARGON_CORNER_RADIUS);
  }
  ctx.fillStyle = isFailed ? 'rgb(48,52,64)' : argonDarken(color, 0.6);
  ctx.fill();
  if (isHitting && !isFailed) {
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin((visualTime / 160) * Math.PI * 2);
    ctx.fillStyle = hexToRgba(argonLighten(color, 0.2), 0.3 * pulse);
    ctx.fill();
  }
  ctx.restore();
}

export function renderArgonPlayfield(
  ctx: CanvasRenderingContext2D,
  frame: PlayfieldFrame,
  keyCount: number,
): void {
  const { height, columns, notes, settingsSlice, showKeyLabels, keyLabels } = frame;
  const receptorY = frame.receptorY;
  const upscroll = !!settingsSlice.upsurfaceNoteMode;
  const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
  const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1;
  const noteHeight = getArgonNoteHeight(settingsSlice);
  const receptorOpacity = settingsSlice.receptorOpacity ?? 1;

  for (let i = 0; i < keyCount; i++) {
    const col = columns[i];
    if (!col) continue;
    const inset = columnInset(col.x, col.width);
    const color = col.color;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(inset.x, 0, inset.width, height, ARGON_CORNER_RADIUS);
    ctx.fillStyle = hexToRgba(argonDarken(color, 3), 0.8);
    ctx.fill();

    const press = Math.max(col.glow, col.pressed ? 1 : 0);
    if (press > 0) {
      const overlay = ctx.createLinearGradient(
        inset.x,
        upscroll ? 0 : receptorY,
        inset.x,
        upscroll ? receptorY : height,
      );
      overlay.addColorStop(0, hexToRgba(color, 0));
      overlay.addColorStop(1, hexToRgba(color, 0.6 * press));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = overlay;
      if (upscroll) {
        ctx.fillRect(inset.x, 0, inset.width, receptorY);
      } else {
        ctx.fillRect(inset.x, receptorY, inset.width, height - receptorY);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  notes.forEach((n) => {
    if (n.type !== 'hold' || n.endY === undefined) return;
    const col = columns[n.column];
    if (!col) return;
    const inset = columnInset(col.x, col.width);
    const rw = inset.width * noteScale;
    const rx = inset.x + (inset.width - rw) / 2;

    const isHeadAtOrPastReceptor = upscroll ? n.y <= receptorY : n.y >= receptorY;
    const isAnchored = isHoldBodyAnchored(n) && isHeadAtOrPastReceptor;

    let visualStartY = getNoteVisualY(n.bodyStartY ?? n.y, col.width, settingsSlice);
    if (isAnchored) visualStartY = receptorY;
    const visualEndY = getNoteVisualY(n.endY, col.width, settingsSlice);

    const bodySegments = n.tailSegments?.length
      ? n.tailSegments
      : [{ startY: visualStartY, endY: visualEndY }];
    const renderSegments = n.holdRulesVersion === 2
      ? mergeVisibleTailSegments([...bodySegments, ...(n.missedTailSegments || [])])
      : bodySegments;

    const hitting = n.isHolding !== undefined
      ? n.isHolding
      : (n.isHit && !n.isReleased && !n.isHoldFailed);
    const opacity = n.opacity;
    for (const segment of renderSegments) {
      const top = Math.min(segment.startY, segment.endY);
      const bottom = Math.max(segment.startY, segment.endY);
      drawArgonHoldBody(
        ctx,
        rx,
        top,
        rw,
        bottom - top,
        col.color,
        opacity,
        hitting,
        !!n.isHoldFailed,
        isAnchored,
        upscroll,
        frame.timeMs,
      );
    }

    if (n.hitSegmentStartY !== undefined && n.hitSegmentEndY !== undefined) {
      const hitStart = getNoteVisualY(n.hitSegmentStartY, col.width, settingsSlice);
      const hitEnd = getNoteVisualY(n.hitSegmentEndY, col.width, settingsSlice);
      drawArgonHoldBody(
        ctx,
        rx,
        Math.min(hitStart, hitEnd),
        rw,
        Math.abs(hitStart - hitEnd),
        col.color,
        opacity,
        true,
        false,
        false,
        upscroll,
        frame.timeMs,
      );
    }
  });

  notes.forEach((n) => {
    if (n.type === 'normal' && (n.isHit || n.isMissed)) return;
    const col = columns[n.column];
    if (!col) return;
    const inset = columnInset(col.x, col.width);
    const rw = inset.width * noteScale;
    const rx = inset.x + (inset.width - rw) / 2;
    const color = col.color;

    const isHeadAtOrPastReceptor = upscroll ? n.y <= receptorY : n.y >= receptorY;
    const shouldDrawHead = n.type === 'normal'
      ? (!n.isHit && !n.isMissed)
      : (n.isMissed || !n.isHit || !isHeadAtOrPastReceptor);
    if (shouldDrawHead) {
      const centerY = getNoteVisualY(n.y, col.width, settingsSlice);
      const topY = centerY - noteHeight / 2;
      let opacity = n.opacity;
      if (n.type === 'hold' && n.isHoldFailed) opacity *= 0.35;
      drawArgonNotePiece(
        ctx,
        rx,
        topY,
        rw,
        noteHeight,
        color,
        opacity,
        upscroll,
        n.type === 'hold' ? 'holdHead' : 'rice',
      );
    }

    if (n.type === 'hold' && n.endY !== undefined) {
      const releaseDone = n.holdRulesVersion !== 2
        ? (n.isReleased && !n.isReleaseMissed)
        : n.isReleaseHit;
      if (releaseDone) return;
      const centerY = getNoteVisualY(n.endY, col.width, settingsSlice);
      const topY = centerY - noteHeight / 2;
      let opacity = n.endOpacity ?? n.opacity;
      if (n.isHoldFailed) opacity *= 0.35;
      drawArgonNotePiece(ctx, rx, topY, rw, noteHeight, color, opacity, upscroll, 'holdTail');
    }
  });

  const hitTargetH = noteHeight * ARGON_NOTE_ACCENT_RATIO * receptorScale;
  const lipH = ARGON_CORNER_RADIUS * 2;

  for (let i = 0; i < keyCount; i++) {
    const col = columns[i];
    if (!col) continue;
    const inset = columnInset(col.x, col.width);
    const color = col.color;
    const pressed = col.pressed;
    ctx.save();
    ctx.globalAlpha = receptorOpacity;

    const targetY = upscroll ? receptorY : receptorY - hitTargetH;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pressed ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(inset.x, targetY, inset.width, hitTargetH, ARGON_CORNER_RADIUS);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = pressed ? '#ffffff' : 'rgb(196,196,196)';
    ctx.beginPath();
    ctx.roundRect(inset.x, receptorY - lipH / 2, inset.width, lipH, lipH / 2);
    ctx.fill();

    const ovalW = Math.min(22, inset.width * 0.42);
    const ovalH = 14;
    const ovalY = upscroll
      ? receptorY - 30 - ovalH / 2
      : receptorY + 30 - ovalH / 2;
    ctx.beginPath();
    ctx.roundRect(inset.x + (inset.width - ovalW) / 2, ovalY, ovalW, ovalH, ovalH / 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    if (pressed) {
      ctx.shadowColor = hexToRgba(color, 0.7);
      ctx.shadowBlur = 18;
      ctx.fillStyle = hexToRgba(color, 0.85);
      ctx.fill();
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const keyBottom = upscroll ? 36 : height - 36;
    const dotR = 4;
    const clusterY = keyBottom;
    const dots = [
      { dx: 0, dy: upscroll ? 6 : -6 },
      { dx: -7, dy: upscroll ? -2 : 2 },
      { dx: 7, dy: upscroll ? -2 : 2 },
    ];
    ctx.fillStyle = pressed ? '#ffffff' : color;
    if (pressed) {
      ctx.shadowColor = hexToRgba(color, 0.5);
      ctx.shadowBlur = 16;
    }
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc(inset.x + inset.width / 2 + dot.dx, clusterY + dot.dy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (showKeyLabels && keyLabels[i]) {
      ctx.font = '900 18px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = pressed ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        keyLabels[i].toUpperCase(),
        inset.x + inset.width / 2,
        upscroll ? receptorY + 54 : receptorY - 54,
      );
    }

    ctx.restore();
  }
}
