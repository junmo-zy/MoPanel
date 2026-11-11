import { ProxyAgent, fetch as undiciFetch } from "undici";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const RESOLVE_CACHE_MS = 30_000;

export class ProxyUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProxyUnavailableError";
  }
}

function controllerHeaders(secret) {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

// Requests made "through Mihomo" (unlock checks, site latency, exit IP) go to
// the core's own proxy port so its rules and the selected nodes apply, exactly
// like a browser using the proxy. MIHOMO_PROXY_URL overrides the address (e.g.
// when the port needs authentication); otherwise it is derived from the
// controller host plus the running mixed-port.
export function createProxyResolver({ target, secret, proxyUrl = "", fetcher = fetch }) {
  let cached = null;
  return async function resolveProxyUrl() {
    if (proxyUrl) return proxyUrl;
    if (cached && cached.expires > Date.now()) return cached.url;
    let config;
    try {
      const response = await fetcher(`${target}/configs`, { headers: controllerHeaders(secret) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      config = await response.json();
    } catch (error) {
      throw new ProxyUnavailableError(`无法读取 Mihomo 端口配置：${error.message}`);
    }
    const port = Number(config?.["mixed-port"]) || Number(config?.port);
    if (!port) {
      throw new ProxyUnavailableError("Mihomo 没有开启 mixed-port 或 port，无法通过代理检测；请在设置里开启混合端口，或配置 MIHOMO_PROXY_URL");
    }
    const url = `http://${new URL(target).hostname}:${port}`;
    cached = { url, expires: Date.now() + RESOLVE_CACHE_MS };
    return url;
  };
}

export function createProxiedHttp({ resolveProxyUrl }) {
  const agents = new Map();
  function agentFor(url) {
    if (!agents.has(url)) {
      // Google pages send very large headers; the default 16 KB limit rejects them.
      agents.set(url, new ProxyAgent({ uri: url, maxHeaderSize: 256 * 1024 }));
    }
    return agents.get(url);
  }

  async function request(url, { method = "GET", headers = {}, body, redirect = "follow", timeout = 10_000, readBody = true } = {}) {
    const proxy = await resolveProxyUrl();
    let response;
    try {
      response = await undiciFetch(url, {
        method,
        body,
        redirect,
        dispatcher: agentFor(proxy),
        headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9", ...headers },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const code = error?.cause?.code || error?.code || "";
      if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH") {
        throw new ProxyUnavailableError(`无法连接 Mihomo 代理端口 ${proxy}（${code}）。请确认 Mihomo 已开启“允许局域网连接”，或设置 MIHOMO_PROXY_URL`);
      }
      if (error?.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT") throw new Error("请求超时");
      throw new Error(error?.cause?.message || error?.message || "请求失败");
    }
    const text = readBody ? await response.text() : (await response.body?.cancel(), "");
    return { status: response.status, url: response.url || url, headers: response.headers, text };
  }

  return { request };
}
