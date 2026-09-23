onload = () => {
  const c = setTimeout(() => {
    document.body.classList.remove("not-loaded");
    clearTimeout(c);
  }, 1000);
};

class AmbientSoundscape {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.droneGain = null;
    this.windGain = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.chimeTimer = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.setupDrone();
      this.setupBreeze();
      this.scheduleChimes();

      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio initialization error:", e);
    }
  }

  setupDrone() {
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    filter.Q.setValueAtTime(2, this.ctx.currentTime);

    // Slow breathing LFO (~14s cycle)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.07, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Warm harmonic frequencies (A2, E3, A3, C#4, E4, B4)
    const baseFreqs = [110.0, 164.81, 220.0, 277.18, 329.63, 493.88];
    baseFreqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      const detune = (i - 2.5) * 3.5;
      osc.detune.setValueAtTime(detune, this.ctx.currentTime);

      const oscGain = this.ctx.createGain();
      const vol = 0.08 / Math.sqrt(i + 1);
      oscGain.gain.setValueAtTime(vol, this.ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start();
    });

    filter.connect(this.droneGain);
    this.droneGain.connect(this.compressor);
  }

  setupBreeze() {
    try {
      const bufferSize = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.1;
        b2 = 0.85 * b2 + white * 0.2;
        data[i] = (b0 + b1 + b2) * 0.12;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(380, this.ctx.currentTime);
      bandpass.Q.setValueAtTime(1.5, this.ctx.currentTime);

      const windLfo = this.ctx.createOscillator();
      windLfo.frequency.setValueAtTime(0.04, this.ctx.currentTime);
      const windLfoGain = this.ctx.createGain();
      windLfoGain.gain.setValueAtTime(100, this.ctx.currentTime);
      windLfo.connect(windLfoGain);
      windLfoGain.connect(bandpass.frequency);
      windLfo.start();

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.035, this.ctx.currentTime);

      noise.connect(bandpass);
      bandpass.connect(this.windGain);
      this.windGain.connect(this.compressor);
      noise.start();
    } catch (e) {}
  }

  playChime(freq = null, volScale = 1.0) {
    if (!this.ctx || !this.isPlaying || this.isMuted) return;

    const notes = [554.37, 659.25, 739.99, 830.61, 987.77, 1108.73, 1318.51];
    const pitch = freq || notes[Math.floor(Math.random() * notes.length)];
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(pitch, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(pitch * 2.76, now);

    const chimeGain = this.ctx.createGain();
    const peakGain = 0.045 * volScale;
    chimeGain.gain.setValueAtTime(0.0001, now);
    chimeGain.gain.exponentialRampToValueAtTime(peakGain, now + 0.02);
    chimeGain.gain.exponentialRampToValueAtTime(0.00001, now + 3.8);

    const chimeGain2 = this.ctx.createGain();
    chimeGain2.gain.setValueAtTime(0.0001, now);
    chimeGain2.gain.exponentialRampToValueAtTime(peakGain * 0.35, now + 0.015);
    chimeGain2.gain.exponentialRampToValueAtTime(0.00001, now + 2.0);

    osc1.connect(chimeGain);
    osc2.connect(chimeGain2);
    chimeGain.connect(this.compressor);
    chimeGain2.connect(this.compressor);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 4.0);
    osc2.stop(now + 2.2);
  }

  scheduleChimes() {
    const triggerNext = () => {
      if (this.isPlaying && !this.isMuted) {
        this.playChime(null, 0.85);
      }
      const nextDelay = 4500 + Math.random() * 4500;
      this.chimeTimer = setTimeout(triggerNext, nextDelay);
    };
    this.chimeTimer = setTimeout(triggerNext, 3000);
  }

  start() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.85, now + 2.5);
    this.isPlaying = true;
    this.isMuted = false;
  }

  mute() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    this.isMuted = true;
  }

  unmute() {
    if (!this.ctx) {
      this.start();
      return;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.85, now + 0.8);
    this.isMuted = false;
  }

  toggle() {
    if (!this.initialized || !this.isPlaying) {
      this.start();
      return true;
    }
    if (this.isMuted) {
      this.unmute();
      return true;
    } else {
      this.mute();
      return false;
    }
  }
}

const soundscape = new AmbientSoundscape();
const soundToggle = document.getElementById("soundToggle");

if (soundToggle) {
  soundToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isNowPlaying = soundscape.toggle();
    if (isNowPlaying) {
      soundToggle.classList.remove("muted");
    } else {
      soundToggle.classList.add("muted");
    }
  });
}

// Sparkle chime on clicking / touching flowers or background when sound is enabled
window.addEventListener("pointerdown", (e) => {
  if (e.target && e.target.closest && e.target.closest("#soundToggle")) return;
  if (soundscape && soundscape.isPlaying && !soundscape.isMuted) {
    soundscape.playChime(null, 0.6);
  }
}, { passive: true });
