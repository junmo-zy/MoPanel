import express from "express";

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
  return 500;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "配置操作失败";
}

export function createMihomoReloader({ target, secret, reloadPath, fetcher = fetch }) {
  return async function reloadMihomoConfig() {
    const headers = { "Content-Type": "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;
    const response = await fetcher(`${target}/configs?force=true`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ path: reloadPath }),
    });
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(detail ? `Mihomo 拒绝重载：${detail}` : `Mihomo 拒绝重载（${response.status}）`);
    }
  };
}

export function createProviderRouter({ store, reload }) {
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

  router.get("/active-provider", async (_request, response) => {
    try {
      response.json(await store.getSubscriptionState());
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
