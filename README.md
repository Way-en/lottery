# 🎰 群抽奖

> 把链接发到群里，点进去就能参与抽奖，到点自动开奖。

---

## 怎么来的

群里的抽奖需求：发个链接，大家点进去报名，到点抽奖。

第一反应是做个 HTML 页面，但马上发现问题：

```
❌ 纯 HTML → 数据存在各自浏览器，互不相通
✅ 加个 Node.js 后端 → 数据存在服务器内存，所有人共享
```

有了后端，本地 `localhost` 只能自己访问。要分享到群里，需要一个公网链接：

```
❌ 本地服务器 → localhost 只有自己能看到
✅ localtunnel → 免费内网穿透，得到一个公网链接
```

localtunnel 依赖自己电脑，关机就没了。要永久在线，需要一个云服务器：

```
❌ 自己电脑当服务器 → 关机链接就废了
✅ Render 免费云部署 → GitHub 推送代码，自动构建运行
```

最终架构：

```
群友扫码/点链接 → Render 云端服务器 → 内存共享数据 → 自动开奖
```

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | 原生 HTML/CSS/JS | 单文件，无框架依赖 |
| 后端 | Node.js | 原生 `http` 模块，无框架 |
| 通信 | REST API | `fetch` + `JSON` |
| 认证 | Token | 登录拿 token，后续请求带 `Authorization` |
| 存储 | 内存 | `let state = {}`，重启清空 |
| 部署 | Render | GitHub push → 自动构建 |
| 分享 | 二维码 + 邀请卡 | `npx qrcode` + HTML 卡片截图 |

---

## 核心设计

### 数据共享

```javascript
// 只有一个全局变量，所有人共享
let state = {
  drawTime: '...',
  participants: ['小明', '小红', ...],
  prizes: [
    { name: '🥇 一等奖', count: 1, winners: [] },
    { name: '🥈 二等奖', count: 2, winners: [] },
  ],
  drawn: false,
};
```

### 防重复报名

```javascript
// 记录 IP，同 IP 不能重复报名
let ipMap = { '123.45.67.89': '小明' };

// 一个人中一个奖，不会重复中
// 从一等奖开始抽，抽中的人从候选池移除
```

### 管理员机制

```
输入密码 → 返回 token → 后续操作带 token
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         设开奖时间        设奖项人数       立即开奖
```

---

## 本地运行

```bash
# 安装 Node.js，然后：
node server.js

# 浏览器打开
http://localhost:8080
```

## 部署到云端

1. 把代码推到 GitHub
2. 在 Render 创建 Web Service，连上仓库
3. Build: `npm install`，Start: `npm start`
4. 拿到 `.onrender.com` 链接

---

## 文件结构

```
lottery-app/
├── server.js       # Node.js 后端（状态管理 + API + 定时开奖）
├── lottery.html     # 前端页面（倒计时 + 报名 + 开奖动画 + 管理面板）
├── package.json     # 告诉 Render 怎么启动
└── README.md        # 你正在看的这个
```

---

## 生成分享素材

```bash
# 生成二维码
npx qrcode -o 二维码.png "https://你的链接"

# 邀请卡（HTML 页面，截图发群里）
# 参考 抽奖邀请卡.html
```

---

## 用到的核心知识点

- `http.createServer` → 启动服务器
- `let state = {}` → 内存共享数据
- `setTimeout` → 到点自动开奖
- `fetch + setInterval` → 前端每 2 秒轮询状态
- `crypto.createHash('sha256')` → 密码加密
- `canvas` → 彩带动画
- `CSS animation` → 滚动抽奖效果

---

## 感悟

这个项目的演进过程：

```
本地文件 → 本地服务器 → 内网穿透 → GitHub 仓库 → 云端部署
```

每一步只解决一个问题，而不是一开始就想好全部架构。

好的工具不一定是复杂的。没有用 React、没有用数据库、没有用 Docker——就是 HTML + Node.js + 全局变量，能跑、够用、好懂。
