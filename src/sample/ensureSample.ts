import JSZip from 'jszip';
import { db } from '../storage/db';
import { importOszPackage } from '../storage/osz';

export async function ensureSampleChart(): Promise<void> {
  const existing = await db.beatmapSets.where('title').equals('Argon Pulse').first();
  if (existing) return;
  const zip = new JSZip();
  zip.file('audio.wav', buildWav(12));
  zip.file('Argon Pulse (Rhythm Mania).osu', SAMPLE_OSU);
  const blob = await zip.generateAsync({ type: 'blob' });
  await importOszPackage(blob, 'sample');
}

function buildWav(seconds: number): ArrayBuffer {
  const sampleRate = 44100;
  const n = sampleRate * seconds;
  const dataSize = n * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const bpm = 140;
  const beat = 60 / bpm;
  const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 261.63, 196.0];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beat);
    const freq = notes[beatIndex % notes.length];
    const env = Math.max(0, 1 - ((t % beat) / beat) * 1.6);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.35;
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, sample * 32767)), true);
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

const SAMPLE_OSU = `osu file format v14

[General]
AudioFilename: audio.wav
AudioLeadIn: 0
PreviewTime: 0
Countdown: 0
SampleSet: Soft
StackLeniency: 0.7
Mode: 3
LetterboxInBreaks: 0

[Editor]
DistanceSpacing: 1
BeatDivisor: 4
GridSize: 4
TimelineZoom: 1

[Metadata]
Title:Argon Pulse
TitleUnicode:Argon Pulse
Artist:Rhythm Mania
ArtistUnicode:Rhythm Mania
Creator:Rhythm Mania
Version:4K Sample
Source:
Tags:original sample cc0
BeatmapID:0
BeatmapSetID:0

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:5
ApproachRate:5
SliderMultiplier:1.4
SliderTickRate:1

[Events]
//Background and Video events
//Break Periods
//Storyboard Layer 0 (Background)
//Storyboard Layer 1 (Fail)
//Storyboard Layer 2 (Pass)
//Storyboard Layer 3 (Foreground)
//Storyboard Sound Samples

[TimingPoints]
0,428.571428571429,4,2,1,100,1,0
4000,-50,4,2,1,100,0,0
8000,-200,4,2,1,100,0,0
10000,-100,4,2,1,100,0,0

[HitObjects]
36,192,0,1,0,0:0:0:0:
219,192,428,1,0,0:0:0:0:
402,192,857,1,0,0:0:0:0:
585,192,1285,1,0,0:0:0:0:
36,192,1714,1,0,0:0:0:0:
219,192,2142,1,0,0:0:0:0:
402,192,2571,1,0,0:0:0:0:
585,192,3000,1,0,0:0:0:0:
36,192,3428,128,0,4285:0:0:0:0:
585,192,3857,1,0,0:0:0:0:
219,192,4285,1,0,0:0:0:0:
402,192,4714,1,0,0:0:0:0:
36,192,5142,1,0,0:0:0:0:
585,192,5571,1,0,0:0:0:0:
219,192,6000,128,0,6857:0:0:0:0:
402,192,6428,1,0,0:0:0:0:
36,192,6857,1,0,0:0:0:0:
585,192,7285,1,0,0:0:0:0:
219,192,7714,1,0,0:0:0:0:
402,192,8142,1,0,0:0:0:0:
36,192,8571,1,0,0:0:0:0:
219,192,9000,1,0,0:0:0:0:
402,192,9428,1,0,0:0:0:0:
585,192,9857,1,0,0:0:0:0:
36,192,10285,1,0,0:0:0:0:
585,192,10714,1,0,0:0:0:0:
`;
