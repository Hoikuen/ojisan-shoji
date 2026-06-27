// すべてのバランス定数を1か所に。数字で検証できる（test/sim.mjs）。
// ゲームの難易度・テンポはここをいじるだけで変わる。

export const GAME_W = 960;
export const GAME_H = 600;

export const TUNING = {
  // ── 会社の初期状態 ──
  startMoney: 3200,
  startMaxEmployees: 4,   // 最初に雇える上限
  startMaxProjects: 1,    // 同時開発できるコレクション数

  // ── 採用 ──
  candidateCount: 3,      // 採用候補の人数
  statMin: 2,             // 候補の各能力の下限
  statMax: 8,             // 候補の各能力の上限
  hireFeeBase: 200,       // 採用一時金（固定分）
  hireFeePerStat: 25,     // 能力合計1につき上乗せ

  // ── 給料（毎週発生）──
  salaryBase: 40,
  salaryPerStat: 10,       // 能力合計1につき

  // ── 週ごとの開発進捗 ──
  devDesign: 1.5,         // デザイン力1につき進捗
  devPlan: 0.8,           // 企画力1につき進捗

  // ── 完成時の評価 ──
  qualityScale: 5.0,      // 平均(企画+デザイン)貢献 × これ = 品質スコア素点
  seasonMatchBonus: 22,   // シーズン適合の加点
  seasonMissPenalty: 14,  // シーズン不適合の減点（外しても全滅はしない程度に）
  luckRange: 16,          // 運（±このスコア）

  // ── 売上 ──
  unitBase: 14,           // 基本販売数の係数
  salesBoost: 0.10,       // 平均営業力1につき販売数 +10%
  revenueFloor: 0.62,     // 売値の最低係数（スコア0でも basePrice×floor）

  // ── 成長（レベルアップ）──
  expPerWorkWeek: 12,     // 開発に従事した1週でもらえる経験値
  expPerLevel: 100,       // (level)×これ で次のレベル

  // ── 事業拡張 ──
  expandBaseCost: 1500,   // 1回目の拡張費用
  expandCostGrowth: 1.8,  // 拡張するたびに費用がこの倍率で増える

  // ── 流行（トレンド）──
  trendUnitMult: 1.45,     // 流行の服は販売数がこの倍率
  trendScoreBonus: 8,     // 流行の服は評価も少し上がる

  // ── 大ヒット（クリティカル）──
  bigHitChance: 0.10,     // 基本確率
  bigHitChancePerScore: 0.0012, // 評価1につき確率上乗せ（高評価ほど化けやすい）
  bigHitMult: 2.0,        // 大ヒット時の売上倍率

  // ── 倒産 ──
  bankruptThreshold: -3000, // この資金を下回ると倒産（ゲームオーバー）

  // ── ランダムイベント ──
  eventChance: 0.15,       // 週ごとの発生確率
  eventCooldown: 5,        // 前回から何週置くか（連続発生防止）

  // ── 社員の専門 ──
  specialtyChance: 0.35,   // 候補者が「得意な服」を持つ確率
  specialtyBonus: 16,      // 得意コレクションを担当したときのスコア加点（最大2人分）

  // ── 店舗 ──
  storeBaseCost: 2000,     // 1軒目の開設費用
  storeUpgradeMult: 1.6,   // N軒目 = storeBaseCost × mult^(N-1)
  storeMaxCount: 3,        // 最大店舗数
  storeIncomeBase: 150,    // 1軒あたりの毎週収入
};
