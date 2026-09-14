/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Lazer-style menu cursor (the arrow from the linked osu-cursor demo).
 * Fixed 0-degree angle: no tilt, no drag rotation. Position follows the
 * mouse 1:1 with the native cursor hidden:
 * - hovering a pointer element shows the additive flash
 * - mousedown scales 1 -> 0.9 with the flash held while pressed
 *
 * Images: loads /cursor/cursor.png + /cursor/cursor-additive.png when you
 * drop them into public/cursor/ (see README.txt there). Falls back to an
 * inline SVG arrow so it works with no assets.
 */

import { forwardRef, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import './LazerCursor.css';

interface LazerCursorProps {
  enabled: boolean;
}

const CURSOR_BASE_PX = 30;

const ARROW_PATH = 'M15 5 L15 45 L25.5 35.5 L31 48.5 L36.5 46 L31.5 34 L42.5 34 Z';

const FALLBACK_ARROW_SVG = (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
    <path
      d={ARROW_PATH}
      fill="#000000"
      opacity="0.22"
      transform="translate(1.6 1.8)"
      stroke="none"
    />
    <path
      d={ARROW_PATH}
      fill="#6f6f6f"
      stroke="#f4f4f4"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <circle
      cx="40"
      cy="54.5"
      r="3.6"
      fill="#ffffff"
      stroke="#6f6f6f"
      strokeWidth="2.4"
    />
  </svg>
);

const FALLBACK_ADDITIVE_SVG = (
  <svg viewBox="0 0 64 64" preserveAspectRatio="xMinYMin meet" aria-hidden="true" className="lazer-cursor-additive">
    <path
      d={ARROW_PATH}
      fill="#ffffff"
      opacity="0.95"
    />
    <circle
      cx="40"
      cy="54.5"
      r="3.6"
      fill="#ffffff"
      opacity="0.95"
    />
  </svg>
);

function outQuint(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function outElasticHalf(t: number): number {
  // Approximation of osu!framework Easing.OutElasticHalf for rotation return.
  return Math.pow(2, -10 * t) * Math.sin((0.5 * t - 0.075) * ((2 * Math.PI) / 0.3)) + 1;
}

function animateValue(
  durationMs: number,
  ease: (t: number) => number,
  onFrame: (eased: number) => void,
  onDone?: () => void,
  signal?: { cancelled: boolean },
): void {
  const start = performance.now();
  const tick = (now: number) => {
    if (signal?.cancelled) return;
    const t = Math.min(1, Math.max(0, (now - start) / durationMs));
    onFrame(ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else onDone?.();
  };
  requestAnimationFrame(tick);
}

export default function LazerCursor({ enabled }: LazerCursorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const additiveRef = useRef<HTMLImageElement | HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(pointer: coarse)').matches) return; // touch-first device

    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;

    let disposed = false;
    let visible = false;
    let isTouch = false;
    // -1 native drag, 0 idle, 1 pressed, 3 pointer-hover
    let dragState = 0;
    let scale = 1;
    // Fixed angle: the cursor is permanently locked at 0 degrees. No tilt,
    // no drag rotation — position, press scale, and the additive flash are
    // the only motion.
    let posX = -500;
    let posY = -500;
    let raf = 0;
    let dirty = true;
    // Natural aspect (w/h) of /cursor/cursor.png. The box takes the picture's
    // aspect so non-square art is never squashed; 1 = square SVG fallback.
    const aspectRef = { current: 1 };
    let scaleAnim: { cancelled: boolean } | null = null;
    let additiveAnim: { cancelled: boolean } | null = null;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const render = () => {
      raf = 0;
      if (disposed) return;
      if (!dirty) return;
      dirty = false;
      root.style.display = visible ? 'block' : 'none';
      root.style.transform = `translate(${posX}px, ${posY}px)`;
      const px = CURSOR_BASE_PX;
      const pw = Math.max(1, Math.round(px * aspectRef.current));
      inner.style.width = `${pw}px`;
      inner.style.height = `${px}px`;
      inner.style.transform = `scale(${scale})`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };
    const markDirty = () => {
      dirty = true;
      schedule();
    };

    const setAdditive = (opacity: number) => {
      const el = additiveRef.current as HTMLElement | null;
      if (el) el.style.opacity = String(opacity);
    };

    // Opt-out surfaces that want no custom cursor at all (native cursor only).
    const wantsCustomHidden = (target: HTMLElement): boolean =>
      !!target.closest('[data-lazer-cursor="hidden"]');

    // True text-entry controls: the custom cursor stays visible here too
    // (all native cursors are hidden via CSS). This only suppresses the
    // additive hover flash so text fields keep the plain arrow.
    // Deliberately excludes range sliders, checkboxes, radios, color
    // pickers, and buttons — those are pointer-driven controls.
    const isTextEntry = (target: HTMLElement): boolean =>
      !!target.closest(
        'textarea, select, [contenteditable="true"], ' +
          'input:not([type]), input[type="text"], input[type="search"], ' +
          'input[type="password"], input[type="email"], input[type="url"], ' +
          'input[type="number"], input[type="tel"]',
      );

    // Pointer intent is detected structurally: Tailwind v4 buttons/links
    // usually report `default` rather than `pointer`, and our own
    // `cursor: none !important` override poisons getComputedStyle anyway.
    const isPointerLike = (target: HTMLElement): boolean => {
      // Interactive elements, plus the RM cookie assembly: the rays, ring,
      // and wrapper around the cookie button are decorative divs, so without
      // this the cursor snaps straight the moment the hotspot leaves the
      // button edge even though visually it's still "on the cookie".
      if (target.closest(
        'button, a, [role="button"], summary, [data-lazer-pointer], [data-lazer-cookie], .lazer-main-menu-cookie',
      )) return true;
      let el: HTMLElement | null = target;
      while (el) {
        if (el.classList?.contains('cursor-pointer')) return true;
        const inline = el.style?.cursor;
        if (inline === 'pointer') return true;
        if (inline && inline !== '') return false; // explicit text/move/etc cursor
        el = el.parentElement;
      }
      return false;
    };

    const onMove = (e: MouseEvent) => {
      if (isTouch) {
        isTouch = false;
        return;
      }
      posX = e.clientX;
      posY = e.clientY;
      markDirty();
    };

    const onOver = (e: MouseEvent) => {
      if (dragState === 1) return;
      const t = e.target as HTMLElement | null;
      if (!t || !(t instanceof HTMLElement)) return;
      if (wantsCustomHidden(t)) {
        // Explicit opt-out: no custom cursor at all, native cursor only.
        visible = false;
        document.documentElement.classList.remove('lazer-cursor-on');
        markDirty();
        return;
      }
      // The custom cursor stays visible everywhere else — including text
      // boxes and range sliders. Native cursors stay hidden via CSS.
      visible = true;
      document.documentElement.classList.add('lazer-cursor-on');
      if (!isTextEntry(t) && isPointerLike(t)) {
        if (dragState === 0) {
          dragState = 3;
          additiveAnim && (additiveAnim.cancelled = true);
          const sig: { cancelled: boolean } = { cancelled: false };
          additiveAnim = sig;
          animateValue(200, outQuint, (k) => setAdditive(k), undefined, sig);
          markDirty();
        }
      } else {
        if (dragState === 3) {
          dragState = 0;
          additiveAnim && (additiveAnim.cancelled = true);
          const aFrom = Number((additiveRef.current as HTMLElement | null)?.style.opacity ?? 1);
          const aSig: { cancelled: boolean } = { cancelled: false };
          additiveAnim = aSig;
          animateValue(200, outQuint, (k) => setAdditive(aFrom * (1 - k)), undefined, aSig);
        }
        markDirty();
      }
    };

    const onDown = (e: MouseEvent) => {
      if (isTouch) {
        isTouch = false;
        return;
      }
      if (!visible) return;
      // Pressed state: additive flash + shrink only. The angle never moves.
      scaleAnim && (scaleAnim.cancelled = true);
      additiveAnim && (additiveAnim.cancelled = true);
      const s0 = scale;
      const a0 = Number((additiveRef.current as HTMLElement | null)?.style.opacity ?? 0);
      // Pressed state always flashes the additive layer (matches lazer).
      const targetA = 1;
      const sSig: { cancelled: boolean } = { cancelled: false };
      const aSig: { cancelled: boolean } = { cancelled: false };
      scaleAnim = sSig;
      additiveAnim = aSig;
      animateValue(300, outQuint, (k) => {
        scale = s0 + (0.9 - s0) * k;
        markDirty();
      }, undefined, sSig);
      animateValue(300, outQuint, (k) => setAdditive(a0 + (targetA - a0) * k), undefined, aSig);
      dragState = 1;
      markDirty();
    };

    const onUp = (e: MouseEvent) => {
      if (!visible) return;
      // Hit-test the actual release point: querySelector(':hover') returns the
      // first hovered element in DOM order (usually <html>), not what's under
      // the cursor.
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const releaseOnPointer = !!under && !wantsCustomHidden(under) && !isTextEntry(under) && isPointerLike(under);
      dragState = releaseOnPointer ? 3 : 0;
      scaleAnim && (scaleAnim.cancelled = true);
      additiveAnim && (additiveAnim.cancelled = true);
      const s0 = scale;
      const a0 = Number((additiveRef.current as HTMLElement | null)?.style.opacity ?? 1);
      const sSig: { cancelled: boolean } = { cancelled: false };
      const aSig: { cancelled: boolean } = { cancelled: false };
      scaleAnim = sSig;
      additiveAnim = aSig;
      animateValue(reduceMotion ? 60 : 400, outElasticHalf, (k) => {
        scale = s0 + (1 - s0) * k;
        markDirty();
      }, undefined, sSig);
      animateValue(400, outQuint, (k) => setAdditive(dragState === 3 ? 1 : a0 * (1 - k)), undefined, aSig);
      markDirty();
    };

    const onLeave = () => {
      visible = false;
      document.documentElement.classList.remove('lazer-cursor-on');
      markDirty();
    };

    const onDrag = () => {
      visible = false;
      document.documentElement.classList.remove('lazer-cursor-on');
      dragState = -1;
      markDirty();
    };

    const onDragEnd = () => {
      visible = true;
      document.documentElement.classList.add('lazer-cursor-on');
      dragState = 0;
      scale = 1;
      setAdditive(0);
      markDirty();
    };

    const onTouch = () => {
      isTouch = true;
      visible = false;
      document.documentElement.classList.remove('lazer-cursor-on');
      markDirty();
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('mouseup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    document.addEventListener('drag', onDrag, { passive: true });
    document.addEventListener('dragend', onDragEnd, { passive: true });
    document.addEventListener('touchstart', onTouch, { passive: true });
    document.addEventListener('touchmove', onTouch, { passive: true });

    // Measure the real picture once so the box matches its aspect ratio.
    // Missing file -> onError below keeps the square SVG fallback (aspect 1).
    const probe = new Image();
    probe.onload = () => {
      if (disposed) return;
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        aspectRef.current = probe.naturalWidth / probe.naturalHeight;
        markDirty();
      }
    };
    probe.src = '/cursor/cursor.png';
    markDirty();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      scaleAnim && (scaleAnim.cancelled = true);
      additiveAnim && (additiveAnim.cancelled = true);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('drag', onDrag);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('touchmove', onTouch);
      document.documentElement.classList.remove('lazer-cursor-on');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={rootRef} id="lazer-cursor" style={{ display: 'none' }} aria-hidden="true">
      <div ref={innerRef} className="lazer-cursor-inner">
        <CursorImage src="/cursor/cursor.png" fallback={FALLBACK_ARROW_SVG} />
        <CursorAdditive ref={additiveRef} />
      </div>
    </div>
  );
}

function CursorImage({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
}

const CursorAdditive = forwardRef<HTMLImageElement | HTMLDivElement>(function CursorAdditive(_, ref) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div ref={ref as Ref<HTMLDivElement>} style={{ position: 'absolute', inset: 0, opacity: 0 }}>
        {FALLBACK_ADDITIVE_SVG}
      </div>
    );
  }
  return (
    <img
      ref={ref as Ref<HTMLImageElement>}
      src="/cursor/cursor-additive.png"
      alt=""
      draggable={false}
      className="lazer-cursor-additive"
      onError={() => setFailed(true)}
    />
  );
});
