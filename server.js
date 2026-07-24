const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const DIR = process.argv[2] || __dirname;

// ===== 服务端抽奖状态（所有人共享） =====
let state = {
  drawTime: (() => { const d = new Date(); d.setMinutes(d.getMinutes() + 30); d.setSeconds(0,0); return d.toISOString(); })(),
  participants: [],
  winners: [],
  drawn: false,
  winnerCount: 1,
  prizeName: '神秘大奖',
};

// 管理员密码（SHA-256 存储）
let adminPasswordHash = crypto.createHash('sha256').update('admin123').digest('hex');

// 管理员 session tokens
const adminSessions = new Set();

// 定时开奖
let drawTimer = null;

function scheduleDraw() {
  if (drawTimer) clearTimeout(drawTimer);
  if (state.drawn) return;

  const now = Date.now();
  const target = new Date(state.drawTime).getTime();
  const diff = target - now;

  if (diff > 0) {
    drawTimer = setTimeout(() => {
      executeDraw();
    }, diff + 100);
  } else if (state.participants.length > 0) {
    executeDraw();
  }
}

function executeDraw() {
  if (state.drawn) return;
  const winnerCount = Math.min(state.winnerCount || 1, state.participants.length);
  const shuffled = [...state.participants].sort(() => Math.random() - 0.5);
  state.winners = shuffled.slice(0, winnerCount);
  state.drawn = true;
  console.log(`[开奖] 中奖者: ${state.winners.join(', ') || '（无人）'}`);
}

// 生成 session token
function createSessionToken() {
  const token = crypto.randomBytes(16).toString('hex');
  adminSessions.add(token);
  // 30分钟过期
  setTimeout(() => adminSessions.delete(token), 30 * 60 * 1000);
  return token;
}

// ===== MIME 类型 =====
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ===== 工具函数 =====
function jsonResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function checkAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  return adminSessions.has(token);
}

// ===== 路由 =====
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  try {
    // ---- API 路由 ----
    if (url.pathname === '/api/state') {
      // 获取公开状态（所有人可访问）
      const publicState = {
        drawTime: state.drawTime,
        participantsCount: state.participants.length,
        participants: state.participants.slice(-50),  // 最近50人
        winners: state.winners,
        drawn: state.drawn,
        winnerCount: state.winnerCount,
        prizeName: state.prizeName,
      };
      return jsonResponse(res, 200, publicState);
    }

    if (url.pathname === '/api/join' && method === 'POST') {
      if (state.drawn) {
        return jsonResponse(res, 400, { error: '本期抽奖已结束' });
      }
      if (Date.now() >= new Date(state.drawTime).getTime()) {
        return jsonResponse(res, 400, { error: '已到开奖时间，停止报名' });
      }

      const body = await parseBody(req);
      const name = (body.name || '').trim();
      if (!name || name.length > 20) {
        return jsonResponse(res, 400, { error: '请输入有效名字（1-20字）' });
      }
      if (state.participants.includes(name)) {
        return jsonResponse(res, 400, { error: '这个名字已经报名过了' });
      }

      state.participants.push(name);
      console.log(`[报名] ${name}  |  总人数: ${state.participants.length}`);
      return jsonResponse(res, 200, { ok: true, count: state.participants.length });
    }

    // ---- 管理员 API ----
    if (url.pathname === '/api/admin/login' && method === 'POST') {
      const body = await parseBody(req);
      const pwHash = crypto.createHash('sha256').update(body.password || '').digest('hex');
      if (pwHash === adminPasswordHash) {
        const token = createSessionToken();
        return jsonResponse(res, 200, { token });
      }
      return jsonResponse(res, 401, { error: '密码错误' });
    }

    if (url.pathname === '/api/admin/change-password' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      const body = await parseBody(req);
      if (!body.newPw || body.newPw.length < 4) {
        return jsonResponse(res, 400, { error: '新密码至少4位' });
      }
      const oldHash = crypto.createHash('sha256').update(body.oldPw || '').digest('hex');
      if (oldHash !== adminPasswordHash) {
        return jsonResponse(res, 400, { error: '原密码错误' });
      }
      adminPasswordHash = crypto.createHash('sha256').update(body.newPw).digest('hex');
      adminSessions.clear();
      console.log('[管理] 密码已修改');
      return jsonResponse(res, 200, { ok: true });
    }

    if (url.pathname === '/api/admin/config' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      const body = await parseBody(req);

      if (body.prizeName) state.prizeName = body.prizeName;
      if (body.winnerCount && body.winnerCount >= 1 && body.winnerCount <= 100) {
        state.winnerCount = body.winnerCount;
      }
      if (body.drawTime) {
        const newTime = new Date(body.drawTime).getTime();
        if (newTime <= Date.now()) {
          return jsonResponse(res, 400, { error: '开奖时间必须在未来' });
        }
        state.drawTime = new Date(body.drawTime).toISOString();
        state.drawn = false;
        state.winners = [];
        scheduleDraw();
      }

      console.log(`[管理] 配置更新: ${state.prizeName}, ${state.winnerCount}人中奖, ${new Date(state.drawTime).toLocaleString('zh-CN')}`);
      return jsonResponse(res, 200, { ok: true });
    }

    if (url.pathname === '/api/admin/force-draw' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      if (state.drawn) return jsonResponse(res, 400, { error: '本期已开奖' });
      if (state.participants.length === 0) return jsonResponse(res, 400, { error: '没有参与者' });

      state.drawTime = new Date(Date.now() - 1000).toISOString();
      executeDraw();
      console.log('[管理] 手动开奖');
      return jsonResponse(res, 200, { ok: true, winners: state.winners });
    }

    if (url.pathname === '/api/admin/simulate' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      if (state.drawn) return jsonResponse(res, 400, { error: '本期已结束' });

      const names = ['小明','小红','小刚','阿花','大壮','翠花','铁柱','秀兰',
        '建国','丽丽','阿强','美美','大龙','小芳','志明','春娇',
        '老王','小张','阿杰','小雪','大力','灵儿','虎子','燕子'];
      const toAdd = names.filter(n => !state.participants.includes(n));
      const selected = toAdd.sort(() => Math.random() - 0.5).slice(0, Math.min(15, toAdd.length));
      state.participants.push(...selected);
      console.log(`[管理] 模拟报名 ${selected.length} 人`);
      return jsonResponse(res, 200, { ok: true, added: selected.length, count: state.participants.length });
    }

    if (url.pathname === '/api/admin/clear' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      if (state.drawn) return jsonResponse(res, 400, { error: '本期已结束' });
      state.participants = [];
      console.log('[管理] 清空报名名单');
      return jsonResponse(res, 200, { ok: true });
    }

    if (url.pathname === '/api/admin/reset' && method === 'POST') {
      if (!checkAdmin(req)) return jsonResponse(res, 401, { error: '未授权' });
      const body = await parseBody(req);
      const prizeName = body.prizeName || state.prizeName;
      const winnerCount = body.winnerCount || state.winnerCount;
      const d = new Date();
      d.setMinutes(d.getMinutes() + 30);
      d.setSeconds(0, 0);
      state.drawTime = d.toISOString();
      state.participants = [];
      state.winners = [];
      state.drawn = false;
      state.prizeName = prizeName;
      state.winnerCount = winnerCount;
      scheduleDraw();
      console.log('[管理] 新一轮抽奖');
      return jsonResponse(res, 200, { ok: true });
    }

    if (url.pathname === '/api/admin/export' && method === 'GET') {
      // 支持 query string token（方便浏览器直接下载）
      const queryToken = url.searchParams.get('token') || '';
      const hasAuth = checkAdmin(req) || adminSessions.has(queryToken);
      if (!hasAuth) return jsonResponse(res, 401, { error: '未授权' });
      let csv = '﻿序号,名字\n';
      state.participants.forEach((name, i) => { csv += `${i + 1},${name}\n`; });
      csv += `\n导出时间,${new Date().toLocaleString('zh-CN')}\n`;
      csv += `开奖时间,${new Date(state.drawTime).toLocaleString('zh-CN')}\n`;
      csv += `奖品,${state.prizeName}\n中奖人数,${state.winnerCount}\n`;
      csv += `是否已开奖,${state.drawn ? '是' : '否'}\n`;
      csv += `中奖者,${state.winners.join(', ') || '（未开奖）'}\n`;

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="抽奖数据_${new Date().toISOString().slice(0,10)}.csv"`,
      });
      return res.end(csv);
    }

    // ---- 静态文件 ----
    let filePath = path.join(DIR, url.pathname === '/' ? 'lottery.html' : url.pathname.split('?')[0]);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });

  } catch (e) {
    console.error('[错误]', e);
    jsonResponse(res, 500, { error: '服务器错误' });
  }
}).listen(PORT, () => {
  console.log('============================================');
  console.log('  🎰 群抽奖服务器已启动');
  console.log(`  地址: http://localhost:${PORT}`);
  console.log(`  管理密码: admin123`);
  console.log(`  开奖时间: ${new Date(state.drawTime).toLocaleString('zh-CN')}`);
  console.log('============================================');
  scheduleDraw();
});
