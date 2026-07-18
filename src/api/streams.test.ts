import { describe, expect, it } from "vitest";
import { buildMihomoSocketUrl } from "./streams";

describe("Mihomo websocket URLs", () => {
  it("keeps the current host and upgrades the browser protocol", () => {
    expect(buildMihomoSocketUrl("http:", "dashboard.local:8080", "/logs?level=info"))
      .toBe("ws://dashboard.local:8080/api/mihomo/logs?level=info");
    expect(buildMihomoSocketUrl("https:", "proxy.example.com", "/traffic"))
      .toBe("wss://proxy.example.com/api/mihomo/traffic");
  });
});
