import Phaser from 'phaser';
import { GAME_W, GAME_H, TUNING } from '../data/tuning.js';
import { GARMENTS } from '../data/content.js';
import {
  createState, dominantJob, salaryOf, totalSalary, expandCost, expandMaxed,
  generateCandidates, canHire, hire,
  canStartProject, startProject, assign, unassign, fireEmployee,
  idleEmployees, assignedTo, canExpand, expand,
  advanceWeek, rankOf,
} from '../game/core.js';
import { saveGame, loadGame, clearSave } from '../game/save.js';
import { Sfx } from '../game/sfx.js';
import { makeButton, makeProgressBar, makePanel, COLORS, FONT } from '../ui/widgets.js';

// ── 画面レイアウト（左：オフィス＋操作、右：社員一覧）──
const HUD_H = 50;
const OFFICE = { x: 16, y: 58, w: 580, h: 300 };
const BOTTOM = { x: 16, y: 366, w: 580, h: 218 };
const EMP = { x: 608, y: 58, w: 336, h: 526 };
// オフィス内でおじさんが歩ける範囲（下の目標テキストに重ならない高さに）
const ROOM = { x: 32, y: 96, w: 548, h: 224 };

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    // セーブがあれば再開、なければ新規
    this.state = loadGame() || createState();
    this.walkers = new Map(); // empId -> container
    this.modal = null;

    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.bgLayer = this.add.container(0, 0);     // 動かない枠・床
    this.walkerLayer = this.add.container(0, 0); // 歩くおじさん（refreshで消さない）
    this.uiLayer = this.add.container(0, 0);     // 毎回作り直すパネル中身

    this.buildStaticFrame();
    this.buildHud();
    this.setupInput();

    // 既存社員のおじさんをオフィスに出す
    for (const e of this.state.employees) this.addWalker(e);

    this.refresh();
    if (this.state.gameOver) this.showGameOver();
  }

  setupInput() {
    // スペースキーで「次の週へ」
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.modal && !this.state.gameOver) this.onNextWeek();
    });
  }

  save() {
    saveGame(this.state);
  }

  // ── 静的な枠 ──────────────────────────────────────────────
  buildStaticFrame() {
    // HUDバー
    this.bgLayer.add(makePanel(this, 0, 0, GAME_W, HUD_H, 0x2a2c44));

    // オフィス（床＋机の飾り）
    this.bgLayer.add(makePanel(this, OFFICE.x, OFFICE.y, OFFICE.w, OFFICE.h, COLORS.office));
    const floor = this.add.rectangle(OFFICE.x + 10, OFFICE.y + 34, OFFICE.w - 20, OFFICE.h - 44, COLORS.officeFloor)
      .setOrigin(0, 0);
    this.bgLayer.add(floor);
    this.bgLayer.add(this.add.text(OFFICE.x + 12, OFFICE.y + 8, '🏢 オフィス', {
      fontFamily: FONT, fontSize: '15px', color: COLORS.sub,
    }));
    // 机（飾り）
    const deskPos = [[90, 150], [250, 150], [410, 150], [90, 270], [250, 270], [410, 270]];
    for (const [dx, dy] of deskPos) {
      this.bgLayer.add(this.add.rectangle(OFFICE.x + dx, OFFICE.y + dy, 64, 30, COLORS.desk)
        .setStrokeStyle(2, 0x3c3026));
    }

    // 右：社員パネル枠
    this.bgLayer.add(makePanel(this, EMP.x, EMP.y, EMP.w, EMP.h, COLORS.panel));
    // 下：操作＋開発パネル枠
    this.bgLayer.add(makePanel(this, BOTTOM.x, BOTTOM.y, BOTTOM.w, BOTTOM.h, COLORS.panel));
  }

  // ── HUD（数値は refresh で更新）──────────────────────────
  buildHud() {
    const y = HUD_H / 2;
    const mk = (x, size, color) => this.add.text(x, y, '', {
      fontFamily: FONT, fontSize: size, color,
    }).setOrigin(0, 0.5);

    this.add.text(16, y, 'おじさん商事', { fontFamily: FONT, fontSize: '18px', color: COLORS.gold })
      .setOrigin(0, 0.5);
    this.hudRank = mk(168, '15px', COLORS.gold);
    this.hudMoney = mk(348, '19px', COLORS.text);
    this.hudWeek = mk(478, '15px', COLORS.text);
    this.hudSeason = mk(556, '15px', COLORS.text);
    this.hudSalary = mk(648, '13px', COLORS.sub);

    // ミュート切替（右上）
    const muteBtn = makeButton(this, 812, 11, 50, 28, Sfx.isMuted() ? '🔇' : '🔊', () => {
      const m = Sfx.toggleMute();
      muteBtn.labelText.setText(m ? '🔇' : '🔊');
    }, { color: 0x44475a, hover: 0x5a5e78, fontSize: '15px' });

    // やり直すボタン（右上）
    makeButton(this, 870, 11, 78, 28, 'やり直す', () => this.confirmReset(), {
      color: 0x6a4a5a, hover: 0x8a5f72, fontSize: '12px',
    });

    // 流行（オフィス見出しの右）と 目標（オフィス下）はオフィス内に常設表示
    this.trendText = this.add.text(OFFICE.x + 120, OFFICE.y + 11, '', {
      fontFamily: FONT, fontSize: '13px', color: COLORS.gold,
    });
    this.goalText = this.add.text(OFFICE.x + 12, OFFICE.y + OFFICE.h - 22, '', {
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
    this.trendText.setText(`🔥 今季の流行: ${trendName}（売上UP）`);

    if (s.totalRevenue === 0) {
      // オンボーディング：最初の1着を売るまで「次にやること」を案内
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
    this.buildBottomPanel();
    this.save(); // 操作のたびに自動セーブ
  }

  // ── 右：社員一覧 ─────────────────────────────────────────
  buildEmployeePanel() {
    const s = this.state;
    const title = this.add.text(EMP.x + 14, EMP.y + 12,
      `社員  ${s.employees.length}/${s.maxEmployees}`, {
        fontFamily: FONT, fontSize: '17px', color: COLORS.text,
      });
    this.uiLayer.add(title);

    const rowH = 58;
    let ry = EMP.y + 44;
    for (const e of s.employees) {
      this.buildEmployeeRow(e, EMP.x + 10, ry, EMP.w - 20, rowH - 6);
      ry += rowH;
    }
    if (s.employees.length === 0) {
      this.uiLayer.add(this.add.text(EMP.x + 14, ry, '「採用」でおじさんを雇おう', {
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
    // 職種カラーの印
    this.uiLayer.add(this.add.rectangle(x + 6, y + 6, 14, 14, job.color).setOrigin(0, 0));
    // 名前＋Lv
    this.uiLayer.add(this.add.text(x + 26, y + 5, `${e.name}  Lv${e.level}`, {
      fontFamily: FONT, fontSize: '14px', color: COLORS.text,
    }));
    // 能力
    this.uiLayer.add(this.add.text(x + 26, y + 24, `企${e.plan} デ${e.design} 営${e.sales}`, {
      fontFamily: FONT, fontSize: '13px', color: COLORS.sub,
    }));
    // 給料＋状態
    const assignedProj = e.projectId != null
      ? this.state.projects.find((p) => p.id === e.projectId) : null;
    const statusText = assignedProj ? `▶ ${assignedProj.def.name}` : '手すき';
    this.uiLayer.add(this.add.text(x + 150, y + 24, `¥${salaryOf(e)}/週`, {
      fontFamily: FONT, fontSize: '12px', color: COLORS.sub,
    }));
    this.uiLayer.add(this.add.text(x + 150, y + 5, statusText, {
      fontFamily: FONT, fontSize: '12px', color: assignedProj ? COLORS.good : '#c9b27a',
    }));

    // ボタン：割当 / 外す
    const btnX = x + w - 70;
    if (assignedProj) {
      this.uiLayer.add(makeButton(this, btnX, y + h / 2 - 14, 62, 28, '外す', () => {
        unassign(this.state, e.id);
        this.refresh();
      }, { color: 0x8a5a6a, hover: 0xb27486, fontSize: '13px' }));
    } else {
      const hasProject = this.state.projects.length > 0;
      this.uiLayer.add(makeButton(this, btnX, y + h / 2 - 14, 62, 28, '割当', () => {
        this.openAssignToProjectModal(e.id);
      }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '13px', disabled: !hasProject }));
    }
  }

  // ── 下：操作ボタン＋開発カード ───────────────────────────
  buildBottomPanel() {
    const s = this.state;
    // 操作ボタン列
    const cx = BOTTOM.x + 12;
    this.uiLayer.add(makeButton(this, cx, BOTTOM.y + 12, 168, 52, '▶ 次の週へ', () => this.onNextWeek(), {
      color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '18px',
    }));
    this.uiLayer.add(makeButton(this, cx, BOTTOM.y + 74, 168, 32, '採用', () => this.openHireModal(), {
      disabled: s.employees.length >= s.maxEmployees, fontSize: '15px',
    }));
    const exMax = expandMaxed(s);
    this.uiLayer.add(makeButton(this, cx, BOTTOM.y + 112, 168, 32,
      exMax ? '拡張 (最大)' : `拡張 ¥${expandCost(s).toLocaleString()}`,
      () => this.onExpand(), {
        disabled: !canExpand(s), color: 0x9a7b3a, hover: 0xc29a4a, fontSize: '14px',
      }));
    this.uiLayer.add(this.add.text(cx, BOTTOM.y + 154,
      s.employees.length >= s.maxEmployees ? '社員枠いっぱい' : '', {
        fontFamily: FONT, fontSize: '11px', color: COLORS.sub,
      }));

    // 開発カード（スロット＝maxProjects個）
    const areaX = BOTTOM.x + 196;
    const cardW = BOTTOM.w - 196 - 12;
    const cardH = 58;
    let cy = BOTTOM.y + 12;
    for (let slot = 0; slot < s.maxProjects; slot++) {
      const p = s.projects[slot];
      if (p) this.buildProjectCard(p, areaX, cy, cardW, cardH);
      else this.buildEmptySlot(areaX, cy, cardW, cardH);
      cy += cardH + 8;
    }
  }

  buildProjectCard(p, x, y, w, h) {
    const s = this.state;
    const def = p.def;
    const onTrend = def.id === s.trendGarment;
    const hot = def.season === s.season;
    this.uiLayer.add(this.add.rectangle(x, y, w, h, 0x33365a).setOrigin(0, 0)
      .setStrokeStyle(2, onTrend ? def.color : def.color));

    // タイトル（流行＞旬のバッジ）
    const badge = onTrend ? ' 🔥流行' : (hot ? ' 🔥旬' : '');
    this.uiLayer.add(this.add.text(x + 10, y + 5,
      `${def.name} [${def.season}]${badge}`, {
        fontFamily: FONT, fontSize: '15px', color: (onTrend || hot) ? COLORS.gold : COLORS.text,
      }));

    // 社員追加ボタン（右上）
    const idle = idleEmployees(s).length;
    this.uiLayer.add(makeButton(this, x + w - 90, y + 5, 82, 22, '＋社員追加', () => {
      this.openAssignModal(p.id);
    }, { fontSize: '12px', disabled: idle === 0, color: COLORS.btnAccent, hover: COLORS.btnAccentHover }));

    // 進捗バー（フル幅）＋中央に数値
    const ratio = p.progress / def.workNeeded;
    this.uiLayer.add(makeProgressBar(this, x + 10, y + 28, w - 20, 13, ratio, def.color));
    this.uiLayer.add(this.add.text(x + w / 2, y + 28 + 6,
      `${Math.floor(p.progress)} / ${def.workNeeded}`, {
        fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#10111c', strokeThickness: 2,
      }).setOrigin(0.5));

    // 担当＋完成見込み
    const team = assignedTo(s, p.id);
    let line;
    if (team.length === 0) {
      line = '担当なし — 社員を割り当てよう';
    } else {
      const weekly = team.reduce((a, e) => a + e.design * TUNING.devDesign + e.plan * TUNING.devPlan, 0);
      const eta = weekly > 0 ? Math.max(1, Math.ceil((def.workNeeded - p.progress) / weekly)) : '—';
      line = `担当 ${team.length}人 ・ あと約 ${eta} 週`;
    }
    this.uiLayer.add(this.add.text(x + 10, y + h - 16, line, {
      fontFamily: FONT, fontSize: '12px', color: team.length ? COLORS.good : COLORS.bad,
    }));
  }

  buildEmptySlot(x, y, w, h) {
    const card = this.add.rectangle(x, y, w, h, 0x282a40).setOrigin(0, 0).setStrokeStyle(2, 0x3a3d5c);
    this.uiLayer.add(card);
    this.uiLayer.add(makeButton(this, x + w / 2 - 90, y + h / 2 - 15, 180, 30, '＋ 新コレクション開発', () => {
      this.openNewCollectionModal();
    }, { fontSize: '14px', color: COLORS.btn, hover: COLORS.btnHover }));
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
    this.modal = layer; // 操作をブロック
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
    if (this.modal) {
      this.modal.destroy(true);
      this.modal = null;
    }
  }

  openHireModal() {
    const cands = generateCandidates(this.state, Math.random);
    this.showModal('採用 — おじさんを面接', (layer, r) => {
      let cy = r.py + 56;
      for (const c of cands) {
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 92;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0).setStrokeStyle(1, COLORS.panelEdge));
        layer.add(this.add.text(cardX + 14, cy + 10, c.name, { fontFamily: FONT, fontSize: '17px', color: COLORS.text }));
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
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0).setStrokeStyle(1, COLORS.panelEdge));
        layer.add(this.add.text(cardX + 12, cy + 8, `${e.name}  Lv${e.level}`, { fontFamily: FONT, fontSize: '15px', color: COLORS.text }));
        layer.add(this.add.text(cardX + 12, cy + 30, `企${e.plan} デ${e.design} 営${e.sales}`, { fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
        layer.add(makeButton(this, cardX + cardW - 92, cy + cardH / 2 - 15, 80, 30, '追加', () => {
          assign(this.state, e.id, projectId);
          this.refresh();
          this.openAssignModal(projectId); // 続けて追加できるよう開き直す
        }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '14px' }));
        cy += cardH + 8;
      }
    });
  }

  // 社員側の「割当」：プロジェクトを選んで割り当てる
  openAssignToProjectModal(empId) {
    if (this.state.projects.length === 0) return;
    this.showModal('どのコレクションに割り当てる？', (layer, r) => {
      let cy = r.py + 56;
      for (const p of this.state.projects) {
        const cardX = r.px + 20, cardW = r.pw - 40, cardH = 56;
        const team = assignedTo(this.state, p.id).length;
        layer.add(this.add.rectangle(cardX, cy, cardW, cardH, 0x3a3d5e).setOrigin(0, 0).setStrokeStyle(2, p.def.color));
        layer.add(this.add.text(cardX + 12, cy + 8, `${p.def.name} [${p.def.season}]`, { fontFamily: FONT, fontSize: '15px', color: COLORS.text }));
        layer.add(this.add.text(cardX + 12, cy + 30, `進捗 ${Math.floor(p.progress)}/${p.def.workNeeded}   担当 ${team}人`, { fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
        layer.add(makeButton(this, cardX + cardW - 92, cy + cardH / 2 - 15, 80, 30, '割当', () => {
          assign(this.state, empId, p.id);
          this.closeModal();
          this.refresh();
        }, { color: COLORS.btnAccent, hover: COLORS.btnAccentHover, fontSize: '14px' }));
        cy += cardH + 8;
      }
    });
  }

  // 社員の詳細＋解雇
  openEmployeeDetail(empId) {
    const e = this.state.employees.find((x) => x.id === empId);
    if (!e) return;
    const job = dominantJob(e);
    this.showModal(`${e.name}（${job.label}）`, (layer, r) => {
      const x = r.px + 24;
      layer.add(this.add.text(x, r.py + 64, `Lv ${e.level}${e.founder ? '  ★社長' : ''}`, {
        fontFamily: FONT, fontSize: '17px', color: COLORS.text }));
      // 経験値バー
      const need = TUNING.expPerLevel * e.level;
      layer.add(this.add.text(x, r.py + 96, `経験値 ${e.exp}/${need}`, { fontFamily: FONT, fontSize: '13px', color: COLORS.sub }));
      layer.add(makeProgressBar(this, x, r.py + 116, 240, 12, e.exp / need, 0x5cb874));
      // 能力
      layer.add(this.add.text(x, r.py + 144, `企画 ${e.plan}    デザイン ${e.design}    営業 ${e.sales}`, {
        fontFamily: FONT, fontSize: '15px', color: COLORS.text }));
      layer.add(this.add.text(x, r.py + 174, `給料 ¥${salaryOf(e)}/週`, { fontFamily: FONT, fontSize: '14px', color: '#c9b27a' }));
      const proj = e.projectId != null ? this.state.projects.find((p) => p.id === e.projectId) : null;
      layer.add(this.add.text(x, r.py + 198, proj ? `担当中: ${proj.def.name}` : '手すき', {
        fontFamily: FONT, fontSize: '14px', color: proj ? COLORS.good : '#c9b27a' }));

      // 解雇（社長は不可）
      layer.add(makeButton(this, x, r.py + 240, 200, 42,
        e.founder ? '社長は解雇できない' : '解雇する', () => {
          if (fireEmployee(this.state, e.id)) {
            this.removeWalker(e.id);
            this.closeModal();
            this.refresh();
          }
        }, { disabled: e.founder, color: 0x9a4a5a, hover: 0xc26072, fontSize: '15px' }));
    });
  }

  removeWalker(empId) {
    const w = this.walkers.get(empId);
    if (w) { w.destroy(); this.walkers.delete(empId); }
  }

  // ── 演出 ─────────────────────────────────────────────────
  playEvents(events) {
    // 給料
    const sal = events.find((e) => e.type === 'salary');
    if (sal && sal.amount > 0) {
      this.popText(this.hudMoney.x + 90, HUD_H / 2, `-¥${sal.amount}`, COLORS.bad, '14px');
    }
    // 完成（中央に大きく・複数なら少しずらす）
    const comps = events.filter((e) => e.type === 'complete');
    comps.forEach((c, i) => {
      // 同じ週に複数完成しても重ならないよう縦にずらす
      const dy = (i - (comps.length - 1) / 2) * 84;
      this.time.delayedCall(i * 700, () => {
        const stars = '★'.repeat(c.stars) + '☆'.repeat(5 - c.stars);
        const flair = c.bigHit ? '💥大ヒット！\n' : (c.onTrend ? '🔥流行的中！\n' : '');
        const color = c.bigHit ? '#ff7eb6' : COLORS.gold;
        if (c.bigHit) Sfx.bigHit(); else Sfx.complete();
        this.popOffice(`${flair}${c.garment.name} 完成!\n${stars}\n${c.units}着 +¥${c.revenue.toLocaleString()}`, color, 30, dy);
      });
    });
    // 昇格
    const rankUp = events.find((e) => e.type === 'rankup');
    if (rankUp) {
      this.time.delayedCall(comps.length * 700 + 200, () => {
        Sfx.rankUp();
        this.popOffice(`🎉 昇格！\n『${rankUp.title}』`, COLORS.gold, 26);
      });
    }
    // 新コレクション解放
    const unlocks = events.filter((e) => e.type === 'unlock');
    unlocks.forEach((u, i) => {
      this.time.delayedCall(comps.length * 700 + 500 + i * 500, () => {
        Sfx.unlock();
        this.popOffice(`🆕 新コレクション解放！\n『${u.garment.name}』`, COLORS.gold, 22);
      });
    });
    // レベルアップ
    const lvs = events.filter((e) => e.type === 'levelup');
    lvs.forEach((lv, i) => {
      this.time.delayedCall(comps.length * 700 + i * 400, () => {
        const w = this.walkers.get(lv.empId);
        const px = w ? w.x : OFFICE.x + OFFICE.w / 2;
        const py = w ? w.y - 30 : OFFICE.y + 60;
        this.popText(px, py, `Lv${lv.level}↑`, COLORS.good, '16px');
      });
    });
    // 資金マイナス警告（倒産までは行っていないとき）
    if (this.state.money < 0 && !this.state.gameOver) {
      this.popOffice('⚠ 資金がマイナス！\n服を完成させて売ろう', COLORS.bad, 18);
    }
  }

  // オフィス中央に浮き上がるテキスト
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
    const sx = Phaser.Math.Between(ROOM.x, ROOM.x + ROOM.w);
    const sy = Phaser.Math.Between(ROOM.y, ROOM.y + ROOM.h);
    const body = this.add.rectangle(0, 0, 18, 22, job.color).setStrokeStyle(2, 0x20223a);
    const head = this.add.circle(0, -15, 7, 0xf0c8a0).setStrokeStyle(2, 0x20223a);
    const tag = this.add.text(0, 16, e.name, { fontFamily: FONT, fontSize: '10px', color: COLORS.text })
      .setOrigin(0.5, 0);
    const cont = this.add.container(sx, sy, [body, head, tag]).setDepth(10);
    cont.empId = e.id;
    this.walkerLayer.add(cont);
    this.walkers.set(e.id, cont);
    // 歩く上下バウンド（体と頭をいっしょに少し弾ませる）
    this.tweens.add({
      targets: [body, head], y: '-=3', duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.wanderNext(cont);
  }

  wanderNext(cont) {
    if (!cont || !cont.active) return;
    const tx = Phaser.Math.Between(ROOM.x, ROOM.x + ROOM.w);
    const ty = Phaser.Math.Between(ROOM.y, ROOM.y + ROOM.h);
    const dist = Phaser.Math.Distance.Between(cont.x, cont.y, tx, ty);
    this.tweens.add({
      targets: cont, x: tx, y: ty,
      duration: dist * 16 + 400,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.time.delayedCall(Phaser.Math.Between(300, 1200), () => this.wanderNext(cont));
      },
    });
  }
}
