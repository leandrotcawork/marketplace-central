import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: {
    jsx: "automatic",
  },
  preview: {
    port: 3002,
  },
  test: {
    environment: "jsdom",
    globals: true,
    dir: rootDir,
    setupFiles: [path.resolve(rootDir, "node_modules/@testing-library/jest-dom/dist/vitest.mjs")],
    include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "packages/**/*.test.ts", "packages/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
  },
});
