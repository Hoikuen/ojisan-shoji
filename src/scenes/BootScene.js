import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const variants = ['sales', 'plan', 'design'];
    const seatedFrames = ['sit_idle_1', 'sit_idle_2', 'sit_work', 'sit_think'];
    for (const v of variants) {
      for (const f of seatedFrames) {
        this.load.image(`ojisan_${v}_${f}`, `assets/sprites/ojisan_${v}_seated/${f}.png`);
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
