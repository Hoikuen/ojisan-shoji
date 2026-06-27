import { defineConfig } from 'vite';

// GitHub Pages 等のサブパス配信でも動くよう相対パスでビルドする。
export default defineConfig({
  base: './',
  server: {
    host: true,
    // プレビュー基盤が割り当てる PORT を尊重する（無ければ 5173）。
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: !!process.env.PORT,
  },
});
