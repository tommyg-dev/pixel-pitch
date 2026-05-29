import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: { port: 5180, strictPort: true },
  define: {
    // Some Solana deps reference process.env / global.
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      // Import shared types from source so no prebuild step is required.
      "@pixel-pitch/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url)
      ),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        play: fileURLToPath(new URL("./play.html", import.meta.url)),
      },
    },
  },
});
