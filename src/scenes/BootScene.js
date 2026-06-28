import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // キャラプール: 0=おじさん主人公, 1=OL田中, 2=後輩鈴木,
    //              3=後輩コーヒー, 4=おかあさん, 5=ゾンビリーマン
    for (let i = 0; i < 6; i++) {
      this.load.image(`char_${i}_idle`, `assets/sprites/ojisan_char${i}/idle.png`);
    }
    // char0（おじさん主人公）のみ歩行フレームあり
    for (let f = 1; f <= 4; f++) {
      this.load.image(`char_0_walk_${f}`, `assets/sprites/ojisan_char0/walk_${f}.png`);
    }

    this.load.image('bg_office_back', 'assets/bg/office_back.png');
    this.load.image('bg_office',      'assets/bg/office.png');
    const icons = ['haramaki', 'polo', 'chan', 'suit'];
    for (const id of icons) {
      this.load.image(`icon_${id}`, `assets/icons/${id}.png`);
    }
  }

  create() {
    this.scene.start('Game');
  }
}
