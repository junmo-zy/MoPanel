import { describe, expect, it, vi } from "vitest";
import { createMihomoClient } from "./mihomo";

describe("Mihomo API client", () => {
  it("updates the proxy mode through the controller config endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMihomoClient(fetcher);

    await client.setMode("global");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/configs",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ mode: "global" }),
      }),
    );
  });

  it("maps controller data into a compact overview model", async () => {
    const responses: Record<string, unknown> = {
      "/api/mihomo/version": { version: "v1.19.12", meta: true },
      "/api/mihomo/configs": { mode: "rule", "mixed-port": 7890, "allow-lan": false },
      "/api/mihomo/proxies": {
        proxies: {
          "自动选择": {
            name: "自动选择",
            type: "URLTest",
            now: "美国 03",
            all: ["香港 01", "美国 03"],
          },
          "香港 01": {
            name: "香港 01",
            type: "VLESS",
            alive: true,
            history: [{ delay: 42, time: "2026-07-17T04:00:00.000Z" }],
          },
          "日本 02": {
            name: "日本 02",
            type: "Hysteria2",
            alive: true,
            history: [{ delay: 78, time: "2026-07-17T04:00:00.000Z" }],
          },
        },
      },
      "/api/mihomo/providers/proxies": {
        providers: {
          "机场订阅": {
            name: "机场订阅",
            vehicleType: "HTTP",
            updatedAt: "2026-07-17T04:00:00.000Z",
            proxies: [
              { name: "香港 01" },
              {
                name: "美国 03",
                type: "Trojan",
                alive: true,
                history: [{ delay: 95, time: "2026-07-17T04:00:00.000Z" }],
              },
            ],
          },
        },
      },
      "/api/mihomo/connections": {
        downloadTotal: 2048,
        uploadTotal: 1024,
        connections: [{ id: "connection-1", metadata: { network: "tcp" } }],
      },
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return Response.json(responses[url]);
    });
    const client = createMihomoClient(fetcher);

    const overview = await client.getOverview();

    expect(overview).toMatchObject({
      connected: true,
      version: "v1.19.12",
      mode: "rule",
      connectionCount: 1,
      tcpCount: 1,
      udpCount: 0,
      groups: [
        {
          name: "自动选择",
          type: "URLTest",
          current: "美国 03",
          delay: 95,
          nodes: [
            { name: "香港 01", type: "VLESS", delay: 42, alive: true },
            { name: "美国 03", type: "Trojan", delay: 95, alive: true, provider: "机场订阅" },
          ],
        },
      ],
      providers: [{ name: "机场订阅", vehicleType: "HTTP", proxyCount: 2 }],
      providerNodes: [
        { provider: "机场订阅", name: "香港 01", type: "Unknown", delay: null, alive: true },
        { provider: "机场订阅", name: "美国 03", type: "Trojan", delay: 95, alive: true },
      ],
    });
  });

  it("selects a node using an encoded proxy group path", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMihomoClient(fetcher);

    await client.selectProxy("人工 选择", "新加坡 01");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/proxies/%E4%BA%BA%E5%B7%A5%20%E9%80%89%E6%8B%A9",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "新加坡 01" }) }),
    );
  });

  it("keeps same-named candidates from different providers for safe auto-group selection", async () => {
    const responses: Record<string, unknown> = {
      "/api/mihomo/version": { version: "v1" },
      "/api/mihomo/configs": { mode: "rule" },
      "/api/mihomo/proxies": { proxies: {} },
      "/api/mihomo/providers/proxies": {
        providers: {
          first: { name: "first", proxies: [{ name: "Hong Kong 01", type: "VLESS", history: [{ delay: 42 }] }] },
          second: { name: "second", proxies: [{ name: "Hong Kong 01", type: "Trojan", history: [{ delay: 65 }] }] },
        },
      },
      "/api/mihomo/connections": { connections: [] },
    };
    const client = createMihomoClient(vi.fn(async (input: string | URL | Request) => Response.json(responses[String(input)])));

    await expect(client.getOverview()).resolves.toMatchObject({
      providerNodes: [
        { provider: "first", name: "Hong Kong 01", type: "VLESS", delay: 42 },
        { provider: "second", name: "Hong Kong 01", type: "Trojan", delay: 65 },
      ],
    });
  });

  it("tests a provider node against the configured URL and returns its reported delay", async () => {
    const fetcher = vi.fn(async () => Response.json({ delay: 66 }));
    const client = createMihomoClient(fetcher);
    const node = {
      name: "香港 01",
      type: "VLESS",
      delay: null,
      alive: true,
      provider: "机场订阅",
    };

    await expect(client.testProxy(node, "https://cp.cloudflare.com")).resolves.toBe(66);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/providers/proxies/%E6%9C%BA%E5%9C%BA%E8%AE%A2%E9%98%85/%E9%A6%99%E6%B8%AF%2001/healthcheck?url=https%3A%2F%2Fcp.cloudflare.com&timeout=5000",
      expect.any(Object),
    );
  });

  it("tests every node in a policy group with the configured URL", async () => {
    const fetcher = vi.fn(async () => Response.json({ "香港 01": 42, "日本 02": 78 }));
    const client = createMihomoClient(fetcher);

    await expect(client.testGroup("AUTO", "https://cp.cloudflare.com")).resolves.toEqual({
      "香港 01": 42,
      "日本 02": 78,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/group/AUTO/delay?url=https%3A%2F%2Fcp.cloudflare.com&timeout=5000",
      expect.any(Object),
    );
  });

  it("updates a named proxy provider", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMihomoClient(fetcher);

    await client.updateProvider("机场 订阅");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/providers/proxies/%E6%9C%BA%E5%9C%BA%20%E8%AE%A2%E9%98%85",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("maps active connections for the simple connections page", async () => {
    const fetcher = vi.fn(async () => Response.json({
      downloadTotal: 4000,
      uploadTotal: 2000,
      connections: [
        {
          id: "c-1",
          metadata: {
            network: "tcp",
            host: "example.com",
            destinationIP: "93.184.216.34",
            destinationPort: "443",
            process: "chrome.exe",
          },
          chains: ["香港 01", "自动选择"],
          rule: "DomainSuffix",
          rulePayload: "example.com",
          upload: 512,
          download: 1024,
          start: "2026-07-17T04:00:00.000Z",
        },
      ],
    }));
    const client = createMihomoClient(fetcher);

    const snapshot = await client.getConnections();

    expect(snapshot.connections[0]).toMatchObject({
      id: "c-1",
      network: "TCP",
      host: "example.com",
      destination: "93.184.216.34:443",
      process: "chrome.exe",
      chain: "自动选择 → 香港 01",
      rule: "DomainSuffix · example.com",
      upload: 512,
      download: 1024,
    });
  });

  it("closes one connection or all active connections", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMihomoClient(fetcher);

    await client.closeConnection("id/with space");
    await client.closeAllConnections();

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/mihomo/connections/id%2Fwith%20space",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/mihomo/connections",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("updates supported core settings", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createMihomoClient(fetcher);

    await client.updateConfig({ allowLan: true, ipv6: false, mixedPort: 7891 });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/mihomo/configs",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ "allow-lan": true, ipv6: false, "mixed-port": 7891 }),
      }),
    );
  });
});
