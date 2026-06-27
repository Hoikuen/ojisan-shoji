// セーブ/ロード（localStorage）。core.js は node でも動くようにするため、
// ブラウザ専用の localStorage 依存はこのモジュールに隔離する。
import { GARMENTS } from '../data/content.js';

const KEY = 'ojisan-shoji-save-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 妥当性の最低チェック（壊れたセーブを弾く）
    if (typeof s.money !== 'number' || !Array.isArray(s.employees) || !Array.isArray(s.projects)) {
      return null;
    }
    // 服の定義を正規のオブジェクトに貼り直す（参照の同一性を保つ）
    for (const p of s.projects) {
      p.def = GARMENTS.find((g) => g.id === p.defId) || p.def;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* noop */ }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch (e) {
    return false;
  }
}
