# MoPanel

MoPanel 是一个面向 Docker / NAS 的轻量代理控制面板，连接 Mihomo 的外部控制器后，提供接近 Clash Verge 的日常操作：查看状态、切换代理模式和节点、测速、管理订阅提供者、查看连接与日志，以及常用核心设置。

它只管理 Mihomo，不会修改宿主机系统代理。

## 适用场景

- NAS、Docker Desktop、Linux 服务器上已经运行或准备运行 Mihomo。
- 希望用浏览器管理代理，而不是使用 MetaCubeXD 这类高密度面板。
- 希望保留 Mihomo 原生配置与订阅，并能从界面管理 `proxy-providers`。

## 公开镜像：推荐 NAS 直接拉取

MoPanel 已发布为公开的多架构镜像，无需在 NAS 本地构建：

```text
ghcr.io/junmo-zy/mopanel:latest
```

镜像同时支持 `linux/amd64` 与 `linux/arm64`。在已存在 Mihomo 的 NAS 上，优先复制 [`compose.ghcr.example.yml`](./compose.ghcr.example.yml) 为 `compose.yml`，按实际环境调整下面三项：

- `MIHOMO_API_URL`：Mihomo 外部控制器地址；若通过 NAS 映射端口访问，保留 `http://host.docker.internal:19090`。
- `MIHOMO_SECRET`：与 `config.yaml` 的 `secret` 完全一致；未设置 `secret` 时保持为空。
- `/volume1/docker/mihomo/config:/config`：替换成包含 `config.yaml` 的 NAS 绝对路径。

启动或更新只需拉取镜像：

```bash
docker compose pull
docker compose up -d
```

## 部署前准备

1. 已安装 Docker Engine / Docker Desktop / NAS 的 Container Manager，并支持 Docker Compose。
2. 准备一个可读写的 Mihomo 配置目录，至少包含 `config.yaml`。
3. 在 `config.yaml` 中启用外部控制器。示例：

   ```yaml
   mixed-port: 7890
   mode: rule
   external-controller: 0.0.0.0:9090
   secret: "替换为一段你自己的强密钥"
   ```

   `secret` 可以留空，但 MoPanel 和 Mihomo 两边的值必须一致。

> 不要把 `9090` 暴露到公网。MoPanel 只需要通过 Docker 内部网络访问它。

## 源码构建：MoPanel 与 Mihomo 一起部署

以下方式适合希望修改源码，或希望由同一份 Compose 同时管理 MoPanel 和 Mihomo 的情况。NAS 日常部署优先使用上方的公开镜像。

1. 获取项目代码并进入目录：

   ```bash
   git clone https://github.com/junmo-zy/MoPanel.git
   cd MoPanel
   ```

   仓库为公开仓库；如果 NAS 没有 Git，可从 GitHub 下载源码 ZIP 后解压到 NAS 的 Docker 目录。

2. 创建本地环境文件和 Compose 文件：

   ```bash
   cp .env.example .env
   cp compose.example.yml compose.yml
   ```

3. 编辑 `.env`，填写当前 NAS 用户的 UID/GID，以及与 `config.yaml` 相同的密钥：

   ```dotenv
   PUID=1000
   PGID=1000
   MIHOMO_SECRET=替换为与config.yaml相同的密钥
   ```

   在普通 Linux / NAS 终端中可用 `id -u` 和 `id -g` 查询 UID、GID。若 NAS 的 Compose 图形界面不支持 `.env`，直接在项目环境变量中填写同名变量即可。

4. 创建 `config/config.yaml`，写入你的 Mihomo 配置、订阅和代理组。至少保留上文的 `external-controller` 与 `secret` 配置。`config/` 必须以**目录**形式可读写且持久化挂载，不能只挂单个 `config.yaml`，也不要将它改为 `:ro`：MoPanel 会在其中保存 `.mihomo-mini/auto-groups.json` 与 `settings.json` 等面板元数据。

5. 构建并启动：

   ```bash
   docker compose up -d --build
   ```

6. 打开：`http://NAS_IP:1224`

   例如：`http://192.168.1.20:1224`。

7. 检查状态：

   ```bash
   docker compose ps
   docker compose logs -f mopanel
   ```

MoPanel 的健康检查地址是 `http://NAS_IP:1224/health`，它只说明面板服务正在运行；请以页面右上角“已连接”状态，或下列命令确认 Mihomo 控制器也可访问：

```bash
curl http://NAS_IP:1224/api/mihomo/version
```

## 已有 Mihomo 时：单独部署 MoPanel

如果 Mihomo 已经由另一份 Compose 或 NAS 可视化面板管理，请不要再启动 `compose.example.yml` 中的 `mihomo` 服务。推荐创建一份独立的 MoPanel Compose，直接拉取公开镜像：

```yaml
services:
  mopanel:
    image: ghcr.io/junmo-zy/mopanel:latest
    container_name: mopanel
    restart: unless-stopped
    user: "${PUID:-1000}:${PGID:-1000}"
    ports:
      - "1224:8080"
    environment:
      # 使用 Mihomo 已映射到 NAS 的控制器端口。
      MIHOMO_API_URL: "http://host.docker.internal:19090"
      MIHOMO_SECRET: "${MIHOMO_SECRET:-}"
      MIHOMO_CONFIG_PATH: "/config/config.yaml"
      MIHOMO_RELOAD_PATH: "/root/.config/mihomo/config.yaml"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - "${MIHOMO_CONFIG_DIR}:/config"
```

对应的 `.env` 示例：

```dotenv
PUID=1000
PGID=1000
MIHOMO_SECRET=替换为与config.yaml相同的密钥
MIHOMO_CONFIG_DIR=/volume1/docker/mihomo/config
```

关键点：

- 不要填写 `build: .` 或 `image: mopanel:latest`；必须使用完整镜像名 `ghcr.io/junmo-zy/mopanel:latest`。
- `host.docker.internal` 通过 `extra_hosts` 映射为 NAS 宿主机，因此不需要将两份 Compose 合并到同一个 Docker 网络。
- 如果 NAS 的 Docker 版本不支持 `host-gateway`，将 `MIHOMO_API_URL` 改为 `http://NAS_LAN_IP:19090`。
- `MIHOMO_CONFIG_PATH` 与 `MIHOMO_RELOAD_PATH` 指向同一份 `config.yaml`，但分别使用面板容器和 Mihomo 容器所见的路径。
- 配置目录挂载必须可读写且持久化；MoPanel 会在其 `.mihomo-mini/` 子目录保存自动组和测速设置。若核心容器与面板使用不同 UID/GID，目录权限必须同时允许两者写入。
- 若 Mihomo 以 `/app/config/config.yaml` 启动，需通过 NAS 可视化面板为它额外挂载同一个配置目录到 `/root/.config/mihomo`，这样配置保存后才能成功热重载。

## 日常使用

### 1. 概览：先确认代理模式和当前代理

概览页顶部是最重要的操作区：

- **规则**：流量按 Mihomo 规则处理，实际使用 `PROXY` 代理组。
- **全局**：所有需要代理的流量使用 `GLOBAL` 代理组。
- **直连**：不经过代理，当前代理显示为 `DIRECT`。

“当前代理”会展示当前模式实际生效的代理组和节点，而不是固定显示列表中的第一个代理组。

### 2. 代理：选择代理组与节点

进入“代理”页后：

1. 找到规则模式常用的 `PROXY` 组，或全局模式常用的 `GLOBAL` 组。
2. 点击代理组，查看它可选择的节点或下级代理组。
3. 对 **Selector** 代理组，可以手动选择节点。
4. 对 **URLTest / url-test** 与 **Fallback** 自动组，只能查看和测速；它们会根据测速结果或可用性自动决定节点，不需要手动固定。

### 3. 测速：先设置地址，再全部测速

在“设置”页填写测速地址，例如：

```text
https://www.gstatic.com/generate_204
```

然后在“代理”页或切换节点弹窗中使用“全部测速”。MoPanel 会调用 Mihomo 的延迟测试接口，测试结果会显示在节点列表中；自动组也会根据测试结果更新当前节点。

### 4. 订阅：管理代理提供者

“订阅”页用于管理 `proxy-providers`：

- 添加 HTTP / 文件类型提供者。
- 编辑名称、订阅地址、更新间隔和常用字段。
- 删除不需要的提供者。
- 手动更新已加载的订阅。

表单只编辑常用字段；原配置中未暴露的高级 YAML 字段会被保留。保存后，MoPanel 会写入 `config.yaml` 并请求 Mihomo 重载。

### 5. 设置：网络、外观与测速地址

“设置”页可调整混合端口、局域网访问、IPv6、测速地址、壁纸、模糊度和明暗模式。壁纸与外观偏好只保存在当前浏览器，不会上传到服务器。

## 更新 MoPanel

使用公开镜像部署时，更新方式：

```bash
docker compose pull
docker compose up -d
```

如使用源码构建方式，则执行：

```bash
git pull
docker compose up -d --build
```

`config/`、`.env`、订阅和面板元数据均已被 Git 忽略，不会被提交到仓库。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 面板容器内部监听端口。 |
| `MIHOMO_API_URL` | `http://mihomo:9090` | Mihomo 外部控制器的 Docker 内部地址。 |
| `MIHOMO_SECRET` | 空 | 与 Mihomo `secret` 完全一致；它是面板访问控制器的鉴权密钥，不是面板网页登录密码。 |
| `MIHOMO_CONFIG_PATH` | 空 | 面板容器内可读写的 `config.yaml` 路径；为空时订阅管理会禁用。 |
| `MIHOMO_RELOAD_PATH` | `MIHOMO_CONFIG_PATH` | Mihomo 容器内用于配置重载的同一文件路径。 |
| `PUID` / `PGID` | `1000` | Compose 示例中用于让面板拥有配置目录写入权限。 |
| `MIHOMO_CONFIG_DIR` | 无 | 仅“已有 Mihomo”示例使用，指向 NAS 上的配置目录。 |

## 常见问题

| 现象 | 排查方式 |
| --- | --- |
| 面板显示“无法连接 Mihomo” | 检查 `MIHOMO_API_URL` 是否使用同一 Docker 网络里的核心容器名；确认 `external-controller` 已启用，`MIHOMO_SECRET` 与配置一致。 |
| 添加或编辑订阅后提示重载路径错误 | 确认两容器挂载的是同一配置目录，且 `MIHOMO_RELOAD_PATH` 是 Mihomo 容器实际可访问的路径。 |
| 配置保存失败或没有写入权限 | 检查 NAS 配置目录的属主；将 `.env` 中的 `PUID`、`PGID` 改成目录所属用户。 |
| `1224` 端口无法启动 | 修改 Compose 的 `1224:8080` 左侧端口，例如 `18080:8080`，然后访问新端口。 |
| 节点延迟始终为空 | 在“设置”中填写可访问的 HTTP/HTTPS 测速地址，再执行“全部测速”。 |

## 安全建议

- MoPanel 可以读取配置、修改订阅和触发 Mihomo 重载，建议只在局域网、Tailscale 或带认证的反向代理后使用。
- 不要把 `1224` 和 Mihomo 控制器端口 `9090` 直接端口映射到公网。
- 不要把 `.env`、`config.yaml`、订阅链接或代理节点提交到 GitHub。项目的 `.gitignore` 已默认排除这些文件。

## 本地开发

```bash
npm install
npm run dev
```

完整的配置管理由 Node 服务提供：

```bash
npm run build
npm start
```
