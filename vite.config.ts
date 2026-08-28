import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],
    proxy: {
      "/signal": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
