import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
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
  #queue = Promise.resolve();

  constructor(configPath) {
    this.#configPath = configPath;
    this.#autoGroupMetadataPath = join(dirname(configPath), ".mihomo-mini", "auto-groups.json");
  }

  async list() {
    return parseManagedProviders(await readFile(this.#configPath, "utf8"));
  }

  async getSubscriptionState() {
    return getSubscriptionState(await readFile(this.#configPath, "utf8"));
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

  #enqueue(work) {
    const operation = this.#queue.then(work);
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  async #replace(path, contents) {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.mihomo-mini-${process.pid}-${Date.now()}.tmp`;
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, path);
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

  async #selectSubscription(name, reload) {
    const original = await readFile(this.#configPath, "utf8");
    const next = switchSubscriptionYaml(original, name);
    await this.#replace(this.#configPath, next);
    try {
      await reload();
    } catch (error) {
      await this.#replace(this.#configPath, original);
      throw error;
    }
    return getSubscriptionState(next);
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
