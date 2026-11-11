import { describe, expect, it, vi } from "vitest";
import { createPanelSettingsClient } from "./panel-settings";

describe("panel settings client", () => {
  it("reads and saves the shared speed-test URL through the panel API", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        speedTestUrl: "https://www.gstatic.com/generate_204",
        selectedProviders: null,
        wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        speedTestUrl: "https://cp.cloudflare.com/generate_204",
        selectedProviders: ["机场订阅"],
        wallpaper: { selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] },
      }), { status: 200 }));
    const client = createPanelSettingsClient(fetcher);

    await expect(client.get()).resolves.toEqual({
      speedTestUrl: "https://www.gstatic.com/generate_204",
      selectedProviders: null,
      wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
    });
    await expect(client.save({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["机场订阅"],
      wallpaper: { selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] },
    })).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["机场订阅"],
      wallpaper: { selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] },
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/config/settings", { headers: { Accept: "application/json" } });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/config/settings", {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        speedTestUrl: "https://cp.cloudflare.com/generate_204",
        selectedProviders: ["机场订阅"],
        wallpaper: { selectedId: "warm-dunes", blur: 6, dim: 10, glass: 65, hidden: [] },
      }),
    });
  });

  it("falls back to the default wallpaper for older settings responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      speedTestUrl: "https://www.gstatic.com/generate_204",
      selectedProviders: null,
    }), { status: 200 }));
    const client = createPanelSettingsClient(fetcher);

    await expect(client.get()).resolves.toEqual({
      speedTestUrl: "https://www.gstatic.com/generate_204",
      selectedProviders: null,
      wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
    });
  });
});
