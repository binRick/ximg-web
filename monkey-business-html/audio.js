// Procedural monkey chorus via the Web Audio API. No external assets — every
// sound is synthesized on the fly. Each "hoot" is a short rising-then-falling
// pitch glide pushed through a bandpass filter and an amplitude envelope, so
// it reads as vocal rather than synthy. A "swarm" call schedules dozens of
// hoots over a window with random pitch + timing offsets.
//
// Browsers block AudioContext until a user gesture; the first .swarm() that
// happens after a click resumes the suspended context and the chorus kicks in
// from then on. Earlier auto-rounds are silent (a feature: visitors landing
// on the page don't get blasted before they ask for it).

const STORAGE_KEY = 'mb-sound';

class MonkeyChorus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = (() => {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === '0';   // default: enabled. localStorage '0' = muted.
    })();
  }

  ensureCtx() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.22;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = !!muted;
    localStorage.setItem(STORAGE_KEY, this.muted ? '0' : '1');
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.22, t + 0.08);
    }
  }

  isMuted() { return this.muted; }

  // One monkey hoot — short pitch glide with vocal-ish formant.
  hoot(when, baseFreq, gain = 0.5) {
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    // Pitch contour: fast rise, slower fall — the "hoo-OOH-uh" shape
    osc.frequency.setValueAtTime(baseFreq, when);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.55, when + 0.05);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, when + 0.26);

    // Slight FM wobble for vocal warble
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18 + Math.random() * 10;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = baseFreq * 0.04;
    lfo.connect(lfoGain).connect(osc.frequency);

    // Bandpass to imitate vocal-tract formant
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(baseFreq * 1.4, when);
    filt.frequency.linearRampToValueAtTime(baseFreq * 0.9, when + 0.25);
    filt.Q.value = 4.5;

    // ADSR
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0008, when + 0.30);

    osc.connect(filt).connect(env).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.32);
    lfo.start(when);
    lfo.stop(when + 0.32);
  }

  // Dart impact thunk — short percussive click. Noise burst through a
  // lowpass that drops fast; pitched a hair so a wave of them sounds rhythmic
  // rather than mushy. Layered with a low-frequency body sine for thump.
  thunk(when, pitch = 1) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const ctx = this.ctx;

    // === Noise crack (the sharp transient) ===
    const len = Math.floor(ctx.sampleRate * 0.10);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch  = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200 * pitch, when);
    filt.frequency.exponentialRampToValueAtTime(180, when + 0.09);
    filt.Q.value = 8;

    const env = ctx.createGain();
    env.gain.setValueAtTime(1.05, when);              // was 0.42 — much louder peak
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.11);

    src.connect(filt).connect(env).connect(this.master);
    src.start(when);
    src.stop(when + 0.12);

    // === Sub-thump (gives the impact body) ===
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(180 * pitch, when);
    sub.frequency.exponentialRampToValueAtTime(60, when + 0.08);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0.55, when);
    subEnv.gain.exponentialRampToValueAtTime(0.001, when + 0.10);
    sub.connect(subEnv).connect(this.master);
    sub.start(when);
    sub.stop(when + 0.11);
  }

  // Convenience for "now"
  thunkNow(pitch = 1) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    this.thunk(this.ctx.currentTime, pitch);
  }

  // Swarm: schedule N hoots over `durationMs`, with tight clustering near the
  // start (matches the dart-throw cascade ramp).
  swarm({ durationMs = 2400, count = 70, intensity = 1 } = {}) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      // Bias toward the front of the window so it matches the dart wave
      const u = Math.pow(Math.random(), 1.4);
      const when = now + u * (durationMs / 1000);

      // Three tiers — small juveniles (high), adults (mid), big males (low)
      const tier = Math.random();
      let baseFreq;
      if (tier < 0.45) baseFreq = 480 + Math.random() * 380;  // high yips
      else if (tier < 0.85) baseFreq = 240 + Math.random() * 220; // mid hoots
      else baseFreq = 110 + Math.random() * 90;                   // deep barks

      const gain = (0.18 + Math.random() * 0.32) * intensity;
      this.hoot(when, baseFreq, gain);
    }
  }
}

export const chorus = new MonkeyChorus();
