import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProviderConfigStore } from "./provider-store.mjs";
import { createMihomoReloader, createProviderRouter } from "./provider-router.mjs";
import { PanelSettingsStore } from "./panel-settings.mjs";
import { createPanelSettingsRouter } from "./panel-settings-router.mjs";

const app = express();
const port = Number(process.env.PORT || 8080);
const target = (process.env.MIHOMO_API_URL || "http://mihomo:9090").replace(/\/$/, "");
const secret = process.env.MIHOMO_SECRET || "";
const configPath = process.env.MIHOMO_CONFIG_PATH || "";
const reloadPath = process.env.MIHOMO_RELOAD_PATH || configPath;
const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

const controllerProxy = createProxyMiddleware({
  target,
  changeOrigin: true,
  ws: true,
  pathRewrite: { "^/api/mihomo": "" },
  on: {
    proxyReq(proxyReq) {
      if (secret) proxyReq.setHeader("Authorization", `Bearer ${secret}`);
    },
    proxyReqWs(proxyReq) {
      if (secret) proxyReq.setHeader("Authorization", `Bearer ${secret}`);
    },
    error(error, _request, response) {
      if ("writeHead" in response && !response.headersSent) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ message: "无法连接 Mihomo 控制器", detail: error.message }));
      }
    },
  },
});

const providerStore = configPath ? new ProviderConfigStore(configPath) : null;
const panelSettingsStore = configPath ? new PanelSettingsStore(configPath) : null;
const reloadMihomo = createMihomoReloader({ target, secret, reloadPath });

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    controller: target,
    configManagement: Boolean(providerStore && reloadPath),
  });
});

// Parse request bodies only for our narrow config API. The controller proxy must
// receive its request stream untouched.
app.use(
  "/api/config",
  express.json({ limit: "64kb" }),
);
app.use("/api/config", createPanelSettingsRouter({ store: panelSettingsStore }));
app.use("/api/config", createProviderRouter({ store: providerStore, reload: reloadMihomo }));
app.use("/api/mihomo", controllerProxy);

if (!existsSync(dist)) {
  throw new Error("dist 目录不存在，请先运行 npm run build");
}

app.use(express.static(dist, { index: false, maxAge: "1h" }));
app.use((request, response, next) => {
  if (request.method !== "GET") return next();
  response.sendFile(join(dist, "index.html"));
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`MoPanel listening on :${port}, controller ${target}`);
});

server.on("upgrade", controllerProxy.upgrade);
