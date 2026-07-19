import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMihomoReloader, createProviderRouter } from "./provider-router.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

describe("provider management API", () => {
  it("lists providers without a management token", async () => {
    const providers = [{ name: "airport" }];
    const store = { list: vi.fn(async () => providers) };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));

    const response = await fetch(`${base}/providers`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ providers });
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it("applies a create request and passes the guarded reload callback to the store", async () => {
    const reload = vi.fn(async () => undefined);
    const store = {
      apply: vi.fn(async (change, reloadConfig) => {
        await reloadConfig();
        return [change.provider];
      }),
    };
    const base = await start(createProviderRouter({ store, reload }));

    const provider = { name: "airport", type: "http", url: "https://sub.example.com", interval: 3600 };
    const response = await fetch(`${base}/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });

    expect(response.status).toBe(200);
    expect(store.apply).toHaveBeenCalledWith({ action: "create", provider }, expect.any(Function));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("maps duplicate providers to a conflict response", async () => {
    const store = {
      apply: vi.fn(async () => {
        const error = new Error("already exists");
        error.code = "DUPLICATE_PROVIDER";
        throw error;
      }),
    };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));

    const response = await fetch(`${base}/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "airport" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: "already exists" });
  });

  it("maps a provider referenced by an auto group to a conflict response", async () => {
    const store = {
      apply: vi.fn(async () => {
        const error = new Error("provider is still used");
        error.code = "AUTO_GROUP_PROVIDER_IN_USE";
        throw error;
      }),
    };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));

    const response = await fetch(`${base}/providers/airport`, { method: "DELETE" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: "provider is still used" });
  });

  it("passes decoded names to update and delete operations", async () => {
    const store = { apply: vi.fn(async () => []) };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));
    const headers = { "Content-Type": "application/json" };

    await fetch(`${base}/providers/%E6%97%A7%20%E8%AE%A2%E9%98%85`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "新订阅" }),
    });
    await fetch(`${base}/providers/%E6%96%B0%E8%AE%A2%E9%98%85`, {
      method: "DELETE",
    });

    expect(store.apply).toHaveBeenNthCalledWith(1, {
      action: "update",
      originalName: "旧 订阅",
      provider: { name: "新订阅" },
    }, expect.any(Function));
    expect(store.apply).toHaveBeenNthCalledWith(2, { action: "delete", name: "新订阅" }, expect.any(Function));
  });
});

describe("current subscription API", () => {
  it("reads and switches the one active subscription through the shared reload callback", async () => {
    const state = { providers: ["airport-a", "airport-b"], activeProvider: "airport-a" };
    const reload = vi.fn(async () => undefined);
    const store = {
      getSubscriptionState: vi.fn(async () => state),
      selectSubscription: vi.fn(async (_name, reloadConfig) => {
        await reloadConfig();
        return { ...state, activeProvider: "airport-b" };
      }),
    };
    const base = await start(createProviderRouter({ store, reload }));

    const get = await fetch(`${base}/active-provider`);
    const put = await fetch(`${base}/active-provider`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "airport-b" }),
    });

    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toEqual(state);
    expect(put.status).toBe(200);
    await expect(put.json()).resolves.toEqual({ ...state, activeProvider: "airport-b" });
    expect(store.selectSubscription).toHaveBeenCalledWith("airport-b", expect.any(Function));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("managed auto-group API", () => {
  it("lists managed auto groups without a management token", async () => {
    const groups = [{
      name: "my-auto",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "airport", name: "Hong Kong 01" }],
    }];
    const store = { listAutoGroups: vi.fn(async () => groups) };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));

    const response = await fetch(`${base}/auto-groups`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ groups });
    expect(store.listAutoGroups).toHaveBeenCalledTimes(1);
  });

  it("uses the shared reload callback for create, update, and delete", async () => {
    const reload = vi.fn(async () => undefined);
    const groups = [];
    const store = {
      applyAutoGroup: vi.fn(async (_change, reloadConfig) => {
        await reloadConfig();
        return groups;
      }),
    };
    const base = await start(createProviderRouter({ store, reload }));
    const group = {
      name: "new-auto",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "airport", name: "Hong Kong 01" }],
    };

    const create = await fetch(`${base}/auto-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group),
    });
    const update = await fetch(`${base}/auto-groups/%E6%97%A7%E8%87%AA%E5%8A%A8%E7%BB%84`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group),
    });
    const remove = await fetch(`${base}/auto-groups/%E6%96%B0%E8%87%AA%E5%8A%A8%E7%BB%84`, {
      method: "DELETE",
    });

    expect(create.status).toBe(200);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(store.applyAutoGroup).toHaveBeenNthCalledWith(1, {
      action: "create",
      group,
    }, expect.any(Function));
    expect(store.applyAutoGroup).toHaveBeenNthCalledWith(2, {
      action: "update",
      originalName: "旧自动组",
      group,
    }, expect.any(Function));
    expect(store.applyAutoGroup).toHaveBeenNthCalledWith(3, {
      action: "delete",
      name: "新自动组",
    }, expect.any(Function));
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("attaches a legacy managed group to PROXY through the shared reload callback", async () => {
    const reload = vi.fn(async () => undefined);
    const groups = [{ name: "my-auto" }];
    const store = {
      applyAutoGroup: vi.fn(async (_change, reloadConfig) => {
        await reloadConfig();
        return groups;
      }),
    };
    const base = await start(createProviderRouter({ store, reload }));

    const response = await fetch(`${base}/auto-groups/my-auto/attach`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ groups });
    expect(store.applyAutoGroup).toHaveBeenCalledWith({ action: "attach", name: "my-auto" }, expect.any(Function));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("maps duplicate auto-group names to a conflict response", async () => {
    const store = {
      applyAutoGroup: vi.fn(async () => {
        const error = new Error("already exists");
        error.code = "DUPLICATE_AUTO_GROUP";
        throw error;
      }),
    };
    const base = await start(createProviderRouter({ store, reload: vi.fn() }));

    const response = await fetch(`${base}/auto-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-auto" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: "already exists" });
  });
});

describe("Mihomo config reload", () => {
  it("uses the path visible inside the Mihomo container and authenticates server-side", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const reload = createMihomoReloader({
      target: "http://mihomo:9090",
      secret: "core-secret",
      reloadPath: "/root/.config/mihomo/config.yaml",
      fetcher,
    });

    await reload();

    expect(fetcher).toHaveBeenCalledWith("http://mihomo:9090/configs?force=true", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer core-secret",
      },
      body: JSON.stringify({ path: "/root/.config/mihomo/config.yaml" }),
    });
  });
});
