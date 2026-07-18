export type ProxyMode = "rule" | "global" | "direct";

export interface ProxyNode {
  name: string;
  type: string;
  delay: number | null;
  alive: boolean;
  provider?: string;
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
}

export interface ProxyProvider {
  name: string;
  vehicleType: string;
  updatedAt: string | null;
  proxyCount: number;
}

export interface OverviewData {
  connected: boolean;
  version: string;
  mode: ProxyMode;
  mixedPort: number | null;
  allowLan: boolean;
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

export interface MihomoClient {
  setMode: (mode: ProxyMode) => Promise<void>;
  getOverview: () => Promise<OverviewData>;
  selectProxy: (group: string, node: string) => Promise<void>;
  testProxy: (node: ProxyNode, testUrl: string) => Promise<number>;
  testGroup: (group: string, testUrl: string) => Promise<Record<string, number>>;
  updateProvider: (name: string) => Promise<void>;
  getConnections: () => Promise<ConnectionSnapshot>;
  closeConnection: (id: string) => Promise<void>;
  closeAllConnections: () => Promise<void>;
  updateConfig: (patch: CoreConfigPatch) => Promise<void>;
}
