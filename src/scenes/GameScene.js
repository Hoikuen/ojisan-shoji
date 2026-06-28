import Phaser from 'phaser';
import { GAME_W, GAME_H, TUNING } from '../data/tuning.js';
import { GARMENTS, TECHS } from '../data/content.js';
import {
  createState, dominantJob, salaryOf, totalSalary, expandCost, expandMaxed,
  generateCandidates, canHire, hire,
  canStartProject, startProject, assign, unassign, fireEmployee,
  idleEmployees, assignedTo, canExpand, expand,
  advanceWeek, rankOf,
  canBuyTech, buyTech, getTechMult,
  storeCost, canOpenStore, openStore, storeWeeklyIncome,
} from '../game/core.js';
import { saveGame, loadGame, clearSave } from '../game/save.js';
import { Sfx } from '../game/sfx.js';
import { makeButton, makeProgressBar, makePanel, COLORS, FONT } from '../ui/widgets.js';

// ── 画面レイアウト ──────────────────────────────────────────
// HUD バー（資金・週・季節） → アクションバー（ボタン横一列） → 左:オフィス / 右:社員+開発
const HUD_H     = 44;
const ACT_H     = 44;
const CONTENT_Y = HUD_H + ACT_H; // 88
const OFFICE = { x: 0,   y: CONTENT_Y, w: 676, h: 512 };
const ROOM   = { x: 16,  y: CONTENT_Y + 48, w: 644, h: 440 };
const EMP    = { x: 680, y: CONTENT_Y,       w: 280, h: 268 };
const PROJ   = { x: 680, y: CONTENT_Y + 272, w: 280, h: 240 };

// 社員の席座標（最大8席、4列×2行）。背景画像の机・椅子位置と1:1対応。
// スプライトは 96×144px（origin 0.5,1）なので行間は 170px 以上必要。
const SEATS = [
  { x: ROOM.x +  80, y: ROOM.y + 165 },
  { x: ROOM.x + 240, y: ROOM.y + 165 },
  { x: ROOM.x + 400, y: ROOM.y + 165 },
  { x: ROOM.x + 560, y: ROOM.y + 165 },
  { x: ROOM.x +  80, y: ROOM.y + 340 },
  { x: ROOM.x + 240, y: ROOM.y + 340 },
  { x: ROOM.x + 400, y: ROOM.y + 340 },
  { x: ROOM.x + 560, y: ROOM.y + 340 },
];

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.state = loadGame() || createState();
    this.walkers = new Map();
    this.modal = null;

    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.bgLayer     = this.add.container(0, 0); // 背景奥（机の後ろ・床・壁）
    this.walkerLayer = this.add.container(0, 0); // キャラスプライト
    this.frontLayer  = this.add.container(0, 0); // 背景手前（机の前面・椅子前脚）
    this.uiLayer     = this.add.container(0, 0); // UI

    this.buildStaticFrame();
    this.buildHud();
    this.setupInput();

    for (const e of this.state.employees) this.addWalker(e);

    this.refresh();
    if (this.state.gameOver) this.showGameOver();
  }

  setupInput() {
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.modal && !this.state.gameOver) {
        if (!Sfx.isMuted()) Sfx.startBgm();
        this.onNextWeek();
      }
    });
    this.input.on('pointerdown', () => {
      if (!Sfx.isMuted()) Sfx.startBgm();
    });
  }

  save() { saveGame(this.state); }

  // ── 静的な枠 ──────────────────────────────────────────────
  buildStaticFrame() {
    // HUD 背景
    this.bgLayer.add(makePanel(this, 0, 0, GAME_W, HUD_H, 0x2a2c44));
    // アクションバー背景
    this.bgLayer.add(makePanel(this, 0, HUD_H, GAME_W, ACT_H, 0x22243a));

    // オフィス
    this.bgLayer.add(makePanel(this, OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h, COLORS.office));
    const floor = this.add.rectangle(ROOM.x, ROOM.y, ROOM.w, ROOM.h, COLORS.officeFloor).setOrigin(0, 0);
    this.bgLayer.add(floor);
    this.bgLayer.add(this.add.text(OFFICE.x + 8, OFFICE.y + 8, '🏢 オフィス', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.sub,
    }));

    // 背景【奥レイヤー】: 床・壁・窓・机の天面・モニター（キャラの後ろ）
    const backKey = this.textures.exists('bg_office_back') ? 'bg_office_back' : 'bg_office';
    if (this.textures.exists(backKey)) {
      const bg = this.add.image(ROOM.x, ROOM.y, backKey).setOrigin(0, 0);
      bg.setDisplaySize(ROOM.w, ROOM.h);
      this.bgLayer.add(bg);
    } else {
      this.bgLayer.add(this.add.rectangle(ROOM.x, ROOM.y, ROOM.w, ROOM.h, COLORS.officeFloor).setOrigin(0, 0));
    }

    // 背景【手前レイヤー】: 机の前面・椅子前脚（透過PNG、キャラの前）
    if (this.textures.exists('bg_office_front')) {
      const front = this.add.image(ROOM.x, ROOM.y, 'bg_office_front').setOrigin(0, 0);
      front.setDisplaySize(ROOM.w, ROOM.h);
      this.frontLayer.add(front);
    }

    // 右パネル（社員・開発）
    this.bgLayer.add(makePanel(this, EMP.x, EMP.y, EMP.w, EMP.h, COLORS.panel));
    this.bgLayer.add(makePanel(this, PROJ.x, PROJ.y, PROJ.w, PROJ.h, COLORS.panel));
  }

  // ── HUD ────────────────────────────────────────────────────
  buildHud() {
    const y = HUD_H / 2;
    const mk = (x, size, color) => this.add.text(x, y, '', {
      fontFamily: FONT, fontSize: size, color,
    }).setOrigin(0, 0.5);

    this.add.text(12, y, 'おじさん商事', { fontFamily: FONT, fontSize: '17px', color: COLORS.gold })
      .setOrigin(0, 0.5);
    this.hudRank   = mk(160, '14px', COLORS.gold);
    this.hudMoney  = mk(330, '18px', COLORS.text);
    this.hudWeek   = mk(460, '14px', COLORS.text);
    this.hudSeason = mk(534, '14px', COLORS.text);
    this.hudSalary = mk(614, '12px', COLORS.sub);

    const muteBtn = makeButton(this, GAME_W - 134, 8, 50, 28, Sfx.isMuted() ? '🔇' : '🔊', () => {
      const m = Sfx.toggleMute();
      muteBtn.labelText.setText(m ? '🔇' : '🔊');
    }, { color: 0x44475a, hover: 0x5a5e78, fontSize: '15px' });

    makeButton(this, GAME_W - 76, 8, 68, 28, 'やり直す', () => this.confirmReset(), {
      color: 0x6a4a5a, hover: 0x8a5f72, fontSize: '12px',
    });

    // オフィス内の常設テキスト（オフィスヘッダー行）
    this.trendText = this.add.text(OFFICE.x + 110, OFFICE.y + 10, '', {
      fontFamily: FONT, fontSize: '13px', color: COLORS.gold,
    });
    this.eventText = this.add.text(OFFICE.x + 110, OFFICE.y + 27, '', {
      fontFamily: FONT, fontSize: '12px', color: '#ff9f43',
    });
    this.goalText = this.add.text(OFFICE.x + 8, OFFICE.y + OFFICE.h - 18, '', {
      fontFamily: FONT, fontSize: '12px', color: COLORS.sub,
    });
  }

  updateHud() {
    const s = this.state;
    const rank = rankOf(s.totalRevenue);
    this.hudRank.setText(`🏅${rank.title}`);
    this.hudMoney.setText(`💰 ¥${s.money.toLocaleString()}`);
    this.hudMoney.setColor(s.money < 0 ? COLORS.bad : COLORS.text);
    this.hudWeek.setText(`第 ${s.week} 週`);
    this.hudSeason.setText(`季節: ${s.season}`);
    this.hudSalary.setText(`給料 ¥${totalSalary(s).toLocaleString()}/週`);

    const trendName = (GARMENTS.find((g) => g.id === s.trendGarment) || {}).name || '';
    this.trendText.setText(`🔥 今季の流行: ${trendName}`);

    if (s.pendingEvent) {
      this.eventText.setText(`📣 ${s.pendingEvent.text}  →  ${s.pendingEvent.desc}`);
    } else {
      this.eventText.setText('');
    }

    if (s.totalRevenue === 0) {
      const assignedCount = s.employees.filter((e) => e.projectId != null).length;
      let hint;
      if (s.projects.length === 0) hint = '👉 ①「＋ 新コレクション開発」で作る服を選ぼう';
      else if (assignedCount === 0) hint = '👉 ② 開発カードの「＋社員追加」で社員を割り当てよう';
      else hint = '👉 ③「次の週へ」(スペースキー) で開発を進めよう！';
      this.goalText.setText(hint);
      this.goalText.setColor(COLORS.good);
    } else if (rank.next) {
      this.goalText.setColor(COLORS.sub);
      this.goalText.setText(
        `📈 累計売上 ¥${s.totalRevenue.toLocaleString()}  ／  次は『${rank.next.title}』まで あと ¥${(rank.next.min - s.totalRevenue).toLocaleString()}`);
    } else {
      this.goalText.setColor(COLORS.sub);
      this.goalText.setText(`📈 累計売上 ¥${s.totalRevenue.toLocaleString()}  ／  ★最高ランク達成！`);
    }
  }

  // ── 全パネル再描画 ────────────────────────────────────────
  refresh() {
    this.updateHud();
    this.uiLayer.removeAll(true);
    this.buildEmployeePanel();
    this.buildActionBar();
    this.buildProjectPanel();
    this.save();
  }

  // ── 右上：社員一覧 ────────────────────────────────────────
  buildEmployeePanel() {
    const s = this.state;
    this.uiLayer.add(this.add.text(EMP.x + 12, EMP.y + 10,
      `社員  ${s.employees.length}/${s.maxEmployees}`, {
        fontFamily: FONT, fontSize: '16px', color: COLORS.text,
      }));

    const rowH = 56;
    let ry = EMP.y + 40;
    for (const e of s.employees) {
      if (ry + rowH > EMP.y + EMP.h - 4) break; // パネル外に出ない
      this.buildEmployeeRow(e, EMP.x + 8, ry, EMP.w - 16, rowH - 4);
      ry += rowH;
    }
    if (s.employees.length === 0) {
      this.uiLayer.add(this.add.text(EMP.x + 12, ry, '「採用」でおじさんを雇おう', {
        fontFamily: FONT, fontSize: '13px', color: COLORS.sub,
      }));
    }
  }

  buildEmployeeRow(e, x, y, w, h) {
    const job = dominantJob(e);
    const row = this.add.rectangle(x, y, w, h, 0x363a59).setOrigin(0, 0).setStrokeStyle(1, COLORS.panelEdge);
    row.setInteractive({ useHandCursor: true });
    row.on('pointerover', () => row.setFillStyle(0x40456a));
    row.on('pointerout', () => row.setFillStyle(0x363a59));
    row.on('pointerdown', () => this.openEmployeeDetail(e.id));
    this.uiLayer.add(row);

    this.uiLayer.add(this.add.rectangle(x + 6, y + 6, 12, 12, job.color).setOrigin(0, 0));
    this.uiLayer.add(this.add.text(x + 24, y + 4, `${e.name}  Lv${e.level}`, {
      fontFamily: FONT, fontSize: '13px', color: COLORS.text,
    }));
    this.uiLayer.add(this.add.text(x + 24, y + 22, `企${e.plan} デ${e.design} 営${e.sales}`, {
      fontFamily: FONT, fontSize: '12px', color: COLORS.sub,
    }));
    if (e.specialty) {
      const sg = GARMENTS.find((g) => g.id === e.specialty);
      if (sg) {
        this.uiLayer.add(this.add.text(x + 24, y + 37, `✨${sg.name}`, {
          fontFamily: FONT, fontSize: '10px', color: COLORS.gold,
        }));
      }
    }

    const assignedProj = e.projectId != null
      ? this.state.projects.find((p) => p.id === e.projectId) : null;
    const statusText = assignedProj ? `▶ ${assignedProj.def.name}` : '手すき';
    this.uiLayer.add(this.add.text(x + w - 76, y + 4, statusText, {
      fontFamily: FONT, fontSize: '11px', color: assignedProj ? COLORS.good : '#c9b27a',
    }));
    this.uiLayer.add(this.add.text(x + w - 76, y + 20, `¥${salaryOf(e)}/週`, {
      fontFamily: FONT, fontSize: '11px', color: COLORS.sub,
    }));

    const btnX = x + w - 56;
    if (assignedProj) {
      this.uiLayer.add(makeButton(this, btnX, y + h / 2 - 13, 50, 26, '外す', () => {
        unassign(this.state, e.id);
        this.refresh();
      }, { color: 0x8a5a6a, hover: 0xb27486, fontSize: '12px' }));
    } else {
      const hasProject = this.state.projects.length > 0;
      this.uiLayer.add(makeButton(this, btnX, y + h / 2 - 13, 50, 26, '割当', () => {
        this.openAssignToProjectModal(e.id);
      }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '12px', disabled: !hasProject }));
    }
  }

  // ── アクションバー（HUD直下・横一列） ─────────────────────
  buildActionBar() {
    const s = this.state;
    const ay = HUD_H + 5;
    const bh = ACT_H - 10;

    // ▶ 次の週へ
    this.uiLayer.add(makeButton(this, 8, ay, 162, bh, '▶ 次の週へ', () => this.onNextWeek(), {
      color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '16px',
    }));

    // 採用
    this.uiLayer.add(makeButton(this, 178, ay, 96, bh, '採用', () => this.openHireModal(), {
      disabled: s.employees.length >= s.maxEmployees, fontSize: '13px',
    }));

    // 拡張
    const exMax = expandMaxed(s);
    this.uiLayer.add(makeButton(this, 282, ay, 130, bh,
      exMax ? '拡張(最大)' : `拡張 ¥${expandCost(s).toLocaleString()}`,
      () => this.onExpand(), {
        disabled: !canExpand(s), color: 0x9a7b3a, hover: 0xc29a4a, fontSize: '12px',
      }));

    // 🔬 研究
    const doneCount = s.techs.length;
    this.uiLayer.add(makeButton(this, 420, ay, 118, bh,
      `🔬研究(${doneCount}/${TECHS.length})`,
      () => this.openResearchModal(), {
        color: 0x5a3a9a, hover: 0x7a50cc, fontSize: '12px',
      }));

    // 🏪 店舗
    const maxStore = (s.stores || 0) >= TUNING.storeMaxCount;
    this.uiLayer.add(makeButton(this, 546, ay, 118, bh,
      maxStore ? `🏪店舗(最大)` : `🏪店舗 ¥${storeCost(s).toLocaleString()}`,
      () => this.openStoreModal(), {
        color: 0x3a7a6a, hover: 0x4eaa8e, fontSize: '12px',
      }));

    // ステータステキスト（ボタン右）
    const shopStr = (s.stores || 0) > 0
      ? `🏪 ${s.stores}軒 +¥${storeWeeklyIncome(s).toLocaleString()}/週` : '';
    const empStr = s.employees.length >= s.maxEmployees ? '社員枠いっぱい' : '';
    let stY = ay + 4;
    if (shopStr) {
      this.uiLayer.add(this.add.text(672, stY, shopStr, {
        fontFamily: FONT, fontSize: '11px', color: COLORS.good,
      }));
      stY += 14;
    }
    if (empStr) {
      this.uiLayer.add(this.add.text(672, stY, empStr, {
        fontFamily: FONT, fontSize: '11px', color: COLORS.sub,
      }));
    }
  }

  // ── 右下：開発カード ──────────────────────────────────────
  buildProjectPanel() {
    const s = this.state;
    this.uiLayer.add(this.add.text(PROJ.x + 10, PROJ.y + 8, '開発中', {
      fontFamily: FONT, fontSize: '14px', color: COLORS.sub,
    }));

    const cardW = PROJ.w - 16;
    const cardH = 68;
    let cy = PROJ.y + 28;
    for (let slot = 0; slot < s.maxProjects; slot++) {
      const p = s.projects[slot];
      if (p) this.buildProjectCard(p, PROJ.x + 8, cy, cardW, cardH);
      else this.buildEmptySlot(PROJ.x + 8, cy, cardW, cardH);
      cy += cardH + 8;
    }
  }

  buildProjectCard(p, x, y, w, h) {
    const s = this.state;
    const def = p.def;
    const onTrend = def.id === s.trendGarment;
    const hot = def.season === s.season;
    this.uiLayer.add(this.add.rectangle(x, y, w, h, 0x33365a).setOrigin(0, 0)
      .setStrokeStyle(2, onTrend ? 0xffd35e : def.color));

    // タイトル行
    const badge = onTrend ? ' 🔥流行' : (hot ? ' 🔥旬' : '');
    this.uiLayer.add(this.add.text(x + 8, y + 5,
      `${def.name} [${def.season}]${badge}`, {
        fontFamily: FONT, fontSize: '13px', color: (onTrend || hot) ? COLORS.gold : COLORS.text,
      }));

    // 社員追加ボタン
    const idle = idleEmployees(s).length;
    this.uiLayer.add(makeButton(this, x + w - 82, y + 4, 74, 20, '＋社員追加', () => {
      this.openAssignModal(p.id);
    }, { fontSize: '11px', disabled: idle === 0, color: COLORS.btnAccent, hover: COLORS.btnAccentHover }));

    // 進捗バー
    const ratio = p.progress / def.workNeeded;
    this.uiLayer.add(makeProgressBar(this, x + 8, y + 30, w - 16, 12, ratio, def.color));
    this.uiLayer.add(this.add.text(x + w / 2, y + 30 + 6,
      `${Math.floor(p.progress)} / ${def.workNeeded}`, {
        fontFamily: FONT, fontSize: '10px', color: '#ffffff', stroke: '#10111c', strokeThickness: 2,
      }).setOrigin(0.5));

    // 担当＋完成見込み＋締切
    const team = assignedTo(s, p.id);
    const hasSpecialist = team.some((e) => e.specialty === def.id);
    let line;
    if (team.length === 0) {
      line = '担当なし — 割り当てよう';
    } else {
      const weekly = team.reduce((a, e) => a + e.design * TUNING.devDesign + e.plan * TUNING.devPlan, 0);
      const eta = weekly > 0 ? Math.max(1, Math.ceil((def.workNeeded - p.progress) / weekly)) : '—';
      const weekInSeason = ((s.week - 1) % 4);
      const weeksLeftInSeason = 3 - weekInSeason;
      const deadlineHint = (hot && typeof eta === 'number' && eta > weeksLeftInSeason)
        ? `  ⏰旬あと${weeksLeftInSeason}週` : '';
      const specialistHint = hasSpecialist ? ' ✨専門家' : '';
      line = `担当 ${team.length}人 ・ あと約 ${eta} 週${specialistHint}${deadlineHint}`;
    }
    const lineColor = team.length === 0 ? COLORS.bad
      : (hot && line.includes('⏰') ? '#ff9f43' : COLORS.good);
    this.uiLayer.add(this.add.text(x + 8, y + h - 14, line, {
      fontFamily: FONT, fontSize: '11px', color: lineColor,
    }));
  }

  buildEmptySlot(x, y, w, h) {
    const card = this.add.rectangle(x, y, w, h, 0x282a40).setOrigin(0, 0).setStrokeStyle(2, 0x3a3d5c);
    this.uiLayer.add(card);
    this.uiLayer.add(makeButton(this, x + w / 2 - 84, y + h / 2 - 14, 168, 28, '＋ 新コレクション開発', () => {
      this.openNewCollectionModal();
    }, { fontSize: '13px', color: COLORS.btn, hover: COLORS.btnHover }));
  }

  // ── 週送り ────────────────────────────────────────────────
  onNextWeek() {
    if (this.modal || this.state.gameOver) return;
    Sfx.week();
    const events = advanceWeek(this.state, Math.random);
    this.refresh();
    if (this.state.gameOver) {
      this.showGameOver();
      return;
    }
    this.playEvents(events);
  }

  onExpand() {
    if (expand(this.state)) {
      Sfx.expand();
      this.popOffice('🏢 事業拡張！', COLORS.gold);
      this.refresh();
    }
  }

  confirmReset() {
    this.showModal('最初からやり直す？', (layer, r) => {
      layer.add(this.add.text(r.px + 20, r.py + 80,
        'いまの会社のデータは消えて、最初からになります。', {
          fontFamily: FONT, fontSize: '15px', color: COLORS.text,
        }));
      layer.add(makeButton(this, r.px + 20, r.py + 140, 220, 46, 'やり直す（消す）', () => {
        clearSave();
        this.closeModal();
        this.scene.restart();
      }, { color: 0x9a4a5a, hover: 0xc26072, fontSize: '16px' }));
    });
  }

  showGameOver() {
    this.closeModal();
    Sfx.bankrupt();
    Sfx.stopBgm();
    const s = this.state;
    const rank = rankOf(s.totalRevenue);
    const layer = this.add.container(0, 0).setDepth(3000);
    layer.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.82).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(GAME_W / 2, 170, '💀 資金ショート… 倒産', {
      fontFamily: FONT, fontSize: '40px', color: COLORS.bad, stroke: '#10111c', strokeThickness: 6,
    }).setOrigin(0.5));
    layer.add(this.add.text(GAME_W / 2, 250,
      `第 ${s.week} 週まで会社を続けた\n累計売上 ¥${s.totalRevenue.toLocaleString()}  ／  格付け『${rank.title}』`, {
        fontFamily: FONT, fontSize: '18px', color: COLORS.text, align: 'center', lineSpacing: 8,
      }).setOrigin(0.5));
    layer.add(makeButton(this, GAME_W / 2 - 110, 340, 220, 52, 'もう一度はじめる', () => {
      clearSave();
      this.scene.restart();
    }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '18px' }));
    this.modal = layer;
  }

  // ── モーダル ──────────────────────────────────────────────
  showModal(titleText, build) {
    this.closeModal();
    const layer = this.add.container(0, 0).setDepth(1000);
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
    const pw = 600, ph = 420;
    const px = (GAME_W - pw) / 2, py = (GAME_H - ph) / 2;
    const panel = makePanel(this, px, py, pw, ph, 0x30334e);
    const title = this.add.text(px + 20, py + 16, titleText, {
      fontFamily: FONT, fontSize: '20px', color: COLORS.text,
    });
    layer.add([dim, panel, title]);
    const close = makeButton(this, px + pw - 92, py + ph - 44, 76, 30, '閉じる', () => this.closeModal(), {
      color: 0x5a5d77, hover: 0x787ca0, fontSize: '14px',
    });
    layer.add(close);
    this.modal = layer;
    build(layer, { px, py, pw, ph });
  }

  closeModal() {
    if (this.modal) { this.modal.destroy(true); this.modal = null; }
  }

  openHireModal() {
    const cands = generateCandidates(this.state, Math.random);
    this.showModal('採用 — おじさんを面接', (layer, r) => {
      let cy = r.py + 52;
      for (const c of cands) {
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 96;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0).setStrokeStyle(1, COLORS.panelEdge));
        layer.add(this.add.text(cardX + 14, cy + 10, c.name, { fontFamily: FONT, fontSize: '17px', color: COLORS.text }));
        if (c.specialty) {
          const sg = GARMENTS.find((g) => g.id === c.specialty);
          if (sg) {
            layer.add(this.add.text(cardX + cardW - 130, cy + 12, `✨得意: ${sg.name}`, {
              fontFamily: FONT, fontSize: '12px', color: COLORS.gold,
            }));
          }
        }
        layer.add(this.add.text(cardX + 14, cy + 38, `企画 ${c.plan}   デザイン ${c.design}   営業 ${c.sales}`, {
          fontFamily: FONT, fontSize: '14px', color: COLORS.sub,
        }));
        layer.add(this.add.text(cardX + 14, cy + 62, `採用費 ¥${c.fee}    給料 ¥${40 + (c.plan + c.design + c.sales) * 10}/週`, {
          fontFamily: FONT, fontSize: '13px', color: '#c9b27a',
        }));
        const ok = canHire(this.state, c);
        layer.add(makeButton(this, cardX + cardW - 110, cy + cardH / 2 - 18, 96, 36,
          ok ? '採用する' : (this.state.money < c.fee ? 'お金不足' : '枠なし'), () => {
            if (hire(this.state, c)) {
              const e = this.state.employees[this.state.employees.length - 1];
              this.addWalker(e);
              Sfx.hire();
              this.closeModal();
              this.refresh();
              this.popOffice(`${e.name} 入社！`, COLORS.good);
            }
          }, { disabled: !ok, color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '15px' }));
        cy += cardH + 10;
      }
    });
  }

  openNewCollectionModal() {
    if (!canStartProject(this.state)) return;
    this.showModal('新コレクション — 何を作る？', (layer, r) => {
      const cols = 2;
      const cardW = (r.pw - 40 - 16) / cols, cardH = 120;
      GARMENTS.forEach((g, i) => {
        const col = i % cols, rowi = Math.floor(i / cols);
        const cardX = r.px + 20 + col * (cardW + 16);
        const cardY = r.py + 56 + rowi * (cardH + 14);
        const hot = g.season === this.state.season;
        const isTrend = g.id === this.state.trendGarment;
        const locked = this.state.totalRevenue < g.unlock;
        layer.add(this.add.rectangle(cardX, cardY, cardW, cardH, locked ? 0x2a2c40 : 0x3a3d5e).setOrigin(0, 0)
          .setStrokeStyle(isTrend ? 3 : 2, locked ? 0x44475a : (isTrend ? 0xffd35e : g.color)));
        layer.add(this.add.text(cardX + 12, cardY + 10, `${locked ? '🔒 ' : ''}${g.name}${isTrend ? ' 🔥流行' : ''}`, {
          fontFamily: FONT, fontSize: '17px', color: locked ? '#7c7f95' : (isTrend ? COLORS.gold : COLORS.text) }));
        layer.add(this.add.text(cardX + 12, cardY + 38, `旬の季節: ${g.season}${hot ? '  🔥今が旬!' : ''}`, {
          fontFamily: FONT, fontSize: '13px', color: locked ? '#6a6d82' : (hot ? COLORS.gold : COLORS.sub),
        }));
        layer.add(this.add.text(cardX + 12, cardY + 58, `単価 ¥${g.basePrice}   開発量 ${g.workNeeded}`, {
          fontFamily: FONT, fontSize: '13px', color: locked ? '#6a6d82' : COLORS.sub,
        }));
        layer.add(makeButton(this, cardX + 12, cardY + cardH - 34, cardW - 24, 26,
          locked ? `累計売上 ¥${g.unlock.toLocaleString()} で解放` : '開発する', () => {
            startProject(this.state, g.id);
            this.closeModal();
            this.refresh();
          }, { fontSize: locked ? '12px' : '14px', disabled: locked }));
      });
    });
  }

  openAssignModal(projectId) {
    const idle = idleEmployees(this.state);
    if (idle.length === 0) return;
    const proj = this.state.projects.find((p) => p.id === projectId);
    this.showModal(`担当を追加 — ${proj ? proj.def.name : ''}`, (layer, r) => {
      let cy = r.py + 56;
      for (const e of idle) {
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 56;
        const isSpec = proj && e.specialty === proj.defId;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0)
          .setStrokeStyle(isSpec ? 2 : 1, isSpec ? 0xffd35e : COLORS.panelEdge));
        layer.add(this.add.text(cardX + 12, cy + 8, `${e.name}  Lv${e.level}${isSpec ? '  ✨専門家' : ''}`, {
          fontFamily: FONT, fontSize: '15px', color: isSpec ? COLORS.gold : COLORS.text }));
        layer.add(this.add.text(cardX + 12, cy + 30, `企${e.plan} デ${e.design} 営${e.sales}`, {
          fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
        layer.add(makeButton(this, cardX + cardW - 92, cy + cardH / 2 - 15, 80, 30, '追加', () => {
          assign(this.state, e.id, projectId);
          this.refresh();
          this.openAssignModal(projectId);
        }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '14px' }));
        cy += cardH + 8;
      }
    });
  }

  openAssignToProjectModal(empId) {
    if (this.state.projects.length === 0) return;
    const emp = this.state.employees.find((x) => x.id === empId);
    this.showModal('どのコレクションに割り当てる？', (layer, r) => {
      let cy = r.py + 56;
      for (const p of this.state.projects) {
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 56;
        const team = assignedTo(this.state, p.id).length;
        const isSpec = emp && emp.specialty === p.defId;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0)
          .setStrokeStyle(2, isSpec ? 0xffd35e : p.def.color));
        layer.add(this.add.text(cardX + 12, cy + 8, `${p.def.name} [${p.def.season}]${isSpec ? '  ✨得意' : ''}`, {
          fontFamily: FONT, fontSize: '15px', color: isSpec ? COLORS.gold : COLORS.text }));
        layer.add(this.add.text(cardX + 12, cy + 30,
          `進捗 ${Math.floor(p.progress)}/${p.def.workNeeded}   担当 ${team}人`, {
            fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
        layer.add(makeButton(this, cardX + cardW - 92, cy + cardH / 2 - 15, 80, 30, '割当', () => {
          assign(this.state, empId, p.id);
          this.closeModal();
          this.refresh();
        }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '14px' }));
        cy += cardH + 8;
      }
    });
  }

  openEmployeeDetail(empId) {
    const e = this.state.employees.find((x) => x.id === empId);
    if (!e) return;
    const job = dominantJob(e);
    this.showModal(`${e.name}（${job.label}）`, (layer, r) => {
      const x = r.px + 24;
      layer.add(this.add.text(x, r.py + 64, `Lv ${e.level}${e.founder ? '  ★社長' : ''}`, {
        fontFamily: FONT, fontSize: '17px', color: COLORS.text }));
      const need = TUNING.expPerLevel * e.level;
      layer.add(this.add.text(x, r.py + 96, `経験値 ${e.exp}/${need}`, {
        fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
      layer.add(makeProgressBar(this, x, r.py + 116, 240, 12, e.exp / need, 0x5cb874));
      layer.add(this.add.text(x, r.py + 144, `企画 ${e.plan}    デザイン ${e.design}    営業 ${e.sales}`, {
        fontFamily: FONT, fontSize: '15px', color: COLORS.text }));
      layer.add(this.add.text(x, r.py + 174, `給料 ¥${salaryOf(e)}/週`, {
        fontFamily: FONT, fontSize: '14px', color: '#c9b27a' }));
      const proj = e.projectId != null ? this.state.projects.find((p) => p.id === e.projectId) : null;
      layer.add(this.add.text(x, r.py + 198, proj ? `担当中: ${proj.def.name}` : '手すき', {
        fontFamily: FONT, fontSize: '14px', color: proj ? COLORS.good : '#c9b27a' }));
      if (e.specialty) {
        const sg = GARMENTS.find((g) => g.id === e.specialty);
        layer.add(this.add.text(x, r.py + 222, `✨ 得意: ${sg ? sg.name : e.specialty}`, {
          fontFamily: FONT, fontSize: '13px', color: COLORS.gold }));
      }
      layer.add(makeButton(this, x, r.py + 254, 200, 42,
        e.founder ? '社長は解雇できない' : '解雇する', () => {
          if (fireEmployee(this.state, e.id)) {
            this.removeWalker(e.id);
            this.closeModal();
            this.refresh();
          }
        }, { disabled: e.founder, color: 0x9a4a5a, hover: 0xc26072, fontSize: '15px' }));
    });
  }

  // ── 研究モーダル ─────────────────────────────────────────
  openResearchModal() {
    this.showModal('🔬 研究・技術開発', (layer, r) => {
      let cy = r.py + 52;
      for (const tech of TECHS) {
        const done = this.state.techs.includes(tech.id);
        const ok = !done && canBuyTech(this.state, tech.id);
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 76;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, done ? 0x2a3a2a : 0x3a3d5e)
          .setOrigin(0, 0).setStrokeStyle(2, done ? 0x5cb874 : COLORS.panelEdge));
        layer.add(this.add.text(cardX + 14, cy + 10,
          `${done ? '✅ ' : ''}${tech.name}`, {
            fontFamily: FONT, fontSize: '17px', color: done ? COLORS.good : COLORS.text }));
        layer.add(this.add.text(cardX + 14, cy + 36, tech.desc, {
          fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
        layer.add(this.add.text(cardX + 14, cy + 54,
          done ? '研究済み' : `研究費 ¥${tech.cost.toLocaleString()}`, {
            fontFamily: FONT, fontSize: '13px', color: done ? COLORS.good : '#c9b27a' }));
        if (!done) {
          layer.add(makeButton(this, cardX + cardW - 110, cy + cardH / 2 - 18, 96, 36,
            ok ? '研究する' : (this.state.money < tech.cost ? 'お金不足' : '研究済'), () => {
              if (buyTech(this.state, tech.id)) {
                Sfx.research();
                this.closeModal();
                this.refresh();
                this.popOffice(`🔬 ${tech.name} 習得！`, COLORS.good);
              }
            }, { disabled: !ok, color: 0x5a3a9a, hover: 0x7a50cc, fontSize: '15px' }));
        }
        cy += cardH + 10;
      }
    });
  }

  // ── 店舗モーダル ─────────────────────────────────────────
  openStoreModal() {
    this.showModal('🏪 店舗管理', (layer, r) => {
      const s = this.state;
      const x = r.px + 24;
      const cnt = s.stores || 0;
      const income = storeWeeklyIncome(s);
      layer.add(this.add.text(x, r.py + 64, `現在の店舗: ${cnt} 軒`, {
        fontFamily: FONT, fontSize: '20px', color: COLORS.text }));
      layer.add(this.add.text(x, r.py + 100, `週次収入: ¥${income.toLocaleString()} / 週`, {
        fontFamily: FONT, fontSize: '16px', color: income > 0 ? COLORS.good : COLORS.sub }));
      layer.add(this.add.text(x, r.py + 130,
        '店舗を開設すると毎週固定収入が入る。\n給料の支払い不安が和らぐ。', {
          fontFamily: FONT, fontSize: '13px', color: COLORS.sub, lineSpacing: 6 }));
      if (cnt >= TUNING.storeMaxCount) {
        layer.add(this.add.text(x, r.py + 190, `店舗数は最大（${TUNING.storeMaxCount}軒）です`, {
          fontFamily: FONT, fontSize: '16px', color: COLORS.gold }));
      } else {
        const cost = storeCost(s);
        const ok = canOpenStore(s);
        layer.add(this.add.text(x, r.py + 190,
          `${cnt + 1}軒目の開設費: ¥${cost.toLocaleString()}  →  毎週 +¥${TUNING.storeIncomeBase * (cnt + 1)}`, {
            fontFamily: FONT, fontSize: '14px', color: '#c9b27a' }));
        layer.add(makeButton(this, x, r.py + 240, 220, 46,
          ok ? '店舗を開設する' : 'お金が足りない', () => {
            if (openStore(s)) {
              Sfx.store();
              this.closeModal();
              this.refresh();
              this.popOffice(`🏪 新店舗オープン！\n毎週 +¥${TUNING.storeIncomeBase}`, COLORS.good);
            }
          }, { disabled: !ok, color: 0x3a7a6a, hover: 0x4eaa8e, fontSize: '16px' }));
      }
    });
  }

  removeWalker(empId) {
    const w = this.walkers.get(empId);
    if (w) { w.destroy(); this.walkers.delete(empId); }
  }

  // ── 演出 ─────────────────────────────────────────────────
  playEvents(events) {
    const sal = events.find((e) => e.type === 'salary');
    if (sal && sal.amount > 0) {
      this.popText(this.hudMoney.x + 90, HUD_H / 2, `-¥${sal.amount}`, COLORS.bad, '14px');
    }

    const shop = events.find((e) => e.type === 'storeIncome');
    if (shop) {
      this.popText(this.hudMoney.x + 90, HUD_H / 2 - 18, `+¥${shop.amount}🏪`, COLORS.good, '13px');
    }

    const ev = events.find((e) => e.type === 'event');
    if (ev) {
      Sfx.event();
      this.time.delayedCall(100, () => {
        const color = ev.event.effect === 'salesCut' || ev.event.effect === 'scorePenalty'
          ? COLORS.bad : COLORS.gold;
        this.popOffice(`${ev.event.text}\n${ev.event.desc}`, color, 22);
      });
    }

    const comps = events.filter((e) => e.type === 'complete');
    comps.forEach((c, i) => {
      const dy = (i - (comps.length - 1) / 2) * 84;
      this.time.delayedCall(i * 700, () => {
        const stars = '★'.repeat(c.stars) + '☆'.repeat(5 - c.stars);
        const flair = c.bigHit ? '💥大ヒット！\n'
          : (c.specialistCount > 0 ? '✨専門家ボーナス！\n' : (c.onTrend ? '🔥流行的中！\n' : ''));
        const color = c.bigHit ? '#ff7eb6' : COLORS.gold;
        if (c.bigHit) Sfx.bigHit(); else Sfx.complete();
        this.popOffice(`${flair}${c.garment.name} 完成!\n${stars}\n${c.units}着 +¥${c.revenue.toLocaleString()}`, color, 30, dy);
      });
    });

    const rankUp = events.find((e) => e.type === 'rankup');
    if (rankUp) {
      this.time.delayedCall(comps.length * 700 + 200, () => {
        Sfx.rankUp();
        this.popOffice(`🎉 昇格！\n『${rankUp.title}』`, COLORS.gold, 26);
      });
    }

    const unlocks = events.filter((e) => e.type === 'unlock');
    unlocks.forEach((u, i) => {
      this.time.delayedCall(comps.length * 700 + 500 + i * 500, () => {
        Sfx.unlock();
        this.popOffice(`🆕 新コレクション解放！\n『${u.garment.name}』`, COLORS.gold, 22);
      });
    });

    const lvs = events.filter((e) => e.type === 'levelup');
    lvs.forEach((lv, i) => {
      this.time.delayedCall(comps.length * 700 + i * 400, () => {
        const w = this.walkers.get(lv.empId);
        const px = w ? w.x : OFFICE.x + OFFICE.w / 2;
        const py = w ? w.y - 30 : OFFICE.y + 60;
        this.popText(px, py, `Lv${lv.level}↑`, COLORS.good, '16px');
      });
    });

    if (this.state.money < 0 && !this.state.gameOver) {
      this.popOffice('⚠ 資金がマイナス！\n服を完成させて売ろう', COLORS.bad, 18);
    }
  }

  popOffice(text, color, size = 24, dy = 0) {
    this.popText(OFFICE.x + OFFICE.w / 2, OFFICE.y + OFFICE.h / 2 + dy, text, color, `${size}px`, true);
  }

  popText(x, y, text, color, fontSize, big = false) {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT, fontSize, color, align: 'center',
      stroke: '#10111c', strokeThickness: big ? 5 : 3,
      backgroundColor: big ? 'rgba(20,18,30,0.55)' : undefined,
      padding: big ? { x: 12, y: 8 } : undefined,
    }).setOrigin(0.5).setDepth(2000);
    this.tweens.add({
      targets: t, y: y - (big ? 50 : 30), alpha: { from: 1, to: 0 },
      duration: big ? 1800 : 1100, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ── 歩くおじさん ─────────────────────────────────────────
  addWalker(e) {
    const job = dominantJob(e);
    const variant = job.id;
    const idx = this.state.employees.findIndex(emp => emp.id === e.id);
    const seat = SEATS[idx] ?? { x: ROOM.x + ROOM.w / 2, y: ROOM.y + ROOM.h / 2 };

    let sprite;
    const idleKey = `ojisan_${variant}_idle_1`;
    if (this.textures.exists(idleKey)) {
      sprite = this.add.image(0, 0, idleKey).setOrigin(0.5, 1);
    } else {
      const body = this.add.rectangle(0, 0, 24, 32, job.color).setStrokeStyle(2, 0x20223a);
      const head = this.add.circle(0, -20, 10, 0xf0c8a0).setStrokeStyle(2, 0x20223a);
      sprite = this.add.container(0, 0, [body, head]);
    }

    // 座席での上下bob（仕事してる感）
    this.tweens.add({
      targets: sprite, y: '-=4', duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const tag = this.add.text(0, 6, e.name, { fontFamily: FONT, fontSize: '11px', color: COLORS.text })
      .setOrigin(0.5, 0);
    const cont = this.add.container(seat.x, seat.y, [sprite, tag]).setDepth(10);
    cont.empId = e.id;
    this.walkerLayer.add(cont);
    this.walkers.set(e.id, cont);
  }
}
