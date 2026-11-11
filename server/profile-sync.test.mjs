import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocument } from "yaml";
import { buildSubscriptionConfig, convertProfileGroups, parseProfile, repairRuleTargets } from "./profile-sync.mjs";
import { ProviderConfigStore } from "./provider-store.mjs";

// A typical subconverter-generated airport profile.
const PROFILE = `
mixed-port: 7890
allow-lan: false
mode: rule
dns:
  enable: true
  listen: 0.0.0.0:53
  enhanced-mode: fake-ip
proxies:
  - {name: 香港 01, type: ss, server: a.example, port: 1, cipher: aes-128-gcm, password: x}
  - {name: 香港 02, type: ss, server: a.example, port: 2, cipher: aes-128-gcm, password: x}
  - {name: 日本 01, type: ss, server: a.example, port: 3, cipher: aes-128-gcm, password: x}
proxy-groups:
  - {name: 🚀 节点选择, type: select, proxies: [♻️ 自动选择, 🇭🇰 香港节点, DIRECT, 香港 01, 香港 02, 日本 01]}
  - {name: ♻️ 自动选择, type: url-test, url: http://www.gstatic.com/generate_204, interval: 300, proxies: [香港 01, 香港 02, 日本 01]}
  - {name: 🇭🇰 香港节点, type: url-test, url: http://www.gstatic.com/generate_204, interval: 300, proxies: [香港 01, 香港 02]}
  - {name: 🐟 漏网之鱼, type: select, proxies: [🚀 节点选择, DIRECT]}
rule-providers:
  ads: {type: http, behavior: domain, url: https://rules.example/ads.yaml, path: ./ruleset/ads.yaml, interval: 86400}
rules:
  - RULE-SET,ads,REJECT
  - DOMAIN-SUFFIX,github.com,🚀 节点选择
  - DOMAIN,special.example,日本 01
  - AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT
  - GEOIP,CN,DIRECT
  - MATCH,🐟 漏网之鱼
`;

const BASE = `# my NAS config
mixed-port: 7890
allow-lan: true
mode: global
external-controller: 0.0.0.0:9090
proxy-providers:
  Hneko:
    type: http
    url: https://sub.example/link?token=1
    path: ./proxy_providers/hneko.yaml
proxy-groups:
  - name: PROXY
    type: select
    proxies: [DIRECT, 我的优选]
    use: [Hneko]
  - name: 我的优选
    type: url-test
    use: [Hneko]
    filter: ^(?:香港 01)$
rules:
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
`;
const METADATA = { version: 1, groups: { 我的优选: { nodes: [{ provider: "Hneko", name: "香港 01" }] } } };

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("subscription profiles (Clash Verge style)", () => {
  it("ignores node-only or non-Clash subscriptions", () => {
    expect(parseProfile("dm1lc3M6Ly9leGFtcGxl")).toBeNull();
    expect(parseProfile("proxies:\n  - {name: a, type: direct}\n")).toBeNull();
    expect(parseProfile(PROFILE)?.rules).toHaveLength(6);
  });

  it("rewires explicit node lists to the provider and keeps group references", () => {
    const profile = parseProfile(PROFILE);
    const [main, auto, hk, fish] = convertProfileGroups(profile.groups, "Hneko", profile.nodeNames);
    expect(main).toMatchObject({ proxies: ["♻️ 自动选择", "🇭🇰 香港节点", "DIRECT"], use: ["Hneko"] });
    expect(main.filter).toBeUndefined();
    expect(auto).toMatchObject({ use: ["Hneko"] });
    expect(auto.proxies).toBeUndefined();
    expect(hk.filter).toBe("^(?:香港 01|香港 02)$");
    expect(fish).toEqual({ name: "🐟 漏网之鱼", type: "select", proxies: ["🚀 节点选择", "DIRECT"] });
  });

  it("repairs rules that target a node or a missing group", () => {
    const { rules, repaired } = repairRuleTargets(
      ["DOMAIN,special.example,日本 01", "MATCH,PROXY", "AND,((DOMAIN,a.com)),REJECT", "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve"],
      new Set(["🚀 节点选择"]),
      "🚀 节点选择",
    );
    expect(rules).toEqual(["DOMAIN,special.example,🚀 节点选择", "MATCH,🚀 节点选择", "AND,((DOMAIN,a.com)),REJECT", "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve"]);
    expect(repaired).toBe(2);
  });

  it("merges the profile's groups and rules while keeping base settings and custom groups", () => {
    const built = buildSubscriptionConfig(BASE, { provider: "Hneko", profile: parseProfile(PROFILE), metadata: METADATA, snapshot: null, state: null });
    const config = parseDocument(built.yaml).toJSON();
    expect(built.yaml).toContain("# my NAS config");
    // Base settings win over the profile's.
    expect(config).toMatchObject({ "allow-lan": true, mode: "global", "mixed-port": 7890 });
    expect(config["external-controller"]).toBe("0.0.0.0:9090");
    // Profile extras fill gaps, without making the core a DNS server.
    expect(config.dns).toEqual({ enable: true, "enhanced-mode": "fake-ip" });
    expect(config.rules).toHaveLength(6);
    expect(config.rules).toContain("DOMAIN,special.example,🚀 节点选择");
    expect(config["rule-providers"].ads.behavior).toBe("domain");
    const names = config["proxy-groups"].map((group) => group.name);
    expect(names).toEqual(["🚀 节点选择", "♻️ 自动选择", "🇭🇰 香港节点", "🐟 漏网之鱼", "我的优选"]);
    // The custom auto group joins the subscription's main selector.
    expect(config["proxy-groups"][0].proxies).toContain("我的优选");
    expect(built.state).toMatchObject({ mode: "profile", provider: "Hneko", ruleCount: 6, groupCount: 5, injectedKeys: ["dns"], repairedRules: 1 });
    expect(built.snapshot.rules).toEqual(["GEOIP,CN,DIRECT", "MATCH,PROXY"]);
    expect(built.snapshot["proxy-groups"].map((group) => group.name)).toEqual(["PROXY"]);
  });

  it("restores the local groups and rules for a subscription without rules", () => {
    const first = buildSubscriptionConfig(BASE, { provider: "Hneko", profile: parseProfile(PROFILE), metadata: METADATA, snapshot: null, state: null });
    const back = buildSubscriptionConfig(first.yaml, { provider: "Hneko", profile: null, metadata: METADATA, snapshot: first.snapshot, state: first.state });
    const config = parseDocument(back.yaml).toJSON();
    expect(config.rules).toEqual(["GEOIP,CN,DIRECT", "MATCH,PROXY"]);
    expect(config.dns).toBeUndefined();
    expect(config["rule-providers"]).toBeUndefined();
    expect(config["proxy-groups"].map((group) => group.name)).toEqual(["PROXY", "我的优选"]);
    expect(config["proxy-groups"][0].proxies).toContain("我的优选");
    expect(back.state.mode).toBe("local");
  });

  it("downloads, applies, caches and rolls back through the store", async () => {
    const root = await mkdtemp(join(tmpdir(), "mopanel-profile-"));
    roots.push(root);
    const configPath = join(root, "config.yaml");
    await writeFile(configPath, BASE, "utf8");
    let online = true;
    const fetchProfile = vi.fn(async () => {
      if (!online) throw new Error("timeout");
      return PROFILE;
    });
    const store = new ProviderConfigStore(configPath, { fetchProfile });
    const reload = vi.fn(async () => undefined);

    const state = await store.selectSubscription("Hneko", reload);
    expect(fetchProfile).toHaveBeenCalledWith("https://sub.example/link?token=1");
    expect(state.ruleSource).toMatchObject({ mode: "profile", provider: "Hneko", ruleCount: 6 });
    expect(reload).toHaveBeenCalledTimes(1);

    // Unchanged profile: no reload.
    await store.syncActiveSubscription(reload);
    expect(reload).toHaveBeenCalledTimes(1);

    // Offline: the cached profile keeps the rules, with a warning.
    online = false;
    const offline = await store.syncActiveSubscription(reload);
    expect(offline.ruleSource).toMatchObject({ mode: "profile", ruleCount: 6 });
    expect(offline.ruleSource.warning).toContain("上次下载");

    // A rejected reload restores the previous config.
    online = true;
    const before = await readFile(configPath, "utf8");
    fetchProfile.mockResolvedValueOnce(PROFILE.replace("GEOIP,CN,DIRECT", "GEOIP,JP,DIRECT"));
    await expect(store.syncActiveSubscription(vi.fn(async () => { throw new Error("Mihomo 拒绝重载"); }))).rejects.toThrow("拒绝重载");
    expect(await readFile(configPath, "utf8")).toBe(before);
  });

  it("never rewrites a local-rules config during a background sync", async () => {
    const root = await mkdtemp(join(tmpdir(), "mopanel-profile-"));
    roots.push(root);
    const configPath = join(root, "config.yaml");
    const local = BASE
      .replace("proxy-groups:", "  other:\n    type: file\n    path: ./other.yaml\nproxy-groups:")
      .replace("rules:", "  - {name: 媒体, type: select, use: [other]}\nrules:");
    await writeFile(configPath, local, "utf8");
    const store = new ProviderConfigStore(configPath, { fetchProfile: vi.fn(async () => "proxies: []\n") });
    const reload = vi.fn(async () => undefined);

    const state = await store.syncActiveSubscription(reload);
    expect(state.ruleSource).toMatchObject({ mode: "local" });
    expect(state.ruleSource.warning).toContain("只提供节点");
    expect(await readFile(configPath, "utf8")).toBe(local);
    expect(reload).not.toHaveBeenCalled();
  });
});
