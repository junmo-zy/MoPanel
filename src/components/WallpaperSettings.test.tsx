import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WallpaperPreferences, WallpaperRepository } from "../wallpaper/wallpaper-store";
import { WallpaperProvider } from "../wallpaper/WallpaperContext";
import { WallpaperSettings } from "./WallpaperSettings";

function fakeRepository(initial?: Partial<WallpaperPreferences>): WallpaperRepository {
  const preferences: WallpaperPreferences = { selectedId: "coastal-mist", blur: 18, dim: 18, ...initial };
  return {
    loadPreferences: vi.fn(() => preferences),
    savePreferences: vi.fn(),
    loadCustomWallpaper: vi.fn(async () => null),
    saveCustomWallpaper: vi.fn(async () => undefined),
    clearCustomWallpaper: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wallpaper settings", () => {
  it("selects a built-in wallpaper and persists blur and dim controls", async () => {
    const user = userEvent.setup();
    const repository = fakeRepository();
    render(
      <WallpaperProvider repository={repository}>
        <WallpaperSettings />
      </WallpaperProvider>,
    );

    await user.click(screen.getByRole("button", { name: "蓝色峡湾" }));
    await user.click(screen.getByLabelText("减少壁纸模糊度"));
    await user.click(screen.getByLabelText("增加背景遮罩"));

    expect(screen.getByRole("button", { name: "蓝色峡湾" })).toHaveAttribute("aria-pressed", "true");
    expect(repository.savePreferences).toHaveBeenLastCalledWith({
      selectedId: "blue-fjord",
      blur: 16,
      dim: 22,
    });
  });

  it("uploads and selects a custom wallpaper stored outside localStorage", async () => {
    const user = userEvent.setup();
    const repository = fakeRepository();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:custom-wallpaper"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    render(
      <WallpaperProvider repository={repository}>
        <WallpaperSettings />
      </WallpaperProvider>,
    );
    const file = new File(["wallpaper"], "my-wallpaper.webp", { type: "image/webp" });

    await user.upload(screen.getByLabelText("上传自己的壁纸"), file);

    await waitFor(() => expect(repository.saveCustomWallpaper).toHaveBeenCalledWith(file));
    expect(screen.getByRole("button", { name: "自定义壁纸" })).toHaveAttribute("aria-pressed", "true");
  });
});
