/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // SIBILLA_API: point the dev UI at another API server (e.g. a throwaway one for trying things out).
  server: { proxy: { "/api": process.env.SIBILLA_API ?? "http://localhost:8787" } },
  test: { name: "web", environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["./src/test-setup.ts"] },
});
