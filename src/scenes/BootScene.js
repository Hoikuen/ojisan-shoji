import Phaser from 'phaser';

// 絵はまだ無い（図形プレースホルダー段階）。ここでは何もロードせず GameScene へ。
// 将来アセットを足すときは assets manifest を総なめして this.load.image する（ロード漏れ防止）。
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create() {
    this.scene.start('Game');
  }
}
