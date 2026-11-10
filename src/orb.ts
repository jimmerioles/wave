/**
 * The instrument's face: a sunset orb, a live waveform ring, spectrum ticks,
 * drifting motes and note-on particles. Canvas 2D only.
 *
 * The analysis is deliberately physical: bass pushes the radius, treble lights
 * the rim, RMS drives the meter, and pointer position moves the highlight and
 * the orb itself on soft springs.
 */

import type { PresetKey, SynthEngine } from "./audio";

type RGB = readonly [number, number, number];

interface Palette {
  core: readonly [string, string, string, string, string];
  accent: RGB;
  secondary: RGB;
}

const PALETTES: Record<PresetKey, Palette> = {
  bloom: {
    core: ["#ffe9b8", "#ffb271", "#ff6a5c", "#c42f68", "#2a1036"],
    accent: [255, 124, 96],
    secondary: [255, 197, 122],
  },
  glass: {
    core: ["#eafff8", "#9af0dc", "#59d8ef", "#8a7cf4", "#171534"],
    accent: [105, 243, 211],
    secondary: [150, 224, 255],
  },
  tape: {
    core: ["#ffe6b8", "#e9b06a", "#d47752", "#8d4353", "#241422"],
    accent: [255, 181, 112],
    secondary: [255, 137, 112],
  },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: RGB;
  drag: number;
}

interface Ripple {
  life: number;
  maxLife: number;
  radius: number;
  color: RGB;
  width: number;
}

interface Mote {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  color: RGB;
}

const TAU = Math.PI * 2;
const MAX_PARTICLES = 150;

function rgba(color: RGB, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function springStep(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): [number, number] {
  const acceleration = (target - value) * stiffness - velocity * damping;
  const nextVelocity = velocity + acceleration * dt;
  return [value + nextVelocity * dt, nextVelocity];
}

export class OrbScene {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private engine: SynthEngine;
  private onLevel: (level: number, rms: number) => void;

  private width = 0;
  private height = 0;
  private dpr = 1;

  private palette: Palette = PALETTES.bloom;

  private timeData = new Uint8Array(2048);
  private freqData = new Uint8Array(1024);
  private waveform = new Float32Array(128);
  private ticks = new Float32Array(88);

  private targetLevel = 0;
  private targetBass = 0;
  private targetTreble = 0;
  private rms = 0;

  private level = 0;
  private levelVelocity = 0;
  private bass = 0;
  private bassVelocity = 0;
  private treble = 0;
  private trebleVelocity = 0;
  private pulse = 0;

  private pointerX = 0;
  private pointerY = 0;
  private pointerVelocityX = 0;
  private pointerVelocityY = 0;
  private pointerTargetX = 0;
  private pointerTargetY = 0;

  private orbX = 0;
  private orbY = 0;
  private orbRadius = 100;

  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private motes: Mote[] = [];

  private running = false;
  private inView = true;
  private pageVisible = !document.hidden;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  private raf = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private lastMeterAt = 0;
  private reducedTimer: number | null = null;

  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private motionQuery: MediaQueryList;

  constructor(
    canvas: HTMLCanvasElement,
    engine: SynthEngine,
    onLevel: (level: number, rms: number) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available");

    this.canvas = canvas;
    this.context = context;
    this.engine = engine;
    this.onLevel = onLevel;

    this.resizeObserver = new ResizeObserver(() => {
      this.measure();
      if (!this.running) this.drawFrame(0, false);
    });
    this.resizeObserver.observe(canvas);

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting);
        this.sync();
      },
      { threshold: 0.05 },
    );
    this.intersectionObserver.observe(canvas);

    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.motionQuery.addEventListener("change", this.handleMotionChange);

    document.addEventListener("visibilitychange", this.handleVisibility);

    this.measure();
    this.sync();
  }

  setPreset(key: PresetKey): void {
    this.palette = PALETTES[key];
    if (!this.running) this.drawFrame(0, false);
  }

  setPointer(normalizedX: number, normalizedY: number): void {
    this.pointerTargetX = clamp(normalizedX, -1, 1);
    this.pointerTargetY = clamp(normalizedY, -1, 1);
  }

  /** Called on note-on: a burst of particles and a pulse of the orb. */
  burst(noteIndex: number): void {
    if (this.reduced) return;

    this.pulse = Math.min(1.15, this.pulse + 0.85);

    const angle = -Math.PI / 2 + (noteIndex - 3.5) * 0.42;
    const ox = this.orbX + Math.cos(angle) * this.orbRadius * 0.92;
    const oy = this.orbY + Math.sin(angle) * this.orbRadius * 0.92;
    const count = 26;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const spread = angle + (Math.random() - 0.5) * 1.4;
      const speed = 38 + Math.random() * 135;
      const color =
        i % 5 === 0 ? this.palette.secondary : this.palette.accent;
      this.particles.push({
        x: ox + (Math.random() - 0.5) * 12,
        y: oy + (Math.random() - 0.5) * 12,
        vx: Math.cos(spread) * speed + (Math.random() - 0.5) * 36,
        vy: Math.sin(spread) * speed - 20,
        size: 0.8 + Math.random() * 2.2,
        life: 0.7 + Math.random() * 0.9,
        maxLife: 1.6,
        color,
        drag: 0.94 + Math.random() * 0.03,
      });
    }

    this.ripples.push({
      life: 1,
      maxLife: 1,
      radius: this.orbRadius * 0.98,
      color: this.palette.secondary,
      width: 1.4,
    });
    if (this.ripples.length > 4) this.ripples.shift();
  }

  private handleMotionChange = (event: MediaQueryListEvent): void => {
    this.reduced = event.matches;
    this.sync();
  };

  private handleVisibility = (): void => {
    this.pageVisible = !document.hidden;
    this.sync();
  };

  private sync(): void {
    const shouldRun = this.inView && this.pageVisible && !this.reduced;

    if (shouldRun && !this.running) {
      this.running = true;
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!shouldRun && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.drawFrame(0, false);
    } else if (!shouldRun) {
      this.drawFrame(0, false);
    }

    const meterRunning = this.reduced && this.inView && this.pageVisible;
    if (meterRunning && this.reducedTimer === null) {
      this.reducedTimer = window.setInterval(() => {
        this.readAudio();
        this.publishMeter();
      }, 150);
    } else if (!meterRunning && this.reducedTimer !== null) {
      clearInterval(this.reducedTimer);
      this.reducedTimer = null;
    }

    if (!shouldRun) this.publishMeter();
  }

  private frame = (now: number): void => {
    if (!this.running) return;

    const dt = clamp((now - this.lastFrame) / 1000, 0.001, 0.05);
    this.lastFrame = now;
    this.elapsed += dt;

    this.readAudio();

    [this.level, this.levelVelocity] = springStep(
      this.level,
      this.levelVelocity,
      this.targetLevel,
      150,
      22,
      dt,
    );
    [this.bass, this.bassVelocity] = springStep(
      this.bass,
      this.bassVelocity,
      this.targetBass,
      110,
      19,
      dt,
    );
    [this.treble, this.trebleVelocity] = springStep(
      this.treble,
      this.trebleVelocity,
      this.targetTreble,
      180,
      24,
      dt,
    );
    [this.pointerX, this.pointerVelocityX] = springStep(
      this.pointerX,
      this.pointerVelocityX,
      this.pointerTargetX,
      48,
      15,
      dt,
    );
    [this.pointerY, this.pointerVelocityY] = springStep(
      this.pointerY,
      this.pointerVelocityY,
      this.pointerTargetY,
      48,
      15,
      dt,
    );

    this.pulse *= Math.exp(-dt * 2.6);
    this.level = clamp(this.level, 0, 1.4);
    this.bass = clamp(this.bass, 0, 1.4);
    this.treble = clamp(this.treble, 0, 1.4);

    this.updateParticles(dt);
    this.updateRipples(dt);
    this.updateMotes(dt);
    this.drawFrame(this.elapsed, true);
    this.publishMeter();

    this.raf = requestAnimationFrame(this.frame);
  };

  private readAudio(): void {
    const analyser = this.engine.analyser;
    if (!analyser) {
      this.targetLevel = 0;
      this.targetBass = 0;
      this.targetTreble = 0;
      this.rms = 0;
      return;
    }

    const fftSize = analyser.fftSize;
    if (this.timeData.length !== fftSize) {
      this.timeData = new Uint8Array(fftSize);
    }
    if (this.freqData.length !== analyser.frequencyBinCount) {
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
    }

    analyser.getByteTimeDomainData(this.timeData);
    analyser.getByteFrequencyData(this.freqData);

    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const value = (this.timeData[i] - 128) / 128;
      sum += value * value;
    }
    this.rms = Math.sqrt(sum / this.timeData.length);

    const bins = this.freqData.length;
    const binHz = analyser.context.sampleRate / fftSize;
    const bassEnd = Math.min(bins - 1, Math.max(2, Math.floor(260 / binHz)));
    const trebleStart = Math.min(bins - 1, Math.floor(1800 / binHz));
    const trebleEnd = Math.min(bins - 1, Math.floor(7200 / binHz));

    let bassSum = 0;
    for (let i = 1; i <= bassEnd; i++) bassSum += this.freqData[i];
    const bassAverage = bassSum / bassEnd;

    let trebleSum = 0;
    let trebleCount = 0;
    for (let i = trebleStart; i <= trebleEnd; i++) {
      trebleSum += this.freqData[i];
      trebleCount++;
    }
    const trebleAverage = trebleCount > 0 ? trebleSum / trebleCount : 0;

    this.targetLevel = clamp(this.rms * 3.1, 0, 1);
    this.targetBass = clamp((bassAverage / 255) * 1.6, 0, 1);
    this.targetTreble = clamp((trebleAverage / 255) * 1.9, 0, 1);
  }

  private publishMeter(): void {
    const now = performance.now();
    if (now - this.lastMeterAt < 65) return;
    this.lastMeterAt = now;

    const displayLevel = clamp(
      this.level * 0.85 + this.bass * 0.2 + this.pulse * 0.05,
      0,
      1,
    );
    this.onLevel(displayLevel, this.rms);
  }

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.motes.length === 0) {
      this.seedMotes();
    } else {
      for (const mote of this.motes) {
        mote.x = clamp(mote.x, 0, this.width);
        mote.y = clamp(mote.y, 0, this.height);
      }
    }

    this.drawFrame(this.elapsed, false);
  }

  private seedMotes(): void {
    this.motes = [];
    for (let i = 0; i < 22; i++) {
      this.motes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 1.4,
        speed: 2 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 5,
        phase: Math.random() * TAU,
        color:
          i % 6 === 0
            ? this.palette.secondary
            : i % 4 === 0
              ? this.palette.accent
              : [220, 226, 245],
      });
    }
  }

  private updateMotes(dt: number): void {
    for (const mote of this.motes) {
      mote.y -= mote.speed * dt;
      mote.x += Math.sin(this.elapsed * 0.35 + mote.phase) * mote.drift * dt;
      if (mote.y < -6) {
        mote.y = this.height + 6;
        mote.x = Math.random() * this.width;
      }
      if (mote.x < -6) mote.x = this.width + 6;
      if (mote.x > this.width + 6) mote.x = -6;
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.vy *= Math.pow(particle.drag, dt * 60);
      particle.vy += 6 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  private updateRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];
      ripple.life -= dt * 0.9;
      if (ripple.life <= 0) this.ripples.splice(i, 1);
    }
  }

  private drawFrame(time: number, animated: boolean): void {
    const ctx = this.context;
    const { width, height, palette } = this;
    if (width < 1 || height < 1) return;

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const centerX = width / 2 + this.pointerX * (animated ? 9 : 0);
    const centerY = height / 2 + this.pointerY * (animated ? 7 : 0);
    const breathing = animated ? Math.sin(time * 0.72) * 0.007 : 0;
    const radius =
      Math.min(width, height) *
      0.315 *
      (1 +
        breathing +
        this.bass * 0.07 +
        this.level * 0.028 +
        this.pulse * 0.022);

    this.orbX = centerX;
    this.orbY = centerY;
    this.orbRadius = radius;

    this.drawHalo(centerX, centerY, radius, animated);
    this.drawMotes();
    this.drawOrbit(centerX, centerY, radius, time, animated);
    this.drawBody(centerX, centerY, radius, time, animated);
    this.drawWaveRing(centerX, centerY, radius, time, animated);
    this.drawRipples(centerX, centerY, radius);
    this.drawParticles();
  }

  private drawHalo(
    centerX: number,
    centerY: number,
    radius: number,
    animated: boolean,
  ): void {
    const ctx = this.context;
    const { palette } = this;

    const glow = ctx.createRadialGradient(
      centerX,
      centerY,
      radius * 0.25,
      centerX,
      centerY,
      radius * 2.15,
    );
    glow.addColorStop(0, rgba(palette.accent, 0.17 + this.level * 0.07));
    glow.addColorStop(0.38, rgba(palette.accent, 0.07 + this.level * 0.035));
    glow.addColorStop(0.7, rgba(palette.secondary, 0.025));
    glow.addColorStop(1, rgba(palette.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    if (!animated) return;

    const low = ctx.createRadialGradient(
      centerX,
      centerY + radius * 1.15,
      radius * 0.05,
      centerX,
      centerY + radius * 1.15,
      radius * 2.1,
    );
    low.addColorStop(0, rgba(palette.accent, 0.065 + this.level * 0.045));
    low.addColorStop(0.52, rgba(palette.secondary, 0.022));
    low.addColorStop(1, rgba(palette.accent, 0));
    ctx.fillStyle = low;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawMotes(): void {
    const ctx = this.context;
    for (const mote of this.motes) {
      const twinkle =
        0.15 + 0.3 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.7 + mote.phase));
      ctx.beginPath();
      ctx.fillStyle = rgba(mote.color as RGB, twinkle * 0.55);
      ctx.arc(mote.x, mote.y, mote.size, 0, TAU);
      ctx.fill();
    }
  }

  private drawOrbit(
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    animated: boolean,
  ): void {
    const ctx = this.context;
    const { palette, freqData } = this;
    const tickRadius = radius * 1.24;
    const rotation = animated ? time * 0.055 : 0.12;
    const bins = freqData.length;
    const metric = animated && this.engine.analyser ? 1 : 0;

    ctx.save();
    ctx.translate(centerX, centerY);

    // Circular spectrum. Low frequencies get the most physical room.
    for (let i = 0; i < this.ticks.length; i++) {
      const percentile = i / this.ticks.length;
      const bin = Math.min(
        bins - 1,
        Math.floor(Math.pow(percentile, 1.45) * bins * 0.72),
      );
      const measured = metric ? freqData[bin] / 255 : 0;
      const idle =
        0.035 + 0.025 * Math.sin(time * 0.55 + percentile * TAU * 2.0);
      const target = animated ? measured + idle : 0.02;
      this.ticks[i] += (target - this.ticks[i]) * (animated ? 0.16 : 1);

      const angle = percentile * TAU + rotation;
      const length = 1.6 + this.ticks[i] * radius * 0.34 + this.level * 2.2;
      const inner = tickRadius;
      const outer = tickRadius + length;
      const emphasize = i % 11 === 0;

      ctx.beginPath();
      ctx.strokeStyle = emphasize
        ? rgba(palette.secondary, 0.38 + this.ticks[i] * 0.45)
        : `rgba(230, 236, 252, ${0.055 + this.ticks[i] * 0.34})`;
      ctx.lineWidth = emphasize ? 1.5 : 1;
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }

    // Two slow arcs, like tonearm markings.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(palette.accent, 0.26 + this.level * 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.4, -0.4 + rotation * 2.1, 0.55 + rotation * 2.1);
    ctx.stroke();

    ctx.strokeStyle = rgba(palette.secondary, 0.2 + this.treble * 0.2);
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius * 1.4,
      Math.PI + 0.3 - rotation * 1.5,
      Math.PI + 1.1 - rotation * 1.5,
    );
    ctx.stroke();

    ctx.setLineDash([1, 9]);
    ctx.lineDashOffset = -time * 7;
    ctx.strokeStyle = "rgba(230, 236, 252, 0.14)";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.52, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  private drawBody(
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    animated: boolean,
  ): void {
    const ctx = this.context;
    const { palette } = this;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.clip();

    const core = ctx.createRadialGradient(
      centerX - radius * 0.34,
      centerY - radius * 0.42,
      radius * 0.04,
      centerX + radius * 0.1,
      centerY + radius * 0.18,
      radius * 1.14,
    );
    core.addColorStop(0, palette.core[0]);
    core.addColorStop(0.27, palette.core[1]);
    core.addColorStop(0.56, palette.core[2]);
    core.addColorStop(0.8, palette.core[3]);
    core.addColorStop(1, palette.core[4]);
    ctx.fillStyle = core;
    ctx.fillRect(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
    );

    // Horizontal solar bands, warped by the low end.
    const bands = 23;
    for (let j = 0; j < bands; j++) {
      const y = centerY - radius + ((j + 0.5) / bands) * radius * 2;
      const drift = Math.sin(time * 0.34 + j * 0.6) * radius * 0.035;
      const warp = this.bass * Math.sin(time * 0.9 + j * 1.2) * radius * 0.05;

      ctx.beginPath();
      for (let x = -radius; x <= radius; x += 6) {
        const wave =
          Math.sin((x / radius) * 2.4 + time * 0.55 + j * 0.52) *
          radius *
          (0.012 + this.level * 0.028);
        const px = centerX + x;
        const py = y + drift + warp + wave;
        if (x === -radius) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle =
        j % 3 === 0
          ? "rgba(255, 240, 218, 0.105)"
          : "rgba(255, 255, 255, 0.045)";
      ctx.lineWidth = j % 5 === 0 ? 1.35 : 0.8;
      ctx.stroke();
    }

    const shade = ctx.createLinearGradient(
      centerX,
      centerY - radius,
      centerX,
      centerY + radius,
    );
    shade.addColorStop(0, "rgba(255, 250, 235, 0.12)");
    shade.addColorStop(0.42, "rgba(255, 255, 255, 0)");
    shade.addColorStop(0.82, "rgba(10, 5, 18, 0.3)");
    shade.addColorStop(1, "rgba(7, 4, 14, 0.66)");
    ctx.fillStyle = shade;
    ctx.fillRect(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
    );

    // A highlight that follows the pointer across the sphere.
    const highlightX =
      centerX +
      (animated ? this.pointerX * radius * 0.52 : -radius * 0.24);
    const highlightY =
      centerY +
      (animated ? this.pointerY * radius * 0.48 : -radius * 0.3);
    const highlight = ctx.createRadialGradient(
      highlightX,
      highlightY,
      0,
      highlightX,
      highlightY,
      radius * 0.72,
    );
    highlight.addColorStop(0, "rgba(255, 250, 236, 0.38)");
    highlight.addColorStop(0.3, "rgba(255, 224, 184, 0.1)");
    highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = highlight;
    ctx.fillRect(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
    );

    // Rim light, warmer at the top-left and cooler where the bass hits.
    const rim = ctx.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
    );
    rim.addColorStop(0, "rgba(255, 250, 235, 0.75)");
    rim.addColorStop(0.35, rgba(palette.secondary, 0.3));
    rim.addColorStop(0.7, rgba(palette.accent, 0.28));
    rim.addColorStop(1, "rgba(255, 255, 255, 0.06)");
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.1 + this.treble * 0.9;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 0.6, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  private drawWaveRing(
    centerX: number,
    centerY: number,
    radius: number,
    time: number,
    animated: boolean,
  ): void {
    const ctx = this.context;
    const { palette, waveform, timeData } = this;
    const analyser = this.engine.analyser;
    const points = waveform.length;
    const smoothing = animated ? 0.32 : 1;

    for (let i = 0; i < points; i++) {
      let target = 0;
      if (animated && analyser) {
        const sample = timeData[Math.floor((i / points) * timeData.length)];
        target = (sample - 128) / 128;
      }
      waveform[i] += (target - waveform[i]) * smoothing;
    }

    const angleOffset = -Math.PI / 2;
    const amplitude = radius * (0.045 + this.level * 0.17 + this.pulse * 0.03);

    ctx.save();
    ctx.translate(centerX, centerY);

    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const index = i % points;
      const angle = (index / points) * TAU + angleOffset;
      const organic =
        Math.sin(angle * 3 + time * 0.6) * 0.018 +
        Math.sin(angle * 7 - time * 0.35) * 0.008;
      const displacement = animated
        ? waveform[index] * (0.5 + this.level * 0.9) + organic
        : Math.sin(angle * 4) * 0.08;
      const r = radius * 1.015 + displacement * amplitude;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const ring = ctx.createLinearGradient(-radius, -radius, radius, radius);
    ring.addColorStop(0, rgba(palette.secondary, 0.92));
    ring.addColorStop(0.45, "rgba(255, 245, 230, 0.72)");
    ring.addColorStop(1, rgba(palette.accent, 0.85));
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = rgba(palette.accent, 0.65);
    ctx.shadowBlur = 14 + this.level * 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // A quieter inner echo of the same signal.
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const index = i % points;
      const angle = (index / points) * TAU + angleOffset;
      const r =
        radius * 0.7 +
        (animated ? waveform[index] : 0) * amplitude * 0.55;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(palette.secondary, 0.2 + this.treble * 0.2);
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.restore();
  }

  private drawRipples(
    centerX: number,
    centerY: number,
    radius: number,
  ): void {
    const ctx = this.context;
    for (const ripple of this.ripples) {
      const progress = 1 - ripple.life;
      ctx.beginPath();
      ctx.strokeStyle = rgba(ripple.color, ripple.life * 0.4);
      ctx.lineWidth = ripple.width * ripple.life;
      ctx.arc(
        centerX,
        centerY,
        radius * 1.03 + progress * radius * 0.9,
        0,
        TAU,
      );
      ctx.stroke();
    }
  }

  private drawParticles(): void {
    const ctx = this.context;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.beginPath();
      ctx.fillStyle = rgba(particle.color, alpha * 0.85);
      ctx.shadowColor = rgba(particle.color, alpha * 0.9);
      ctx.shadowBlur = 10;
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}
