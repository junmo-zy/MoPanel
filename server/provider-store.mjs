import { chmod, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { buildSubscriptionConfig, parseProfile } from "./profile-sync.mjs";
import {
  applyCoreSettingsYaml,
  createAutoGroupMetadata,
  getSubscriptionState,
  mutateAutoGroupYaml,
  mutateProviderYaml,
  parseManagedAutoGroups,
  parseManagedProviders,
  ProviderConfigError,
  switchSubscriptionYaml,
} from "./provider-config.mjs";

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function providerReferenceAtRisk(change) {
  const originalName = trimmed(change?.originalName || change?.name);
  if (!originalName) return "";
  if (change?.action === "delete") return originalName;
  if (change?.action !== "update") return "";
  const nextName = trimmed(change?.provider?.name);
  return nextName && nextName !== originalName ? originalName : "";
}

export class ProviderConfigStore {
  #configPath;
  #autoGroupMetadataPath;
  #profileStatePath;
  #localRulesPath;
  #profileCacheDirectory;
  #fetchProfile;
  #queue = Promise.resolve();

  // fetchProfile(url) -> text downloads a subscription as a Clash profile.
  // Without it subscriptions only supply nodes (the original behaviour).
  constructor(configPath, { fetchProfile } = {}) {
    this.#configPath = configPath;
    const metadataDirectory = join(dirname(configPath), ".mihomo-mini");
    this.#autoGroupMetadataPath = join(metadataDirectory, "auto-groups.json");
    this.#profileStatePath = join(metadataDirectory, "profile-state.json");
    this.#localRulesPath = join(metadataDirectory, "local-rules.json");
    this.#profileCacheDirectory = join(metadataDirectory, "profiles");
    this.#fetchProfile = fetchProfile;
  }

  async list() {
    return parseManagedProviders(await readFile(this.#configPath, "utf8"));
  }

  async getSubscriptionState() {
    const [source, metadata, profileState] = await Promise.all([
      readFile(this.#configPath, "utf8"),
      this.#readAutoGroupMetadataLenient(),
      this.#readJson(this.#profileStatePath),
    ]);
    return this.#withRuleSource(getSubscriptionState(source, metadata), profileState, source);
  }

  #withRuleSource(state, profileState, source) {
    const rules = parseDocument(source).get("rules", true)?.toJSON?.();
    const ruleCount = Array.isArray(rules) ? rules.length : 0;
    const matches = profileState && profileState.provider === state.activeProvider;
    return {
      ...state,
      ruleSource: {
        mode: matches && profileState.mode === "profile" ? "profile" : "local",
        provider: state.activeProvider,
        ruleCount,
        groupCount: matches ? profileState.groupCount : undefined,
        syncedAt: matches ? profileState.syncedAt : undefined,
        warning: matches ? profileState.warning : undefined,
        repairedRules: matches ? profileState.repairedRules : undefined,
      },
    };
  }

  async #readJson(path) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return null;
    }
  }

  // Re-download the active subscription's profile (after an update, on start
  // and periodically). Reloads Mihomo only when the result actually changed.
  syncActiveSubscription(reload) {
    return this.#enqueue(async () => {
      const source = await readFile(this.#configPath, "utf8");
      const metadata = await this.#readAutoGroupMetadataLenient();
      const active = getSubscriptionState(source, metadata).activeProvider;
      if (!active) return this.getSubscriptionStateUnqueued(source, metadata);
      return this.#selectSubscription(active, reload, { background: true });
    });
  }

  async getSubscriptionStateUnqueued(source, metadata) {
    return this.#withRuleSource(getSubscriptionState(source, metadata), await this.#readJson(this.#profileStatePath), source);
  }

  // Subscription state only needs the managed group names; a damaged metadata
  // file must not block switching subscriptions.
  async #readAutoGroupMetadataLenient() {
    try {
      return this.#parseAutoGroupMetadata(await this.#readOptional(this.#autoGroupMetadataPath));
    } catch {
      return undefined;
    }
  }

  async listAutoGroups() {
    const [source, metadataFile] = await Promise.all([
      readFile(this.#configPath, "utf8"),
      this.#readOptional(this.#autoGroupMetadataPath),
    ]);
    return parseManagedAutoGroups(source, this.#parseAutoGroupMetadata(metadataFile));
  }

  apply(change, reload) {
    return this.#enqueue(() => this.#apply(change, reload));
  }

  applyAutoGroup(change, reload) {
    return this.#enqueue(() => this.#applyAutoGroup(change, reload));
  }

  selectSubscription(name, reload) {
    return this.#enqueue(() => this.#selectSubscription(name, reload));
  }

  // `patch` is already validated (see normalizeCorePatch). No reload: the
  // caller applies the same values to the running core through PATCH /configs.
  updateCore(patch) {
    return this.#enqueue(async () => {
      const source = await readFile(this.#configPath, "utf8");
      await this.#replace(this.#configPath, applyCoreSettingsYaml(source, patch));
    });
  }

  #enqueue(work) {
    const operation = this.#queue.then(work);
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  async #replace(path, contents) {
    // Write through symlinks (e.g. ~/.config/mihomo/config.yaml -> /app/config)
    // instead of replacing the link with a regular file, and keep the file mode.
    let target = path;
    let mode;
    try {
      target = await realpath(path);
      mode = (await stat(target)).mode & 0o777;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await mkdir(dirname(target), { recursive: true });
    const temporaryPath = `${target}.mihomo-mini-${process.pid}-${Date.now()}.tmp`;
    await writeFile(temporaryPath, contents, "utf8");
    if (mode !== undefined) await chmod(temporaryPath, mode);
    await rename(temporaryPath, target);
  }

  async #readOptional(path) {
    try {
      return { exists: true, contents: await readFile(path, "utf8") };
    } catch (error) {
      if (error?.code === "ENOENT") return { exists: false, contents: "" };
      throw error;
    }
  }

  #parseAutoGroupMetadata(file) {
    if (!file.exists) return createAutoGroupMetadata();
    try {
      return createAutoGroupMetadata(JSON.parse(file.contents));
    } catch (error) {
      if (error instanceof ProviderConfigError) throw error;
      throw new ProviderConfigError("Custom auto-group metadata is invalid", "INVALID_AUTO_GROUP_METADATA");
    }
  }

  async #restoreOptional(path, file) {
    if (file.exists) {
      await this.#replace(path, file.contents);
      return;
    }
    try {
      await unlink(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async #restoreAutoGroupFiles(source, metadataFile) {
    try {
      await this.#replace(this.#configPath, source);
    } catch {
      // Preserve the original mutation/reload error for the caller.
    }
    try {
      await this.#restoreOptional(this.#autoGroupMetadataPath, metadataFile);
    } catch {
      // Preserve the original mutation/reload error for the caller.
    }
  }

  async #assertProviderReferencesCanChange(change) {
    const provider = providerReferenceAtRisk(change);
    if (!provider) return;
    const metadataFile = await this.#readOptional(this.#autoGroupMetadataPath);
    const metadata = this.#parseAutoGroupMetadata(metadataFile);
    const usedByAutoGroup = Object.values(metadata.groups).some((group) => (
      group.nodes.some((node) => node.provider === provider)
    ));
    if (usedByAutoGroup) {
      throw new ProviderConfigError(
        "此订阅仍被自定义自动组引用，请先编辑或删除自动组",
        "AUTO_GROUP_PROVIDER_IN_USE",
      );
    }
  }

  async #apply(change, reload) {
    const original = await readFile(this.#configPath, "utf8");
    const next = mutateProviderYaml(original, change);
    await this.#assertProviderReferencesCanChange(change);
    await this.#replace(this.#configPath, next);
    try {
      await reload();
    } catch (error) {
      await this.#replace(this.#configPath, original);
      throw error;
    }
    return parseManagedProviders(next);
  }

  async #downloadProfile(name, url) {
    const cachePath = join(this.#profileCacheDirectory, `${createHash("sha1").update(name).digest("hex")}.yaml`);
    try {
      const text = await this.#fetchProfile(url);
      const profile = parseProfile(text);
      if (profile) await this.#replace(cachePath, text);
      return { profile, warning: profile ? undefined : "订阅只提供节点、没有规则，已使用本地规则" };
    } catch (error) {
      const cached = await this.#readOptional(cachePath);
      const profile = cached.exists ? parseProfile(cached.contents) : null;
      const reason = error instanceof Error ? error.message : "下载失败";
      return {
        profile,
        warning: profile ? `无法下载订阅配置（${reason}），继续使用上次下载的规则` : `无法下载订阅配置（${reason}），已使用本地规则`,
      };
    }
  }

  async #readDownloadedProfile(definition) {
    if (!definition.path) return null;
    try {
      // Activate the same downloaded version Mihomo uses for its nodes.
      const text = await readFile(resolve(dirname(this.#configPath), definition.path), "utf8");
      const document = parseDocument(text);
      if (document.errors.length || !Array.isArray(document.get("proxies", true)?.toJSON?.())) return null;
      const profile = parseProfile(text);
      return { profile, warning: profile ? undefined : "订阅只提供节点、没有规则，已使用本地规则" };
    } catch {
      // Missing or unreadable provider files still use the normal download path.
      return null;
    }
  }

  // background: a sync (startup, timer, manual) that must never rewrite a
  // local-rules config; only an explicit switch re-points provider references.
  async #selectSubscription(name, reload, { background = false } = {}) {
    const original = await readFile(this.#configPath, "utf8");
    const metadata = await this.#readAutoGroupMetadataLenient();
    const [stateFile, snapshotFile] = await Promise.all([
      this.#readOptional(this.#profileStatePath),
      this.#readOptional(this.#localRulesPath),
    ]);
    const previousState = stateFile.exists ? JSON.parse(stateFile.contents || "null") : null;
    const snapshot = snapshotFile.exists ? JSON.parse(snapshotFile.contents || "null") : null;

    const definition = parseDocument(original).getIn(["proxy-providers", trimmed(name)], true)?.toJSON?.();
    let download = { profile: null, warning: undefined };
    if (this.#fetchProfile && definition?.type === "http" && definition.url) {
      download = (!background && await this.#readDownloadedProfile(definition))
        || await this.#downloadProfile(trimmed(name), definition.url);
    }

    let next;
    let nextState;
    let nextSnapshot = snapshot;
    if (!download.profile && previousState?.mode !== "profile" && background) {
      const unchanged = { ...(previousState || {}), mode: "local", provider: trimmed(name), warning: download.warning, syncedAt: new Date().toISOString() };
      await this.#replace(this.#profileStatePath, `${JSON.stringify(unchanged, null, 2)}\n`);
      return this.#withRuleSource(getSubscriptionState(original, metadata), unchanged, original);
    }
    if (!download.profile && previousState?.mode !== "profile") {
      // Node-only subscription and no profile active: the original behaviour.
      next = switchSubscriptionYaml(original, name, metadata);
      const rules = parseDocument(next).get("rules", true)?.toJSON?.();
      nextState = { mode: "local", provider: trimmed(name), injectedKeys: [], injectedProviders: [], ruleCount: Array.isArray(rules) ? rules.length : 0, syncedAt: new Date().toISOString() };
    } else {
      const built = buildSubscriptionConfig(original, { provider: trimmed(name), profile: download.profile, metadata, snapshot, state: previousState });
      next = built.yaml;
      nextState = built.state;
      nextSnapshot = built.snapshot;
    }
    if (download.warning) nextState.warning = download.warning;

    // Compare content, not text, so a re-sync of the same profile is a no-op.
    const changed = JSON.stringify(parseDocument(next).toJSON()) !== JSON.stringify(parseDocument(original).toJSON());
    try {
      if (nextState.mode === "profile") await this.#replace(this.#localRulesPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
      await this.#replace(this.#profileStatePath, `${JSON.stringify(nextState, null, 2)}\n`);
      if (changed) {
        await this.#replace(this.#configPath, next);
        await reload();
      }
    } catch (error) {
      if (changed) await this.#replace(this.#configPath, original).catch(() => undefined);
      await this.#restoreOptional(this.#profileStatePath, stateFile).catch(() => undefined);
      await this.#restoreOptional(this.#localRulesPath, snapshotFile).catch(() => undefined);
      throw error;
    }
    return this.#withRuleSource(getSubscriptionState(next, metadata), nextState, next);
  }


  async #applyAutoGroup(change, reload) {
    const source = await readFile(this.#configPath, "utf8");
    const metadataFile = await this.#readOptional(this.#autoGroupMetadataPath);
    const metadata = this.#parseAutoGroupMetadata(metadataFile);
    const next = mutateAutoGroupYaml(source, metadata, change);
    const nextMetadata = `${JSON.stringify(next.metadata, null, 2)}\n`;

    try {
      await this.#replace(this.#autoGroupMetadataPath, nextMetadata);
      await this.#replace(this.#configPath, next.yaml);
      await reload();
    } catch (error) {
      await this.#restoreAutoGroupFiles(source, metadataFile);
      throw error;
    }

    return parseManagedAutoGroups(next.yaml, next.metadata);
  }
}
