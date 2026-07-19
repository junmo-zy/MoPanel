import { describe, expect, it, vi } from "vitest";
import { createPanelSettingsClient } from "./panel-settings";

describe("panel settings client", () => {
  it("reads and saves the shared speed-test URL through the panel API", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ speedTestUrl: "https://www.gstatic.com/generate_204", selectedProviders: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ speedTestUrl: "https://cp.cloudflare.com/generate_204", selectedProviders: ["机场订阅"] }), { status: 200 }));
    const client = createPanelSettingsClient(fetcher);

    await expect(client.get()).resolves.toEqual({ speedTestUrl: "https://www.gstatic.com/generate_204", selectedProviders: null });
    await expect(client.save({ speedTestUrl: "https://cp.cloudflare.com/generate_204", selectedProviders: ["机场订阅"] })).resolves.toEqual({
      speedTestUrl: "https://cp.cloudflare.com/generate_204",
      selectedProviders: ["机场订阅"],
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/config/settings", { headers: { Accept: "application/json" } });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/config/settings", {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ speedTestUrl: "https://cp.cloudflare.com/generate_204", selectedProviders: ["机场订阅"] }),
    });
  });
});
