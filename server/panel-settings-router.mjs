import express from "express";
import { PanelSettingsError } from "./panel-settings.mjs";

function messageFor(error) {
  return error instanceof Error ? error.message : "测速设置操作失败";
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

  return router;
}
