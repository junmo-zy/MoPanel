import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PanelSettingsStore } from "./panel-settings.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "mihomo-mini-settings-"));
  roots.push(root);
  return { root, store: new PanelSettingsStore(join(root, "config.yaml")) };
}

describe("PanelSettingsStore", () => {
  it("returns the default speed-test URL and persists a shared replacement beside config.yaml", async () => {
    const { root, store } = await createStore();

    await expect(store.get()).resolves.toEqual({ speedTestUrl: "https://www.gstatic.com/generate_204" });
    await expect(store.save({ speedTestUrl: "https://cp.cloudflare.com/generate_204" })).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
    });
    await expect(readFile(join(root, ".mihomo-mini", "settings.json"), "utf8")).resolves.toContain("cp.cloudflare.com");
    await expect(new PanelSettingsStore(join(root, "config.yaml")).get()).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
    });
  });

  it("rejects invalid speed-test URLs instead of persisting them", async () => {
    const { store } = await createStore();

    await expect(store.save({ speedTestUrl: "ftp://example.com" })).rejects.toThrow("测速地址必须是有效的 HTTP 或 HTTPS 地址");
  });
});
