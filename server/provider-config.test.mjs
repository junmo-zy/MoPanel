import { describe, expect, it } from "vitest";
import { mutateProviderYaml, parseManagedProviders } from "./provider-config.mjs";

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
