let ctx = null;
let muted = localStorage.getItem('shengji-muted') === 'true';

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }

export function setMuted(val) {
  muted = val;
  localStorage.setItem('shengji-muted', val ? 'true' : 'false');
}

function noise(ac, duration) {
  const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playCardSnap() {
  if (muted) return;
  const ac = getCtx();
  const now = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.04);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  src.connect(hp).connect(gain).connect(ac.destination);
  src.start(now);
  src.stop(now + 0.05);
}

export function playDealTick() {
  if (muted) return;
  const ac = getCtx();
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 800 + Math.random() * 200;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

export function playTrickWon() {
  if (muted) return;
  const ac = getCtx();
  const now = ac.currentTime;

  [523, 659, 784].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ac.createGain();
    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

export function playRoundEnd(won) {
  if (muted) return;
  const ac = getCtx();
  const now = ac.currentTime;

  const notes = won ? [523, 659, 784, 1047] : [440, 349, 294, 262];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = won ? 'triangle' : 'sawtooth';
    osc.frequency.value = freq;
    const gain = ac.createGain();
    const t = now + i * 0.15;
    gain.gain.setValueAtTime(won ? 0.12 : 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}
