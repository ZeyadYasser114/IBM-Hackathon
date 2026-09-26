import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      // Allow importing src files with .js extension (TS output convention)
    },
  },
  resolve: {
    // Resolve .js imports to .ts sources during test runs
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
