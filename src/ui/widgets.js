// Phaser用の小さなUI部品（図形＋テキスト）。絵を描かずに最小ループを動かすための土台。
import Phaser from 'phaser';

export const FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

export const COLORS = {
  bg: 0x1f2030,
  panel: 0x2b2d42,
  panelEdge: 0x4a4e69,
  office: 0x3d4466,
  officeFloor: 0x4a5280,
  desk: 0x6b5641,
  text: '#f4f4f8',
  sub: '#a9adc4',
  good: '#7ddc8c',
  bad: '#ff7a7a',
  gold: '#ffd35e',
  btn: 0x4f6bd6,
  btnHover: 0x6a85ee,
  btnDisabled: 0x44475a,
  btnAccent: 0x3fae74,
  btnAccentHover: 0x55c98c,
};

// クリックできるボタン（コンテナ：左上原点）。
export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const c = scene.add.container(x, y);
  const baseColor = opts.color ?? COLORS.btn;
  const hoverColor = opts.hover ?? COLORS.btnHover;
  const disabled = !!opts.disabled;

  const bg = scene.add.rectangle(0, 0, w, h, disabled ? COLORS.btnDisabled : baseColor)
    .setOrigin(0, 0)
    .setStrokeStyle(2, 0x10111c);
  const t = scene.add.text(w / 2, h / 2, label, {
    fontFamily: FONT,
    fontSize: opts.fontSize ?? '15px',
    color: disabled ? '#7c7f95' : '#ffffff',
    align: 'center',
  }).setOrigin(0.5);
  c.add([bg, t]);
  c.setSize(w, h);

  if (!disabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(hoverColor));
    bg.on('pointerout', () => bg.setFillStyle(baseColor));
    bg.on('pointerdown', () => onClick && onClick());
  }
  c.bg = bg;
  c.labelText = t;
  return c;
}

// 進捗バー（コンテナ：左上原点）。ratio 0..1。
export function makeProgressBar(scene, x, y, w, h, ratio, fillColor = 0x5cb874) {
  const c = scene.add.container(x, y);
  const back = scene.add.rectangle(0, 0, w, h, 0x1b1c28).setOrigin(0, 0).setStrokeStyle(1, 0x10111c);
  const fill = scene.add.rectangle(1, 1, Math.max(0, (w - 2) * Phaser.Math.Clamp(ratio, 0, 1)), h - 2, fillColor).setOrigin(0, 0);
  c.add([back, fill]);
  return c;
}

// パネル枠。
export function makePanel(scene, x, y, w, h, color = COLORS.panel) {
  return scene.add.rectangle(x, y, w, h, color).setOrigin(0, 0).setStrokeStyle(2, COLORS.panelEdge);
}
