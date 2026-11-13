import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", include: ["shared/test/**/*.test.ts", "server/test/**/*.test.ts"] } },
      "web",
    ],
  },
});
