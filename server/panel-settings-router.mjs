import express from "express";
import { PanelSettingsError } from "./panel-settings.mjs";

const CUSTOM_WALLPAPER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function messageFor(error) {
  return error instanceof Error ? error.message : "测速设置操作失败";
}

function requestContentType(request) {
  return String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
}

export function createPanelSettingsRouter({ store }) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!store) {
      return response.status(503).json({ message: "测速设置尚未启用" });
    }
    next();
  });

  router.get("/settings", async (_request, response) => {
    try {
      response.json(await store.get());
    } catch (error) {
      response.status(error instanceof PanelSettingsError ? 400 : 500).json({ message: messageFor(error) });
    }
  });

  router.put("/settings", async (request, response) => {
    try {
      response.json(await store.save(request.body));
    } catch (error) {
      response.status(error instanceof PanelSettingsError ? 400 : 500).json({ message: messageFor(error) });
    }
  });

  router.get("/wallpaper/custom", async (_request, response) => {
    try {
      const image = await store.loadCustomWallpaper();
      if (!image) return response.status(404).json({ message: "尚未上传自定义壁纸" });
      response.type(image.contentType).send(image.data);
    } catch (error) {
      response.status(error instanceof PanelSettingsError ? 400 : 500).json({ message: messageFor(error) });
    }
  });

  router.put(
    "/wallpaper/custom",
    express.raw({ type: [...CUSTOM_WALLPAPER_TYPES], limit: "16mb" }),
    async (request, response) => {
      try {
        await store.saveCustomWallpaper({
          contentType: requestContentType(request),
          data: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
        });
        response.status(204).end();
      } catch (error) {
        response.status(error instanceof PanelSettingsError ? 400 : 500).json({ message: messageFor(error) });
      }
    },
  );

  router.delete("/wallpaper/custom", async (_request, response) => {
    try {
      await store.clearCustomWallpaper();
      response.status(204).end();
    } catch (error) {
      response.status(error instanceof PanelSettingsError ? 400 : 500).json({ message: messageFor(error) });
    }
  });

  return router;
}
