import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Every test is offline by construction: providers receive an injected
    // transport. A test that needs the network is a design bug.
    testTimeout: 10_000,
    restoreMocks: true,
  },
});
