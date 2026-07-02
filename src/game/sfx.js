// Tiny WebAudio synth SFX (no audio assets).

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = "square", vol = 0.05, slide = 0) {
  if (muted) return;
  try {
    const a = ac();
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    gain.gain.setValueAtTime(vol, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
  } catch {
    /* audio unavailable */
  }
}

function noise(dur = 0.1, vol = 0.05, freq = 800) {
  if (muted) return;
  try {
    const a = ac();
    const buffer = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buffer;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
  } catch {
    /* audio unavailable */
  }
}

export const SFX = {
  toggleMute() {
    muted = !muted;
    return muted;
  },
  swing() { noise(0.08, 0.03, 1400); },
  hitBlock() { noise(0.06, 0.05, 600); },
  breakBlock() { noise(0.16, 0.08, 400); tone(140, 0.1, "triangle", 0.05, -60); },
  place() { tone(220, 0.07, "square", 0.045, 40); },
  pickup() { tone(660, 0.07, "square", 0.04, 220); },
  hitMonster() { tone(200, 0.1, "sawtooth", 0.06, -80); },
  kill() { tone(320, 0.2, "sawtooth", 0.06, -240); noise(0.14, 0.05, 500); },
  hurt() { tone(110, 0.22, "sawtooth", 0.08, -50); },
  craft() { tone(440, 0.08, "square", 0.05); setTimeout(() => tone(660, 0.1, "square", 0.05), 90); },
  talk() { tone(520, 0.04, "square", 0.025); },
  quest() { tone(523, 0.1, "square", 0.05); setTimeout(() => tone(659, 0.1, "square", 0.05), 110); setTimeout(() => tone(784, 0.18, "square", 0.05), 220); },
  levelup() {
    [523, 587, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.05), i * 100));
  },
  book() {
    [392, 494, 587, 740, 880].forEach((f, i) => setTimeout(() => tone(f, 0.25, "triangle", 0.05), i * 160));
  },
  raidHorn() { tone(98, 0.7, "sawtooth", 0.07, 20); setTimeout(() => tone(98, 0.7, "sawtooth", 0.07, 20), 800); },
  eat() { tone(300, 0.06, "triangle", 0.05, -60); setTimeout(() => tone(260, 0.06, "triangle", 0.05, -60), 90); },
  sleep() { [660, 520, 390, 260].forEach((f, i) => setTimeout(() => tone(f, 0.3, "sine", 0.04), i * 200)); },
};
