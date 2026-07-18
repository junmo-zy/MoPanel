import type {
  MihomoClient,
  ConnectionSnapshot,
  CoreConfigPatch,
  OverviewData,
  ProxyGroup,
  ProxyMode,
  ProxyNode,
  ProviderProxyNode,
  ProxyProvider,
} from "./types";

type Fetcher = typeof fetch;

interface RawProxy {
  name?: string;
  type?: string;
  now?: string;
  all?: string[];
  alive?: boolean;
  history?: Array<{ delay?: number }>;
}

interface RawProvider {
  name?: string;
  vehicleType?: string;
  updatedAt?: string;
  proxies?: RawProxy[];
}

function lastDelay(proxy: RawProxy | undefined): number | null {
  const history = proxy?.history;
  if (!history?.length) return null;
  const delay = history.at(-1)?.delay;
  return typeof delay === "number" && delay > 0 ? delay : null;
}

interface ProviderNode {
  proxy: RawProxy;
  provider?: string;
}

function mapNode(name: string, proxy: RawProxy | undefined, provider?: string): ProxyNode {
  return {
    name,
    type: proxy?.type || "Unknown",
    delay: lastDelay(proxy),
    alive: proxy?.alive !== false,
    ...(provider ? { provider } : {}),
  };
}

function indexProviderNodes(providers: Record<string, RawProvider>): Map<string, ProviderNode> {
  const nodes = new Map<string, ProviderNode>();
  for (const [key, provider] of Object.entries(providers)) {
    const providerName = provider.name || key;
    for (const proxy of provider.proxies || []) {
      if (!proxy.name || nodes.has(proxy.name)) continue;
      nodes.set(proxy.name, { proxy, provider: providerName });
    }
  }
  return nodes;
}

function mapGroups(proxies: Record<string, RawProxy>, providers: Record<string, RawProvider>): ProxyGroup[] {
  const providerNodes = indexProviderNodes(providers);
  const resolveNode = (name: string): ProviderNode | undefined => {
    const proxy = proxies[name];
    return proxy ? { proxy } : providerNodes.get(name);
  };

  return Object.entries(proxies)
    .filter(([, proxy]) => Array.isArray(proxy.all) && proxy.all.length > 0)
    .map(([key, group]) => {
      const current = group.now || group.all?.[0] || "DIRECT";
      const currentNode = resolveNode(current);
      return {
        name: group.name || key,
        type: group.type || "Selector",
        current,
        delay: lastDelay(currentNode?.proxy),
        nodes: (group.all || []).map((name) => {
          const node = resolveNode(name);
          return mapNode(name, node?.proxy, node?.provider);
        }),
      };
    });
}

function mapProviders(providers: Record<string, RawProvider>): ProxyProvider[] {
  return Object.entries(providers).map(([key, provider]) => ({
    name: provider.name || key,
    vehicleType: provider.vehicleType || "Unknown",
    updatedAt: provider.updatedAt || null,
    proxyCount: provider.proxies?.length || 0,
  }));
}

function mapProviderNodes(providers: Record<string, RawProvider>): ProviderProxyNode[] {
  return Object.entries(providers).flatMap(([key, provider]) => {
    const providerName = provider.name || key;
    return (provider.proxies || [])
      .filter((proxy): proxy is RawProxy & { name: string } => Boolean(proxy.name))
      .map((proxy) => ({ ...mapNode(proxy.name, proxy, providerName), provider: providerName }));
  });
}

export function createMihomoClient(fetcher: Fetcher = fetch): MihomoClient {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`/api/mihomo${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Mihomo 请求失败：${response.status}`);
    }
    return response;
  }

  async function requestJson<T>(path: string): Promise<T> {
    const response = await request(path);
    return response.json() as Promise<T>;
  }

  async function getConnections(): Promise<ConnectionSnapshot> {
    const data = await requestJson<{
      downloadTotal?: number;
      uploadTotal?: number;
      connections?: Array<{
        id?: string;
        metadata?: {
          network?: string;
          host?: string;
          destinationIP?: string;
          destinationPort?: string;
          process?: string;
          processPath?: string;
        };
        chains?: string[];
        rule?: string;
        rulePayload?: string;
        upload?: number;
        download?: number;
        start?: string;
      }>;
    }>("/connections");

    return {
      downloadTotal: data.downloadTotal || 0,
      uploadTotal: data.uploadTotal || 0,
      connections: (data.connections || []).map((connection, index) => {
        const metadata = connection.metadata || {};
        const destination = [metadata.destinationIP, metadata.destinationPort].filter(Boolean).join(":");
        const rule = [connection.rule, connection.rulePayload].filter(Boolean).join(" · ");
        return {
          id: connection.id || `connection-${index}`,
          network: (metadata.network || "unknown").toUpperCase(),
          host: metadata.host || metadata.destinationIP || "未知目标",
          destination: destination || "—",
          process: metadata.process || metadata.processPath || "未知进程",
          chain: [...(connection.chains || [])].reverse().join(" → ") || "DIRECT",
          rule: rule || "—",
          upload: connection.upload || 0,
          download: connection.download || 0,
          start: connection.start || "",
        };
      }),
    };
  }

  return {
    async setMode(mode: ProxyMode) {
      await request("/configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
    },

    async getOverview(): Promise<OverviewData> {
      const [versionData, configData, proxyData, providerData, connectionData] = await Promise.all([
        requestJson<{ version?: string }>("/version"),
        requestJson<{ mode?: ProxyMode; "mixed-port"?: number; "allow-lan"?: boolean }>("/configs"),
        requestJson<{ proxies?: Record<string, RawProxy> }>("/proxies"),
        requestJson<{ providers?: Record<string, RawProvider> }>("/providers/proxies"),
        requestJson<{
          downloadTotal?: number;
          uploadTotal?: number;
          connections?: Array<{ metadata?: { network?: string } }>;
        }>("/connections"),
      ]);
      const connections = connectionData.connections || [];

      return {
        connected: true,
        version: versionData.version || "未知版本",
        mode: configData.mode || "rule",
        mixedPort: configData["mixed-port"] ?? null,
        allowLan: configData["allow-lan"] === true,
        downloadTotal: connectionData.downloadTotal || 0,
        uploadTotal: connectionData.uploadTotal || 0,
        connectionCount: connections.length,
        tcpCount: connections.filter((item) => item.metadata?.network?.toLowerCase() === "tcp").length,
        udpCount: connections.filter((item) => item.metadata?.network?.toLowerCase() === "udp").length,
        groups: mapGroups(proxyData.proxies || {}, providerData.providers || {}),
        providers: mapProviders(providerData.providers || {}),
        providerNodes: mapProviderNodes(providerData.providers || {}),
      };
    },

    async selectProxy(group: string, node: string) {
      await request(`/proxies/${encodeURIComponent(group)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: node }),
      });
    },

    async testProxy(node: ProxyNode, testUrl: string) {
      const params = new URLSearchParams({
        url: testUrl,
        timeout: "5000",
      });
      const path = node.provider
        ? `/providers/proxies/${encodeURIComponent(node.provider)}/${encodeURIComponent(node.name)}/healthcheck`
        : `/proxies/${encodeURIComponent(node.name)}/delay`;
      const result = await requestJson<{ delay?: number }>(
        `${path}?${params.toString()}`,
      );
      return typeof result.delay === "number" ? result.delay : 0;
    },

    async testGroup(group: string, testUrl: string) {
      const params = new URLSearchParams({ url: testUrl, timeout: "5000" });
      const result = await requestJson<Record<string, unknown>>(
        `/group/${encodeURIComponent(group)}/delay?${params.toString()}`,
      );
      return Object.fromEntries(
        Object.entries(result).filter(([, delay]) => typeof delay === "number"),
      ) as Record<string, number>;
    },

    async updateProvider(name: string) {
      await request(`/providers/proxies/${encodeURIComponent(name)}`, { method: "PUT" });
    },

    getConnections,

    async closeConnection(id: string) {
      await request(`/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    async closeAllConnections() {
      await request("/connections", { method: "DELETE" });
    },

    async updateConfig(patch: CoreConfigPatch) {
      const body: Record<string, boolean | number> = {};
      if (patch.allowLan !== undefined) body["allow-lan"] = patch.allowLan;
      if (patch.ipv6 !== undefined) body.ipv6 = patch.ipv6;
      if (patch.mixedPort !== undefined) body["mixed-port"] = patch.mixedPort;
      await request("/configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}
