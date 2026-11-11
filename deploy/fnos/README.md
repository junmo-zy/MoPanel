# FNOS: Mihomo 与 MoPanel 分开部署

这套文件用于两个**独立**的飞牛 OS Compose 项目：

- `mihomo/compose.yml`：Mihomo 核心，向局域网提供混合代理端口。
- `mopanel/compose.yml`：MoPanel 管理页面，使用私有 Docker 网络访问核心控制器。

它不使用 TUN、`privileged`、`network_mode: host`，也不将 Mihomo 的控制器 `9090` 映射到 NAS；这是 FNOS 上风险和兼容性都更低的方式。

## 前提

1. NAS 架构必须是 `x86_64` 或 `aarch64`。当前 MoPanel 镜像包含 `linux/amd64` 与 `linux/arm64`，不支持 `armv7l`。
2. 为两个项目选择以下目录结构（`/vol1/1000` 只是常见示例；以 FNOS 文件管理器显示的**实际绝对路径**为准）：

   ```text
   /vol1/1000/docker/
   ├─ mihomo/
   │  ├─ compose.yml
   │  ├─ .env
   │  └─ config/
   │     └─ config.yaml
   └─ mopanel/
      ├─ compose.yml
      └─ .env
   ```

3. 代理订阅需要使用你自己的有效 HTTP/HTTPS 订阅链接；Compose 文件不能替代订阅服务。

## 1. 创建共享网络（只做一次）

在 FNOS 的 SSH/终端执行以下命令。重复执行也安全：

```bash
docker network inspect mopanel-net >/dev/null 2>&1 || docker network create --driver bridge mopanel-net
```

也可以在 FNOS Docker 的“网络”页面新建一个名为 `mopanel-net`、驱动为 `bridge` 的网络。**必须先有它再创建两个 Compose 项目**，否则 Docker 会报 `Network not found`。

## 2. 安装 Mihomo 项目

1. 将 `mihomo/compose.yml`、`mihomo/.env.example` 和 `mihomo/config/config.yaml` 放到上面的 `mihomo` 目录。
2. 把 `.env.example` 重命名为 `.env`。若 `17890` 已被占用，只修改 `MIHOMO_HOST_PORT`；容器内部端口和 `config.yaml` 中的 `mixed-port: 7890` 不要改。
3. 在 FNOS Docker → Compose → 新增项目中选择 `mihomo` 目录并启动。

局域网客户端的 HTTP/SOCKS/Mixed 代理地址是 `NAS_IP:17890`（如果在 `.env` 修改过，就使用修改后的端口）。

## 3. 安装 MoPanel 项目

1. 将 `mopanel/compose.yml` 和 `mopanel/.env.example` 放到另一个 `mopanel` 目录。
2. 把 `.env.example` 重命名为 `.env`，将 `MIHOMO_CONFIG_DIR` 设置为 **Mihomo `config` 目录的绝对路径**。例如第一步目录结构保持不变时：

   ```dotenv
   MIHOMO_CONFIG_DIR=/vol1/1000/docker/mihomo/config
   MOPANEL_PORT=1224
   ```

3. 在 FNOS Docker → Compose → 新增项目中选择 `mopanel` 目录并启动。
4. 浏览器打开 `http://NAS_IP:1224`。

MoPanel 首次启动前于 Mihomo 之前启动也不会损坏配置；它会暂时显示未连接，核心启动后会自动恢复。

如果你的 FNOS Compose 界面没有自动读取 `.env`，直接编辑对应的 `compose.yml`：将 `MIHOMO_CONFIG_DIR` 的默认路径替换为实际绝对路径；端口没有冲突时保持默认 `17890` 和 `1224` 即可。

## 4. 首次填入订阅

首次的 `config.yaml` 故意使用带 DIRECT 回退节点的内联 `subscription-1`，因此两个容器可以无订阅、无配置解析错误地启动。

打开 MoPanel 后：

1. 进入“订阅”。
2. 在“配置中的代理提供者”中编辑 `subscription-1`。
3. 将类型改为 **HTTP 订阅**，粘贴你的订阅链接，保留下载代理为 `DIRECT`。
4. 保存。MoPanel 会将缓存写到 `config/proxy_providers/`，并调用 Mihomo 热重载。

之后可在“订阅切换”卡片中添加、选择不同订阅；`PROXY` 组的 `use` 会随选择自动更新。

## 5. 验证

在 SSH/终端中可执行：

```bash
docker network inspect mopanel-net
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl http://NAS_IP:1224/health
```

最后一个请求返回 JSON 且 `"ok": true` 代表 MoPanel 已运行。进入网页后右上角显示“已连接”才代表它也已连上 Mihomo。

## 已有 `mihomo_lan` / `config_lan` 的兼容迁移

如果你原来使用的是类似下面的核心启动方式：`./config_lan:/app/config`、`-f /app/config/config.yaml`，不要新建第二个 Mihomo 核心。使用以下兼容文件替换**原有 Mihomo Compose 项目**的 YAML：

- `mihomo/compose.config-lan-compatible.yml`

它会保留：

- 容器名 `mihomo_lan`；
- 宿主目录 `./config_lan`；
- 原来的 18888（Mixed）、18889（SOCKS）、19090（控制器）端口；
- 旧的 `/app/config` 路径。

同时它把同一目录挂载到 `/root/.config/mihomo`，并以该路径启动核心。因此 MoPanel 可安全使用 `/root/.config/mihomo/config.yaml` 热重载，不需要软链接。

再用下面两份文件创建单独的 MoPanel 项目：

- `mopanel/compose.for-config-lan.yml`
- `mopanel/.env.config-lan.example`（复制为 `.env` 后填入真实绝对路径和 Mihomo `secret`）

此模式下 MoPanel 使用 `http://mihomo:19090`，不依赖宿主机 `host.docker.internal`。`config_lan/config.yaml` 中的控制器必须监听容器网络，例如：

```yaml
external-controller: 0.0.0.0:19090
secret: "与你的 MIHOMO_SECRET 完全一致"
```

如果原配置写的是 `127.0.0.1:19090`，MoPanel 无法从另一个容器访问，必须改为 `0.0.0.0:19090`。保留 `19090:19090` 端口映射仅用于你仍需要从 NAS 主机访问 MetaCubeXD；仅使用 MoPanel 时可删除该映射。

## 不要改动的关键项

- 两份 Compose 都必须保留 `mopanel-net` 的 `external: true`。
- 两份 Compose 必须挂载同一份 `config` 目录；MoPanel 使用 `/config/config.yaml`，Mihomo 使用 `/root/.config/mihomo/config.yaml`。
- 不要发布 `9090:9090`，也不要把控制器改为 `127.0.0.1:9090`。
- 不要把 `config` 卷改为只读；MoPanel 需要保存订阅缓存和 `.mihomo-mini/` 元数据。
- 如果后续给 `config.yaml` 添加 `secret: ...`，请在 MoPanel Compose 的 `MIHOMO_SECRET` 填入完全相同的值，再重启 MoPanel。

## 升级

在对应项目目录执行，或在 FNOS Compose 页面点击更新：

```bash
docker compose pull
docker compose up -d
```

Mihomo 配置目录不会被镜像更新覆盖。
