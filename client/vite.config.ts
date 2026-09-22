import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    host: true,
    port: 5173,
    cors: true,
    allowedHosts: true, // dev-only: accepts any tunnel host (ngrok, cloudflared, discordsays.com proxy)
    headers: {
      "Access-Control-Allow-Origin": "*",
      // Discord's Activity iframe (and ngrok's edge, and the Discord desktop client's own
      // webview) can all cache a response — if any of them cache the JS bundle, every fix we
      // push looks like it "did nothing" because the client never actually loads it. no-store
      // forbids caching this response anywhere, for anything, full stop.
      "Cache-Control": "no-store",
    },
    proxy: {
      "/api": {
        target: "http://localhost:2567",
        changeOrigin: true,
      },
      // WebSocket -> Colyseus server. Client connects to `${protocol}//${host}/colyseus`.
      "/colyseus": {
        target: "ws://localhost:2567",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ""),
      },
    },
  },
  preview: {
    allowedHosts: true,
  },
});
