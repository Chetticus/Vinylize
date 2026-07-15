/**
 * Web Audio playback with instant A/B switching.
 *
 * Both decoded buffers (original and vinyl) play simultaneously through two
 * gain nodes; "switching" just flips which gain is 1 and which is 0. Because
 * the two sources share one start call on one clock, the comparison is
 * sample-synchronized and glitch-free — the brief's "instant compare" without
 * restart artifacts. (AudioBufferSourceNodes are one-shot, so pause/seek
 * rebuilds them; that's the Web Audio idiom, not a workaround.)
 */

export type PlaybackMode = "original" | "vinyl";

export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private original: AudioBuffer | null = null;
  private vinyl: AudioBuffer | null = null;

  private srcOriginal: AudioBufferSourceNode | null = null;
  private srcVinyl: AudioBufferSourceNode | null = null;
  private gainOriginal: GainNode | null = null;
  private gainVinyl: GainNode | null = null;

  // Master volume feeds a limiter, not the destination directly: the slider
  // goes up to 4x (+12 dB) so quiet uploads get properly loud on laptop
  // speakers, and the compressor catches what would otherwise hard-clip.
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volume = 2.0;

  private mode: PlaybackMode = "vinyl";
  private startedAtCtxTime = 0; // ctx.currentTime when playback began
  private startOffset = 0;      // clip position (s) where playback began
  private playing = false;

  /** Called when playback reaches the end of the clip. */
  onEnded: (() => void) | null = null;

  setBuffers(original: AudioBuffer, vinyl: AudioBuffer): void {
    this.stop();
    this.original = original;
    this.vinyl = vinyl;
  }

  get isReady(): boolean {
    return this.original !== null && this.vinyl !== null;
  }

  get duration(): number {
    return this.original?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentMode(): PlaybackMode {
    return this.mode;
  }

  /** Current clip position in seconds. */
  position(): number {
    if (!this.ctx || !this.playing) return this.startOffset;
    return Math.min(this.startOffset + this.ctx.currentTime - this.startedAtCtxTime, this.duration);
  }

  private ensureContext(): AudioContext {
    // Created lazily: browsers only allow audio after a user gesture.
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.limiter = this.ctx.createDynamicsCompressor();
      // Fast, deep limiting: only acts when the boosted signal would clip.
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 16;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.25;
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
    }
  }

  get currentVolume(): number {
    return this.volume;
  }

  play(offset?: number): void {
    if (!this.original || !this.vinyl) return;
    const ctx = this.ensureContext();
    this.stopSources();

    this.startOffset = Math.max(0, Math.min(offset ?? this.startOffset, this.duration - 0.01));
    this.gainOriginal = ctx.createGain();
    this.gainVinyl = ctx.createGain();
    this.applyModeGains();
    this.gainOriginal.connect(this.masterGain!);
    this.gainVinyl.connect(this.masterGain!);

    this.srcOriginal = ctx.createBufferSource();
    this.srcOriginal.buffer = this.original;
    this.srcOriginal.connect(this.gainOriginal);
    this.srcVinyl = ctx.createBufferSource();
    this.srcVinyl.buffer = this.vinyl;
    this.srcVinyl.connect(this.gainVinyl);

    const when = ctx.currentTime + 0.02; // small scheduling headroom
    this.srcOriginal.start(when, this.startOffset);
    this.srcVinyl.start(when, this.startOffset);
    this.startedAtCtxTime = when;
    this.playing = true;

    this.srcVinyl.onended = () => {
      if (this.playing) {
        this.playing = false;
        this.startOffset = 0;
        this.onEnded?.();
      }
    };
  }

  pause(): void {
    if (!this.playing) return;
    this.startOffset = this.position();
    this.stopSources();
    this.playing = false;
  }

  seek(offset: number): void {
    const wasPlaying = this.playing;
    this.startOffset = Math.max(0, Math.min(offset, this.duration));
    if (wasPlaying) this.play(this.startOffset);
  }

  setMode(mode: PlaybackMode): void {
    this.mode = mode;
    this.applyModeGains();
  }

  private applyModeGains(): void {
    if (!this.ctx || !this.gainOriginal || !this.gainVinyl) return;
    // 5 ms ramp: instant to the ear, but avoids a click at the crossover.
    const t = this.ctx.currentTime;
    const target = this.mode === "original" ? this.gainOriginal : this.gainVinyl;
    const other = this.mode === "original" ? this.gainVinyl : this.gainOriginal;
    target.gain.cancelScheduledValues(t);
    other.gain.cancelScheduledValues(t);
    target.gain.setTargetAtTime(1, t, 0.005);
    other.gain.setTargetAtTime(0, t, 0.005);
  }

  private stopSources(): void {
    for (const src of [this.srcOriginal, this.srcVinyl]) {
      if (src) {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* not started — fine */
        }
      }
    }
    this.srcOriginal = this.srcVinyl = null;
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.startOffset = 0;
  }
}
