// 効果音（WebAudio で合成・音源ファイル不要）。
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

export const Sfx = {
  isMuted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* noop */ }
    if (!muted) tone(660, 0.08, 'square', 0.1); // 解除時に小さく確認音
    return muted;
  },

  click() { if (!muted) tone(440, 0.05, 'square', 0.06); },
  week()  { if (!muted) tone(330, 0.06, 'square', 0.08); },           // 週送り
  hire()  { if (!muted) melody([[523, 0], [784, 0.07]], 'square'); }, // 採用（ポン）
  complete() { if (!muted) melody([[523, 0], [659, 0.09], [784, 0.18]], 'triangle'); }, // 完成
  bigHit() { if (!muted) melody([[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]], 'sawtooth', 0.14); }, // 大ヒット
  rankUp() { if (!muted) melody([[659, 0], [831, 0.1], [988, 0.2], [1319, 0.32]], 'triangle'); }, // 昇格
  unlock() { if (!muted) melody([[784, 0], [1047, 0.1]], 'triangle'); }, // 新コレクション解放
  expand() { if (!muted) melody([[392, 0], [587, 0.1]], 'triangle'); },  // 拡張
  bankrupt() { if (!muted) melody([[392, 0, 0.3], [311, 0.25, 0.3], [233, 0.5, 0.5]], 'sawtooth', 0.12); }, // 倒産
};
