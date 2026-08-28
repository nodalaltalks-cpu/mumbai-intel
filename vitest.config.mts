import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

/**
 * Minimal config — this repo had no test runner before this bridge (see
 * lib/ingestion/apifyBridge.test.ts). Two things are needed beyond vitest's
 * defaults to run any existing lib/** file under plain Node:
 *  - the "@/*" -> project-root alias already declared in tsconfig.json
 *    (vitest doesn't read tsconfig paths on its own without a plugin, and
 *    adding a whole plugin for one alias is more than this needs);
 *  - a stub for the "server-only" marker package, which throws
 *    unconditionally unless a bundler declares the "react-server" export
 *    condition (see test/stubs/server-only.ts) -- an existing, unrelated
 *    convention across this codebase (lib/prisma-adjacent files already do
 *    `import "server-only"`), not something introduced for this bridge.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(rootDir, "test/stubs/server-only.ts"),
      "@": path.resolve(rootDir, "."),
    },
  },
  test: {
    environment: "node",
  },
});
