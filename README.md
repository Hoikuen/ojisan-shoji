# おじさん商事 (ojisan-shoji)

おじさんがアパレル会社を育てる経営シミュレーション（カイロソフト風・見下ろしオフィス）。
社員のおじさんを採用し、コレクション（服）を開発・販売して会社を大きくしていく。

**▶ ブラウザで遊ぶ: https://hoikuen.github.io/ojisan-shoji/**

> スマホは横向き推奨。図形プレースホルダー段階（絵は今後差し替え予定）。

## 遊び方
採用 → 社員をコレクション開発に割当 → 「次の週へ」で開発が進む → 完成すると評価＆売上 → お金で採用・拡張。
季節に合った服・流行の服を当てると高評価。資金がマイナスを大きく下回ると倒産。進行はブラウザに自動保存される。

## 技術
- Phaser 3 + Vite
- ロジックはフレームワーク非依存（`src/game/core.js`）。バランス定数は `src/data/tuning.js` に集約
- 経済バランスはヘッドレスで検証可能：`npm run sim`

## 開発
```bash
npm install
npm run dev      # 開発サーバ
npm run build    # 本番ビルド（dist/）
npm run sim      # 経済バランスのシミュレーション検証
```

`main` への push で GitHub Pages へ自動デプロイされる（`.github/workflows/deploy.yml`）。
