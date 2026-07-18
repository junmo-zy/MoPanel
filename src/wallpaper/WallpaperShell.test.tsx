import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { WallpaperPreferences, WallpaperRepository } from "./wallpaper-store";

function repository(overrides: Partial<WallpaperPreferences> = {}): WallpaperRepository {
  const preferences: WallpaperPreferences = { selectedId: "blue-fjord", blur: 12, dim: 24, ...overrides };
  return {
    loadPreferences: vi.fn(() => preferences),
    savePreferences: vi.fn(),
    loadCustomWallpaper: vi.fn(async () => null),
    saveCustomWallpaper: vi.fn(async () => undefined),
    clearCustomWallpaper: vi.fn(async () => undefined),
  };
}

describe("Apple-style wallpaper shell", () => {
  it("renders the Docker panel as a viewport-filling application", () => {
    render(<App wallpaperRepository={repository()} />);

    const desktop = screen.getByTestId("wallpaper-desktop");
    expect(desktop.querySelector(".app-window")).toHaveAttribute("data-layout", "fullscreen");
  });

  it("applies persisted wallpaper material values to the whole desktop", () => {
    render(<App wallpaperRepository={repository()} />);

    const desktop = screen.getByTestId("wallpaper-desktop");
    expect(desktop).toHaveStyle({
      "--wallpaper-image": "url(/wallpapers/blue-fjord.png)",
      "--wallpaper-blur": "12px",
      "--wallpaper-dim": "0.24",
    });
    expect(screen.getByLabelText("窗口控制")).toBeInTheDocument();
  });

  it("removes outer glass material when wallpaper blur and dim are both zero", () => {
    render(<App wallpaperRepository={repository({ blur: 0, dim: 0 })} />);

    expect(screen.getByTestId("wallpaper-desktop")).toHaveStyle({
      "--wallpaper-material-blur": "0px",
      "--window-surface": "transparent",
      "--main-surface": "transparent",
      "--titlebar-surface": "transparent",
      "--sidebar-surface": "transparent",
    });
  });

  it("exposes wallpaper controls from settings", async () => {
    const user = userEvent.setup();
    render(<App wallpaperRepository={repository()} />);

    await user.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByRole("heading", { name: "桌面与外观" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "蓝色峡湾" })).toHaveAttribute("aria-pressed", "true");
  });

  it("updates the visible wallpaper layer when a new wallpaper is selected", async () => {
    const user = userEvent.setup();
    render(<App wallpaperRepository={repository()} />);

    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(screen.getByRole("button", { name: "暖色沙丘" }));

    const desktop = screen.getByTestId("wallpaper-desktop");
    expect(desktop.querySelector(".wallpaper-layer")).toHaveStyle({
      backgroundImage: "url(/wallpapers/warm-dunes.png)",
    });
  });

  it("switches the full interface to dark mode from the sidebar footer", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(<App wallpaperRepository={repository()} />);

    const desktop = screen.getByTestId("wallpaper-desktop");
    expect(desktop).toHaveAttribute("data-theme", "light");
    const toggle = screen.getByRole("button", { name: "切换为深色模式" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(desktop).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "切换为浅色模式" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("mihomo-mini:theme")).toBe("dark");
  });
});
