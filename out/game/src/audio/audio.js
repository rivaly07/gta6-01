// WebAudio-only sound: no files. Engine hum tracks speed, tyres screech on drift,
// gunshots are noise bursts, sirens are two detuned oscillators, ambience is a low drone.

import { AUDIO_CFG } from '../config.js';

export function createAudioSystem(state) {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let ambBus = null;
  let engineBus = null;
  let unlocked = false;

  // Engine voice
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let engineFilter = null;

  // Tyre screech
  let screechSrc = null;
  let screechGain = null;
  let screechFilter = null;

  // Siren
  let sirenOsc = null;
  let sirenOsc2 = null;
  let sirenGain = null;
  let sirenLfo = null;

  // Ambience
  let ambGain = null;

  // Noise buffer shared by all one-shot effects
  let noiseBuffer = null;

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = ((seed >>> 16) / 32768) - 1;
    }
    return buf;
  }

  /** Must be called from a user gesture. Idempotent. */
  function unlock() {
    if (unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    ctx = new AC();
    unlocked = true;

    master = ctx.createGain();
    master.gain.value = AUDIO_CFG.master;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = AUDIO_CFG.sfx;
    sfxBus.connect(master);

    ambBus = ctx.createGain();
    ambBus.gain.value = AUDIO_CFG.ambience;
    ambBus.connect(master);

    engineBus = ctx.createGain();
    engineBus.gain.value = 0;
    engineBus.connect(master);

    noiseBuffer = makeNoise();

    buildEngine();
    buildScreech();
    buildSiren();
    buildAmbience();
  }

  function buildEngine() {
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 6;

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;

    engineSub = ctx.createOscillator();
    engineSub.type = 'square';
    engineSub.frequency.value = 27;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;

    engineOsc.connect(engineFilter);
    engineSub.connect(subGain);
    subGain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(engineBus);

    engineOsc.start();
    engineSub.start();
  }

  function buildScreech() {
    screechGain = ctx.createGain();
    screechGain.gain.value = 0;

    screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 2100;
    screechFilter.Q.value = 9;

    screechSrc = ctx.createBufferSource();
    screechSrc.buffer = noiseBuffer;
    screechSrc.loop = true;

    screechSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(sfxBus);
    screechSrc.start();
  }

  function buildSiren() {
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenGain.connect(sfxBus);

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.value = 760;

    sirenOsc2 = ctx.createOscillator();
    sirenOsc2.type = 'sine';
    sirenOsc2.frequency.value = 1140;

    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    lfoGain.connect(sirenOsc2.frequency);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;

    sirenOsc.connect(f);
    sirenOsc2.connect(f);
    f.connect(sirenGain);

    sirenOsc.start();
    sirenOsc2.start();
    sirenLfo.start();
  }

  function buildAmbience() {
    ambGain = ctx.createGain();
    ambGain.gain.value = 0.5;
    ambGain.connect(ambBus);

    // Low city drone
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 41;

    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 61.5;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;

    drone.connect(lp);
    drone2.connect(lp);
    lp.connect(droneGain);
    droneGain.connect(ambGain);
    drone.start();
    drone2.start();

    // Distant traffic hiss
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'lowpass';
    hissFilter.frequency.value = 700;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.055;
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(ambGain);
    hiss.start();
  }

  // --- One-shot SFX -------------------------------------------------------

  function noiseBurst({ dur = 0.12, freq = 1200, q = 1.2, gain = 0.5, type = 'bandpass', sweepTo = null, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;

    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (sweepTo !== null) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function tone({ freq = 440, dur = 0.12, gain = 0.25, type = 'square', sweepTo = null, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function play(name, variant) {
    if (!ctx) return;
    switch (name) {
      case 'shot':
        if (variant === 'Shotgun') {
          noiseBurst({ dur: 0.3, freq: 800, q: 0.7, gain: 0.85, sweepTo: 140 });
          tone({ freq: 90, dur: 0.16, gain: 0.4, type: 'sine', sweepTo: 40 });
        } else if (variant === 'Rifle') {
          noiseBurst({ dur: 0.22, freq: 1900, q: 1.0, gain: 0.8, sweepTo: 260 });
          tone({ freq: 140, dur: 0.1, gain: 0.3, type: 'sine', sweepTo: 60 });
        } else if (variant === 'SMG') {
          noiseBurst({ dur: 0.09, freq: 2400, q: 1.4, gain: 0.5, sweepTo: 700 });
        } else {
          noiseBurst({ dur: 0.14, freq: 1600, q: 1.1, gain: 0.66, sweepTo: 320 });
          tone({ freq: 180, dur: 0.07, gain: 0.22, type: 'sine', sweepTo: 70 });
        }
        break;
      case 'dryfire':
        tone({ freq: 300, dur: 0.05, gain: 0.12, type: 'square' });
        break;
      case 'reload':
        noiseBurst({ dur: 0.05, freq: 1800, q: 3, gain: 0.25 });
        noiseBurst({ dur: 0.06, freq: 900, q: 3, gain: 0.3, delay: 0.5 });
        break;
      case 'click':
        tone({ freq: 780, dur: 0.05, gain: 0.1, type: 'square', sweepTo: 520 });
        break;
      case 'pickup':
        tone({ freq: 620, dur: 0.08, gain: 0.2, type: 'triangle' });
        tone({ freq: 940, dur: 0.12, gain: 0.18, type: 'triangle', delay: 0.07 });
        break;
      case 'hurt':
        noiseBurst({ dur: 0.18, freq: 420, q: 0.8, gain: 0.4, sweepTo: 120 });
        break;
      case 'crash':
        noiseBurst({ dur: 0.35, freq: 500, q: 0.6, gain: 0.7, sweepTo: 90 });
        tone({ freq: 70, dur: 0.3, gain: 0.35, type: 'sine', sweepTo: 35 });
        break;
      case 'sirenBlip':
        tone({ freq: 880, dur: 0.09, gain: 0.16, type: 'square', sweepTo: 1320 });
        break;
      case 'mission':
        tone({ freq: 520, dur: 0.14, gain: 0.2, type: 'triangle' });
        tone({ freq: 780, dur: 0.16, gain: 0.2, type: 'triangle', delay: 0.13 });
        tone({ freq: 1040, dur: 0.3, gain: 0.18, type: 'triangle', delay: 0.28 });
        break;
      case 'fail':
        tone({ freq: 420, dur: 0.2, gain: 0.22, type: 'sawtooth', sweepTo: 180 });
        tone({ freq: 260, dur: 0.4, gain: 0.2, type: 'sawtooth', sweepTo: 90, delay: 0.18 });
        break;
      case 'cash':
        tone({ freq: 1200, dur: 0.07, gain: 0.16, type: 'square' });
        tone({ freq: 1600, dur: 0.1, gain: 0.14, type: 'square', delay: 0.06 });
        break;
      case 'explode':
        noiseBurst({ dur: 0.8, freq: 380, q: 0.4, gain: 0.9, sweepTo: 60 });
        tone({ freq: 60, dur: 0.6, gain: 0.5, type: 'sine', sweepTo: 24 });
        break;
      case 'wasted':
        tone({ freq: 320, dur: 0.5, gain: 0.3, type: 'sawtooth', sweepTo: 60 });
        break;
      default:
        break;
    }
  }

  /** Per-frame mix: engine pitch/volume, screech, siren distance. */
  function update(dt) {
    if (!ctx) return;

    const p = state.player;
    const v = p.inVehicle;
    const speed = v ? Math.abs(v.forwardSpeed) : 0;
    const maxSpeed = 40;

    // Engine
    if (v && !p.dead) {
      const norm = Math.min(1, speed / maxSpeed);
      const targetFreq = 52 + norm * 168;
      engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.06);
      engineSub.frequency.setTargetAtTime(targetFreq * 0.5, ctx.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(340 + norm * 1500, ctx.currentTime, 0.08);
      const g = 0.16 + norm * 0.2;
      engineGain.gain.setTargetAtTime(g, ctx.currentTime, 0.1);
      engineBus.gain.setTargetAtTime(1, ctx.currentTime, 0.1);
    } else {
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      engineBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }

    // Tyre screech
    let screech = 0;
    if (v) {
      const drift = Math.abs(v.lateralSpeed);
      if (drift > 2.6 && v.speed > 6) screech = Math.min(1, (drift - 2.6) / 9);
      if (v.handbrake && v.speed > 4) screech = Math.max(screech, 0.45);
    }
    screechGain.gain.setTargetAtTime(screech * 0.32, ctx.currentTime, 0.07);

    // Siren: on when police are near and wanted > 0
    let sirenLevel = 0;
    if (state.wanted.stars > 0) {
      let nearest = Infinity;
      for (const cop of state.wanted.police) {
        const d = Math.hypot(cop.x - p.x, cop.z - p.z);
        if (d < nearest) nearest = d;
      }
      if (nearest < 130) sirenLevel = Math.max(0, 1 - nearest / 130) * 0.5;
    }
    sirenGain.gain.setTargetAtTime(sirenLevel, ctx.currentTime, 0.25);
  }

  function setMuted(muted) {
    if (!master) return;
    master.gain.setTargetAtTime(muted ? 0 : AUDIO_CFG.master, ctx.currentTime, 0.05);
  }

  function isUnlocked() { return unlocked; }

  return { unlock, play, update, setMuted, isUnlocked };
}
