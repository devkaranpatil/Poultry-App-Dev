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
        "src/hooks/use-toast.ts", // shadcn toast store; the app uses sonner
        "backend/node_modules/**",
        "backend/index.js", // process bootstrap; exercised by the e2e suite
        // Three.js scene graph: needs WebGL, covered by the Playwright e2e suite.
        "src/components/farm/FarmModel.tsx",
        "src/components/farm/CameraController.tsx",
        "src/components/farm/MiddlePanel.tsx",
        "src/components/farm/scene/ShedScene.tsx",
        "src/components/farm/scene/canvasHelpers.tsx",
        // The shed's meshes; their layout (scene/shedLayout.ts) is unit-tested, the drawing by e2e/scene-options.spec.ts.
        "src/components/farm/scene/ShedStructure.tsx",
        "src/components/farm/scene/ShedInterior.tsx",
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
