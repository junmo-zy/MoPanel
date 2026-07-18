import { indexedDB } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WALLPAPER_PREFERENCES,
  createWallpaperRepository,
  normalizeWallpaperPreferences,
} from "./wallpaper-store";

describe("wallpaper preferences", () => {
  it("falls back from unknown wallpapers and clamps material controls", () => {
    expect(normalizeWallpaperPreferences({
      selectedId: "not-a-wallpaper",
      blur: 99,
      dim: -10,
    })).toEqual({
      ...DEFAULT_WALLPAPER_PREFERENCES,
      blur: 32,
      dim: 0,
    });
  });

  it("persists preferences and a custom image without putting the image in localStorage", async () => {
    localStorage.clear();
    const repository = createWallpaperRepository({
      storage: localStorage,
      indexedDB,
      databaseName: `wallpaper-test-${crypto.randomUUID()}`,
    });
    const preferences = { selectedId: "custom" as const, blur: 12, dim: 24 };
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
});
