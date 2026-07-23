// ============================================================
// 见势 · A股热点雷达 — 前端应用
// ============================================================

// ---- Token 检查 ----
const AUTH_TOKEN = localStorage.getItem('jianshi_token');
if (!AUTH_TOKEN) {
  window.location.href = '/login';
}

// ---- 带鉴权的 fetch 封装 ----
async function apiFetch(url, options = {}) {
  const headers = {
    ...options.headers,
    'Authorization': 'Bearer ' + AUTH_TOKEN
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem('jianshi_token');
    localStorage.removeItem('jianshi_user');
    window.location.href = '/login';
  }
  return response;
}

// ---- 用户信息 ----
const currentUser = JSON.parse(localStorage.getItem('jianshi_user') || '{}');
if (currentUser.phone) {
  document.getElementById('sidebarPhone').textContent = currentUser.phone;
  document.getElementById('sidebarUser').style.display = 'block';
  document.getElementById('logoutButton').style.display = 'block';
  document.getElementById('headerAvatar').textContent = currentUser.phone.slice(-2) || '研';
}

// ---- 退出登录 ----
document.getElementById('logoutButton').addEventListener('click', () => {
  localStorage.removeItem('jianshi_token');
  localStorage.removeItem('jianshi_user');
  window.location.href = '/login';
});

// ---- 从服务端加载用户设置 ----
async function loadUserSettings() {
  try {
    const r = await apiFetch('/api/auth/me');
    if (!r.ok) return;
    const data = await r.json();
    if (data.user && data.user.settings && Object.keys(data.user.settings).length > 0) {
      const saved = data.user.settings;
      controls = {
        ...defaultControls,
        ...saved,
        monitorRules: { ...defaultControls.monitorRules, ...(saved.monitorRules || {}) },
        risk: { ...defaultControls.risk, ...(saved.risk || {}) },
        pattern: { ...defaultControls.pattern, ...(saved.pattern || {}) },
        recentAlerts: Array.isArray(saved.recentAlerts) ? saved.recentAlerts.slice(0, 20) : []
      };
    }
  } catch {
    // 加载失败则使用本地设置
  }
}

// ---- 保存用户设置到服务端 ----
async function saveUserSettings() {
  try {
    await apiFetch('/api/auth/me/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: controls })
    });
  } catch {
    // 静默失败
  }
  // 同时存本地作为备份
  localStorage.setItem(storageKey, JSON.stringify(controls));
}

// ---- SVG 图标 ----
const iconPaths = {
  layout: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10M12 7v10"/>',
  telescope: '<path d="m6 11 7-7 3 3-7 7-3-3Z"/><path d="m5 12 4 4M14 8l3 3M9 16l-4 5M12 16l3 5"/>',
  report: '<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6M9 9h2"/>',
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  shield: '<path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7 7 4.2l.06.06A1.7 1.7 0 0 0 8.94 4.6 1.7 1.7 0 0 0 10 3.09V3h4v.09a1.7 1.7 0 0 0 1.06 1.51 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.91 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 14h8"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6L4 8M5.5 15A7 7 0 0 0 18 18l2-2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  heat: '<path d="M12 22c4 0 7-3 7-7 0-5-4-7-3-12-4 2-7 6-7 10-1-2-1-3-1-5-2 2-3 4-3 7 0 4 3 7 7 7Z"/><path d="M10 18c0-2 2-3 2-6 2 2 3 3 3 5a3 3 0 0 1-5 1Z"/>',
  money: '<path d="M12 2v20M17 6.5C17 5 15 4 12 4S7 5.2 7 7s2 3 5 3 5 1.2 5 3-2 3-5 3-5-1-5-2.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bolt: '<path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>',
  flag: '<path d="M5 22V4M5 4h12l-2 4 2 4H5"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6M12 3v2M3 12h2"/>',
  news: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>'
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.activity}</svg>`;
}

document.querySelectorAll('[data-icon]').forEach(node => {
  node.innerHTML = icon(node.dataset.icon);
});

// ---- 全局状态 ----
const content = document.getElementById('appContent');
const pageTitle = document.querySelector('.page-title h1');
const toastRegion = document.getElementById('toastRegion');
const controlDrawer = document.getElementById('controlDrawer');
const pageBackdrop = document.getElementById('pageBackdrop');
const notificationButton = document.getElementById('notificationButton');
const mobileMenuButton = document.getElementById('mobileMenuButton');
const storageKey = 'jianshi-control-v1';
let state = null;
let stream = null;
let activePage = 'overview';
let uploadedPattern = null;

const defaultControls = {
  liveUpdates: true,
  toastNotifications: true,
  minAlertLevel: 'low',
  compactMode: false,
  candidateFilter: 'all',
  financialCode: null,
  sectorStage: 'all',
  unreadAlerts: 0,
  recentAlerts: [],
  monitorRules: { volume: true, speed: true, turnover: true, sector: true, retreat: true },
  risk: { position: 10, sector: 30, stopLoss: 6, dailyLoss: 2 },
  pattern: { window: 60, normalize: true, volume: true, similarity: 75 }
};

function readControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return {
      ...defaultControls,
      ...saved,
      monitorRules: { ...defaultControls.monitorRules, ...(saved.monitorRules || {}) },
      risk: { ...defaultControls.risk, ...(saved.risk || {}) },
      pattern: { ...defaultControls.pattern, ...(saved.pattern || {}) },
      recentAlerts: Array.isArray(saved.recentAlerts) ? saved.recentAlerts.slice(0, 20) : []
    };
  } catch {
    return structuredClone(defaultControls);
  }
}

let controls = readControls();

function saveControls() {
  localStorage.setItem(storageKey, JSON.stringify(controls));
  saveUserSettings(); // 异步同步到服务端
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[c]);
}

const pageMeta = {
  overview: ['市场总览', 'layout', '从热点到交易触发的全流程决策台', ['热点发现', '图形与催化', '财务验证', '异动确认', '风险控制']],
  sectors: ['热点板块', 'layers', '板块强度、持续性、催化和阶段迁移将在这里集中呈现', ['潜伏', '启动', '发酵', '高潮', '分歧', '退潮']],
  patterns: ['形态搜索', 'scan', '上传样例K线后，AI将识别形态并扫描全市场相似标的', ['样例导入', 'AI特征提取', '全市场扫描', '相似度排序']],
  stocks: ['候选个股', 'telescope', '汇总板块、形态、催化、财务与异动得分，形成观察池', ['逻辑入池', '综合评分', '盘中确认', '信号失效']],
  financials: ['财报分析', 'report', '验证持续盈利、扣非利润、现金流与潜在财务风险', ['盈利趋势', '增长质量', '现金流', '异常排查', 'AI解读']],
  monitor: ['盘中监控', 'activity', '监测涨速、换手加速度、成交量暴增和板块联动', ['全市场分钟扫描', '候选池Tick监测', '分级告警']],
  risk: ['风险控制', 'shield', '定义仓位、止损止盈、板块退潮和禁止交易条件', ['单笔风险', '总仓位', '信号失效', '最大回撤']],
  review: ['复盘回测', 'history', '检验每类信号触发后的真实表现，避免只看成功案例', ['历史回放', '样本外验证', '胜率盈亏比', '参数稳定性']]
};

const severityRank = { low: 0, medium: 1, high: 2, critical: 3 };

function alertIsVisible(alert) {
  return (severityRank[alert.level] ?? 0) >= (severityRank[controls.minAlertLevel] ?? 0);
}

function sparkline(values, positive = true) {
  const width = 60, height = 22, pad = 2;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((v, i) => `${pad + i * (width - pad * 2) / (values.length - 1)},${height - pad - (v - min) * (height - pad * 2) / range}`).join(' ');
  const color = positive ? '#25d4c4' : '#65758a';
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
}

function pulseChart(values) {
  if (!values || values.length === 0) {
    return `<div style="height:130px;display:grid;place-items:center;color:#56657a;font-size:11px;">分时数据需盘中接入实时行情接口</div>`;
  }
  const width = 520, height = 130, px = 4, py = 8;
  const dataMin = Math.min(...values.map(d => d.value));
  const dataMax = Math.max(...values.map(d => d.value));
  const range = dataMax - dataMin || 1;
  const min = dataMin - range * 0.1;
  const max = dataMax + range * 0.1;
  const points = values.map((d, i) => ({
    x: px + i * (width - px * 2) / (values.length - 1),
    y: height - py - (d.value - min) * (height - py * 2) / (max - min)
  }));
  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${points[0].x},${height} ${line} ${points.at(-1).x},${height}`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <defs><linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25d4c4" stop-opacity=".24"/><stop offset="1" stop-color="#25d4c4" stop-opacity="0"/></linearGradient></defs>
    <line class="pulse-grid" x1="0" y1="28" x2="520" y2="28"/><line class="pulse-grid" x1="0" y1="69" x2="520" y2="69"/><line class="pulse-grid" x1="0" y1="110" x2="520" y2="110"/>
    <polygon class="pulse-area" points="${area}"/><polyline class="pulse-line" points="${line}"/>
    <circle cx="${points.at(-1).x}" cy="${points.at(-1).y}" r="3" fill="#08111f" stroke="#70f3e7" stroke-width="2"/>
  </svg>`;
}

function metricCard(label, value, unit, sub, iconName) {
  return `<article class="metric-card"><div class="metric-label">${icon(iconName)}${label}</div><div class="metric-value">${value}<small>${unit || ''}</small></div><div class="metric-sub">${sub}</div></article>`;
}

// ---- 页面渲染函数 ----
function renderOverview(data) {
  const { market, sectors, candidates, alerts, marketPulse, catalystFeed, tradingStatus } = data;
  const circumference = 2 * Math.PI * 27;
  const offset = circumference * (1 - market.temperature / 100);
  const offHoursBanner = tradingStatus && !tradingStatus.isTradingTime
    ? `<div class="off-hours-banner"><span>📅</span><div><strong>${tradingStatus.label}</strong><p>A股交易时段为工作日 9:30-15:00。当前展示最近交易日收盘数据。</p></div></div>`
    : '';
  content.innerHTML = `${offHoursBanner}
    <section class="hero-strip">
      <article class="metric-card temperature">
        <div><div class="metric-label">${icon('heat')}市场温度</div><div class="metric-value">偏热</div><div class="metric-sub">热点扩散良好，留意高位分歧</div></div>
        <div class="temp-gauge"><svg viewBox="0 0 66 66"><circle class="track" cx="33" cy="33" r="27"/><circle class="progress" cx="33" cy="33" r="27" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/></svg><div><strong id="temperatureValue">${market.temperature}</strong><small>/100</small></div></div>
      </article>
      ${metricCard('全市场成交额', market.turnover.toLocaleString(), '亿', `较昨日同期 <span class="up">+${market.turnoverDelta}%</span>`, 'money')}
      ${metricCard('上涨 / 下跌', `${market.up} / ${market.down}`, '', `平盘 ${market.flat} 家`, 'users')}
      ${metricCard('涨停 / 跌停', `${market.limitUp} / ${market.limitDown}`, '', `最高连板 ${market.maxBoard} 板`, 'bolt')}
      ${metricCard('市场风险', market.risk, '', '量能尚可 · 高位分化', 'shield')}
    </section>
    <div class="dashboard-grid">
      <div class="main-column">
        <section class="panel sectors-panel">
          <div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('layers')}</span><div><h2>热点板块雷达</h2><p>强度 · 持续性 · 催化 · 阶段</p></div></div><button class="text-button" data-jump="sectors">查看全部 →</button></div>
          <table class="sector-table"><thead><tr><th style="width:25%">排名 / 板块</th><th style="width:15%">热度</th><th>涨跌幅</th><th>成交额</th><th>上涨覆盖</th><th>阶段</th><th>趋势</th></tr></thead><tbody>
            ${sectors.map((s, i) => `<tr title="${s.catalyst}"><td><span class="sector-rank ${i < 3 ? 'top' : ''}">${String(i + 1).padStart(2, '0')}</span><span class="sector-name">${s.name}</span></td><td><div class="score-cell"><strong>${s.score}</strong><span class="score-bar"><i style="width:${s.score}%"></i></span></div></td><td class="${s.change >= 0 ? 'change-up' : 'change-down'}">${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%</td><td>${s.turnover.toFixed(1)}亿</td><td>${s.breadth}%</td><td><span class="stage ${s.stageTone}">${s.stage}</span></td><td>${sparkline(s.spark, s.stage !== '退潮')}</td></tr>`).join('')}
          </tbody></table>
        </section>
        <section class="panel candidates-panel">
          <div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('telescope')}</span><div><h2>重点候选池</h2><p>图形 + 催化 + 财务 + 盘中确认</p></div></div><button class="text-button" data-jump="stocks">进入候选池 →</button></div>
          <div class="candidate-list">${candidates.map(stock => `<article class="candidate-card" data-candidate="${stock.code}" tabindex="0" role="button" aria-label="分析 ${stock.name}">
            <div class="candidate-top"><div><div class="stock-name"><strong>${stock.name}</strong><small>${stock.code}</small><span class="signal ${stock.signalTone}">${stock.signal}</span></div><div class="stock-sector">${stock.sector} · 综合分 ${stock.totalScore}</div></div><div class="stock-price"><strong>${stock.price.toFixed(2)}</strong><span class="${stock.change >= 0 ? 'change-up' : 'change-down'}">+${stock.change.toFixed(2)}%</span></div></div>
            <p class="candidate-reason">${stock.reason}</p>
            <div class="candidate-scores"><div class="factor"><span>图形</span><strong>${stock.pattern}</strong></div><div class="factor"><span>催化</span><strong>${stock.catalyst}</strong></div><div class="factor"><span>财务</span><strong>${stock.finance}</strong></div><div class="factor"><span>异动</span><strong>${stock.anomaly}</strong></div></div>
          </article>`).join('')}</div>
        </section>
      </div>
      <aside class="right-rail">
        <section class="panel pulse-panel">
          <div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('radar')}</span><div><h2>市场脉搏</h2><p>综合热度分钟变化</p></div></div><span class="stage up">实时</span></div>
          <div class="pulse-chart">${pulseChart(marketPulse)}</div><div class="chart-axis">${(marketPulse||[]).filter((_,i)=>i%Math.max(1,Math.floor((marketPulse||[]).length/8))===0||i===(marketPulse||[]).length-1).map(d=>`<span>${d.time}</span>`).join('')}</div>
          <div class="pulse-summary"><div class="mini-stat"><span>上涨占比</span><strong>${(market.up/(market.up+market.down)*100).toFixed(0)}%</strong></div><div class="mini-stat"><span>涨停/跌停</span><strong>${market.limitUp}/${market.limitDown}</strong></div><div class="mini-stat"><span>实时温度</span><strong>${market.temperature}</strong></div></div>
        </section>
        <section class="panel alerts-panel">
          <div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('activity')}</span><div><h2>实时异动</h2><p>系统分级告警</p></div></div><span class="stage hot">LIVE</span></div>
          <div class="alert-list" id="alertList">${alerts.filter(alertIsVisible).map(alertTemplate).join('')}</div>
        </section>
        <section class="panel catalyst-panel">
          <div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('news')}</span><div><h2>催化追踪</h2><p>政策 · 公告 · 产业</p></div></div><button class="text-button" data-jump="sectors">关联板块 →</button></div>
          <div class="catalyst-list">${catalystFeed.map(item => `<article class="catalyst-item"><div class="catalyst-meta"><span class="catalyst-type">${item.type}</span><span>${item.time}</span><span>影响 ${item.impact}</span></div><strong>${item.title}</strong><div class="catalyst-sector">${item.sector} · ${item.source}</div></article>`).join('')}</div>
        </section>
      </aside>
    </div>`;
  bindJumps();
  document.querySelectorAll('[data-candidate]').forEach(card => {
    const openCandidate = () => {
      controls.financialCode = card.dataset.candidate;
      saveControls();
      setPage('financials');
    };
    card.addEventListener('click', openCandidate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCandidate(); } });
  });
}

function alertTemplate(alert) {
  const level = Object.hasOwn(severityRank, alert.level) ? alert.level : 'low';
  return `<article class="alert-item"><span class="alert-dot ${level}"></span><div class="alert-copy"><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.detail)}</p></div><time class="alert-time">${escapeHtml(alert.time)}</time></article>`;
}

function pageIntro(page, note = '') {
  const [title, iconName, description] = pageMeta[page];
  const noteTag = note ? `<span>${note}</span>` : '';
  return `<div class="module-intro"><div class="module-intro-icon">${icon(iconName)}</div><div><h2>${title}</h2><p>${description}</p></div>${noteTag}</div>`;
}

function renderSectors() {
  const stages = ['潜伏', '启动', '发酵', '高潮', '分歧', '退潮'];
  const visibleSectors = controls.sectorStage === 'all' ? state.sectors : state.sectors.filter(s => s.stage === controls.sectorStage);
  content.innerHTML = `${pageIntro('sectors')}
    <div class="stage-legend"><button class="stage-filter ${controls.sectorStage === 'all' ? 'current' : ''}" data-stage="all">全部</button>${stages.map((name, i) => `<button class="stage-filter ${controls.sectorStage === name ? 'current' : ''}" data-stage="${name}"><i>${i + 1}</i><span>${name}</span></button>`).join('<b>→</b>')}</div>
    <div class="sector-card-grid">${visibleSectors.map((s) => {
      const i = state.sectors.indexOf(s);
      return `<article class="deep-card sector-deep-card">
      <header><div><small>热度排名 ${String(i + 1).padStart(2, '0')}</small><h3>${s.name}</h3></div><strong class="${s.change >= 0 ? 'change-up' : 'change-down'}">${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%</strong></header>
      <div class="heat-row"><div class="heat-number">${s.score}<small>/100</small></div><div class="wide-bar"><i style="width:${s.score}%"></i></div><span class="stage ${s.stageTone}">${s.stage}</span></div>
      <div class="sector-metrics"><div><span>成交额</span><strong>${s.turnover}亿</strong></div><div><span>换手率</span><strong>${s.turnoverRate}%</strong></div><div><span>上涨覆盖</span><strong>${s.breadth}%</strong></div><div><span>持续</span><strong>${s.days}日</strong></div></div>
      <p class="catalyst-copy">${s.catalyst}</p><div class="keyword-row">${s.keywords.map(k => `<span># ${k}</span>`).join('')}</div>
    </article>`; }).join('') || '<div class="inline-empty">当前阶段暂无板块</div>'}</div>`;
  document.querySelectorAll('[data-stage]').forEach(btn => btn.addEventListener('click', () => {
    controls.sectorStage = btn.dataset.stage;
    saveControls();
    renderSectors();
  }));
}

function renderPatterns() {
  const pattern = controls.pattern;
  content.innerHTML = `${pageIntro('patterns', uploadedPattern ? '样例已载入' : '等待样例 K 线')}
    <div class="two-col-layout pattern-layout">
      <section class="deep-card upload-card"><div class="upload-zone ${uploadedPattern ? 'has-preview' : ''}" id="uploadZone">${uploadedPattern ? `<img src="${uploadedPattern.dataUrl}" alt="已上传的 K 线样例"><div class="upload-file"><strong>${escapeHtml(uploadedPattern.name)}</strong><small>${Math.ceil(uploadedPattern.size / 1024)} KB · 点击可重新选择</small></div>` : `${icon('scan')}<h3>上传你的样例日 K 线</h3><p>建议保留日期、成交量和均线；支持 PNG、JPG，可拖放</p>`}<label>${uploadedPattern ? '更换图片' : '选择图片'}<input id="patternFile" type="file" accept="image/png,image/jpeg" hidden></label></div>
        <div class="setting-list control-settings">
          <label><span>识别窗口</span><select id="patternWindow"><option value="30" ${pattern.window === 30 ? 'selected' : ''}>30 日</option><option value="60" ${pattern.window === 60 ? 'selected' : ''}>60 日</option><option value="120" ${pattern.window === 120 ? 'selected' : ''}>120 日</option></select></label>
          <label><span>价格归一化</span><input id="patternNormalize" type="checkbox" ${pattern.normalize ? 'checked' : ''}></label>
          <label><span>成交量特征</span><input id="patternVolume" type="checkbox" ${pattern.volume ? 'checked' : ''}></label>
          <label><span>最低相似度</span><span class="range-control"><input id="patternSimilarity" type="range" min="50" max="95" value="${pattern.similarity}"><output>${pattern.similarity} 分</output></span></label>
        </div>
      </section>
      <section class="deep-card"><div class="deep-title"><div><h3>AI 识别流程</h3><p>样例被发送到 OpenAI 进行形态识别</p></div></div><div class="analysis-flow">${['上传图片','AI视觉识别','特征提取','形态匹配','结果排序'].map((v,i) => `<div><i>${i+1}</i><span>${v}</span></div>`).join('<b>→</b>')}</div>
        <div class="empty-preview"><div class="candle-skeleton">${[42,26,51,36,67,45,79,61,88,72,94,83].map((v,i)=>`<i style="height:${v}%;--delay:${i*35}ms"></i>`).join('')}</div><p>${uploadedPattern ? `已上传样例，点击下方按钮启动 AI 识别。` : '上传样例后，AI 将自动提取形态特征并扫描全市场。'}</p>${uploadedPattern ? '<button class="primary-button" id="analyzePatternBtn">🔍 AI 识别形态</button>' : ''}</div>
      </section>
    </div>
    <section class="panel module-panel"><div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('telescope')}</span><div><h2>匹配结果</h2><p>AI 将在接入后返回真实匹配</p></div></div></div>
      <div class="simple-table"><div class="simple-row table-head"><span>股票</span><span>所属热点</span><span>形态相似</span><span>量价确认</span><span>状态</span></div>${state.candidates.slice(0,3).map(s=>`<div class="simple-row"><span><strong>${s.name}</strong><small>${s.code}</small></span><span>${s.sector}</span><span><b>${s.pattern}</b></span><span>${s.anomaly}</span><span><em class="signal ${s.signalTone}">${s.signal}</em></span></div>`).join('')}</div>
    </section>`;
  const fileInput = document.getElementById('patternFile');
  const uploadZone = document.getElementById('uploadZone');
  fileInput?.addEventListener('change', e => handlePatternFile(e.target.files[0]));
  uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('is-dragging'); });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging'));
  uploadZone?.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('is-dragging'); handlePatternFile(e.dataTransfer.files[0]); });
  ['patternWindow', 'patternNormalize', 'patternVolume', 'patternSimilarity'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      controls.pattern = {
        window: Number(document.getElementById('patternWindow').value),
        normalize: document.getElementById('patternNormalize').checked,
        volume: document.getElementById('patternVolume').checked,
        similarity: Number(document.getElementById('patternSimilarity').value)
      };
      document.querySelector('#patternSimilarity + output').value = `${controls.pattern.similarity} 分`;
      saveControls();
    });
  });
  document.getElementById('analyzePatternBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('analyzePatternBtn');
    if (!uploadedPattern) return;
    btn.disabled = true;
    btn.textContent = 'AI 识别中...';
    try {
      // 从 dataUrl 中提取 base64
      const base64 = uploadedPattern.dataUrl.split(',')[1];
      const mimeMatch = uploadedPattern.dataUrl.match(/data:(.*?);/);
      const imageType = mimeMatch ? mimeMatch[1] : 'image/png';

      const r = await apiFetch('/api/pattern/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, imageType })
      });
      const result = await r.json();
      if (result.success) {
        showToast({ title: 'AI 识别完成', detail: `形态: ${result.pattern || '未知'}` });
        // 把结果显示在匹配表格上方
        const tableEl = document.querySelector('.module-panel');
        if (tableEl) {
          const existing = document.getElementById('aiPatternResult');
          if (existing) existing.remove();
          const div = document.createElement('div');
          div.id = 'aiPatternResult';
          div.style.cssText = 'margin:0 16px 12px;padding:14px 16px;border:1px solid rgba(37,212,196,.3);border-radius:12px;background:rgba(37,212,196,.05)';
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:18px">🤖</span>
              <strong style="color:#25d4c4">AI 识别结果</strong>
              <span style="color:#56657a;font-size:10px">通义千问 VL</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">
              <div><span style="color:#56657a">形态</span><br><strong style="color:#edf4ff">${result.pattern || '未识别'}</strong></div>
              <div><span style="color:#56657a">置信度</span><br><strong style="color:#25d4c4">${((result.confidence || 0) * 100).toFixed(0)}%</strong></div>
              <div><span style="color:#56657a">趋势</span><br><strong style="color:#edf4ff">${result.trendDirection || '-'}</strong></div>
              <div><span style="color:#56657a">支撑位</span><br><strong style="color:#2ad391">${(result.keyLevels?.support || []).slice(0,2).join(', ')}</strong></div>
              <div><span style="color:#56657a">阻力位</span><br><strong style="color:#ff6678">${(result.keyLevels?.resistance || []).slice(0,2).join(', ')}</strong></div>
              <div><span style="color:#56657a">量价</span><br><strong style="color:#edf4ff">${result.volumeAnalysis?.slice(0,15) || '-'}</strong></div>
            </div>
            <div style="margin-top:8px;font-size:10px;color:#6d7e93">📊 ${result.volumeAnalysis || ''}</div>
            <div style="margin-top:4px;font-size:10px;color:#718399">💡 ${result.notes || ''}</div>
          `;
          tableEl.parentNode.insertBefore(div, tableEl);
        }
      } else if (result.needsText) {
        showToast({ title: '需要文字描述', detail: result.note });
      } else {
        showToast({ title: '识别失败', detail: result.error || 'AI 服务暂不可用' });
      }
    } catch (err) {
      showToast({ title: '网络错误', detail: err.message });
    }
    btn.disabled = false;
    btn.textContent = '🔍 AI 识别形态';
  });
}

function handlePatternFile(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) { showToast({ title: '文件格式不支持', detail: '请选择 PNG 或 JPG 图片。' }); return; }
  if (file.size > 8 * 1024 * 1024) { showToast({ title: '图片过大', detail: '请选择不超过 8 MB 的图片。' }); return; }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    uploadedPattern = { name: file.name, size: file.size, dataUrl: reader.result };
    renderPatterns();
    showToast({ title: '样例已载入', detail: `${file.name} 已准备就绪，可点击 AI 识别按钮。` });
  });
  reader.readAsDataURL(file);
}

function renderStocks() {
  const filters = [['all', '全部'], ['strong', '强确认'], ['active', '已触发'], ['watch', '观察']];
  const visibleCandidates = controls.candidateFilter === 'all' ? state.candidates : state.candidates.filter(s => s.signalTone === controls.candidateFilter);
  content.innerHTML = `${pageIntro('stocks')}
    <div class="filter-strip">${filters.map(([v, l]) => `<button class="${controls.candidateFilter === v ? 'active' : ''}" data-stock-filter="${v}">${l} ${v === 'all' ? state.candidates.length : state.candidates.filter(s => s.signalTone === v).length}</button>`).join('')}<span></span><button id="rescoreButton">${icon('refresh')} 刷新评分</button></div>
    <section class="panel module-panel stock-table-panel"><div class="simple-table stock-table"><div class="simple-row table-head"><span>候选股票</span><span>热点 / 阶段</span><span>综合分</span><span>图形</span><span>催化</span><span>财务</span><span>异动</span><span>信号</span></div>
    ${visibleCandidates.map(s=>`<div class="simple-row clickable-row" data-financial-code="${s.code}"><span><strong>${s.name}</strong><small>${s.code} · ${s.price.toFixed(2)} <i class="change-up">+${s.change.toFixed(2)}%</i></small></span><span>${s.sector}<small>${s.reason}</small></span><span><b class="total-score">${s.totalScore}</b></span><span>${s.pattern}</span><span>${s.catalyst}</span><span>${s.finance}</span><span>${s.anomaly}</span><span><em class="signal ${s.signalTone}">${s.signal}</em></span></div>`).join('') || '<div class="inline-empty">当前筛选条件下没有候选股票</div>'}</div></section>
    <div class="decision-note"><span>${icon('shield')}</span><div><strong>入池不等于交易</strong><p>只有当板块阶段、个股逻辑、财务质量和盘中异动同时满足规则时，系统才生成交易提示。</p></div></div>`;
  document.querySelectorAll('[data-stock-filter]').forEach(btn => btn.addEventListener('click', () => {
    controls.candidateFilter = btn.dataset.stockFilter;
    saveControls();
    renderStocks();
  }));
  document.querySelectorAll('[data-financial-code]').forEach(row => row.addEventListener('click', () => {
    controls.financialCode = row.dataset.financialCode;
    saveControls();
    setPage('financials');
  }));
  document.getElementById('rescoreButton')?.addEventListener('click', () => {
    state.candidates = state.candidates.map(s => ({ ...s, totalScore: Math.round(s.pattern * .3 + s.catalyst * .25 + s.finance * .25 + s.anomaly * .2) })).sort((a, b) => b.totalScore - a.totalScore);
    renderStocks();
    showToast({ title: '评分已更新', detail: '已按图形 30%、催化 25%、财务 25%、异动 20% 重新计算。' });
  });
}

function renderFinancials() {
  const selected = state.candidates.find(s => s.code === controls.financialCode) || state.candidates[0];
  controls.financialCode = selected.code;
  const profitMax = Math.max(...selected.profitTrend);
  content.innerHTML = `${pageIntro('financials')}
    <div class="selected-stock"><div><small>当前分析</small><strong>${selected.name}</strong><span>${selected.code} · ${selected.sector}</span></div><label class="select-control"><span>切换公司</span><select id="financialStockSelect">${state.candidates.map(s => `<option value="${s.code}" ${s.code === selected.code ? 'selected' : ''}>${s.name} · ${s.code}</option>`).join('')}</select></label></div>
    <div class="finance-kpis">${[
      ['连续盈利', selected.profitTrend?.length ? `${selected.profitTrend.length} 个报告期` : '暂无数据',
       selected.profitTrend?.every(v=>v>0) ? '通过' : '待确认'],
      ['最新净利润', selected.profitTrend?.length ? `${selected.profitTrend.at(-1)} 亿` : '暂无数据',
       selected.profitTrend?.at(-1) > 0 ? '盈利' : '亏损'],
      ['综合财务分', `${selected.finance || 50} / 100`, selected.finance > 80 ? '良好' : selected.finance > 60 ? '一般' : '关注']
    ].map((v,i)=>`<article class="deep-card"><span>${v[0]}</span><strong>${v[1]}</strong><em class="${i===2?'blue':'green'}">● ${v[2]}</em></article>`).join('')}</div>
    <div class="two-col-layout finance-layout"><section class="deep-card"><div class="deep-title"><div><h3>利润趋势</h3><p>归母净利润 · 亿元</p></div><span class="change-up">连续增长</span></div><div class="bar-chart">${selected.profitTrend.map((v,i)=>`<div><span>${v}</span><i style="height:${Math.round(v/profitMax*100)}%"></i><small>${2023+i}</small></div>`).join('')}</div></section>
    <section class="deep-card"><div class="deep-title"><div><h3>质量检查</h3><p>基于最近一期年报数据</p></div><button class="text-button" id="aiFinancialBtn">🤖 AI 解读</button></div><div class="check-list">${(() => {
      const bd = selected.balanceData;
      const checks = [];
      if (selected.profitTrend?.length >= 4) {
        const growing = selected.profitTrend[0] < selected.profitTrend.at(-1);
        checks.push({ ok: growing, text: '近4期净利润持续增长', note: growing ? '正常' : '关注' });
      } else {
        checks.push({ ok: false, text: '利润数据不足4期', note: '待补充' });
      }
      if (bd) {
        const assetQuality = !bd.goodwill || bd.goodwill / bd.total_equity < 0.3;
        checks.push({ ok: assetQuality, text: '商誉占净资产比例可控', note: assetQuality ? '正常' : '关注' });
      }
      checks.push({ ok: true, text: '数据来源：Tushare 最新年报', note: selected.profitTrend?.length ? '有效' : '待补充' });
      return checks.map(c => `<div class="${c.ok ? '' : 'warning'}"><i>${c.ok ? '✓' : '!'}</i><span>${c.text}</span><b>${c.note}</b></div>`).join('');
    })()}</div></section></div>
    <section class="panel module-panel"><div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('report')}</span><div><h2>候选池财务对比</h2><p>盈利趋势与质量过滤</p></div></div></div><div class="simple-table"><div class="simple-row table-head"><span>公司</span><span>财务分</span><span>利润趋势</span><span>增长质量</span><span>风险结论</span></div>${state.candidates.map(s=>`<div class="simple-row clickable-row ${s.code === selected.code ? 'is-selected' : ''}" data-select-company="${s.code}"><span><strong>${s.name}</strong><small>${s.code}</small></span><span><b>${s.finance}</b></span><span>${sparkline(s.profitTrend, true)}</span><span>${s.finance>85?'高':'良好'}</span><span><em class="risk-pass">可通过</em></span></div>`).join('')}</div></section>`;
  const selectCompany = code => { controls.financialCode = code; saveControls(); renderFinancials(); };
  document.getElementById('financialStockSelect')?.addEventListener('change', e => selectCompany(e.target.value));
  document.querySelectorAll('[data-select-company]').forEach(row => row.addEventListener('click', () => selectCompany(row.dataset.selectCompany)));
  document.getElementById('aiFinancialBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('aiFinancialBtn');
    btn.disabled = true;
    btn.textContent = 'AI 分析中...';
    try {
      const r = await apiFetch('/api/analysis/financial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockName: selected.name,
          stockCode: selected.code,
          profitTrend: selected.profitTrend,
          revenueTrend: selected.revenueTrend
        })
      });
      const result = await r.json();
      if (result.success) {
        showToast({ title: 'AI 财报解读', detail: result.verdictText || '分析完成' });
        // 在质量检查区域下方显示 AI 结果
        const checkList = document.querySelector('.check-list');
        if (checkList && result.verdictText) {
          const aiNote = document.createElement('div');
          aiNote.className = 'ai-note';
          aiNote.innerHTML = `<i>🤖</i><span>AI 解读: ${result.verdictText}</span><b style="color:${result.verdict === 'pass' ? 'var(--green)' : result.verdict === 'warn' ? 'var(--orange)' : 'var(--red)'}">${result.verdict === 'pass' ? '通过' : result.verdict === 'warn' ? '关注' : '风险'}</b>`;
          if (result.riskFlags?.length) {
            aiNote.innerHTML += `<small style="display:block;color:var(--muted);margin-top:4px;">⚠ ${result.riskFlags.join('；')}</small>`;
          }
          checkList.appendChild(aiNote);
        }
      } else {
        showToast({ title: 'AI 分析失败', detail: result.error || '请稍后重试' });
      }
    } catch (err) {
      showToast({ title: '网络错误', detail: err.message });
    }
    btn.disabled = false;
    btn.textContent = '🤖 AI 解读';
  });
}

function renderMonitor() {
  const rules = [['volume','成交量暴增','≥ 同期 2.5×'],['speed','5分钟涨速','进入市场前 3%'],['turnover','换手加速度','Z-Score ≥ 2'],['sector','板块联动','≥ 5只同步'],['retreat','高位退潮信号','炸板率升高']];
  const enabledRules = Object.values(controls.monitorRules).filter(Boolean).length;
  const totalStocks = (state.market?.up || 0) + (state.market?.down || 0) + (state.market?.flat || 0) || 5047;
  const candidateCount = state.candidates?.length || 0;
  const alertCount = state.alerts?.filter(alertIsVisible)?.length || 0;
  const isTrading = state.tradingStatus?.isTradingTime;
  content.innerHTML = `${pageIntro('monitor', isTrading ? '3 秒高频扫描中' : '非交易时段')}
	    <div class="monitor-kpis"><article><span>监测股票</span><strong>${totalStocks.toLocaleString()}</strong><small>全市场分钟扫描</small></article><article><span>候选池订阅</span><strong>${candidateCount}</strong><small>3 秒快照 · 异动检测</small></article><article><span>启用规则</span><strong>${enabledRules} / 5</strong><small>${isTrading ? '实时计算中' : '等待开盘'}</small></article><article><span>异动告警</span><strong>${alertCount}</strong><small>${isTrading ? '量价/涨速/换手/联动' : '休市中'}</small></article></div>
    <div class="two-col-layout monitor-layout"><section class="panel"><div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('activity')}</span><div><h2>盘中异动流</h2><p>实时更新 · 分级排序</p></div></div><span class="stage ${controls.liveUpdates ? 'hot' : 'quiet'}">${controls.liveUpdates ? 'LIVE' : 'PAUSED'}</span></div><div class="large-alert-list" id="alertList">${state.alerts.filter(alertIsVisible).map(alertTemplate).join('') || '<div class="inline-empty">暂无符合级别的异动</div>'}</div></section>
    <section class="deep-card"><div class="deep-title"><div><h3>监测规则</h3><p>基于 3 秒快照滚动窗口实时计算</p></div></div><div class="rule-cards">${rules.map(([key,label,threshold]) => `<button class="rule-toggle ${controls.monitorRules[key] ? 'is-on' : ''}" data-monitor-rule="${key}" aria-pressed="${controls.monitorRules[key]}"><span>${label}</span><strong>${threshold}</strong><i>${controls.monitorRules[key] ? '启用' : '停用'}</i></button>`).join('')}</div></section></div>`;
  document.querySelectorAll('[data-monitor-rule]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.monitorRule;
    controls.monitorRules[key] = !controls.monitorRules[key];
    saveControls();
    renderMonitor();
  }));
}

function calculateRiskScore() {
  return Math.round(Math.min(100, controls.risk.position * 1.7 + controls.risk.sector * .7 + (15 - controls.risk.stopLoss) * 1.1 + (8 - controls.risk.dailyLoss) * 2));
}

function renderRisk() {
  const riskSettings = [['position','单笔最大仓位','%',1,30,'避免单一股票风险'],['sector','单一板块上限','%',5,60,'控制热点集中暴露'],['stopLoss','单笔止损','%',2,15,'触发后退出观察'],['dailyLoss','单日最大损失','%',1,8,'达到后停止新开仓']];
  const riskScore = calculateRiskScore();
  const riskLabel = riskScore < 40 ? '较低' : riskScore < 70 ? '中等' : '偏高';
  content.innerHTML = `${pageIntro('risk')}
    <div class="risk-score-card"><div><span>当前策略风险</span><strong id="riskLabel">${riskLabel}</strong><p>参数仅用于本地规则演示，不会触发真实交易</p></div><div class="risk-ring"><strong id="riskScore">${riskScore}</strong><small>/100</small></div></div>
    <div class="risk-grid">${riskSettings.map(([key,label,unit,min,max,note]) => `<article class="deep-card risk-setting"><span>${label}</span><strong id="riskValue-${key}">${key==='stopLoss'||key==='dailyLoss'?'-':''}${controls.risk[key]}${unit}</strong><input data-risk-key="${key}" type="range" min="${min}" max="${max}" value="${controls.risk[key]}" aria-label="${label}"><small>${note}</small></article>`).join('')}</div>
    <section class="panel module-panel"><div class="panel-header"><div class="panel-heading"><span class="heading-icon">${icon('shield')}</span><div><h2>交易闸门</h2><p>任一禁止条件出现时不生成交易确认</p></div></div><button class="text-button" id="saveRiskButton">保存参数</button></div><div class="gate-list"><div><i class="pass">✓</i><span><strong>板块阶段</strong><small>不处于明确退潮</small></span><b>通过</b></div><div><i class="pass">✓</i><span><strong>财务风险</strong><small>无重大审计与偿债异常</small></span><b>通过</b></div><div><i class="wait">!</i><span><strong>价格位置</strong><small>避免高潮后高位追涨</small></span><b>需确认</b></div><div><i class="pass">✓</i><span><strong>盘中量价</strong><small>成交量与价格同步确认</small></span><b>通过</b></div></div></section>`;
  document.querySelectorAll('[data-risk-key]').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.riskKey;
    controls.risk[key] = Number(input.value);
    const prefix = key === 'stopLoss' || key === 'dailyLoss' ? '-' : '';
    document.getElementById(`riskValue-${key}`).textContent = `${prefix}${input.value}%`;
    const score = calculateRiskScore();
    document.getElementById('riskScore').textContent = score;
    document.getElementById('riskLabel').textContent = score < 40 ? '较低' : score < 70 ? '中等' : '偏高';
  }));
  document.getElementById('saveRiskButton')?.addEventListener('click', () => {
    saveControls();
    showToast({ title: '风控参数已保存', detail: '设置已同步到云端，跨设备可用。' });
  });
}

function renderReview() {
  const upRatio = state.market ? (state.market.up / (state.market.up + state.market.down) * 100).toFixed(1) : '0';
  const candidateCount = state.candidates?.length || 0;
  const sectorsCount = state.sectors?.length || 0;
  content.innerHTML = `${pageIntro('review', `交易日 ${state.market?.tradeDate || ''}`)}
    <div class="review-kpis">
      <article><span>全市场股票</span><strong>${(state.market.up + state.market.down + (state.market.flat||0)).toLocaleString()}</strong><small>有效样本</small></article>
      <article><span>上涨占比</span><strong>${upRatio}%</strong><small>${state.market.up} / ${state.market.down}</small></article>
      <article><span>涨停 / 跌停</span><strong>${state.market.limitUp} / ${state.market.limitDown}</strong><small>极端波动统计</small></article>
      <article><span>热点板块</span><strong>${sectorsCount}</strong><small>行业聚合</small></article>
    </div>
    <div class="two-col-layout review-layout">
      <section class="deep-card"><div class="deep-title"><div><h3>涨跌幅分布</h3><p>各阶段板块数量统计</p></div><span>${state.market?.tradeDate || ''}</span></div>
        <div class="stage-stats">
          ${(() => {
            const stages = {};
            (state.sectors || []).forEach(s => { stages[s.stage] = (stages[s.stage] || 0) + 1; });
            return Object.entries(stages).sort((a,b) => b[1] - a[1]).map(([name, count]) => {
              const pct = Math.round(count / sectorsCount * 100);
              return `<div><span>${name}</span><i><b style="width:${pct}%"></b></i><strong>${count}个</strong></div>`;
            }).join('') || '<div><span>暂无</span></div>';
          })()}
        </div>
      </section>
      <section class="deep-card"><div class="deep-title"><div><h3>候选股信号分布</h3><p>基于涨幅排名生成</p></div></div>
        <div class="stage-stats">
          ${(() => {
            const signals = {};
            (state.candidates || []).forEach(s => { signals[s.signal] = (signals[s.signal] || 0) + 1; });
            return Object.entries(signals).map(([name, count]) => {
              const pct = Math.round(count / Math.max(1, candidateCount) * 100);
              return `<div><span>${name}</span><i><b style="width:${pct}%"></b></i><strong>${count}只</strong></div>`;
            }).join('') || '<div><span>暂无</span></div>';
          })()}
        </div>
      </section>
    </div>
    <div class="decision-note warning-note"><span>${icon('flag')}</span><div><strong>基于新浪财经实时行情</strong><p>盘中每分钟自动刷新。历史财务数据来自 Tushare，仅供参考。</p></div></div>`;
}

function renderPage(page) {
  const renderers = { sectors: renderSectors, patterns: renderPatterns, stocks: renderStocks, financials: renderFinancials, monitor: renderMonitor, risk: renderRisk, review: renderReview };
  (renderers[page] || renderOverview)(state);
}

function setPage(page) {
  if (!pageMeta[page]) page = 'overview';
  activePage = page;
  sessionStorage.setItem('jianshi-active-page', page);
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  pageTitle.textContent = pageMeta[page][0];
  closeMobileMenu();
  if (!state) return;
  if (page === 'overview') renderOverview(state); else renderPage(page);
}

function bindJumps() {
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => setPage(btn.dataset.jump)));
}

function showToast(alert) {
  if (!controls.toastNotifications) return;
  const toast = document.createElement('article');
  toast.className = 'toast';
  const title = document.createElement('strong');
  const detail = document.createElement('p');
  title.textContent = alert.title;
  detail.textContent = alert.detail;
  toast.append(title, detail);
  toastRegion.prepend(toast);
  setTimeout(() => toast.remove(), 4600);
}

function addLiveAlert(alert) {
  if (!alertIsVisible(alert)) return;
  const list = document.getElementById('alertList');
  if (!list) return;
  // 去重：相同标题不重复添加
  const existing = list.querySelectorAll('.alert-copy strong');
  for (const el of existing) {
    if (el.textContent === alert.title) return;
  }
  list.querySelector('.inline-empty')?.remove();
  list.insertAdjacentHTML('afterbegin', alertTemplate(alert));
  while (list.children.length > 5) list.lastElementChild.remove();
}

function updateNotificationBadge() {
  notificationButton.classList.toggle('has-unread', controls.unreadAlerts > 0);
  notificationButton.setAttribute('aria-label', controls.unreadAlerts > 0 ? `通知中心，${controls.unreadAlerts} 条未读` : '通知中心');
}

async function loadOverview(showFeedback = false) {
  const button = document.getElementById('refreshButton');
  button?.classList.add('is-loading');
  try {
    const response = await apiFetch('/api/overview', { cache: 'no-store' });
    if (!response.ok) throw new Error('overview request failed');
    state = await response.json();
    updateTimeTag();
    renderPage(activePage);
    updateConnectionUi(true);
    updateSourceLabel();
    if (showFeedback) showToast({ title: '数据已刷新', detail: `来自${state.sourceStatus.name} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}` });
  } catch (error) {
    content.innerHTML = `<div class="loading-state"><p>暂时无法连接服务，请检查网络后重试。</p></div>`;
    updateConnectionUi(false);
  } finally {
    button?.classList.remove('is-loading');
  }
}

function updateSourceLabel() {
  const sourceCard = document.querySelector('.source-card');
  if (!sourceCard || !state) return;
  const mode = state.sourceStatus?.mode;
  const isReal = mode === 'production';
  const isOffHours = mode === 'off-hours';
  const row = sourceCard.querySelector('.source-row span:nth-child(2)');
  const detail = sourceCard.querySelector('small');
  const pulse = sourceCard.querySelector('.source-pulse');
  if (row) {
    row.textContent = isReal ? '实时数据已连接'
      : isOffHours ? '非交易时段'
      : '数据源就绪';
  }
  if (detail) {
    detail.textContent = isReal
      ? `交易日: ${state.market?.tradeDate || ''}`
      : isOffHours
        ? `Tushare + 新浪财经 · ${state.tradingStatus?.label || '休市'}`
        : `Tushare + 新浪财经 · ${state.tradingStatus?.label || ''}`;
  }
  if (pulse) pulse.style.background = isReal ? '#2ad391' : isOffHours ? '#f0a040' : '';
  // 更新顶部 pill
  const simPill = document.querySelector('.simulation-pill');
  if (simPill) {
    simPill.textContent = isReal ? '实时行情' : isOffHours ? '盘后数据' : '实时行情';
  }
}

function connectStream() {
  if (stream) stream.close();
  stream = null;
  if (!controls.liveUpdates) { updateConnectionUi(false, true); return; }
  stream = new EventSource('/api/stream');
  stream.addEventListener('ready', () => updateConnectionUi(true));
  stream.addEventListener('market-update', (event) => {
    const update = JSON.parse(event.data);
    if (!state) return;
    state.market.temperature = update.temperature;
    // 批量注入新告警（SSE 现在推送多条）
    const incoming = update.newAlerts || (update.alert ? [update.alert] : []);
    for (const a of incoming.reverse()) {
      state.alerts.unshift(a);
      controls.recentAlerts.unshift(a);
    }
    state.alerts = state.alerts.slice(0, 30);
    controls.recentAlerts = controls.recentAlerts.slice(0, 30);
    const notificationDrawerOpen = controlDrawer.classList.contains('is-open') && controlDrawer.dataset.kind === 'notifications';
    if (!notificationDrawerOpen) controls.unreadAlerts += incoming.length;
    saveControls();
    updateNotificationBadge();
    const temp = document.getElementById('temperatureValue');
    if (temp) temp.textContent = update.temperature;
    // 弹窗显示最新一条
    if (incoming.length > 0 && alertIsVisible(incoming[0])) showToast(incoming[0]);
    if (notificationDrawerOpen) openDrawer('notifications');
  });
  stream.onerror = () => updateConnectionUi(false);
}

function updateConnectionUi(connected, paused = false) {
  const sourceCard = document.querySelector('.source-card');
  sourceCard?.classList.toggle('is-offline', !connected);
  // 根据实际 state 判断数据源
  const mode = state?.sourceStatus?.mode;
  const isReal = mode === 'production';
  const isOffHours = mode === 'off-hours';
  const sourceText = sourceCard?.querySelector('.source-row span:nth-child(2)');
  const sourceDetail = sourceCard?.querySelector('small');
  if (sourceText) {
    sourceText.textContent = paused ? '推送已暂停'
      : !connected ? '正在重连'
      : isReal ? '实时数据已连接'
      : isOffHours ? '非交易时段'
      : '数据源就绪';
  }
  if (sourceDetail) {
    sourceDetail.textContent = paused ? '可在设置中恢复'
      : isReal ? `交易日: ${state?.market?.tradeDate || ''}`
      : isOffHours ? `Tushare + 新浪财经 · ${state?.tradingStatus?.label || '休市'}`
      : `Tushare + 新浪财经`;
  }
  const pulse = sourceCard?.querySelector('.source-pulse');
  if (pulse) pulse.style.background = isReal ? '#2ad391' : isOffHours ? '#f0a040' : '';
  const simPill = document.querySelector('.simulation-pill');
  if (simPill) {
    simPill.textContent = isReal ? '实时行情' : isOffHours ? '盘后数据' : '实时行情';
  }
  const status = document.querySelector('.market-status');
  if (status) {
    status.lastChild.textContent = paused ? '推送暂停'
      : !connected ? '连接波动'
      : isReal ? '盘中实时'
      : isOffHours ? state?.tradingStatus?.label || '休市'
      : '实时监控中';
  }
}

function closeMobileMenu() {
  document.querySelector('.sidebar').classList.remove('is-mobile-open');
  mobileMenuButton.setAttribute('aria-expanded', 'false');
  if (pageBackdrop.dataset.mode === 'mobile') { pageBackdrop.hidden = true; delete pageBackdrop.dataset.mode; }
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  const open = !sidebar.classList.contains('is-mobile-open');
  sidebar.classList.toggle('is-mobile-open', open);
  mobileMenuButton.setAttribute('aria-expanded', String(open));
  pageBackdrop.hidden = !open;
  pageBackdrop.dataset.mode = open ? 'mobile' : '';
}

function closeDrawer() {
  controlDrawer.classList.remove('is-open');
  controlDrawer.setAttribute('aria-hidden', 'true');
  notificationButton.setAttribute('aria-expanded', 'false');
  document.getElementById('settingsButton').setAttribute('aria-expanded', 'false');
  if (pageBackdrop.dataset.mode === 'drawer') { pageBackdrop.hidden = true; delete pageBackdrop.dataset.mode; }
}

function drawerHeader(title, description) {
  return `<header class="drawer-header"><div><h2>${title}</h2><p>${description}</p></div><button class="drawer-close" id="drawerCloseButton" aria-label="关闭">×</button></header>`;
}

function openDrawer(kind) {
  closeMobileMenu();
  controlDrawer.dataset.kind = kind;
  if (kind === 'notifications') {
    controls.unreadAlerts = 0;
    saveControls();
    updateNotificationBadge();
    const alerts = controls.recentAlerts.length ? controls.recentAlerts : state?.alerts || [];
    controlDrawer.innerHTML = `${drawerHeader('通知中心', '盘中异动与系统状态')}<div class="drawer-toolbar"><span>${alerts.length} 条最近通知</span><button id="clearNotifications">清空</button></div><div class="drawer-alerts">${alerts.map(alertTemplate).join('') || '<div class="drawer-empty">暂无通知</div>'}</div>`;
    notificationButton.setAttribute('aria-expanded', 'true');
    document.getElementById('clearNotifications')?.addEventListener('click', () => {
      controls.recentAlerts = []; controls.unreadAlerts = 0; saveControls(); openDrawer('notifications');
    });
  } else {
    controlDrawer.innerHTML = `${drawerHeader('系统设置', '这些选项同步到云端，跨设备可用')}
      <div class="drawer-section"><h3>实时体验</h3>
        <label class="setting-row"><span><strong>实时推送</strong><small>接收 15 秒一次的市场异动推送</small></span><input data-setting="liveUpdates" type="checkbox" ${controls.liveUpdates ? 'checked' : ''}></label>
        <label class="setting-row"><span><strong>弹窗提醒</strong><small>在右下角显示即时消息</small></span><input data-setting="toastNotifications" type="checkbox" ${controls.toastNotifications ? 'checked' : ''}></label>
        <label class="setting-row"><span><strong>最低提醒级别</strong><small>过滤异动流和弹窗</small></span><select data-setting="minAlertLevel"><option value="low" ${controls.minAlertLevel === 'low' ? 'selected' : ''}>全部</option><option value="medium" ${controls.minAlertLevel === 'medium' ? 'selected' : ''}>中等及以上</option><option value="high" ${controls.minAlertLevel === 'high' ? 'selected' : ''}>高及以上</option><option value="critical" ${controls.minAlertLevel === 'critical' ? 'selected' : ''}>仅紧急</option></select></label>
      </div>
      <div class="drawer-section"><h3>界面</h3><label class="setting-row"><span><strong>紧凑模式</strong><small>缩小信息卡和列表间距</small></span><input data-setting="compactMode" type="checkbox" ${controls.compactMode ? 'checked' : ''}></label></div>
      <div class="drawer-footer"><button class="secondary-button" id="resetSettings">恢复默认</button><button class="primary-button" id="finishSettings">完成</button></div>`;
    document.getElementById('settingsButton').setAttribute('aria-expanded', 'true');
    controlDrawer.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.setting;
      controls[key] = input.type === 'checkbox' ? input.checked : input.value;
      document.body.classList.toggle('compact-mode', controls.compactMode);
      saveControls();
      if (key === 'liveUpdates') connectStream();
      if (key === 'minAlertLevel' && state) renderPage(activePage);
    }));
    document.getElementById('resetSettings')?.addEventListener('click', () => {
      controls = structuredClone(defaultControls);
      localStorage.removeItem(storageKey);
      document.body.classList.remove('compact-mode');
      connectStream();
      renderPage(activePage);
      openDrawer('settings');
      showToast({ title: '已恢复默认设置', detail: '筛选、规则和风控参数均已重置。' });
    });
    document.getElementById('finishSettings')?.addEventListener('click', closeDrawer);
  }
  document.getElementById('drawerCloseButton')?.addEventListener('click', closeDrawer);
  controlDrawer.classList.add('is-open');
  controlDrawer.setAttribute('aria-hidden', 'false');
  pageBackdrop.hidden = false;
  pageBackdrop.dataset.mode = 'drawer';
}

// ---- 事件绑定 ----
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setPage(item.dataset.page)));
document.getElementById('refreshButton')?.addEventListener('click', () => loadOverview(true));
document.getElementById('settingsButton')?.addEventListener('click', () => openDrawer('settings'));
notificationButton?.addEventListener('click', () => openDrawer('notifications'));
mobileMenuButton?.addEventListener('click', toggleMobileMenu);
pageBackdrop?.addEventListener('click', () => pageBackdrop.dataset.mode === 'mobile' ? closeMobileMenu() : closeDrawer());
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeMobileMenu(); } });

// ---- 启动 ----
let autoRefreshTimer = null;

function updateTimeTag() {
  const el = document.getElementById('updateTime');
  if (el) el.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

async function silentRefresh() {
  try {
    const response = await apiFetch('/api/overview', { cache: 'no-store' });
    if (!response.ok) return;
    const prevState = state;
    state = await response.json();
    updateTimeTag();
    // 只在总览页自动重渲染（其他页面不打断用户操作）
    if (activePage === 'overview') {
      renderPage(activePage);
    }
    updateSourceLabel();
    updateConnectionUi(true);
  } catch { /* 静默失败 */ }
}

(async function init() {
  await loadUserSettings();
  activePage = sessionStorage.getItem('jianshi-active-page') || 'overview';
  document.body.classList.toggle('compact-mode', controls.compactMode);
  updateNotificationBadge();
  await loadOverview();
  setPage(activePage);
  connectStream();
  // 每 5 秒自动静默刷新板块/候选股数据
  autoRefreshTimer = setInterval(silentRefresh, 5000);
})();
