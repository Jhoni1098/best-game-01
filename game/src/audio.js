// Voidgarden — all sound, synthesized live with WebAudio.
// One job: bleeps, thuds and chimes with no audio files. Every effect is a
// short oscillator or filtered-noise burst; the context is created lazily on
// the first user gesture (browsers block audio before one) and every call is
// a no-op until then, so the headless screenshot scenes stay silent.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._pad = null;
  }

  // Call from a user gesture (click / keydown). Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.42;
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot() { this._tone(720, 0.09, 'square', 0.10, 340); }
  bloomShoot() { this._tone(980, 0.07, 'triangle', 0.07, 520); }
  hit() { this._noise(0.06, 0.12, 2400); }
  die() { this._tone(220, 0.22, 'sawtooth', 0.14, 55); this._noise(0.18, 0.10, 900); }
  pickup() { this._tone(880, 0.09, 'sine', 0.12, 1320); }
  plant() { this._tone(300, 0.16, 'sine', 0.16, 620); this._tone(620, 0.12, 'sine', 0.08, 930); }
  hurt() { this._tone(160, 0.2, 'sawtooth', 0.18, 70); }
  heartHit() { this._tone(110, 0.3, 'sawtooth', 0.2, 45); }
  waveHorn() {
    this._tone(196, 0.5, 'triangle', 0.16, 196);
    this._tone(294, 0.5, 'triangle', 0.12, 294);
  }
  bossRoar() { this._tone(90, 0.7, 'sawtooth', 0.22, 40); this._noise(0.5, 0.12, 500); }
  upgrade() { this._tone(523, 0.12, 'sine', 0.14); this._tone(784, 0.18, 'sine', 0.12); }
  click() { this._tone(660, 0.05, 'sine', 0.10); }
  over() {
    this._tone(392, 0.35, 'triangle', 0.16, 370);
    this._tone(311, 0.5, 'triangle', 0.16, 294);
    this._tone(233, 0.9, 'triangle', 0.16, 220);
  }
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.3, 'triangle', 0.15), i * 130);
    });
  }

  // A soft two-note pad under the title screen; stops when play starts.
  startPad() {
    if (!this.ctx || this.muted || this._pad) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(this.master);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 110;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 164.8;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    this._pad = { gain, o1, o2 };
  }

  stopPad() {
    if (!this._pad) return;
    try {
      this._pad.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      const pad = this._pad;
      setTimeout(() => { try { pad.o1.stop(); pad.o2.stop(); } catch { /* already stopped */ } }, 800);
    } catch { /* no audio */ }
    this._pad = null;
  }
}
