import express from "express";
import { ProxyUnavailableError } from "./proxy-client.mjs";
import { runUnlockCheck, UNLOCK_SERVICES } from "./unlock-checks.mjs";

function message(error) {
  return error instanceof Error ? error.message : "检测失败";
}

function failure(response, error) {
  if (error?.code === "UNKNOWN_UNLOCK_SERVICE") return response.status(404).json({ message: message(error) });
  if (error instanceof ProxyUnavailableError) return response.status(503).json({ message: message(error), code: "PROXY_UNAVAILABLE" });
  return response.status(502).json({ message: message(error) });
}

function validTestUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function lookupIp(http) {
  // Several free services, first answer wins; all requests go through Mihomo
  // so the result is the proxy's exit address, not the NAS's.
  const sources = [
    ["https://api.ip.sb/geoip", (data) => ({
      ip: data.ip, countryCode: data.country_code, country: data.country, region: data.region, city: data.city,
      isp: data.isp || data.organization, asn: data.asn ? `AS${data.asn}` : undefined, org: data.asn_organization, timezone: data.timezone,
    })],
    ["https://ipwho.is/", (data) => (data.success === false ? null : {
      ip: data.ip, countryCode: data.country_code, country: data.country, region: data.region, city: data.city,
      isp: data.connection?.isp, asn: data.connection?.asn ? `AS${data.connection.asn}` : undefined, org: data.connection?.org, timezone: data.timezone?.id,
    })],
    ["https://ipapi.co/json/", (data) => (data.error ? null : {
      ip: data.ip, countryCode: data.country_code, country: data.country_name, region: data.region, city: data.city,
      isp: data.org, asn: data.asn, org: data.org, timezone: data.timezone,
    })],
  ];
  // Ask all services at once and take the first good answer, so one slow or
  // blocked service never keeps the card spinning.
  const attempts = sources.map(async ([url, map]) => {
    const response = await http.request(url, { headers: { accept: "application/json" }, timeout: 7000 });
    const info = map(JSON.parse(response.text));
    if (!info?.ip) throw new Error(`${new URL(url).host} 未返回 IP`);
    return { ...info, source: new URL(url).host };
  });
  try {
    return await Promise.any(attempts);
  } catch (error) {
    const reasons = error instanceof AggregateError ? error.errors : [error];
    const unavailable = reasons.find((reason) => reason instanceof ProxyUnavailableError);
    if (unavailable) throw unavailable;
    throw new Error(`查询出口 IP 失败：${message(reasons[0])}`);
  }
}

export function createToolsRouter({ http }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/unlock", (_request, response) => {
    response.json({ services: UNLOCK_SERVICES });
  });

  router.post("/unlock/:id", async (request, response) => {
    try {
      const result = await runUnlockCheck(request.params.id, http);
      response.json({ id: request.params.id, ...result, checkedAt: new Date().toISOString() });
    } catch (error) {
      failure(response, error);
    }
  });

  router.post("/latency", async (request, response) => {
    const url = validTestUrl(request.body?.url);
    if (!url) return response.status(400).json({ message: "测试地址必须是有效的 HTTP 或 HTTPS 地址" });
    try {
      // Time to response headers, like a browser's first byte; redirects are
      // not followed so the number reflects one round trip through the proxy.
      const started = performance.now();
      await http.request(url, { method: "HEAD", redirect: "manual", readBody: false, timeout: Number(request.body?.timeout) || 8000 });
      response.json({ delay: Math.max(1, Math.round(performance.now() - started)) });
    } catch (error) {
      failure(response, error);
    }
  });

  router.get("/ip", async (_request, response) => {
    try {
      response.json(await lookupIp(http));
    } catch (error) {
      failure(response, error);
    }
  });

  return router;
}
