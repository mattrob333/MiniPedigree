import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const API_PORT = process.env.API_PORT || "8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("react/")) return "vendor-react";
          if (id.includes("@xyflow")) return "vendor-flow";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("papaparse") || id.includes("zod") || id.includes("jszip")) return "vendor-data";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
