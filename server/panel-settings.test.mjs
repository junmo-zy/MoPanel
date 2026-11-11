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

    await expect(store.get()).resolves.toEqual({
      speedTestUrl: "https://www.gstatic.com/generate_204",
      selectedProviders: null,
      wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
    });
    await expect(store.save({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["airport-a", "airport-b"],
      wallpaper: { selectedId: "warm-dunes", blur: 8, dim: 12, glass: 65, hidden: [] },
    })).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["airport-a", "airport-b"],
      wallpaper: { selectedId: "warm-dunes", blur: 8, dim: 12, glass: 65, hidden: [] },
    });
    await expect(readFile(join(root, ".mihomo-mini", "settings.json"), "utf8")).resolves.toContain("cp.cloudflare.com");
    await expect(new PanelSettingsStore(join(root, "config.yaml")).get()).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["airport-a", "airport-b"],
      wallpaper: { selectedId: "warm-dunes", blur: 8, dim: 12, glass: 65, hidden: [] },
    });
  });

  it("updates shared wallpaper preferences without overwriting other panel settings", async () => {
    const { store } = await createStore();
    await store.save({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["airport-a"],
    });

    await expect(store.save({
      wallpaper: { selectedId: "custom", blur: 4, dim: 0, glass: 65, hidden: [] },
    })).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["airport-a"],
      wallpaper: { selectedId: "custom", blur: 4, dim: 0, glass: 65, hidden: [] },
    });
  });

  it("persists a custom wallpaper image beside the shared settings", async () => {
    const { store } = await createStore();
    const image = Buffer.from("image-data");

    await store.saveCustomWallpaper({ contentType: "image/webp", data: image });

    await expect(store.loadCustomWallpaper()).resolves.toEqual({
      contentType: "image/webp",
      data: image,
    });

    await store.clearCustomWallpaper();
    await expect(store.loadCustomWallpaper()).resolves.toBeNull();
  });

  it("rejects unsupported custom wallpaper uploads", async () => {
    const { store } = await createStore();

    await expect(store.saveCustomWallpaper({ contentType: "image/gif", data: Buffer.from("gif") }))
      .rejects.toThrow("壁纸必须是 JPG、PNG 或 WebP 图片");
  });

  it("rejects invalid subscription selections instead of writing unusable filter state", async () => {
    const { store } = await createStore();

    await expect(store.save({ speedTestUrl: "https://cp.cloudflare.com", selectedProviders: ["airport", "  ", "airport"] }))
      .rejects.toThrow("订阅选择必须是唯一的非空名称列表");
  });

  it("rejects invalid speed-test URLs instead of persisting them", async () => {
    const { store } = await createStore();

    await expect(store.save({ speedTestUrl: "ftp://example.com" })).rejects.toThrow("测速地址必须是有效的 HTTP 或 HTTPS 地址");
  });

  it("accepts the wider blur / veil ranges, glass opacity and removed presets", async () => {
    const { store } = await createStore();
    const saved = await store.save({ wallpaper: { selectedId: "coastal-mist", blur: 99, dim: 95, glass: 3, hidden: ["coastal-mist", "nope", "coastal-mist"] } });
    // The selected preset was removed, so the next visible one is used.
    expect(saved.wallpaper).toEqual({ selectedId: "blue-fjord", blur: 60, dim: 90, glass: 25, hidden: ["coastal-mist"] });
  });
});
