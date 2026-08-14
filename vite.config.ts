import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pagesのプロジェクトページ配信(サブパス)向けに、デプロイ時
  // のみBASE_PATH環境変数でbaseを切り替える(specs/004-github-pages-deploy/
  // research.md #3)。未設定時(ローカルのdev/build/preview)は従来通り "/"。
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setupTests.ts"],
  },
});
