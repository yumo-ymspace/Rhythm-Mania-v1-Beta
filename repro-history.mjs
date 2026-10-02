import fs from 'node:fs';
// Minimal repro: simulate App load/save cycle with real TS via tsx? We'll directly test logic by importing built files via vitest node?
// Instead, replicate sanitize + persist logic in plain JS to demonstrate bugs.

// Bug 1: persistPlayHistory single-strip-fail returns candidate (ghost) instead of actually-persisted value.
// See src/utils/replayManager.ts lines 66-68: on strip failure, `return candidate` (original oversized) even though setItem failed.
// That means in-memory shows a play that was never saved -> disappears on reload.

// Bug 2: App.tsx load does not enforce historyLimit -> sudden mass deletion on next save.
// Load: setPlayHistory(sanitized) without slice to limit. Next new play slices to limit, deleting many at once.

// Bug 3: Quota eviction deletes oldest due to bloated per-record size (full recordedSettings + verbose boolean frames).

// Demonstrate Bug 2 with pure logic:
function simulateLoadWithoutLimitEnforcement(storedCount, limit) {
  const stored = Array.from({length: storedCount}, (_, i) => ({id: `play_${i}`}));
  // App load: no slicing
  const loaded = stored; // sanitized == parsed
  console.log(`Stored ${storedCount}, limit ${limit}, loaded into memory: ${loaded.length} (should be ${Math.min(storedCount, limit)} if limit enforced)`);
  // Next new play:
  const appended = [{id: 'new'}, ...loaded].slice(0, limit);
  console.log(`After 1 new play, memory+disk: ${appended.length}, deleted ${storedCount + 1 - appended.length} old plays at once!`);
  console.log(`Oldest surviving: ${appended[appended.length-1].id}, wiped: play_${limit-1}..play_${storedCount-1} vanished in one step`);
}

console.log('--- Bug 2: limit not enforced on load ---');
simulateLoadWithoutLimitEnforcement(100, 50);

console.log('');
console.log('--- Bug 1: ghost return ---');
console.log('In persistPlayHistory, if single stripped record still fails setItem, code does `return candidate` (line 68).');
console.log('candidate was never persisted (setItem threw), so in-memory diverges from disk.');
console.log('User sees new play, reloads, it vanishes. Fix: return actually-persisted value (e.g. [] or re-read disk), not candidate.');

// Check actual file for the buggy line
const src = fs.readFileSync('src/utils/replayManager.ts', 'utf8');
const hasGhostReturn = src.includes('return candidate;');
console.log('');
console.log('persistPlayHistory contains `return candidate`:', hasGhostReturn);

const app = fs.readFileSync('src/App.tsx', 'utf8');
// Check load effect slices to limit?
const loadSection = app.slice(app.indexOf('const storedHistory'), app.indexOf('const storedLimit'));
console.log('Load effect enforces historyLimit (slice)?', loadSection.includes('slice(0'));
console.log('Load effect code snippet:');
console.log(loadSection.slice(0, 800));
