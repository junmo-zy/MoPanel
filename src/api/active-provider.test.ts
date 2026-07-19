import { describe, expect, it, vi } from "vitest";
import { createActiveProviderClient } from "./active-provider";

const state = {
  providers: ["airport-a", "airport-b"],
  activeProvider: "airport-a",
};

describe("active provider client", () => {
  it("reads and switches the current subscription through the config API", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === "PUT" ? { ...state, activeProvider: "airport-b" } : state,
    ), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    const client = createActiveProviderClient(fetcher);

    await expect(client.get()).resolves.toEqual(state);
    await expect(client.select("airport-b")).resolves.toEqual({ ...state, activeProvider: "airport-b" });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/config/active-provider", expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/json" }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/config/active-provider", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ name: "airport-b" }),
    }));
  });

  it("surfaces a failed subscription switch", async () => {
    const client = createActiveProviderClient(vi.fn(async () => new Response(JSON.stringify({ message: "switch failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(client.select("missing")).rejects.toThrow("switch failed");
  });
});
