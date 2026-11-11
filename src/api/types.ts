export type ProxyMode = "rule" | "global" | "direct";

export interface ProxyNode {
  name: string;
  type: string;
  delay: number | null;
  alive: boolean;
  provider?: string;
  udp?: boolean;
}

export interface ProviderProxyNode extends ProxyNode {
  provider: string;
}

export interface ProxyGroup {
  name: string;
  type: string;
  current: string;
  delay: number | null;
  nodes: ProxyNode[];
  icon?: string;
  // The group's own health-check URL; Clash Verge tests a group's nodes with it.
  testUrl?: string;
}

export interface SubscriptionInfo {
  upload: number;
  download: number;
  total: number;
  // Unix seconds; 0 when the subscription never expires.
  expire: number;
}

export interface ProxyProvider {
  name: string;
  vehicleType: string;
  updatedAt: string | null;
  proxyCount: number;
  subscriptionInfo?: SubscriptionInfo;
}

export interface OverviewData {
  connected: boolean;
  version: string;
  mode: ProxyMode;
  mixedPort: number | null;
  allowLan: boolean;
  ipv6?: boolean;
  downloadTotal: number;
  uploadTotal: number;
  connectionCount: number;
  tcpCount: number;
  udpCount: number;
  groups: ProxyGroup[];
  providers: ProxyProvider[];
  providerNodes: ProviderProxyNode[];
}

export interface ConnectionItem {
  id: string;
  network: string;
  host: string;
  destination: string;
  process: string;
  chain: string;
  rule: string;
  upload: number;
  download: number;
  start: string;
  // Extra detail for the connection inspector (optional for demo data).
  type?: string;
  source?: string;
  chains?: string[];
  ruleType?: string;
  rulePayload?: string;
  processPath?: string;
  sniffHost?: string;
  dnsMode?: string;
  inbound?: string;
  remoteDestination?: string;
}

export interface ConnectionSnapshot {
  downloadTotal: number;
  uploadTotal: number;
  connections: ConnectionItem[];
}

export interface CoreConfigPatch {
  allowLan?: boolean;
  ipv6?: boolean;
  mixedPort?: number;
}

export interface RuleItem {
  type: string;
  payload: string;
  proxy: string;
}

export interface RuleProviderItem {
  name: string;
  behavior: string;
  format: string;
  vehicleType: string;
  ruleCount: number;
  updatedAt: string | null;
}

export interface MihomoClient {
  setMode: (mode: ProxyMode) => Promise<void>;
  getOverview: () => Promise<OverviewData>;
  selectProxy: (group: string, node: string) => Promise<void>;
  // Resolves to the delay in ms; rejects when the node fails or times out.
  testProxy: (node: ProxyNode, testUrl: string, timeout?: number) => Promise<number>;
  updateProvider: (name: string) => Promise<void>;
  getRules: () => Promise<RuleItem[]>;
  getRuleProviders: () => Promise<RuleProviderItem[]>;
  updateRuleProvider: (name: string) => Promise<void>;
  getConnections: () => Promise<ConnectionSnapshot>;
  closeConnection: (id: string) => Promise<void>;
  closeAllConnections: () => Promise<void>;
  updateConfig: (patch: CoreConfigPatch) => Promise<void>;
}
