// ── おじさん商事 コアロジック（フレームワーク非依存・純粋に近い）──
// Phaser を一切 import しない。数字だけで動くので node でシミュレーション検証できる。
// 描画(GameScene)はこの state を読み、ここの関数を呼んで結果(events)をアニメ表示するだけ。

import { SEASONS, GARMENTS, JOB_TYPES, LAST_NAMES, FIRST_NAMES, RANKS } from '../data/content.js';
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
    totalRevenue: 0,            // 累計売上（格付け・服の解放の基準）
    trendGarment: pickTrend(SEASONS[0], rng, 0), // 今の流行
    gameOver: false,
    _eid: 1,
    _pid: 1,
  };
  // 創業者おじさん（社長）。最初から1人いるのでオフィスが寂しくない。
  state.employees.push({
    id: state._eid++, name: '社長', plan: 4, design: 5, sales: 4,
    level: 1, exp: 0, projectId: null, founder: true,
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
    list.push({ cid: ++_nameSeed, name: makeName(rng), plan, design, sales, fee });
  }
  return list;
}

export function canHire(state, cand) {
  return state.employees.length < state.maxEmployees && state.money >= cand.fee;
}

export function hire(state, cand) {
  if (!canHire(state, cand)) return null;
  state.money -= cand.fee;
  const e = {
    id: state._eid++,
    name: cand.name,
    plan: cand.plan,
    design: cand.design,
    sales: cand.sales,
    level: 1,
    exp: 0,
    projectId: null,
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
  if (state.totalRevenue < def.unlock) return null; // 未解放の服は作れない
  const p = {
    id: state._pid++,
    defId: def.id,
    def,
    progress: 0,
    qualityAcc: 0, // Σ(企画+デザイン) 貢献
    salesAcc: 0,   // Σ営業 貢献
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

// 解雇（社長は解雇できない）。給料を抑えたいときに使う。
export function fireEmployee(state, empId) {
  const e = state.employees.find((x) => x.id === empId);
  if (!e || e.founder) return false;
  state.employees = state.employees.filter((x) => x.id !== empId);
  return true;
}

// ── 事業拡張 ──────────────────────────────────────────────────

export const EMPLOYEE_CAP = 8;  // 社員パネルに収まる上限
export const PROJECT_CAP = 3;   // 開発カードに収まる上限

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

export function evaluateProject(state, p, rng = Math.random) {
  const def = p.def;
  // 品質：従事した社員の平均(企画+デザイン)貢献に比例（高能力ほど高評価）。
  const avgQ = p.workerWeeks > 0 ? p.qualityAcc / p.workerWeeks : 0;
  let score = avgQ * T.qualityScale;
  // シーズン適合
  const seasonHit = def.season === state.season;
  score += seasonHit ? T.seasonMatchBonus : -T.seasonMissPenalty;
  // 流行（トレンド）に乗っているか
  const onTrend = def.id === state.trendGarment;
  if (onTrend) score += T.trendScoreBonus;
  // 運
  score += (rng() * 2 - 1) * T.luckRange;
  score = clamp(score, 5, 100);

  const stars = clamp(Math.round(score / 20), 1, 5);
  const avgSales = p.workerWeeks > 0 ? p.salesAcc / p.workerWeeks : 0;
  let units = Math.max(1, Math.round(T.unitBase * (score / 50) * (1 + avgSales * T.salesBoost)));
  if (onTrend) units = Math.round(units * T.trendUnitMult);

  // 大ヒット（クリティカル）：高評価ほど化けやすい
  const bigHit = rng() < (T.bigHitChance + score * T.bigHitChancePerScore);
  let revenue = Math.round(units * def.basePrice * (T.revenueFloor + score / 100));
  if (bigHit) revenue = Math.round(revenue * T.bigHitMult);

  return { score: Math.round(score), stars, units, revenue, seasonHit, onTrend, bigHit };
}

// ── 週送り（ゲームの心臓）─────────────────────────────────────
// 返り値 events：描画側が演出に使う（給料/レベルアップ/完成）。

export function advanceWeek(state, rng = Math.random) {
  const events = [];

  // 1) 給料を払う
  const wage = totalSalary(state);
  state.money -= wage;
  events.push({ type: 'salary', amount: wage });

  // 2) 開発を進める＋経験値
  for (const p of state.projects) {
    for (const e of state.employees) {
      if (e.projectId !== p.id) continue;
      p.progress += e.design * T.devDesign + e.plan * T.devPlan;
      p.qualityAcc += e.design + e.plan;
      p.salesAcc += e.sales;
      p.workerWeeks += 1;
      e.exp += T.expPerWorkWeek;
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
  for (const p of state.projects) {
    if (p.progress >= p.def.workNeeded) {
      const r = evaluateProject(state, p, rng);
      state.money += r.revenue;
      state.totalRevenue += r.revenue;
      for (const e of state.employees) if (e.projectId === p.id) e.projectId = null;
      events.push({ type: 'complete', garment: p.def, ...r });
    } else {
      remaining.push(p);
    }
  }
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

  // 5) 週・季節を進める（4週で次の季節）。季節が変わったら流行も入れ替わる。
  const prevSeason = state.season;
  state.week += 1;
  state.season = SEASONS[Math.floor((state.week - 1) / 4) % SEASONS.length];
  if (state.season !== prevSeason) {
    state.trendGarment = pickTrend(state.season, rng, state.totalRevenue);
    events.push({ type: 'trend', garment: state.trendGarment, season: state.season });
  }

  // 6) 倒産判定
  if (state.money <= T.bankruptThreshold) {
    state.gameOver = true;
    events.push({ type: 'bankrupt' });
  }

  return events;
}
