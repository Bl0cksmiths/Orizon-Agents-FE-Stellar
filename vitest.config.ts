import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // tsconfig sets jsx: "preserve" for Next's compiler; vitest's transform
  // needs JSX compiled so tests can import .tsx modules.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    reporters: "verbose",
    coverage: {
      // v8's defaults, plus lcov: coverage/lcov.info is what SonarQube reads
      // (sonar-project.properties).
      reporter: ["text", "html", "clover", "json", "lcov"],
      // Gate only what the unit suite is meant to cover: the lib layer (pure
      // logic + hooks) and the one tested UI module. Client components are
      // exercised by the Playwright smoke suite, not unit tests — pulling
      // them in would collapse the number into noise.
      include: [
        "lib/**/*.ts",
        // api-base.mjs is build-critical config logic — a regression there
        // 404s every request in production, so it stays under the gate.
        "lib/**/*.mjs",
        "components/ui/stellar-link.tsx",
      ],
      exclude: [
        "lib/types.ts",
        "lib/pdax-types.ts",
        "lib/mock-data.ts",
        "**/*.test.*",
      ],
      // Ratcheted after the outage round took the lib layer to 89/82/92/93.
      // Kept a few points of headroom so an unrelated refactor doesn't fail
      // CI, but close enough that deleting tests does.
      thresholds: {
        statements: 86,
        branches: 78,
        functions: 88,
        lines: 89,
      },
    },
  },
});
