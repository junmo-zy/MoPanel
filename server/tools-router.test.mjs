import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProxyUnavailableError } from "./proxy-client.mjs";
import { createToolsRouter } from "./tools-router.mjs";
import { runUnlockCheck } from "./unlock-checks.mjs";

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(http) {
  const app = express();
  app.use(express.json());
  app.use(createToolsRouter({ http }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function fakeHttp(routes) {
  return {
    request: vi.fn(async (url) => {
      const match = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      if (!match) throw new Error(`unexpected ${url}`);
      const value = typeof match[1] === "function" ? match[1](url) : match[1];
      return { status: 200, url, text: "", ...value, headers: new Headers(value.headers || {}) };
    }),
  };
}

describe("unlock checks", () => {
  it("reads support and region from the real service responses", async () => {
    const http = fakeHttp({
      "https://www.netflix.com/title/81280792": { url: "https://www.netflix.com/hk-en/title/81280792" },
      "https://www.netflix.com/title/70143836": { url: "https://www.netflix.com/hk-en/title/70143836" },
      "https://gemini.google.com/": { text: 'x\\"45631641\\":true,y,2,1,200,"HKG"' },
      "https://www.tiktok.com/explore": { text: '{"region":"ALISG"}' },
      "https://spclient.wg.spotify.com": { text: '{"status":320}' },
      "https://api.bilibili.com": { text: '{"code":-10403}' },
    });
    await expect(runUnlockCheck("netflix", http)).resolves.toEqual({ status: "yes", region: "HK" });
    await expect(runUnlockCheck("gemini", http)).resolves.toEqual({ status: "yes", region: "HKG" });
    await expect(runUnlockCheck("tiktok", http)).resolves.toEqual({ status: "yes", region: "ALISG" });
    await expect(runUnlockCheck("spotify", http)).resolves.toMatchObject({ status: "no" });
    await expect(runUnlockCheck("bilibili-hkmotw", http)).resolves.toEqual({ status: "no" });
  });

  it("detects Netflix originals-only and blocked regions", async () => {
    const originals = fakeHttp({
      "https://www.netflix.com/title/81280792": { status: 404 },
      "https://www.netflix.com/title/70143836": { status: 200, url: "https://www.netflix.com/title/70143836" },
    });
    await expect(runUnlockCheck("netflix", originals)).resolves.toMatchObject({ status: "originals", region: "US" });
    const blocked = fakeHttp({ "https://www.netflix.com": { status: 403 } });
    await expect(runUnlockCheck("netflix", blocked)).resolves.toEqual({ status: "no" });
  });

  it("marks Claude unavailable from its redirect or region", async () => {
    const http = fakeHttp({
      "https://claude.ai/login": { status: 302, headers: { location: "https://www.anthropic.com/app-unavailable-in-region" } },
      "https://claude.ai/cdn-cgi/trace": { text: "ip=1.1.1.1\nloc=HK\n" },
    });
    await expect(runUnlockCheck("claude", http)).resolves.toEqual({ status: "no", region: "HK" });
  });
});

describe("tools API", () => {
  it("lists services, runs one check and stamps the time", async () => {
    const base = await start(fakeHttp({ "https://api.bilibili.com": { text: '{"code":0}' } }));
    const list = await (await fetch(`${base}/unlock`)).json();
    expect(list.services).toHaveLength(12);
    const result = await (await fetch(`${base}/unlock/bilibili-cn`, { method: "POST" })).json();
    expect(result).toMatchObject({ id: "bilibili-cn", status: "yes" });
    expect(Date.parse(result.checkedAt)).not.toBeNaN();
    expect((await fetch(`${base}/unlock/nope`, { method: "POST" })).status).toBe(404);
  });

  it("measures latency only for http(s) URLs and explains an unreachable proxy port", async () => {
    const http = { request: vi.fn(async () => { throw new ProxyUnavailableError("无法连接 Mihomo 代理端口"); }) };
    const base = await start(http);
    const bad = await fetch(`${base}/latency`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "file:///etc/passwd" }) });
    expect(bad.status).toBe(400);
    const down = await fetch(`${base}/latency`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://github.com" }) });
    expect(down.status).toBe(503);
    expect((await down.json()).code).toBe("PROXY_UNAVAILABLE");
  });

  it("normalises the exit IP from the first working lookup service", async () => {
    const base = await start(fakeHttp({
      "https://api.ip.sb/geoip": { text: "not json" },
      "https://ipwho.is/": { text: JSON.stringify({ ip: "1.2.3.4", country_code: "HK", country: "Hong Kong", city: "HK", connection: { asn: 9269, isp: "HKBN" }, timezone: { id: "Asia/Hong_Kong" } }) },
    }));
    expect(await (await fetch(`${base}/ip`)).json()).toMatchObject({ ip: "1.2.3.4", countryCode: "HK", asn: "AS9269", isp: "HKBN", source: "ipwho.is" });
  });
});
