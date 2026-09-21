import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Minimal, focused component-test setup — not a wholesale test framework
// migration. Only wired for the two employee add-forms
// (station-assignments-panel.test.tsx, capabilities-panel.test.tsx) that
// verify the selected <select> value actually reaches the Server Action's
// FormData, since that's what "run tests" now covers for this app.
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
