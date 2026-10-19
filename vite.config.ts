import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Not frontend source: model weights, downloaded documents, the backend and test output. Watching
    // these (the weights are gigabytes) keeps the dev server busy for no reason.
    watch: {
      ignored: [
        "**/backend/**",
        "**/datasets/**",
        "**/supabase/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/*.log",
      ],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("@react-three")) {
            return "three-core";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-core";
          }
          if (
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/@tanstack/react-query")
          ) {
            return "app-framework";
          }
          if (
            id.includes("node_modules/framer-motion") ||
            id.includes("node_modules/lucide-react")
          ) {
            return "motion-icons";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "radix-ui";
          }
          if (
            id.includes("node_modules/date-fns") ||
            id.includes("node_modules/recharts")
          ) {
            return "data-viz";
          }
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) {
            return "reporting";
          }
          if (id.includes("node_modules")) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
});
