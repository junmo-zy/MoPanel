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
  RuleItem,
  RuleProviderItem,
} from "./types";

type Fetcher = typeof fetch;

interface RawProxy {
  name?: string;
  type?: string;
  now?: string;
  all?: string[];
  alive?: boolean;
  hidden?: boolean;
  udp?: boolean;
  icon?: string;
  testUrl?: string;
  history?: Array<{ delay?: number }>;
}

interface RawProvider {
  name?: string;
  vehicleType?: string;
  updatedAt?: string;
  subscriptionInfo?: { Upload?: number; Download?: number; Total?: number; Expire?: number };
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
    ...(typeof proxy?.udp === "boolean" ? { udp: proxy.udp } : {}),
  };
}

// Mihomo exposes every proxy group as a virtual "Compatible" provider (plus a
// "default" one). They are not subscriptions and their entries are groups or
// built-ins, so they must never be shown as subscriptions or used as the
// provider of a node.
function isSubscriptionProvider(provider: RawProvider) {
  return (provider.vehicleType || "").toLowerCase() !== "compatible";
}

function subscriptionProviders(providers: Record<string, RawProvider>): Array<[string, RawProvider]> {
  return Object.entries(providers).filter(([, provider]) => isSubscriptionProvider(provider));
}

function indexProviderNodes(providers: Record<string, RawProvider>): Map<string, ProviderNode> {
  const nodes = new Map<string, ProviderNode>();
  for (const [key, provider] of subscriptionProviders(providers)) {
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
    const providerNode = providerNodes.get(name);
    const proxy = proxies[name];
    if (providerNode) return { proxy: proxy || providerNode.proxy, provider: providerNode.provider };
    return proxy ? { proxy } : undefined;
  };

  // A group's delay is the delay of the node actually carrying traffic, so
  // follow nested groups (PROXY -> 自动选择 -> 香港 01) down to the leaf.
  const effectiveDelay = (name: string, visited = new Set<string>()): number | null => {
    const proxy = proxies[name];
    if (proxy && Array.isArray(proxy.all) && proxy.now && !visited.has(name)) {
      visited.add(name);
      return effectiveDelay(proxy.now, visited);
    }
    return lastDelay(resolveNode(name)?.proxy);
  };

  const entries = Object.entries(proxies)
    .filter(([key, proxy]) => Array.isArray(proxy.all) && proxy.all.length > 0 && (proxy.hidden !== true || key === "GLOBAL"));

  // /proxies is a JSON object keyed by name, so its order is alphabetical.
  // Mihomo's virtual "default" provider lists every proxy group in config
  // order; a user-defined GLOBAL does not, so it is only a fallback.
  const orderSource = [
    ...(providers.default?.proxies || []).map((proxy) => proxy.name || ""),
    ...(proxies.GLOBAL?.all || []),
  ];
  const configuredOrder = new Map<string, number>();
  for (const name of orderSource) {
    if (name && !configuredOrder.has(name)) configuredOrder.set(name, configuredOrder.size);
  }
  const orderOf = (key: string) => (key === "GLOBAL" ? Number.MAX_SAFE_INTEGER : configuredOrder.get(key) ?? Number.MAX_SAFE_INTEGER - 1);
  entries.sort(([left], [right]) => orderOf(left) - orderOf(right));

  return entries
    .map(([key, group]) => {
      const current = group.now || group.all?.[0] || "DIRECT";
      return {
        name: group.name || key,
        type: group.type || "Selector",
        current,
        delay: effectiveDelay(current, new Set([group.name || key])),
        ...(group.icon ? { icon: group.icon } : {}),
        ...(group.testUrl ? { testUrl: group.testUrl } : {}),
        nodes: (group.all || []).map((name) => {
          const node = resolveNode(name);
          return mapNode(name, node?.proxy, node?.provider);
        }),
      };
    });
}

function mapProviders(providers: Record<string, RawProvider>): ProxyProvider[] {
  return subscriptionProviders(providers).map(([key, provider]) => ({
    name: provider.name || key,
    vehicleType: provider.vehicleType || "Unknown",
    updatedAt: provider.updatedAt && !provider.updatedAt.startsWith("0001-") ? provider.updatedAt : null,
    proxyCount: provider.proxies?.length || 0,
    ...(provider.subscriptionInfo ? {
      subscriptionInfo: {
        upload: Number(provider.subscriptionInfo.Upload) || 0,
        download: Number(provider.subscriptionInfo.Download) || 0,
        total: Number(provider.subscriptionInfo.Total) || 0,
        expire: Number(provider.subscriptionInfo.Expire) || 0,
      },
    } : {}),
  }));
}

function mapProviderNodes(providers: Record<string, RawProvider>): ProviderProxyNode[] {
  return subscriptionProviders(providers).flatMap(([key, provider]) => {
    const providerName = provider.name || key;
    return (provider.proxies || [])
      .filter((proxy): proxy is RawProxy & { name: string } => Boolean(proxy.name))
      .map((proxy) => ({ ...mapNode(proxy.name, proxy, providerName), provider: providerName }));
  });
}

export interface RawConnection {
  id?: string;
  metadata?: {
    network?: string;
    type?: string;
    host?: string;
    sourceIP?: string;
    sourcePort?: string;
    destinationIP?: string;
    destinationPort?: string;
    process?: string;
    processPath?: string;
    sniffHost?: string;
    dnsMode?: string;
    inboundName?: string;
    remoteDestination?: string;
  };
  chains?: string[];
  rule?: string;
  rulePayload?: string;
  upload?: number;
  download?: number;
  start?: string;
}

export interface RawConnectionSnapshot {
  downloadTotal?: number;
  uploadTotal?: number;
  connections?: RawConnection[] | null;
}

function joinAddress(host?: string, port?: string) {
  if (!host) return "";
  return port ? `${host.includes(":") ? `[${host}]` : host}:${port}` : host;
}

// Shared by the REST snapshot and the /connections WebSocket stream.
export function mapConnectionSnapshot(data: RawConnectionSnapshot): ConnectionSnapshot {
  return {
    downloadTotal: data.downloadTotal || 0,
    uploadTotal: data.uploadTotal || 0,
    connections: (data.connections || []).map((connection, index) => {
      const metadata = connection.metadata || {};
      const destination = joinAddress(metadata.destinationIP, metadata.destinationPort);
      const rule = [connection.rule, connection.rulePayload].filter(Boolean).join(" · ");
      const chains = [...(connection.chains || [])].reverse();
      return {
        id: connection.id || `connection-${index}`,
        network: (metadata.network || "unknown").toUpperCase(),
        host: metadata.host || metadata.sniffHost || metadata.destinationIP || "未知目标",
        destination: destination || "—",
        process: metadata.process || metadata.processPath?.split(/[\\/]/).pop() || "未知进程",
        chain: chains.join(" → ") || "DIRECT",
        rule: rule || "—",
        upload: connection.upload || 0,
        download: connection.download || 0,
        start: connection.start || "",
        type: metadata.type,
        source: joinAddress(metadata.sourceIP, metadata.sourcePort) || undefined,
        chains,
        ruleType: connection.rule,
        rulePayload: connection.rulePayload,
        processPath: metadata.processPath,
        sniffHost: metadata.sniffHost,
        dnsMode: metadata.dnsMode,
        inbound: metadata.inboundName,
        remoteDestination: metadata.remoteDestination,
      };
    }),
  };
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

  // Prefer the panel endpoint that also writes config.yaml, so the change
  // survives core restarts and panel-triggered reloads. Without config
  // management (503) fall back to a runtime-only change.
  async function patchCore(panelBody: CoreConfigPatch & { mode?: ProxyMode }, coreBody: Record<string, unknown>) {
    const response = await fetcher("/api/config/core", {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(panelBody),
    });
    if (response.ok) return;
    if (response.status !== 503 && response.status !== 404) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(payload.message || `核心设置保存失败：${response.status}`);
    }
    await request("/configs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coreBody),
    });
  }

  async function requestJson<T>(path: string): Promise<T> {
    const response = await request(path);
    return response.json() as Promise<T>;
  }

  async function getConnections(): Promise<ConnectionSnapshot> {
    return mapConnectionSnapshot(await requestJson<RawConnectionSnapshot>("/connections"));
  }

  return {
    async setMode(mode: ProxyMode) {
      await patchCore({ mode }, { mode });
    },

    async getOverview(): Promise<OverviewData> {
      const [versionData, configData, proxyData, providerData, connectionData] = await Promise.all([
        requestJson<{ version?: string }>("/version"),
        requestJson<{ mode?: ProxyMode; "mixed-port"?: number; "allow-lan"?: boolean; ipv6?: boolean }>("/configs"),
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
        mode: (configData.mode?.toLowerCase() as ProxyMode | undefined) || "rule",
        mixedPort: configData["mixed-port"] ?? null,
        allowLan: configData["allow-lan"] === true,
        ipv6: configData.ipv6 === true,
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

    async testProxy(node: ProxyNode, testUrl: string, timeout = 10_000) {
      // Test provider nodes through their provider's
      // health check (updates the provider's view too), others directly.
      const params = new URLSearchParams({
        url: testUrl,
        timeout: String(timeout),
      });
      const path = node.provider
        ? `/providers/proxies/${encodeURIComponent(node.provider)}/${encodeURIComponent(node.name)}/healthcheck`
        : `/proxies/${encodeURIComponent(node.name)}/delay`;
      const result = await requestJson<{ delay?: number }>(
        `${path}?${params.toString()}`,
      );
      if (typeof result.delay !== "number" || result.delay <= 0) throw new Error("测速失败");
      return result.delay;
    },


    async updateProvider(name: string) {
      await request(`/providers/proxies/${encodeURIComponent(name)}`, { method: "PUT" });
    },

    getConnections,

    async getRules(): Promise<RuleItem[]> {
      const data = await requestJson<{ rules?: Array<{ type?: string; payload?: string; proxy?: string }> }>("/rules");
      return (data.rules || []).map((rule) => ({ type: rule.type || "Unknown", payload: rule.payload || "", proxy: rule.proxy || "" }));
    },

    async getRuleProviders(): Promise<RuleProviderItem[]> {
      const data = await requestJson<{ providers?: Record<string, { name?: string; behavior?: string; format?: string; vehicleType?: string; ruleCount?: number; updatedAt?: string }> }>("/providers/rules");
      return Object.entries(data.providers || {}).map(([key, provider]) => ({
        name: provider.name || key,
        behavior: provider.behavior || "",
        format: provider.format || "",
        vehicleType: provider.vehicleType || "",
        ruleCount: provider.ruleCount || 0,
        updatedAt: provider.updatedAt && !provider.updatedAt.startsWith("0001-") ? provider.updatedAt : null,
      }));
    },

    async updateRuleProvider(name: string) {
      await request(`/providers/rules/${encodeURIComponent(name)}`, { method: "PUT" });
    },

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
      if (Object.keys(body).length === 0) return;
      await patchCore(patch, body);
    },
  };
}
