import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    // The map engine is inherently ~1 MB and is already isolated below, so the
    // default 500 kB warning is only noise here.
    chunkSizeWarningLimit: 1200,
    // maplibre-gl is a large single dependency; split it so the app shell
    // stays small and the map chunk can be cached independently.
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
        },
      },
    },
  },
});
