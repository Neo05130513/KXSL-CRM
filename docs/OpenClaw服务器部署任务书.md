# OpenClaw 服务器部署任务书

把本文件内容交给服务器上的 OpenClaw 执行。目标是在服务器上部署 KXSL-CRM，并通过 `https://kxsl-crm.zhituhub.com` 对外访问。

## 一、项目与目标

- 项目名称：知兔-快享市场地图 / KXSL-CRM
- GitHub 仓库：`https://github.com/Neo05130513/KXSL-CRM.git`
- 部署分支：`main`
- 当前确认提交：`6206c7b`
- 应用形态：Python 标准库 HTTP 服务 + SQLite 数据库 + 原生前端 + PWA
- 内部监听地址：`127.0.0.1:4173` 或 `0.0.0.0:4173`
- 对外域名：`kxsl-crm.zhituhub.com`
- 数据库文件：`/opt/kxsl-crm/data/app.db`
- 备份目录：`/opt/kxsl-crm/data/backups/`

## 二、部署前必须确认

1. 确认服务器公网 IPv4：

   ```bash
   curl -4 ifconfig.me
   ```

2. 创建 DNS 记录：

   ```text
   记录类型：A
   主机记录：kxsl-crm
   记录值：服务器公网 IPv4
   TTL：自动或 600
   完整域名：kxsl-crm.zhituhub.com
   ```

   如果 DNS 托管在 Cloudflare，先保持 DNS only，等 HTTPS 证书签发成功后再决定是否开启代理。

3. 等 DNS 生效：

   ```bash
   nslookup kxsl-crm.zhituhub.com
   ```

   返回 IP 必须是当前服务器公网 IP。若 OpenClaw 没有 DNS 控制台权限，请停止并把服务器公网 IP 返回给我，让我手动创建二级域名。

## 三、服务器安装依赖

以下命令按 Ubuntu/Debian 系统编写：

```bash
sudo apt update
sudo apt install -y git python3 nodejs npm nginx cron certbot python3-certbot-nginx
```

验证：

```bash
python3 --version
node --version
npm --version
nginx -v
```

## 四、拉取代码

```bash
sudo mkdir -p /opt
sudo git clone https://github.com/Neo05130513/KXSL-CRM.git /opt/kxsl-crm
cd /opt/kxsl-crm
sudo git checkout main
sudo git rev-parse --short HEAD
```

如果 `/opt/kxsl-crm` 已存在：

```bash
cd /opt/kxsl-crm
sudo git fetch origin
sudo git checkout main
sudo git pull --ff-only origin main
sudo git rev-parse --short HEAD
```

## 五、生产环境变量

复制模板：

```bash
cd /opt/kxsl-crm
sudo cp .env.example .env
```

编辑 `/opt/kxsl-crm/.env`，至少替换管理员密码和高德 Key：

```bash
sudo nano /opt/kxsl-crm/.env
```

推荐内容：

```bash
KXSL_HOST=0.0.0.0
KXSL_PORT=4173
KXSL_ADMIN_USER=admin
KXSL_ADMIN_PASSWORD=请替换为强密码
KXSL_SESSION_DAYS=14
KXSL_COOKIE_SECURE=1
AMAP_KEY=请替换为高德Web服务Key
```

要求：

- 不允许继续使用默认密码 `admin123`。
- 如暂时没有高德 Web 服务 Key，可先留空，但 POI 搜索和地址能力会受影响，必须在部署报告中说明。
- 记录最终管理员账号和密码，并只返回给项目负责人，不要写入公开仓库。

## 六、初始化数据库和权限

```bash
cd /opt/kxsl-crm
sudo mkdir -p /opt/kxsl-crm/data/backups
sudo chown -R www-data:www-data /opt/kxsl-crm
sudo -u www-data python3 /opt/kxsl-crm/server.py --init-db
```

运行代码检查：

```bash
cd /opt/kxsl-crm
sudo -u www-data node --check ./src/app.js
sudo -u www-data node --check ./service-worker.js
sudo -u www-data python3 -m py_compile server.py
```

## 七、配置 systemd 常驻服务

创建 `/etc/systemd/system/kxsl-crm.service`：

```bash
sudo tee /etc/systemd/system/kxsl-crm.service >/dev/null <<'EOF'
[Unit]
Description=KXSL CRM
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/kxsl-crm
EnvironmentFile=/opt/kxsl-crm/.env
ExecStart=/usr/bin/python3 /opt/kxsl-crm/server.py
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kxsl-crm
sudo systemctl status kxsl-crm --no-pager
curl -i http://127.0.0.1:4173/api/health
```

`/api/health` 必须返回 200，并包含 `status` 字段。

## 八、配置 Nginx 反向代理

创建 `/etc/nginx/sites-available/kxsl-crm`：

```bash
sudo tee /etc/nginx/sites-available/kxsl-crm >/dev/null <<'EOF'
server {
    listen 80;
    server_name kxsl-crm.zhituhub.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

启用站点：

```bash
sudo ln -sf /etc/nginx/sites-available/kxsl-crm /etc/nginx/sites-enabled/kxsl-crm
sudo nginx -t
sudo systemctl reload nginx
curl -I http://kxsl-crm.zhituhub.com
```

## 九、签发 HTTPS 证书

将邮箱替换为真实可用邮箱：

```bash
sudo certbot --nginx -d kxsl-crm.zhituhub.com --redirect -m 你的邮箱@example.com --agree-tos --no-eff-email
```

证书签发后验证：

```bash
curl -I https://kxsl-crm.zhituhub.com
sudo certbot certificates
sudo systemctl restart kxsl-crm
```

## 十、配置每日备份

给 `www-data` 用户添加每日 02:15 备份任务：

```bash
(sudo crontab -u www-data -l 2>/dev/null; echo '15 2 * * * cd /opt/kxsl-crm && /usr/bin/python3 /opt/kxsl-crm/server.py --backup scheduled >> /opt/kxsl-crm/data/backups/backup.log 2>&1') | sudo crontab -u www-data -
```

立即做一次备份验证：

```bash
sudo -u www-data python3 /opt/kxsl-crm/server.py --backup manual
sudo ls -lh /opt/kxsl-crm/data/backups/
```

## 十一、部署验收

逐条执行：

```bash
curl -i https://kxsl-crm.zhituhub.com/api/health
curl -i https://kxsl-crm.zhituhub.com/api/bootstrap
curl -I https://kxsl-crm.zhituhub.com/manifest.webmanifest
curl -I https://kxsl-crm.zhituhub.com/service-worker.js
curl -I https://kxsl-crm.zhituhub.com/assets/icon-192.png
curl -I https://kxsl-crm.zhituhub.com/.env
curl -I https://kxsl-crm.zhituhub.com/data/app.db
curl -I https://kxsl-crm.zhituhub.com/.git/config
```

验收标准：

- `https://kxsl-crm.zhituhub.com` 能打开登录页。
- `/api/health` 返回 200。
- 未登录访问 `/api/bootstrap` 返回 401。
- `manifest.webmanifest`、`service-worker.js`、`assets/icon-192.png` 正常返回。
- `/.env`、`/data/app.db`、`/.git/config` 不能返回敏感文件内容，理想状态是 404。
- 使用生产管理员账号可以登录。
- 电脑端新增站点后，手机端刷新同一域名可以看到同一数据。
- 手机端保存拜访记录后，电脑端刷新可以看到同一数据。

## 十二、最终交付报告必须返回

部署完成后，请返回以下信息：

```text
1. 服务器公网 IP：
2. DNS 记录是否已创建：
3. kxsl-crm.zhituhub.com 解析结果：
4. Git 仓库地址：
5. 部署分支和提交 SHA：
6. 应用目录：
7. systemd 服务状态：
8. Nginx 配置文件路径：
9. HTTPS 证书状态和到期时间：
10. 管理员账号：
11. 管理员密码交付方式：
12. /api/health 返回结果：
13. /api/bootstrap 未登录状态码：
14. 敏感文件保护检查结果：
15. 备份文件路径：
16. 最终访问地址：
17. 如果未完成，卡在哪一步以及完整错误日志：
```

## 十三、特别注意

- 当前部署默认从 GitHub 拉取代码；服务器无法自动读取我本机未提交的数据。
- 如果需要迁移我本机最新 `data/app.db`，必须单独上传数据库文件到服务器 `/opt/kxsl-crm/data/app.db`，并执行 `sudo chown www-data:www-data /opt/kxsl-crm/data/app.db` 后重启服务。
- 如果只需要部署线上新环境，按上面流程初始化数据库即可。
- 不要把 `.env`、管理员密码、服务器私钥、数据库备份提交到 GitHub。
