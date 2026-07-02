import { defineConfig } from "vite";

export default defineConfig({
  base: "/builder_sprite_lab/",
  build: {
    rollupOptions: {
      output: {
        // Content-hashed filenames so every deploy busts the browser cache. With
        // fixed names (app.js/app.css) browsers kept serving the old cached build
        // after an update, and changes never appeared without a hard refresh.
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
