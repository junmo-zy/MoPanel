import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProviderConfigStore } from "./provider-store.mjs";
import { createMihomoPatcher, createMihomoReloader, createProviderRouter } from "./provider-router.mjs";
import { PanelSettingsStore } from "./panel-settings.mjs";
import { createPanelSettingsRouter } from "./panel-settings-router.mjs";
import { createProxiedHttp, createProxyResolver } from "./proxy-client.mjs";
import { fetch as undiciFetch } from "undici";
import { PROFILE_USER_AGENT } from "./profile-sync.mjs";
import { createToolsRouter } from "./tools-router.mjs";

const app = express();
const port = Number(process.env.PORT || 8080);
const target = (process.env.MIHOMO_API_URL || "http://mihomo:9090").replace(/\/$/, "");
const secret = process.env.MIHOMO_SECRET || "";
const configPath = process.env.MIHOMO_CONFIG_PATH || "";
const reloadPath = process.env.MIHOMO_RELOAD_PATH || configPath;
const proxyUrl = process.env.MIHOMO_PROXY_URL || "";
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

const proxiedHttp = createProxiedHttp({ resolveProxyUrl: createProxyResolver({ target, secret, proxyUrl }) });
const MAX_PROFILE_BYTES = 30 * 1024 * 1024;

// Downloads a subscription like Clash Verge: Clash user agent, direct first,
// then through Mihomo when the NAS cannot reach the link directly.
async function fetchProfile(url) {
  const headers = { "user-agent": PROFILE_USER_AGENT, accept: "*/*" };
  try {
    const response = await undiciFetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_PROFILE_BYTES) throw new Error("订阅内容过大");
    return text;
  } catch (directError) {
    try {
      const response = await proxiedHttp.request(url, { headers, timeout: 20_000 });
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
      return response.text;
    } catch {
      throw directError;
    }
  }
}

const providerStore = configPath ? new ProviderConfigStore(configPath, { fetchProfile }) : null;
const panelSettingsStore = configPath ? new PanelSettingsStore(configPath) : null;
const reloadMihomo = createMihomoReloader({ target, secret, reloadPath });
const patchMihomo = createMihomoPatcher({ target, secret });

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
app.use("/api/config", createProviderRouter({ store: providerStore, reload: reloadMihomo, patchRuntime: patchMihomo }));
app.use(
  "/api/tools",
  express.json({ limit: "8kb" }),
  createToolsRouter({ http: proxiedHttp }),
);
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

// Like Clash Verge applying the current profile at launch, and keeping it
// fresh: sync the active subscription's groups and rules shortly after start
// and every 6 hours (Mihomo is reloaded only when something changed).
if (providerStore && reloadPath) {
  const syncProfile = (reason) => providerStore.syncActiveSubscription(reloadMihomo)
    .then((state) => {
      const source = state?.ruleSource;
      if (source) console.log(`[profile] ${reason}: ${source.provider ?? "-"} → ${source.mode} (${source.ruleCount} rules)${source.warning ? ` – ${source.warning}` : ""}`);
    })
    .catch((error) => console.warn(`[profile] ${reason} failed: ${error.message}`));
  setTimeout(() => void syncProfile("startup"), 8_000).unref();
  setInterval(() => void syncProfile("scheduled"), 6 * 60 * 60 * 1000).unref();
}
