# 🎰 群抽奖

> 把链接 / 二维码发到群里，点进去就能参与，到点自动开奖。

---

## 怎么来的

群里的抽奖需求：发个链接，大家点进去报名，到点抽奖。

每一步只解决一个当前遇到的实际问题：

```
问题：纯 HTML 数据互不相通
  → 加个 Node.js 后端，用全局变量存数据

问题：localhost 只有自己能看到
  → localtunnel 免费内网穿透，得到一个公网链接

问题：自己电脑关机链接就废了
  → Render 免费云部署，GitHub 推送代码自动上线

问题：背景太黑，链接太丑，像个贼窝
  → 换成白色主题，生成二维码 + 海报邀请卡

问题：同一个人反复报名
  → IP 限制：同 IP 只能报一次

问题：Render 休眠后数据全丢
  → JSON 文件持久化 + 开奖前挂个浏览器页面保活
```

最终架构：

```
群友扫码/点链接 → Render 云端 → Node.js 共享数据 → 自动开奖
                      │
                  data.json（持久化备份）
```

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | 原生 HTML/CSS/JS | 单文件，无框架 |
| 后端 | Node.js | 原生 `http` 模块 |
| 通信 | REST API | `fetch` + `JSON` |
| 认证 | Token | 登录拿 token，后续带 `Authorization` |
| 存储 | 内存 + JSON 文件 | 内存为主，文件做持久化 |
| 部署 | Render | GitHub push → 自动构建 |
| 分享 | 二维码 + 邀请卡 | `npx qrcode` + HTML 卡片 |

---

## 核心设计

### 数据共享

```javascript
// 一个全局变量，所有人共享
let state = {
  drawTime: '...',
  participants: ['小明', '小红', ...],
  prizes: [
    { name: '🥇 一等奖', count: 1, winners: [] },
    { name: '🥈 二等奖', count: 2, winners: [] },
    { name: '🥉 三等奖', count: 3, winners: [] },
    { name: '🎁 参与奖', count: 5, winners: [] },
  ],
  drawn: false,
};
```

### 防重复报名

```javascript
// IP 限制：同 IP 只能报一次
let ipMap = { '123.45.67.89': '小明' };

// 一人一奖：从一等奖开始抽，中奖者从候选池移除
// 每人最多中一个奖
```

### 管理员机制

```
密码验证 → 拿到 token → 后续操作带 Authorization header
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         设奖项和人数      设开奖时间       立即开奖
         清空名单          导出 CSV        新一轮
```

### 数据持久化

```javascript
// 每次状态变更自动写入 data.json
function saveState() {
  fs.writeFileSync('data.json', JSON.stringify(state));
}

// 启动时从文件恢复
function loadState() {
  if (fs.existsSync('data.json')) {
    return JSON.parse(fs.readFileSync('data.json', 'utf-8'));
  }
  return createDefaultState(); // 文件不存在用默认值
}
```

---

## 已知问题：Render 免费版休眠

Render 免费版 15 分钟没请求就休眠。**休眠时文件系统也会重置**，`data.json` 和 `pw.txt` 都会被清空。

### 解决

**开奖前随便哪个设备挂着页面就行。** 因为前端每 2 秒轮询一次 `/api/state`，服务器会一直保持活跃，不会休眠。

```
浏览器开着页面 → 每 2 秒发请求 → 15 分钟计时器永远走不到头
```

如果还是休眠了，重新打开页面后服务器会从 `data.json` 恢复数据——开奖前记得**重新设一下时间**。

> 彻底解决：升级到 Render 付费版（$7/月），服务 24 小时在线，或者用 Fly.io（免费且有持久磁盘）。

---

## 本地运行

```bash
node server.js
# 打开 http://localhost:8080
```

## 部署到云端

1. Fork 到自己的 GitHub
2. Render 创建 Web Service → 连接仓库
3. Build: `npm install`，Start: `npm start`
4. 拿到 `.onrender.com` 链接

---

## 文件结构

```
lottery-app/
├── server.js         # Node.js 后端（API + 状态 + 定时开奖 + 持久化）
├── lottery.html      # 前端（倒计时 + 报名 + 动画 + 管理面板）
├── package.json      # Render 启动配置
├── data.json         # 数据文件（自动生成，.gitignore 里）
├── pw.txt            # 密码哈希（自动生成，.gitignore 里）
└── README.md
```

---

## 生成分享素材

```bash
# 二维码
npx qrcode -o 二维码.png "https://你的链接"

# 邀请卡（HTML 页面，截图发群）
# 打开 抽奖邀请卡.html → 截图 → 发群
```

---

## 感悟

没说"先做一个完整的系统"——是从"帮我做一个抽奖链接"这一句话开始的。

每一步只解决眼前最疼的问题。HTML 不行加服务器，服务器连不上加穿透，穿透不稳定上云端，云端休眠就挂页面保活。

没有 React，没有数据库，没有 Docker。HTML + Node.js + 全局变量 + JSON 文件，能跑、够用、好懂。
