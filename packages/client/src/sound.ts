// Procedurally synthesized retro SFX via Web Audio — ships no audio files.
// Must be initialized from a user gesture (button click) to satisfy autoplay rules.

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) ctx = new AC();
    if (ctx) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16; // sits under SFX
      musicGain.connect(ctx.destination);
    }
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function beep(freq: number, t0: number, dur: number, gain = 0.18, type: OscillatorType = "square") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime + t0;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.start(now);
  o.stop(now + dur + 0.02);
}

// Filtered noise swell — stands in for a crowd cheer.
function cheer(t0: number, dur: number, gain = 0.22) {
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 1100;
  filt.Q.value = 0.6;
  const g = ctx.createGain();
  src.connect(filt);
  filt.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime + t0;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.35);
  g.gain.linearRampToValueAtTime(gain * 0.7, now + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  src.start(now);
  src.stop(now + dur + 0.02);
}

/** Rising fanfare + crowd cheer when a goal is scored. */
export function playGoal() {
  initAudio();
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((f, i) => beep(f, i * 0.09, 0.22, 0.16));
  beep(1568, 0.36, 0.4, 0.14); // G6 sustain
  cheer(0.05, 1.4, 0.22);
}

/** Referee whistle for kickoff / full time. */
export function playWhistle(double = false) {
  initAudio();
  const trill = (t: number) => {
    beep(2300, t, 0.12, 0.16, "square");
    beep(2500, t + 0.02, 0.12, 0.12, "sawtooth");
  };
  trill(0);
  if (double) { trill(0.16); trill(0.32); }
}

/** Final-whistle outcome sting. */
export function playMatchEnd(win: boolean) {
  initAudio();
  playWhistle(true);
  if (win) { cheer(0.1, 1.6, 0.24); [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.4 + i * 0.1, 0.25, 0.15)); }
  else { [440, 392, 330, 262].forEach((f, i) => beep(f, 0.4 + i * 0.12, 0.3, 0.14, "triangle")); }
}

/** Punchy whoosh + thwack when a player kicks. */
export function playKick() {
  initAudio();
  if (!ctx) return;
  beep(240, 0, 0.08, 0.18, "square");
  beep(110, 0.01, 0.16, 0.22, "triangle");
  // short high-passed noise "thwack"
  const dur = 0.1;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1100;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  src.connect(hp); hp.connect(g); g.connect(ctx.destination);
  src.start();
}

// ===== Looping chiptune background music =====
// Driving Am–F–C–G loop: triangle bass + square arpeggio + noise hats,
// scheduled against the Web Audio clock with a small lookahead.

const BPM = 132;
const STEP = 60 / BPM / 4; // sixteenth note in seconds
const PROGRESSION = [
  { bass: 110.0, lead: [440, 523, 659, 523, 440, 523, 659, 880] },   // Am
  { bass: 87.31, lead: [349, 440, 523, 440, 349, 440, 523, 698] },   // F
  { bass: 130.81, lead: [523, 659, 784, 659, 523, 659, 784, 1047] }, // C
  { bass: 98.0, lead: [392, 494, 587, 494, 392, 494, 587, 784] },    // G
];

let musicOn = false;
let schedTimer: ReturnType<typeof setInterval> | null = null;
let nextStepTime = 0;
let stepIndex = 0;
let hatBuffer: AudioBuffer | null = null;

function voice(freq: number, time: number, dur: number, gain: number, type: OscillatorType) {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(musicGain);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function hat(time: number) {
  if (!ctx || !musicGain) return;
  if (!hatBuffer) {
    hatBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = hatBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  const src = ctx.createBufferSource();
  src.buffer = hatBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = 0.06;
  src.connect(hp); hp.connect(g); g.connect(musicGain);
  src.start(time);
}

function scheduleStep(step: number, time: number) {
  const chord = PROGRESSION[Math.floor(step / 8) % PROGRESSION.length];
  const s = step % 8;
  // Bass on every eighth note.
  if (s % 2 === 0) voice(chord.bass, time, STEP * 1.6, 0.5, "triangle");
  // Lead arpeggio on every sixteenth.
  voice(chord.lead[s], time, STEP * 0.9, 0.32, "square");
  // Hats on the offbeats for groove.
  if (s % 2 === 1) hat(time);
}

function scheduler() {
  if (!ctx) return;
  while (nextStepTime < ctx.currentTime + 0.12) {
    scheduleStep(stepIndex, nextStepTime);
    nextStepTime += STEP;
    stepIndex = (stepIndex + 1) % (PROGRESSION.length * 8);
  }
}

export function startMusic() {
  initAudio();
  if (!ctx || musicOn) return;
  musicOn = true;
  stepIndex = 0;
  nextStepTime = ctx.currentTime + 0.1;
  schedTimer = setInterval(scheduler, 25);
}

export function stopMusic() {
  musicOn = false;
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
}

export function toggleMusic(): boolean {
  if (musicOn) stopMusic();
  else startMusic();
  return musicOn;
}

export function isMusicOn() {
  return musicOn;
}
