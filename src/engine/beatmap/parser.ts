import { mapColumn, type ParsedManiaBeatmap, type RawHitObject, type TimingPoint } from './types';

export function parseOsu(content: string): ParsedManiaBeatmap {
  const normalised = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const sections = splitSections(normalised);

  const general = parseKeyValues(sections.get('General') ?? '');
  const metadata = parseKeyValues(sections.get('Metadata') ?? '');
  const difficulty = parseKeyValues(sections.get('Difficulty') ?? '');
  const events = sections.get('Events') ?? '';
  const timingRaw = sections.get('TimingPoints') ?? '';
  const hitRaw = sections.get('HitObjects') ?? '';

  const mode = Number(general.get('Mode') ?? '0');
  if (mode !== 3) {
    throw new Error(`Beatmap Mode is ${mode}, expected 3 (osu!mania)`);
  }

  const keyCount = Math.round(Number(difficulty.get('CircleSize') ?? '4'));
  if (!Number.isFinite(keyCount) || keyCount < 1 || keyCount > 10) {
    throw new Error(`Unsupported key count: ${keyCount}`);
  }

  return {
    general: {
      audioFilename: general.get('AudioFilename') ?? '',
      audioLeadIn: Number(general.get('AudioLeadIn') ?? '0'),
      previewTime: Number(general.get('PreviewTime') ?? '-1'),
    },
    metadata: {
      title: metadata.get('Title') ?? '',
      titleUnicode: metadata.get('TitleUnicode') ?? metadata.get('Title') ?? '',
      artist: metadata.get('Artist') ?? '',
      artistUnicode: metadata.get('ArtistUnicode') ?? metadata.get('Artist') ?? '',
      creator: metadata.get('Creator') ?? '',
      version: metadata.get('Version') ?? '',
      beatmapId: Number(metadata.get('BeatmapID') ?? '0'),
      beatmapSetId: Number(metadata.get('BeatmapSetID') ?? '0'),
    },
    difficulty: {
      keyCount,
      overallDifficulty: Number(difficulty.get('OverallDifficulty') ?? '5'),
      hpDrainRate: Number(difficulty.get('HPDrainRate') ?? '5'),
      sliderMultiplier: Number(difficulty.get('SliderMultiplier') ?? '1.4'),
      sliderTickRate: Number(difficulty.get('SliderTickRate') ?? '1'),
    },
    backgroundFilename: parseBackground(events),
    timingPoints: parseTimingPoints(timingRaw),
    hitObjects: parseHitObjects(hitRaw, keyCount),
  };
}

function splitSections(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = content.split(/^\[([^\]]+)\]\s*$/m);
  // parts[0] is preamble; then name, body, name, body...
  for (let i = 1; i < parts.length; i += 2) {
    map.set(parts[i], parts[i + 1] ?? '');
  }
  return map;
}

function parseKeyValues(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) continue;
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

function parseBackground(events: string): string | null {
  for (const line of events.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const parts = trimmed.split(',');
    if (parts[0] === '0' || parts[0] === 'Background') {
      const filename = (parts[2] ?? '').replace(/^"|"$/g, '');
      return filename || null;
    }
  }
  return null;
}

function parseTimingPoints(body: string): TimingPoint[] {
  const points: TimingPoint[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const p = trimmed.split(',');
    if (p.length < 2) continue;
    const uninherited = p.length < 7 ? true : p[6] === '1';
    points.push({
      time: Number(p[0]),
      beatLength: Number(p[1]),
      meter: Number(p[2] ?? '4'),
      sampleSet: Number(p[3] ?? '0'),
      sampleIndex: Number(p[4] ?? '0'),
      volume: Number(p[5] ?? '100'),
      uninherited,
      effects: Number(p[7] ?? '0'),
    });
  }
  return points;
}

function parseHitObjects(body: string, keyCount: number): RawHitObject[] {
  const objects: RawHitObject[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const p = trimmed.split(',');
    if (p.length < 5) continue;
    const x = Number(p[0]);
    const time = Number(p[2]);
    const type = Number(p[3]);
    const hitSound = Number(p[4] ?? '0');
    const isHold = (type & 128) !== 0;
    let endTime = time;
    let hitSample = '';
    if (isHold) {
      const extras = (p[5] ?? '').split(':');
      endTime = Number(extras[0]);
      hitSample = extras.slice(1).join(':');
    } else {
      hitSample = p.slice(5).join(',');
    }
    objects.push({
      column: mapColumn(x, keyCount),
      startTime: time,
      endTime,
      isHold,
      hitSound,
      hitSample,
    });
  }
  objects.sort((a, b) => a.startTime - b.startTime || a.column - b.column);
  return objects;
}
