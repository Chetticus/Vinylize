import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies /api to the Python engine, so the frontend needs no
// hardcoded backend origin (and no CORS in dev).
export default defineConfig({
  plugins: [react()],
  server: {
    // Fail loudly if 5173 is occupied rather than silently moving to 5174.
    // Silently moving is a trap: an already-open tab keeps pointing at the
    // old port, every /api call then fails at the network layer, and the app
    // reports "Failed to fetch" with no clue that the server moved.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
