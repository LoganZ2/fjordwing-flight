// FJORDWING — Zero-asset procedural Web Audio synthesizer (turbine, afterburner, wind, stall warble, chimes).

import { clamp } from './math.js';

export class FlightAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.lastStallBeep = 0;
  }

  unlock() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.34;
      this.master.connect(ctx.destination);

      // Shared white-noise buffer for aerodynamic airflow & afterburner roar
      const sampleRate = ctx.sampleRate;
      const noiseBuf = ctx.createBuffer(1, sampleRate * 2, sampleRate);
      const data = noiseBuf.getChannelData(0);
      let s = 1234567;
      for (let i = 0; i < data.length; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 1073741823.5) - 1.0;
      }

      // 1. Jet turbine core (dual sawtooth/triangle through warm bandpass)
      this.turbineOsc = ctx.createOscillator();
      this.turbineOsc.type = 'sawtooth';
      this.turbineOsc.frequency.value = 115;

      this.whineOsc = ctx.createOscillator();
      this.whineOsc.type = 'triangle';
      this.whineOsc.frequency.value = 345;

      this.turbineFilter = ctx.createBiquadFilter();
      this.turbineFilter.type = 'lowpass';
      this.turbineFilter.frequency.value = 520;

      this.turbineGain = ctx.createGain();
      this.turbineGain.gain.value = 0.0;

      this.turbineOsc.connect(this.turbineFilter);
      this.whineOsc.connect(this.turbineFilter);
      this.turbineFilter.connect(this.turbineGain);
      this.turbineGain.connect(this.master);
      this.turbineOsc.start();
      this.whineOsc.start();

      // 2. Aerodynamic airflow & jet exhaust noise
      this.windSrc = ctx.createBufferSource();
      this.windSrc.buffer = noiseBuf;
      this.windSrc.loop = true;

      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 0.85;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.0;

      this.windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windSrc.start();

      // 3. Afterburner sub-bass roar
      this.abSrc = ctx.createBufferSource();
      this.abSrc.buffer = noiseBuf;
      this.abSrc.loop = true;

      this.abFilter = ctx.createBiquadFilter();
      this.abFilter.type = 'lowpass';
      this.abFilter.frequency.value = 190;

      this.abGain = ctx.createGain();
      this.abGain.gain.value = 0.0;

      this.abSrc.connect(this.abFilter);
      this.abFilter.connect(this.abGain);
      this.abGain.connect(this.master);
      this.abSrc.start();

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.34, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  update(world) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const craft = world.aircraft;

    if (world.phase !== 'flying' || world.paused || craft.crashed) {
      this.turbineGain.gain.setTargetAtTime(0, now, 0.12);
      this.windGain.gain.setTargetAtTime(0, now, 0.12);
      this.abGain.gain.setTargetAtTime(0, now, 0.12);
      return;
    }

    const thrust = craft.fuel > 0 ? craft.throttle : 0;
    const speedNorm = clamp(craft.speed / 190, 0, 1.3);

    this.turbineOsc.frequency.setTargetAtTime(82 + thrust * 95 + speedNorm * 28, now, 0.08);
    this.whineOsc.frequency.setTargetAtTime(260 + thrust * 420, now, 0.08);
    this.turbineFilter.frequency.setTargetAtTime(360 + thrust * 680, now, 0.08);
    this.turbineGain.gain.setTargetAtTime(craft.fuel > 0 ? (0.08 + thrust * 0.14) : 0.0, now, 0.08);

    this.windFilter.frequency.setTargetAtTime(240 + speedNorm * 1150, now, 0.1);
    this.windGain.gain.setTargetAtTime(0.03 + speedNorm * 0.18, now, 0.1);

    this.abGain.gain.setTargetAtTime(craft.afterburner ? 0.28 : 0.0, now, 0.07);

    // Stall warning triple-tone warble
    if (craft.stall && now - this.lastStallBeep > 0.34) {
      this.lastStallBeep = now;
      this.playTone(760, 0.11, 'square', 0.14);
    }
  }

  playTone(freq, duration, type = 'sine', volume = 0.18) {
    if (!this.ready || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playRingChime(isFuel = false) {
    if (!this.ready || !this.ctx || this.muted) return;
    const notes = isFuel ? [587, 880, 1175] : [659, 988];
    notes.forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 0.18, 'triangle', 0.22), idx * 65);
    });
  }

  playTouchdown() {
    this.playTone(140, 0.16, 'triangle', 0.24);
    setTimeout(() => this.playTone(440, 0.22, 'sine', 0.16), 90);
  }

  playCrash() {
    this.playTone(85, 0.45, 'sawtooth', 0.32);
    this.playTone(52, 0.55, 'triangle', 0.30);
  }
}
