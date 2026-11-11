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

### 概览

顶部切换代理模式（规则 / 全局 / 直连），查看当前实际使用的代理组和节点及其延迟，点击“更换代理”选择节点，“测速”测试当前代理组。下面是流量统计、出口 IP（经代理查询）、当前订阅（流量与到期）和内核信息。

### 代理

和 Clash Verge 的代理页一样：每个代理组是一张可折叠卡片，节点平铺显示。点击节点卡片即切换，点击延迟只测这一个节点；组标题上的图标可以定位当前节点、整组测速、排序和搜索（鼠标停留会显示说明）。自动选优 / 故障转移等自动组只能查看和测速。

测速方式与 Clash Verge 相同：逐个节点测试、同时 10 个、超时 10 秒，结果逐个出现。测速地址在“设置”页填写，代理组自己配置了测速地址时优先用组的地址。

### 订阅

每个订阅一张卡片：点击切换，右上角可以更新、编辑、删除；显示节点数、更新时间，以及机场提供的已用流量和到期时间。

切换或更新订阅时，会像 Clash Verge 一样使用订阅自带的代理组和规则（见上方“订阅与规则”）；订阅只提供节点时使用 `config.yaml` 原有的规则。Mihomo 拒绝新配置时会自动恢复原配置。表单只编辑常用字段，原配置中未暴露的高级字段会被保留。

> 自定义自动组固定使用你选中的节点。切换到另一个机场后，它仍使用原机场的节点；需要时在“代理”页编辑它重新选择。

### 连接、规则、日志、测试

- **连接**：实时连接与每条速度，可按速度/流量排序、查看详情、关闭单个或全部，保留已关闭记录。
- **规则**：按匹配顺序列出当前规则和规则集条数，显示规则来自订阅还是本地配置，可“从订阅同步”、更新规则集。
- **日志**：按级别筛选（含调试）、关键字高亮、暂停/继续；切换页面不会丢失。
- **测试**：解锁测试（Netflix、Disney+、ChatGPT、Claude、Gemini 等）和网站延迟，都经当前代理检测。

### 设置

混合端口、局域网访问、IPv6、测速地址，以及外观：壁纸（可上传、可移除预设）、壁纸模糊度、背景遮罩和玻璃材质（超薄 / 轻薄 / 标准 / 浓厚）。外观设置保存在 `.mihomo-mini/`，电脑和手机显示一致；浅色/深色模式只保存在当前浏览器。

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

## 订阅与规则（和 Clash Verge 一样）

订阅链接按 Clash Verge 的方式使用：切换或更新订阅时，MoPanel 会下载订阅里的完整配置，使用其中的**代理组、规则和规则集**；端口、局域网、控制器密钥、代理模式等基础设置仍以你的 `config.yaml` 为准。节点照常由订阅提供者加载，所以流量/到期、测速和自定义自动组都继续可用。

- 订阅只提供节点（没有规则）时，自动使用你原来 `config.yaml` 里的代理组和规则。
- 订阅暂时下载不了时，继续使用上次下载的规则，并在“规则”页提示原因。
- 面板启动后和每 6 小时会自动同步一次；“规则”页的“从订阅同步”可随时手动同步。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 面板容器内部监听端口。 |
| `MIHOMO_API_URL` | `http://mihomo:9090` | Mihomo 外部控制器的 Docker 内部地址。 |
| `MIHOMO_SECRET` | 空 | 与 Mihomo `secret` 完全一致；它是面板访问控制器的鉴权密钥，不是面板网页登录密码。 |
| `MIHOMO_CONFIG_PATH` | 空 | 面板容器内可读写的 `config.yaml` 路径；为空时订阅管理会禁用。 |
| `MIHOMO_RELOAD_PATH` | `MIHOMO_CONFIG_PATH` | Mihomo 容器内用于配置重载的同一文件路径。 |
| `MIHOMO_PROXY_URL` | 自动 | “测试”页（解锁测试、网站延迟）和概览“出口 IP”会经 Mihomo 的代理端口访问外网。默认使用 `MIHOMO_API_URL` 的主机名加 Mihomo 当前的 `mixed-port`（如 `http://mihomo:7890`）；代理端口需要账号密码或地址不同时在此填写，例如 `http://user:pass@mihomo:7890`。 |
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
| “测试”页或“出口 IP”提示无法连接 Mihomo 代理端口 | 面板要从自己的容器连到 Mihomo 的 `mixed-port`：在 Mihomo 配置里开启 `allow-lan: true`（并保持 `bind-address: "*"`），或用 `MIHOMO_PROXY_URL` 指定可达地址；配置了 `authentication` 时把账号写进该地址。 |
| 某项解锁测试显示“检测失败” | 该网站拦截了当前出口（常见于机房 IP 或风控），或网站接口变化；换节点后点卡片右上角重新检测。 |

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
