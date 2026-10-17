import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // So the frontend can call "/api/..." and Vite forwards it to the
      // backend during development, avoiding CORS friction.
      "/api": "http://localhost:5000",
    },
  },
});
