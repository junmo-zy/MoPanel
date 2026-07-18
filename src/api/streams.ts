export function buildMihomoSocketUrl(protocol: string, host: string, path: string) {
  const socketProtocol = protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${socketProtocol}//${host}/api/mihomo${normalizedPath}`;
}
