import express from "express";
import { normalizeCorePatch } from "./provider-config.mjs";

function errorStatus(error) {
  if (
    error?.code === "DUPLICATE_PROVIDER"
    || error?.code === "DUPLICATE_PROVIDER_PATH"
    || error?.code === "DUPLICATE_AUTO_GROUP"
    || error?.code === "AUTO_GROUP_CHANGED"
    || error?.code === "AUTO_GROUP_PROVIDER_IN_USE"
  ) return 409;
  if (error?.code === "PROVIDER_NOT_FOUND" || error?.code === "AUTO_GROUP_NOT_FOUND") return 404;
  if (error?.name === "ProviderConfigError") return 400;
  if (error?.code === "MIHOMO_REJECTED") return 502;
  return 500;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "配置操作失败";
}

function controllerHeaders(secret) {
  const headers = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

// Options that only exist at runtime (changed from the panel before it began
// persisting them, or from another dashboard) must survive a panel-triggered
// reload, which otherwise silently resets e.g. 全局 back to 规则.
const RUNTIME_KEYS = ["mode", "allow-lan", "ipv6"];

async function readRuntimeOptions(target, secret, fetcher) {
  try {
    const response = await fetcher(`${target}/configs`, { headers: controllerHeaders(secret) });
    if (!response.ok) return null;
    const config = await response.json();
    const snapshot = {};
    for (const key of RUNTIME_KEYS) {
      if (config?.[key] !== undefined) snapshot[key] = key === "mode" ? String(config[key]).toLowerCase() : config[key];
    }
    return Object.keys(snapshot).length > 0 ? snapshot : null;
  } catch {
    return null;
  }
}

export function createMihomoPatcher({ target, secret, fetcher = fetch }) {
  return async function patchMihomoConfig(body) {
    const response = await fetcher(`${target}/configs`, {
      method: "PATCH",
      headers: controllerHeaders(secret),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      const error = new Error(detail ? `Mihomo 拒绝修改：${detail}` : `Mihomo 拒绝修改（${response.status}）`);
      error.code = "MIHOMO_REJECTED";
      throw error;
    }
  };
}

export function createMihomoReloader({ target, secret, reloadPath, fetcher = fetch }) {
  return async function reloadMihomoConfig() {
    const headers = controllerHeaders(secret);
    const runtime = await readRuntimeOptions(target, secret, fetcher);
    const response = await fetcher(`${target}/configs?force=true`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ path: reloadPath }),
    });
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(detail ? `Mihomo 拒绝重载：${detail}` : `Mihomo 拒绝重载（${response.status}）`);
    }
    if (runtime) {
      try {
        await fetcher(`${target}/configs`, { method: "PATCH", headers, body: JSON.stringify(runtime) });
      } catch {
        // The reload itself succeeded; the config file values stay in effect.
      }
    }
  };
}

export function createProviderRouter({ store, reload, patchRuntime }) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!store) {
      return response.status(503).json({ message: "配置管理尚未启用" });
    }
    next();
  });

  router.get("/providers", async (_request, response) => {
    try {
      response.json({ providers: await store.list() });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.post("/providers", async (request, response) => {
    try {
      const providers = await store.apply({ action: "create", provider: request.body }, reload);
      response.json({ providers });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.put("/providers/:name", async (request, response) => {
    try {
      const providers = await store.apply({
        action: "update",
        originalName: request.params.name,
        provider: request.body,
      }, reload);
      response.json({ providers });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.delete("/providers/:name", async (request, response) => {
    try {
      const providers = await store.apply({ action: "delete", name: request.params.name }, reload);
      response.json({ providers });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.patch("/core", async (request, response) => {
    try {
      const patch = normalizeCorePatch(request.body);
      if (patchRuntime) await patchRuntime(patch);
      try {
        await store.updateCore(patch);
      } catch (error) {
        return response.status(500).json({ message: `设置已生效，但写入配置文件失败：${errorMessage(error)}` });
      }
      response.json({ ok: true });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.get("/active-provider", async (_request, response) => {
    try {
      response.json(await store.getSubscriptionState());
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  // Re-download the active subscription's profile (groups + rules).
  router.post("/active-provider/sync", async (_request, response) => {
    try {
      response.json(await store.syncActiveSubscription(reload));
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.put("/active-provider", async (request, response) => {
    try {
      response.json(await store.selectSubscription(request.body?.name, reload));
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.get("/auto-groups", async (_request, response) => {
    try {
      response.json({ groups: await store.listAutoGroups() });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.post("/auto-groups", async (request, response) => {
    try {
      const groups = await store.applyAutoGroup({ action: "create", group: request.body }, reload);
      response.json({ groups });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.post("/auto-groups/:name/attach", async (request, response) => {
    try {
      const groups = await store.applyAutoGroup({
        action: "attach",
        name: request.params.name,
      }, reload);
      response.json({ groups });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.put("/auto-groups/:name", async (request, response) => {
    try {
      const groups = await store.applyAutoGroup({
        action: "update",
        originalName: request.params.name,
        group: request.body,
      }, reload);
      response.json({ groups });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  router.delete("/auto-groups/:name", async (request, response) => {
    try {
      const groups = await store.applyAutoGroup({ action: "delete", name: request.params.name }, reload);
      response.json({ groups });
    } catch (error) {
      response.status(errorStatus(error)).json({ message: errorMessage(error) });
    }
  });

  return router;
}
