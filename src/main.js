import Phaser from 'phaser';
import { GAME_W, GAME_H } from './data/tuning.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: 'app',
  backgroundColor: '#1f2030',
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { pixelArt: false, antialias: true },
};

const game = new Phaser.Game(config);
// デバッグ/検証用に公開（実害なし）。
window.game = game;
