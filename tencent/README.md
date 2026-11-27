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
| 地域 | **中国香港**（免 ICP 备案；深圳、广州到香港约 5 到 15ms）。要用广州机房见第 9 节 |
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
| `中继` 且延迟 > 100ms | 线路问题 | 考虑换广州机房，见第 9 节 |

---

## 5. 正式切换

1. **再迁一次数据**（命令同第 3 步），拿到最新录像和配置。
2. `index.html` 里的 `__API_BASE__` 保持 `https://pixelhoops-api.kccecil.com` 不变，**只改 DNS**：
   Cloudflare DNS → `pixelhoops-api` 这条记录改为 **A 记录指向香港服务器 IP，灰云**。
   （原来是 Worker 自定义域名，需要先在 Cloudflare 的 Worker 设置里把 `pixelhoops-api.kccecil.com` 这个自定义域名**解除绑定**，再加 A 记录。）
3. 在服务器上用正式域名重新跑一次 `setup.sh`（`API_DOMAIN=pixelhoops-api.kccecil.com`），重新签证书。
4. 验证：`curl https://pixelhoops-api.kccecil.com/api/turn`。
5. 正式前端（`pixelhoops.kccecil.com`）也由这台腾讯云服务器提供；发布方式见下节，不需要运行 Wrangler。

### 正式站跟随 `main`

在已完成初次安装的腾讯云服务器上，以 root 从可信 checkout 安装同步脚本和 systemd 单元：

```bash
install -m 0755 tencent/deploy/sync-main.sh /usr/local/sbin/pixelhoops-sync-main
install -m 0644 tencent/deploy/pixelhoops-sync-main.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl start pixelhoops-sync-main.service
systemctl enable --now pixelhoops-sync-main.timer
journalctl -u pixelhoops-sync-main.service -n 30 --no-pager
```

定时器每分钟检查 GitHub 的 `main`。脚本先准备完整版本，再切换 `/opt/pixelhoops/app`；只在后端代码或依赖变更时重启 Node 服务。发布后检查本机健康接口和两份游戏脚本；失败则切回。初次发布前的目录和上一个发布版本都保存在 `/opt/pixelhoops/releases/`，数据库和环境配置不变。启用后不要再用 `setup.sh` 发布代码。

上线检查失败的提交不会每分钟重试；合入新的提交后会自动恢复同步。如果故障与代码无关并需重试同一个提交，先确认服务已恢复，再删除 `/opt/pixelhoops/releases/.rejected/` 下对应提交 SHA 的标记文件。

需要回滚时，先停用定时器（否则下次检查会重新发布 `main`），再运行：

```bash
sudo systemctl disable --now pixelhoops-sync-main.timer
sudo /usr/local/sbin/pixelhoops-sync-main rollback
```

如需恢复首次同步前保留的版本，使用 `rollback-original`。

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

---

## 9. 从香港换到广州机房

程序和部署脚本都按域名工作，公网 IP 由 `setup.sh` 自动探测，所以换机房不用改游戏代码：新开一台服务器装好，搬数据，再把 DNS 指过去。香港服务器在切换完成前一直照常运行。

### 9.1 动手前先确认

- **ICP 备案。** 广州属于中国内地，`kccecil.com` 必须先在腾讯云完成备案（已在别处备案的做接入备案）。没备案的域名解析到内地服务器后，80/443 的访问会被拦截，证书也签不下来。备案按主域名办理，通过后 `pixelhoops`、`pixelhoops-api`、`ph-test` 三个子域名都能用。
- **访问境外源。** 内地服务器访问 deb.nodesource.com、registry.npmjs.org 和 GitHub 不稳定。安装时加 `CN_MIRROR=1`，Node 和 npm 依赖会改从腾讯云镜像下载。代码同步默认仍然拉 GitHub，某一分钟拉不到只是这一分钟不更新，下一分钟会重试。如果长期拉不到，把仓库镜像到国内的代码托管平台，安装时再加 `REPO_URL=镜像地址`，`sync-main.sh` 会跟着用这个地址。

### 9.2 新建服务器

按 1.1 和 1.2 操作，地域选**广州**，镜像、套餐、防火墙端口都不变。

### 9.3 安装，先用测试域名验证

Cloudflare DNS 把 `ph-test` 的 A 记录改成广州服务器 IP（灰云），然后登录广州服务器：

```bash
sudo -i
apt-get update && apt-get install -y git
git clone --depth 1 https://github.com/CrimsonCecil/PixelHoops.git /tmp/ph
CN_MIRROR=1 API_DOMAIN=ph-test.kccecil.com WEB_DOMAIN=ph-test.kccecil.com EMAIL=你的邮箱 bash /tmp/ph/tencent/deploy/setup.sh
```

按 2.1 验证接口和 TURN，再按第 4 节找两个人试玩，记下延迟。

### 9.4 搬数据

**方式一：拷贝数据库备份（完整，推荐）。** 在香港服务器上生成备份：

```bash
bash /opt/pixelhoops/app/tencent/deploy/backup.sh     # 打印出 .db.gz 文件路径
```

把这个文件传到广州服务器（例如 `scp` 到 `/root/`），在广州服务器上恢复：

```bash
systemctl stop pixelhoops
gunzip -c /root/pixelhoops-时间戳.db.gz > /opt/pixelhoops/data/pixelhoops.db
rm -f /opt/pixelhoops/data/pixelhoops.db-wal /opt/pixelhoops/data/pixelhoops.db-shm
chown pixelhoops:pixelhoops /opt/pixelhoops/data/pixelhoops.db
systemctl start pixelhoops
```

**方式二：通过公开接口拉取（两台机器之间不用传文件）。** 必须在正式域名**还指向香港**的时候，在广州服务器上运行：

```bash
cd /opt/pixelhoops/app/tencent
sudo -u pixelhoops DB_FILE=/opt/pixelhoops/data/pixelhoops.db node --no-warnings migrate-from-cloudflare.mjs
```

脚本默认读取 `https://pixelhoops-api.kccecil.com`，这时它就是香港服务器。调参配置和录像会完整搬过来，历史记录只能拿到最近 200 条。可以重复运行。

### 9.5 正式切换

1. 挑没人在线的时间：`curl -s https://pixelhoops-api.kccecil.com/api/stats` 返回的 `sockets` 为 0。再按 9.4 搬一次数据，拿到最新的录像和配置。
2. Cloudflare DNS：`pixelhoops` 和 `pixelhoops-api` 两条 A 记录改成广州服务器 IP，保持灰云。
3. 在广州服务器上用正式域名重跑安装，签发正式证书（`/tmp/ph` 不在了就重新 clone）：

   ```bash
   CN_MIRROR=1 API_DOMAIN=pixelhoops-api.kccecil.com WEB_DOMAIN=pixelhoops.kccecil.com EXTRA_DOMAINS=ph-test.kccecil.com EMAIL=你的邮箱 bash /tmp/ph/tencent/deploy/setup.sh
   ```

   域名参数先对照香港服务器的 `/etc/pixelhoops.env` 和 nginx 配置核对一遍。DNS 改完到证书签发完成之间的几分钟，HTTPS 访问会失败。
4. 验证：`curl https://pixelhoops-api.kccecil.com/api/health`、`curl https://pixelhoops-api.kccecil.com/api/turn`，并按 2.1 用 trickle-ice 页面确认能拿到 `relay` 候选。
5. 按第 5 节"正式站跟随 `main`"安装同步定时器，按第 7 节加上每天备份的 cron。
6. 香港服务器上停掉同步定时器：`systemctl disable --now pixelhoops-sync-main.timer`。机器先保留几天用于回滚。

**回滚：** 把两条 A 记录改回香港服务器 IP 即可。切换后在广州新产生的录像和配置不会自动回到香港，需要的话先按 9.4 反方向搬一次。确认广州稳定后再退掉香港服务器。

---

## 10. 广州只做中继（不用域名，不用备案）

内地的拦截只针对域名：没备案的域名解析到内地服务器后，80/443 会被拦。TURN 中继是按 IP 和端口连接的，不带域名，所以可以在广州单独放一台只跑 coturn 的服务器。网站、API、数据库都留在香港，玩家打开的地址不变，对战流量在需要中继时改走广州。

**不要把 `kccecil.com` 的任何记录指向广州 IP。**

### 10.1 广州服务器

1. 控制台防火墙（或安全组）放行：TCP 3478、UDP 3478、UDP 49152-50000。
2. 在香港服务器上读出共享密钥：`sudo grep TURN_SECRET /etc/pixelhoops.env`。
3. 把 `tencent/deploy/setup-turn.sh` 传到广州服务器（脚本自带全部配置，不需要 clone 仓库），然后运行：

   ```bash
   sudo TURN_SECRET=上一步读到的值 bash setup-turn.sh
   ```

   脚本只装 coturn，支持 Ubuntu/Debian 和 TencentOS/OpenCloudOS，可以重复运行。

### 10.2 香港服务器

先确认香港已经同步到包含本节的版本（`TURN_HOST` 写多个地址需要新版 `lib/turn.mjs`；旧版只能写一个地址）。然后：

```bash
sudo sed -i 's/^TURN_HOST=.*/TURN_HOST=广州IP,pixelhoops-api.kccecil.com/' /etc/pixelhoops.env
sudo systemctl restart pixelhoops        # 会断开正在进行的房间，挑没人在线时做
```

`/api/turn` 会按这个顺序返回两台中继，广州在前，香港留作备用。以后重跑 `setup.sh` 时要带上同样的 `TURN_HOST=...`，否则会被写回默认值。

### 10.3 验证

- `curl https://pixelhoops-api.kccecil.com/api/turn`：`iceServers` 第一项是广州 IP。
- 按 2.1 用 trickle-ice 页面填入广州的 `turn:广州IP:3478` 和接口返回的用户名、密码，能拿到 `relay` 候选，地址是广州 IP。
- 广州服务器上 `journalctl -u coturn -f`，对战时能看到 allocation 日志。

**回滚：** 把 `TURN_HOST` 改回 `pixelhoops-api.kccecil.com` 并重启 `pixelhoops`。

### 10.4 这个方案不包含什么

房间信令和 WebSocket 中继（P2P 和 TURN 都不通时的兜底）仍然走香港。要把它们也搬到广州，需要给广州 IP 签发 HTTPS 证书（Let's Encrypt 的 IP 证书有效期约 6 天，必须自动续期），前端再用 `wss://广州IP` 连接。
