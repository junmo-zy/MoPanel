import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanelSettingsRouter } from "./panel-settings-router.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

describe("panel settings API", () => {
  it("reads and writes the shared speed-test URL without a management token", async () => {
    const store = {
      get: vi.fn(async () => ({ speedTestUrl: "https://www.gstatic.com/generate_204" })),
      save: vi.fn(async (settings) => settings),
    };
    const base = await start(createPanelSettingsRouter({ store }));

    await expect((await fetch(`${base}/settings`)).json()).resolves.toEqual({ speedTestUrl: "https://www.gstatic.com/generate_204" });
    const response = await fetch(`${base}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speedTestUrl: "https://cp.cloudflare.com/generate_204" }),
    });

    expect(response.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith({ speedTestUrl: "https://cp.cloudflare.com/generate_204" });
  });
});
