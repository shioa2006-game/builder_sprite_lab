import { defineConfig } from "vite";

// Build id shown on the title screen / console so we can always tell which
// version a browser is actually running (commit sha on CI, "dev" locally).
const sha = (process.env.GITHUB_SHA ?? "dev").slice(0, 7);
const builtAt = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  base: "/builder_sprite_lab/",
  define: {
    __BUILD_ID__: JSON.stringify(`${sha} (${builtAt} UTC)`),
  },
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
