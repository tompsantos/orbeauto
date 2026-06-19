import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      "auto.orbeone.com.br",
      "98.80.120.69",
      "localhost",
      "127.0.0.1",
      "orbeauto-web"
    ],
    proxy: {
      "/api": {
        target: "http://orbeauto-api:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/uploads": {
        target: "http://orbeauto-api:8001",
        changeOrigin: true
      }
    }
  }
});
