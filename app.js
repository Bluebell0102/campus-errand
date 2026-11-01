/* 顺路帮 · 校园跑腿互助平台 —— 纯前端可交互原型，数据存于浏览器 localStorage */
(() => {
'use strict';

const LS_KEY = 'shunlu-errand-v1';
const MIN = 60e3, HOUR = 60 * MIN;

/* ---------- 基础配置 ---------- */
const TYPES = {
  express: { name: '代取快递', icon: '📦', color: '#2563EB', bg: '#DBEAFE', base: 3, desc: '驿站取件送到宿舍' },
  buy:     { name: '代买物品', icon: '🛒', color: '#1E3A8A', bg: '#E0E7FF', base: 4, desc: '食堂、超市带东西' },
  seat:    { name: '代占座位', icon: '💺', color: '#0369A1', bg: '#E0F2FE', base: 3, desc: '图书馆、自习室占座' },
  other:   { name: '其他互助', icon: '🤝', color: '#3B82F6', bg: '#EFF6FF', base: 5, desc: '送文件、取打印等' },
};

// 校园地点（坐标单位：米，用于估算距离与顺路匹配）
const PLACES = {
  '北门菜鸟驿站': [0, 0], '京东快递点': [120, 60], '学府超市': [260, 120],
  '一食堂': [420, 260], '二食堂': [760, 300], '图书馆': [560, 520],
  '教学楼A': [380, 640], '教学楼B': [520, 760], '打印店': [300, 220],
  '体育馆': [900, 620], '南门': [640, 1100],
  '宿舍1栋': [160, 420], '宿舍3栋': [220, 560], '宿舍5栋': [820, 140],
  '宿舍7栋': [980, 300], '宿舍9栋': [860, 900], '宿舍12栋': [400, 980],
};
const PLACE_NAMES = Object.keys(PLACES);

// 违规内容拦截（学术诚信与安全）
const BANNED = ['代课', '代考', '替考', '代签到', '替我签到', '点名', '代写作业', '代写论文', '论文代写', '刷课', '香烟', '烟酒', '处方药', '代取身份证'];

const LEVELS = [
  { min: 180, name: '金牌', color: '#14285C' },
  { min: 140, name: '优秀', color: '#1E3A8A' },
  { min: 100, name: '可靠', color: '#2563EB' },
  { min: 60,  name: '新手', color: '#60A5FA' },
  { min: 0,   name: '受限', color: '#94A3B8' },
];
const RULES = {
  acceptMin: 60,        // 低于此分不能接单
  bigAdvance: 50,       // 垫付超过此金额为大额单
  bigAdvanceMin: 100,   // 大额单需达到「可靠」
  maxActive: 3,         // 同时进行中的接单上限
};
const STATUS = {
  open:      { name: '待接单', cls: '' },
  accepted:  { name: '进行中', cls: 'warn' },
  delivered: { name: '待确认', cls: 'warn' },
  done:      { name: '已完成', cls: 'ok' },
  cancelled: { name: '已取消', cls: 'gray' },
};

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2, 9);
const money = n => (Math.round(n * 100) / 100).toString();
const level = c => LEVELS.find(l => c >= l.min);
const dist = (a, b) => { const p = PLACES[a], q = PLACES[b]; return p && q ? Math.round(Math.hypot(p[0] - q[0], p[1] - q[1])) : 0; };
const fmtDist = m => m < 1000 ? m + 'm' : (m / 1000).toFixed(1) + 'km';
function ago(t) {
  const d = now() - t;
  if (d < MIN) return '刚刚';
  if (d < HOUR) return Math.floor(d / MIN) + '分钟前';
  if (d < 24 * HOUR) return Math.floor(d / HOUR) + '小时前';
  return Math.floor(d / 24 / HOUR) + '天前';
}
function left(t) {
  const d = t - now();
  if (d < 0) return '已超时';
  if (d < HOUR) return Math.max(1, Math.floor(d / MIN)) + '分钟内';
  if (d < 24 * HOUR) return Math.floor(d / HOUR) + '小时' + (Math.floor(d % HOUR / MIN) ? Math.floor(d % HOUR / MIN) + '分' : '') + '内';
  const dt = new Date(t); return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}前`;
}
const clock = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- 数据 ---------- */
function seed() {
  const t = now();
  const users = {
    u1: { id: 'u1', name: '林同学', color: '#2563EB', college: '计算机学院 · 大三', dorm: '宿舍7栋', verified: true, credit: 128, balance: 86, log: [] },
    u2: { id: 'u2', name: '陈同学', color: '#1E3A8A', college: '外国语学院 · 大二', dorm: '宿舍3栋', verified: true, credit: 156, balance: 120, log: [] },
    u3: { id: 'u3', name: '王同学', color: '#0EA5E9', college: '经管学院 · 大一', dorm: '宿舍12栋', verified: false, credit: 100, balance: 50, log: [] },
    u4: { id: 'u4', name: '赵同学', color: '#64748B', college: '机械学院 · 大四', dorm: '宿舍5栋', verified: true, credit: 58, balance: 30, log: [] },
  };
  const L = (u, d, r, ts) => users[u].log.push({ t: ts, d, r });
  L('u1', +2, '按时完成跑腿：二食堂带饭', t - 26 * HOUR); L('u1', +1, '获得好评', t - 25 * HOUR);
  L('u1', +20, '完成校园实名认证', t - 30 * 24 * HOUR);
  L('u2', +2, '按时完成跑腿：图书馆占座', t - 5 * HOUR); L('u2', +1, '获得好评', t - 4 * HOUR);
  L('u4', -3, '接单后中途放弃', t - 50 * HOUR); L('u4', -5, '超时未送达', t - 70 * HOUR);
  L('u3', 0, '注册账号（待认证）', t - 2 * HOUR);

  const mk = o => Object.assign({
    id: uid(), advance: 0, size: '小件', note: '', runnerId: null, status: 'open', priv: {}, deliverCode: String(1000 + Math.floor(Math.random() * 9000)),
    timeline: [], msgs: [], reviews: {}, urged: 0,
  }, o);
  const tasks = [
    mk({ type: 'express', title: '北门菜鸟 2 个小件，送到宿舍3栋楼下', from: '北门菜鸟驿站', to: '宿舍3栋', reward: 4, posterId: 'u2', createdAt: t - 8 * MIN, deadline: t + 90 * MIN, priv: { code: '3-2-1187、3-4-0921', phone: '尾号 6623' } }),
    mk({ type: 'buy', title: '二食堂二楼麻辣香锅一份（微辣）', from: '二食堂', to: '宿舍7栋', reward: 5, advance: 22, posterId: 'u3', createdAt: t - 15 * MIN, deadline: t + 45 * MIN, note: '不要香菜，谢谢！', priv: { phone: '尾号 1402' } }),
    mk({ type: 'seat', title: '明早 8:00 图书馆三楼靠窗座位', from: '图书馆', to: '图书馆', reward: 3, posterId: 'u2', createdAt: t - 40 * MIN, deadline: t + 14 * HOUR, note: '占到后拍照发我，8:15 前我到。只占 1 个位，按图书馆规定不超过 30 分钟。' }),
    mk({ type: 'express', title: '京东快递点大件（显示器），送宿舍5栋', from: '京东快递点', to: '宿舍5栋', reward: 9, size: '大件', posterId: 'u4', createdAt: t - 55 * MIN, deadline: t + 3 * HOUR, priv: { code: 'JD 取件码 662810', phone: '尾号 7730' } }),
    mk({ type: 'other', title: '打印店取 2 份装订好的实验报告', from: '打印店', to: '教学楼B', reward: 4, posterId: 'u3', createdAt: t - 2 * HOUR, deadline: t + 70 * MIN, note: '已付款，报名字取即可，送到 B204 门口' }),
    mk({ type: 'buy', title: '学府超市带一箱矿泉水 + 抽纸', from: '学府超市', to: '宿舍12栋', reward: 7, advance: 45, size: '大件', posterId: 'u2', createdAt: t - 3 * HOUR, deadline: t + 5 * HOUR }),
    mk({ type: 'buy', title: '帮买一台二手吉他（已和卖家约好）', from: '南门', to: '宿舍9栋', reward: 10, advance: 260, size: '大件', posterId: 'u2', createdAt: t - 4 * HOUR, deadline: t + 26 * HOUR, note: '大额垫付单：仅限信用「可靠」及以上同学接单' }),
    // 我（林同学）的订单，覆盖各个状态
    mk({ type: 'express', title: '菜鸟驿站 1 个小件送宿舍7栋', from: '北门菜鸟驿站', to: '宿舍7栋', reward: 3, posterId: 'u1', runnerId: 'u2', status: 'accepted', createdAt: t - 50 * MIN, deadline: t + 40 * MIN, priv: { code: '5-1-3306', phone: '尾号 2087' },
      timeline: [{ t: t - 50 * MIN, x: '发布任务，赏金 ¥3 已托管' }, { t: t - 32 * MIN, x: '陈同学 接单' }, { t: t - 10 * MIN, x: '跑腿者已取件，正在配送' }], picked: true,
      msgs: [{ u: 'u2', x: '取到了，十分钟到楼下～', t: t - 10 * MIN }] }),
    mk({ type: 'other', title: '把U盘送到教学楼A 302 给助教', from: '宿舍3栋', to: '教学楼A', reward: 4, posterId: 'u2', runnerId: 'u1', status: 'accepted', createdAt: t - 30 * MIN, deadline: t + 50 * MIN, priv: { phone: '尾号 6623' },
      timeline: [{ t: t - 30 * MIN, x: '发布任务，赏金 ¥4 已托管' }, { t: t - 20 * MIN, x: '林同学 接单' }] }),
    mk({ type: 'buy', title: '一食堂带两个肉包 + 豆浆', from: '一食堂', to: '宿舍1栋', reward: 3, advance: 8, posterId: 'u3', runnerId: 'u1', status: 'delivered', createdAt: t - 3 * HOUR, deadline: t - 2 * HOUR, priv: { phone: '尾号 1402' },
      timeline: [{ t: t - 3 * HOUR, x: '发布任务，赏金 ¥3 已托管' }, { t: t - 175 * MIN, x: '林同学 接单' }, { t: t - 150 * MIN, x: '无接触交付：放在宿舍1栋一楼取物架，已拍照留证' }] }),
    mk({ type: 'buy', title: '二食堂带饭：黄焖鸡米饭', from: '二食堂', to: '宿舍3栋', reward: 4, advance: 18, posterId: 'u2', runnerId: 'u1', status: 'done', createdAt: t - 27 * HOUR, deadline: t - 26 * HOUR, doneAt: t - 26 * HOUR,
      timeline: [{ t: t - 27 * HOUR, x: '发布任务' }, { t: t - 26.8 * HOUR, x: '林同学 接单' }, { t: t - 26 * HOUR, x: '当面核验交付码，订单完成，赏金已结算' }], reviews: { poster: { stars: 5, tags: ['准时送达', '态度友好'], text: '超快！' } } }),
  ];
  return { me: 'u1', users, tasks };
}
function load() { try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && s.users && s.tasks) return s; } catch (e) {} return null; }
let S = load() || seed();
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
save();

const me = () => S.users[S.me];
const user = id => S.users[id];
const task = id => S.tasks.find(t => t.id === id);
function credit(uidv, d, r) {
  const u = user(uidv); u.credit = Math.max(0, Math.min(200, u.credit + d)); u.log.unshift({ t: now(), d, r });
}
const push = (t, x) => t.timeline.push({ t: now(), x });

/* ---------- UI 基础 ---------- */
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2200); }
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

const avatar = (u, cls = '') => `<span class="avatar ${cls}" style="background:${u.color}">${esc(u.name[0])}</span>`;
const lvBadge = c => { const l = level(c); return `<span class="lv" style="background:${l.color}">${l.name} ${c}</span>`; };
const ticon = type => `<span class="ticon" style="background:${TYPES[type].bg}">${TYPES[type].icon}</span>`;
const statusTag = s => `<span class="tag ${STATUS[s].cls}">${STATUS[s].name}</span>`;

/* ---------- 路由 ---------- */
const view = $('#view');
function route() {
  const [, page = 'hall', arg] = location.hash.split('/');
  const fn = { hall: Hall, task: Detail, post: Post, orders: Orders, me: Me, design: Design }[page] || Hall;
  fn(arg);
  renderTabbar(page);
  window.scrollTo(0, 0);
  document.querySelector('.app').scrollTop = 0;
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash === h) route(); else location.hash = h; };

function topbar(title, back) {
  const u = me();
  $('#topbar').innerHTML = `${back ? `<a class="back" href="${back}">‹</a>` : ''}<h1>${title}</h1>
    <span class="chip-credit" data-act="switchUser">${avatar(u)}${esc(u.name)} · ${lvBadge(u.credit)}</span>`;
}
function todoCount() {
  return S.tasks.filter(t => (t.runnerId === S.me && t.status === 'accepted') || (t.posterId === S.me && t.status === 'delivered')
    || (t.status === 'done' && ((t.posterId === S.me && !t.reviews.poster) || (t.runnerId === S.me && !t.reviews.runner)))).length;
}
function renderTabbar(page) {
  const n = todoCount();
  const it = (h, ic, name, key, cls = '') => `<a href="#/${h}" class="${cls} ${page === key ? 'on' : ''}"><span class="ic">${ic}</span>${name}${key === 'orders' && n ? `<span class="badge">${n}</span>` : ''}</a>`;
  $('#tabbar').innerHTML = it('hall', '🏠', '任务大厅', 'hall') + it('design', '📐', '产品设计', 'design') + it('post', '＋', '发布', 'post', 'post') + it('orders', '📋', '我的订单', 'orders') + it('me', '👤', '信用中心', 'me');
}

/* ---------- 任务大厅 ---------- */
const hall = { type: 'all', sort: 'smart', q: '', via: '' };
function routeScore(t) {
  // 顺路：任务起点离「我要去的地方」或我宿舍近，且终点在这条路线附近
  if (!hall.via) return 0;
  const home = me().dorm;
  const near = (a, b) => dist(a, b) <= 300;
  let s = 0;
  if (near(t.from, hall.via)) s += 2;
  if (near(t.to, home) || near(t.to, hall.via)) s += 1;
  if (near(t.from, home)) s += 1;
  return s;
}
function Hall() {
  topbar('顺路帮');
  const u = me();
  const open = S.tasks.filter(t => t.status === 'open');
  let list = open.filter(t => (hall.type === 'all' || t.type === hall.type) && (!hall.q || (t.title + t.from + t.to + t.note).includes(hall.q)));
  list.forEach(t => { t._d = dist(u.dorm, t.from); t._r = routeScore(t); });
  if (hall.via) list = list.filter(t => t._r >= 2);
  const sorters = {
    smart: (a, b) => (b._r - a._r) || (a.deadline - b.deadline),
    new: (a, b) => b.createdAt - a.createdAt,
    reward: (a, b) => b.reward - a.reward,
    near: (a, b) => a._d - b._d,
    urgent: (a, b) => a.deadline - b.deadline,
  };
  list.sort(sorters[hall.sort]);
  const doneToday = S.tasks.filter(t => t.status === 'done').length + 37;
  view.innerHTML = `
    <div class="hero">
      <div class="t">${esc(u.name)}，${esc(u.dorm)} 附近有 <b>${open.filter(t => dist(u.dorm, t.from) < 600).length}</b> 个任务等你顺手带</div>
      <div class="stats">
        <div><b>${open.length}</b><span>待接任务</span></div>
        <div><b>${doneToday}</b><span>今日完成</span></div>
        <div><b>8.6 分钟</b><span>平均接单</span></div>
      </div>
      <div class="route">🧭 我正要去
        <select data-change="via"><option value="">— 选个地方，看顺路单 —</option>${PLACE_NAMES.map(p => `<option ${hall.via === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
    </div>
    <div class="chips">
      ${[['all', '全部'], ...Object.entries(TYPES).map(([k, v]) => [k, v.icon + ' ' + v.name])].map(([k, n]) => `<button class="chip ${hall.type === k ? 'on' : ''}" data-act="hallType" data-v="${k}">${n}</button>`).join('')}
    </div>
    <div class="toolbar">
      <label class="search">🔍<input placeholder="搜地点、物品…" value="${esc(hall.q)}" data-input="q"></label>
      <select data-change="sort">
        ${[['smart', '智能排序'], ['new', '最新发布'], ['reward', '赏金最高'], ['near', '离我最近'], ['urgent', '即将截止']].map(([k, n]) => `<option value="${k}" ${hall.sort === k ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    ${hall.via ? `<div class="alert info">顺路模式：从 ${esc(u.dorm)} 去 <b>${esc(hall.via)}</b>，为你筛出 ${list.length} 个顺路单 <a href="javascript:" data-act="clearVia">退出</a></div>` : ''}
    <div id="list">${list.length ? list.map(taskCard).join('') : `<div class="empty"><div class="e">🍃</div>暂时没有符合条件的任务<br><a href="#/post">发布一个需求 →</a></div>`}</div>`;
}
function taskCard(t) {
  const p = user(t.posterId), ty = TYPES[t.type];
  const mine = t.posterId === S.me;
  const late = t.deadline - now() < 30 * MIN;
  return `<a class="card task" href="#/task/${t.id}">
    <div class="head">${ticon(t.type)}
      <div class="grow"><div class="title ellipsis">${esc(t.title)}</div>
        <div class="row wrap mt8" style="gap:6px"><span class="tag">${ty.name}</span>${t.size === '大件' ? '<span class="tag warn">大件</span>' : ''}${t.advance ? `<span class="tag ${t.advance > RULES.bigAdvance ? 'bad' : 'gray'}">需垫付 ¥${money(t.advance)}</span>` : ''}${t._r >= 2 ? '<span class="tag ok">顺路</span>' : ''}${mine ? '<span class="tag gray">我发布的</span>' : ''}${t.status !== 'open' ? statusTag(t.status) : ''}</div>
      </div>
      <div class="reward"><small>¥</small>${money(t.reward)}</div>
    </div>
    <div class="path"><span class="dot" style="background:${ty.color}"></span>${esc(t.from)}<span class="arrow">→</span><span class="dot" style="background:var(--b900)"></span>${esc(t.to)}<span class="muted small" style="margin-left:auto">${t.type === 'seat' ? '' : fmtDist(dist(t.from, t.to))}</span></div>
    <div class="foot">${avatar(p)}<span>${esc(p.name)}</span>${lvBadge(p.credit)}<span style="margin-left:auto;${late ? 'color:var(--bad)' : ''}">⏱ ${left(t.deadline)}</span><span>· 距你 ${fmtDist(dist(me().dorm, t.from))}</span></div>
  </a>`;
}

/* ---------- 任务详情 ---------- */
function Detail(id) {
  const t = task(id);
  if (!t) { topbar('任务不存在', '#/hall'); view.innerHTML = '<div class="empty"><div class="e">🔎</div>任务不存在或已被删除</div>'; return; }
  topbar('任务详情', '#/hall');
  const p = user(t.posterId), r = t.runnerId && user(t.runnerId);
  const isP = t.posterId === S.me, isR = t.runnerId === S.me, involved = isP || isR;
  const stepIdx = { open: 0, accepted: t.picked ? 2 : 1, delivered: 3, done: 4, cancelled: -1 }[t.status];
  const steps = ['发布', '已接单', '配送中', '已送达', '完成'];
  const ty = TYPES[t.type];

  let priv;
  if (involved) {
    priv = `<div class="secret">🔓 <b>隐私信息（仅双方可见）</b><div class="kv mt8">
      ${t.priv.code ? `<dt>取件码</dt><dd>${esc(t.priv.code)}</dd>` : ''}
      ${t.priv.phone ? `<dt>联系方式</dt><dd>${esc(t.priv.phone)}（平台虚拟号转接）</dd>` : ''}
      ${!t.priv.code && !t.priv.phone ? '<dt>—</dt><dd>发布者未填写额外隐私信息</dd>' : ''}</div></div>`;
  } else priv = `<div class="locked">🔒 取件码、联系方式等隐私信息<br>接单后仅对你可见</div>`;

  view.innerHTML = `
    <div class="card">
      <div class="row between">${statusTag(t.status)}<span class="muted small">发布于 ${ago(t.createdAt)}</span></div>
      <div class="head row mt12" style="align-items:flex-start">${ticon(t.type)}<div class="grow"><div style="font-size:17px;font-weight:600">${esc(t.title)}</div><span class="tag mt8">${ty.name}</span> ${t.size === '大件' ? '<span class="tag warn">大件</span>' : ''}</div>
        <div class="reward"><small>¥</small>${money(t.reward)}</div></div>
      ${t.status !== 'cancelled' ? `<div class="steps mt12">${steps.map((s, i) => `<div class="s ${i <= stepIdx ? 'on' : ''}"><i>${i <= stepIdx ? '✓' : i + 1}</i>${s}</div>`).join('')}</div>` : ''}
    </div>
    <div class="card"><h3>任务信息</h3><dl class="kv">
      <dt>${t.type === 'seat' ? '占座地点' : '取货地点'}</dt><dd>${esc(t.from)}</dd>
      ${t.type !== 'seat' ? `<dt>送达地点</dt><dd>${esc(t.to)} <span class="muted">（约 ${fmtDist(dist(t.from, t.to))}）</span></dd>` : ''}
      <dt>截止时间</dt><dd>${clock(t.deadline)} · <span style="${t.deadline < now() && t.status !== 'done' ? 'color:var(--bad)' : ''}">${left(t.deadline)}</span></dd>
      <dt>赏金</dt><dd>¥${money(t.reward)} <span class="tag ok">平台托管中</span></dd>
      ${t.advance ? `<dt>需垫付</dt><dd>¥${money(t.advance)} <span class="muted">完成后随赏金一起返还跑腿者</span></dd>` : ''}
      ${t.note ? `<dt>备注</dt><dd>${esc(t.note)}</dd>` : ''}
    </dl></div>
    <div class="card"><h3>隐私信息</h3>${priv}</div>
    ${isP && (t.status === 'accepted' || t.status === 'delivered') ? `<div class="card"><h3>交付码</h3><div class="row between"><div><div class="code">${t.deliverCode}</div><div class="hint">见面拿到东西后，把交付码告诉跑腿者；跑腿者输入即完成订单。不要提前告诉对方。</div></div></div></div>` : ''}
    <div class="card"><h3>参与者</h3>
      <div class="row">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b> <span class="muted small">发布者</span><div class="small muted">${esc(p.college)} ${p.verified ? '· <span class="tag ok">已实名</span>' : ''}</div></div>${lvBadge(p.credit)}</div>
      ${r ? `<div class="row mt12">${avatar(r)}<div class="grow"><b>${esc(r.name)}</b> <span class="muted small">跑腿者</span><div class="small muted">${esc(r.college)} · <span class="tag ok">已实名</span></div></div>${lvBadge(r.credit)}</div>` : ''}
    </div>
    ${involved && t.runnerId ? `<div class="card"><h3>订单消息</h3>
      <div class="msgs">${t.msgs.length ? t.msgs.map(m => `<div class="msg ${m.u === S.me ? 'me' : ''}"><small>${esc(user(m.u).name)} · ${clock(m.t)}</small>${esc(m.x)}</div>`).join('') : '<div class="muted small">还没有消息，沟通请留在平台内，便于纠纷时取证。</div>'}</div>
      <form class="inline-form" data-submit="msg" data-id="${t.id}"><input name="x" placeholder="说点什么…" maxlength="100" autocomplete="off"><button class="btn sm">发送</button></form></div>` : ''}
    ${Object.keys(t.reviews).length ? `<div class="card"><h3>评价</h3>${['poster', 'runner'].filter(k => t.reviews[k]).map(k => { const v = t.reviews[k]; return `<div class="mb8"><b>${k === 'poster' ? '发布者' : '跑腿者'}评价：</b>${'★'.repeat(v.stars)}${'☆'.repeat(5 - v.stars)} ${v.tags.map(x => `<span class="tag">${esc(x)}</span>`).join(' ')}<div class="muted small">${esc(v.text)}</div></div>`; }).join('')}</div>` : ''}
    <div class="card"><h3>进度记录</h3><ul class="timeline">${[...t.timeline].reverse().map(x => `<li><b>${esc(x.x)}</b> · ${ago(x.t)}</li>`).join('') || '<li>暂无</li>'}</ul></div>
    <div class="sticky-actions"><div class="actions">${detailActions(t, isP, isR)}</div></div>`;
}
function detailActions(t, isP, isR) {
  const id = t.id;
  const b = (act, txt, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${id}">${txt}</button>`;
  const rv = (role) => !t.reviews[role] ? b('review', '⭐ 评价对方') : '';
  switch (t.status) {
    case 'open':
      if (isP) return b('raise', '加价 ¥2', 'ghost') + b('cancel', '取消任务', 'danger');
      return b('accept', `接单赚 ¥${money(t.reward)}`);
    case 'accepted':
      if (isR) return (t.picked ? '' : b('pick', t.type === 'seat' ? '已占到座位' : '已取件/已买到', 'ghost')) + b('handover', '当面交付') + b('leave', '无接触交付', 'ghost') + b('abandon', '放弃', 'danger');
      if (isP) return b('urge', '催一下', 'ghost') + `<button class="btn line" disabled>等待送达…</button>`;
      return `<button class="btn" disabled>已被接单</button>`;
    case 'delivered':
      if (isP) return b('confirm', '确认收到') + b('dispute', '有问题，申诉', 'danger');
      if (isR) return `<button class="btn line" disabled>等待对方确认（24 小时后自动确认）</button>`;
      return '';
    case 'done':
      if (isP) return rv('poster') || '<button class="btn line" disabled>订单已完成</button>';
      if (isR) return rv('runner') || '<button class="btn line" disabled>订单已完成</button>';
      return '';
    default: return '';
  }
}

/* ---------- 订单动作 ---------- */
function checkAccept(t) {
  const u = me();
  if (t.posterId === u.id) return '不能接自己发布的任务';
  if (!u.verified) return '请先完成校园实名认证再接单';
  if (u.credit < RULES.acceptMin) return `信用分低于 ${RULES.acceptMin}，暂时无法接单。先去发单、按时确认收货来恢复信用吧`;
  if (t.advance > RULES.bigAdvance && u.credit < RULES.bigAdvanceMin) return `大额垫付单（>¥${RULES.bigAdvance}）需信用「可靠」(${RULES.bigAdvanceMin}分) 以上才能接`;
  const active = S.tasks.filter(x => x.runnerId === u.id && x.status === 'accepted').length;
  if (active >= RULES.maxActive) return `你已有 ${active} 个进行中的订单，先完成再接新单`;
  return '';
}
function finish(t, how) {
  const p = user(t.posterId), r = user(t.runnerId);
  t.status = 'done'; t.doneAt = now();
  p.balance -= t.advance; r.balance += t.reward + t.advance;
  push(t, how + `，赏金 ¥${money(t.reward)}${t.advance ? ` + 垫付 ¥${money(t.advance)}` : ''} 已结算给 ${r.name}`);
  if (t.deadline >= now()) credit(r.id, +2, '按时完成跑腿：' + t.title.slice(0, 12));
  else credit(r.id, -2, '超时完成：' + t.title.slice(0, 12));
  credit(p.id, +1, '顺利完成一笔交易');
}
const actions = {
  switchUser() { go('#/me'); setTimeout(() => document.getElementById('who')?.scrollIntoView({ behavior: 'smooth' }), 50); },
  hallType(d) { hall.type = d.v; Hall(); },
  clearVia() { hall.via = ''; Hall(); },
  accept(d) {
    const t = task(d.id), err = checkAccept(t);
    if (err) return toast(err);
    openModal(`<h3>确认接单</h3>
      <div class="alert info">接单后你将看到取件码与联系方式。请在 <b>${clock(t.deadline)}</b> 前送达。</div>
      ${t.advance ? `<div class="alert warn">本单需要你先垫付 <b>¥${money(t.advance)}</b>，完成后与赏金一起返还。请保留小票。</div>` : ''}
      <ul class="privs"><li>✅ 按时完成：信用 +2，赏金 ¥${money(t.reward)}</li><li>⚠️ 超时完成：信用 -2</li><li>❌ 接单后放弃：信用 -3</li></ul>
      <div class="actions mt12"><button class="btn line" data-act="close">再想想</button><button class="btn" data-act="doAccept" data-id="${t.id}">确认接单</button></div>`);
  },
  doAccept(d) {
    const t = task(d.id), err = checkAccept(t);
    closeModal();
    if (err) return toast(err);
    if (t.status !== 'open') return toast('手慢了，已被别人接走');
    t.status = 'accepted'; t.runnerId = S.me; t.picked = false; push(t, me().name + ' 接单');
    save(); toast('接单成功！隐私信息已解锁'); route();
  },
  pick(d) { const t = task(d.id); t.picked = true; push(t, t.type === 'seat' ? '跑腿者已占到座位' : '跑腿者已取件，正在配送'); save(); toast('已更新进度，发布者会收到通知'); route(); },
  handover(d) {
    openModal(`<h3>当面交付</h3><p class="muted small mb8">请向发布者索要 4 位交付码。交付码只在发布者手机上显示，能防止冒领与“送到了却说没收到”。</p>
      <form data-submit="handover" data-id="${d.id}"><input class="codeinput" name="code" inputmode="numeric" maxlength="4" placeholder="····" autocomplete="off" autofocus>
      <div class="hint">演示提示：切换为发布者身份可在详情页看到交付码</div>
      <div class="actions mt12"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">核验并完成</button></div></form>`);
  },
  leave(d) {
    openModal(`<h3>无接触交付</h3><p class="muted small mb8">对方不方便见面时，把东西放到约定位置并拍照留证。对方确认或 24 小时后自动完成。</p>
      <form data-submit="leave" data-id="${d.id}"><div class="field"><label>放置位置</label><input name="where" value="${esc(task(d.id).to)}一楼取物架" required></div>
      <div class="field"><label>照片凭证</label><div class="locked">📷 已拍照（演示中以占位图代替）</div></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">提交送达</button></div></form>`);
  },
  abandon(d) {
    openModal(`<h3>确定放弃这单吗？</h3><div class="alert bad">放弃将扣除信用 3 分，任务会重新回到大厅。</div>
      <div class="actions"><button class="btn line" data-act="close">继续跑</button><button class="btn danger" data-act="doAbandon" data-id="${d.id}">确定放弃</button></div>`);
  },
  doAbandon(d) {
    const t = task(d.id); closeModal();
    credit(S.me, -3, '接单后中途放弃'); push(t, me().name + ' 放弃订单，任务重新开放');
    t.status = 'open'; t.runnerId = null; t.picked = false; t.msgs = [];
    save(); toast('已放弃，信用 -3'); go('#/orders');
  },
  urge(d) {
    const t = task(d.id);
    if (t.urged && now() - t.urged < 5 * MIN) return toast('刚催过啦，5 分钟后再试');
    t.urged = now(); t.msgs.push({ u: S.me, x: '[系统] 发布者催了一下，麻烦尽快哦～', t: now() }); save(); toast('已提醒跑腿者'); route();
  },
  confirm(d) { const t = task(d.id); finish(t, '发布者确认收货'); save(); toast('订单完成，记得给对方评价'); route(); },
  dispute(d) {
    const t = task(d.id); push(t, '发布者发起申诉：平台客服将在 2 小时内介入，赏金暂停结算');
    t.disputed = true; save(); toast('申诉已提交，客服会联系双方'); route();
  },
  raise(d) {
    const t = task(d.id), u = me();
    if (u.balance < 2) return toast('余额不足，请先充值');
    u.balance -= 2; t.reward += 2; push(t, `发布者加价 ¥2，当前赏金 ¥${money(t.reward)}`); save(); toast('已加价，任务会在大厅更靠前'); route();
  },
  cancel(d) {
    const t = task(d.id); t.status = 'cancelled'; me().balance += t.reward;
    push(t, `发布者取消任务，托管赏金 ¥${money(t.reward)} 已原路退回`); save(); toast('已取消，赏金已退回'); route();
  },
  review(d) {
    const t = task(d.id), isP = t.posterId === S.me;
    const other = user(isP ? t.runnerId : t.posterId);
    const tags = isP ? ['准时送达', '态度友好', '物品完好', '沟通顺畅'] : ['描述清楚', '确认爽快', '好沟通', '地点准确'];
    openModal(`<h3>评价 ${esc(other.name)}</h3>
      <form data-submit="review" data-id="${t.id}"><div class="stars" data-stars>${[1, 2, 3, 4, 5].map(i => `<span data-act="star" data-v="${i}" class="${i <= 5 ? 'on' : ''}">★</span>`).join('')}</div><input type="hidden" name="stars" value="5">
      <div class="chips wrap">${tags.map(x => `<label class="chip"><input type="checkbox" name="tag" value="${x}" hidden>${x}</label>`).join('')}</div>
      <div class="field"><textarea name="text" placeholder="说说这次体验（选填）" maxlength="80"></textarea></div>
      <p class="hint mb8">4–5 星：对方信用 +1；1–2 星：对方信用 -3。评价双方互不可见，都提交后才公开。</p>
      <div class="actions"><button type="button" class="btn line" data-act="close">稍后</button><button class="btn">提交评价</button></div></form>`);
    document.querySelectorAll('#modal label.chip').forEach(l => l.addEventListener('change', () => l.classList.toggle('on', l.querySelector('input').checked)));
  },
  star(d, el) {
    const v = +d.v; el.parentNode.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < v));
    el.closest('form').stars.value = v;
  },
  close: closeModal,
  becomeUser(d) { S.me = d.id; save(); toast('已切换为 ' + me().name); route(); },
  verify() {
    openModal(`<h3>校园实名认证</h3><p class="muted small mb8">只对本校在读学生开放。认证信息仅用于身份核验，不对其他同学展示。</p>
      <form data-submit="verify"><div class="field"><label>学号</label><input name="sid" required pattern="\\d{8,12}" placeholder="8–12 位数字，如 2023210071" inputmode="numeric"></div>
      <div class="field"><label>校园邮箱 <em>接收验证码</em></label><input name="mail" required placeholder="学号@stu.xxx.edu.cn"></div>
      <div class="field"><label>学生证照片</label><div class="locked">📷 演示环境：点击提交即视为上传成功</div></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">提交认证</button></div></form>`);
  },
  recharge() { me().balance += 50; save(); toast('演示充值 ¥50 成功'); route(); },
  reset() { if (confirm('重置所有演示数据？')) { localStorage.removeItem(LS_KEY); S = seed(); save(); Object.assign(hall, { type: 'all', sort: 'smart', q: '', via: '' }); postDraft = null; toast('已恢复初始演示数据'); go('#/hall'); } },
  ptype(d) { postDraft.type = d.v; postDraft.reward = suggest(postDraft); Post(); },
  rstep(d) { postDraft.reward = Math.max(1, Math.min(99, postDraft.reward + +d.v)); Post(); },
  useSuggest() { postDraft.reward = suggest(postDraft); Post(); },
  ordersTab(d) { ordersTab = d.v; Orders(); },
};

/* ---------- 发布任务 ---------- */
let postDraft = null;
const DEADLINES = [['30', '30 分钟内'], ['60', '1 小时内'], ['120', '2 小时内'], ['240', '4 小时内'], ['720', '今天内'], ['1440', '明天这个时候']];
function newDraft() { const d = { type: 'express', title: '', from: '北门菜鸟驿站', to: me().dorm, deadline: '60', size: '小件', advance: 0, note: '', code: '', phone: '' }; d.reward = suggest(d); return d; }
function suggest(d) {
  let r = TYPES[d.type].base;
  if (d.type !== 'seat') r += Math.floor(dist(d.from, d.to) / 400);
  if (d.size === '大件') r += 3;
  if (+d.deadline <= 30) r += 2; else if (+d.deadline <= 60) r += 1;
  if (d.advance > 100) r += 2;
  return r;
}
function Post() {
  topbar('发布任务', '#/hall');
  const u = me();
  if (!postDraft) postDraft = newDraft();
  const d = postDraft, sug = suggest(d);
  const opts = (sel) => PLACE_NAMES.map(p => `<option ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
  view.innerHTML = `
    ${!u.verified ? `<div class="alert warn">你还没有完成校园实名认证，认证后才能发布任务。<a href="javascript:" data-act="verify">去认证 →</a></div>` : ''}
    <div class="typegrid">${Object.entries(TYPES).map(([k, v]) => `<button type="button" class="${d.type === k ? 'on' : ''}" data-act="ptype" data-v="${k}">${ticon(k)}<b>${v.name}</b><small>${v.desc}</small></button>`).join('')}</div>
    <form class="card" data-submit="post" id="postForm">
      <div class="field"><label>一句话描述 <em>说清楚是什么、多少件</em></label><input name="title" maxlength="40" required value="${esc(d.title)}" placeholder="${{ express: '例：菜鸟驿站 2 个小件', buy: '例：一食堂带一份鸡腿饭', seat: '例：明早 8 点图书馆三楼占座', other: '例：打印店取材料送到教学楼' }[d.type]}"></div>
      <div class="two">
        <div class="field"><label>${d.type === 'seat' ? '占座地点' : d.type === 'buy' ? '购买地点' : '取件地点'}</label><select name="from">${opts(d.from)}</select></div>
        ${d.type === 'seat' ? '' : `<div class="field"><label>送达地点</label><select name="to">${opts(d.to)}</select></div>`}
      </div>
      <div class="two">
        <div class="field"><label>截止时间</label><select name="deadline">${DEADLINES.map(([v, n]) => `<option value="${v}" ${d.deadline === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${d.type === 'express' || d.type === 'buy' ? `<div class="field"><label>物品大小</label><select name="size"><option ${d.size === '小件' ? 'selected' : ''}>小件</option><option ${d.size === '大件' ? 'selected' : ''}>大件</option></select></div>` : ''}
      </div>
      ${d.type === 'buy' ? `<div class="field"><label>预计垫付金额 <em>跑腿者先付，完成后返还</em></label><input name="advance" type="number" min="0" max="500" step="0.5" value="${d.advance || ''}" placeholder="0">${d.advance > RULES.bigAdvance ? `<div class="hint" style="color:var(--warn)">垫付超过 ¥${RULES.bigAdvance}，只有信用「可靠」及以上的同学能接单</div>` : ''}</div>` : ''}
      ${d.type === 'express' ? `<div class="field"><label>取件码 <em>🔒 接单后仅对跑腿者可见</em></label><input name="code" value="${esc(d.code)}" placeholder="例：3-2-1187"></div>` : ''}
      <div class="field"><label>联系方式 <em>🔒 平台虚拟号转接，不暴露真实号码</em></label><input name="phone" value="${esc(d.phone)}" placeholder="例：尾号 6623"></div>
      <div class="field"><label>备注</label><textarea name="note" maxlength="120" placeholder="${d.type === 'seat' ? '占座请遵守场馆规定，不可长时间占用；建议到场后再交接' : '口味、楼层、放置位置等'}">${esc(d.note)}</textarea></div>
      ${d.type === 'seat' ? `<div class="alert info small">📌 占座规则：只占 1 个位、只在开放区域、超过 30 分钟未到场请主动释放，尊重其他同学。</div>` : ''}
      <div class="field"><label>赏金</label>
        <div class="stepper"><button type="button" data-act="rstep" data-v="-1">−</button><input name="reward" type="number" min="1" max="99" value="${d.reward}" style="width:80px"><button type="button" data-act="rstep" data-v="1">＋</button>
          <span class="small muted grow">建议 ¥${sug} ${d.reward !== sug ? `<a href="javascript:" data-act="useSuggest">使用</a>` : '✓'}</span></div>
        <div class="hint">根据类型、距离（${d.type === 'seat' ? '—' : fmtDist(dist(d.from, d.to))}）、大小和紧急程度估算。赏金越合理，接单越快。</div>
      </div>
      <div id="banned"></div>
      <div style="border-top:1px dashed var(--line);padding-top:10px" class="mb8">
        <div class="sum"><span class="muted">赏金托管（发布即冻结）</span><b>¥${money(d.reward)}</b></div>
        ${d.advance ? `<div class="sum"><span class="muted">完成时支付垫付款</span><b>¥${money(d.advance)}</b></div>` : ''}
        <div class="sum"><span class="muted">当前余额</span><span>¥${money(u.balance)}</span></div>
      </div>
      <button class="btn block" ${!u.verified ? 'disabled' : ''}>发布任务</button>
      <p class="hint" style="text-align:center">禁止发布代课、代考、代签到等违反校规的任务，违者封号并扣除信用</p>
    </form>`;
}
function readDraft(form) {
  const f = new FormData(form);
  ['title', 'from', 'to', 'deadline', 'size', 'note', 'code', 'phone'].forEach(k => { if (f.has(k)) postDraft[k] = f.get(k); });
  if (f.has('advance')) postDraft.advance = Math.max(0, +f.get('advance') || 0);
  if (f.has('reward')) postDraft.reward = Math.max(1, Math.min(99, Math.round(+f.get('reward') || 1)));
}
const bannedHit = s => BANNED.find(w => s.includes(w));

/* ---------- 我的订单 ---------- */
let ordersTab = 'run';
function Orders() {
  topbar('我的订单');
  const list = S.tasks.filter(t => ordersTab === 'post' ? t.posterId === S.me : t.runnerId === S.me)
    .sort((a, b) => (order(a) - order(b)) || (b.createdAt - a.createdAt));
  const cnt = k => S.tasks.filter(t => k === 'post' ? t.posterId === S.me : t.runnerId === S.me).length;
  view.innerHTML = `
    <div class="chips"><button class="chip ${ordersTab === 'run' ? 'on' : ''}" data-act="ordersTab" data-v="run">我接的单 (${cnt('run')})</button><button class="chip ${ordersTab === 'post' ? 'on' : ''}" data-act="ordersTab" data-v="post">我发布的 (${cnt('post')})</button></div>
    ${list.length ? list.map(t => {
      const h = hint(t);
      return taskCard(t).replace('</a>', h ? `<div class="alert ${h[0]} mt8" style="margin-bottom:0">👉 ${h[1]}</div></a>` : '</a>');
    }).join('') : `<div class="empty"><div class="e">🗂</div>${ordersTab === 'run' ? '还没有接过单<br><a href="#/hall">去大厅看看 →</a>' : '还没有发布过任务<br><a href="#/post">发布第一个 →</a>'}</div>`}`;
}
function order(t) { return { accepted: 0, delivered: 1, open: 2, done: 3, cancelled: 4 }[t.status]; }
function hint(t) {
  const isP = t.posterId === S.me;
  if (t.status === 'accepted') return isP ? ['info', `${user(t.runnerId).name} 正在跑，见面后告诉 TA 交付码 ${t.deliverCode}`] : ['warn', t.picked ? '送到后向对方要交付码完成订单' : '去取件/购买，完成后更新进度'];
  if (t.status === 'delivered') return isP ? ['warn', '东西已送达，请确认收货'] : ['info', '等待对方确认收货'];
  if (t.status === 'done' && !t.reviews[isP ? 'poster' : 'runner']) return ['info', '订单完成，去评价对方'];
  if (t.status === 'open' && isP) return ['info', '等待同学接单，加价可以更快被接'];
  return null;
}

/* ---------- 信用中心 ---------- */
function Me() {
  topbar('信用中心');
  const u = me(), l = level(u.credit);
  const pct = u.credit / 200, R = 46, C = Math.PI * R;
  const runs = S.tasks.filter(t => t.runnerId === u.id && t.status === 'done').length;
  const posts = S.tasks.filter(t => t.posterId === u.id).length;
  const rv = S.tasks.flatMap(t => [t.posterId === u.id && t.reviews.runner, t.runnerId === u.id && t.reviews.poster]).filter(Boolean);
  const good = rv.length ? Math.round(rv.filter(x => x.stars >= 4).length / rv.length * 100) + '%' : '—';
  const priv = [
    [u.verified, '已完成校园实名认证'],
    [u.credit >= RULES.acceptMin, `接单权限（≥${RULES.acceptMin}）`],
    [u.credit >= RULES.bigAdvanceMin, `接大额垫付单（≥${RULES.bigAdvanceMin}）`],
    [u.credit >= 140, '任务优先展示、接单无需等待冷却（≥140）'],
    [u.credit >= 180, '金牌跑腿标识 + 每月平台补贴（≥180）'],
  ];
  view.innerHTML = `
    <div class="card"><div class="profile">${avatar(u, 'lg')}<div class="grow"><div style="font-size:17px;font-weight:600">${esc(u.name)} ${u.verified ? '<span class="tag ok">✓ 校园实名</span>' : '<span class="tag warn">未认证</span>'}</div><div class="muted small">${esc(u.college)} · ${esc(u.dorm)}</div></div></div>
      ${!u.verified ? `<button class="btn block mt12" data-act="verify">完成校园实名认证（信用 +20）</button>` : ''}
    </div>
    <div class="card"><div class="gauge">
      <svg width="120" height="70" viewBox="0 0 120 70"><path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"/>
        <path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="${l.color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/>
        <text x="60" y="58" text-anchor="middle" font-size="24" font-weight="700" fill="${l.color}">${u.credit}</text></svg>
      <div class="grow"><div style="font-size:16px;font-weight:600;color:${l.color}">信用等级 · ${l.name}</div>
        <div class="muted small">${LEVELS.slice().reverse().find(x => x.min > u.credit) ? `再得 ${LEVELS.slice().reverse().find(x => x.min > u.credit).min - u.credit} 分升级为「${LEVELS.slice().reverse().find(x => x.min > u.credit).name}」` : '已达最高等级'}</div>
        <div class="row mt8" style="gap:16px;font-size:12px"><div><b style="font-size:16px">${runs}</b><br><span class="muted">完成跑腿</span></div><div><b style="font-size:16px">${posts}</b><br><span class="muted">发布任务</span></div><div><b style="font-size:16px">${good}</b><br><span class="muted">好评率</span></div></div>
      </div></div></div>
    <div class="card"><h3>我的权益</h3><ul class="privs">${priv.map(([ok, x]) => `<li class="${ok ? '' : 'no'}">${ok ? '✅' : '🔒'} ${x}</li>`).join('')}</ul></div>
    <div class="card"><div class="row between"><h3 style="margin:0">钱包</h3><button class="btn sm ghost" data-act="recharge">演示充值 ¥50</button></div>
      <div class="row mt8" style="gap:24px"><div><div style="font-size:22px;font-weight:700">¥${money(u.balance)}</div><div class="small muted">可用余额</div></div>
      <div><div style="font-size:22px;font-weight:700;color:var(--b600)">¥${money(S.tasks.filter(t => t.posterId === u.id && ['open', 'accepted', 'delivered'].includes(t.status)).reduce((s, t) => s + t.reward, 0))}</div><div class="small muted">托管中</div></div></div></div>
    <div class="card"><h3>信用规则</h3><table class="rules"><tr><th>行为</th><th>变化</th></tr>
      <tr><td>完成校园实名认证</td><td class="plus">+20</td></tr><tr><td>按时完成跑腿</td><td class="plus">+2</td></tr><tr><td>作为发布者顺利完成交易</td><td class="plus">+1</td></tr>
      <tr><td>收到 4–5 星评价</td><td class="plus">+1</td></tr><tr><td>超时完成</td><td class="minus">-2</td></tr><tr><td>接单后放弃</td><td class="minus">-3</td></tr>
      <tr><td>收到 1–2 星评价</td><td class="minus">-3</td></tr><tr><td>申诉核实违约 / 发布违规任务</td><td class="minus">-20 起</td></tr></table>
      <p class="hint">信用分 0–200，初始 100。等级：受限 &lt;60 · 新手 60 · 可靠 100 · 优秀 140 · 金牌 180。</p></div>
    <div class="card"><h3>信用明细</h3><ul class="log">${u.log.slice(0, 12).map(x => `<li><span>${esc(x.r)}<br><span class="small muted">${ago(x.t)}</span></span><span class="${x.d >= 0 ? 'plus' : 'minus'}">${x.d > 0 ? '+' : ''}${x.d}</span></li>`).join('') || '<li class="muted">暂无记录</li>'}</ul></div>
    <div class="card" id="who"><h3>切换演示身份</h3><p class="hint mb8">用不同身份体验发单方 / 跑腿方，以及低信用、未认证时的限制。</p>
      ${Object.values(S.users).map(x => `<div class="who ${x.id === S.me ? 'on' : ''}" data-act="becomeUser" data-id="${x.id}">${avatar(x)}<div class="grow"><b>${esc(x.name)}</b> ${x.verified ? '' : '<span class="tag warn">未认证</span>'}<div class="small muted">${esc(x.college)} · ${esc(x.dorm)}</div></div>${lvBadge(x.credit)}</div>`).join('')}
      <button class="btn line block mt8" data-act="reset">重置演示数据</button></div>`;
}

/* ---------- 产品设计说明 ---------- */
function Design() {
  topbar('产品设计说明');
  view.innerHTML = `<div class="doc">
  <div class="card"><h2>一句话定位</h2><p>只在本校同学之间流通的跑腿互助平台：<b>发单有人接、跑腿有钱拿、做得好有信用</b>。核心不是“撮合”，而是把陌生同学之间的<b>信任</b>做成可计算、可积累的东西。</p></div>

  <div class="card"><h2>1. 用户与痛点</h2><div class="pain">
    <div class="p"><b>发单方：想找人，但不敢、不会、找不到</b>在 QQ 群/表白墙喊“谁顺路带个快递”，消息很快被刷掉；陌生人拿着取件码不放心；不知道给多少钱合适。</div>
    <div class="p"><b>跑腿方：愿意顺手帮忙，但单子零散、风险自担</b>不知道哪些单顺路；代买要先垫钱，怕对方不认账；送到了对方说没收到，没有证据。</div>
    <div class="p"><b>学校：灰色需求与安全纠纷</b>代课代考、代签到等违规需求混在群里；校外人员冒充学生接单带来安全隐患。</div>
  </div></div>

  <div class="card"><h2>2. 设计原则</h2><ul>
    <li><b>校内闭环</b>：学号 + 校园邮箱实名，只有本校在读学生能发单接单。</li>
    <li><b>先托管、后结算</b>：发布时冻结赏金，交付完成才放款，解决“钱”的信任。</li>
    <li><b>最少信息暴露</b>：取件码、电话接单后才对跑腿者可见，电话走虚拟号。</li>
    <li><b>顺路优先</b>：跑腿是“捎带手”，不是职业配送；用顺路匹配降低每单成本。</li>
    <li><b>信用驱动权限</b>：信用决定能接什么单，让守约的人获得更多机会。</li>
  </ul></div>

  <div class="card"><h2>3. 功能架构</h2><div class="arch">
    <div class="layer" style="background:#14285C"><b>任务层</b><div class="mods"><span>四类任务模板</span><span>建议赏金</span><span>任务大厅</span><span>顺路匹配</span><span>筛选排序</span></div></div>
    <div class="layer" style="background:#1E3A8A"><b>交易层</b><div class="mods"><span>赏金托管</span><span>垫付返还</span><span>加价</span><span>交付码核验</span><span>无接触交付</span><span>自动确认</span></div></div>
    <div class="layer" style="background:#2563EB"><b>信用层</b><div class="mods"><span>信用分 0–200</span><span>五级等级</span><span>权益门槛</span><span>双向互评</span><span>信用明细</span></div></div>
    <div class="layer" style="background:#3B82F6"><b>安全层</b><div class="mods"><span>校园实名</span><span>隐私信息后置</span><span>虚拟号</span><span>违规词拦截</span><span>站内消息留痕</span><span>申诉</span></div></div>
  </div></div>

  <div class="card"><h2>4. 核心流程</h2><div class="flow">
    <span>发布任务</span><i>→</i><span>赏金托管</span><i>→</i><span>大厅/顺路推荐</span><i>→</i><span>接单（信用校验）</span><i>→</i><span>解锁取件码</span><i>→</i><span>取件/购买</span><i>→</i><span>当面报交付码 或 拍照放置</span><i>→</i><span>结算赏金+垫付</span><i>→</i><span>双向互评</span><i>→</i><span>信用变化</span>
  </div><p class="mt12 muted">异常分支：接单后放弃（信用 -3、任务回大厅）；超时完成（-2）；发布者 24 小时不确认则自动完成；有争议走申诉，赏金暂停结算。</p></div>

  <div class="card"><h2>5. 信用体系为什么这样设计</h2><ul>
    <li><b>门槛与风险挂钩</b>：低于 60 分不能接单；垫付 &gt;¥50 的单需要 100 分，避免新号接大额单跑路。</li>
    <li><b>双向信用</b>：发单方也有信用（爽快确认 +1、被差评 -3），防止恶意不确认收货。</li>
    <li><b>交付码代替“口说无凭”</b>：交付码只在发布者手机上，报码即完成，是最强的履约证据。</li>
    <li><b>可恢复</b>：扣分不是封号，按时完成可以慢慢补回来，鼓励留存。</li>
  </ul></div>

  <div class="card"><h2>6. 关键指标</h2><table class="rules">
    <tr><th>指标</th><th>说明</th></tr>
    <tr><td>30 分钟接单率</td><td>供需匹配是否顺畅（北极星指标）</td></tr>
    <tr><td>履约完成率</td><td>已接单中按时完成的比例</td></tr>
    <tr><td>纠纷率</td><td>申诉单 / 完成单，衡量信任机制是否有效</td></tr>
    <tr><td>周活跃跑腿者</td><td>供给侧健康度，警惕少数人包揽</td></tr>
    <tr><td>发单复购率</td><td>发过一次后 7 天内再发的比例</td></tr>
  </table></div>

  <div class="card"><h2>7. MVP 与后续迭代</h2><ul>
    <li><b>当前演示（MVP）</b>：四类任务、托管与结算、交付码、信用分、顺路匹配、违规拦截、身份切换演示。</li>
    <li><b>V1.1</b>：接入学校统一身份认证（SSO）；微信小程序 + 订阅消息通知；真实支付分账。</li>
    <li><b>V1.2</b>：驿站取件码自动导入；楼栋“跑腿驿站”集中投放点；按时段的供需热力图。</li>
    <li><b>V2.0</b>：校园团长/楼长运营体系；信用分与校内服务（借书、场馆预约）互通。</li>
  </ul></div>
  <p class="muted small" style="text-align:center;margin:16px 0">本作品为面试作业原型，数据均为虚构，保存在浏览器本地。</p>
  </div>`;
}

/* ---------- 事件委托 ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change;
  if (k === 'via') { hall.via = e.target.value; if (hall.via) hall.sort = 'smart'; Hall(); }
  if (k === 'sort') { hall.sort = e.target.value; Hall(); }
  const form = e.target.closest('#postForm');
  if (form) {
    const before = suggest(postDraft), wasSuggest = postDraft.reward === before;
    readDraft(form);
    if (wasSuggest && e.target.name !== 'reward') postDraft.reward = suggest(postDraft);
    if (['from', 'to', 'deadline', 'size', 'advance'].includes(e.target.name)) Post();
  }
});
let qTimer;
document.addEventListener('input', e => {
  if (e.target.dataset.input === 'q') {
    clearTimeout(qTimer); const v = e.target.value;
    qTimer = setTimeout(() => { hall.q = v.trim(); Hall(); const i = document.querySelector('[data-input=q]'); i.focus(); i.setSelectionRange(v.length, v.length); }, 250);
  }
  const form = e.target.closest('#postForm');
  if (form) {
    readDraft(form);
    const w = bannedHit(postDraft.title + postDraft.note);
    $('#banned').innerHTML = w ? `<div class="alert bad">⛔ 检测到违规内容「${esc(w)}」：平台不支持代课、代考、代签到等违反校规的任务。</div>` : '';
  }
});
document.addEventListener('submit', e => {
  const form = e.target, k = form.dataset.submit;
  if (!k) return;
  e.preventDefault();
  const f = new FormData(form), t = form.dataset.id && task(form.dataset.id);
  if (k === 'msg') {
    const x = f.get('x').trim(); if (!x) return;
    t.msgs.push({ u: S.me, x, t: now() }); save(); route();
  }
  if (k === 'handover') {
    if (f.get('code') !== t.deliverCode) return toast('交付码不正确，请向发布者核对');
    closeModal(); finish(t, '当面核验交付码'); save(); toast(`交付成功！赏金 ¥${money(t.reward)} 已到账，信用 +2`); route();
  }
  if (k === 'leave') {
    closeModal(); t.status = 'delivered'; t.picked = true;
    push(t, `无接触交付：放在${f.get('where')}，已拍照留证`); save(); toast('已提交，等待对方确认'); route();
  }
  if (k === 'review') {
    const stars = +f.get('stars'), isP = t.posterId === S.me, other = isP ? t.runnerId : t.posterId;
    t.reviews[isP ? 'poster' : 'runner'] = { stars, tags: f.getAll('tag'), text: f.get('text').trim() };
    if (stars >= 4) credit(other, +1, '获得好评'); else if (stars <= 2) credit(other, -3, '收到差评');
    closeModal(); save(); toast('评价已提交'); route();
  }
  if (k === 'verify') {
    const u = me(); u.verified = true; credit(u.id, +20, '完成校园实名认证');
    closeModal(); save(); toast('认证成功，信用 +20'); route();
  }
  if (k === 'post') {
    readDraft(form);
    const d = postDraft, u = me();
    if (!u.verified) return toast('请先完成校园实名认证');
    if (!d.title.trim()) return toast('请填写任务描述');
    const w = bannedHit(d.title + d.note);
    if (w) return toast(`含违规内容「${w}」，无法发布`);
    if (d.type !== 'seat' && d.from === d.to) return toast('取件地点和送达地点不能相同');
    if (u.balance < d.reward) return toast('余额不足以托管赏金，请先到信用中心充值');
    u.balance -= d.reward;
    const nt = {
      id: uid(), type: d.type, title: d.title.trim(), from: d.from, to: d.type === 'seat' ? d.from : d.to, reward: d.reward, advance: d.type === 'buy' ? d.advance : 0,
      size: d.size, note: d.note.trim(), posterId: u.id, runnerId: null, status: 'open', createdAt: now(), deadline: now() + +d.deadline * MIN,
      priv: { code: d.code.trim(), phone: d.phone.trim() }, deliverCode: String(1000 + Math.floor(Math.random() * 9000)), timeline: [], msgs: [], reviews: {}, urged: 0,
    };
    push(nt, `发布任务，赏金 ¥${money(nt.reward)} 已托管`);
    S.tasks.unshift(nt); postDraft = null; save(); toast('发布成功！附近的同学会看到'); go('#/task/' + nt.id);
  }
});

route();
})();
