// All of Puffin Air Rally's sound is synthesised with WebAudio — there are
// no audio files. A little two-oscillator engine whose pitch and growl
// follow the throttle, wind that rises with airspeed, a two-note chime for a
// ring, a soft thud for a crash and a short major-key jingle for a finished
// rally. The context is created lazily on the first pilot gesture, as
// browsers require, and every call is safe before that (it just stays mute).

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windSource = null;

  /** Starts (or resumes) the context and the continuous engine and wind. */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a bandpass, gain by airspeed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();
  }

  /** Per-frame: the engine note and the wind follow the aeroplane. */
  function update(throttle, speed, running) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const rpm = running ? 0.25 + throttle * 0.95 : 0;
    engineOsc.frequency.setTargetAtTime(52 + rpm * 68, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(26 + rpm * 35, t, 0.08);
    engineFilter.frequency.setTargetAtTime(300 + rpm * 700, t, 0.1);
    engineGain.gain.setTargetAtTime(running ? 0.028 + throttle * 0.05 : 0, t, 0.12);
    windGain.gain.setTargetAtTime(Math.min(0.06, speed * speed * 0.000012), t, 0.15);
  }

  /** One soft sine note with an envelope; the building block of the cues. */
  function note(freq, at, dur, gain = 0.12, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = ctx.currentTime + at;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  return {
    unlock,
    update,
    /** A soft switch click for starting and pausing: the panel acknowledging. */
    click() {
      note(1240, 0, 0.07, 0.05, 'square');
    },
    /** A ring flown clean: two bright notes, up a fifth. */
    chime() {
      note(880, 0, 0.35, 0.1);
      note(1318, 0.09, 0.5, 0.1);
    },
    /** The stall warbler: a low, urgent pair of pulses. */
    stallWarn() {
      note(196, 0, 0.14, 0.07, 'triangle');
      note(185, 0.18, 0.14, 0.07, 'triangle');
    },
    /** A crash: noise burst and a falling thud. */
    thud() {
      note(90, 0, 0.5, 0.16, 'sine');
      note(55, 0.05, 0.7, 0.14, 'sine');
    },
    /** Touchdown: a small, satisfied chirp when the landing counts. */
    chirp() {
      note(660, 0, 0.16, 0.07);
      note(990, 0.07, 0.22, 0.07);
    },
    /** The finish: a short major arpeggio, the rally's whole tune. */
    jingle() {
      const seq = [523, 659, 784, 1047, 784, 1047];
      seq.forEach((freq, i) => note(freq, i * 0.13, 0.4, 0.1, 'triangle'));
    },
  };
}
