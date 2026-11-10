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
  /** Physical key on a QWERTY keyboard, or "demo" for demo-only notes. */
  key: string;
  /** Note name, e.g. C3. */
  name: string;
  frequency: number;
  /** The demo uses this note, but the keybed has no pad for it. */
  demoOnly?: boolean;
}

export const NOTES: WaveNote[] = [
  { key: "A", name: "C3", frequency: 130.81 },
  { key: "S", name: "D3", frequency: 146.83 },
  { key: "D", name: "E3", frequency: 164.81 },
  { key: "F", name: "F3", frequency: 174.61 },
  { key: "G", name: "G3", frequency: 196.0 },
  { key: "H", name: "A3", frequency: 220.0 },
  { key: "J", name: "B3", frequency: 246.94 },
  { key: "K", name: "C4", frequency: 261.63 },
  // The demo's chorus needs two notes above the keybed. They stay out of the
  // pad layout so the instrument keeps its eight-key, one-octave shape.
  { key: "demo", name: "D4", frequency: 293.66, demoOnly: true },
  { key: "demo", name: "E4", frequency: 329.63, demoOnly: true },
];

/** How many notes the playable keybed exposes. */
export const KEYBED_SIZE = 8;

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

  /** The shared AudioContext, available after the first gesture. */
  get audioContext(): AudioContext | null {
    return this.context;
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

  noteOff(noteIndex: number, release?: number): void {
    const voice = this.voices.get(noteIndex);
    if (!voice) return;
    this.voices.delete(noteIndex);
    this.releaseVoice(voice, release ?? this.preset.release);
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

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * A small, self-contained 80s pop band for the easter egg.
 *
 * The main synth is deliberately ambient; a rickroll needs a bright lead, a
 * syncopated synth bass and a drum machine. This graph has its own compressor
 * and dotted-eighth echo, then feeds the main analyser so the orb still reacts
 * (and the main mute still applies).
 */
export class RickrollAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private musicBus: GainNode;
  private leadBus: GainNode;
  private bassBus: GainNode;
  private drumBus: GainNode;
  private chordBus: GainNode;
  private noise: AudioBuffer;
  private sources: AudioScheduledSourceNode[] = [];
  private stopped = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.75;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor).connect(destination);

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.8;
    musicBus.connect(master);

    const leadBus = ctx.createGain();
    leadBus.gain.value = 0.9;
    leadBus.connect(musicBus);

    // Trim the sub-bass under the synth bass so it does not swamp the lead.
    const bassHighpass = ctx.createBiquadFilter();
    bassHighpass.type = "highpass";
    bassHighpass.frequency.value = 38;
    bassHighpass.Q.value = 0.7;
    const bassBus = ctx.createGain();
    bassBus.gain.value = 0.5;
    bassBus.connect(bassHighpass).connect(musicBus);

    const drumBus = ctx.createGain();
    drumBus.gain.value = 0.75;
    const drumAir = ctx.createBiquadFilter();
    drumAir.type = "highshelf";
    drumAir.frequency.value = 5000;
    drumAir.gain.value = 4;
    drumBus.connect(drumAir).connect(musicBus);

    const chordBus = ctx.createGain();
    chordBus.gain.value = 0.2;
    chordBus.connect(musicBus);

    // Dotted-eighth echo at 118 BPM, just on the lead.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / 118) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.2;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    leadBus.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(wet).connect(musicBus);

    this.master = master;
    this.musicBus = musicBus;
    this.leadBus = leadBus;
    this.bassBus = bassBus;
    this.drumBus = drumBus;
    this.chordBus = chordBus;

    const noise = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * 2),
      ctx.sampleRate,
    );
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noise = noise;
  }

  playLead(
    frequency: number,
    at: number,
    duration: number,
    velocity = 1,
  ): void {
    const end = at + duration;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.36 * velocity, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.22 * velocity, at + 0.08);
    gain.gain.setValueAtTime(
      0.22 * velocity,
      Math.max(at + 0.09, end - 0.01),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 110;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1;
    filter.frequency.setValueAtTime(7000, at);
    filter.frequency.exponentialRampToValueAtTime(
      4500,
      at + Math.max(0.08, duration),
    );
    const presence = this.ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2600;
    presence.Q.value = 1;
    presence.gain.value = 3;

    // Lift the upper harmonics, where a synth lead actually cuts through.
    const bite = this.ctx.createBiquadFilter();
    bite.type = "highshelf";
    bite.frequency.value = 1600;
    bite.gain.value = 7;

    const saw = this.ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = frequency;
    const saw2 = this.ctx.createOscillator();
    saw2.type = "sawtooth";
    saw2.frequency.value = frequency * 1.004;
    const square = this.ctx.createOscillator();
    square.type = "square";
    square.frequency.value = frequency * 2;
    const octaveSaw = this.ctx.createOscillator();
    octaveSaw.type = "sawtooth";
    octaveSaw.frequency.value = frequency * 2;
    const air = this.ctx.createOscillator();
    air.type = "square";
    air.frequency.value = frequency * 4;

    const sawGain = this.ctx.createGain();
    sawGain.gain.value = 0.55;
    const saw2Gain = this.ctx.createGain();
    saw2Gain.gain.value = 0.45;
    const squareGain = this.ctx.createGain();
    squareGain.gain.value = 0.3;
    const octaveGain = this.ctx.createGain();
    octaveGain.gain.value = 0.2;
    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.1;

    saw.connect(sawGain).connect(highpass);
    saw2.connect(saw2Gain).connect(highpass);
    square.connect(squareGain).connect(highpass);
    octaveSaw.connect(octaveGain).connect(highpass);
    air.connect(airGain).connect(highpass);

    const leadAir = this.ctx.createBiquadFilter();
    leadAir.type = "highshelf";
    leadAir.frequency.value = 4000;
    leadAir.gain.value = 3;
    highpass
      .connect(filter)
      .connect(presence)
      .connect(bite)
      .connect(leadAir)
      .connect(gain)
      .connect(this.leadBus);

    saw.start(at);
    saw2.start(at);
    square.start(at);
    octaveSaw.start(at);
    air.start(at);
    saw.stop(end + 0.1);
    saw2.stop(end + 0.1);
    square.stop(end + 0.1);
    octaveSaw.stop(end + 0.1);
    air.stop(end + 0.1);
    this.sources.push(saw, saw2, square, octaveSaw, air);
  }

  playBass(midi: number, at: number, duration: number, velocity = 1): void {
    const frequency = midiToHz(midi);
    const end = at + duration;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3 * velocity, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.14 * velocity, at + 0.13);
    gain.gain.setValueAtTime(
      0.14 * velocity,
      Math.max(at + 0.14, end - 0.01),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(2000, at);
    filter.frequency.exponentialRampToValueAtTime(240, at + 0.14);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = makeSoftClipCurve(1.5);
    shaper.oversample = "2x";

    const saw = this.ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = frequency;
    const square = this.ctx.createOscillator();
    square.type = "square";
    square.frequency.value = frequency;
    const squareGain = this.ctx.createGain();
    squareGain.gain.value = 0.35;

    saw.connect(filter);
    square.connect(squareGain).connect(filter);
    filter.connect(shaper).connect(gain).connect(this.bassBus);

    saw.start(at);
    square.start(at);
    saw.stop(end + 0.08);
    square.stop(end + 0.08);
    this.sources.push(saw, square);
  }

  playChord(
    midis: readonly number[],
    at: number,
    duration: number,
    velocity = 0.5,
  ): void {
    const end = at + duration;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.05 * velocity, at + 0.06);
    gain.gain.setValueAtTime(
      0.05 * velocity,
      Math.max(at + 0.07, end - 0.01),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.35);
    filter.connect(gain).connect(this.chordBus);

    for (const midi of midis) {
      const frequency = midiToHz(midi);
      for (const detune of [-6, 6]) {
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = frequency;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(at);
        osc.stop(end + 0.4);
        this.sources.push(osc);
      }
    }
  }

  playPiano(
    midis: readonly number[],
    at: number,
    duration: number,
    velocity = 0.7,
  ): void {
    const end = at + duration;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12 * velocity, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.03 * velocity, at + 0.35);
    gain.gain.setValueAtTime(
      0.03 * velocity,
      Math.max(at + 0.36, end - 0.01),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.22);
    filter.connect(gain).connect(this.chordBus);

    for (const midi of midis) {
      const frequency = midiToHz(midi);
      const body = this.ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = frequency;
      const shine = this.ctx.createOscillator();
      shine.type = "sine";
      shine.frequency.value = frequency * 2;
      const shineGain = this.ctx.createGain();
      shineGain.gain.value = 0.18;
      body.connect(filter);
      shine.connect(shineGain).connect(filter);
      body.start(at);
      shine.start(at);
      body.stop(end + 0.25);
      shine.stop(end + 0.25);
      this.sources.push(body, shine);
    }
  }

  kick(at: number, velocity = 1): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(46, at + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.68 * velocity, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
    osc.connect(gain).connect(this.drumBus);
    osc.start(at);
    osc.stop(at + 0.34);
    this.sources.push(osc);

    const click = this.noiseSource();
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 1200;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.25 * velocity, at);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
    click.connect(highpass).connect(clickGain).connect(this.drumBus);
    click.start(at);
    click.stop(at + 0.03);
    this.sources.push(click);
  }

  tom(at: number, frequency: number, velocity = 0.8): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency * 1.35, at);
    osc.frequency.exponentialRampToValueAtTime(frequency, at + 0.08);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.45 * velocity, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(gain).connect(this.drumBus);
    osc.start(at);
    osc.stop(at + 0.3);
    this.sources.push(osc);
  }

  snare(at: number, velocity = 1): void {
    const noise = this.noiseSource();
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 2200;
    bandpass.Q.value = 0.55;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75 * velocity, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    noise.connect(bandpass).connect(noiseGain).connect(this.drumBus);
    noise.start(at);
    noise.stop(at + 0.21);
    this.sources.push(noise);

    const body = this.ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = 185;
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.2 * velocity, at);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    body.connect(bodyGain).connect(this.drumBus);
    body.start(at);
    body.stop(at + 0.13);
    this.sources.push(body);

    for (const offset of [0, 0.012, 0.024]) {
      const clap = this.noiseSource();
      const highpass = this.ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 900;
      const clapGain = this.ctx.createGain();
      clapGain.gain.setValueAtTime(0.22 * velocity, at + offset);
      clapGain.gain.exponentialRampToValueAtTime(
        0.0001,
        at + offset + 0.05,
      );
      clap.connect(highpass).connect(clapGain).connect(this.drumBus);
      clap.start(at + offset);
      clap.stop(at + offset + 0.06);
      this.sources.push(clap);
    }
  }

  hat(at: number, velocity = 0.7, open = false): void {
    const noise = this.noiseSource();
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 6800;
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 9000;
    bandpass.Q.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24 * velocity, at);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      at + (open ? 0.2 : 0.045),
    );
    noise.connect(highpass).connect(bandpass).connect(gain).connect(this.drumBus);
    noise.start(at);
    noise.stop(at + (open ? 0.22 : 0.06));
    this.sources.push(noise);
  }

  crash(at: number, velocity = 0.8): void {
    const noise = this.noiseSource();
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 4500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28 * velocity, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
    noise.connect(highpass).connect(gain).connect(this.drumBus);
    noise.start(at);
    noise.stop(at + 1.35);
    this.sources.push(noise);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.025);

    for (const source of this.sources) {
      try {
        source.stop(now + 0.06);
      } catch {
        /* Already stopped. */
      }
    }

    window.setTimeout(() => {
      try {
        this.master.disconnect();
        this.musicBus.disconnect();
      } catch {
        /* The graph is already gone. */
      }
    }, 250);
  }

  private noiseSource(): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    return source;
  }
}
