import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WallpaperPreferences, WallpaperRepository } from "../wallpaper/wallpaper-store";
import { WallpaperProvider } from "../wallpaper/WallpaperContext";
import { WallpaperSettings } from "./WallpaperSettings";

function fakeRepository(initial?: Partial<WallpaperPreferences>): WallpaperRepository {
  const preferences: WallpaperPreferences = { selectedId: "coastal-mist", blur: 18, dim: 18, glass: 65, hidden: [], ...initial };
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
    fireEvent.change(screen.getByRole("slider", { name: "壁纸模糊度" }), { target: { value: "48" } });
    fireEvent.change(screen.getByRole("slider", { name: "背景遮罩" }), { target: { value: "80" } });
    await user.click(screen.getByRole("radio", { name: "轻薄" }));

    expect(screen.getByRole("button", { name: "蓝色峡湾" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "壁纸模糊度" })).toHaveAttribute("max", "60");
    expect(screen.getByRole("slider", { name: "背景遮罩" })).toHaveAttribute("max", "90");
    // Slider drags are saved once, after they settle.
    await waitFor(() => expect(repository.savePreferences).toHaveBeenLastCalledWith({
      selectedId: "blue-fjord",
      blur: 48,
      dim: 80,
      glass: 45,
      hidden: [],
    }));
    expect(repository.savePreferences).toHaveBeenCalledTimes(1);
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

  it("removes and restores preset wallpapers but always keeps one", async () => {
    const user = userEvent.setup();
    const repository = fakeRepository();
    render(
      <WallpaperProvider repository={repository}>
        <WallpaperSettings />
      </WallpaperProvider>,
    );

    await user.click(screen.getByRole("button", { name: "移除 清晨海雾" }));
    expect(screen.queryByRole("button", { name: "清晨海雾" })).not.toBeInTheDocument();
    // The removed one was selected, so the next preset takes over.
    expect(screen.getByRole("button", { name: "蓝色峡湾" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "移除 蓝色峡湾" }));
    expect(screen.getByRole("button", { name: "移除 暖色沙丘" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /恢复已移除的预设壁纸/ }));
    expect(screen.getByRole("button", { name: "清晨海雾" })).toBeInTheDocument();
    await waitFor(() => expect(repository.savePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ hidden: [] })));
  });
});
