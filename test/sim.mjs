// コアロジックの「数字での検証」。ブラウザ無しで経済が回るか・破綻しないかを見る。
// 実行: npm run sim

import {
  createState, generateCandidates, hire, canHire,
  startProject, canStartProject, assign, idleEmployees, assignedTo,
  advanceWeek, totalSalary, expandCost, canExpand, expand, garmentDef, rankOf,
  canBuyTech, buyTech, storeCost, canOpenStore, openStore,
} from '../src/game/core.js';
import { GARMENTS, SEASONS, TECHS } from '../src/data/content.js';

// 決定論的RNG（mulberry32）。
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextSeason(week) {
  return SEASONS[Math.floor(((week + 4) - 1) / 4) % SEASONS.length];
}

// 賢いプレイヤーの服選び：解放済みの中から、資金が薄いうちは安い高回転品を選ぶ。
function chooseGarment(s) {
  const pool = GARMENTS.filter((g) => s.totalRevenue >= g.unlock);
  const tight = s.money < 2500 || s.employees.length <= 1;
  if (tight) {
    return [...pool].sort((a, b) => a.workNeeded - b.workNeeded)[0].id;
  }
  const trend = pool.find((g) => g.id === s.trendGarment);
  return (trend || pool.find((g) => g.season === s.season) || pool[0]).id;
}

function runOnce(seed, weeks = 40, verbose = false) {
  const rng = makeRng(seed);
  const s = createState(rng);
  const history = [];
  let completions = 0;
  let bigHits = 0;

  for (let w = 0; w < weeks; w++) {
    if (s.gameOver) break;

    // --- 採用 ---
    if (s.employees.length < s.maxEmployees) {
      const cands = generateCandidates(s, rng).sort((a, b) =>
        (b.plan + b.design + b.sales) - (a.plan + a.design + a.sales));
      for (const c of cands) {
        if (s.money > c.fee + 800 && canHire(s, c)) { hire(s, c); break; }
      }
    }

    // --- 開発開始 ---
    while (canStartProject(s)) {
      startProject(s, chooseGarment(s));
    }

    // --- 割当 ---
    for (const e of idleEmployees(s)) {
      if (s.projects.length === 0) break;
      let target = s.projects[0];
      for (const p of s.projects) {
        if (assignedTo(s, p.id).length < assignedTo(s, target.id).length) target = p;
      }
      assign(s, e.id, target.id);
    }

    // --- 拡張 ---
    if (s.employees.length >= s.maxEmployees && canExpand(s) &&
        s.money - expandCost(s) > totalSalary(s) * 2 + 3000) {
      expand(s);
    }

    // --- 研究（安定してきたら投資）---
    for (const tech of TECHS) {
      if (!s.techs.includes(tech.id) && canBuyTech(s, tech.id) &&
          s.money - tech.cost > totalSalary(s) * 4) {
        buyTech(s, tech.id);
      }
    }

    // --- 店舗開設（余裕があれば）---
    if (canOpenStore(s) && s.money - storeCost(s) > totalSalary(s) * 5) {
      openStore(s);
    }

    // --- 週送り ---
    const events = advanceWeek(s, rng);
    for (const ev of events) {
      if (ev.type === 'complete') { completions++; if (ev.bigHit) bigHits++; }
    }

    history.push(s.money);
    if (verbose) {
      const comp = events.filter((e) => e.type === 'complete')
        .map((e) => `${e.garment.name}★${e.stars}${e.onTrend ? '🔥' : ''}${e.bigHit ? '💥' : ''}${e.specialistCount > 0 ? '✨' : ''}/¥${e.revenue}`).join(' ');
      const rk  = events.find((e) => e.type === 'rankup');
      const evt = events.find((e) => e.type === 'event');
      console.log(
        `W${String(s.week - 1).padStart(2)} ${s.season} ¥${String(s.money).padStart(6)} ` +
        `社員${s.employees.length}/${s.maxEmployees} 店舗${s.stores} 研究${s.techs.length}/${TECHS.length} ` +
        (comp ? `完成:${comp}` : '') +
        (rk ? ` 🎉昇格『${rk.title}』` : '') +
        (evt ? ` 📣${evt.event.text}` : '')
      );
    }
  }

  return {
    final: s.money, completions, totalRevenue: s.totalRevenue, bigHits,
    employees: s.employees.length, stores: s.stores, techs: s.techs.length,
    gameOver: s.gameOver, rank: rankOf(s.totalRevenue).title,
  };
}

// 1回詳細表示
console.log('=== サンプルプレイ (seed=1) ===');
const sample = runOnce(1, 40, true);
console.log(`\n最終資金 ¥${sample.final} / 累計売上 ¥${sample.totalRevenue} / 格付け『${sample.rank}』 / 大ヒット ${sample.bigHits}回 / 店舗 ${sample.stores}軒 / 研究 ${sample.techs}/${TECHS.length}`);

// 多シードで統計
console.log('\n=== 100シード統計 (40週) ===');
const finals = [];
let bankrupts = 0;
let gameOvers = 0;
let noComplete = 0;
const ranks = {};
let totalBigHits = 0;
for (let seed = 1; seed <= 100; seed++) {
  const r = runOnce(seed, 40, false);
  finals.push(r.final);
  if (r.final < 0) bankrupts++;
  if (r.gameOver) gameOvers++;
  if (r.completions === 0) noComplete++;
  ranks[r.rank] = (ranks[r.rank] || 0) + 1;
  totalBigHits += r.bigHits;
}
finals.sort((a, b) => a - b);
const mean = Math.round(finals.reduce((a, b) => a + b, 0) / finals.length);
const median = finals[Math.floor(finals.length / 2)];
console.log(`最終資金: 最小¥${finals[0]} / 中央¥${median} / 平均¥${mean} / 最大¥${finals[finals.length - 1]}`);
console.log(`資金マイナスで終えた: ${bankrupts}/100 件 ／ うち倒産(-3000割れ): ${gameOvers}/100 件`);
console.log(`1着も完成しなかった: ${noComplete}/100 件 ／ 大ヒット平均: ${(totalBigHits / 100).toFixed(1)}回/プレイ`);
console.log('40週後の格付け分布:', ranks);

const fails = [];
if (median <= createState().money) fails.push('中央値が初期資金を超えていない（育つ実感が無い）');
if (gameOvers > 12) fails.push(`倒産が多すぎる (${gameOvers}/100)`);
if (noComplete > 0) fails.push(`完成0件のプレイがある (${noComplete}/100)`);

if (fails.length) {
  console.log('\n❌ バランス要調整:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('\n✅ バランスOK: 賢く遊べば会社が育つ / 倒産は稀 / 必ず完成する');
}
