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

import { IPlayfieldRenderer, PlayfieldFrame, InitOpts, VisibleNote } from './types';
import { renderArgonPlayfield } from './argonPlayfield';
import { isArgonSkin } from './argonSkin';
import { hexToRgba } from './color';
import { getLaneColors } from './skinTheme';
import { getNoteVisualY } from './playfieldLayout';
import { isHoldBodyAnchored, isHoldSuccessfullyCompleted } from './noteState';
import { mergeVisibleTailSegments } from './tailSegments';

function applyFade(colorStr: string, stopOpacity: number) {
  return hexToRgba(colorStr, stopOpacity);
}

/**
 * Prefer an opaque, desynchronized 2D context so Chromium can skip compositor
 * blending. A canvas can only bind 2D attributes once; later mismatched
 * getContext calls return null, so fall back only when the previous attempt
 * failed or threw.
 */
function acquireCanvas2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const attempts: Array<CanvasRenderingContext2DSettings | undefined> = [
    { alpha: false, desynchronized: true },
    { alpha: false },
    undefined,
  ];
  for (const attrs of attempts) {
    try {
      const ctx = attrs ? canvas.getContext('2d', attrs) : canvas.getContext('2d');
      if (ctx) return ctx;
    } catch {
      // Unknown attributes (older Safari / constrained contexts).
    }
  }
  return null;
}

export class Canvas2DRenderer implements IPlayfieldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private keyCount: number = 4;

  async init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void> {
    this.canvas = canvas;
    this.ctx = acquireCanvas2DContext(canvas);
    this.keyCount = opts.keyCount;
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    if (this.ctx) {
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }
  }

  render(frame: PlayfieldFrame): void {
    const { ctx } = this;
    if (!ctx) return;

    const { width, height, columns, notes, shake, settingsSlice, showKeyLabels, keyLabels, isFocusMode } = frame;
    const receptorY = frame.receptorY;

    ctx.clearRect(0, 0, width, height);

    // solid black playfield shield
    const shieldDim = settingsSlice.backgroundDim !== undefined ? settingsSlice.backgroundDim : 0.60;
    ctx.fillStyle = `rgba(0, 0, 0, ${shieldDim})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    if (shake > 0) {
      const shakeX = (Math.random() - 0.5) * shake;
      const shakeY = (Math.random() - 0.5) * shake;
      ctx.translate(shakeX, shakeY);
    }

    const useArgon = isArgonSkin(settingsSlice);
    if (useArgon) {
      renderArgonPlayfield(ctx, frame, this.keyCount);
    } else {
    // Lane background rails & column glows
    const separatorOpacity = settingsSlice.laneSeparatorOpacity ?? 0.30;
    const isDynamicStyle = settingsSlice.squareRenderStyle === 'rhythmplus-dynamic';
    for (let i = 0; i < this.keyCount; i++) {
      const col = columns[i];
      if (!col) continue;

      const xPos = col.x;
      const colW = col.width;

      // Subtle lane background separators
      ctx.strokeStyle = `rgba(71,85,105,${separatorOpacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, height);
      ctx.stroke();

      // Lane-pressed glowing flashes
      if (col.glow > 0) {
        const glowGrad = ctx.createLinearGradient(
          xPos,
          settingsSlice.upsurfaceNoteMode ? 0 : height,
          xPos,
          receptorY
        );

        glowGrad.addColorStop(0, `rgba(59,130,246,${col.glow * 0.3})`);
        glowGrad.addColorStop(1, 'rgba(59,130,246,0)');

        ctx.fillStyle = glowGrad;
        ctx.fillRect(xPos, settingsSlice.upsurfaceNoteMode ? 0 : receptorY, colW, settingsSlice.upsurfaceNoteMode ? receptorY : height - receptorY);
      }
    }

    // Last border outline
    ctx.strokeStyle = `rgba(71,85,105,${separatorOpacity * 1.5})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    const isCircleMode = settingsSlice.playfieldStyle === 'circle' ||
                         settingsSlice.skinId === 'circles' ||
                         settingsSlice.skinId === 'glassy-spheres' ||
                          settingsSlice.skinId === 'hollow-rings';
    const laneColors = getLaneColors(settingsSlice, columns.length);
    const noteColorFor = (column: number) => laneColors?.[column] || columns[column].color;
    const receptorColorFor = noteColorFor;

    const drawEndReceptor = (ey: number, xPosVal: number, colWVal: number, _notePaddingVal: number, noteObj: VisibleNote) => {
      const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
      const rw = colWVal * noteScale;
      const rh = 20 * noteScale;
      const rx = xPosVal + (colWVal - rw) / 2;
      const ry = ey - rh / 2;

      ctx.save();

      // Apply Hidden Mod fade factor for the end receptor!
      let currentOpacity = noteObj.endOpacity ?? 1.0;

      // Dim only fully failed holds; head-miss salvageable LNs keep a readable tail
      if (noteObj.isHoldFailed) {
        currentOpacity *= 0.35;
      }

      ctx.globalAlpha = currentOpacity;

      if (isCircleMode) {
        const cx = xPosVal + colWVal / 2;
        const cy = ey;
        const r = (colWVal * noteScale) / 2.0;
        const noteColor = noteColorFor(noteObj.column);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = noteColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cheap glow: translucent under-fill instead of shadowBlur.
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5 + 5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(noteColor, 0.30);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (isDynamicStyle && !isCircleMode) {
        const dynamicColor = noteObj.isHoldFailed ? '#64748b' : noteColorFor(noteObj.column);
        const barHeight = 8 * noteScale;
        if (!noteObj.isHoldFailed) {
          ctx.strokeStyle = hexToRgba(dynamicColor, 0.35);
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.roundRect(rx, ey - barHeight / 2, rw, barHeight, 2);
          ctx.stroke();
        }
        ctx.strokeStyle = dynamicColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(rx, ey - barHeight / 2, rw, barHeight, 2);
        ctx.stroke();
      } else if (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
        const barHeight = 8 * noteScale;
        ctx.fillStyle = noteColorFor(noteObj.column);
        ctx.fillRect(rx, ey - barHeight / 2, rw, barHeight);
      } else {
        const noteColor = noteColorFor(noteObj.column);

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 4);
        ctx.fillStyle = noteColor;
        ctx.globalAlpha = currentOpacity * 0.55;
        ctx.fill();

        ctx.strokeStyle = hexToRgba(noteColor, 0.85);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    };

    const deferredEndpointTails: Array<() => void> = [];

    // 2. Draw hold note bodies
    notes.forEach((n) => {
      if (n.type === 'hold' && n.endY !== undefined) {
        // Fully-hit LNs are consumed into the receptor: no body above or underneath.
        if (isHoldSuccessfullyCompleted(n)) {
          return;
        }
        const xPos = columns[n.column].x;
        const colW = columns[n.column].width;

        // Anchor the body start to the receptor only while the LN is actively engaged
        // (head hit & held). A missed head must not ground the body — the LN keeps its
        // fixed length and scrolls off naturally; the release stays salvageable.
        let visualStartY = getNoteVisualY(n.bodyStartY ?? n.y, colW, settingsSlice);
        if (isHoldBodyAnchored(n)) {
          visualStartY = receptorY;
        }

        const visualEndY = getNoteVisualY(n.endY, colW, settingsSlice);

        const isOff = Math.max(visualStartY, visualEndY) < -100 ||
          Math.min(visualStartY, visualEndY) > height + 100;

        if (!isOff) {
          ctx.save();
          ctx.globalAlpha = 1.0;
          const holdGrad = ctx.createLinearGradient(xPos, visualStartY, xPos, visualEndY);

          const fadeStart = n.opacity;
          const fadeEnd = n.endOpacity ?? n.opacity;

           if (isDynamicStyle && !isCircleMode) {
              const dynamicHoldColor = n.isHoldFailed ? '#64748b' : noteColorFor(n.column);
              holdGrad.addColorStop(0, applyFade(dynamicHoldColor, fadeStart * 0.55));
              holdGrad.addColorStop(1, applyFade(dynamicHoldColor, fadeEnd * 0.55));
           } else if (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
             const rpColor = noteColorFor(n.column);
             if (n.isHit && !n.isReleased) {
               holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
               holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.5)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(100,116,139,0.5)', fadeEnd));
            } else {
              holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
              holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
            }
          } else if (settingsSlice.playfieldStyle !== 'circle') {
             const rmColor = noteColorFor(n.column);
             if (n.isHit && !n.isReleased) {
               holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.8), fadeStart));
               holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.3), fadeEnd));
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
            } else {
              holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.6), fadeStart));
              holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.2), fadeEnd));
            }
          } else {
             const noteColor = noteColorFor(n.column);
             if (n.isHit && !n.isReleased) {
               holdGrad.addColorStop(0, applyFade(hexToRgba(noteColor, 0.8), fadeStart));
               holdGrad.addColorStop(1, applyFade(hexToRgba(noteColor, 0.3), fadeEnd));
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
            } else {
                holdGrad.addColorStop(0, applyFade(hexToRgba(noteColor, 0.6), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(noteColor, 0.2), fadeEnd));
            }
          }

          ctx.fillStyle = holdGrad;

           const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
           const useNotePadding = settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode;
           const toSegmentY = (timingY: number) =>
             useNotePadding && n.holdRulesVersion === 2
               ? getNoteVisualY(timingY, colW, settingsSlice)
               : timingY;
           const mapHoldSegment = (segment: { startY: number; endY: number }) => ({
             startY: toSegmentY(segment.startY),
             endY: toSegmentY(segment.endY),
           });

           const rw = colW * noteScale;
           const rx = xPos + (colW - rw) / 2;

           const getHoldSegmentRect = (
             segmentStartY: number,
             segmentEndY: number,
             trimStart = false,
             trimEnd = false,
           ) => {
             const lowerY = Math.min(segmentStartY, segmentEndY);
             const upperY = Math.max(segmentStartY, segmentEndY);
             const startsAtLowerEdge = segmentStartY <= segmentEndY;
             const extension = (useNotePadding || (isDynamicStyle && !isCircleMode))
               ? (8 * noteScale) / 2
               : 0;
             const lowerExtension = startsAtLowerEdge
               ? (trimStart ? 0 : extension)
               : (trimEnd ? 0 : extension);
             const upperExtension = startsAtLowerEdge
               ? (trimEnd ? 0 : extension)
               : (trimStart ? 0 : extension);
             return {
               drawY: lowerY - lowerExtension,
               drawH: upperY - lowerY + lowerExtension + upperExtension,
             };
           };

           const drawHoldPath = (
             segmentStartY: number,
             segmentEndY: number,
             trimStart = false,
             trimEnd = false,
             flatStart = false,
             flatEnd = false,
           ) => {
             const segment = getHoldSegmentRect(segmentStartY, segmentEndY, trimStart, trimEnd);
             ctx.beginPath();
             if (isCircleMode) {
               const circleRadius = (colW * noteScale) / 2.0;
               const railStartY = n.holdRulesVersion === 2
                 ? getNoteVisualY(segmentStartY, colW, settingsSlice)
                 : segmentStartY;
               const railEndY = n.holdRulesVersion === 2
                 ? getNoteVisualY(segmentEndY, colW, settingsSlice)
                 : segmentEndY;
               const centerX = xPos + colW / 2;
               ctx.save();
               const railStyle = ctx.fillStyle;
               const previousAlpha = ctx.globalAlpha;
               ctx.fillStyle = railStyle;
               ctx.globalAlpha = previousAlpha * 0.55;
               ctx.fillRect(
                 centerX - circleRadius,
                 Math.min(railStartY, railEndY),
                 circleRadius * 2,
                 Math.abs(railStartY - railEndY),
               );
               ctx.globalAlpha = previousAlpha;
               ctx.strokeStyle = railStyle;
               ctx.lineWidth = Math.max(2, 3 * noteScale);
               ctx.lineCap = 'butt';
               ctx.beginPath();
               ctx.moveTo(centerX - circleRadius, railStartY);
               ctx.lineTo(centerX - circleRadius, railEndY);
               ctx.moveTo(centerX + circleRadius, railStartY);
               ctx.lineTo(centerX + circleRadius, railEndY);
               ctx.stroke();
               ctx.restore();
               ctx.beginPath();
               return segment;
             }
             // A missed tick is often only a few pixels tall. Rounded skin
             // corners then consume its visible width, making it look like
             // a narrow separate note instead of the same tail texture.
             const isCompactDiscreteTail = n.holdRulesVersion === 2 &&
               Math.abs(segmentStartY - segmentEndY) <= Math.max(24, 20 * noteScale);
             if (isCompactDiscreteTail || settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode ||
               settingsSlice.skinId === 'classic-bar' || settingsSlice.skinId === 'minimalist') {
               ctx.rect(rx, segment.drawY, rw, segment.drawH);
             } else if (isDynamicStyle && !isCircleMode) {
               const radius = 4;
               const startsAtLowerEdge = segmentStartY <= segmentEndY;
               const topRadius = (startsAtLowerEdge ? flatStart : flatEnd) ? 0 : radius;
               const bottomRadius = (startsAtLowerEdge ? flatEnd : flatStart) ? 0 : radius;
               ctx.roundRect(rx, segment.drawY, rw, segment.drawH, [topRadius, topRadius, bottomRadius, bottomRadius]);
             } else if (isCircleMode) {
               const radius = rw / 2;
               const startsAtLowerEdge = segmentStartY <= segmentEndY;
               const topRadius = (startsAtLowerEdge ? flatStart : flatEnd) ? 0 : radius;
               const bottomRadius = (startsAtLowerEdge ? flatEnd : flatStart) ? 0 : radius;
               ctx.roundRect(rx, segment.drawY, rw, segment.drawH, [topRadius, topRadius, bottomRadius, bottomRadius]);
             } else {
               const radius = 6;
               const startsAtLowerEdge = segmentStartY <= segmentEndY;
               const topRadius = (startsAtLowerEdge ? flatStart : flatEnd) ? 0 : radius;
               const bottomRadius = (startsAtLowerEdge ? flatEnd : flatStart) ? 0 : radius;
               ctx.roundRect(rx, segment.drawY, rw, segment.drawH, [topRadius, topRadius, bottomRadius, bottomRadius]);
             }
             return segment;
           };

             const drawHoldStroke = (
               segmentStartY: number,
               segmentEndY: number,
                trimStart = false,
                trimEnd = false,
                flatStart = false,
                flatEnd = false,
                skipStartEdge = false,
                skipEndEdge = false,
              ) => {
               if (isDynamicStyle && !isCircleMode) {
                 const dynamicHoldColor = n.isHoldFailed ? '#64748b' : noteColorFor(n.column);
                 const segment = getHoldSegmentRect(segmentStartY, segmentEndY, trimStart, trimEnd);
                 const isCompactDiscreteTail = n.holdRulesVersion === 2 &&
                   Math.abs(segmentStartY - segmentEndY) <= Math.max(24, 20 * noteScale);
                  ctx.save();
                  ctx.strokeStyle = applyFade(dynamicHoldColor, Math.min(1, fadeStart));
                   ctx.lineWidth = 2;
                   ctx.beginPath();
                  if (isCompactDiscreteTail) {
                    ctx.rect(rx, segment.drawY, rw, segment.drawH);
                    if (skipStartEdge || skipEndEdge) {
                      const startsAtLowerEdge = segmentStartY <= segmentEndY;
                      const skipTopEdge = startsAtLowerEdge ? skipStartEdge : skipEndEdge;
                      const skipBottomEdge = startsAtLowerEdge ? skipEndEdge : skipStartEdge;
                      const topY = segment.drawY;
                      const bottomY = segment.drawY + segment.drawH;
                      ctx.beginPath();
                      ctx.moveTo(rx, topY);
                      ctx.lineTo(rx, bottomY);
                      ctx.moveTo(rx + rw, topY);
                      ctx.lineTo(rx + rw, bottomY);
                      if (!skipTopEdge) {
                        ctx.moveTo(rx, topY);
                        ctx.lineTo(rx + rw, topY);
                      }
                      if (!skipBottomEdge) {
                        ctx.moveTo(rx, bottomY);
                       ctx.lineTo(rx + rw, bottomY);
                       }
                     }
                   } else {
                    const startsAtLowerEdge = segmentStartY <= segmentEndY;
                    const skipTopEdge = startsAtLowerEdge ? skipStartEdge : skipEndEdge;
                    const skipBottomEdge = startsAtLowerEdge ? skipEndEdge : skipStartEdge;
                    if (!skipTopEdge && !skipBottomEdge) {
                      const topRadius = (startsAtLowerEdge ? flatStart : flatEnd) ? 0 : 4;
                      const bottomRadius = (startsAtLowerEdge ? flatEnd : flatStart) ? 0 : 4;
                      ctx.roundRect(rx, segment.drawY, rw, segment.drawH, [topRadius, topRadius, bottomRadius, bottomRadius]);
                    } else {
                      const topRadius = skipTopEdge || (startsAtLowerEdge ? flatStart : flatEnd) ? 0 : 4;
                      const bottomRadius = skipBottomEdge || (startsAtLowerEdge ? flatEnd : flatStart) ? 0 : 4;
                      const topY = segment.drawY;
                      const bottomY = segment.drawY + segment.drawH;
                      ctx.moveTo(rx, topY + topRadius);
                      ctx.lineTo(rx, bottomY - bottomRadius);
                      ctx.moveTo(rx + rw, topY + topRadius);
                      ctx.lineTo(rx + rw, bottomY - bottomRadius);
                      if (!skipTopEdge) {
                        ctx.moveTo(rx + topRadius, topY);
                        ctx.lineTo(rx + rw - topRadius, topY);
                      }
                      if (!skipBottomEdge) {
                        ctx.moveTo(rx + bottomRadius, bottomY);
                        ctx.lineTo(rx + rw - bottomRadius, bottomY);
                      }
                    }
                  }
                 ctx.stroke();
                 ctx.restore();
                }
              };

              const bodySegments = n.tailSegments?.map(mapHoldSegment) || [{ startY: visualStartY, endY: visualEndY }];
              const renderSegments = n.holdRulesVersion === 2
                ? mergeVisibleTailSegments([...bodySegments, ...(n.missedTailSegments || []).map(mapHoldSegment)])
                : bodySegments;
              const endpointTailSegment = n.endpointTailSegment
                ? mapHoldSegment(n.endpointTailSegment)
                : undefined;
              for (const segment of renderSegments) {
                const endpointBoundary = endpointTailSegment?.startY;
                const joinsEndpointAtStart = endpointBoundary !== undefined &&
                  Math.abs(segment.startY - endpointBoundary) < 0.001;
                const joinsEndpointAtEnd = endpointBoundary !== undefined &&
                  Math.abs(segment.endY - endpointBoundary) < 0.001;
                drawHoldPath(
                  segment.startY,
                  segment.endY,
                  joinsEndpointAtStart,
                  joinsEndpointAtEnd,
                  joinsEndpointAtStart,
                  joinsEndpointAtEnd,
                );
                ctx.fill();
              }

              ctx.fillStyle = holdGrad;

              // Preserve the portion that was actually held instead of dimming it
              // together with the failed remainder after an early release.
              if (n.hitSegmentStartY !== undefined && n.hitSegmentEndY !== undefined) {
                const hitColor = noteColorFor(n.column);
                const hitGrad = ctx.createLinearGradient(xPos, n.hitSegmentStartY, xPos, n.hitSegmentEndY);
                hitGrad.addColorStop(0, applyFade(hitColor, fadeStart));
                hitGrad.addColorStop(1, applyFade(hitColor, fadeEnd));
                ctx.fillStyle = hitGrad;
                drawHoldPath(
                  getNoteVisualY(n.hitSegmentStartY, colW, settingsSlice),
                  getNoteVisualY(n.hitSegmentEndY, colW, settingsSlice),
                );
                ctx.fill();
                ctx.fillStyle = holdGrad;
              }

              if (isDynamicStyle && !isCircleMode) {
                for (const segment of renderSegments) {
                  const endpointBoundary = endpointTailSegment?.startY;
                  const joinsEndpointAtStart = endpointBoundary !== undefined &&
                    Math.abs(segment.startY - endpointBoundary) < 0.001;
                  const joinsEndpointAtEnd = endpointBoundary !== undefined &&
                    Math.abs(segment.endY - endpointBoundary) < 0.001;
                  drawHoldStroke(
                    segment.startY,
                    segment.endY,
                    joinsEndpointAtStart,
                    joinsEndpointAtEnd,
                    joinsEndpointAtStart,
                    joinsEndpointAtEnd,
                    joinsEndpointAtStart,
                    joinsEndpointAtEnd,
                  );
                }
              }

             if (endpointTailSegment) {
               const endpointSegment = endpointTailSegment;
               deferredEndpointTails.push(() => {
                 ctx.save();
                 ctx.fillStyle = holdGrad;
                 drawHoldPath(
                   endpointSegment.startY,
                   endpointSegment.endY,
                   true,
                   false,
                   true,
                   false,
                 );
                 ctx.fill();
                 if (isDynamicStyle && !isCircleMode) {
                   drawHoldStroke(endpointSegment.startY, endpointSegment.endY, true, false, true, false, true, false);
                 }
                 ctx.restore();
               });
             }

          ctx.restore();
        }
      }
    });

    // 3. Draw notes individual bodies (heads & endpoints)
    notes.forEach((n) => {
      // Skip normal notes that are hit or missed
      if (n.type === 'normal' && (n.isHit || n.isMissed)) {
        return;
      }

      const xPos = columns[n.column].x;
      const colW = columns[n.column].width;
      const noteScale = settingsSlice.noteSizeMultiplier ?? 1;

      const shouldDrawHead = (n.type === 'normal') || (n.type === 'hold' && (n.isMissed || !n.isHit));

      if (shouldDrawHead) {
          // Hold heads use the same bar treatment as normal notes for
          // rhythmplus/dynamic styles (see drawNoteShape branches below),
          // so they must not be skipped here. Skipping hid the LN start.
          const rw = colW * noteScale;
          const rh = 20 * noteScale;
          const rx = xPos + (colW - rw) / 2;
          const ry = getNoteVisualY(n.y, colW, settingsSlice) - rh / 2;

          ctx.save();
          let currentOpacity = n.opacity;

          if (n.type === 'hold' && n.isHoldFailed) {
            currentOpacity *= 0.35;
          }

          ctx.globalAlpha = currentOpacity;

          const drawNoteShape = (radiusDefault: number) => {
            ctx.beginPath();
            if (isDynamicStyle && settingsSlice.playfieldStyle !== 'circle') {
              const barHeight = 8 * noteScale;
              ctx.roundRect(rx, ry + rh / 2 - barHeight / 2, rw, barHeight, 3);
            } else if (settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle') {
              const barHeight = 8 * noteScale;
              ctx.rect(rx, ry + rh / 2 - barHeight / 2, rw, barHeight);
            } else {
              ctx.roundRect(rx, ry, rw, rh, radiusDefault);
            }
          };

          let noteFill: string = noteColorFor(n.column);
          let noteStroke: string = noteColorFor(n.column);

          const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
          if (settingsSlice.skinId === 'minimalist') {
            ctx.fillStyle = noteFill;
            ctx.strokeStyle = noteStroke;
            ctx.lineWidth = 2;

            drawNoteShape(3);
            ctx.fill();
            ctx.stroke();
          } else if (settingsSlice.skinId === 'classic-bar') {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, noteFill);
            grad.addColorStop(1, 'rgba(8, 8, 12, 0.9)');
            ctx.fillStyle = grad;
            ctx.strokeStyle = noteStroke;
            ctx.lineWidth = 1.5;

            drawNoteShape(0);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rx, ry + rh / 2 - 1.5, rw, 3);
          } else if (isCircleMode) {
            const cx = xPos + colW / 2;
            const cy = getNoteVisualY(n.y, colW, settingsSlice);
            const r = (colW * noteScale) / 2.0;
            const noteColor = noteColorFor(n.column);

            // Cheap glow underlay instead of shadowBlur.
            ctx.beginPath();
            ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(noteColor, 0.30);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);

            ctx.fillStyle = noteColor;
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (isDynamicStyle && settingsSlice.playfieldStyle !== 'circle') {
            const isDynamicHold = n.type === 'hold';
            const dynamicColor = noteColorFor(n.column);
            ctx.fillStyle = isDynamicHold ? 'rgba(0,0,0,0)' : dynamicColor;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = isDynamicHold ? 2 : 1.5;
            drawNoteShape(0);
            if (!isDynamicHold) ctx.fill();
            ctx.stroke();
            if (!isDynamicHold) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
              ctx.beginPath();
              ctx.roundRect(rx + 3, ry + rh / 2 - 1, Math.max(1, rw - 6), 2, 1);
              ctx.fill();
            }
          } else if (settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle') {
            grad.addColorStop(0, noteFill);
            grad.addColorStop(1, noteFill);
            ctx.fillStyle = grad;
            drawNoteShape(0);
            ctx.fill();
          } else if (settingsSlice.playfieldStyle !== 'circle') {
            grad.addColorStop(0, noteFill);
            grad.addColorStop(1, noteFill);
            ctx.fillStyle = noteFill;
            ctx.strokeStyle = noteStroke;
            ctx.lineWidth = 2.5;
            drawNoteShape(4);
            ctx.fill();
            ctx.stroke();

            // Second pass replaces the shadowBlur glow with a cheap alpha stroke.
            ctx.strokeStyle = hexToRgba(noteStroke, 0.35);
            ctx.lineWidth = 5;
            ctx.stroke();
          } else {
            grad.addColorStop(0, noteStroke);
            grad.addColorStop(0.3, noteFill);
            if (settingsSlice.skinId === 'cyberpunk') {
              grad.addColorStop(0.85, 'rgba(15, 23, 42, 0.95)');
            } else {
              grad.addColorStop(1, 'rgba(15,23,42,0.85)');
            }

            ctx.fillStyle = grad;
            ctx.strokeStyle = noteStroke;
            ctx.lineWidth = 1.5;

            drawNoteShape(5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rx + 4, ry + 4, Math.max(1, rw - 8), 3);
          }

          ctx.restore();
      }

    });

    // 5. Draw Receptors
    for (let i = 0; i < this.keyCount; i++) {
      const col = columns[i];
      if (!col) continue;

      const xPos = col.x;
      const colW = col.width;
      const isPressed = col.pressed;

      const rcColor = receptorColorFor(i);

      ctx.save();
      ctx.globalAlpha = settingsSlice.receptorOpacity ?? 1.0;

      if (isCircleMode) {
        const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1.0;
        const cx = xPos + colW / 2;
        const cy = receptorY;
        const r = (colW * receptorScale) / 2.0;

        if (isPressed) {
          ctx.fillStyle = rcColor;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = hexToRgba(rcColor, 0.85);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = hexToRgba(rcColor, 0.22);
          ctx.beginPath();
          ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isDynamicStyle || settingsSlice.squareRenderStyle === 'rhythmplus') {
        const rw = colW;
        const rh = 4;
        const rx = xPos;
        const ry = receptorY - rh / 2;

        if (isPressed) {
          ctx.fillStyle = hexToRgba(rcColor, 0.45);
          ctx.fillRect(rx, ry - 3, rw, rh + 6);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry, rw, rh);

          // Lane-pressed glowing flash on this specific lane
          const flashGrad = ctx.createLinearGradient(
            xPos,
            settingsSlice.upsurfaceNoteMode ? 0 : height,
            xPos,
            receptorY
          );
          flashGrad.addColorStop(0, hexToRgba(rcColor, 0.35));
          flashGrad.addColorStop(1, hexToRgba(rcColor, 0));
          ctx.fillStyle = flashGrad;
          ctx.fillRect(
            xPos,
            settingsSlice.upsurfaceNoteMode ? 0 : receptorY,
            colW,
            settingsSlice.upsurfaceNoteMode ? receptorY : height - receptorY
          );
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(rx, ry, rw, rh);
        }
      } else {
        const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1;
        const rw = colW * receptorScale;
        const rh = 28 * receptorScale;
        const rx = xPos + (colW - rw) / 2;
        const ry = receptorY - rh / 2;

        ctx.strokeStyle = isPressed ? '#ffffff' : hexToRgba(rcColor, 0.85);
        ctx.lineWidth = isPressed ? 3.5 : 2;
        ctx.fillStyle = isPressed ? hexToRgba(rcColor, 0.45) : 'rgba(15, 23, 42, 0.85)';

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isPressed ? '#ffffff' : rcColor;
        ctx.beginPath();
        ctx.arc(xPos + colW / 2, receptorY, isPressed ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Key bindings labels
      if (showKeyLabels && keyLabels[i]) {
        ctx.font = '900 22px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isPressed ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.25)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          keyLabels[i].toUpperCase(),
          xPos + colW / 2,
          settingsSlice.upsurfaceNoteMode ? receptorY + 50 : receptorY - 50
        );
      }

      ctx.restore();
    }

    // Draw the endpoint segment after the receptor, using the exact same
    // geometry, fill, and edge treatment as the body pass.
    deferredEndpointTails.forEach((drawEndpointTail) => drawEndpointTail());

    // An unjudged long-note endpoint is still an actionable note. Draw its cap
    // last so the shared body texture joins the cap instead of covering it.
    // The release cap must appear for every square style, including
    // rhythmplus-dynamic which already has a dedicated bar treatment in
    // drawEndReceptor.
    notes.forEach((n) => {
      if (n.type !== 'hold' || n.endY === undefined ||
        (n.holdRulesVersion !== 2 ? (n.isReleased && !n.isReleaseMissed) : n.isReleaseHit)) {
        return;
      }
      const xPos = columns[n.column].x;
      const colW = columns[n.column].width;
      const notePadding = isFocusMode ? 1.5 : 6;
      drawEndReceptor(getNoteVisualY(n.endY, colW, settingsSlice), xPos, colW, notePadding, n);
    });
    }

    // 6b. RENDER FLASHLIGHT VIGNETTE
    const isFlashlight = (settingsSlice.selectedMods || []).some(m => m.toUpperCase() === 'FL');
    if (isFlashlight) {
      const combo = frame.combo || 0;
      let baseRadius = 240;
      if (combo >= 200) {
        baseRadius = 150;
      } else if (combo >= 100) {
        baseRadius = 190;
      }

      // Check break retraction
      let breakFactor = 1.0;
      const breaks = frame.breaks || [];
      const songTime = frame.timeMs;
      if (breaks.length > 0) {
        for (const b of breaks) {
          if (songTime >= b.startTime && songTime <= b.endTime) {
            const breakDuration = b.endTime - b.startTime;
            const transitionMs = Math.min(500, Math.max(50, breakDuration / 2));
            if (songTime < b.startTime + transitionMs) {
              breakFactor = 1 - (songTime - b.startTime) / transitionMs;
            } else if (songTime > b.endTime - transitionMs) {
              breakFactor = (songTime - (b.endTime - transitionMs)) / transitionMs;
            } else {
              breakFactor = 0;
            }
            break;
          }
        }
      }

      const flRadius = breakFactor < 1.0
        ? baseRadius + (Math.max(width, height) - baseRadius) * (1 - breakFactor)
        : baseRadius;

      const centerX = width / 2;
      ctx.save();
      const flGrad = ctx.createRadialGradient(
        centerX, receptorY, flRadius * 0.45,
        centerX, receptorY, flRadius
      );
      flGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      flGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
      flGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.88)');
      flGrad.addColorStop(1, 'rgba(0, 0, 0, 1.0)');

      ctx.fillStyle = flGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    ctx.restore(); // POP screen shake translations
    // Playfield canvas is playfield-only. All hit-error meters live in the
    // ManiaHud overlay and are never drawn here.
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}
