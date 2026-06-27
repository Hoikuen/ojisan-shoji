// セーブ/ロード（localStorage）。core.js は node でも動くようにするため、
// ブラウザ専用の localStorage 依存はこのモジュールに隔離する。
import { GARMENTS } from '../data/content.js';

const KEY    = 'ojisan-shoji-save-v2';
const OLD_KEY = 'ojisan-shoji-save-v1';

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
    // v1 セーブが残っていれば削除（v2 と混在しないよう）
    try { localStorage.removeItem(OLD_KEY); } catch (_) { /* noop */ }

    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.money !== 'number' || !Array.isArray(s.employees) || !Array.isArray(s.projects)) {
      return null;
    }
    // 服の定義を正規のオブジェクトに貼り直す（参照の同一性を保つ）
    for (const p of s.projects) {
      p.def = GARMENTS.find((g) => g.id === p.defId) || p.def;
    }
    // v2 以前のセーブに新フィールドが無い場合のデフォルト補完
    if (!Array.isArray(s.techs)) s.techs = [];
    if (typeof s.stores !== 'number') s.stores = 0;
    if (!('pendingEvent' in s)) s.pendingEvent = null;
    if (typeof s.lastEventWeek !== 'number') s.lastEventWeek = 0;
    for (const e of s.employees) {
      if (!('specialty' in e)) e.specialty = null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
  } catch (e) { /* noop */ }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch (e) {
    return false;
  }
}
