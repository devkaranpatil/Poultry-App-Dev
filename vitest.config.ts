import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}", "backend/**/*.js"],
      exclude: [
        "src/test/**",
        "src/components/ui/**", // generated shadcn primitives
        "src/main.tsx",
        "src/vite-env.d.ts",
        // Polyhouse variant of the API (same calculator, other field name). Listed by path: a
        // "*polyhouse*" glob would match the project folder name itself.
        "src/types/polyhouse.ts",
        "backend/routes/polyhouse.js",
        "backend/validators/polyhouseValidator.js",
        "src/hooks/use-toast.ts", // shadcn toast store; the app uses sonner
        "backend/node_modules/**",
        "backend/index.js", // process bootstrap; exercised by the e2e suite
        // Three.js scene graph: needs WebGL, covered by the Playwright e2e suite.
        "src/components/greenhouse/GreenhouseModel.tsx",
        "src/components/greenhouse/CameraController.tsx",
        "src/components/greenhouse/MiddlePanel.tsx",
      ],
      // Floors, not goals: CI fails if coverage regresses below these.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 65,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
