import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, API calls are proxied to the FastAPI server on :8000.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ["recharts"] } },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://localhost:8000" },
  },
});
