import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// VITE_BASE: "/huainamyen/" on GitHub Pages, "/" on a custom domain.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE || "/huainamyen/",
    plugins: [vue(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 700 },
    server: { port: 5173 },
  };
});
