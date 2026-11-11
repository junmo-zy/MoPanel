import { indexedDB } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WALLPAPER_PREFERENCES,
  createWallpaperRepository,
  normalizeWallpaperPreferences,
} from "./wallpaper-store";

function readBlobText(blob: Blob) {
  // Blobs from fetch() are Node blobs, which jsdom's FileReader rejects.
  if (typeof blob.text === "function") return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe("wallpaper preferences", () => {
  it("falls back from unknown wallpapers and clamps material controls", () => {
    expect(normalizeWallpaperPreferences({
      selectedId: "not-a-wallpaper",
      blur: 99,
      dim: -10,
    })).toEqual({
      ...DEFAULT_WALLPAPER_PREFERENCES,
      blur: 60,
      dim: 0,
    });
  });

  it("persists preferences and a custom image without putting the image in localStorage", async () => {
    localStorage.clear();
    const repository = createWallpaperRepository({
      storage: localStorage,
      indexedDB,
      databaseName: `wallpaper-test-${crypto.randomUUID()}`,
      settingsClient: null,
    });
    const preferences = { selectedId: "custom" as const, blur: 12, dim: 24, glass: 65, hidden: [] };
    const image = new NodeBlob(["image-data"], { type: "image/webp" }) as Blob;

    repository.savePreferences(preferences);
    await repository.saveCustomWallpaper(image);

    expect(repository.loadPreferences()).toEqual(preferences);
    expect(localStorage.getItem("mihomo-mini:wallpaper")).not.toContain("image-data");
    const restored = await repository.loadCustomWallpaper();
    expect(restored).toBeInstanceOf(NodeBlob);
    expect(restored?.type).toBe("image/webp");
    expect(restored?.size).toBe(image.size);
  });

  it("loads and saves shared wallpaper preferences through the panel settings API", async () => {
    localStorage.clear();
    const settingsClient = {
      get: vi.fn(async () => ({
        speedTestUrl: "https://www.gstatic.com/generate_204",
        selectedProviders: null,
        wallpaper: { selectedId: "warm-dunes" as const, blur: 6, dim: 10, glass: 65, hidden: [] },
      })),
      save: vi.fn(async (settings: { wallpaper?: typeof DEFAULT_WALLPAPER_PREFERENCES }) => ({
        speedTestUrl: "https://www.gstatic.com/generate_204",
        selectedProviders: null,
        wallpaper: settings.wallpaper || DEFAULT_WALLPAPER_PREFERENCES,
      })),
    };
    const repository = createWallpaperRepository({
      storage: localStorage,
      indexedDB,
      databaseName: `wallpaper-test-${crypto.randomUUID()}`,
      settingsClient,
    });

    await expect(repository.loadSharedPreferences?.()).resolves.toEqual({ selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] });
    expect(repository.loadPreferences()).toEqual({ selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] });

    await repository.savePreferences({ selectedId: "blue-fjord", blur: 12, dim: 24, glass: 65, hidden: [] });

    expect(settingsClient.save).toHaveBeenCalledWith({ wallpaper: { selectedId: "blue-fjord", blur: 12, dim: 24, glass: 65, hidden: [] } });
  });

  it("uses the shared custom wallpaper endpoint before the local image fallback", async () => {
    const image = new NodeBlob(["image-data"], { type: "image/webp" }) as Blob;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      if (input === "/api/config/wallpaper/custom") {
        return new Response("server-image", { status: 200, headers: { "Content-Type": "image/png" } });
      }
      return new Response(null, { status: 404 });
    });
    const repository = createWallpaperRepository({
      storage: localStorage,
      indexedDB,
      databaseName: `wallpaper-test-${crypto.randomUUID()}`,
      settingsClient: null,
      fetcher,
    });

    await repository.saveCustomWallpaper(image);
    const restored = await repository.loadCustomWallpaper();

    expect(fetcher).toHaveBeenCalledWith("/api/config/wallpaper/custom", {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: image,
    });
    expect(restored?.type).toBe("image/png");
    expect(await readBlobText(restored!)).toBe("server-image");
  });
});
