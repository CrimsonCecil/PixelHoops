# PixelHoops 迁移到腾讯云：操作手册

目标：把 Cloudflare Worker 后端换成腾讯云上的 Node 服务，同时用自建 TURN 解决双人联机卡顿。
分支：`tencent-cloud`。**旧的 Cloudflare 部署一直保留，随时可以切回去。**

## 0. 这个分支改了什么

| 位置 | 内容 | 目的 |
| :--- | :--- | :--- |
| `tencent/server.mjs` | Node 服务：原样复用 `worker/src/index.js`（REST 全部接口） + WebSocket 中继 + `/api/turn` + 可选静态站点 | 后端搬家 |
| `tencent/lib/d1.mjs` | 用 `node:sqlite` 实现 D1 接口 | Worker 代码零修改 |
| `tencent/lib/relay.mjs` | `room.js`（Durable Object）的 Node 版，关闭码、房主令牌、120 秒保留期、peer-open/close 语义不变 | 中继搬家 |
| `tencent/lib/turn.mjs` | coturn 动态凭证（HMAC-SHA1，6 小时过期，按 IP 限流） | 治卡顿 |
| `js/rooms.js` | ①从 `/api/turn` 取凭证注入 ICE；去掉国内不通的 Google STUN ②`input` 改走独立无序通道并带序号，房主丢弃迟到/重复包 | 治卡顿 |
| `js/main.js` | 右下角延迟后面显示 `P2P` 或 `中继` | 现场判断走了哪条路 |
| `tencent/deploy/` | 一键安装脚本、nginx、systemd、coturn 配置、备份脚本 | 部署 |
| `tencent/migrate-from-cloudflare.mjs` | 通过公开 API 把调参配置、历史、录像搬到新库 | 数据迁移 |

兼容性：旧版前端（没有 `seq`、没有 `input` 通道）连新后端照常能玩；新版前端连旧 Cloudflare 后端也能玩（`/api/turn` 返回 404 时自动退回 STUN）。所以前后端可以分开、分时间切换。

---

## 1. 你要做的（我没法代劳，约 20 分钟）

### 1.1 买服务器

腾讯云控制台 → **轻量应用服务器** → 新建：

| 项 | 选择 |
| :--- | :--- |
| 地域 | **中国香港**（免 ICP 备案；深圳、广州到香港约 5 到 15ms） |
| 镜像 | **Ubuntu 22.04 LTS** |
| 套餐 | 2 核 2G 起步，**流量包不要选太小**（TURN 兜底中继会耗流量，两人对战约 100 到 300 kbps） |
| 登录 | 优先 SSH 密钥 |

### 1.2 开放端口（轻量服务器 → 防火墙）

| 协议 | 端口 | 用途 |
| :--- | :--- | :--- |
| TCP | 22 | SSH |
| TCP | 80、443 | 网页、API、WebSocket |
| TCP + UDP | 3478 | TURN |
| UDP | 49152-50000 | TURN 中继端口段 |

> **这一步最容易漏。** 只开 3478 不开 UDP 端口段，TURN 能握手但传不了数据，表现为"有时能连有时不能"。服务器内的 ufw 脚本会自动配，但**控制台防火墙必须你自己加**。

### 1.3 域名解析（Cloudflare DNS）

先**只加一条测试记录**，不要动线上正在用的：

| 类型 | 名称 | 内容 | 代理状态 |
| :--- | :--- | :--- | :--- |
| A | `ph-test` | 服务器公网 IP | **仅 DNS（灰云）** |

必须是灰云。橙云会让 Cloudflare 代理 WebSocket 并隐藏真实 IP，TURN 会连不上。

---

## 2. 安装（SSH 登录服务器后）

```bash
# 1) 拉代码并安装，测试域名先用 ph-test.kccecil.com
sudo -i
apt-get update && apt-get install -y git
git clone --depth 1 --branch tencent-cloud https://github.com/CrimsonCecil/PixelHoops.git /tmp/ph
API_DOMAIN=ph-test.kccecil.com EMAIL=你的邮箱 BRANCH=tencent-cloud bash /tmp/ph/tencent/deploy/setup.sh
```

脚本会装好 Node 22、nginx、证书、coturn、systemd 服务和 ufw，可以重复运行，不会覆盖已有的 TURN 密钥和数据库。

### 2.1 验证（全部通过再往下走）

```bash
curl https://ph-test.kccecil.com/api/health        # {"ok":true,"frozen":false}
curl https://ph-test.kccecil.com/api/turn          # 应返回 iceServers，含 turn: 地址
systemctl status pixelhoops coturn --no-pager
```

从**你自己的电脑**测 TURN 能否真的转发（不是看进程在不在）：

打开 <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>，
把 `/api/turn` 返回里的 `urls`、`username`、`credential` 填进去，点 Gather candidates。
**出现类型为 `relay` 的候选项 = TURN 正常。** 没有 relay 就是 UDP 端口段没开。

---

## 3. 迁数据

```bash
cd /opt/pixelhoops/app/tencent
sudo -u pixelhoops DB_FILE=/opt/pixelhoops/data/pixelhoops.db node --no-warnings migrate-from-cloudflare.mjs
```

只读线上 API，不需要 Cloudflare 令牌，可重复运行（按 id 覆盖，不删除）。末尾出现 `VERIFY OK` 即完成。

---

## 4. 用测试域名先试玩（前端先不动）

安装时加上 `WEB_DOMAIN=ph-test.kccecil.com`（并给它加一条同样的灰云 A 记录），服务器会同时托管整套静态页面，
并自动把页面里的 `__API_BASE__` 改成它自己，这样**完全不碰线上正在用的站点**就能试玩：

```bash
API_DOMAIN=ph-test.kccecil.com WEB_DOMAIN=ph-test.kccecil.com EMAIL=你的邮箱 BRANCH=tencent-cloud bash /tmp/ph/tencent/deploy/setup.sh
```

让两个人（最好一个深圳一个广州）都打开 `https://ph-test.kccecil.com/`。

建议操作：

1. 两人进同一房间，打一局。
2. 看左下角：`PING xx ms P2P` 或 `PING xx ms 中继`。
3. 记下延迟和体感。

**判断标准：**

| 显示 | 含义 | 预期 |
| :--- | :--- | :--- |
| `P2P` 且延迟 < 40ms | 直连成功 | 同城应在 10 到 30ms |
| `中继` 且延迟 < 60ms | 直连失败，走香港 TURN/WS | 可以玩 |
| `中继` 且延迟 > 100ms | 线路问题 | 告诉我，考虑换广州机房 |

---

## 5. 正式切换

1. **再迁一次数据**（命令同第 3 步），拿到最新录像和配置。
2. `index.html` 里的 `__API_BASE__` 保持 `https://pixelhoops-api.kccecil.com` 不变，**只改 DNS**：
   Cloudflare DNS → `pixelhoops-api` 这条记录改为 **A 记录指向香港服务器 IP，灰云**。
   （原来是 Worker 自定义域名，需要先在 Cloudflare 的 Worker 设置里把 `pixelhoops-api.kccecil.com` 这个自定义域名**解除绑定**，再加 A 记录。）
3. 在服务器上用正式域名重新跑一次 `setup.sh`（`API_DOMAIN=pixelhoops-api.kccecil.com`），重新签证书。
4. 验证：`curl https://pixelhoops-api.kccecil.com/api/turn`。
5. 前端（`pixelhoops.kccecil.com`）仍在 Cloudflare，把本分支合并到 `main` 后重新 `wrangler deploy` 一次即可带上新的 `rooms.js`。

切换后跑一次：

```bash
curl -s https://pixelhoops-api.kccecil.com/api/stats     # {"rooms":N,"sockets":M}
journalctl -u pixelhoops -f
```

## 6. 回滚（出问题 1 分钟内恢复）

1. Cloudflare DNS 删掉 `pixelhoops-api` 的 A 记录。
2. 在 Worker 设置里重新绑定自定义域名 `pixelhoops-api.kccecil.com`（或 `wrangler deploy --config worker/wrangler.toml`，`wrangler.toml` 里的 routes 会自动绑回）。
3. 前端自动退回 STUN（`/api/turn` 404），一切照旧。

> Cloudflare 上的 D1 数据始终没有被改动或删除，回滚后看到的就是切换前的状态。切换期间新产生的录像在回滚后不会出现在 Cloudflare 里，需要的话先用第 3 步反向导出。

---

## 7. 日常运维

| 事项 | 命令 |
| :--- | :--- |
| 看日志 | `journalctl -u pixelhoops -f` / `journalctl -u coturn -f` |
| 重启 | `systemctl restart pixelhoops coturn` |
| 备份数据库 | `bash /opt/pixelhoops/app/tencent/deploy/backup.sh`（保留最近 14 份；建议加 cron） |
| 更新代码 | `cd /opt/pixelhoops/app && git pull && systemctl restart pixelhoops` |
| 证书续期 | certbot 自动续期，无需操作 |
| 在线数 | `curl localhost:8787/api/stats` |

每天备份的 cron：

```bash
echo '17 4 * * * root bash /opt/pixelhoops/app/tencent/deploy/backup.sh >/dev/null' > /etc/cron.d/pixelhoops-backup
```

## 8. 安全说明

- TURN 密码是**动态短期凭证**（6 小时过期），长期密钥只在服务器 `/etc/pixelhoops.env`（权限 640），不会进前端。
- `/api/turn` 对每个 IP 限流 30 次/分钟；coturn 设置了单用户配额和总带宽上限，并禁止中继到内网地址。
- 原有 API 仍然是 `CORS: *` 且无写鉴权（和 Cloudflare 版一致，没有改变）。如果以后要公开推广，建议再补鉴权和限流。
