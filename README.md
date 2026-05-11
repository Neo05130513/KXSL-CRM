# 知兔-快享市场地图

面向快递三轮车租赁业务的 CRM 与市场拜访工具。当前版本包含一个 Python SQLite 后端和原生前端，本机运行时数据保存在本机 `data/app.db`；部署到服务器后，手机和电脑访问同一个域名即可同步使用。

## 启动

```bash
npm start
```

启动后打开：

```text
http://127.0.0.1:4173/
```

默认管理员账号：

```text
admin / admin123
```

生产交付时必须通过环境变量修改默认账号和访问地址：

```bash
KXSL_ADMIN_USER=admin
KXSL_ADMIN_PASSWORD=change-me
KXSL_HOST=0.0.0.0
KXSL_PORT=4173
KXSL_COOKIE_SECURE=1
AMAP_KEY=你的高德Web服务Key
npm start
```

也可以复制 `.env.example` 为 `.env`，在服务器上填写生产配置后再启动。

常用运维命令：

```bash
npm run check
npm run backup
powershell -ExecutionPolicy Bypass -File ./scripts/deploy_check.ps1 -BaseUrl http://127.0.0.1:4173
```

## 已支持

- 基于在线地图瓦片查看郑州快递站点真实经纬度分布
- 登录后访问业务数据，未登录接口会返回 401
- 老板/管理员可在“数据”页开通业务员、只读查看或管理员账号
- 站点发现：按城市、区县和快递品牌调用高德 POI 搜索，勾选确认后导入为未拜访目标站点
- 地图地址/关键词搜索定位，可把定位结果直接新增为站点
- 新增/编辑站点时可用浏览器当前位置填入经纬度，也可按地址自动定位
- 按合作状态筛选、按站点/品牌/区域/联系人搜索
- 新增、编辑、删除站点，所有操作写入 SQLite
- 点击地图空白位置可带入经纬度新增站点
- 自动规划今日拜访路线，手动加入/移出站点，路线保存到数据库
- 拜访助手：手动输入或浏览器语音转文字，模拟 AI 提取结构化字段
- 保存拜访记录，并同步更新站点车辆数、意向等级、关注点、下次跟进日期
- 跟进工作台：逾期、今日、7 天内和未设置跟进计划的站点分组
- 车辆台账、合同到期、租金收款和售后工单的基础录入与状态管理
- 经营看板：站点、车辆、潜在需求、拜访、区域和品牌分布
- 手动数据库备份、导入前自动备份、JSON 导出/导入、拜访记录 CSV 导出
- 地图站点使用品牌颜色和不同形状的小点展示，桌面端和手机浏览器基础适配
- 已接入 PWA manifest 和 service worker，部署到 HTTPS 后可在手机端添加到主屏幕使用

## 多端同步部署

推荐交付形态是“服务器网页应用 + PWA 安装体验”：

```text
手机浏览器 / 电脑浏览器 / 主屏幕 PWA
        ↓
HTTPS 域名
        ↓
服务器上的 KXSL-CRM
        ↓
同一个 data/app.db
```

部署步骤、Nginx 示例、systemd 示例和验收标准见：

```text
docs/服务器部署与多端同步方案.md
deploy/nginx-kxsl-crm.conf.example
deploy/kxsl-crm.service.example
deploy/cron-kxsl-crm-backup.example
deploy/windows-scheduled-backup.example.ps1
```

## 数据说明

数据库文件位于：

```text
data/app.db
```

数据库备份文件位于：

```text
data/backups/
```

交付使用前建议在“数据”页定期执行数据库备份，并定期导出 JSON。本机直接运行时属于单机数据库；部署到服务器并让所有设备访问同一个域名后，手机和电脑会共用服务器数据库。

如果后续出现多人高并发、分公司数据隔离或复杂审计，再把 SQLite 升级为 PostgreSQL/MySQL。

服务器可以用命令行创建备份：

```bash
python server.py --backup scheduled
```

## 地图定位说明

地址搜索默认优先使用 `AMAP_KEY` 环境变量配置的高德 Web 服务 Key；未配置时会使用公开地理编码服务作为兜底。现场定位使用浏览器定位能力，需在浏览器弹窗中允许位置权限。
