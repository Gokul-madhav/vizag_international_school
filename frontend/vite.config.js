import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend talks to the FastAPI backend. During `npm run dev` requests to
// /api are proxied there so there are no CORS surprises.
// NOTE: temporarily 8001 instead of the documented 8000 — a Windows-level
// stuck socket is holding :8000 on this machine (taskkill/Stop-Process can't
// see the PID that owns it). A reboot should free :8000 again; until then,
// keep the backend and this target on 8001 together.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
