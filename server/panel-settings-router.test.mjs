import express from "express";
import { ServerResponse } from "node:http";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createPanelSettingsRouter } from "./panel-settings-router.mjs";

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((_request, response) => {
    response.status(404).json({ message: "not found" });
  });
  return app;
}

async function request(app, { method = "GET", path = "/", body, contentType = "application/json" } = {}) {
  const payload = Buffer.isBuffer(body)
    ? body
    : body === undefined
      ? Buffer.alloc(0)
      : Buffer.from(JSON.stringify(body));
  const requestStream = Readable.from(payload.length ? [payload] : []);
  requestStream.method = method;
  requestStream.url = path;
  requestStream.headers = payload.length
    ? { "content-type": contentType, "content-length": String(payload.length) }
    : {};
  requestStream.httpVersionMajor = 1;
  requestStream.httpVersionMinor = 1;
  requestStream.httpVersion = "1.1";

  const chunks = [];
  const socket = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      callback();
    },
  });
  socket.cork = () => {};
  socket.uncork = () => {};
  socket.destroy = () => {};
  socket.writable = true;

  const response = new ServerResponse(requestStream);
  response.assignSocket(socket);
  const finished = new Promise((resolve, reject) => {
    response.on("finish", () => {
      const raw = Buffer.concat(chunks);
      const separator = raw.indexOf("\r\n\r\n");
      const responseBody = separator >= 0 ? raw.subarray(separator + 4) : raw;
      resolve({
        status: response.statusCode,
        body: responseBody,
        json: () => JSON.parse(responseBody.toString("utf8")),
      });
    });
    response.on("error", reject);
  });

  app.handle(requestStream, response, (error) => {
    if (error) response.destroy(error);
  });
  return finished;
}

describe("panel settings API", () => {
  it("reads and writes the shared speed-test URL without a management token", async () => {
    const store = {
      get: vi.fn(async () => ({
        speedTestUrl: "https://www.gstatic.com/generate_204",
        selectedProviders: null,
        wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
      })),
      save: vi.fn(async (settings) => ({
        speedTestUrl: settings.speedTestUrl,
        selectedProviders: null,
        wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
      })),
    };
    const app = createApp(createPanelSettingsRouter({ store }));

    expect((await request(app, { path: "/settings" })).json()).toEqual({
      speedTestUrl: "https://www.gstatic.com/generate_204",
      selectedProviders: null,
      wallpaper: { selectedId: "coastal-mist", blur: 8, dim: 20, glass: 65, hidden: [] },
    });
    const response = await request(app, {
      method: "PUT",
      path: "/settings",
      body: { speedTestUrl: "https://cp.cloudflare.com/generate_204" },
    });

    expect(response.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith({ speedTestUrl: "https://cp.cloudflare.com/generate_204" });
  });

  it("uploads, reads, and deletes a shared custom wallpaper image", async () => {
    const image = Buffer.from("image-data");
    const store = {
      get: vi.fn(),
      save: vi.fn(),
      saveCustomWallpaper: vi.fn(async () => undefined),
      loadCustomWallpaper: vi.fn(async () => ({ contentType: "image/webp", data: image })),
      clearCustomWallpaper: vi.fn(async () => undefined),
    };
    const app = createApp(createPanelSettingsRouter({ store }));

    const upload = await request(app, {
      method: "PUT",
      path: "/wallpaper/custom",
      body: image,
      contentType: "image/webp",
    });
    const restored = await request(app, { path: "/wallpaper/custom" });
    const removed = await request(app, { method: "DELETE", path: "/wallpaper/custom" });

    expect(upload.status).toBe(204);
    expect(store.saveCustomWallpaper).toHaveBeenCalledWith({ contentType: "image/webp", data: image });
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual(image);
    expect(removed.status).toBe(204);
    expect(store.clearCustomWallpaper).toHaveBeenCalledTimes(1);
  });
});
