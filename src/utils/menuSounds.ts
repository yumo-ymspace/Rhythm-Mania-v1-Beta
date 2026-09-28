/**
 * One-shot menu cookie sounds for the first (lazer) menu.
 *
 * - idle cookie press -> d1.mp3
 * - top-level play button / cookie press -> d2.mp3
 * - play solo button / cookie press -> d3.mp3
 *
 * Low-latency path: each file is fetched + decoded to an AudioBuffer once at
 * boot (see `preloadMenuSounds`, called from `main.tsx`). Every press then
 * creates a fresh BufferSource and calls `start(0)` synchronously inside the
 * click handler (~5-20ms, infinitely overlapping, no seek/pause round-trip).
 *
 * The context is dedicated to menu UI clicks so one-shots never touch the
 * Web Audio gameplay clock (`mainAudio`) or the HTMLAudio song-preview
 * player. When Web Audio is unavailable (or a buffer hasn't finished
 * decoding on the very first press), playback falls back to a fresh
 * HTMLAudio element, which still hits the HTTP cache warmed by the boot
 * fetch.
 */

export type MenuSoundId = 'd1' | 'd2' | 'd3';

const MENU_SOUND_SRC: Record<MenuSoundId, string> = {
  d1: '/sounds/d1.mp3',
  d2: '/sounds/d2.mp3',
  d3: '/sounds/d3.mp3',
};

const MENU_SOUND_IDS: readonly MenuSoundId[] = ['d1', 'd2', 'd3'];

/** Dedicated low-latency context for menu clicks (never the gameplay clock). */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Decoded buffers ready for instant `start(0)` playback. */
const buffers = new Map<MenuSoundId, AudioBuffer>();
let preloaded = false;
let unlockArmed = false;

function createMenuAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtxClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    try {
      return new AudioCtxClass({ latencyHint: 'interactive' });
    } catch {
      return new AudioCtxClass();
    }
  } catch {
    return null;
  }
}

/**
 * Resume the (suspended) context on the earliest user gesture so it is
 * already running before the first cookie press. Resume is cheap and safe
 * to call repeatedly; failures never throw out.
 */
function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const resume = (): void => {
    try {
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* ignore - play() retries resume synchronously */
    }
  };
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', resume, opts);
  window.addEventListener('keydown', resume, opts);
  window.addEventListener('touchstart', resume, opts);
  window.addEventListener('touchend', resume, opts);
}

async function warmOne(id: MenuSoundId): Promise<void> {
  try {
    if (!ctx) return;
    const res = await fetch(MENU_SOUND_SRC[id], { credentials: 'same-origin' });
    if (!res.ok) return;
    const bytes = await res.arrayBuffer();
    // decodeAudioData detaches `bytes`; each sound fetches its own copy.
    const decoded = await ctx.decodeAudioData(bytes);
    buffers.set(id, decoded);
  } catch {
    /* decode/fetch failure falls back to HTMLAudio at play time */
  }
}

/**
 * Fetch + decode all three menu sounds immediately.
 * Safe to call multiple times; subsequent calls are no-ops.
 * Call this as early as possible (main.tsx) so the first cookie press is instant.
 */
export function preloadMenuSounds(): void {
  try {
    if (preloaded || typeof window === 'undefined') return;
    preloaded = true;
    ctx = createMenuAudioContext();
    if (!ctx) return; // No Web Audio: play() uses the HTMLAudio fallback.
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    armUnlock();
    for (const id of MENU_SOUND_IDS) void warmOne(id);
  } catch {
    /* never break startup because of a sound */
  }
}

/** Synchronous fire-and-forget buffer playback. Returns false when unavailable. */
function playBuffered(id: MenuSoundId): boolean {
  try {
    const buffer = buffers.get(id);
    if (!ctx || !master || !buffer) return false;
    if (ctx.state === 'suspended') void ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    try {
      // start(0) = play on the next render quantum: lowest possible latency.
      source.start(0);
    } catch {
      try {
        source.disconnect();
      } catch {
        /* noop */
      }
      return false;
    }
    source.onended = () => {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
    };
    return true;
  } catch {
    return false;
  }
}

/** Fallback when Web Audio is missing or the buffer isn't decoded yet. */
function playFallback(id: MenuSoundId): void {
  try {
    // Fresh element per press: overlaps naturally and starts from the HTTP
    // cache without the pause()+seek round-trip a reused element needs.
    const audio = new Audio(MENU_SOUND_SRC[id]);
    audio.preload = 'auto';
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        /* autoplay blocked or missing file - menu must still navigate */
      });
    }
  } catch {
    /* never break menu navigation because of a sound */
  }
}

export function playMenuSound(id: MenuSoundId): void {
  try {
    if (typeof window === 'undefined') return;
    if (playBuffered(id)) return;
    playFallback(id);
  } catch {
    /* never break menu navigation because of a sound */
  }
}
