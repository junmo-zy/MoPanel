import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { WallpaperPreferences, WallpaperRepository } from "./wallpaper-store";

function repository(overrides: Partial<WallpaperPreferences> = {}): WallpaperRepository {
  const preferences: WallpaperPreferences = { selectedId: "blue-fjord", blur: 12, dim: 24, glass: 65, hidden: [], ...overrides };
  return {
    loadPreferences: vi.fn(() => preferences),
    savePreferences: vi.fn(),
    loadCustomWallpaper: vi.fn(async () => null),
    saveCustomWallpaper: vi.fn(async () => undefined),
    clearCustomWallpaper: vi.fn(async () => undefined),
  };
}

function sharedRepository(): WallpaperRepository {
  return {
    loadPreferences: vi.fn(() => ({ selectedId: "blue-fjord" as const, blur: 12, dim: 24, glass: 65, hidden: [] })),
    loadSharedPreferences: vi.fn(async () => ({ selectedId: "warm-dunes" as const, blur: 6, dim: 10, glass: 40, hidden: [] })),
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
      "--glass-alpha": "0.65",
    });
    // No fake traffic lights and no title bar: the brand tops the sidebar, macOS style.
    expect(screen.queryByLabelText("窗口控制")).not.toBeInTheDocument();
    expect(desktop.querySelector(".window-titlebar")).not.toBeInTheDocument();
    expect(desktop.querySelector(".sidebar .sidebar-brand .product-brand")).toHaveTextContent("MoPanel");
  });

  it("falls back to a plain gradient when every preset is removed and no image is uploaded", () => {
    render(<App wallpaperRepository={repository({ hidden: ["coastal-mist", "blue-fjord", "warm-dunes"] })} />);
    const desktop = screen.getByTestId("wallpaper-desktop");
    // Normalisation keeps the selection valid even with all presets hidden.
    expect(desktop.querySelector(".wallpaper-layer")).toHaveAttribute("data-empty", "true");
    expect(desktop).toHaveStyle({ "--wallpaper-image": "none" });
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

  it("applies shared wallpaper preferences after loading the panel settings API", async () => {
    render(<App wallpaperRepository={sharedRepository()} />);

    await waitFor(() => expect(screen.getByTestId("wallpaper-desktop")).toHaveStyle({
      "--wallpaper-image": "url(/wallpapers/warm-dunes.png)",
      "--wallpaper-blur": "6px",
      "--wallpaper-dim": "0.1",
    }));
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
