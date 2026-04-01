import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    dir: rootDir,
    setupFiles: [path.resolve(rootDir, "tests/setup.ts")],
    include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "packages/**/*.test.ts", "packages/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
  },
});
