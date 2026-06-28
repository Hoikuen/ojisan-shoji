import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const variants = ['sales', 'plan', 'design'];
    const frames = ['idle_1', 'idle_2', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'think', 'work'];
    for (const v of variants) {
      for (const f of frames) {
        this.load.image(`ojisan_${v}_${f}`, `assets/sprites/ojisan_${v}/${f}.png`);
      }
    }
    this.load.image('bg_office_back',  'assets/bg/office_back.png');
    this.load.image('bg_office_front', 'assets/bg/office_front.png');
    this.load.image('bg_office', 'assets/bg/office.png'); // fallback
    const icons = ['haramaki', 'polo', 'chan', 'suit'];
    for (const id of icons) {
      this.load.image(`icon_${id}`, `assets/icons/${id}.png`);
    }
  }

  create() {
    this.scene.start('Game');
  }
}
