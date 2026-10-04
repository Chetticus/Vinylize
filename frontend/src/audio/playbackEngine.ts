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
export type AcousticSpace = "room";

/**
 * A deterministic, client-generated stereo impulse response. Codrops used
 * downloaded room recordings; making ours in Web Audio keeps the feature
 * self-contained and avoids shipping somebody else's licensed samples.
 */
function makeImpulseResponse(
  ctx: AudioContext,
): AudioBuffer {
  const seconds = 0.9;
  const decay = 5.8;
  const preDelayS = 0.008;
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    // xorshift32: stable on every load, but decorrelated between channels and
    // spaces so the result has width instead of sounding like mono hiss.
    let seed = 0x41c6ce57 ^ (channel * 0x9e3779b9);
    let low = 0;
    const start = Math.floor(preDelayS * ctx.sampleRate);
    for (let i = start; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      // A little low-pass diffusion prevents the synthetic tail from reading
      // as white noise while retaining a warm, audible room.
      low += (noise - low) * 0.22;
      const t = (i - start) / Math.max(1, length - start - 1);
      const envelope = Math.pow(1 - t, decay) * (0.72 + 0.28 * Math.exp(-t * 28));
      data[i] = (noise * 0.38 + low * 0.62) * envelope;
    }

    // Early reflections give each preset a recognisable room shape before
    // the diffuse tail arrives. Slight channel offsets make them spatial.
    const taps = [[0.014, 0.72], [0.027, 0.48], [0.043, 0.31], [0.071, 0.18]];
    for (const [delay, gain] of taps) {
      const i = Math.min(length - 1, Math.floor((delay + channel * 0.0017) * ctx.sampleRate));
      data[i] += gain;
    }
  }
  return buffer;
}

export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private original: AudioBuffer | null = null;
  private vinyl: AudioBuffer | null = null;

  private srcOriginal: AudioBufferSourceNode | null = null;
  private srcVinyl: AudioBufferSourceNode | null = null;
  private gainOriginal: GainNode | null = null;
  private gainVinyl: GainNode | null = null;

  // Vinyl alone receives the room response. Digital goes directly through
  // volume to the destination, without acoustics or the vinyl safety limiter.
  private programBus: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private roomConvolver: ConvolverNode | null = null;
  private roomGain: GainNode | null = null;

  // The vinyl bus retains its existing output protection. Digital deliberately
  // bypasses it so the reference is not compressed even near full scale.
  private masterGain: GainNode | null = null;
  private digitalMasterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volume = 1.0;
  private acousticSpace: AcousticSpace = "room";

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
    return Math.min(this.startOffset + Math.max(0, this.ctx.currentTime - this.startedAtCtxTime), this.duration);
  }

  private ensureContext(): AudioContext {
    // Created lazily: browsers only allow audio after a user gesture.
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.digitalMasterGain = this.ctx.createGain();
      this.digitalMasterGain.gain.value = this.volume;
      this.digitalMasterGain.connect(this.ctx.destination);

      this.programBus = this.ctx.createGain();
      this.dryGain = this.ctx.createGain();
      this.roomConvolver = this.ctx.createConvolver();
      this.roomConvolver.buffer = makeImpulseResponse(this.ctx);
      this.roomGain = this.ctx.createGain();

      this.programBus.connect(this.dryGain);
      this.dryGain.connect(this.masterGain);
      this.programBus.connect(this.roomConvolver);
      this.roomConvolver.connect(this.roomGain);
      this.roomGain.connect(this.masterGain);

      this.dryGain.gain.value = 0.94;
      this.roomGain.gain.value = 0.18;
      this.limiter = this.ctx.createDynamicsCompressor();
      // A hard knee just below 0 dBFS leaves normal 1x playback untouched.
      // The previous low threshold compressed both A and B at ordinary
      // levels, coloring the reference and masking vinyl transients.
      this.limiter.threshold.value = -0.2;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.08;
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
      this.digitalMasterGain?.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
    }
  }

  get currentVolume(): number {
    return this.volume;
  }

  setAcousticSpace(space: AcousticSpace): void {
    this.acousticSpace = space;
  }

  get currentAcousticSpace(): AcousticSpace {
    return this.acousticSpace;
  }

  play(offset?: number): void {
    if (!this.original || !this.vinyl) return;
    const ctx = this.ensureContext();
    this.stopSources();

    this.startOffset = Math.max(0, Math.min(offset ?? this.startOffset, this.duration - 0.01));
    this.gainOriginal = ctx.createGain();
    this.gainVinyl = ctx.createGain();
    // Hard-set the initial values BEFORE the sources start: gain nodes are
    // born at 1.0, and a ramp-from-1 would let ~50 ms of the muted rendition
    // (vinyl clicks included) bleed under the other at every play/seek.
    // Ramps are only for LIVE switches (applyModeGains).
    this.gainOriginal.gain.value = this.mode === "original" ? 1 : 0;
    this.gainVinyl.gain.value = this.mode === "vinyl" ? 1 : 0;
    this.gainOriginal.connect(this.digitalMasterGain!);
    this.gainVinyl.connect(this.programBus!);
    this.roomGain!.gain.cancelScheduledValues(ctx.currentTime);
    this.roomGain!.gain.value = this.mode === "vinyl" ? 0.18 : 0;

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
        this.stopSources();
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
    // A short linear crossfade is smooth but still precise for A/B listening.
    // Linear gain keeps level constant when these synchronized signals match.
    const t = this.ctx.currentTime;
    const end = t + 0.065;
    const target = this.mode === "original" ? this.gainOriginal : this.gainVinyl;
    const other = this.mode === "original" ? this.gainVinyl : this.gainOriginal;

    this.holdGain(target.gain, t);
    this.holdGain(other.gain, t);
    target.gain.linearRampToValueAtTime(1, end);
    other.gain.linearRampToValueAtTime(0, end);
    // Mute any convolution tail on Digital too; otherwise reverb from the
    // outgoing vinyl version could linger underneath the clean reference.
    if (this.roomGain) {
      this.holdGain(this.roomGain.gain, t);
      this.roomGain.gain.linearRampToValueAtTime(this.mode === "vinyl" ? 0.18 : 0, end);
    }
  }

  /** Preserve the current value if a rapid second click interrupts a fade. */
  private holdGain(param: AudioParam, at: number): void {
    if (typeof param.cancelAndHoldAtTime === "function") {
      param.cancelAndHoldAtTime(at);
      return;
    }
    const value = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(value, at);
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
    this.srcOriginal?.disconnect();
    this.srcVinyl?.disconnect();
    this.gainOriginal?.disconnect();
    this.gainVinyl?.disconnect();
    this.gainOriginal = this.gainVinyl = null;
    this.srcOriginal = this.srcVinyl = null;
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.startOffset = 0;
  }
}
