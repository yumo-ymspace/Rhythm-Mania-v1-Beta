export class AudioMasterClock {
  private audioBufferSource: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private startTimeAudioCtx = 0;
  private startOffsetMs = 0;
  private userOffsetMs = 0;
  private mapOffsetMs = 0;
  private isPlaying = false;
  private playbackRate = 1;
  private pausedAtMs = 0;
  private anchorAudioTime = 0;
  private anchorPerf = 0;

  constructor(private readonly audioCtx: AudioContext) {
    this.gain = audioCtx.createGain();
    this.gain.connect(audioCtx.destination);
  }

  public setOffsets(userOffset: number, mapOffset: number): void {
    this.userOffsetMs = userOffset;
    this.mapOffsetMs = mapOffset;
  }

  public setVolume(volume: number): void {
    this.gain.gain.value = Math.max(0, Math.min(1, volume));
  }

  public async resume(): Promise<void> {
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
  }

  public start(buffer: AudioBuffer, startPositionMs = 0, rate = 1): void {
    this.stopSource();
    this.playbackRate = rate;
    this.startOffsetMs = startPositionMs;
    this.audioBufferSource = this.audioCtx.createBufferSource();
    this.audioBufferSource.buffer = buffer;
    this.audioBufferSource.playbackRate.setValueAtTime(rate, this.audioCtx.currentTime);
    this.audioBufferSource.connect(this.gain);
    this.startTimeAudioCtx = this.audioCtx.currentTime;
    this.anchorAudioTime = this.startTimeAudioCtx;
    this.anchorPerf = performance.now();
    this.audioBufferSource.start(0, Math.max(0, startPositionMs / 1000));
    this.isPlaying = true;
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.pausedAtMs = this.getRawTimeMs();
    this.stopSource();
    this.isPlaying = false;
  }

  public get pausedPositionMs(): number {
    return this.pausedAtMs;
  }

  public getCurrentTime(): number {
    return this.getRawTimeMs() + this.userOffsetMs + this.mapOffsetMs;
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public get rate(): number {
    return this.playbackRate;
  }

  public stop(): void {
    this.stopSource();
    this.isPlaying = false;
    this.pausedAtMs = 0;
  }

  private getRawTimeMs(): number {
    if (!this.isPlaying) return this.pausedAtMs;
    const audioNow = this.audioCtx.currentTime;
    if (audioNow !== this.anchorAudioTime) {
      this.anchorAudioTime = audioNow;
      this.anchorPerf = performance.now();
    }
    const interpolatedSec = audioNow - this.startTimeAudioCtx + (performance.now() - this.anchorPerf) / 1000;
    return this.startOffsetMs + interpolatedSec * this.playbackRate * 1000;
  }

  private stopSource(): void {
    if (!this.audioBufferSource) return;
    try {
      this.audioBufferSource.stop();
      this.audioBufferSource.disconnect();
    } catch {
      /* already stopped */
    }
    this.audioBufferSource = null;
  }
}

export function clockDeltaToAudio(inputPerfNow: number, clock: AudioMasterClock): number {
  // Map a performance.now() stamp onto the same interpolated audio timeline.
  const visualNow = clock.getCurrentTime();
  const perfNow = performance.now();
  return visualNow + (inputPerfNow - perfNow) * clock.rate;
}
