import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Minimal, focused component-test setup — not a wholesale test framework
// migration. Covers targeted interaction tests colocated with the
// components they exercise (e.g. the employee add-forms' FormData wiring,
// the feedback table's search/filter behavior).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
});
