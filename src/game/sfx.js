// 効果音＋BGM（WebAudio で合成・音源ファイル不要）。
// AudioContext はユーザー操作後でないと鳴らないため、play 時に resume する
// （ボタン/キー操作のハンドラ内から呼ばれる前提）。
const MUTE_KEY = 'ojisan-shoji-mute';

let ctx = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* noop */ }

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 単音（周波数・長さ・波形・音量・開始遅延）。
function tone(freq, dur, type = 'square', vol = 0.12, delay = 0) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// メロディ（[freq, startDelay, dur?] の配列）。
function melody(notes, type = 'triangle', vol = 0.12) {
  for (const [f, d, dur] of notes) tone(f, dur ?? 0.12, type, vol, d);
}

// ── BGM ─────────────────────────────────────────────────────────
// ペンタトニック短調で経営シムっぽい落ち着いた雰囲気。
const BGM_NOTES = [
  [330, 0.35], [392, 0.35], [440, 0.35], [392, 0.35],
  [330, 0.35], [294, 0.35], [262, 0.70],
  [294, 0.35], [330, 0.35], [392, 0.35], [440, 0.70],
  [392, 0.35], [330, 0.35], [294, 0.35], [262, 0.70],
];
let bgmIdx = 0;
let bgmTimer = null;

function bgmTick() {
  if (muted) { bgmTimer = null; return; }
  const c = ensureCtx();
  if (!c) { bgmTimer = null; return; }
  const [freq, dur] = BGM_NOTES[bgmIdx % BGM_NOTES.length];
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.032, c.currentTime + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur * 0.82);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + dur);
  bgmIdx++;
  bgmTimer = setTimeout(bgmTick, Math.round(dur * 1000));
}

export const Sfx = {
  isMuted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* noop */ }
    if (!muted) {
      tone(660, 0.08, 'square', 0.1);
      Sfx.startBgm();
    } else {
      Sfx.stopBgm();
    }
    return muted;
  },

  startBgm() {
    if (bgmTimer || muted) return;
    bgmTick();
  },
  stopBgm() {
    if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
  },

  click()    { if (!muted) tone(440, 0.05, 'square', 0.06); },
  week()     { if (!muted) tone(330, 0.06, 'square', 0.08); },
  hire()     { if (!muted) melody([[523, 0], [784, 0.07]], 'square'); },
  complete() { if (!muted) melody([[523, 0], [659, 0.09], [784, 0.18]], 'triangle'); },
  bigHit()   { if (!muted) melody([[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]], 'sawtooth', 0.14); },
  rankUp()   { if (!muted) melody([[659, 0], [831, 0.1], [988, 0.2], [1319, 0.32]], 'triangle'); },
  unlock()   { if (!muted) melody([[784, 0], [1047, 0.1]], 'triangle'); },
  expand()   { if (!muted) melody([[392, 0], [587, 0.1]], 'triangle'); },
  research() { if (!muted) melody([[523, 0], [659, 0.12], [784, 0.24]], 'sine', 0.10); },
  store()    { if (!muted) melody([[440, 0], [523, 0.1], [659, 0.2]], 'sine', 0.10); },
  event()    { if (!muted) melody([[880, 0, 0.08], [660, 0.1, 0.12]], 'square', 0.09); },
  bankrupt() { if (!muted) melody([[392, 0, 0.3], [311, 0.25, 0.3], [233, 0.5, 0.5]], 'sawtooth', 0.12); },
};
