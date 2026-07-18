import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  createAutoGroupMetadata,
  mutateAutoGroupYaml,
  parseManagedAutoGroups,
} from "./provider-config.mjs";

const source = `# keep this comment
mixed-port: 7890
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
    proxies:
      - DIRECT
`;

describe("managed auto group YAML mutations", () => {
  it("adds a newly created managed group to the PROXY selector", () => {
    const result = mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });

    const proxy = parse(result.yaml)["proxy-groups"].find((group) => group.name === "PROXY");
    expect(proxy.proxies).toEqual(["DIRECT", "my-auto"]);
  });

  it("creates a URLTest group with exact selected provider nodes", () => {
    const metadata = createAutoGroupMetadata();
    const result = mutateAutoGroupYaml(source, metadata, {
      action: "create",
      group: {
        name: "我的优选",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [
          { provider: "airport-a", name: "香港 01" },
          { provider: "airport-b", name: "日本 (02)" },
        ],
      },
    });

    expect(result.yaml).toContain("# keep this comment");
    expect(result.yaml).toContain("name: 我的优选");
    expect(result.yaml).toContain("type: url-test");
    expect(result.yaml).toContain("filter: ^(?:香港 01|日本 \\(02\\))$");
    expect(result.metadata.groups["我的优选"].nodes).toEqual([
      { provider: "airport-a", name: "香港 01" },
      { provider: "airport-b", name: "日本 (02)" },
    ]);
    expect(parseManagedAutoGroups(result.yaml, result.metadata)).toEqual([
      {
        name: "我的优选",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [
          { provider: "airport-a", name: "香港 01" },
          { provider: "airport-b", name: "日本 (02)" },
        ],
      },
    ]);
  });

  it("renames and deletes only groups tracked by its sidecar metadata", () => {
    const created = mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "old-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });

    const updated = mutateAutoGroupYaml(created.yaml, created.metadata, {
      action: "update",
      originalName: "old-auto",
      group: {
        name: "new-auto",
        url: "https://cp.cloudflare.com/generate_204",
        interval: 600,
        tolerance: 20,
        nodes: [{ provider: "airport-b", name: "Tokyo 01" }],
      },
    });
    expect(parseManagedAutoGroups(updated.yaml, updated.metadata)).toEqual([{
      name: "new-auto",
      url: "https://cp.cloudflare.com/generate_204",
      interval: 600,
      tolerance: 20,
      nodes: [{ provider: "airport-b", name: "Tokyo 01" }],
    }]);
    expect(updated.metadata.groups["old-auto"]).toBeUndefined();

    const deleted = mutateAutoGroupYaml(updated.yaml, updated.metadata, {
      action: "delete",
      name: "new-auto",
    });
    expect(parseManagedAutoGroups(deleted.yaml, deleted.metadata)).toEqual([]);
    expect(deleted.yaml).not.toContain("name: new-auto");
  });

  it("updates proxies and use references when a managed group is renamed", () => {
    const sourceWithReferences = `${source}  - name: OTHER
    type: select
    proxies:
      - old-auto
    use:
      - old-auto
`;
    const created = mutateAutoGroupYaml(sourceWithReferences, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "old-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });

    const updated = mutateAutoGroupYaml(created.yaml, created.metadata, {
      action: "update",
      originalName: "old-auto",
      group: {
        name: "new-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });
    const groups = parse(updated.yaml)["proxy-groups"];

    expect(groups.find((group) => group.name === "PROXY").proxies).toEqual(["DIRECT", "new-auto"]);
    expect(groups.find((group) => group.name === "OTHER")).toMatchObject({
      proxies: ["new-auto"],
      use: ["new-auto"],
    });
  });

  it("removes proxies and use references when a managed group is deleted", () => {
    const sourceWithReferences = `${source}  - name: OTHER
    type: select
    proxies:
      - old-auto
    use:
      - old-auto
`;
    const created = mutateAutoGroupYaml(sourceWithReferences, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "old-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });

    const deleted = mutateAutoGroupYaml(created.yaml, created.metadata, {
      action: "delete",
      name: "old-auto",
    });
    const groups = parse(deleted.yaml)["proxy-groups"];

    expect(groups.find((group) => group.name === "PROXY").proxies).toEqual(["DIRECT"]);
    expect(groups.find((group) => group.name === "OTHER")).toMatchObject({
      proxies: [],
      use: [],
    });
  });

  it("attaches a legacy managed group to the PROXY selector", () => {
    const created = mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });
    const legacyYaml = created.yaml.replace("      - my-auto\n", "");

    const attached = mutateAutoGroupYaml(legacyYaml, created.metadata, {
      action: "attach",
      name: "my-auto",
    });

    const proxy = parse(attached.yaml)["proxy-groups"].find((group) => group.name === "PROXY");
    expect(proxy.proxies).toEqual(["DIRECT", "my-auto"]);
    expect(attached.metadata).toEqual(created.metadata);
  });

  it("keeps an updated legacy managed group attached to the PROXY selector", () => {
    const created = mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });
    const legacyYaml = created.yaml.replace("      - my-auto\n", "");

    const updated = mutateAutoGroupYaml(legacyYaml, created.metadata, {
      action: "update",
      originalName: "my-auto",
      group: {
        name: "my-auto",
        url: "https://cp.cloudflare.com/generate_204",
        interval: 600,
        tolerance: 20,
        nodes: [{ provider: "airport-b", name: "Tokyo 01" }],
      },
    });

    const proxy = parse(updated.yaml)["proxy-groups"].find((group) => group.name === "PROXY");
    expect(proxy.proxies).toEqual(["DIRECT", "my-auto"]);
  });

  it("rejects automatic group creation without a usable PROXY selector", () => {
    const withoutProxySelector = source.replace(/proxy-groups:[\s\S]*$/, "proxy-groups: []\n");

    expect(() => mutateAutoGroupYaml(withoutProxySelector, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    })).toThrow(expect.objectContaining({ code: "PROXY_SELECTOR_NOT_FOUND" }));
  });

  it("does not edit a group that is not safely owned by the sidecar", () => {
    const created = mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [{ provider: "airport-a", name: "Hong Kong 01" }],
      },
    });
    const manuallyChangedYaml = created.yaml.replace("filter: ^(?:Hong Kong 01)$", "filter: .*" );

    expect(() => mutateAutoGroupYaml(manuallyChangedYaml, created.metadata, {
      action: "delete",
      name: "my-auto",
    })).toThrow(expect.objectContaining({ code: "AUTO_GROUP_CHANGED" }));
  });

  it("rejects malformed sidecar node references before using them", () => {
    expect(() => createAutoGroupMetadata({
      version: 1,
      groups: {
        broken: { nodes: [{ provider: "", name: "Hong Kong 01" }] },
      },
    })).toThrow(expect.objectContaining({ code: "INVALID_AUTO_GROUP_METADATA" }));
  });

  it("rejects the same node name when it comes from different providers", () => {
    expect(() => mutateAutoGroupYaml(source, createAutoGroupMetadata(), {
      action: "create",
      group: {
        name: "my-auto",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        nodes: [
          { provider: "airport-a", name: "Hong Kong 01" },
          { provider: "airport-b", name: "Hong Kong 01" },
        ],
      },
    })).toThrow(expect.objectContaining({ code: "DUPLICATE_AUTO_GROUP_NODE" }));
  });
});
