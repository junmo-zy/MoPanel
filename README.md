# MoPanel

一个面向 Docker 场景的轻量 Mihomo Web 控制面板。操作习惯接近 Clash Verge，只保留日常需要的状态、代理、配置、连接、日志和基础设置。

## 功能

- 概览：核心状态、规则/全局/直连、当前路由、实时流量与连接数
- 代理：代理组、节点切换、单节点与全部延迟测试
- 配置：添加、编辑、删除 `proxy-providers`，以及立即更新已加载的提供者
- 连接：搜索、查看、关闭单个或全部活动连接
- 日志：通过 Mihomo WebSocket 实时查看日志
- 设置：混合端口、局域网访问、IPv6 等常用核心参数
- 外观：macOS 风格玻璃窗口、三张内置壁纸、自定义 JPG/PNG/WebP、模糊度与遮罩调节
- 同源代理：Mihomo 密钥只保留在服务端容器环境变量中，不下发到浏览器

## Mihomo 配置

控制面板需要访问 Mihomo 外部控制器。确保 `config.yaml` 至少包含：

```yaml
external-controller: 0.0.0.0:9090
secret: "换成你自己的强密钥"
```

不要把 `9090` 控制器端口直接暴露到公网，让 Mihomo 与本面板加入同一个 Docker 网络即可。

## Docker 启动

1. 复制示例文件并修改 Mihomo 控制器密钥：

   ```bash
   cp compose.example.yml compose.yml
   ```

2. 把 Mihomo 配置放在 `./config/config.yaml`。如果实际文件名或容器路径不同，同时修改：

   - `MIHOMO_CONFIG_PATH`：面板容器看到的配置文件路径
   - `MIHOMO_RELOAD_PATH`：Mihomo 容器看到的同一份配置文件路径

3. 确保 `./config` 对 compose 中的 `PUID/PGID` 可写。默认使用 `1000:1000`；也可在 `.env` 中覆盖。

4. 构建并启动：

   ```bash
   docker compose up -d --build
   ```

5. 打开 `http://你的服务器地址:1224`。进入“配置”即可直接增删改代理提供者。

如果 Mihomo 已由另一份 compose 管理，请删除示例中的 `mihomo` 服务，让两个容器加入同一个 `mihomo-net`，并把同一个配置目录分别挂载到两个容器。

## 配置管理的安全行为

- 接口只允许管理 `proxy-providers`，不提供任意文件读取或写入能力
- 配置管理不设浏览器侧解锁口令；请只将面板暴露给可信网络
- 名称修改会同步更新 `proxy-groups[].use` 引用；删除会移除对应引用
- 危险相对路径和重复缓存路径会在写盘前拒绝
- 每次保存先写配置再要求 Mihomo 强制重载；重载失败会自动恢复原文件
- 面板未设置 `MIHOMO_CONFIG_PATH` 时，配置管理保持禁用

配置页只编辑常用字段；已有的 `header`、`override` 等高级字段会原样保留。

壁纸偏好保存在浏览器本地；自定义图片本体写入 IndexedDB，不会上传到面板服务端。单张自定义壁纸上限为 16 MB。

## 本地开发

普通界面开发：

```bash
npm install
npm run dev
```

Vite 开发服务会把 `/api/mihomo` 转发到 `MIHOMO_API_URL`。完整的 YAML 配置管理由 Node 服务提供，需先构建再运行：

```bash
npm run build
MIHOMO_API_URL=http://127.0.0.1:9090 \
MIHOMO_SECRET=你的密钥 \
MIHOMO_CONFIG_PATH=/绝对路径/config.yaml \
MIHOMO_RELOAD_PATH=/mihomo/看到的/config.yaml \
npm start
```

PowerShell 请用 `$env:变量名="值"` 的形式设置环境变量。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 面板容器监听端口 |
| `MIHOMO_API_URL` | `http://mihomo:9090` | Mihomo 外部控制器地址 |
| `MIHOMO_SECRET` | 空 | 与 Mihomo `secret` 一致 |
| `MIHOMO_CONFIG_PATH` | 空 | 面板容器内可读写的 `config.yaml` 路径 |
| `MIHOMO_RELOAD_PATH` | `MIHOMO_CONFIG_PATH` | Mihomo 容器内用于重载的配置路径 |

控制器不可达时，界面会明确显示演示数据，方便先检查布局和操作。
