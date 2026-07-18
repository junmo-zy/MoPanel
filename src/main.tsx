import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createMihomoClient } from "./api/mihomo";
import { createProviderManagerClient } from "./api/provider-manager";
import "./styles.css";

const client = createMihomoClient();
const providerManager = createProviderManagerClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App client={client} providerManager={providerManager} />
  </React.StrictMode>,
);
