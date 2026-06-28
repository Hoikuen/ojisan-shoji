// ゲーム内容＝データ（リスキンの肝）。エンジンはこれを読むだけ。
// 服を増やす＝GARMENTS に1要素足すだけ。職種を変える＝JOB_TYPES をいじるだけ。

export const SEASONS = ['春', '夏', '秋', '冬'];

// ランダムイベント（数週に1回発生）。effect は core.js が解釈する。
export const EVENTS = [
  { id: 'magazine',   text: '📰 雑誌に掲載された！',      effect: 'salesBoost',   value: 0.35, desc: '次のコレクション売上 +35%' },
  { id: 'rival_fail', text: '😤 競合が失敗作を出した！',   effect: 'scorePenalty', value: 15,   desc: '次のコレクション評価 −15点' },
  { id: 'celebrity',  text: '🌟 有名人が着用！',           effect: 'bigHitBoost',  value: 0.25, desc: '次のコレクション大ヒット確率 +25%' },
  { id: 'sale',       text: '🛒 突発的な特需！',           effect: 'bonusMoney',   value: 600,  desc: 'いますぐ +¥600' },
  { id: 'material',   text: '📦 原材料費が高騰…',          effect: 'salesCut',     value: 0.25, desc: '次のコレクション売上 −25%' },
  { id: 'sns',        text: '📱 SNSで爆バズり！',          effect: 'salesBoost',   value: 0.55, desc: '次のコレクション売上 +55%' },
  { id: 'award',      text: '🏆 デザイン賞を受賞！',       effect: 'bigHitBoost',  value: 0.35, desc: '次のコレクション大ヒット確率 +35%' },
  { id: 'subsidy',    text: '💴 国の補助金が下りた！',     effect: 'bonusMoney',   value: 900,  desc: 'いますぐ +¥900' },
  { id: 'quality',    text: '✂️ 職人が手を抜いた…',        effect: 'scorePenalty', value: 20,   desc: '次のコレクション評価 −20点' },
  { id: 'recall',     text: '😱 素材に不良品が混入…',      effect: 'salesCut',     value: 0.40, desc: '次のコレクション売上 −40%' },
];

// ライバル会社名プール
export const RIVAL_NAMES = ['グローバル商事', 'スタイル株式会社', 'ファッション大手', 'トレンド工業', 'モード商会'];

// 研究・技術開発（一度購入するとパッシブ効果が永続）。
export const TECHS = [
  { id: 'sewing2',  name: '縫製技術 Lv2', desc: 'コレクションの品質スコア +20%', cost: 2000, effect: 'qualityMult', value: 1.20 },
  { id: 'routes',   name: '販路拡大',     desc: '販売数 +30%',                  cost: 3000, effect: 'unitMult',    value: 1.30 },
  { id: 'training', name: '人材育成制度', desc: '経験値獲得量 +50%',             cost: 2500, effect: 'expMult',     value: 1.50 },
];

// 職種3つ。おじさんは plan/design/sales の3能力を持ち、dominant がその人の職種。
export const JOB_TYPES = [
  { id: 'plan',   key: 'plan',   label: '企画',   short: '企', color: 0x4f8ed6 },
  { id: 'design', key: 'design', label: 'デザイン', short: 'デ', color: 0x5cb874 },
  { id: 'sales',  key: 'sales',  label: '営業',   short: '営', color: 0xe0944a },
];

// 服（コレクション）の定義。season は「最も売れる季節」。
// unlock は「累計売上がこの額に達すると開発できるようになる」（=会社の成長で品揃えが増える）。
export const GARMENTS = [
  { id: 'haramaki', name: '腹巻き',        season: '冬', basePrice: 60,  workNeeded: 80,  color: 0xcc5544, unlock: 0 },
  { id: 'polo',     name: 'ポロシャツ',     season: '夏', basePrice: 80,  workNeeded: 110, color: 0x4488cc, unlock: 0 },
  { id: 'chan',     name: 'ちゃんちゃんこ', season: '秋', basePrice: 110, workNeeded: 140, color: 0x9c6b3b, unlock: 4000 },
  { id: 'suit',     name: '勝負スーツ',     season: '春', basePrice: 150, workNeeded: 190, color: 0x3a3a55, unlock: 12000 },
];

// おじさんの名前プール（姓＋名で生成）。
export const LAST_NAMES  = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '斎藤'];
export const FIRST_NAMES = ['カズオ', 'タケシ', 'ヒロシ', 'マサル', 'ススム', 'ノボル', 'シゲル', 'ツトム', 'イサオ', 'ミノル', 'タダシ', 'キヨシ'];

// 会社の格付け（累計売上で昇格）。会社が育つ実感＝目標になる。
export const RANKS = [
  { min: 0,      title: '露店のおじさん' },
  { min: 4000,   title: '町の仕立て屋' },
  { min: 12000,  title: 'おじさんブティック' },
  { min: 30000,  title: 'アパレルメーカー' },
  { min: 70000,  title: '人気ブランド' },
  { min: 150000, title: 'おじさんコレクション' },
  { min: 300000, title: '世界のOJISAN' },
];
