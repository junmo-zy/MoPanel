import { describe, expect, it, vi } from "vitest";
import { createProviderManagerClient } from "./provider-manager";

const provider = {
  name: "机场订阅",
  type: "http" as const,
  url: "https://sub.example.com",
  path: "./proxy_providers/机场订阅.yaml",
  interval: 3600,
  proxy: "DIRECT",
  filter: "",
  excludeFilter: "",
  healthCheck: {
    enable: true,
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true,
  },
};

describe("provider manager client", () => {
  it("uses the open config API without sending a management token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ providers: [provider] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const client = createProviderManagerClient(fetcher);

    await expect(client.list()).resolves.toEqual([provider]);
    expect(fetcher).toHaveBeenCalledWith("/api/config/providers", expect.objectContaining({
      headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
    }));
  });

  it("uses encoded CRUD endpoints and returns the updated provider list", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ providers: [provider] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const client = createProviderManagerClient(fetcher);

    await client.create(provider);
    await client.update("旧 订阅", provider);
    await client.remove("旧 订阅");

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/config/providers", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/config/providers/%E6%97%A7%20%E8%AE%A2%E9%98%85", expect.objectContaining({ method: "PUT" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/config/providers/%E6%97%A7%20%E8%AE%A2%E9%98%85", expect.objectContaining({ method: "DELETE" }));
  });

  it("surfaces a config API failure", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: "配置写入失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));
    const client = createProviderManagerClient(fetcher);

    await expect(client.list()).rejects.toThrow("配置写入失败");
  });
});
