import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import {
  getSubscriptionState,
  mutateProviderYaml,
  parseManagedProviders,
  switchSubscriptionYaml,
} from "./provider-config.mjs";

const source = `# keep this comment
mixed-port: 7890
proxy-providers:
  old-provider:
    type: http
    url: https://old.example.com/sub
    path: ./proxy_providers/old.yaml
    interval: 3600
    header:
      User-Agent:
        - mihomo
proxy-groups:
  - name: 自动选择
    type: select
    use:
      - old-provider
`;

describe("proxy provider YAML mutations", () => {
  it("adds a validated HTTP provider without changing unrelated configuration", () => {
    const output = mutateProviderYaml(source, {
      action: "create",
      provider: {
        name: "机场订阅",
        type: "http",
        url: "https://sub.example.com/clash",
        interval: 7200,
        proxy: "DIRECT",
        healthCheck: { enable: true, url: "https://www.gstatic.com/generate_204", interval: 300, lazy: true },
      },
    });

    expect(output).toContain("# keep this comment");
    expect(output).toContain("mixed-port: 7890");
    expect(parseManagedProviders(output)).toContainEqual(expect.objectContaining({
      name: "机场订阅",
      type: "http",
      url: "https://sub.example.com/clash",
      interval: 7200,
      path: "./proxy_providers/机场订阅.yaml",
    }));
  });

  it("renames a provider, preserves advanced fields, and updates group references", () => {
    const output = mutateProviderYaml(source, {
      action: "update",
      originalName: "old-provider",
      provider: {
        name: "new-provider",
        type: "http",
        url: "https://new.example.com/sub",
        path: "./proxy_providers/new.yaml",
        interval: 1800,
        proxy: "DIRECT",
        healthCheck: { enable: false, url: "https://www.gstatic.com/generate_204", interval: 300, lazy: true },
      },
    });

    expect(output).toContain("User-Agent:");
    expect(output).toContain("- mihomo");
    expect(output).not.toContain("old-provider:");
    expect(output).toContain("- new-provider");
  });

  it("deletes a provider and removes its group references", () => {
    const output = mutateProviderYaml(source, { action: "delete", name: "old-provider" });

    expect(parseManagedProviders(output)).toEqual([]);
    expect(output).not.toContain("- old-provider");
    expect(output).toContain("mixed-port: 7890");
  });

  it("rejects duplicate names and unsafe provider paths", () => {
    expect(() => mutateProviderYaml(source, {
      action: "create",
      provider: { name: "old-provider", type: "http", url: "https://new.example.com", interval: 3600 },
    })).toThrow("已经存在");

    expect(() => mutateProviderYaml(source, {
      action: "create",
      provider: { name: "unsafe", type: "http", url: "https://new.example.com", path: "../../escape.yaml", interval: 3600 },
    })).toThrow("路径");

    expect(() => mutateProviderYaml(source, {
      action: "create",
      provider: { name: "same-path", type: "http", url: "https://new.example.com", path: "./proxy_providers/old.yaml", interval: 3600 },
    })).toThrow("路径已经被");
  });
});

describe("current subscription switching", () => {
  const subscriptionSource = `# keep this comment
proxy-providers:
  airport-a:
    type: http
    url: https://a.example.com/sub
    path: ./proxy_providers/a.yaml
    interval: 3600
  airport-b:
    type: http
    url: https://b.example.com/sub
    path: ./proxy_providers/b.yaml
    interval: 3600
proxy-groups:
  - name: PROXY
    type: select
    use:
      - airport-a
    proxies:
      - DIRECT
  - name: AUTO
    type: url-test
    use:
      - airport-a
  - name: unmanaged
    type: url-test
    use:
      - external-source
`;

  it("lists only configured subscriptions and derives the current one from groups", () => {
    expect(getSubscriptionState(subscriptionSource)).toEqual({
      providers: ["airport-a", "airport-b"],
      activeProvider: "airport-a",
    });
  });

  it("switches every group backed by the current subscription without rewriting unrelated use entries", () => {
    const output = switchSubscriptionYaml(subscriptionSource, "airport-b");

    expect(output).toContain("# keep this comment");
    expect(output).toContain("- airport-b");
    expect(output).not.toContain("- airport-a");
    expect(output).toContain("- external-source");
    expect(getSubscriptionState(output).activeProvider).toBe("airport-b");
  });

  it("rejects selecting a name that is not a configured subscription", () => {
    expect(() => switchSubscriptionYaml(subscriptionSource, "PROXY")).toThrow(expect.objectContaining({
      code: "ACTIVE_PROVIDER_NOT_FOUND",
    }));
  });
});

describe("subscription switching edge cases", () => {
  const managedSource = `proxy-providers:
  airport-a:
    type: http
    url: https://a.example.com/sub
    path: ./proxy_providers/a.yaml
  airport-b:
    type: http
    url: https://b.example.com/sub
    path: ./proxy_providers/b.yaml
proxy-groups:
  - name: 我的优选
    type: url-test
    use:
      - airport-b
    filter: ^(?:B1)$
  - name: PROXY
    type: select
    proxies:
      - 我的优选
    use:
      - airport-a
`;
  const metadata = { version: 1, groups: { 我的优选: { nodes: [{ provider: "airport-b", name: "B1" }] } } };

  it("ignores panel-managed auto groups when reading and switching the active subscription", () => {
    expect(getSubscriptionState(managedSource, metadata).activeProvider).toBe("airport-a");
    const output = switchSubscriptionYaml(managedSource, "airport-b", metadata);
    const groups = parseDocument(output).toJSON()["proxy-groups"];
    expect(groups[0].use).toEqual(["airport-b"]);
    expect(groups[0].filter).toBe("^(?:B1)$");
    expect(groups[1].use).toEqual(["airport-b"]);
    const back = switchSubscriptionYaml(output, "airport-a", metadata);
    expect(parseDocument(back).toJSON()["proxy-groups"][0].use).toEqual(["airport-b"]);
  });

  it("attaches the chosen subscription to PROXY when no group uses a subscription yet", () => {
    const fresh = `proxy-providers:
  new-sub:
    type: http
    url: https://n.example.com/sub
    path: ./proxy_providers/n.yaml
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - DIRECT
`;
    const output = switchSubscriptionYaml(fresh, "new-sub");
    expect(parseDocument(output).toJSON()["proxy-groups"][0]).toMatchObject({ proxies: ["DIRECT"], use: ["new-sub"] });
    expect(getSubscriptionState(output).activeProvider).toBe("new-sub");
  });

  it("keeps groups loadable when their only provider is deleted", () => {
    const twoProviders = `proxy-providers:
  airport-a:
    type: http
    url: https://a.example.com/sub
    path: ./proxy_providers/a.yaml
  airport-b:
    type: http
    url: https://b.example.com/sub
    path: ./proxy_providers/b.yaml
proxy-groups:
  - name: PROXY
    type: select
    use:
      - airport-a
  - name: 手动
    type: select
    proxies:
      - DIRECT
    use:
      - airport-a
`;
    const switched = mutateProviderYaml(twoProviders, { action: "delete", name: "airport-a" });
    expect(parseDocument(switched).toJSON()["proxy-groups"][0].use).toEqual(["airport-b"]);
    expect(parseDocument(switched).toJSON()["proxy-groups"][1]).toMatchObject({ proxies: ["DIRECT"], use: ["airport-b"] });
    expect(getSubscriptionState(switched).activeProvider).toBe("airport-b");
    const empty = mutateProviderYaml(switched, { action: "delete", name: "airport-b" });
    const group = parseDocument(empty).toJSON()["proxy-groups"][0];
    expect(group.proxies).toEqual(["DIRECT"]);
    expect(group.use).toBeUndefined();
  });
});

describe("core settings persistence", () => {
  it("validates core options and writes them into config.yaml without losing comments", async () => {
    const { applyCoreSettingsYaml, normalizeCorePatch } = await import("./provider-config.mjs");
    const patch = normalizeCorePatch({ mode: "Global", allowLan: false, ipv6: true, mixedPort: 7891 });
    expect(patch).toEqual({ mode: "global", "allow-lan": false, ipv6: true, "mixed-port": 7891 });
    const output = applyCoreSettingsYaml("# my comment\nmixed-port: 7890\nmode: rule\n", patch);
    expect(output).toContain("# my comment");
    expect(parseDocument(output).toJSON()).toMatchObject(patch);
    expect(() => normalizeCorePatch({ mode: "tun" })).toThrow("代理模式");
    expect(() => normalizeCorePatch({ mixedPort: 70000 })).toThrow("混合端口");
    expect(() => normalizeCorePatch({ allowLan: "yes" })).toThrow();
    expect(() => normalizeCorePatch({})).toThrow();
  });

  it("drops the inline placeholder payload when it becomes a real subscription", () => {
    const starter = `proxy-providers:
  subscription-1:
    type: inline
    payload:
      - name: subscription-placeholder
        type: direct
proxy-groups:
  - name: PROXY
    type: select
    use:
      - subscription-1
`;
    const output = mutateProviderYaml(starter, {
      action: "update",
      originalName: "subscription-1",
      provider: { name: "subscription-1", type: "http", url: "https://sub.example.com/x", interval: 3600 },
    });
    const provider = parseDocument(output).toJSON()["proxy-providers"]["subscription-1"];
    expect(provider).toMatchObject({ type: "http", url: "https://sub.example.com/x" });
    expect(provider.payload).toBeUndefined();
  });
});
