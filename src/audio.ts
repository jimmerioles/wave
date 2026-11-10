/**
 * Wave's instrument.
 *
 * Everything is synthesized: three oscillators per voice (saw, triangle, sine),
 * a shared resonant low-pass filter, an ADSR amplitude envelope, a stereo
 * ping-pong delay, a soft clipper, a compressor and an analyser.
 *
 * The AudioContext is created lazily on the first user gesture. Muting happens
 * after the analyser so the visualizer keeps breathing even with sound off.
 */

export interface WaveNote {
  /** Physical key on a QWERTY keyboard. */
  key: string;
  /** Note name, e.g. C3. */
  name: string;
  frequency: number;
}

export const NOTES: WaveNote[] = [
  { key: "A", name: "C3", frequency: 130.81 },
  { key: "S", name: "D3", frequency: 146.83 },
  { key: "D", name: "E3", frequency: 164.81 },
  { key: "F", name: "G3", frequency: 196.0 },
  { key: "G", name: "A3", frequency: 220.0 },
  { key: "H", name: "C4", frequency: 261.63 },
  { key: "J", name: "D4", frequency: 293.66 },
  { key: "K", name: "E4", frequency: 329.63 },
];

export type PresetKey = "bloom" | "glass" | "tape";

export interface Preset {
  key: PresetKey;
  name: string;
  description: string;
  /** Slider values (0–100 cutoff, 0–60 echo). */
  cutoff: number;
  echo: number;
  q: number;
  delayTime: number;
  feedback: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  saw: number;
  triangle: number;
  sine: number;
  detune: number;
}

export const PRESETS: Record<PresetKey, Preset> = {
  bloom: {
    key: "bloom",
    name: "Bloom",
    description: "Warm, wide, a little slow.",
    cutoff: 56,
    echo: 22,
    q: 1.3,
    delayTime: 0.34,
    feedback: 0.34,
    attack: 0.02,
    decay: 0.5,
    sustain: 0.62,
    release: 1.25,
    saw: 0.5,
    triangle: 0.28,
    sine: 0.18,
    detune: 8,
  },
  glass: {
    key: "glass",
    name: "Glass",
    description: "Bright, brittle, quick to speak.",
    cutoff: 82,
    echo: 34,
    q: 3.1,
    delayTime: 0.21,
    feedback: 0.44,
    attack: 0.005,
    decay: 0.24,
    sustain: 0.26,
    release: 1.65,
    saw: 0.16,
    triangle: 0.58,
    sine: 0.22,
    detune: 4,
  },
  tape: {
    key: "tape",
    name: "Tape",
    description: "Soft, dusty, slightly warped.",
    cutoff: 38,
    echo: 42,
    q: 0.8,
    delayTime: 0.46,
    feedback: 0.46,
    attack: 0.085,
    decay: 0.7,
    sustain: 0.7,
    release: 0.95,
    saw: 0.58,
    triangle: 0.2,
    sine: 0.24,
    detune: 14,
  },
};

const CUTOFF_MIN = 170;
const CUTOFF_MAX = 8200;

/** Map a 0–100 slider value to a musical, logarithmic frequency. */
export function cutoffFromSlider(value: number): number {
  const t = Math.max(0, Math.min(100, value)) / 100;
  return CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, t);
}

export function formatHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

interface Voice {
  note: number;
  envelope: GainNode;
  oscillators: OscillatorNode[];
  tail: GainNode;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

/** A gentle tanh-ish curve to take the edge off eight voices at once. */
function makeSoftClipCurve(amount = 1.6): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export class SynthEngine {
  analyser: AnalyserNode | null = null;

  private context: AudioContext | null = null;
  private bus: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private delayInput: GainNode | null = null;
  private delayLeft: DelayNode | null = null;
  private delayRight: DelayNode | null = null;
  private delayFeedbackL: GainNode | null = null;
  private delayFeedbackR: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private master: GainNode | null = null;
  private muteGain: GainNode | null = null;

  private voices = new Map<number, Voice>();
  private preset: Preset = PRESETS.bloom;
  private cutoffValue = PRESETS.bloom.cutoff;
  private echoValue = PRESETS.bloom.echo / 100;
  private muted = false;

  get ready(): boolean {
    return this.context !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Build the graph if needed and resume the context. Safe to call from any
   * user gesture; calling it repeatedly does nothing beyond a cheap resume.
   */
  ensure(): void {
    if (!this.context) {
      this.build();
    }
    const ctx = this.context;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  async suspend(): Promise<void> {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    try {
      await ctx.suspend();
    } catch {
      /* Some browsers refuse to suspend; the graph is silent anyway. */
    }
  }

  async resume(): Promise<void> {
    const ctx = this.context;
    if (!ctx || ctx.state === "running") return;
    try {
      await ctx.resume();
    } catch {
      /* The next gesture will try again. */
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.context;
    const gain = this.muteGain;
    if (ctx && gain) {
      gain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    }
  }

  setCutoff(sliderValue: number): void {
    this.cutoffValue = sliderValue;
    const ctx = this.context;
    const tone = this.tone;
    if (!ctx || !tone) return;
    tone.frequency.setTargetAtTime(
      cutoffFromSlider(sliderValue),
      ctx.currentTime,
      0.035,
    );
  }

  /** 0–1: how much delayed signal reaches the master filter. */
  setEcho(amount: number): void {
    this.echoValue = Math.max(0, Math.min(1, amount));
    const ctx = this.context;
    const wet = this.delayWet;
    if (!ctx || !wet) return;
    wet.gain.setTargetAtTime(this.echoValue * 0.55, ctx.currentTime, 0.04);
  }

  setPreset(key: PresetKey): void {
    const preset = PRESETS[key];
    this.preset = preset;
    this.cutoffValue = preset.cutoff;
    this.echoValue = preset.echo / 100;

    const ctx = this.context;
    if (!ctx) return;

    const tone = this.tone;
    const left = this.delayLeft;
    const right = this.delayRight;
    const fbL = this.delayFeedbackL;
    const fbR = this.delayFeedbackR;
    const now = ctx.currentTime;

    if (tone) {
      tone.Q.setTargetAtTime(preset.q, now, 0.06);
      tone.frequency.setTargetAtTime(
        cutoffFromSlider(preset.cutoff),
        now,
        0.06,
      );
    }
    if (left && right) {
      left.delayTime.setTargetAtTime(preset.delayTime, now, 0.08);
      right.delayTime.setTargetAtTime(preset.delayTime * 1.5, now, 0.08);
    }
    if (fbL && fbR) {
      fbL.gain.setTargetAtTime(preset.feedback, now, 0.08);
      fbR.gain.setTargetAtTime(preset.feedback, now, 0.08);
    }
  }

  noteOn(noteIndex: number, velocity = 1): void {
    const ctx = this.context;
    const bus = this.bus;
    const delayInput = this.delayInput;
    if (!ctx || !bus || !delayInput) return;

    // One voice per note; retriggering replaces the old tail.
    const existing = this.voices.get(noteIndex);
    if (existing) this.releaseVoice(existing, 0.06);

    const note = NOTES[noteIndex];
    if (!note) return;

    const preset = this.preset;
    const now = ctx.currentTime;
    const frequency = note.frequency;

    const envelope = ctx.createGain();
    envelope.gain.value = 0.0001;

    const dry = ctx.createGain();
    dry.gain.value = 1;

    const send = ctx.createGain();
    send.gain.value = 0.38 + preset.echo / 120;

    envelope.connect(dry).connect(bus);
    envelope.connect(send).connect(delayInput);

    const oscillators: OscillatorNode[] = [];
    const layers = [
      { type: "sawtooth" as OscillatorType, gain: preset.saw, detune: -preset.detune, octave: 0 },
      { type: "triangle" as OscillatorType, gain: preset.triangle, detune: preset.detune, octave: 0 },
      { type: "sine" as OscillatorType, gain: preset.sine, detune: 0, octave: -1 },
    ];

    for (const layer of layers) {
      const osc = ctx.createOscillator();
      osc.type = layer.type;
      osc.frequency.value = frequency * Math.pow(2, layer.octave);
      osc.detune.value = layer.detune;

      const gain = ctx.createGain();
      gain.gain.value = layer.gain;

      osc.connect(gain).connect(envelope);
      osc.start(now);
      oscillators.push(osc);
    }

    const peak = 0.26 * Math.max(0.2, Math.min(1, velocity));
    const sustainPoint = Math.max(0.0001, peak * preset.sustain);

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(peak, now + preset.attack);
    envelope.gain.exponentialRampToValueAtTime(
      sustainPoint,
      now + preset.attack + preset.decay,
    );

    const voice: Voice = {
      note: noteIndex,
      envelope,
      oscillators,
      tail: send,
    };
    this.voices.set(noteIndex, voice);
  }

  noteOff(noteIndex: number): void {
    const voice = this.voices.get(noteIndex);
    if (!voice) return;
    this.voices.delete(noteIndex);
    this.releaseVoice(voice, this.preset.release);
  }

  /** Short fade-out for every voice, used when the page is hidden. */
  allNotesOff(immediate = false): void {
    for (const [index, voice] of this.voices) {
      this.voices.delete(index);
      this.releaseVoice(voice, immediate ? 0.05 : this.preset.release);
    }
  }

  private releaseVoice(voice: Voice, release: number): void {
    const ctx = this.context;
    if (!ctx) return;

    const now = ctx.currentTime;
    const amp = voice.envelope.gain;
    const tail = Math.max(0.02, release);

    try {
      amp.cancelAndHoldAtTime(now);
    } catch {
      amp.cancelScheduledValues(now);
    }
    amp.setValueAtTime(Math.max(amp.value, 0.0001), now);
    amp.exponentialRampToValueAtTime(0.0001, now + tail);

    for (const osc of voice.oscillators) {
      try {
        osc.stop(now + tail + 0.06);
      } catch {
        /* Already stopped. */
      }
    }

    const last = voice.oscillators[voice.oscillators.length - 1];
    if (last) {
      last.onended = () => {
        voice.envelope.disconnect();
        voice.tail.disconnect();
      };
    }
  }

  private build(): void {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;

    const ctx = new Ctor({ latencyHint: "interactive" });
    this.context = ctx;

    const bus = ctx.createGain();
    bus.gain.value = 0.8;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = cutoffFromSlider(this.cutoffValue);
    tone.Q.value = this.preset.q;

    const rumble = ctx.createBiquadFilter();
    rumble.type = "highpass";
    rumble.frequency.value = 45;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSoftClipCurve(1.7);
    shaper.oversample = "2x";

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.24;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    const master = ctx.createGain();
    master.gain.value = 0.2;

    const muteGain = ctx.createGain();
    muteGain.gain.value = this.muted ? 0 : 1;

    bus
      .connect(tone)
      .connect(rumble)
      .connect(shaper)
      .connect(compressor)
      .connect(analyser)
      .connect(master)
      .connect(muteGain)
      .connect(ctx.destination);

    // Ping-pong echo. The wet return is filtered by the shared tone control,
    // so turning the filter down also darkens the repeats.
    const delayInput = ctx.createGain();
    delayInput.gain.value = 1;

    const delayLeft = ctx.createDelay(2);
    const delayRight = ctx.createDelay(2);
    delayLeft.delayTime.value = this.preset.delayTime;
    delayRight.delayTime.value = this.preset.delayTime * 1.5;

    const dampingL = ctx.createBiquadFilter();
    const dampingR = ctx.createBiquadFilter();
    dampingL.type = "lowpass";
    dampingR.type = "lowpass";
    dampingL.frequency.value = 2600;
    dampingR.frequency.value = 2200;

    const feedbackL = ctx.createGain();
    const feedbackR = ctx.createGain();
    feedbackL.gain.value = this.preset.feedback;
    feedbackR.gain.value = this.preset.feedback;

    const panLeft = ctx.createStereoPanner();
    const panRight = ctx.createStereoPanner();
    panLeft.pan.value = -0.65;
    panRight.pan.value = 0.65;

    const wet = ctx.createGain();
    wet.gain.value = this.echoValue * 0.55;

    delayInput.connect(delayLeft);
    delayInput.connect(delayRight);
    delayLeft.connect(panLeft).connect(wet);
    delayRight.connect(panRight).connect(wet);
    delayLeft.connect(dampingL).connect(feedbackL).connect(delayRight);
    delayRight.connect(dampingR).connect(feedbackR).connect(delayLeft);
    wet.connect(tone);

    this.bus = bus;
    this.tone = tone;
    this.delayInput = delayInput;
    this.delayLeft = delayLeft;
    this.delayRight = delayRight;
    this.delayFeedbackL = feedbackL;
    this.delayFeedbackR = feedbackR;
    this.delayWet = wet;
    this.master = master;
    this.muteGain = muteGain;
    this.analyser = analyser;
  }
}
