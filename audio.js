/**
 * Congklak Audio Effects using Web Audio API
 * Realistic synthesized sounds for wooden board, clacking cowrie shells, captures, and victory fanfare.
 */

class CongklakAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Pre-generate noise buffer once to save CPU/battery on every shell drop
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
        this.cachedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.cachedNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.008));
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  // Clack sound when a shell is dropped into a wooden pit
  playShellDrop(pitchMod = 1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.cachedNoiseBuffer) return;

    const t = this.ctx.currentTime;
    
    // Reuse pre-cached noise buffer instead of generating arrays on every drop
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.cachedNoiseBuffer;

    // Filter to sound like resonant wood/stone
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 * pitchMod, t);
    filter.Q.setValueAtTime(4, t);

    // Tone for wood hollow resonance
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const baseFreq = (380 + Math.random() * 80) * pitchMod;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, t + 0.05);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Multiple quick rattle sounds when scooping shells
  playScoop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.playShellDrop(0.9 + Math.random() * 0.4);
      }, i * 35);
    }
  }

  // Capture / "Tembak" rewarding sound
  playCapture() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.07);

      gain.gain.setValueAtTime(0.25, t + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + idx * 0.07);
      osc.stop(t + idx * 0.07 + 0.25);
    });
  }

  // Turn bonus sound (when landing in own house)
  playBonus() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.18);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  // Coin toss whoosh / flip
  playCoinFlip() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + i * 150, t + i * 0.08);

      gain.gain.setValueAtTime(0.15, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.07);
    }
  }

  // End game victory fanfare
  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const chords = [
      { notes: [440, 554.37, 659.25], start: 0, dur: 0.2 },
      { notes: [493.88, 622.25, 739.99], start: 0.22, dur: 0.2 },
      { notes: [554.37, 659.25, 880], start: 0.44, dur: 0.6 }
    ];

    chords.forEach(c => {
      c.notes.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t + c.start);

        gain.gain.setValueAtTime(0.2, t + c.start);
        gain.gain.exponentialRampToValueAtTime(0.001, t + c.start + c.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t + c.start);
        osc.stop(t + c.start + c.dur);
      });
    });
  }
}

window.soundFx = new CongklakAudio();
