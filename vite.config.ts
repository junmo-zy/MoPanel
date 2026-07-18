import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.MIHOMO_API_URL || "http://127.0.0.1:9090";
  const secret = env.MIHOMO_SECRET;

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      proxy: {
        "/api/mihomo": {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/api\/mihomo/, ""),
          configure(proxy) {
            if (!secret) return;
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Authorization", `Bearer ${secret}`);
            });
            proxy.on("proxyReqWs", (proxyReq) => {
              proxyReq.setHeader("Authorization", `Bearer ${secret}`);
            });
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ["recharts"],
            icons: ["@phosphor-icons/react"]
          }
        }
      }
    }
  };
});
