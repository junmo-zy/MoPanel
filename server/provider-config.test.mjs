import { describe, expect, it } from "vitest";
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
