/* 顺路帮 · 校园跑腿互助平台 —— 纯前端可交互原型，数据存于浏览器 localStorage */
(() => {
'use strict';

const LS_KEY = 'shunlu-errand-v2';
const THEME_KEY = 'shunlu-theme-v2';
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

/* ---------- 基础配置 ---------- */
const TYPES = {
  express: { name: '代取快递', icon: 'package', base: 3, desc: '驿站取件送到宿舍', from: '北门菜鸟驿站' },
  buy:     { name: '代买物品', icon: 'shopping-cart', base: 4, desc: '食堂、超市带东西', from: '学府超市' },
  seat:    { name: '代占座位', icon: 'armchair', base: 3, desc: '图书馆、自习室占座', from: '图书馆' },
  other:   { name: '其他互助', icon: 'handshake', base: 5, desc: '送文件、取打印等', from: '打印店' },
};

// 主题色取自小红书笔记「校园美学配色｜适配校园主题设计的色卡」（笔格PPT）
const THEMES = {
  sky:    { name: '晴空球场', sw: ['#F0F9FF', '#B9E0FF', '#73BFFF', '#3A92E6', '#1A5FB0'] },
  pool:   { name: '泳池水青', sw: ['#F0FAFC', '#B9E4EC', '#6FC0D1', '#357F91', '#144D5C'] },
  navy:   { name: '藏青校服', sw: ['#F0F4F8', '#A9BCCE', '#5C7C99', '#2D4A6B', '#122438'] },
  orange: { name: '橘子汽水', sw: ['#FFF4E0', '#FFD9A8', '#FFB366', '#FF8C2E', '#E66A14'] },
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
  { min: 180, name: '金牌', c: 'var(--b900)' },
  { min: 140, name: '优秀', c: 'var(--b700)' },
  { min: 100, name: '可靠', c: 'var(--b600)' },
  { min: 60,  name: '新手', c: 'var(--b500)' },
  { min: 0,   name: '受限', c: '#94A3B8' },
];
const RULES = {
  acceptMin: 60,        // 低于此分不能接单
  bigAdvance: 50,       // 垫付超过此金额为大额单
  bigAdvanceMin: 100,   // 大额单需达到「可靠」
  maxActive: 3,         // 同时进行中的接单上限
  autoConfirm: DAY,     // 无接触交付后自动确认
  reviewOpen: 3 * DAY,  // 互评公开时限
};
const STATUS = {
  open:      { name: '待接单', cls: '' },
  accepted:  { name: '进行中', cls: 'warn' },
  delivered: { name: '待确认', cls: 'warn' },
  done:      { name: '已完成', cls: 'ok' },
  cancelled: { name: '已取消', cls: 'gray' },
  expired:   { name: '已过期', cls: 'gray' },
  removed:   { name: '已下架', cls: 'bad' },
};
const REPORT_REASONS = ['违规内容（代课代考等）', '疑似诈骗 / 价格异常', '信息虚假', '骚扰或不当言论', '其他'];

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2, 9);
const money = n => (Math.round(n * 100) / 100).toString();
const level = c => LEVELS.find(l => c >= l.min);
const dist = (a, b) => { const p = PLACES[a], q = PLACES[b]; return p && q ? Math.round(Math.hypot(p[0] - q[0], p[1] - q[1])) : 0; };
const fmtDist = m => m < 1000 ? m + 'm' : (m / 1000).toFixed(1) + 'km';
const pad = n => String(n).padStart(2, '0');
function ago(t) {
  const d = now() - t;
  if (d < MIN) return '刚刚';
  if (d < HOUR) return Math.floor(d / MIN) + '分钟前';
  if (d < DAY) return Math.floor(d / HOUR) + '小时前';
  return Math.floor(d / DAY) + '天前';
}
function left(t) {
  const d = t - now();
  if (d < 0) return '已超时';
  if (d < HOUR) return Math.max(1, Math.floor(d / MIN)) + '分钟内';
  if (d < DAY) return Math.floor(d / HOUR) + '小时' + (Math.floor(d % HOUR / MIN) ? Math.floor(d % HOUR / MIN) + '分' : '') + '内';
  const dt = new Date(t); return `${dt.getMonth() + 1}/${dt.getDate()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}前`;
}
const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------- 数据 ---------- */
function seed() {
  const t = now();
  const users = {
    u1: { id: 'u1', name: '林同学', college: '计算机学院 · 大三', dorm: '宿舍7栋', verified: true, credit: 128, balance: 86, log: [] },
    u2: { id: 'u2', name: '陈同学', college: '外国语学院 · 大二', dorm: '宿舍3栋', verified: true, credit: 156, balance: 120, log: [] },
    u3: { id: 'u3', name: '王同学', college: '经管学院 · 大一', dorm: '宿舍12栋', verified: false, credit: 100, balance: 50, log: [] },
    u4: { id: 'u4', name: '赵同学', college: '机械学院 · 大四', dorm: '宿舍5栋', verified: true, credit: 58, balance: 30, log: [] },
  };
  const L = (u, d, r, ts) => users[u].log.push({ t: ts, d, r });
  L('u1', +1, '获得好评', t - 25 * HOUR); L('u1', +2, '按时完成跑腿：二食堂带饭', t - 26 * HOUR);
  L('u1', +20, '完成校园实名认证', t - 30 * DAY);
  L('u2', +1, '获得好评', t - 4 * HOUR); L('u2', +2, '按时完成跑腿：图书馆占座', t - 5 * HOUR);
  L('u4', -3, '接单后中途放弃', t - 50 * HOUR); L('u4', -5, '超时未送达', t - 70 * HOUR);
  L('u3', 0, '注册账号（待认证）', t - 2 * HOUR);

  const user0 = id => users[id].name;
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
    mk({ id: 'rpt1', type: 'buy', title: '南门手机店帮取一台全新手机，先垫付', from: '南门', to: '宿舍5栋', reward: 30, advance: 480, posterId: 'u4', createdAt: t - 5 * HOUR, deadline: t + 20 * HOUR, note: '到了加我微信细聊，钱后面一起转你' }),
    // 我（林同学）的订单，覆盖各个状态
    mk({ type: 'express', title: '菜鸟驿站 1 个小件送宿舍7栋', from: '北门菜鸟驿站', to: '宿舍7栋', reward: 3, posterId: 'u1', runnerId: 'u2', status: 'accepted', createdAt: t - 50 * MIN, acceptedAt: t - 32 * MIN, deadline: t + 40 * MIN, priv: { code: '5-1-3306', phone: '尾号 2087' },
      timeline: [{ t: t - 50 * MIN, x: '发布任务，赏金 ¥3 已托管' }, { t: t - 32 * MIN, x: '陈同学 接单' }, { t: t - 10 * MIN, x: '跑腿者已取件，正在配送' }], picked: true,
      msgs: [{ u: 'u2', x: '取到了，十分钟到楼下～', t: t - 10 * MIN }] }),
    mk({ type: 'other', title: '把U盘送到教学楼A 302 给助教', from: '宿舍3栋', to: '教学楼A', reward: 4, posterId: 'u2', runnerId: 'u1', status: 'accepted', createdAt: t - 30 * MIN, acceptedAt: t - 20 * MIN, deadline: t + 50 * MIN, priv: { phone: '尾号 6623' },
      timeline: [{ t: t - 30 * MIN, x: '发布任务，赏金 ¥4 已托管' }, { t: t - 20 * MIN, x: '林同学 接单' }] }),
    mk({ type: 'buy', title: '一食堂带两个肉包 + 豆浆', from: '一食堂', to: '宿舍1栋', reward: 3, advance: 8, posterId: 'u3', runnerId: 'u1', status: 'delivered', createdAt: t - 3 * HOUR, acceptedAt: t - 175 * MIN, deliveredAt: t - 150 * MIN, deadline: t - 2 * HOUR, priv: { phone: '尾号 1402' },
      timeline: [{ t: t - 3 * HOUR, x: '发布任务，赏金 ¥3 已托管' }, { t: t - 175 * MIN, x: '林同学 接单' }, { t: t - 150 * MIN, x: '无接触交付：放在宿舍1栋一楼取物架，已拍照留证' }] }),
    mk({ type: 'buy', title: '二食堂带饭：黄焖鸡米饭', from: '二食堂', to: '宿舍3栋', reward: 4, advance: 18, posterId: 'u2', runnerId: 'u1', status: 'done', createdAt: t - 27 * HOUR, acceptedAt: t - 26.8 * HOUR, deadline: t - 26 * HOUR, doneAt: t - 26 * HOUR,
      timeline: [{ t: t - 27 * HOUR, x: '发布任务' }, { t: t - 26.8 * HOUR, x: '林同学 接单' }, { t: t - 26 * HOUR, x: '当面核验交付码，订单完成，赏金已结算' }], reviews: { poster: { stars: 5, tags: ['准时送达', '态度友好'], text: '超快！', t: t - 25 * HOUR } } }),
    // 历史完成单（让数据看板与跑腿榜有内容）
    ...[['express', '京东快递点小件送宿舍5栋', '京东快递点', '宿舍5栋', 3, 'u4', 'u2', 2], ['seat', '图书馆二楼自习区占座', '图书馆', '图书馆', 3, 'u3', 'u2', 3], ['buy', '一食堂带早餐', '一食堂', '宿舍12栋', 4, 'u3', 'u1', 4], ['other', '打印店取海报送体育馆', '打印店', '体育馆', 5, 'u2', 'u1', 5], ['express', '菜鸟驿站大件送宿舍1栋', '北门菜鸟驿站', '宿舍1栋', 7, 'u1', 'u2', 6]]
      .map(([type, title, from, to, reward, posterId, runnerId, d]) => mk({ type, title, from, to, reward, posterId, runnerId, status: 'done', createdAt: t - d * DAY, acceptedAt: t - d * DAY + (4 + d) * MIN, deadline: t - d * DAY + HOUR, doneAt: t - d * DAY + 35 * MIN,
        timeline: [{ t: t - d * DAY, x: '发布任务' }, { t: t - d * DAY + (4 + d) * MIN, x: user0(runnerId) + ' 接单' }, { t: t - d * DAY + 35 * MIN, x: '当面核验交付码，订单完成，赏金已结算' }],
        reviews: { poster: { stars: 5, tags: ['准时送达'], text: '', t: t - d * DAY + HOUR }, runner: { stars: 5, tags: ['描述清楚'], text: '', t: t - d * DAY + HOUR } } })),
    // 申诉中的订单（给运营后台演示）
    mk({ id: 'dsp1', type: 'express', title: '菜鸟驿站中件送宿舍3栋', from: '北门菜鸟驿站', to: '宿舍3栋', reward: 5, posterId: 'u2', runnerId: 'u4', status: 'delivered', disputed: true, createdAt: t - 6 * HOUR, acceptedAt: t - 5.8 * HOUR, deliveredAt: t - 5 * HOUR, deadline: t - 4 * HOUR,
      timeline: [{ t: t - 6 * HOUR, x: '发布任务，赏金 ¥5 已托管' }, { t: t - 5.8 * HOUR, x: '赵同学 接单' }, { t: t - 5 * HOUR, x: '无接触交付：放在宿舍3栋门口，已拍照留证' }, { t: t - 4.5 * HOUR, x: '发布者发起申诉，赏金暂停结算' }] }),
  ];
  const reports = [
    { id: uid(), kind: '举报', taskId: 'rpt1', by: 'u2', reason: '疑似诈骗 / 价格异常', text: '要求先垫付 480 元还要求私下加微信，像刷单骗局', t: t - 3 * HOUR, status: 'pending' },
    { id: uid(), kind: '申诉', taskId: 'dsp1', by: 'u2', reason: '未收到物品', text: '门口没找到快递，照片里的门牌也不是我们宿舍', t: t - 4.5 * HOUR, status: 'pending' },
  ];
  const notices = [
    { id: uid(), to: 'u1', t: t - 10 * MIN, x: '陈同学 已取件，正在为你配送「菜鸟驿站 1 个小件送宿舍7栋」', taskId: tasks.find(x => x.title.startsWith('菜鸟驿站 1 个')).id },
    { id: uid(), to: 'u1', t: t - 20 * MIN, x: '你接下了「把U盘送到教学楼A 302 给助教」，请在截止前送达', taskId: tasks.find(x => x.title.startsWith('把U盘')).id },
    { id: uid(), to: 'u1', t: t - 25 * HOUR, x: '陈同学 给了你 5 星好评，信用 +1', taskId: tasks.find(x => x.title.startsWith('二食堂带饭')).id, read: true },
  ];
  return { me: 'u1', users, tasks, reports, notices, onboarded: false, lastActive: t };
}
function load() { try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && s.users && s.tasks) return s; } catch (e) {} return null; }
let S = load() || seed();
function save() { S.lastActive = now(); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }

// 演示时间冻结：离开期间的时间整体平移，回来时任务不会全部过期
function freezeTime() {
  const gap = now() - (S.lastActive || now());
  if (gap < 30 * MIN) return;
  const sh = o => { for (const k of ['t', 'createdAt', 'deadline', 'doneAt', 'acceptedAt', 'deliveredAt', 'urged']) if (o[k]) o[k] += gap; };
  S.tasks.forEach(t => { sh(t); t.timeline.forEach(sh); t.msgs.forEach(sh); Object.values(t.reviews).forEach(sh); });
  Object.values(S.users).forEach(u => u.log.forEach(sh));
  S.reports.forEach(sh); S.notices.forEach(sh);
}
freezeTime(); save();

const me = () => S.users[S.me];
const user = id => S.users[id];
const task = id => S.tasks.find(t => t.id === id);
function credit(uidv, d, r) {
  const u = user(uidv); u.credit = Math.max(0, Math.min(200, u.credit + d)); u.log.unshift({ t: now(), d, r });
}
const push = (t, x) => t.timeline.push({ t: now(), x });
const notify = (to, x, taskId) => to && S.notices.unshift({ id: uid(), to, t: now(), x, taskId });
const short = t => `「${t.title.length > 14 ? t.title.slice(0, 14) + '…' : t.title}」`;

/* ---------- 系统规则：超时与自动处理 ---------- */
function tick() {
  let changed = false;
  for (const t of S.tasks) {
    if (t.status === 'open' && t.deadline < now()) {
      t.status = 'expired'; user(t.posterId).balance += t.reward;
      push(t, `超过截止时间无人接单，任务自动关闭，赏金 ¥${money(t.reward)} 已退回`);
      notify(t.posterId, `${short(t)} 无人接单已过期，赏金已退回。可以加价后重新发布`, t.id); changed = true;
    }
    if (t.status === 'accepted' && t.deadline < now() && !t.lateNoticed) {
      t.lateNoticed = true; notify(t.runnerId, `${short(t)} 已超过截止时间，请尽快送达并和对方说明情况`, t.id);
      notify(t.posterId, `${short(t)} 跑腿者超时未送达，可以在订单里催一下或留言沟通`, t.id); changed = true;
    }
    if (t.status === 'delivered' && !t.disputed && t.deliveredAt && now() - t.deliveredAt > RULES.autoConfirm) {
      finish(t, '发布者 24 小时内未确认，系统自动确认收货'); changed = true;
    }
  }
  if (changed) save();
}

/* ---------- UI 基础 ---------- */
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2400); }
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

const AV = { u1: 'var(--b600)', u2: 'var(--b800)', u3: 'var(--b500)', u4: '#64748B' };
const avatar = (u, cls = '') => `<span class="avatar ${cls}" style="background:${AV[u.id] || 'var(--b600)'}">${esc(u.name[0])}</span>`;
const lvBadge = c => { const l = level(c); return `<span class="lv" style="background:${l.c}">${l.name} ${c}</span>`; };
const ticon = type => `<span class="ticon">${ic(TYPES[type].icon)}</span>`;
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.ICONS[n] || ''}</svg>`;
const stars = n => [1, 2, 3, 4, 5].map(i => ic('star', i <= n ? 'star-on' : 'star-off')).join('');
const statusTag = s => `<span class="tag ${STATUS[s].cls}">${STATUS[s].name}</span>`;

function applyTheme(k) {
  if (!THEMES[k]) k = 'pool';
  document.documentElement.dataset.theme = k;
  try { localStorage.setItem(THEME_KEY, k); } catch (e) {}
}
const LAYOUT_KEY = 'shunlu-layout';
let layoutPref = 'auto';
try { layoutPref = localStorage.getItem(LAYOUT_KEY) || 'auto'; } catch (e) {}
// 版式：auto 按窗口宽度（≥1000px 用电脑版），也可在设置里固定为手机版或电脑版
function applyLayout() {
  const v = layoutPref === 'pc' || (layoutPref === 'auto' && innerWidth >= 1000) ? 'pc' : 'mobile';
  if (document.documentElement.dataset.layout === v) return false;
  document.documentElement.dataset.layout = v; return true;
}
applyLayout();
let themeNow = 'pool';
try { themeNow = localStorage.getItem(THEME_KEY) || 'pool'; } catch (e) {}
applyTheme(themeNow);
const themePicker = () => `<div class="themes">${Object.entries(THEMES).map(([k, v]) => `<button class="theme ${document.documentElement.dataset.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}"><span class="sw">${v.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>${v.name}</button>`).join('')}</div>`;

/* ---------- 路由 ---------- */
const view = $('#view');
const PAGES = { hall: Hall, task: Detail, post: Post, orders: Orders, me: Me, notices: Notices, settings: Settings, docs: Settings, design: Design, prd: PRD, guide: Guide, admin: Admin };
let curPage = 'hall';
function route() {
  tick();
  const [, page = 'hall', arg] = location.hash.split('/');
  curPage = PAGES[page] ? page : 'hall'; view.dataset.page = curPage;
  (PAGES[page] || Hall)(arg);
  renderTabbar(page);
  window.scrollTo(0, 0);
  document.querySelector('.app').scrollTop = 0;
  if (!S.onboarded && !$('#modal').innerHTML) onboarding();
}
window.addEventListener('hashchange', route);
window.addEventListener('resize', () => { if (applyLayout()) route(); });
const go = h => { if (location.hash === h) route(); else location.hash = h; };

function topbar(title, back) {
  const u = me(), n = S.notices.filter(x => x.to === S.me && !x.read).length;
  const t = todoCount(), active = { task: 'hall', settings: 'me', admin: 'me', prd: 'me', guide: 'me', design: 'me', docs: 'me' }[curPage] || curPage;
  const nav = [['hall', 'house', '任务大厅'], ['post', 'plus', '发布任务'], ['orders', 'clipboard-list', '我的订单', t], ['notices', 'bell', '消息', n], ['me', 'user', '个人中心']];
  $('#topbar').innerHTML = `<a class="brandmark" href="#/hall"><span class="logo">顺</span><b>顺路帮</b></a>
    ${back ? `<a class="back" href="${back}" aria-label="返回">‹</a>` : ''}<h1>${title}</h1>
    <nav class="topnav">${nav.map(([h, icn, name, c]) => `<a href="#/${h}" class="${active === h ? 'on' : ''}">${ic(icn, 's')}${name}${c ? `<span class="badge">${c}</span>` : ''}</a>`).join('')}</nav>
    <span class="chip-credit" data-act="switchUser" title="切换演示身份">${avatar(u)}${esc(u.name)} · ${lvBadge(u.credit)}</span>`;
}
function todoCount() {
  return S.tasks.filter(t => (t.runnerId === S.me && t.status === 'accepted') || (t.posterId === S.me && t.status === 'delivered' && !t.disputed)
    || (t.status === 'done' && ((t.posterId === S.me && !t.reviews.poster) || (t.runnerId === S.me && !t.reviews.runner)))).length;
}
function renderTabbar(page) {
  const n = todoCount(), unread = S.notices.filter(x => x.to === S.me && !x.read).length;
  const mePages = ['me', 'settings', 'docs', 'design', 'prd', 'guide', 'admin'];
  const it = (h, icn, name, key, c = 0, cls = '') => `<a href="#/${h}" class="${cls} ${page === key || (key === 'me' && mePages.includes(page)) ? 'on' : ''}"><span class="ic">${ic(icn)}</span>${name}${c ? `<span class="badge">${c}</span>` : ''}</a>`;
  $('#tabbar').innerHTML = it('hall', 'house', '大厅', 'hall') + it('notices', 'message-circle', '消息', 'notices', unread) + it('post', 'plus', '发布', 'post', 0, 'post') + it('orders', 'clipboard-list', '订单', 'orders', n) + it('me', 'user', '我的', 'me');
}
function onboarding() {
  openModal(`<h3>${ic('sparkles', 'h')}欢迎来到顺路帮</h3>
    <p class="muted mb8">这是「校园跑腿互助平台」的可交互原型，数据只保存在你的浏览器里，可以随便点。</p>
    <ol class="ob"><li><b>以「林同学」身份进入</b>：在大厅接单、发布任务、看订单。</li>
    <li><b>右上角头像可切换身份</b>：换成陈同学体验另一端；王同学未认证、赵同学信用低，可看到限制。</li>
    <li><b>「我的 → 设置」</b>：主题色、手机版 / 电脑版、运营后台，以及操作手册和 PRD。</li></ol>
    <div class="field mt12"><label>选个喜欢的主题色 <em>色卡来自小红书「校园美学配色」</em></label>${themePicker()}</div>
    <div class="actions mt12"><button class="btn line" data-act="obDocs">看操作手册</button><button class="btn" data-act="obStart">开始体验</button></div>`);
}

/* ---------- 任务大厅 ---------- */
const hall = { type: 'all', sort: 'smart', q: '', via: '' };
function routeScore(t) {
  // 顺路：任务起点在「我要去的地方」附近，终点在我宿舍或目的地附近
  if (!hall.via) return 0;
  const home = me().dorm, near = (a, b) => dist(a, b) <= 300;
  let s = 0;
  if (near(t.from, hall.via)) s += 2;
  if (near(t.to, home) || near(t.to, hall.via)) s += 1;
  if (near(t.from, home)) s += 1;
  return s;
}
function avgAcceptMin() {
  const xs = S.tasks.filter(t => t.acceptedAt).map(t => (t.acceptedAt - t.createdAt) / MIN);
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—';
}
function weeklyBoard() {
  const wk = now() - 7 * DAY;
  return Object.values(S.users).map(u => ({ u, n: S.tasks.filter(t => t.runnerId === u.id && t.status === 'done' && t.doneAt > wk).length }))
    .filter(x => x.n).sort((a, b) => b.n - a.n || b.u.credit - a.u.credit).slice(0, 3);
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
  const board = weeklyBoard();
  view.innerHTML = `<div class="hall-grid"><aside class="hall-side">
    <div class="hero">
      <div class="t">${esc(u.name)}，${esc(u.dorm)} 附近有 <b>${open.filter(t => dist(u.dorm, t.from) < 600).length}</b> 个任务等你顺手带</div>
      <div class="stats">
        <div><b>${open.length}</b><span>待接任务</span></div>
        <div><b>${S.tasks.filter(t => t.status === 'done').length}</b><span>已完成</span></div>
        <div><b>${avgAcceptMin()} 分钟</b><span>平均接单</span></div>
      </div>
      <div class="route">${ic('compass')} 我正要去
        <select data-change="via" aria-label="顺路目的地"><option value="">— 选个地方，看顺路单 —</option>${PLACE_NAMES.map(p => `<option ${hall.via === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
    </div>
    ${board.length ? `<div class="card board"><h3>${ic('trophy', 'h')}本周跑腿榜</h3>${board.map((x, i) => `<div class="row mb8"><b style="width:18px">${i + 1}</b>${avatar(x.u)}<span class="grow">${esc(x.u.name)}</span>${lvBadge(x.u.credit)}<span class="muted small">完成 ${x.n} 单</span></div>`).join('')}</div>` : ''}
    </aside><section class="hall-main">
    <div class="chips">
      ${[['all', '全部'], ...Object.entries(TYPES).map(([k, v]) => [k, ic(v.icon, 's') + v.name])].map(([k, n]) => `<button class="chip ${hall.type === k ? 'on' : ''}" data-act="hallType" data-v="${k}">${n}</button>`).join('')}
    </div>
    <div class="toolbar">
      <label class="search">${ic('search')}<input placeholder="搜地点、物品…" value="${esc(hall.q)}" data-input="q" aria-label="搜索任务"></label>
      <select data-change="sort" aria-label="排序">
        ${[['smart', '智能排序'], ['new', '最新发布'], ['reward', '赏金最高'], ['near', '离我最近'], ['urgent', '即将截止']].map(([k, n]) => `<option value="${k}" ${hall.sort === k ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    ${hall.via ? `<div class="alert info">顺路模式：从 ${esc(u.dorm)} 去 <b>${esc(hall.via)}</b>，为你筛出 ${list.length} 个顺路单 <a href="javascript:" data-act="clearVia">退出</a></div>` : ''}
    <div id="list">${list.length ? list.map(taskCard).join('') : `<div class="empty"><div class="e">${ic('inbox')}</div>暂时没有符合条件的任务<br><a href="#/post">发布一个需求 →</a></div>`}</div>
    </section></div>`;
}
function taskCard(t) {
  const p = user(t.posterId), ty = TYPES[t.type];
  const mine = t.posterId === S.me;
  const late = t.status === 'open' && t.deadline - now() < 30 * MIN;
  return `<a class="card task" href="#/task/${t.id}">
    <div class="head">${ticon(t.type)}
      <div class="grow"><div class="title ellipsis">${esc(t.title)}</div>
        <div class="row wrap mt8" style="gap:6px"><span class="tag">${ty.name}</span>${t.size === '大件' ? '<span class="tag warn">大件</span>' : ''}${t.advance ? `<span class="tag ${t.advance > RULES.bigAdvance ? 'bad' : 'gray'}">需垫付 ¥${money(t.advance)}</span>` : ''}${t._r >= 2 && t.status === 'open' ? '<span class="tag ok">顺路</span>' : ''}${mine ? '<span class="tag gray">我发布的</span>' : ''}${t.status !== 'open' ? statusTag(t.status) : ''}${t.disputed ? '<span class="tag bad">申诉中</span>' : ''}</div>
      </div>
      <div class="reward"><small>¥</small>${money(t.reward)}</div>
    </div>
    <div class="path"><span class="dot"></span>${esc(t.from)}<span class="arrow">→</span><span class="dot end"></span>${esc(t.to)}<span class="muted small" style="margin-left:auto">${t.type === 'seat' ? '' : fmtDist(dist(t.from, t.to))}</span></div>
    <div class="foot">${avatar(p)}<span>${esc(p.name)}</span>${lvBadge(p.credit)}<span style="margin-left:auto;${late ? 'color:var(--bad)' : ''}">${ic('clock', 's')}${left(t.deadline)}</span><span>· 距你 ${fmtDist(dist(me().dorm, t.from))}</span></div>
  </a>`;
}

/* ---------- 任务详情 ---------- */
function reviewsVisible(t) { return (t.reviews.poster && t.reviews.runner) || (t.doneAt && now() - t.doneAt > RULES.reviewOpen); }
function Detail(id) {
  const t = task(id);
  if (!t) { topbar('任务不存在', '#/hall'); view.innerHTML = '<div class="empty"><div class="e">'+ic('search-x')+'</div>任务不存在或已被删除</div>'; return; }
  topbar('任务详情', 'javascript:history.back()');
  const p = user(t.posterId), r = t.runnerId && user(t.runnerId);
  const isP = t.posterId === S.me, isR = t.runnerId === S.me, involved = isP || isR;
  const stepIdx = { open: 0, accepted: t.picked ? 2 : 1, delivered: 3, done: 4 }[t.status] ?? -1;
  const steps = ['发布', '已接单', '配送中', '已送达', '完成'];
  const ty = TYPES[t.type];

  let priv;
  if (involved) {
    priv = `<div class="secret">${ic('lock-open', 's')}<b>隐私信息（仅双方可见）</b><dl class="kv mt8">
      ${t.priv.code ? `<dt>取件码</dt><dd>${esc(t.priv.code)}</dd>` : ''}
      ${t.priv.phone ? `<dt>联系方式</dt><dd>${esc(t.priv.phone)}（平台虚拟号转接）</dd>` : ''}
      ${!t.priv.code && !t.priv.phone ? '<dt>—</dt><dd>发布者未填写额外隐私信息</dd>' : ''}</dl></div>`;
  } else priv = `<div class="locked">${ic('lock')}<br>取件码、联系方式等隐私信息<br>接单后仅对你可见</div>`;

  const myRole = isP ? 'poster' : isR ? 'runner' : null, other = isP ? 'runner' : 'poster';
  let reviewHtml = '';
  if (Object.keys(t.reviews).length) {
    if (reviewsVisible(t)) reviewHtml = ['poster', 'runner'].filter(k => t.reviews[k]).map(k => { const v = t.reviews[k]; return `<div class="mb8"><b>${k === 'poster' ? '发布者' : '跑腿者'}评价：</b><span class="star-txt">${stars(v.stars)}</span> ${v.tags.map(x => `<span class="tag">${esc(x)}</span>`).join(' ')}<div class="muted small">${esc(v.text)}</div></div>`; }).join('');
    else if (myRole && t.reviews[myRole]) reviewHtml = `<p class="muted small">你已评价。双方都评价后（或完成 72 小时后）同时公开。</p>`;
    else if (myRole && t.reviews[other]) reviewHtml = `<p class="muted small">对方已评价。你评价后即可看到对方的评价。</p>`;
    else reviewHtml = `<p class="muted small">评价将在双方都提交后公开。</p>`;
  }

  view.innerHTML = `
    <div class="card">
      <div class="row between"><span>${statusTag(t.status)} ${t.disputed ? '<span class="tag bad">申诉处理中</span>' : ''}</span><span class="muted small">发布于 ${ago(t.createdAt)}</span></div>
      <div class="head row mt12" style="align-items:flex-start">${ticon(t.type)}<div class="grow"><div style="font-size:17px;font-weight:600">${esc(t.title)}</div><span class="tag mt8">${ty.name}</span> ${t.size === '大件' ? '<span class="tag warn">大件</span>' : ''}</div>
        <div class="reward"><small>¥</small>${money(t.reward)}</div></div>
      ${stepIdx >= 0 ? `<div class="steps mt12">${steps.map((s, i) => `<div class="s ${i <= stepIdx ? 'on' : ''}"><i>${i <= stepIdx ? ic('check') : i + 1}</i>${s}</div>`).join('')}</div>` : ''}
    </div>
    <div class="card"><h3>任务信息</h3><dl class="kv">
      <dt>${t.type === 'seat' ? '占座地点' : '取货地点'}</dt><dd>${esc(t.from)}</dd>
      ${t.type !== 'seat' ? `<dt>送达地点</dt><dd>${esc(t.to)} <span class="muted">（约 ${fmtDist(dist(t.from, t.to))}）</span></dd>` : ''}
      <dt>截止时间</dt><dd>${clock(t.deadline)} · <span style="${t.deadline < now() && !['done', 'cancelled', 'expired', 'removed'].includes(t.status) ? 'color:var(--bad)' : ''}">${left(t.deadline)}</span></dd>
      <dt>赏金</dt><dd>¥${money(t.reward)} ${['open', 'accepted', 'delivered'].includes(t.status) ? '<span class="tag ok">平台托管中</span>' : ''}</dd>
      ${t.advance ? `<dt>需垫付</dt><dd>¥${money(t.advance)} <span class="muted">完成后随赏金一起返还跑腿者</span></dd>` : ''}
      ${t.note ? `<dt>备注</dt><dd>${esc(t.note)}</dd>` : ''}
    </dl></div>
    <div class="card"><h3>隐私信息</h3>${priv}</div>
    ${isP && t.status === 'accepted' ? `<div class="card"><h3>交付码</h3><div class="code">${t.deliverCode}</div><div class="hint">见面拿到东西后，把交付码告诉跑腿者；跑腿者输入即完成订单。不要提前告诉对方。</div></div>` : ''}
    <div class="card"><h3>参与者</h3>
      <div class="row">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b> <span class="muted small">发布者</span><div class="small muted">${esc(p.college)} ${p.verified ? '· <span class="tag ok">已实名</span>' : ''}</div></div>${lvBadge(p.credit)}</div>
      ${r ? `<div class="row mt12">${avatar(r)}<div class="grow"><b>${esc(r.name)}</b> <span class="muted small">跑腿者</span><div class="small muted">${esc(r.college)} · <span class="tag ok">已实名</span></div></div>${lvBadge(r.credit)}</div>` : ''}
    </div>
    ${involved && t.runnerId ? `<div class="card"><h3>订单消息</h3>
      <div class="msgs">${t.msgs.length ? t.msgs.map(m => `<div class="msg ${m.u === S.me ? 'me' : ''}"><small>${esc(user(m.u).name)} · ${clock(m.t)}</small>${esc(m.x)}</div>`).join('') : '<div class="muted small">还没有消息。沟通请留在平台内，便于纠纷时取证。</div>'}</div>
      ${['accepted', 'delivered'].includes(t.status) ? `<form class="inline-form" data-submit="msg" data-id="${t.id}"><input name="x" placeholder="说点什么…" maxlength="100" autocomplete="off" aria-label="消息"><button class="btn sm">发送</button></form>` : ''}</div>` : ''}
    ${reviewHtml ? `<div class="card"><h3>评价</h3>${reviewHtml}</div>` : ''}
    <div class="card"><h3>进度记录</h3><ul class="timeline">${[...t.timeline].reverse().map(x => `<li><b>${esc(x.x)}</b> · ${ago(x.t)}</li>`).join('') || '<li>暂无</li>'}</ul></div>
    ${!isP && t.status === 'open' ? `<p class="center small"><a href="javascript:" data-act="report" data-id="${t.id}">${ic('flag', 's')}举报这个任务</a></p>` : ''}
    <div class="sticky-actions"><div class="actions">${detailActions(t, isP, isR)}</div></div>`;
}
function detailActions(t, isP, isR) {
  const id = t.id;
  const b = (act, txt, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${id}">${txt}</button>`;
  const rv = role => !t.reviews[role] ? b('review', ic('star', 's') + '评价对方') : '';
  const again = isP ? b('again', '再来一单', 'ghost') : '';
  switch (t.status) {
    case 'open':
      if (isP) return b('raise', '加价 ¥2', 'ghost') + b('cancel', '取消任务', 'danger');
      return b('accept', `接单赚 ¥${money(t.reward)}`);
    case 'accepted':
      if (isR) return (t.picked ? '' : b('pick', t.type === 'seat' ? '已占到座位' : '已取件/已买到', 'ghost')) + b('handover', '当面交付') + b('leave', '无接触交付', 'ghost') + b('abandon', '放弃', 'danger');
      if (isP) return b('urge', '催一下', 'ghost') + `<button class="btn line" disabled>等待送达…</button>`;
      return `<button class="btn" disabled>已被接单</button>`;
    case 'delivered':
      if (t.disputed) return `<button class="btn line" disabled>申诉处理中，平台客服会联系双方</button>`;
      if (isP) return b('confirm', '确认收到') + b('dispute', '有问题，申诉', 'danger');
      if (isR) return `<button class="btn line" disabled>等待对方确认（24 小时后自动确认）</button>`;
      return '';
    case 'done':
      if (isP) return (rv('poster') || '') + again || '<button class="btn line" disabled>订单已完成</button>';
      if (isR) return rv('runner') || '<button class="btn line" disabled>订单已完成</button>';
      return '';
    case 'expired': case 'cancelled':
      return again;
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
  if (t.deadline >= (t.deliveredAt || now())) credit(r.id, +2, '按时完成跑腿：' + t.title.slice(0, 12));
  else credit(r.id, -2, '超时完成：' + t.title.slice(0, 12));
  credit(p.id, +1, '顺利完成一笔交易');
  notify(r.id, `${short(t)} 已完成，¥${money(t.reward + t.advance)} 已到账。去评价一下对方吧`, t.id);
  notify(p.id, `${short(t)} 已完成，去评价一下跑腿的同学吧`, t.id);
}
const actions = {
  switchUser() { go('#/settings'); setTimeout(() => document.getElementById('who')?.scrollIntoView({ behavior: 'smooth' }), 60); },
  hallType(d) { hall.type = d.v; Hall(); },
  clearVia() { hall.via = ''; Hall(); },
  accept(d) {
    const t = task(d.id), err = checkAccept(t);
    if (err) return toast(err);
    openModal(`<h3>确认接单</h3>
      <div class="alert info">接单后你将看到取件码与联系方式。请在 <b>${clock(t.deadline)}</b> 前送达。</div>
      ${t.advance ? `<div class="alert warn">本单需要你先垫付 <b>¥${money(t.advance)}</b>，完成后与赏金一起返还。请保留小票。</div>` : ''}
      <ul class="privs"><li>${ic('circle-check', 'ok')}按时完成：信用 +2，赏金 ¥${money(t.reward)}</li><li>${ic('triangle-alert', 'warn')}超时完成：信用 -2</li><li>${ic('circle-x', 'bad')}接单后放弃：信用 -3</li></ul>
      <div class="actions mt12"><button class="btn line" data-act="close">再想想</button><button class="btn" data-act="doAccept" data-id="${t.id}">确认接单</button></div>`);
  },
  doAccept(d) {
    const t = task(d.id), err = checkAccept(t);
    closeModal();
    if (err) return toast(err);
    if (t.status !== 'open') return toast('手慢了，已被别人接走');
    t.status = 'accepted'; t.runnerId = S.me; t.picked = false; t.acceptedAt = now(); push(t, me().name + ' 接单');
    notify(t.posterId, `${me().name} 接下了你的${short(t)}，见面时把交付码告诉 TA`, t.id);
    save(); toast('接单成功！隐私信息已解锁'); route();
  },
  pick(d) {
    const t = task(d.id); t.picked = true; push(t, t.type === 'seat' ? '跑腿者已占到座位' : '跑腿者已取件，正在配送');
    notify(t.posterId, `${me().name} ${t.type === 'seat' ? '已占到座位' : '已取件，正在配送'}${short(t)}`, t.id);
    save(); toast('已更新进度，发布者会收到通知'); route();
  },
  handover(d) {
    openModal(`<h3>当面交付</h3><p class="muted small mb8">请向发布者索要 4 位交付码。交付码只在发布者手机上显示，能防止冒领与“送到了却说没收到”。</p>
      <form data-submit="handover" data-id="${d.id}"><input class="codeinput" name="code" inputmode="numeric" maxlength="4" placeholder="····" autocomplete="off" aria-label="交付码">
      <div class="hint">演示提示：切换为发布者身份，可在任务详情页看到交付码</div>
      <div class="actions mt12"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">核验并完成</button></div></form>`);
    setTimeout(() => $('.codeinput')?.focus(), 50);
  },
  leave(d) {
    openModal(`<h3>无接触交付</h3><p class="muted small mb8">对方不方便见面时，把东西放到约定位置并拍照留证。对方确认或 24 小时后自动完成。</p>
      <form data-submit="leave" data-id="${d.id}"><div class="field"><label>放置位置</label><input name="where" value="${esc(task(d.id).to)}一楼取物架" required></div>
      <div class="field"><label>照片凭证</label><div class="locked">${ic('camera')}<br>已拍照（演示中以占位图代替）</div></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">提交送达</button></div></form>`);
  },
  abandon(d) {
    openModal(`<h3>确定放弃这单吗？</h3><div class="alert bad">放弃将扣除信用 3 分，任务会重新回到大厅。</div>
      <div class="actions"><button class="btn line" data-act="close">继续跑</button><button class="btn danger" data-act="doAbandon" data-id="${d.id}">确定放弃</button></div>`);
  },
  doAbandon(d) {
    const t = task(d.id); closeModal();
    credit(S.me, -3, '接单后中途放弃'); push(t, me().name + ' 放弃订单，任务重新开放');
    notify(t.posterId, `${me().name} 放弃了${short(t)}，任务已重新回到大厅`, t.id);
    t.status = 'open'; t.runnerId = null; t.picked = false; t.msgs = []; t.acceptedAt = null;
    save(); toast('已放弃，信用 -3'); go('#/orders');
  },
  urge(d) {
    const t = task(d.id);
    if (t.urged && now() - t.urged < 5 * MIN) return toast('刚催过啦，5 分钟后再试');
    t.urged = now(); t.msgs.push({ u: S.me, x: '[系统] 发布者催了一下，麻烦尽快哦～', t: now() });
    notify(t.runnerId, `${me().name} 催了一下${short(t)}`, t.id); save(); toast('已提醒跑腿者'); route();
  },
  confirm(d) { const t = task(d.id); finish(t, '发布者确认收货'); save(); toast('订单完成，记得给对方评价'); route(); },
  dispute(d) {
    openModal(`<h3>发起申诉</h3><p class="muted small mb8">申诉期间赏金暂停结算。平台会结合交付照片、订单消息和进度记录判定。</p>
      <form data-submit="dispute" data-id="${d.id}"><div class="field"><label>问题类型</label><select name="reason"><option>未收到物品</option><option>物品损坏或错误</option><option>垫付金额不符</option><option>其他</option></select></div>
      <div class="field"><label>补充说明</label><textarea name="text" required maxlength="120" placeholder="说清楚发生了什么，便于客服处理"></textarea></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn danger">提交申诉</button></div></form>`);
  },
  report(d) {
    openModal(`<h3>举报任务</h3><p class="muted small mb8">举报会进入运营后台人工审核，核实后下架任务并扣除发布者信用。</p>
      <form data-submit="report" data-id="${d.id}"><div class="field"><label>举报原因</label><select name="reason">${REPORT_REASONS.map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label>补充说明 <em>选填</em></label><textarea name="text" maxlength="120"></textarea></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn danger">提交举报</button></div></form>`);
  },
  raise(d) {
    const t = task(d.id), u = me();
    if (u.balance < 2) return toast('余额不足，请先充值');
    u.balance -= 2; t.reward += 2; push(t, `发布者加价 ¥2，当前赏金 ¥${money(t.reward)}`); save(); toast('已加价，赏金更高的单更容易被接'); route();
  },
  cancel(d) {
    const t = task(d.id); t.status = 'cancelled'; me().balance += t.reward;
    push(t, `发布者取消任务，托管赏金 ¥${money(t.reward)} 已原路退回`); save(); toast('已取消，赏金已退回'); route();
  },
  again(d) {
    const t = task(d.id);
    postDraft = { type: t.type, title: t.title, from: t.from, to: t.to, deadline: '60', size: t.size, advance: t.advance, note: t.note, code: '', phone: t.priv.phone || '', autoReward: true };
    postDraft.reward = Math.max(t.reward, suggest(postDraft));
    toast('已按原任务填好，检查一下取件码再发布'); go('#/post');
  },
  review(d) {
    const t = task(d.id), isP = t.posterId === S.me;
    const other = user(isP ? t.runnerId : t.posterId);
    const tags = isP ? ['准时送达', '态度友好', '物品完好', '沟通顺畅'] : ['描述清楚', '确认爽快', '好沟通', '地点准确'];
    openModal(`<h3>评价 ${esc(other.name)}</h3>
      <form data-submit="review" data-id="${t.id}"><div class="stars">${[1, 2, 3, 4, 5].map(i => `<span data-act="star" data-v="${i}" class="on" role="button" aria-label="${i} 星">${ic('star')}</span>`).join('')}</div><input type="hidden" name="stars" value="5">
      <div class="chips wrap">${tags.map(x => `<label class="chip"><input type="checkbox" name="tag" value="${x}" hidden>${x}</label>`).join('')}</div>
      <div class="field"><textarea name="text" placeholder="说说这次体验（选填）" maxlength="80" aria-label="评价内容"></textarea></div>
      <p class="hint mb8">4–5 星：对方信用 +1；1–2 星：对方信用 -3。双盲互评：双方都提交后（或 72 小时后）同时公开。</p>
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
      <form data-submit="verify"><div class="field"><label>学号</label><input name="sid" required pattern="\\d{8,12}" placeholder="8–12 位数字" inputmode="numeric"></div>
      <div class="field"><label>校园邮箱 <em>接收验证码</em></label><input name="mail" type="email" required placeholder="学号@stu.xxx.edu.cn"></div>
      <div class="field"><label>学生证照片</label><div class="locked">${ic('camera')}<br>演示环境：点击提交即视为上传成功</div></div>
      <div class="actions"><button type="button" class="btn line" data-act="close">取消</button><button class="btn">提交认证</button></div></form>`);
  },
  recharge() { me().balance += 50; save(); toast('演示充值 ¥50 成功'); route(); },
  reset() {
    if (!confirm('重置所有演示数据？')) return;
    localStorage.removeItem(LS_KEY); S = seed(); S.onboarded = true; save();
    Object.assign(hall, { type: 'all', sort: 'smart', q: '', via: '' }); postDraft = null; toast('已恢复初始演示数据'); go('#/hall');
  },
  ptype(d) { postDraft.type = d.v; postDraft.from = TYPES[d.v].from; postDraft.autoReward = true; postDraft.reward = suggest(postDraft); Post(); },
  rstep(d) { postDraft.autoReward = false; postDraft.reward = Math.max(1, Math.min(99, postDraft.reward + +d.v)); Post(); },
  useSuggest() { postDraft.autoReward = true; postDraft.reward = suggest(postDraft); Post(); },
  ordersTab(d) { ordersTab = d.v; Orders(); },
  layout(d) {
    layoutPref = d.v; try { localStorage.setItem(LAYOUT_KEY, d.v); } catch (e) {}
    applyLayout(); toast('已切换为' + { auto: '自动', mobile: '手机版', pc: '电脑版' }[d.v] + '版式'); route();
  },
  theme(d) {
    applyTheme(d.v);
    document.querySelectorAll('.theme').forEach(b => b.classList.toggle('on', b.dataset.v === d.v));
    toast('主题已切换为「' + THEMES[d.v].name + '」');
  },
  obStart() { S.onboarded = true; save(); closeModal(); },
  obDocs() { S.onboarded = true; save(); closeModal(); go('#/guide'); },
  readAll() { S.notices.forEach(n => { if (n.to === S.me) n.read = true; }); save(); route(); },
  openNotice(d) { const n = S.notices.find(x => x.id === d.id); if (n) n.read = true; save(); go('#/task/' + d.task); },
  resolve(d) {
    const rp = S.reports.find(x => x.id === d.id), t = task(rp.taskId);
    rp.status = 'resolved'; rp.handledAt = now();
    if (d.v === 'remove') {
      t.status = 'removed'; user(t.posterId).balance += t.reward;
      credit(t.posterId, -20, '发布违规任务被下架'); push(t, `运营核实举报（${rp.reason}），任务下架，赏金退回`);
      notify(t.posterId, `你的${short(t)}因「${rp.reason}」被下架，信用 -20`, t.id);
      notify(rp.by, `你举报的${short(t)}已核实并下架，感谢维护社区`, t.id); rp.result = '已下架，发布者信用 -20';
    } else if (d.v === 'reject') {
      notify(rp.by, `你举报的${short(t)}经审核未发现违规`, t.id); rp.result = '驳回，未发现违规';
    } else if (d.v === 'poster') {
      t.disputed = false; t.status = 'cancelled'; user(t.posterId).balance += t.reward;
      credit(t.runnerId, -20, '申诉核实：未完成交付'); push(t, '运营判定支持发布者：赏金原路退回，跑腿者信用 -20');
      notify(t.posterId, `申诉成功：${short(t)} 赏金已退回`, t.id); notify(t.runnerId, `${short(t)} 申诉判定未完成交付，信用 -20`, t.id);
      rp.result = '支持发布者，退款并扣跑腿者信用 -20';
    } else if (d.v === 'runner') {
      t.disputed = false; credit(t.posterId, -5, '无理申诉'); push(t, '运营判定支持跑腿者：交付凭证有效');
      finish(t, '申诉驳回，订单完成'); rp.result = '支持跑腿者，订单完成，发布者信用 -5';
    }
    save(); toast('已处理：' + rp.result); route();
  },
};

/* ---------- 发布任务 ---------- */
let postDraft = null;
const DEADLINES = [['30', '30 分钟内'], ['60', '1 小时内'], ['120', '2 小时内'], ['240', '4 小时内'], ['720', '今天内'], ['1440', '明天这个时候']];
function newDraft() { const d = { type: 'express', title: '', from: '北门菜鸟驿站', to: me().dorm, deadline: '60', size: '小件', advance: 0, note: '', code: '', phone: '', autoReward: true }; d.reward = suggest(d); return d; }
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
  const opts = sel => PLACE_NAMES.map(p => `<option ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
  view.innerHTML = `
    ${!u.verified ? `<div class="alert warn">你还没有完成校园实名认证，认证后才能发布任务。<a href="javascript:" data-act="verify">去认证 →</a></div>` : ''}
    <div class="typegrid">${Object.entries(TYPES).map(([k, v]) => `<button type="button" class="${d.type === k ? 'on' : ''}" data-act="ptype" data-v="${k}">${ticon(k)}<b>${v.name}</b><small>${v.desc}</small></button>`).join('')}</div>
    <form class="card" data-submit="post" id="postForm">
      <div class="field"><label for="f-title">一句话描述 <em>说清楚是什么、多少件</em></label><input id="f-title" name="title" maxlength="40" required value="${esc(d.title)}" placeholder="${{ express: '例：菜鸟驿站 2 个小件', buy: '例：一食堂带一份鸡腿饭', seat: '例：明早 8 点图书馆三楼占座', other: '例：打印店取材料送到教学楼' }[d.type]}"></div>
      <div class="two">
        <div class="field"><label for="f-from">${d.type === 'seat' ? '占座地点' : d.type === 'buy' ? '购买地点' : '取件地点'}</label><select id="f-from" name="from">${opts(d.from)}</select></div>
        ${d.type === 'seat' ? '' : `<div class="field"><label for="f-to">送达地点</label><select id="f-to" name="to">${opts(d.to)}</select></div>`}
      </div>
      <div class="two">
        <div class="field"><label for="f-dl">截止时间</label><select id="f-dl" name="deadline">${DEADLINES.map(([v, n]) => `<option value="${v}" ${d.deadline === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${d.type === 'express' || d.type === 'buy' ? `<div class="field"><label for="f-size">物品大小</label><select id="f-size" name="size"><option ${d.size === '小件' ? 'selected' : ''}>小件</option><option ${d.size === '大件' ? 'selected' : ''}>大件</option></select></div>` : ''}
      </div>
      ${d.type === 'buy' ? `<div class="field"><label for="f-adv">预计垫付金额 <em>跑腿者先付，完成后返还；上限 ¥500</em></label><input id="f-adv" name="advance" type="number" min="0" max="500" step="0.5" value="${d.advance || ''}" placeholder="0">${d.advance > RULES.bigAdvance ? `<div class="hint" style="color:var(--warn)">垫付超过 ¥${RULES.bigAdvance}，只有信用「可靠」及以上的同学能接单</div>` : ''}</div>` : ''}
      ${d.type === 'express' ? `<div class="field"><label for="f-code">取件码 <em>${ic('lock', 's')}接单后仅对跑腿者可见</em></label><input id="f-code" name="code" value="${esc(d.code)}" placeholder="例：3-2-1187"></div>` : ''}
      <div class="field"><label for="f-phone">联系方式 <em>${ic('lock', 's')}平台虚拟号转接，不暴露真实号码</em></label><input id="f-phone" name="phone" value="${esc(d.phone)}" placeholder="例：尾号 6623"></div>
      <div class="field"><label for="f-note">备注</label><textarea id="f-note" name="note" maxlength="120" placeholder="${d.type === 'seat' ? '占座请遵守场馆规定，不可长时间占用；建议到场后再交接' : '口味、楼层、放置位置等'}">${esc(d.note)}</textarea></div>
      ${d.type === 'seat' ? `<div class="alert info small">${ic('map-pin', 's')}占座规则：只占 1 个位、只在开放区域、超过 30 分钟未到场请主动释放，尊重其他同学。</div>` : ''}
      <div class="field"><label for="f-reward">赏金</label>
        <div class="stepper"><button type="button" data-act="rstep" data-v="-1" aria-label="减 1 元">−</button><input id="f-reward" name="reward" type="number" min="1" max="99" value="${d.reward}" style="width:80px"><button type="button" data-act="rstep" data-v="1" aria-label="加 1 元">＋</button>
          <span class="small muted grow">建议 ¥${sug} ${d.reward !== sug ? `<a href="javascript:" data-act="useSuggest">使用</a>` : ic('check', 's')}</span></div>
        <div class="hint">按类型、距离（${d.type === 'seat' ? '—' : fmtDist(dist(d.from, d.to))}）、大小和紧急程度估算。赏金越合理，接单越快。</div>
      </div>
      <div id="banned">${bannedAlert(d.title + d.note)}</div>
      <div class="sumbox">
        <div class="sum"><span class="muted">赏金托管（发布即冻结）</span><b>¥${money(d.reward)}</b></div>
        ${d.advance && d.type === 'buy' ? `<div class="sum"><span class="muted">完成时支付垫付款</span><b>¥${money(d.advance)}</b></div>` : ''}
        <div class="sum"><span class="muted">当前余额</span><span>¥${money(u.balance)}</span></div>
      </div>
      <button class="btn block" ${!u.verified ? 'disabled' : ''}>发布任务</button>
      <p class="hint center">禁止发布代课、代考、代签到等违反校规的任务，违者下架并扣除信用</p>
    </form>`;
}
function readDraft(form) {
  const f = new FormData(form);
  ['title', 'from', 'to', 'deadline', 'size', 'note', 'code', 'phone'].forEach(k => { if (f.has(k)) postDraft[k] = f.get(k); });
  if (f.has('advance')) postDraft.advance = Math.max(0, Math.min(500, +f.get('advance') || 0));
  if (f.has('reward')) postDraft.reward = Math.max(1, Math.min(99, Math.round(+f.get('reward') || 1)));
}
const bannedHit = s => BANNED.find(w => s.includes(w));
const bannedAlert = s => { const w = bannedHit(s); return w ? `<div class="alert bad">${ic('ban', 's')}检测到违规内容「${esc(w)}」：平台不支持代课、代考、代签到等违反校规的任务。</div>` : ''; };

/* ---------- 我的订单 ---------- */
let ordersTab = 'run';
function Orders() {
  topbar('我的订单');
  const mineOf = k => S.tasks.filter(t => k === 'post' ? t.posterId === S.me : t.runnerId === S.me);
  const list = mineOf(ordersTab).sort((a, b) => (order(a) - order(b)) || (b.createdAt - a.createdAt));
  view.innerHTML = `
    <div class="chips"><button class="chip ${ordersTab === 'run' ? 'on' : ''}" data-act="ordersTab" data-v="run">我接的单 (${mineOf('run').length})</button><button class="chip ${ordersTab === 'post' ? 'on' : ''}" data-act="ordersTab" data-v="post">我发布的 (${mineOf('post').length})</button></div>
    ${list.length ? list.map(t => {
      const h = hint(t);
      return taskCard(t).replace(/<\/a>\s*$/, h ? `<div class="alert ${h[0]} mt8" style="margin-bottom:0">${ic('arrow-right', 's')}${h[1]}</div></a>` : '</a>');
    }).join('') : `<div class="empty"><div class="e">${ic('folder-open')}</div>${ordersTab === 'run' ? '还没有接过单<br><a href="#/hall">去大厅看看 →</a>' : '还没有发布过任务<br><a href="#/post">发布第一个 →</a>'}</div>`}`;
}
function order(t) { return { accepted: 0, delivered: 1, open: 2, done: 3 }[t.status] ?? 4; }
function hint(t) {
  const isP = t.posterId === S.me;
  if (t.disputed) return ['bad', '申诉处理中，赏金暂停结算'];
  if (t.status === 'accepted') return isP ? ['info', `${user(t.runnerId).name} 正在跑，见面后告诉 TA 交付码 ${t.deliverCode}`] : ['warn', t.picked ? '送到后向对方要交付码完成订单' : '去取件/购买，完成后更新进度'];
  if (t.status === 'delivered') return isP ? ['warn', '东西已送达，请确认收货'] : ['info', '等待对方确认收货'];
  if (t.status === 'done' && !t.reviews[isP ? 'poster' : 'runner']) return ['info', '订单完成，去评价对方'];
  if (t.status === 'open' && isP) return ['info', '等待同学接单，加价可以更快被接'];
  if (t.status === 'expired' && isP) return ['info', '无人接单已过期，可以「再来一单」重新发布'];
  return null;
}

/* ---------- 消息中心 ---------- */
function Notices() {
  topbar('消息');
  const list = S.notices.filter(n => n.to === S.me);
  view.innerHTML = `${list.some(n => !n.read) ? `<div class="row between mb8"><span class="muted small">${list.filter(n => !n.read).length} 条未读</span><a href="javascript:" data-act="readAll" class="small">全部已读</a></div>` : ''}
    ${list.length ? `<div class="card" style="padding:4px 14px">${list.map(n => `<div class="notice ${n.read ? '' : 'unread'}" data-act="openNotice" data-id="${n.id}" data-task="${n.taskId}"><div>${esc(n.x)}</div><div class="small muted">${ago(n.t)}</div></div>`).join('')}</div>`
      : `<div class="empty"><div class="e">${ic('inbox')}</div>暂无消息</div>`}`;
}

/* ---------- 个人中心 ---------- */
function Me() {
  topbar('个人中心');
  const u = me(), l = level(u.credit);
  const pct = u.credit / 200, C = Math.PI * 46;
  const runs = S.tasks.filter(t => t.runnerId === u.id && t.status === 'done').length;
  const posts = S.tasks.filter(t => t.posterId === u.id).length;
  const rv = S.tasks.filter(reviewsVisible).flatMap(t => [t.posterId === u.id && t.reviews.runner, t.runnerId === u.id && t.reviews.poster]).filter(Boolean);
  const good = rv.length ? Math.round(rv.filter(x => x.stars >= 4).length / rv.length * 100) + '%' : '—';
  const next = LEVELS.slice().reverse().find(x => x.min > u.credit);
  const priv = [
    [u.verified, '已完成校园实名认证'],
    [u.credit >= RULES.acceptMin, `接单权限（≥${RULES.acceptMin}）`],
    [u.credit >= RULES.bigAdvanceMin, `接大额垫付单（≥${RULES.bigAdvanceMin}）`],
    [u.credit >= 140, '发布的任务优先展示（≥140）'],
    [u.credit >= 180, '金牌跑腿标识 + 每月平台补贴（≥180）'],
  ];
  view.innerHTML = `
    <div class="card"><div class="profile">${avatar(u, 'lg')}<div class="grow"><div style="font-size:17px;font-weight:600">${esc(u.name)} ${u.verified ? `<span class="tag ok">${ic('shield-check', 's')}校园实名</span>` : '<span class="tag warn">未认证</span>'}</div><div class="muted small">${esc(u.college)} · ${esc(u.dorm)}</div></div></div>
      ${!u.verified ? `<button class="btn block mt12" data-act="verify">完成校园实名认证（信用 +20）</button>` : ''}
    </div>
    <a class="card rowlink" href="#/settings">${ic('settings', 'h')}<span class="grow">设置</span><span class="muted small">主题色 · 版式 · 身份 · 关于</span>${ic('chevron-right', 's')}</a>
    <div class="card"><div class="gauge">
      <svg width="120" height="70" viewBox="0 0 120 70" role="img" aria-label="信用分 ${u.credit}"><path d="M14 64 A46 46 0 0 1 106 64" fill="none" style="stroke:var(--line)" stroke-width="10" stroke-linecap="round"/>
        <path d="M14 64 A46 46 0 0 1 106 64" fill="none" style="stroke:${l.c}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/>
        <text x="60" y="58" text-anchor="middle" font-size="24" font-weight="700" style="fill:${l.c}">${u.credit}</text></svg>
      <div class="grow"><div style="font-size:16px;font-weight:600;color:${l.c}">信用等级 · ${l.name}</div>
        <div class="muted small">${next ? `再得 ${next.min - u.credit} 分升级为「${next.name}」` : '已达最高等级'}</div>
        <div class="row mt8" style="gap:16px;font-size:12px"><div><b style="font-size:16px">${runs}</b><br><span class="muted">完成跑腿</span></div><div><b style="font-size:16px">${posts}</b><br><span class="muted">发布任务</span></div><div><b style="font-size:16px">${good}</b><br><span class="muted">好评率</span></div></div>
      </div></div></div>
    <div class="card"><h3>我的权益</h3><ul class="privs">${priv.map(([ok, x]) => `<li class="${ok ? '' : 'no'}">${ok ? ic('circle-check', 'ok') : ic('lock', 'off')}${x}</li>`).join('')}</ul></div>
    <div class="card"><div class="row between"><h3 style="margin:0">钱包</h3><button class="btn sm ghost" data-act="recharge">演示充值 ¥50</button></div>
      <div class="row mt8" style="gap:24px"><div><div style="font-size:22px;font-weight:700">¥${money(u.balance)}</div><div class="small muted">可用余额</div></div>
      <div><div style="font-size:22px;font-weight:700;color:var(--b600)">¥${money(S.tasks.filter(t => t.posterId === u.id && ['open', 'accepted', 'delivered'].includes(t.status)).reduce((s, t) => s + t.reward, 0))}</div><div class="small muted">托管中</div></div></div></div>
    <div class="card"><h3>信用规则</h3><table class="rules"><tr><th>行为</th><th>变化</th></tr>
      <tr><td>完成校园实名认证</td><td class="plus">+20</td></tr><tr><td>按时完成跑腿</td><td class="plus">+2</td></tr><tr><td>作为发布者顺利完成交易</td><td class="plus">+1</td></tr>
      <tr><td>收到 4–5 星评价</td><td class="plus">+1</td></tr><tr><td>超时完成</td><td class="minus">-2</td></tr><tr><td>接单后放弃</td><td class="minus">-3</td></tr>
      <tr><td>收到 1–2 星评价</td><td class="minus">-3</td></tr><tr><td>无理申诉</td><td class="minus">-5</td></tr><tr><td>申诉核实违约 / 发布违规任务</td><td class="minus">-20</td></tr></table>
      <p class="hint">信用分 0–200，初始 100。等级：受限 &lt;60 · 新手 60 · 可靠 100 · 优秀 140 · 金牌 180。</p></div>
    <div class="card"><h3>信用明细</h3><ul class="log">${u.log.slice(0, 12).map(x => `<li><span>${esc(x.r)}<br><span class="small muted">${ago(x.t)}</span></span><span class="${x.d >= 0 ? 'plus' : 'minus'}">${x.d > 0 ? '+' : ''}${x.d}</span></li>`).join('') || '<li class="muted">暂无记录</li>'}</ul></div>`;
}

/* ---------- 运营后台 ---------- */
function Admin() {
  topbar('运营后台', '#/settings');
  const T = S.tasks, done = T.filter(t => t.status === 'done').length, acc = T.filter(t => t.acceptedAt).length;
  const finished = T.filter(t => ['done', 'cancelled', 'expired', 'removed'].includes(t.status) || t.status === 'delivered').length;
  const disputes = S.reports.filter(r => r.kind === '申诉').length;
  const pending = S.reports.filter(r => r.status === 'pending'), resolved = S.reports.filter(r => r.status !== 'pending');
  const kpi = (v, n, sub = '') => `<div class="kpi"><b>${v}</b><span>${n}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const users = Object.values(S.users);
  const rpCard = rp => {
    const t = task(rp.taskId), by = user(rp.by);
    const btns = rp.status !== 'pending' ? `<div class="alert ok small" style="margin:8px 0 0">${ic('check', 's')}${esc(rp.result)}</div>` : rp.kind === '举报'
      ? `<div class="actions mt8"><button class="btn sm danger" data-act="resolve" data-id="${rp.id}" data-v="remove">核实，下架任务</button><button class="btn sm line" data-act="resolve" data-id="${rp.id}" data-v="reject">驳回</button></div>`
      : `<div class="actions mt8"><button class="btn sm" data-act="resolve" data-id="${rp.id}" data-v="poster">支持发布者（退款）</button><button class="btn sm line" data-act="resolve" data-id="${rp.id}" data-v="runner">支持跑腿者（放款）</button></div>`;
    return `<div class="card"><div class="row between"><span><span class="tag ${rp.kind === '举报' ? 'bad' : 'warn'}">${rp.kind}</span> <b>${esc(rp.reason)}</b></span><span class="small muted">${ago(rp.t)}</span></div>
      <div class="small mt8">任务：<a href="#/task/${t.id}">${esc(t.title)}</a>（¥${money(t.reward)}${t.advance ? ` · 垫付 ¥${money(t.advance)}` : ''}）</div>
      <div class="small muted">发起人：${esc(by.name)} · 发布者：${esc(user(t.posterId).name)}${t.runnerId ? ' · 跑腿者：' + esc(user(t.runnerId).name) + `（信用 ${user(t.runnerId).credit}）` : ''}</div>
      <div class="quote">${esc(rp.text || '（无补充说明）')}</div>
      ${t.timeline.length ? `<details class="small"><summary>查看进度记录（${t.timeline.length}）</summary><ul class="timeline mt8">${[...t.timeline].reverse().map(x => `<li><b>${esc(x.x)}</b> · ${ago(x.t)}</li>`).join('')}</ul></details>` : ''}
      ${btns}</div>`;
  };
  view.innerHTML = `
    <div class="alert info small">管理员视角演示：查看平台数据、处理举报与申诉。处理结果会实时影响用户信用与资金。</div>
    <div class="kpis">
      ${kpi(T.length, '任务总数')}${kpi(acc ? Math.round(acc / T.length * 100) + '%' : '—', '接单率', '被接过的任务占比')}
      ${kpi(avgAcceptMin() + ' 分', '平均接单用时')}${kpi(finished ? Math.round(done / finished * 100) + '%' : '—', '履约完成率', '完成 / 已结束')}
      ${kpi(acc ? Math.round(disputes / acc * 100) + '%' : '—', '纠纷率', '申诉 / 已接单')}${kpi(Math.round(users.reduce((s, u) => s + u.credit, 0) / users.length), '平均信用分')}
    </div>
    <h3 class="sec">待处理 <span class="tag bad">${pending.length}</span></h3>
    ${pending.length ? pending.map(rpCard).join('') : `<div class="empty" style="padding:20px 0"><div class="e">${ic('circle-check')}</div>没有待处理的举报和申诉</div>`}
    ${resolved.length ? `<h3 class="sec">已处理</h3>${resolved.map(rpCard).join('')}` : ''}
    <h3 class="sec">用户信用</h3>
    <div class="card"><table class="rules"><tr><th>用户</th><th>认证</th><th>信用</th><th>完成单</th></tr>
      ${users.map(u => `<tr><td>${esc(u.name)}</td><td>${u.verified ? ic('check', 's') : '—'}</td><td>${lvBadge(u.credit)}</td><td>${T.filter(t => t.runnerId === u.id && t.status === 'done').length}</td></tr>`).join('')}</table></div>
    <h3 class="sec">违规词库（发布时自动拦截）</h3>
    <div class="card"><div class="row wrap" style="gap:6px">${BANNED.map(w => `<span class="tag bad">${w}</span>`).join('')}</div></div>`;
}

/* ---------- 文档中心 ---------- */
function Settings() {
  topbar('设置', '#/me');
  const it = (h, icn, t, d, ext) => `<a class="rowlink" href="${h}" ${ext ? 'target="_blank" rel="noopener"' : ''}>${ic(icn, 'h')}<div class="grow"><div>${t}</div>${d ? `<div class="small muted">${d}</div>` : ''}</div>${ic('chevron-right', 's')}</a>`;
  const seg = [['auto', '自动', '按窗口宽度'], ['mobile', '手机版', '底部标签栏'], ['pc', '电脑版', '顶部导航 · 多栏']];
  const GH = 'https://github.com/Bluebell0102/campus-errand/blob/main/docs/';
  view.innerHTML = `
    <h3 class="sec">外观</h3>
    <div class="card"><div class="field" style="margin:0"><label>页面版式 <em>当前：${document.documentElement.dataset.layout === 'pc' ? '电脑版' : '手机版'}</em></label>
      <div class="seg">${seg.map(([k, n, d]) => `<button class="${layoutPref === k ? 'on' : ''}" data-act="layout" data-v="${k}"><b>${n}</b><small>${d}</small></button>`).join('')}</div></div></div>
    <div class="card"><div class="field" style="margin:0"><label>主题色 <em>色卡来自小红书「校园美学配色」</em></label>${themePicker()}</div></div>
    <h3 class="sec">演示身份</h3>
    <div class="card" id="who"><p class="hint mb8">用不同身份体验发单方 / 跑腿方，以及低信用、未认证时的限制。</p>
      ${Object.values(S.users).map(x => `<div class="who ${x.id === S.me ? 'on' : ''}" data-act="becomeUser" data-id="${x.id}" role="button">${avatar(x)}<div class="grow"><b>${esc(x.name)}</b> ${x.verified ? '' : '<span class="tag warn">未认证</span>'}<div class="small muted">${esc(x.college)} · ${esc(x.dorm)}</div></div>${lvBadge(x.credit)}</div>`).join('')}
      <button class="btn line block mt8" data-act="reset">重置演示数据</button></div>
    <h3 class="sec">管理</h3>
    <div class="card list">${it('#/admin', 'shield-check', '运营后台', '数据看板、举报与申诉处理、用户信用')}</div>
    <h3 class="sec">关于顺路帮</h3>
    <div class="card list">
      ${it('#/guide', 'compass', '操作手册', '3 分钟体验路径与功能说明')}
      ${it('#/prd', 'book-open', '产品需求文档 PRD v1.0', '背景、目标、范围、规则、状态机、风险')}
      ${it('#/design', 'pen-tool', '产品设计一页纸', '痛点、原则、架构、流程')}
      ${it(GH + 'PRD.md', 'github', 'GitHub 文档：PRD.md', '仓库里的 Markdown 版本', true)}
      ${it(GH + '%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md', 'github', 'GitHub 文档：操作手册.md', '仓库里的 Markdown 版本', true)}
    </div>
    <p class="center small muted" style="margin:16px 0">顺路帮 v1.0 · 图标 Lucide · 配色 小红书「校园美学配色」</p>`;
}

function Design() {
  topbar('产品设计一页纸', '#/settings');
  view.innerHTML = `<div class="doc">
  <div class="card"><h2>一句话定位</h2><p>只在本校同学之间流通的跑腿互助平台：<b>发单有人接、跑腿有钱拿、做得好有信用</b>。核心不是“撮合”，而是把陌生同学之间的<b>信任</b>做成可计算、可积累的东西。</p></div>
  <div class="card"><h2>1. 用户与痛点</h2><div class="pain">
    <div class="p"><b>发单方：想找人，但不敢、不会、找不到</b>在 QQ 群、表白墙喊“谁顺路带个快递”，消息很快被刷掉；把取件码交给陌生人不放心；不知道给多少钱合适。</div>
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
    <div class="layer l1"><b>任务层</b><div class="mods"><span>四类任务模板</span><span>建议赏金</span><span>任务大厅</span><span>顺路匹配</span><span>再来一单</span></div></div>
    <div class="layer l2"><b>交易层</b><div class="mods"><span>赏金托管</span><span>垫付返还</span><span>加价</span><span>交付码核验</span><span>无接触交付</span><span>自动确认</span></div></div>
    <div class="layer l3"><b>信用层</b><div class="mods"><span>信用分 0–200</span><span>五级等级</span><span>权益门槛</span><span>双盲互评</span><span>跑腿榜</span></div></div>
    <div class="layer l4"><b>安全与运营层</b><div class="mods"><span>校园实名</span><span>隐私后置</span><span>违规词拦截</span><span>举报</span><span>申诉仲裁</span><span>运营后台</span></div></div>
  </div></div>
  <div class="card"><h2>4. 核心流程</h2><div class="flow">
    <span>发布任务</span><i>→</i><span>赏金托管</span><i>→</i><span>大厅 / 顺路推荐</span><i>→</i><span>接单（信用校验）</span><i>→</i><span>解锁取件码</span><i>→</i><span>取件 / 购买</span><i>→</i><span>报交付码 或 拍照放置</span><i>→</i><span>结算赏金 + 垫付</span><i>→</i><span>双盲互评</span><i>→</i><span>信用变化</span>
  </div><p class="mt12 muted">异常分支：截止前无人接单自动过期退款；接单后放弃（信用 -3、任务回大厅）；超时完成（-2）；无接触交付 24 小时未确认自动完成；有争议走申诉，由运营仲裁。</p></div>
  <p class="muted small center" style="margin:16px 0">完整需求见 <a href="#/prd">PRD</a>，使用方法见 <a href="#/guide">操作手册</a>。</p>
  </div>`;
}

function PRD() {
  topbar('PRD v1.0', '#/settings');
  view.innerHTML = `<div class="doc prd">
  <div class="card"><h2>顺路帮 · 校园跑腿互助平台 产品需求文档</h2>
    <table class="rules"><tr><td>版本</td><td>v1.0（MVP）</td></tr><tr><td>状态</td><td>原型已上线，待校内试点验证</td></tr><tr><td>形态</td><td>H5，手机版与电脑版两套布局（后续微信小程序）</td></tr><tr><td>范围</td><td>单所高校、单校区</td></tr></table>
    <p class="mt8"><b>目录</b>：1 背景与问题 · 2 目标与指标 · 3 用户与场景 · 4 范围 · 5 功能需求 · 6 业务规则 · 7 订单状态机 · 8 非功能需求 · 9 风险与对策 · 10 里程碑</p></div>

  <div class="card"><h2>1. 背景与问题</h2>
    <p>校园里每天都有大量“顺手就能帮”的小需求：驿站取快递、食堂带饭、超市代买、图书馆占座、送文件。目前这些需求主要靠 QQ 群、表白墙、朋友圈临时喊人解决，存在三个问题：</p>
    <ul><li><b>找不到人</b>：消息被刷屏淹没，没有按地点、时间组织需求，跑腿方也看不出哪些单顺路。</li>
    <li><b>不敢托付</b>：要把取件码、手机号交给陌生人；代买要别人先垫钱；交付后“说没收到”无法举证。</li>
    <li><b>没有约束</b>：放鸽子、拖欠、违规需求（代课代考、代签到）没有任何成本。</li></ul>
    <p><b>核心判断</b>：这件事的瓶颈不是“信息撮合”，而是<b>陌生同学之间的信任</b>。产品要把信任拆成三件可执行的事：身份可信（校内实名）、资金可信（托管）、履约可信（交付码 + 信用）。</p>
    <div class="alert warn small mt8">待验证假设（试点前用问卷 + 访谈验证）：① 校内有跑腿需求的学生中，过半曾因“不放心陌生人”而放弃找人帮忙；② 跑腿方愿意为 3–5 元赏金顺路带单；③ 交付码不会明显增加使用负担。</div>
  </div>

  <div class="card"><h2>2. 目标与指标</h2>
    <table class="rules"><tr><th>层级</th><th>指标</th><th>试点目标（第 1 个月）</th></tr>
    <tr><td>北极星</td><td>30 分钟接单率</td><td>≥ 70%</td></tr>
    <tr><td>供需</td><td>周活跃跑腿者 / 周活跃发单者</td><td>≥ 0.4</td></tr>
    <tr><td>履约</td><td>履约完成率（完成 / 已接单）</td><td>≥ 95%</td></tr>
    <tr><td>信任</td><td>纠纷率（申诉 / 已接单）</td><td>≤ 2%</td></tr>
    <tr><td>留存</td><td>发单 7 日复购率</td><td>≥ 35%</td></tr>
    <tr><td>安全</td><td>违规任务曝光数</td><td>0（发布即拦截或 2 小时内下架）</td></tr></table>
    <p class="hint">目标值是试点前的设定值，以试点数据回校。</p></div>

  <div class="card"><h2>3. 用户与场景</h2>
    <table class="rules"><tr><th>角色</th><th>典型画像</th><th>核心诉求</th></tr>
    <tr><td>发单方</td><td>课多、宿舍离驿站远的低年级学生；赶 DDL 不想出门的高年级学生</td><td>快速有人接、东西安全、价格合理</td></tr>
    <tr><td>跑腿方</td><td>每天固定路线往返教学楼 / 食堂的学生；想赚零花钱的学生</td><td>顺路、不亏钱、不惹纠纷</td></tr>
    <tr><td>运营 / 学校</td><td>平台运营、学生会权益部</td><td>纠纷可仲裁、违规可拦截、数据可看</td></tr></table>
    <p class="mt8"><b>关键用户故事</b></p><ul>
    <li>作为发单方，我想在 1 分钟内发完一个取快递任务，并且只让接单的人看到取件码。</li>
    <li>作为跑腿方，我从宿舍去图书馆时，想看到这条路上顺手能带的单。</li>
    <li>作为跑腿方，代买时我先垫了钱，希望完成后一定能拿回来。</li>
    <li>作为发单方，东西放门口却没找到时，我希望有人能主持公道。</li>
    <li>作为运营，我需要一个地方集中处理举报和申诉，并看到平台健康度。</li></ul></div>

  <div class="card"><h2>4. 范围</h2>
    <p><b>MVP 做（本原型已实现）</b></p>
    <table class="rules"><tr><th>模块</th><th>功能</th><th>优先级</th></tr>
    <tr><td>账号</td><td>校园实名认证（学号 + 校园邮箱 + 学生证）</td><td>P0</td></tr>
    <tr><td>任务</td><td>四类任务发布、建议赏金、违规词拦截</td><td>P0</td></tr>
    <tr><td>大厅</td><td>分类筛选、搜索、五种排序、顺路模式</td><td>P0</td></tr>
    <tr><td>交易</td><td>赏金托管、垫付返还、交付码、无接触交付、自动确认</td><td>P0</td></tr>
    <tr><td>信用</td><td>信用分、等级、权益门槛、双盲互评、信用明细</td><td>P0</td></tr>
    <tr><td>沟通</td><td>订单内消息、催单、消息通知中心</td><td>P1</td></tr>
    <tr><td>治理</td><td>举报、申诉、运营后台仲裁、数据看板</td><td>P1</td></tr>
    <tr><td>增长</td><td>加价、再来一单、本周跑腿榜</td><td>P2</td></tr></table>
    <p class="mt8"><b>MVP 不做</b>：真实支付与分账（先用模拟钱包验证流程）、实时定位与地图、外卖平台对接、跨校区 / 跨校、抽成。理由：先验证“信任机制能否让陌生同学愿意互相托付”，再投入支付与地图这类重成本能力。</p></div>

  <div class="card"><h2>5. 功能需求</h2>
    <h4>5.1 校园实名认证</h4><ul><li>输入学号（8–12 位数字）、校园邮箱（收验证码）、上传学生证；通过后信用 +20。</li><li>未认证用户可以浏览大厅，但不能发布或接单。</li></ul>
    <h4>5.2 发布任务</h4><ul>
    <li>类型：代取快递 / 代买物品 / 代占座位 / 其他互助；选类型后自动带出默认地点和对应字段（快递有取件码，代买有垫付金额，占座只有一个地点并提示占座规则）。</li>
    <li>建议赏金 = 类型基础价（3/4/3/5 元）+ 每 400 米 1 元 + 大件 3 元 + 30 分钟内 2 元（1 小时内 1 元）+ 垫付超 100 元 2 元。用户没改过赏金时，改地点、时间等字段会自动刷新建议值；手动改过后不再覆盖，并提供“使用建议价”。</li>
    <li>标题和备注实时检测违规词，命中即提示并禁止发布。</li>
    <li>发布时从余额冻结赏金；余额不足不能发布。取件地点与送达地点不能相同。</li></ul>
    <h4>5.3 任务大厅</h4><ul>
    <li>只展示待接单任务；卡片显示类型、标签（大件 / 垫付 / 顺路）、路线、距离、截止时间、发布者信用。</li>
    <li>排序：智能（顺路分优先，其次截止时间）、最新、赏金最高、离我最近、即将截止。</li>
    <li>顺路模式：选择“我正要去 X”，筛出起点距 X ≤300 米的任务，终点靠近我宿舍或 X 的加分并标“顺路”。</li></ul>
    <h4>5.4 接单与履约</h4><ul>
    <li>接单前校验：已认证、信用 ≥60、大额垫付单（>50 元）信用 ≥100、同时进行中 ≤3 单、不能接自己的单。</li>
    <li>接单后解锁取件码和联系方式（虚拟号）。跑腿方可更新“已取件”，可放弃（信用 -3，任务回大厅）。</li>
    <li>当面交付：发布方详情页显示 4 位交付码，跑腿方输入正确即完成。</li>
    <li>无接触交付：填写放置位置并拍照，状态变为待确认；发布方确认收货或发起申诉，24 小时无操作自动确认。</li>
    <li>完成时结算：跑腿方收到赏金 + 垫付款，发布方支付垫付款。</li></ul>
    <h4>5.5 评价与信用</h4><ul>
    <li>双方互评 1–5 星 + 标签 + 文字。双盲：双方都提交后或完成 72 小时后才公开，避免报复性评价。</li>
    <li>信用变化见第 6 节；个人中心展示信用分、等级、权益、明细。</li></ul>
    <h4>5.6 举报、申诉与运营后台</h4><ul>
    <li>任何人可举报待接单任务；发布方可对待确认订单发起申诉，申诉期间暂停自动确认与结算。</li>
    <li>运营后台：数据看板（任务数、接单率、平均接单用时、履约率、纠纷率、平均信用）、待处理队列、用户信用表、违规词库。</li>
    <li>举报处理：核实则下架任务、退回赏金、发布者信用 -20；或驳回。申诉处理：支持发布者则退款、跑腿者 -20；支持跑腿者则放款、发布者 -5。</li></ul>
    <h4>5.7 通知</h4><ul><li>接单、取件、催单、放弃、完成、过期、超时、处理结果都会通知相关方；右上角铃铛显示未读数。</li></ul></div>

  <div class="card"><h2>6. 业务规则</h2>
    <table class="rules"><tr><th>规则</th><th>取值</th></tr>
    <tr><td>信用分范围 / 初始值</td><td>0–200 / 100</td></tr>
    <tr><td>等级</td><td>受限 &lt;60 · 新手 60 · 可靠 100 · 优秀 140 · 金牌 180</td></tr>
    <tr><td>加分</td><td>实名 +20；按时完成 +2；发布者完成交易 +1；获 4–5 星 +1</td></tr>
    <tr><td>扣分</td><td>超时完成 -2；放弃 -3；获 1–2 星 -3；无理申诉 -5；违约或违规 -20</td></tr>
    <tr><td>接单门槛</td><td>信用 ≥60；垫付 &gt;50 元需 ≥100；同时进行 ≤3 单</td></tr>
    <tr><td>垫付上限</td><td>500 元</td></tr>
    <tr><td>无人接单</td><td>到截止时间自动过期，赏金全额退回</td></tr>
    <tr><td>自动确认</td><td>无接触交付后 24 小时</td></tr>
    <tr><td>催单频率</td><td>同一订单 5 分钟 1 次</td></tr>
    <tr><td>评价公开</td><td>双方都评价，或完成后 72 小时</td></tr></table></div>

  <div class="card"><h2>7. 订单状态机</h2>
    <table class="rules"><tr><th>当前状态</th><th>触发</th><th>下一状态</th></tr>
    <tr><td>待接单</td><td>跑腿方接单</td><td>进行中</td></tr>
    <tr><td>待接单</td><td>发布方取消 / 到期无人接</td><td>已取消 / 已过期（退款）</td></tr>
    <tr><td>待接单</td><td>举报核实</td><td>已下架（退款）</td></tr>
    <tr><td>进行中</td><td>输入正确交付码</td><td>已完成（结算）</td></tr>
    <tr><td>进行中</td><td>无接触交付</td><td>待确认</td></tr>
    <tr><td>进行中</td><td>跑腿方放弃</td><td>待接单</td></tr>
    <tr><td>待确认</td><td>发布方确认 / 24 小时自动</td><td>已完成（结算）</td></tr>
    <tr><td>待确认</td><td>发起申诉</td><td>待确认（申诉中，冻结）</td></tr>
    <tr><td>申诉中</td><td>运营支持发布者 / 跑腿者</td><td>已取消（退款）/ 已完成（结算）</td></tr></table></div>

  <div class="card"><h2>8. 非功能需求</h2><ul>
    <li><b>隐私</b>：取件码、手机号仅接单双方可见，手机号走虚拟号；实名信息不对外展示。</li>
    <li><b>合规</b>：违规词库可由运营维护；占座任务限 1 个座位、30 分钟内到场。</li>
    <li><b>资金</b>：正式版接入持牌支付机构的担保交易，平台不直接持有资金。</li>
    <li><b>多端适配</b>：手机版用底部标签栏、单栏卡片；电脑版用顶部导航、任务双列 + 侧栏；默认按窗口宽度自动切换，用户可在设置中固定。</li>
    <li><b>性能</b>：大厅首屏 1 秒内可交互；弱网下操作可重试，不重复扣款。</li>
    <li><b>可追溯</b>：每个订单保留进度记录与站内消息，作为申诉依据。</li></ul></div>

  <div class="card"><h2>9. 风险与对策</h2>
    <table class="rules"><tr><th>风险</th><th>对策</th></tr>
    <tr><td>冷启动供给不足</td><td>先在 2–3 栋宿舍楼试点；招募固定路线的“楼栋跑腿员”；首周跑腿补贴</td></tr>
    <tr><td>大额垫付跑单 / 诈骗</td><td>大额单信用门槛；垫付上限；举报快速下架；要求平台内沟通</td></tr>
    <tr><td>学校政策风险</td><td>主动与学生处、驿站沟通；不承接违规任务；占座遵守场馆规定</td></tr>
    <tr><td>刷信用</td><td>同一对用户互相交易的信用增益设上限；异常频次进入人工复核</td></tr>
    <tr><td>交付码体验负担</td><td>提供无接触交付 + 自动确认作为备选；试点中观察使用比例</td></tr></table></div>

  <div class="card"><h2>10. 里程碑</h2>
    <table class="rules"><tr><th>阶段</th><th>内容</th><th>退出标准</th></tr>
    <tr><td>M0 原型</td><td>本可交互原型 + 用户访谈 10 人</td><td>假设①②得到初步支持</td></tr>
    <tr><td>M1 试点</td><td>小程序版，2–3 栋楼，模拟钱包换真实担保支付</td><td>30 分钟接单率 ≥70%，纠纷率 ≤2%</td></tr>
    <tr><td>M2 全校</td><td>学校统一身份认证、驿站取件码导入、楼栋跑腿员体系</td><td>周活跃跑腿者 ≥300</td></tr>
    <tr><td>M3 扩展</td><td>多校区、信用与校内服务互通</td><td>单校模型可复制</td></tr></table></div>
  </div>`;
}

function Guide() {
  topbar('操作手册', '#/settings');
  view.innerHTML = `<div class="doc">
  <div class="card"><h2>${ic('clock', 'h')}3 分钟快速体验</h2>
    <p class="muted small mb8">按顺序点，就能走完“发单 → 接单 → 交付 → 评价 → 仲裁”的完整闭环。</p>
    <ol class="guide-steps">
      <li><b>发一个任务</b>：底部点「发布」→ 选「代买物品」→ 填描述（试试输入“代签到”，会被拦截）→ 改送达地点，看建议赏金变化 → 发布。</li>
      <li><b>换身份接单</b>：点右上角头像（或「我的 → 设置」）→ 在「演示身份」里选<b>陈同学</b> → 回大厅找到刚才的任务 → 接单。接单后能看到联系方式。</li>
      <li><b>更新进度</b>：点「已取件/已买到」，进度条前进；可以在订单消息里留言。</li>
      <li><b>拿交付码</b>：切回<b>林同学</b>，打开这个任务，能看到 4 位交付码。</li>
      <li><b>完成交付</b>：再切到<b>陈同学</b>，点「当面交付」输入交付码 → 订单完成，赏金和垫付款到账，信用 +2。</li>
      <li><b>互相评价</b>：两边各评价一次。只有一方评价时，对方看不到内容（双盲）。</li>
      <li><b>处理纠纷</b>：「我的 → 设置 → 运营后台」，处理预置的一条举报和一条申诉，看信用和资金怎么变。</li>
    </ol>
    <a class="btn block mt12" href="#/post">从第 1 步开始 →</a></div>

  <div class="card"><h2>${ic('users', 'h')}演示身份</h2><table class="rules"><tr><th>身份</th><th>特点</th><th>适合体验</th></tr>
    <tr><td>林同学</td><td>已认证，信用 128（可靠）</td><td>默认身份，发单与接单都能做</td></tr>
    <tr><td>陈同学</td><td>已认证，信用 156（优秀）</td><td>作为另一端接单、接大额垫付单</td></tr>
    <tr><td>王同学</td><td>未认证</td><td>看未认证时的限制，并完成实名认证（+20）</td></tr>
    <tr><td>赵同学</td><td>信用 58（受限）</td><td>看低信用不能接单的提示</td></tr></table></div>

  <div class="card"><h2>${ic('package', 'h')}发布任务</h2><ul>
    <li>先选类型，不同类型的字段不一样：快递要填取件码，代买要填垫付金额，占座只选一个地点。</li>
    <li>赏金默认用建议价，会随距离、大小、时间自动变化；用 −/＋ 手动改过后就不再自动变，可点「使用」恢复建议价。</li>
    <li>取件码和联系方式只有接单的人能看到，可以放心填。</li>
    <li>发布后赏金会从余额里冻结。余额不够时，到「我的」点「演示充值」。</li></ul></div>

  <div class="card"><h2>${ic('footprints', 'h')}接单与交付</h2><ul>
    <li>大厅顶部选「我正要去 …」开启顺路模式，只看顺路的单。</li>
    <li>接单有门槛：要实名认证、信用 ≥60；垫付超过 50 元的单要信用 ≥100；同时最多 3 单。</li>
    <li><b>当面交付</b>：向发布者要交付码，输入即完成，最稳妥。</li>
    <li><b>无接触交付</b>：放到约定位置并拍照，对方确认或 24 小时后自动完成。</li>
    <li>中途放弃会扣 3 分信用，任务会回到大厅。</li></ul></div>

  <div class="card"><h2>${ic('clipboard-list', 'h')}我的订单</h2><ul>
    <li>分「我接的单」和「我发布的」两栏，需要你处理的订单排在前面，并提示下一步做什么。</li>
    <li>发布方可以「催一下」（5 分钟一次）、「加价」、「取消」；过期或取消的任务可以「再来一单」一键重发。</li>
    <li>东西有问题时，在待确认状态点「有问题，申诉」，结算会暂停，交给运营处理。</li></ul></div>

  <div class="card"><h2>${ic('user', 'h')}个人中心与设置</h2><ul>
    <li>查看信用分、等级、能享受的权益、每次加减分的原因。</li>
    <li>「设置」里可以切换手机版 / 电脑版、换主题色、切换演示身份、重置演示数据、进入运营后台，也能找到操作手册和 PRD。</li></ul></div>

  <div class="card"><h2>${ic('shield-check', 'h')}运营后台</h2><ul>
    <li>上方看平台数据：任务总数、接单率、平均接单用时、履约率、纠纷率、平均信用。</li>
    <li>举报：「核实，下架任务」会下架并扣发布者 20 分；「驳回」不做处理。</li>
    <li>申诉：可展开进度记录判断；「支持发布者」退款并扣跑腿者 20 分，「支持跑腿者」放款并扣发布者 5 分。</li></ul></div>

  <div class="card"><h2>${ic('circle-help', 'h')}常见问题</h2>
    <p><b>数据存在哪？</b>只存在你自己的浏览器里，别人看不到；换浏览器或清缓存会回到初始数据。</p>
    <p class="mt8"><b>点乱了怎么办？</b>「我的 → 设置 → 演示身份」下方的「重置演示数据」。</p>
    <p class="mt8"><b>隔几天再打开，任务都过期了吗？</b>不会。演示数据的时间在你离开期间是暂停的，回来时任务的剩余时间和离开时一样。</p>
    <p class="mt8"><b>钱是真的吗？</b>不是，钱包和支付都是模拟的，用来演示托管和结算流程。</p></div>
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
    readDraft(form);
    if (e.target.name === 'reward') postDraft.autoReward = postDraft.reward === suggest(postDraft);
    else if (postDraft.autoReward) postDraft.reward = suggest(postDraft);
    if (['from', 'to', 'deadline', 'size', 'advance', 'reward'].includes(e.target.name)) Post();
  }
});
let qTimer;
document.addEventListener('input', e => {
  if (e.target.dataset.input === 'q') {
    clearTimeout(qTimer); const v = e.target.value;
    qTimer = setTimeout(() => { hall.q = v.trim(); Hall(); const i = document.querySelector('[data-input=q]'); i.focus(); i.setSelectionRange(v.length, v.length); }, 250);
  }
  const form = e.target.closest('#postForm');
  if (form) { readDraft(form); $('#banned').innerHTML = bannedAlert(postDraft.title + postDraft.note); }
});
document.addEventListener('submit', e => {
  const form = e.target, k = form.dataset.submit;
  if (!k) return;
  e.preventDefault();
  const f = new FormData(form), t = form.dataset.id && task(form.dataset.id);
  if (k === 'msg') {
    const x = f.get('x').trim(); if (!x) return;
    t.msgs.push({ u: S.me, x, t: now() });
    notify(S.me === t.posterId ? t.runnerId : t.posterId, `${me().name}：${x.slice(0, 30)}`, t.id); save(); route();
  }
  if (k === 'handover') {
    if (f.get('code') !== t.deliverCode) return toast('交付码不正确，请向发布者核对');
    closeModal(); finish(t, '当面核验交付码'); save(); toast(`交付成功！¥${money(t.reward + t.advance)} 已到账`); route();
  }
  if (k === 'leave') {
    closeModal(); t.status = 'delivered'; t.picked = true; t.deliveredAt = now();
    push(t, `无接触交付：放在${f.get('where')}，已拍照留证`);
    notify(t.posterId, `${short(t)} 已放在${f.get('where')}，请确认收货（24 小时后自动确认）`, t.id);
    save(); toast('已提交，等待对方确认'); route();
  }
  if (k === 'dispute') {
    t.disputed = true; push(t, `发布者发起申诉（${f.get('reason')}），赏金暂停结算`);
    S.reports.unshift({ id: uid(), kind: '申诉', taskId: t.id, by: S.me, reason: f.get('reason'), text: f.get('text').trim(), t: now(), status: 'pending' });
    notify(t.runnerId, `${short(t)} 被发起申诉，客服会联系你核实`, t.id);
    closeModal(); save(); toast('申诉已提交，可在运营后台查看处理'); route();
  }
  if (k === 'report') {
    if (S.reports.some(r => r.taskId === t.id && r.by === S.me && r.status === 'pending')) { closeModal(); return toast('你已经举报过这个任务，正在处理中'); }
    S.reports.unshift({ id: uid(), kind: '举报', taskId: t.id, by: S.me, reason: f.get('reason'), text: f.get('text').trim(), t: now(), status: 'pending' });
    closeModal(); save(); toast('举报已提交，运营会在 2 小时内处理');
  }
  if (k === 'review') {
    const stars = +f.get('stars'), isP = t.posterId === S.me, other = isP ? t.runnerId : t.posterId;
    t.reviews[isP ? 'poster' : 'runner'] = { stars, tags: f.getAll('tag'), text: f.get('text').trim(), t: now() };
    if (stars >= 4) credit(other, +1, '获得好评'); else if (stars <= 2) credit(other, -3, '收到差评');
    notify(other, `${me().name} 评价了${short(t)}，${t.reviews.poster && t.reviews.runner ? '双方评价已公开' : '你评价后即可查看'}`, t.id);
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
    if (u.balance < d.reward) return toast('余额不足以托管赏金，请先到「我的」充值');
    u.balance -= d.reward;
    const nt = {
      id: uid(), type: d.type, title: d.title.trim(), from: d.from, to: d.type === 'seat' ? d.from : d.to, reward: d.reward, advance: d.type === 'buy' ? d.advance : 0,
      size: d.type === 'express' || d.type === 'buy' ? d.size : '小件', note: d.note.trim(), posterId: u.id, runnerId: null, status: 'open', createdAt: now(), deadline: now() + +d.deadline * MIN,
      priv: { code: d.type === 'express' ? d.code.trim() : '', phone: d.phone.trim() }, deliverCode: String(1000 + Math.floor(Math.random() * 9000)), timeline: [], msgs: [], reviews: {}, urged: 0,
    };
    push(nt, `发布任务，赏金 ¥${money(nt.reward)} 已托管`);
    S.tasks.unshift(nt); postDraft = null; save(); toast('发布成功！附近的同学会看到'); go('#/task/' + nt.id);
  }
});

route();
})();
