import JSZip from 'jszip';
import { parseOsu } from '../engine/beatmap/parser';
import { db, type StoredBeatmap } from './db';

async function md5(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export async function importOszPackage(file: File | Blob, source: 'import' | 'download' | 'sample' = 'import'): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const osuFiles: { name: string; content: string }[] = [];
  const blobs = new Map<string, Blob>();

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const base = filename.split('/').pop() ?? filename;
    if (base.endsWith('.osu')) {
      osuFiles.push({ name: base, content: await zipEntry.async('text') });
    } else if (/\.(mp3|ogg|wav|jpg|jpeg|png)$/i.test(base)) {
      const buf = await zipEntry.async('arraybuffer');
      blobs.set(base.toLowerCase(), new Blob([buf], { type: guessMime(base) }));
    }
  }

  const parsed = osuFiles
    .map((f) => {
      try {
        return { file: f, beatmap: parseOsu(f.content) };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (parsed.length === 0) {
    throw new Error('No osu!mania (Mode 3) difficulties in this archive.');
  }

  const first = parsed[0].beatmap;
  const audioName = first.general.audioFilename.toLowerCase();
  const audioBlob = blobs.get(audioName) ?? [...blobs.values()].find((b) => b.type.startsWith('audio/'));
  if (!audioBlob) throw new Error('Archive is missing the audio file.');

  const bgName = first.backgroundFilename?.toLowerCase();
  const cover = (bgName ? blobs.get(bgName) : undefined) ?? [...blobs.values()].find((b) => b.type.startsWith('image/'));

  const setId = first.metadata.beatmapSetId
    ? `set-${first.metadata.beatmapSetId}`
    : `set-${await md5(first.metadata.artist + first.metadata.title + first.metadata.creator)}`;

  const beatmaps: StoredBeatmap[] = [];
  for (const item of parsed) {
    const b = item.beatmap;
    const last = b.hitObjects[b.hitObjects.length - 1];
    beatmaps.push({
      id: await md5(item.file.content),
      setId,
      version: b.metadata.version,
      keyCount: b.difficulty.keyCount,
      overallDifficulty: b.difficulty.overallDifficulty,
      hpDrainRate: b.difficulty.hpDrainRate,
      starRating: estimateStars(b.hitObjects.length, last?.endTime ?? 0, b.difficulty.keyCount),
      lengthMs: last?.endTime ?? 0,
      objectCount: b.hitObjects.length,
      rawOsuContent: item.file.content,
    });
  }

  await db.transaction('rw', db.beatmapSets, db.beatmaps, async () => {
    await db.beatmaps.where('setId').equals(setId).delete();
    await db.beatmapSets.put({
      id: setId,
      title: first.metadata.title,
      artist: first.metadata.artist,
      creator: first.metadata.creator,
      coverImageBlob: cover,
      audioBlob,
      dateAdded: Date.now(),
      source,
    });
    await db.beatmaps.bulkPut(beatmaps);
  });

  return setId;
}

function estimateStars(objects: number, lengthMs: number, keys: number): number {
  const seconds = Math.max(1, lengthMs / 1000);
  const density = objects / seconds;
  return Math.round((density * 0.35 + keys * 0.15) * 100) / 100;
}

export async function downloadFromCatboy(setId: number): Promise<string> {
  const urls = [
    `https://catboy.best/d/${setId}n`,
    `https://osu.direct/d/${setId}`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      const blob = await res.blob();
      return await importOszPackage(blob, 'download');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Download failed');
}
