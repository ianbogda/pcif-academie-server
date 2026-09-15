import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: process.env.VITE_DEPLOYMENT_ENV === "demo"
      ? [{ find: "./demoProfiles", replacement: fileURLToPath(new URL("./src/demoProfiles.demo.ts", import.meta.url)) }]
      : []
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000"
    }
  }
});
