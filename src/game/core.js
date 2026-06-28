// ── おじさん商事 コアロジック（フレームワーク非依存・純粋に近い）──
// Phaser を一切 import しない。数字だけで動くので node でシミュレーション検証できる。
// 描画(GameScene)はこの state を読み、ここの関数を呼んで結果(events)をアニメ表示するだけ。

import { SEASONS, GARMENTS, JOB_TYPES, LAST_NAMES, FIRST_NAMES, RANKS, EVENTS, TECHS, RIVAL_NAMES } from '../data/content.js';
import { TUNING } from '../data/tuning.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const T = TUNING;

// 累計売上で解放済みの服。
export function unlockedGarments(totalRevenue) {
  return GARMENTS.filter((g) => totalRevenue >= g.unlock);
}

// その季節に旬の「解放済み」の服から1つを「流行」に選ぶ（無ければ解放済み全体から）。
function pickTrend(season, rng, totalRevenue = Infinity) {
  const unlocked = unlockedGarments(totalRevenue);
  const inSeason = unlocked.filter((g) => g.season === season);
  const pool = inSeason.length ? inSeason : (unlocked.length ? unlocked : GARMENTS);
  return pool[Math.floor(rng() * pool.length)].id;
}

// ── 研究・技術 ─────────────────────────────────────────────────

// state.techs に含まれる effect の合成倍率を返す（研究なし=1）。
export function getTechMult(state, effectId) {
  if (!state.techs || !state.techs.length) return 1;
  let mult = 1;
  for (const techId of state.techs) {
    const tech = TECHS.find((t) => t.id === techId);
    if (tech && tech.effect === effectId) mult *= tech.value;
  }
  return mult;
}

export function canBuyTech(state, techId) {
  const tech = TECHS.find((t) => t.id === techId);
  if (!tech) return false;
  if ((state.techs || []).includes(techId)) return false;
  return state.money >= tech.cost;
}

export function buyTech(state, techId) {
  if (!canBuyTech(state, techId)) return false;
  const tech = TECHS.find((t) => t.id === techId);
  state.money -= tech.cost;
  if (!state.techs) state.techs = [];
  state.techs.push(techId);
  return true;
}

// ── 店舗 ────────────────────────────────────────────────────────

export function storeCost(state) {
  return Math.round(T.storeBaseCost * Math.pow(T.storeUpgradeMult, (state.stores || 0)));
}

export function canOpenStore(state) {
  return (state.stores || 0) < T.storeMaxCount && state.money >= storeCost(state);
}

export function openStore(state) {
  if (!canOpenStore(state)) return false;
  state.money -= storeCost(state);
  state.stores = (state.stores || 0) + 1;
  return true;
}

export function storeWeeklyIncome(state) {
  return (state.stores || 0) * T.storeIncomeBase;
}

// ── 生成・問い合わせ ──────────────────────────────────────────

export function createState(rng = Math.random) {
  const state = {
    company: 'おじさん商事',
    money: T.startMoney,
    week: 1,
    season: SEASONS[0],
    employees: [],
    projects: [],
    maxEmployees: T.startMaxEmployees,
    maxProjects: T.startMaxProjects,
    expandCount: 0,
    totalRevenue: 0,
    trendGarment: pickTrend(SEASONS[0], rng, 0),
    gameOver: false,
    // 新規フィールド
    techs: [],                // 研究済みのtech id 一覧
    stores: 0,                // 店舗数
    pendingEvent: null,
    lastEventWeek: 0,
    rival: {
      name: RIVAL_NAMES[Math.floor(rng() * RIVAL_NAMES.length)],
      revenue: 0,
    },
    _eid: 1,
    _pid: 1,
  };
  // 創業者おじさん（社長）。最初から1人いるのでオフィスが寂しくない。
  state.employees.push({
    id: state._eid++, name: '社長', plan: 4, design: 5, sales: 4,
    level: 1, exp: 0, projectId: null, founder: true, specialty: null,
  });
  return state;
}

// 累計売上から会社の格付けを返す。
export function rankOf(totalRevenue) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (totalRevenue >= RANKS[i].min) idx = i;
  return { index: idx, ...RANKS[idx], next: RANKS[idx + 1] || null };
}

// その人の一番高い能力＝職種。
export function dominantJob(e) {
  let best = JOB_TYPES[0];
  for (const j of JOB_TYPES) if (e[j.key] > e[best.key]) best = j;
  return best;
}

export function salaryOf(e) {
  return T.salaryBase + (e.plan + e.design + e.sales) * T.salaryPerStat;
}

export function totalSalary(state) {
  return state.employees.reduce((s, e) => s + salaryOf(e), 0);
}

export function expandCost(state) {
  return Math.round(T.expandBaseCost * Math.pow(T.expandCostGrowth, state.expandCount));
}

export function garmentDef(id) {
  return GARMENTS.find((g) => g.id === id);
}

export function assignedTo(state, projectId) {
  return state.employees.filter((e) => e.projectId === projectId);
}

export function idleEmployees(state) {
  return state.employees.filter((e) => e.projectId === null);
}

// ── 採用 ──────────────────────────────────────────────────────

let _nameSeed = 0;
function makeName(rng) {
  const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  return `${ln}${fn}`;
}

function randStat(rng) {
  return T.statMin + Math.floor(rng() * (T.statMax - T.statMin + 1));
}

// 採用候補を生成（雇うとお金がかかる人物カード）。
export function generateCandidates(state, rng = Math.random) {
  const list = [];
  for (let i = 0; i < T.candidateCount; i++) {
    const plan = randStat(rng);
    const design = randStat(rng);
    const sales = randStat(rng);
    const fee = T.hireFeeBase + (plan + design + sales) * T.hireFeePerStat;
    const specialty = rng() < T.specialtyChance
      ? GARMENTS[Math.floor(rng() * GARMENTS.length)].id
      : null;
    list.push({ cid: ++_nameSeed, name: makeName(rng), plan, design, sales, fee, specialty });
  }
  return list;
}

export function canHire(state, cand) {
  return state.employees.length < state.maxEmployees && state.money >= cand.fee;
}

// charIdx ごとの固定名（addWalker の e.id % 6 と同じ算出式）
const CHAR_FIXED_NAMES = [
  null,        // 0: おじさん主人公（社長は別途固定）
  '田中さん',  // 1: OL田中
  '鈴木くん',  // 2: 後輩鈴木
  '佐藤くん',  // 3: 後輩コーヒー佐藤
  'お母さん',  // 4: おかあさん
  'ゾンビ山田', // 5: ゾンビリーマン
];

export function hire(state, cand) {
  if (!canHire(state, cand)) return null;
  state.money -= cand.fee;
  const newId = state._eid++;
  const charIdx = (newId - 1) % 6;
  const fixedName = CHAR_FIXED_NAMES[charIdx];
  const e = {
    id: newId,
    name: fixedName ?? cand.name,
    plan: cand.plan,
    design: cand.design,
    sales: cand.sales,
    level: 1,
    exp: 0,
    projectId: null,
    specialty: cand.specialty ?? null,
  };
  state.employees.push(e);
  return e;
}

// ── プロジェクト（コレクション開発）──────────────────────────

export function canStartProject(state) {
  return state.projects.length < state.maxProjects;
}

export function startProject(state, garmentId) {
  if (!canStartProject(state)) return null;
  const def = garmentDef(garmentId);
  if (!def) return null;
  if (state.totalRevenue < def.unlock) return null;
  const p = {
    id: state._pid++,
    defId: def.id,
    def,
    progress: 0,
    qualityAcc: 0,
    salesAcc: 0,
    workerWeeks: 0,
  };
  state.projects.push(p);
  return p;
}

export function assign(state, empId, projectId) {
  const e = state.employees.find((x) => x.id === empId);
  if (!e) return;
  e.projectId = projectId;
}

export function unassign(state, empId) {
  const e = state.employees.find((x) => x.id === empId);
  if (e) e.projectId = null;
}

// 解雇（社長は解雇できない）。
export function fireEmployee(state, empId) {
  const e = state.employees.find((x) => x.id === empId);
  if (!e || e.founder) return false;
  state.employees = state.employees.filter((x) => x.id !== empId);
  return true;
}

// ── 事業拡張 ──────────────────────────────────────────────────

export const EMPLOYEE_CAP = 8;
export const PROJECT_CAP = 3;

export function expandMaxed(state) {
  return state.maxEmployees >= EMPLOYEE_CAP && state.maxProjects >= PROJECT_CAP;
}

export function canExpand(state) {
  return !expandMaxed(state) && state.money >= expandCost(state);
}

export function expand(state) {
  if (!canExpand(state)) return false;
  state.money -= expandCost(state);
  state.expandCount++;
  state.maxEmployees = Math.min(EMPLOYEE_CAP, state.maxEmployees + 2);
  state.maxProjects = Math.min(PROJECT_CAP, state.maxProjects + 1);
  return true;
}

// ── 完成評価（純粋関数）───────────────────────────────────────
// opts: { revenueMultiplier, scoreBonus, bigHitBonus } — イベント・専門の効果上書き用

export function evaluateProject(state, p, rng = Math.random, opts = {}) {
  const { revenueMultiplier = 1, scoreBonus = 0, bigHitBonus = 0 } = opts;
  const def = p.def;

  // 品質スコア（研究「縫製技術」が乗算）
  const qualityMult = getTechMult(state, 'qualityMult');
  const avgQ = p.workerWeeks > 0 ? p.qualityAcc / p.workerWeeks : 0;
  let score = avgQ * T.qualityScale * qualityMult;

  // シーズン適合
  const seasonHit = def.season === state.season;
  score += seasonHit ? T.seasonMatchBonus : -T.seasonMissPenalty;

  // 流行（トレンド）
  const onTrend = def.id === state.trendGarment;
  if (onTrend) score += T.trendScoreBonus;

  // 社員の「得意」ボーナス（最大2人まで加点）
  const specialists = state.employees.filter(
    (e) => e.projectId === p.id && e.specialty === def.id,
  );
  const specialistCount = specialists.length;
  score += Math.min(specialistCount, 2) * T.specialtyBonus;

  // イベント由来の加減点
  score += scoreBonus;

  // 運
  score += (rng() * 2 - 1) * T.luckRange;
  score = clamp(score, 5, 100);

  const stars = clamp(Math.round(score / 20), 1, 5);

  // 販売数（研究「販路拡大」が乗算）
  const unitMult = getTechMult(state, 'unitMult');
  const avgSales = p.workerWeeks > 0 ? p.salesAcc / p.workerWeeks : 0;
  let units = Math.max(1, Math.round(T.unitBase * (score / 50) * (1 + avgSales * T.salesBoost) * unitMult));
  if (onTrend) units = Math.round(units * T.trendUnitMult);

  // 大ヒット（イベントで確率UP可）
  const bigHit = rng() < (T.bigHitChance + score * T.bigHitChancePerScore + bigHitBonus);

  // 売上（イベントの倍率・削減を適用）
  let revenue = Math.round(units * def.basePrice * (T.revenueFloor + score / 100) * revenueMultiplier);
  if (bigHit) revenue = Math.round(revenue * T.bigHitMult);

  return { score: Math.round(score), stars, units, revenue, seasonHit, onTrend, bigHit, specialistCount };
}

// ── 週送り（ゲームの心臓）─────────────────────────────────────

export function advanceWeek(state, rng = Math.random) {
  const events = [];

  // 0) 店舗収入（毎週・給料より先に入る）
  const shopIncome = storeWeeklyIncome(state);
  if (shopIncome > 0) {
    state.money += shopIncome;
    events.push({ type: 'storeIncome', amount: shopIncome });
  }

  // 1) 給料を払う
  const wage = totalSalary(state);
  state.money -= wage;
  events.push({ type: 'salary', amount: wage });

  // 2) 開発を進める＋経験値
  const expMult = getTechMult(state, 'expMult');
  for (const p of state.projects) {
    for (const e of state.employees) {
      if (e.projectId !== p.id) continue;
      p.progress += e.design * T.devDesign + e.plan * T.devPlan;
      p.qualityAcc += e.design + e.plan;
      p.salesAcc += e.sales;
      p.workerWeeks += 1;
      e.exp += Math.round(T.expPerWorkWeek * expMult);
    }
  }

  // 3) レベルアップ判定
  for (const e of state.employees) {
    while (e.exp >= T.expPerLevel * e.level) {
      e.exp -= T.expPerLevel * e.level;
      e.level += 1;
      const key = JOB_TYPES[Math.floor(rng() * JOB_TYPES.length)].key;
      e[key] += 1;
      events.push({ type: 'levelup', empId: e.id, name: e.name, stat: key, level: e.level });
    }
  }

  // 4) 完成判定（評価は「今の季節」で行ってから週を進める）
  const rankBefore = rankOf(state.totalRevenue).index;
  const revenueBefore = state.totalRevenue;
  const remaining = [];
  let pendingConsumed = false;
  for (const p of state.projects) {
    if (p.progress >= p.def.workNeeded) {
      // pendingEvent は最初に完成したコレクションにだけ適用
      let evalOpts = {};
      if (state.pendingEvent && !pendingConsumed) {
        const ev = state.pendingEvent;
        if (ev.effect === 'salesBoost') evalOpts.revenueMultiplier = 1 + ev.value;
        if (ev.effect === 'salesCut')   evalOpts.revenueMultiplier = 1 - ev.value;
        if (ev.effect === 'scorePenalty') evalOpts.scoreBonus = -ev.value;
        if (ev.effect === 'bigHitBoost')  evalOpts.bigHitBonus  = ev.value;
        pendingConsumed = true;
      }
      const r = evaluateProject(state, p, rng, evalOpts);
      state.money += r.revenue;
      state.totalRevenue += r.revenue;
      for (const e of state.employees) if (e.projectId === p.id) e.projectId = null;
      events.push({ type: 'complete', garment: p.def, ...r });
    } else {
      remaining.push(p);
    }
  }
  if (pendingConsumed) state.pendingEvent = null;
  state.projects = remaining;

  // 4.5) 昇格判定
  const rankAfter = rankOf(state.totalRevenue);
  if (rankAfter.index > rankBefore) {
    events.push({ type: 'rankup', title: rankAfter.title });
  }

  // 4.6) 新しい服の解放判定
  for (const g of GARMENTS) {
    if (g.unlock > 0 && revenueBefore < g.unlock && state.totalRevenue >= g.unlock) {
      events.push({ type: 'unlock', garment: g });
    }
  }

  // 5) 週・季節を進める（4週で次の季節）。
  const prevSeason = state.season;
  state.week += 1;
  state.season = SEASONS[Math.floor((state.week - 1) / 4) % SEASONS.length];
  if (state.season !== prevSeason) {
    state.trendGarment = pickTrend(state.season, rng, state.totalRevenue);
    events.push({ type: 'trend', garment: state.trendGarment, season: state.season });
  }

  // 5.5) ランダムイベント（クールダウン付き）
  const weeksSinceEvent = state.week - (state.lastEventWeek || 0);
  if (!state.pendingEvent && weeksSinceEvent >= T.eventCooldown && rng() < T.eventChance) {
    const ev = EVENTS[Math.floor(rng() * EVENTS.length)];
    state.lastEventWeek = state.week;
    if (ev.effect === 'bonusMoney') {
      state.money += ev.value;
      events.push({ type: 'event', event: ev, immediate: true });
    } else {
      state.pendingEvent = { ...ev };
      events.push({ type: 'event', event: ev, immediate: false });
    }
  }

  // 5.8) ライバル成長 + 順位変動イベント
  if (!state.rival) state.rival = { name: 'グローバル商事', revenue: 0 };
  const rivalRevBefore = state.rival.revenue;
  const rivalGrowth = Math.round(160 * (1 + state.week * 0.018) * (0.75 + rng() * 0.5));
  state.rival.revenue += rivalGrowth;
  if (rivalRevBefore <= revenueBefore && state.rival.revenue > state.totalRevenue && state.totalRevenue > 0) {
    events.push({ type: 'rival_overtook', name: state.rival.name });
  } else if (revenueBefore < rivalRevBefore && state.totalRevenue >= state.rival.revenue) {
    events.push({ type: 'rival_beaten', name: state.rival.name });
  }

  // 6) 倒産判定
  if (state.money <= T.bankruptThreshold) {
    state.gameOver = true;
    events.push({ type: 'bankrupt' });
  }

  return events;
}
