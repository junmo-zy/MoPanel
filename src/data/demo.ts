import type { MihomoClient, OverviewData, ProxyMode, ProxyNode } from "../api/types";

export const demoOverview: OverviewData = {
  connected: true,
  version: "演示数据",
  mode: "rule",
  mixedPort: 7890,
  allowLan: false,
  downloadTotal: 18_600_000,
  uploadTotal: 3_200_000,
  connectionCount: 126,
  tcpCount: 98,
  udpCount: 28,
  groups: [
    {
      name: "自动选择",
      type: "URLTest",
      current: "香港 01",
      delay: 42,
      nodes: [
        { name: "香港 01", type: "VLESS", delay: 42, alive: true },
        { name: "新加坡 01", type: "Hysteria2", delay: 65, alive: true },
        { name: "日本 02", type: "VLESS", delay: 78, alive: true },
      ],
    },
    {
      name: "国外媒体",
      type: "Selector",
      current: "日本 02",
      delay: 78,
      nodes: [
        { name: "日本 02", type: "VLESS", delay: 78, alive: true },
        { name: "新加坡 01", type: "Hysteria2", delay: 65, alive: true },
      ],
    },
    {
      name: "人工选择",
      type: "Selector",
      current: "新加坡 01",
      delay: 65,
      nodes: [
        { name: "新加坡 01", type: "Hysteria2", delay: 65, alive: true },
        { name: "香港 01", type: "VLESS", delay: 42, alive: true },
        { name: "美国 01", type: "VLESS", delay: 138, alive: true },
      ],
    },
  ],
  providers: [
    {
      name: "机场订阅",
      vehicleType: "HTTP",
      updatedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      proxyCount: 12,
    },
  ],
  providerNodes: [
    { provider: "机场订阅", name: "香港 01", type: "VLESS", delay: 42, alive: true },
    { provider: "机场订阅", name: "新加坡 01", type: "Hysteria2", delay: 65, alive: true },
    { provider: "机场订阅", name: "日本 02", type: "VLESS", delay: 78, alive: true },
    { provider: "机场订阅", name: "美国 01", type: "VLESS", delay: 138, alive: true },
  ],
};

export function createDemoClient(): MihomoClient {
  let snapshot = structuredClone(demoOverview);

  return {
    async getOverview() {
      return structuredClone(snapshot);
    },
    async setMode(mode: ProxyMode) {
      snapshot = { ...snapshot, mode };
    },
    async selectProxy(groupName: string, nodeName: string) {
      snapshot = {
        ...snapshot,
        groups: snapshot.groups.map((group) => {
          if (group.name !== groupName) return group;
          const node = group.nodes.find((item) => item.name === nodeName);
          return { ...group, current: nodeName, delay: node?.delay ?? null };
        }),
      };
    },
    async testProxy(node: ProxyNode) {
      const match = snapshot.groups.flatMap((group) => group.nodes).find((item) => item.name === node.name);
      return match?.delay ?? 0;
    },
    async updateProvider() {
      snapshot = {
        ...snapshot,
        providers: snapshot.providers.map((provider) => ({ ...provider, updatedAt: new Date().toISOString() })),
      };
    },
    async getRules() {
      return [
        { type: "DomainSuffix", payload: "github.com", proxy: "自动选择" },
        { type: "DomainKeyword", payload: "google", proxy: "国外媒体" },
        { type: "RuleSet", payload: "广告拦截", proxy: "REJECT" },
        { type: "GeoIP", payload: "CN", proxy: "DIRECT" },
        { type: "Match", payload: "", proxy: "人工选择" },
      ];
    },
    async getRuleProviders() {
      return [{ name: "广告拦截", behavior: "Domain", format: "YamlRule", vehicleType: "HTTP", ruleCount: 1280, updatedAt: snapshot.providers[0]?.updatedAt ?? null }];
    },
    async updateRuleProvider() {
      return undefined;
    },
    async getConnections() {
      return {
        downloadTotal: snapshot.downloadTotal,
        uploadTotal: snapshot.uploadTotal,
        connections: [
          {
            id: "demo-1",
            network: "TCP",
            host: "github.com",
            destination: "140.82.112.4:443",
            process: "chrome.exe",
            chain: "自动选择 → 香港 01",
            rule: "DomainSuffix · github.com",
            upload: 58_240,
            download: 468_320,
            start: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          },
          {
            id: "demo-2",
            network: "UDP",
            host: "dns.google",
            destination: "8.8.8.8:53",
            process: "mihomo",
            chain: "DIRECT",
            rule: "GeoIP · CN",
            upload: 1_024,
            download: 2_048,
            start: new Date(Date.now() - 30 * 1000).toISOString(),
          },
        ],
      };
    },
    async closeConnection() {
      return undefined;
    },
    async closeAllConnections() {
      return undefined;
    },
    async updateConfig(patch) {
      snapshot = {
        ...snapshot,
        allowLan: patch.allowLan ?? snapshot.allowLan,
        mixedPort: patch.mixedPort ?? snapshot.mixedPort,
      };
    },
  };
}
