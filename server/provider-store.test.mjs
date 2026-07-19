import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProviderConfigStore } from "./provider-store.mjs";

const roots = [];
const source = `mixed-port: 7890
proxy-providers: {}
`;

const sourceWithProvider = `mixed-port: 7890
proxy-providers:
  airport:
    type: http
    url: https://sub.example.com
    path: ./proxy_providers/airport.yaml
    interval: 3600
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - DIRECT
`;

const sourceWithSubscriptions = `mixed-port: 7890
proxy-providers:
  airport-a:
    type: http
    url: https://a.example.com/sub
    path: ./proxy_providers/a.yaml
    interval: 3600
  airport-b:
    type: http
    url: https://b.example.com/sub
    path: ./proxy_providers/b.yaml
    interval: 3600
proxy-groups:
  - name: PROXY
    type: select
    use:
      - airport-a
  - name: AUTO
    type: url-test
    use:
      - airport-a
`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "mihomo-mini-"));
  roots.push(root);
  const configPath = join(root, "config.yaml");
  await writeFile(configPath, source, "utf8");
  return { configPath, store: new ProviderConfigStore(configPath) };
}

async function createAutoGroupStore() {
  const root = await mkdtemp(join(tmpdir(), "mihomo-mini-"));
  roots.push(root);
  const configPath = join(root, "config.yaml");
  await writeFile(configPath, sourceWithProvider, "utf8");
  return {
    configPath,
    metadataPath: join(root, ".mihomo-mini", "auto-groups.json"),
    store: new ProviderConfigStore(configPath),
  };
}

async function createSubscriptionStore() {
  const root = await mkdtemp(join(tmpdir(), "mihomo-mini-"));
  roots.push(root);
  const configPath = join(root, "config.yaml");
  await writeFile(configPath, sourceWithSubscriptions, "utf8");
  return { configPath, store: new ProviderConfigStore(configPath) };
}

describe("ProviderConfigStore", () => {
  it("writes the mutation and reloads Mihomo after a successful change", async () => {
    const { configPath, store } = await createStore();
    const reload = vi.fn(async () => undefined);

    const providers = await store.apply({
      action: "create",
      provider: { name: "机场订阅", type: "http", url: "https://sub.example.com", interval: 3600 },
    }, reload);

    expect(providers).toContainEqual(expect.objectContaining({ name: "机场订阅" }));
    expect(await readFile(configPath, "utf8")).toContain("机场订阅:");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("restores the original file when Mihomo rejects the reload", async () => {
    const { configPath, store } = await createStore();

    await expect(store.apply({
      action: "create",
      provider: { name: "坏配置", type: "http", url: "https://sub.example.com", interval: 3600 },
    }, async () => {
      throw new Error("reload rejected");
    })).rejects.toThrow("reload rejected");

    expect(await readFile(configPath, "utf8")).toBe(source);
  });

  it("persists a managed URLTest group in YAML and its sidecar metadata", async () => {
    const { configPath, metadataPath, store } = await createAutoGroupStore();
    const reload = vi.fn(async () => undefined);
    const group = {
      name: "my-auto",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "airport", name: "Hong Kong 01" }],
    };

    await expect(store.applyAutoGroup({ action: "create", group }, reload)).resolves.toEqual([group]);
    expect(await readFile(configPath, "utf8")).toContain("name: my-auto");
    await expect(readFile(metadataPath, "utf8")).resolves.toContain('"my-auto"');
    await expect(store.listAutoGroups()).resolves.toEqual([group]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rolls back both YAML and auto-group metadata when reload fails", async () => {
    const { configPath, metadataPath, store } = await createAutoGroupStore();

    await expect(store.applyAutoGroup({
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport", name: "Hong Kong 01" }],
      },
    }, async () => {
      throw new Error("reload rejected");
    })).rejects.toThrow("reload rejected");

    expect(await readFile(configPath, "utf8")).toBe(sourceWithProvider);
    await expect(stat(metadataPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back a legacy group attachment when Mihomo rejects the reload", async () => {
    const { configPath, metadataPath, store } = await createAutoGroupStore();
    const group = {
      name: "my-auto",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "airport", name: "Hong Kong 01" }],
    };
    await store.applyAutoGroup({ action: "create", group }, async () => undefined);
    const legacyYaml = (await readFile(configPath, "utf8")).replace("      - my-auto\n", "");
    const previousMetadata = await readFile(metadataPath, "utf8");
    await writeFile(configPath, legacyYaml, "utf8");

    await expect(store.applyAutoGroup({ action: "attach", name: "my-auto" }, async () => {
      throw new Error("reload rejected");
    })).rejects.toThrow("reload rejected");

    expect(await readFile(configPath, "utf8")).toBe(legacyYaml);
    expect(await readFile(metadataPath, "utf8")).toBe(previousMetadata);
  });

  it("restores pre-existing auto-group metadata when an edit cannot reload", async () => {
    const { configPath, metadataPath, store } = await createAutoGroupStore();
    const initialGroup = {
      name: "my-auto",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      nodes: [{ provider: "airport", name: "Hong Kong 01" }],
    };
    await store.applyAutoGroup({ action: "create", group: initialGroup }, async () => undefined);
    const previousYaml = await readFile(configPath, "utf8");
    const previousMetadata = await readFile(metadataPath, "utf8");

    await expect(store.applyAutoGroup({
      action: "update",
      originalName: "my-auto",
      group: {
        ...initialGroup,
        interval: 600,
        tolerance: 20,
      },
    }, async () => {
      throw new Error("reload rejected");
    })).rejects.toThrow("reload rejected");

    expect(await readFile(configPath, "utf8")).toBe(previousYaml);
    expect(await readFile(metadataPath, "utf8")).toBe(previousMetadata);
  });

  it("serializes provider and auto-group writes through the same queue", async () => {
    const { configPath, store } = await createAutoGroupStore();
    let beginFirstReload;
    let releaseFirstReload;
    const firstReloadStarted = new Promise((resolve) => {
      beginFirstReload = resolve;
    });
    const firstReloadRelease = new Promise((resolve) => {
      releaseFirstReload = resolve;
    });
    const reload = vi.fn(async () => {
      if (reload.mock.calls.length === 1) {
        beginFirstReload();
        await firstReloadRelease;
      }
    });

    const providerWrite = store.apply({
      action: "create",
      provider: { name: "second-airport", type: "http", url: "https://second.example.com", interval: 3600 },
    }, reload);
    await firstReloadStarted;

    const groupWrite = store.applyAutoGroup({
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport", name: "Hong Kong 01" }],
      },
    }, reload);

    expect(reload).toHaveBeenCalledTimes(1);
    releaseFirstReload();
    await Promise.all([providerWrite, groupWrite]);

    expect(reload).toHaveBeenCalledTimes(2);
    const contents = await readFile(configPath, "utf8");
    expect(contents).toContain("second-airport:");
    expect(contents).toContain("name: my-auto");
  });

  it("protects provider references held by managed auto groups", async () => {
    const { configPath, metadataPath, store } = await createAutoGroupStore();
    await store.applyAutoGroup({
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport", name: "Hong Kong 01" }],
      },
    }, async () => undefined);
    const reload = vi.fn(async () => undefined);

    await expect(store.apply({
      action: "update",
      originalName: "airport",
      provider: {
        name: "airport",
        type: "http",
        url: "https://updated.example.com",
        path: "./proxy_providers/airport.yaml",
        interval: 3600,
      },
    }, reload)).resolves.toContainEqual(expect.objectContaining({ name: "airport" }));

    await expect(store.apply({
      action: "update",
      originalName: "airport",
      provider: {
        name: "renamed-airport",
        type: "http",
        url: "https://updated.example.com",
        path: "./proxy_providers/renamed-airport.yaml",
        interval: 3600,
      },
    }, reload)).rejects.toThrow(expect.objectContaining({ code: "AUTO_GROUP_PROVIDER_IN_USE" }));
    await expect(store.apply({ action: "delete", name: "airport" }, reload)).rejects.toThrow(expect.objectContaining({ code: "AUTO_GROUP_PROVIDER_IN_USE" }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(await readFile(configPath, "utf8")).toContain("airport:");
    expect(await readFile(metadataPath, "utf8")).toContain('"airport"');
  });

  it("switches the current subscription through a reload-safe config write", async () => {
    const { configPath, store } = await createSubscriptionStore();
    const reload = vi.fn(async () => undefined);

    await expect(store.getSubscriptionState()).resolves.toEqual({
      providers: ["airport-a", "airport-b"],
      activeProvider: "airport-a",
    });
    await expect(store.selectSubscription("airport-b", reload)).resolves.toEqual({
      providers: ["airport-a", "airport-b"],
      activeProvider: "airport-b",
    });

    expect(await readFile(configPath, "utf8")).toContain("- airport-b");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("restores the prior subscription when Mihomo rejects a switch", async () => {
    const { configPath, store } = await createSubscriptionStore();

    await expect(store.selectSubscription("airport-b", async () => {
      throw new Error("reload rejected");
    })).rejects.toThrow("reload rejected");

    expect(await readFile(configPath, "utf8")).toBe(sourceWithSubscriptions);
  });
});
