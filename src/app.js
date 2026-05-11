const statusMeta = {
  active: { label: "已合作", color: "#159a72" },
  intent: { label: "有意向", color: "#d99212" },
  target: { label: "未拜访", color: "#d94f45" },
  paused: { label: "暂不合作", color: "#7a8691" },
  key: { label: "重点客户", color: "#256fd8" },
};

const companyMeta = [
  { keyword: "京东", label: "京东", color: "#d71920", shape: "diamond" },
  { keyword: "顺丰", label: "顺丰", color: "#1b1f24", shape: "square" },
  { keyword: "中通", label: "中通", color: "#1769e0", shape: "circle" },
  { keyword: "圆通", label: "圆通", color: "#18a058", shape: "triangle" },
  { keyword: "极兔", label: "极兔", color: "#ef6f6c", shape: "hex" },
  { keyword: "韵达", label: "韵达", color: "#f3bf16", shape: "pin" },
  { keyword: "申通", label: "申通", color: "#87919d", shape: "square" },
  { keyword: "菜鸟", label: "菜鸟", color: "#61b7ef", shape: "circle" },
  { keyword: "德邦", label: "德邦", color: "#f7c600", shape: "diamond" },
  { keyword: "邮政", label: "邮政", color: "#0b8f4d", shape: "hex" },
];

const discoveryBrands = ["京东快递", "顺丰速运", "中通快递", "圆通速递", "极兔速递", "韵达快递", "申通快递", "菜鸟驿站", "德邦快递", "邮政快递"];
const zhengzhouDistricts = ["", "金水区", "二七区", "管城区", "中原区", "郑东新区", "惠济区", "高新区", "经开区", "航空港区", "新郑市", "中牟县", "荥阳市", "上街区"];

const navItems = [
  ["map", "地图"],
  ["discovery", "发现"],
  ["followups", "跟进"],
  ["today", "拜访"],
  ["sites", "站点"],
  ["assistant", "记录"],
  ["assets", "车辆合同"],
  ["dashboard", "看板"],
  ["settings", "数据"],
];

let sites = [];
let visits = [];
let vehicles = [];
let contracts = [];
let payments = [];
let serviceTickets = [];
let backups = [];
let currentUser = null;
let users = [];

const state = {
  view: "map",
  authenticated: false,
  filter: "all",
  query: "",
  selectedSiteId: null,
  routeIds: [],
  discovery: {
    city: "郑州",
    district: "",
    brand: "京东快递",
    keyword: "",
    pages: 2,
    results: [],
    selected: new Set(),
    loading: false,
    message: "",
  },
  mapSearch: "",
  mapSearchResults: [],
  mapMessage: "",
  mapFocus: null,
  mapPanel: "",
  visitText: "",
  extracted: null,
  siteForm: null,
  loading: true,
  loginError: "",
  error: "",
};

let map = null;
let routeLayer = null;

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function apiRequest(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetch(path, init);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = await response.text() || message;
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const type = response.headers.get("Content-Type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

async function loadData() {
  const data = await apiRequest("/api/bootstrap");
  currentUser = data.user || null;
  users = data.users || [];
  sites = data.sites || [];
  visits = data.visits || [];
  vehicles = data.vehicles || [];
  contracts = data.contracts || [];
  payments = data.payments || [];
  serviceTickets = data.serviceTickets || [];
  backups = data.backups || [];
  state.routeIds = data.routeIds || [];
  state.authenticated = true;
  if (!sites.some((site) => site.id === state.selectedSiteId)) {
    state.selectedSiteId = sites[0]?.id || null;
  }
}

async function init() {
  render();
  try {
    await loadData();
    state.loading = false;
    render();
  } catch (error) {
    state.loading = false;
    if (error.status === 401) {
      state.authenticated = false;
      state.error = "";
    } else {
      state.error = error.message || "加载失败";
    }
    render();
  }
}

function todayIso() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateTimeText() {
  return new Date().toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(/\//g, "-");
}

function getSelectedSite() {
  return sites.find((site) => site.id === state.selectedSiteId) || sites[0] || null;
}

function getSiteById(id) {
  return sites.find((site) => site.id === Number(id));
}

function getVehicleById(id) {
  return vehicles.find((vehicle) => vehicle.id === Number(id));
}

function getContractById(id) {
  return contracts.find((contract) => contract.id === Number(id));
}

function siteName(id) {
  return getSiteById(id)?.name || "未关联站点";
}

function vehicleName(id) {
  const vehicle = getVehicleById(id);
  return vehicle ? `${vehicle.code}${vehicle.plate ? ` · ${vehicle.plate}` : ""}` : "未关联车辆";
}

function money(value) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function statusLabel(status) {
  return statusMeta[status]?.label || status || "未设置";
}

function vehicleStatusLabel(status) {
  return { idle: "空闲", rented: "在租", repair: "维修", retired: "报废" }[status] || status || "未设置";
}

function paymentStatusLabel(status) {
  return { unpaid: "未收", partial: "部分收款", paid: "已收" }[status] || status || "未设置";
}

function ticketStatusLabel(status) {
  return { open: "待处理", processing: "处理中", resolved: "已解决" }[status] || status || "未设置";
}

function roleLabel(role) {
  return { owner: "老板/管理员", sales: "业务员", viewer: "只读查看" }[role] || role || "未设置";
}

function companyFor(site) {
  const text = `${site?.brand || ""} ${site?.name || ""}`;
  return companyMeta.find((item) => text.includes(item.keyword)) || { label: site?.brand || "站点", color: "#159a72", shape: "circle" };
}

function filteredSites() {
  const query = state.query.trim().toLowerCase();
  return sites.filter((site) => {
    const matchesStatus = state.filter === "all" || site.status === state.filter;
    if (!matchesStatus) return false;
    if (!query) return true;
    return [site.name, site.brand, site.district, site.address, site.contact, site.phone, site.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function routeSites() {
  return state.routeIds.map(getSiteById).filter(Boolean);
}

function render() {
  const root = document.querySelector("#app");
  if (!state.loading && !state.authenticated) {
    root.innerHTML = renderLoginView();
    bindLoginEvents();
    return;
  }
  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <strong>知兔</strong>
          <span>快享市场地图</span>
        </div>
        <nav class="app-nav">
          ${navItems.map(([view, label]) => `
            <button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>
          `).join("")}
        </nav>
        <div class="app-user">
          <span>${escapeHtml(currentUser?.name || currentUser?.username || "")}</span>
          <button class="ghost" data-action="logout">退出</button>
        </div>
      </header>
      <main class="app-main ${state.view === "map" ? "map-mode" : ""}">
        ${renderCurrentView()}
      </main>
      ${state.siteForm ? renderSiteForm() : ""}
    </div>
  `;
  bindEvents();
  if (state.view === "map" && !state.loading && !state.error) {
    requestAnimationFrame(renderRealMap);
  } else if (map) {
    map.remove();
    map = null;
  }
}

function renderLoginView() {
  return `
    <main class="login-page">
      <form id="loginForm" class="login-card">
        <div class="brand login-brand">
          <strong>知兔</strong>
          <span>快享市场地图</span>
        </div>
        <h1>正式版工作台</h1>
        <p>站点、拜访、车辆、合同、收款和售后统一管理。</p>
        <label>账号<input name="username" autocomplete="username" value="admin" /></label>
        <label>密码<input name="password" type="password" autocomplete="current-password" value="admin123" /></label>
        ${state.loginError ? `<p class="form-error">${escapeHtml(state.loginError)}</p>` : ""}
        <button class="primary-action" type="submit">登录</button>
      </form>
    </main>
  `;
}

function renderCurrentView() {
  if (state.loading) return `<section class="page"><div class="panel"><p class="empty">正在连接数据库...</p></div></section>`;
  if (state.error) return `<section class="page"><div class="panel"><p class="empty">加载失败：${escapeHtml(state.error)}</p></div></section>`;
  if (state.view === "discovery") return renderDiscoveryView();
  if (state.view === "followups") return renderFollowupsView();
  if (state.view === "today") return renderTodayView();
  if (state.view === "sites") return renderSitesView();
  if (state.view === "assistant") return renderAssistantView();
  if (state.view === "assets") return renderAssetsView();
  if (state.view === "dashboard") return renderDashboardView();
  if (state.view === "settings") return renderSettingsView();
  return renderMapView();
}

function renderMapView() {
  const visibleSites = filteredSites();
  const selected = getSelectedSite();
  return `
    <section class="map-shell">
      <div class="map-panel">
        <div id="mapCanvas" class="map-canvas"></div>
        <div class="map-title">
          <strong>郑州快递站点</strong>
          <span>${visibleSites.length} / ${sites.length} 个站点</span>
        </div>
        ${renderMapToolbar(visibleSites.length, selected)}
        ${state.mapPanel === "locate" ? renderMapLocator() : ""}
        ${state.mapPanel === "sites" ? `
        <div class="map-search-card map-drawer">
          ${renderSearchControls()}
          <div class="site-list compact">
            ${visibleSites.length ? visibleSites.map(renderSiteListItem).join("") : renderEmpty("没有匹配的站点")}
          </div>
        </div>` : ""}
        <div class="route-floating">
          <div>
            <strong>今日拜访路线</strong>
            <span>${routeSites().length} 个站点 · 约 ${estimatedDistance()} 公里 · ${estimatedHours()} 小时</span>
          </div>
          <button data-action="autoRoute">自动规划</button>
        </div>
        <div class="map-legend">
          ${companyMeta.slice(0, 10).map((item) => `
            <span><i class="legend-dot marker-${item.shape}" style="--color:${item.color}"></i>${escapeHtml(item.label)}</span>
          `).join("")}
        </div>
        ${state.mapPanel === "detail" ? `
        <aside class="detail-panel map-detail">
          ${renderSiteDetail(selected)}
        </aside>` : ""}
      </div>
    </section>
  `;
}

function renderMapToolbar(visibleCount, selected) {
  const selectedName = selected?.name || "未选站点";
  const tools = [
    ["sites", "站点", `${visibleCount}/${sites.length}`],
    ["locate", "定位", "找地址"],
    ["detail", "详情", selectedName],
  ];
  return `
    <div class="map-toolbar" aria-label="地图工具">
      ${tools.map(([panel, label, meta]) => `
        <button
          class="${state.mapPanel === panel ? "active" : ""}"
          data-action="toggleMapPanel"
          data-panel="${panel}"
          title="${escapeHtml(label)}"
        >
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(meta)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMapLocator() {
  return `
    <div class="map-locator-card map-drawer">
      <div class="locator-title">
        <strong>地图定位</strong>
        <span>搜索地址或现场取点</span>
      </div>
      <div class="locator-search">
        <input id="mapLocateInput" value="${escapeHtml(state.mapSearch)}" placeholder="输入站点名、路口、地址" />
        <button data-action="locateMapSearch">搜索定位</button>
        <button class="secondary" data-action="useCurrentLocationMap">当前位置新增</button>
      </div>
      ${state.mapMessage ? `<p class="locator-message">${escapeHtml(state.mapMessage)}</p>` : ""}
      ${state.mapSearchResults.length ? `
        <div class="locator-results">
          ${state.mapSearchResults.slice(0, 5).map((item, index) => renderLocatorResult(item, index)).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderLocatorResult(item, index) {
  return `
    <article>
      <button data-action="focusSearchResult" data-result-index="${index}">
        <strong>${escapeHtml(item.name || "定位结果")}</strong>
        <span>${escapeHtml(item.address || `${Number(item.lat).toFixed(6)}, ${Number(item.lng).toFixed(6)}`)}</span>
      </button>
      <button data-action="createSiteAtLocation" data-result-index="${index}">新增</button>
    </article>
  `;
}

function renderRealMap() {
  const container = document.querySelector("#mapCanvas");
  if (!container) return;
  if (!window.L) {
    container.innerHTML = `<div class="map-fallback">地图资源加载失败，请检查网络后刷新。</div>`;
    return;
  }
  if (map) {
    map.remove();
    map = null;
  }

  map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
  }).setView([34.7466, 113.6254], 11);

  L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
    subdomains: "1234",
    maxZoom: 19,
    attribution: "&copy; 高德地图",
  }).addTo(map);

  const bounds = [];
  filteredSites().forEach((site) => {
    if (!Number.isFinite(Number(site.lat)) || !Number.isFinite(Number(site.lng))) return;
    const company = companyFor(site);
    const marker = L.marker([site.lat, site.lng], {
      icon: L.divIcon({
        className: "crm-marker-wrap",
        html: `
          <div
            class="crm-marker-dot marker-${company.shape || "circle"} ${state.selectedSiteId === site.id ? "selected" : ""}"
            style="--color:${company.color}"
            title="${escapeHtml(site.name)}"
          ></div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(map);
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      state.selectedSiteId = site.id;
      state.mapFocus = { lat: site.lat, lng: site.lng, label: site.name, zoom: 15 };
      state.mapPanel = "detail";
      render();
    });
    bounds.push([site.lat, site.lng]);
  });

  const routePoints = routeSites()
    .filter((site) => Number.isFinite(Number(site.lat)) && Number.isFinite(Number(site.lng)))
    .map((site) => [site.lat, site.lng]);
  if (routePoints.length >= 2) {
    routeLayer = L.polyline(routePoints, {
      color: "#17202a",
      weight: 4,
      opacity: 0.62,
      dashArray: "8 9",
    }).addTo(map);
    bounds.push(...routePoints);
  } else {
    routeLayer = null;
  }

  if (state.mapFocus) {
    L.circleMarker([state.mapFocus.lat, state.mapFocus.lng], {
      radius: 12,
      color: "#256fd8",
      weight: 3,
      fillColor: "#256fd8",
      fillOpacity: 0.18,
    }).addTo(map).bindTooltip(state.mapFocus.label || "定位点", {
      permanent: false,
      direction: "top",
    });
  }

  map.on("click", (event) => {
    state.siteForm = {
      mode: "new",
      lat: Number(event.latlng.lat.toFixed(6)),
      lng: Number(event.latlng.lng.toFixed(6)),
    };
    render();
  });

  if (bounds.length) {
    map.fitBounds(bounds, mapFitOptions());
  }
  if (state.mapFocus) {
    map.setView([state.mapFocus.lat, state.mapFocus.lng], state.mapFocus.zoom || 16);
  }
  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    if (state.mapFocus) {
      map.setView([state.mapFocus.lat, state.mapFocus.lng], state.mapFocus.zoom || 16);
    } else if (bounds.length) {
      map.fitBounds(bounds, mapFitOptions());
    }
  }, 80);
}

function mapFitOptions() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    return { padding: [140, 140], maxZoom: 12 };
  }
  return { padding: [80, 80], maxZoom: 13 };
}

function renderSearchControls() {
  return `
    <div class="search-box">
      <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="搜索站点、品牌、区域、联系人" />
      <button data-action="clearSearch" title="清空搜索">清空</button>
    </div>
    <div class="quick-filters">
      ${renderFilter("all", "全部")}
      ${Object.entries(statusMeta).map(([key, item]) => renderFilter(key, item.label)).join("")}
    </div>
  `;
}

function renderFilter(key, label) {
  return `<button class="filter ${state.filter === key ? "active" : ""}" data-filter="${key}">${escapeHtml(label)}</button>`;
}

function renderSiteListItem(site) {
  const meta = statusMeta[site.status] || statusMeta.target;
  const company = companyFor(site);
  return `
    <button class="site-list-item ${state.selectedSiteId === site.id ? "active" : ""}" data-action="selectSite" data-site-id="${site.id}">
      <i style="--color:${company.color}"></i>
      <span>
        <strong>${escapeHtml(site.name)}</strong>
        <em>${escapeHtml(site.district)} · ${escapeHtml(site.brand)} · ${escapeHtml(meta.label)}</em>
      </span>
    </button>
  `;
}

function renderSiteDetail(site) {
  if (!site) return renderEmpty("还没有站点数据");
  const meta = statusMeta[site.status] || statusMeta.target;
  const siteVisits = visits
    .filter((visit) => visit.siteId === site.id)
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const inRoute = state.routeIds.includes(site.id);
  return `
    <div class="site-head">
      <div>
        <span class="status-pill" style="--color:${meta.color}">${escapeHtml(meta.label)}</span>
        <h2>${escapeHtml(site.name)}</h2>
        <p>${escapeHtml(site.address || "地址待补充")}</p>
      </div>
      <strong class="intent-badge">${escapeHtml(site.intentLevel || "未知")}</strong>
    </div>
    <div class="metrics">
      <div><strong>${Number(site.currentVehicles) || 0}</strong><span>现有车辆</span></div>
      <div><strong>${Number(site.competitorVehicles) || 0}</strong><span>竞品车辆</span></div>
      <div><strong>${Number(site.potentialVehicles) || 0}</strong><span>潜在需求</span></div>
    </div>
    <dl class="info-list">
      <dt>联系人</dt><dd>${escapeHtml(site.contact || "待补充")}</dd>
      <dt>电话</dt><dd>${escapeHtml(site.phone || "待补充")}</dd>
      <dt>坐标</dt><dd>${Number(site.lat).toFixed(5)}, ${Number(site.lng).toFixed(5)}</dd>
      <dt>上次拜访</dt><dd>${escapeHtml(site.lastVisit || "未拜访")}</dd>
      <dt>下次跟进</dt><dd>${escapeHtml(site.nextFollow || "待设置")}</dd>
      <dt>关注点</dt><dd>${escapeHtml((site.concerns || []).join("、") || "待确认")}</dd>
      <dt>备注</dt><dd>${escapeHtml(site.note || "无")}</dd>
    </dl>
    <div class="actions">
      <button data-action="${inRoute ? "removeFromRoute" : "addToRoute"}" data-site-id="${site.id}">
        ${inRoute ? "移出路线" : "加入路线"}
      </button>
      <button class="secondary" data-action="recordVisit" data-site-id="${site.id}">记录拜访</button>
      <button class="ghost" data-action="editSite" data-site-id="${site.id}">编辑</button>
    </div>
    <div class="visit-history">
      <h3>拜访记录</h3>
      ${siteVisits.length ? siteVisits.slice(0, 4).map(renderVisitItem).join("") : "<p class=\"empty\">暂无拜访记录</p>"}
    </div>
  `;
}

function renderVisitItem(visit) {
  return `
    <article class="visit-item">
      <div>
        <strong>${escapeHtml(visit.time)} · ${escapeHtml(visit.result || "已记录")}</strong>
        <p>${escapeHtml(visit.summary || "")}</p>
      </div>
      ${visit.nextFollowDate ? `<span>${escapeHtml(visit.nextFollowDate)}</span>` : ""}
    </article>
  `;
}

function renderDiscoveryView() {
  const discovery = state.discovery;
  const selectedCount = discovery.selected.size;
  const availableCount = discovery.results.filter((item) => !item.imported).length;
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">高德 POI 站点线索</p>
          <h1>站点发现</h1>
        </div>
        <button class="primary-action" data-action="searchDiscovery" ${discovery.loading ? "disabled" : ""}>${discovery.loading ? "搜索中" : "搜索线索"}</button>
      </div>
      <div class="panel discovery-panel">
        <div class="discovery-form">
          <label>城市<input id="discoveryCity" value="${escapeHtml(discovery.city)}" /></label>
          <label>区域
            <select id="discoveryDistrict">
              ${zhengzhouDistricts.map((district) => `<option value="${escapeHtml(district)}" ${discovery.district === district ? "selected" : ""}>${escapeHtml(district || "全郑州")}</option>`).join("")}
            </select>
          </label>
          <label>品牌
            <select id="discoveryBrand">
              ${discoveryBrands.map((brand) => `<option value="${escapeHtml(brand)}" ${discovery.brand === brand ? "selected" : ""}>${escapeHtml(brand)}</option>`).join("")}
            </select>
          </label>
          <label>自定义关键词<input id="discoveryKeyword" value="${escapeHtml(discovery.keyword)}" placeholder="不填则按品牌搜索" /></label>
          <label>页数
            <select id="discoveryPages">
              ${[1, 2, 3, 5, 10].map((page) => `<option value="${page}" ${Number(discovery.pages) === page ? "selected" : ""}>${page} 页</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="discovery-actions">
          <span>${discovery.results.length ? `${discovery.results.length} 条候选，${availableCount} 条可导入，已选 ${selectedCount} 条` : "搜索高德 POI 后，勾选确认再导入 CRM"}</span>
          <div>
            <button class="ghost" data-action="selectAllDiscovery">选择可导入</button>
            <button class="primary-action" data-action="importDiscovery" ${selectedCount ? "" : "disabled"}>导入选中</button>
          </div>
        </div>
        ${discovery.message ? `<p class="locator-message">${escapeHtml(discovery.message)}</p>` : ""}
      </div>
      <div class="discovery-list">
        ${discovery.results.length ? discovery.results.map(renderDiscoveryItem).join("") : renderEmpty("还没有候选站点")}
      </div>
    </section>
  `;
}

function renderDiscoveryItem(item) {
  const checked = state.discovery.selected.has(item.id);
  const company = companyFor(item);
  return `
    <article class="discovery-item ${item.imported ? "imported" : ""}">
      <label>
        <input type="checkbox" data-action="toggleDiscoveryItem" data-poi-id="${escapeHtml(item.id)}" ${checked ? "checked" : ""} ${item.imported ? "disabled" : ""} />
        <i class="legend-dot marker-${company.shape || "circle"}" style="--color:${company.color}"></i>
      </label>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.brand || "未识别品牌")} · ${escapeHtml(item.district || "未知区域")} · ${escapeHtml(item.type || "POI")}</span>
        <p>${escapeHtml(item.address || "无地址")} ${item.phone ? ` · ${escapeHtml(item.phone)}` : ""}</p>
      </div>
      <b>${item.imported ? "已存在" : "可导入"}</b>
    </article>
  `;
}

function renderTodayView() {
  const planned = routeSites();
  const candidates = sites
    .filter((site) => !state.routeIds.includes(site.id) && site.status !== "paused")
    .sort((a, b) => routeScore(b) - routeScore(a));
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${todayIso()}</p>
          <h1>今日拜访</h1>
        </div>
        <button class="primary-action" data-action="autoRoute">自动规划</button>
      </div>
      <div class="summary-strip">
        <div><strong>${planned.length}</strong><span>计划站点</span></div>
        <div><strong>${estimatedDistance()}</strong><span>预计公里</span></div>
        <div><strong>${estimatedHours()}</strong><span>预计小时</span></div>
        <div><strong>${dueSites().length}</strong><span>应跟进</span></div>
      </div>
      <div class="two-column">
        <section class="panel">
          <div class="panel-title">
            <h2>路线顺序</h2>
            <button class="ghost" data-action="clearRoute">清空</button>
          </div>
          <ol class="route-list">
            ${planned.length ? planned.map((site, index) => `
              <li>
                <span>${index + 1}</span>
                <button data-action="selectSite" data-site-id="${site.id}">
                  <strong>${escapeHtml(site.name)}</strong>
                  <em>${escapeHtml(site.district)} · ${escapeHtml(site.brand)} · ${escapeHtml(site.nextFollow || "待设置")}</em>
                </button>
                <button class="icon-button" data-action="removeFromRoute" data-site-id="${site.id}" title="移出路线">×</button>
              </li>
            `).join("") : "<p class=\"empty\">还没有路线，点击自动规划或从站点详情加入。</p>"}
          </ol>
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>推荐补充</h2>
          </div>
          <div class="candidate-list">
            ${candidates.slice(0, 8).map((site) => `
              <article>
                <div>
                  <strong>${escapeHtml(site.name)}</strong>
                  <span>${escapeHtml(statusLabel(site.status))} · ${escapeHtml(site.intentLevel)}意向 · ${escapeHtml(site.nextFollow || "待设置")}</span>
                </div>
                <button data-action="addToRoute" data-site-id="${site.id}">加入</button>
              </article>
            `).join("") || "<p class=\"empty\">暂无可补充站点</p>"}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderFollowupsView() {
  const overdue = sites
    .filter((site) => site.nextFollow && site.nextFollow < todayIso() && site.status !== "paused")
    .sort((a, b) => String(a.nextFollow).localeCompare(String(b.nextFollow)));
  const today = sites
    .filter((site) => site.nextFollow === todayIso() && site.status !== "paused")
    .sort((a, b) => routeScore(b) - routeScore(a));
  const upcoming = sites
    .filter((site) => site.nextFollow > todayIso() && site.nextFollow <= addDays(7) && site.status !== "paused")
    .sort((a, b) => String(a.nextFollow).localeCompare(String(b.nextFollow)));
  const noPlan = sites.filter((site) => !site.nextFollow && site.status !== "paused").slice(0, 8);
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${todayIso()}</p>
          <h1>跟进工作台</h1>
        </div>
        <button class="primary-action" data-action="routeDueSites">把应跟进加入路线</button>
      </div>
      <div class="summary-strip">
        <div><strong>${overdue.length}</strong><span>逾期未跟进</span></div>
        <div><strong>${today.length}</strong><span>今日应跟进</span></div>
        <div><strong>${upcoming.length}</strong><span>7 天内跟进</span></div>
        <div><strong>${noPlan.length}</strong><span>未设计划</span></div>
      </div>
      <div class="followup-grid">
        ${renderFollowupPanel("逾期未跟进", overdue, "danger-list")}
        ${renderFollowupPanel("今日应跟进", today)}
        ${renderFollowupPanel("即将跟进", upcoming)}
        ${renderFollowupPanel("未设置下次跟进", noPlan)}
      </div>
    </section>
  `;
}

function renderFollowupPanel(title, rows, extraClass = "") {
  return `
    <section class="panel followup-panel ${extraClass}">
      <div class="panel-title"><h2>${escapeHtml(title)}</h2></div>
      <div class="work-list">
        ${rows.length ? rows.map((site) => `
          <article>
            <div>
              <strong>${escapeHtml(site.name)}</strong>
              <span>${escapeHtml(site.district)} · ${escapeHtml(statusLabel(site.status))} · ${escapeHtml(site.intentLevel || "未知")} · ${escapeHtml(site.nextFollow || "未设置")}</span>
            </div>
            <div class="row-actions">
              <button data-action="addToRoute" data-site-id="${site.id}">路线</button>
              <button class="secondary" data-action="recordVisit" data-site-id="${site.id}">记录</button>
              <button class="ghost" data-action="completeFollowup" data-site-id="${site.id}">+7天</button>
            </div>
          </article>
        `).join("") : renderEmpty("暂无记录")}
      </div>
    </section>
  `;
}

function renderSitesView() {
  const visibleSites = filteredSites();
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">SQLite 数据库</p>
          <h1>站点管理</h1>
        </div>
        <button class="primary-action" data-action="newSite">新增站点</button>
      </div>
      <div class="panel">
        ${renderSearchControls()}
        <div class="site-table">
          <div class="site-table-head">
            <span>站点</span><span>状态</span><span>车辆</span><span>下次跟进</span><span></span>
          </div>
          ${visibleSites.length ? visibleSites.map((site) => `
            <article class="${state.selectedSiteId === site.id ? "active" : ""}">
              <button class="site-name-cell" data-action="selectSite" data-site-id="${site.id}">
                <strong>${escapeHtml(site.name)}</strong>
                <span>${escapeHtml(site.district)} · ${escapeHtml(site.brand)} · ${escapeHtml(site.contact || "待补充")}</span>
              </button>
              <span>${escapeHtml(statusLabel(site.status))}</span>
              <span>${Number(site.currentVehicles) || 0} / ${Number(site.potentialVehicles) || 0}</span>
              <span>${escapeHtml(site.nextFollow || "待设置")}</span>
              <button class="ghost" data-action="editSite" data-site-id="${site.id}">编辑</button>
            </article>
          `).join("") : renderEmpty("没有匹配的站点")}
        </div>
      </div>
    </section>
  `;
}

function renderAssistantView() {
  const selected = getSelectedSite();
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">当前站点：${escapeHtml(selected?.name || "未选择")}</p>
          <h1>拜访助手</h1>
        </div>
        <button class="ghost" data-action="useSelectedSite">带入当前站点</button>
      </div>
      <div class="assistant-grid">
        <section class="panel input-panel">
          <textarea id="visitText" placeholder="例如：今天去了郑东新区顺丰众意西路站，王老板现在有 12 台车，其中 5 台是别家的，觉得 480 一台能接受，担心维修响应，让我周五再联系，可能先换 3 台。">${escapeHtml(state.visitText)}</textarea>
          <div class="actions">
            <button data-action="startSpeech">开始语音</button>
            <button class="secondary" data-action="extractVisit">整理信息</button>
          </div>
        </section>
        <section class="panel">
          ${state.extracted ? renderExtracted(state.extracted) : renderEmpty("整理后的字段会显示在这里，确认后写入 SQLite 拜访记录。")}
        </section>
      </div>
    </section>
  `;
}

function renderExtracted(data) {
  return `
    <form id="visitForm" class="extracted">
      <input type="hidden" name="siteId" value="${Number(data.siteId) || state.selectedSiteId || ""}" />
      <label>站点名称<input name="siteName" value="${escapeHtml(data.siteName)}" /></label>
      <label>联系人<input name="contactName" value="${escapeHtml(data.contactName)}" /></label>
      <label>当前车辆<input name="currentVehicles" type="number" value="${Number(data.currentVehicles) || 0}" /></label>
      <label>竞品车辆<input name="competitorVehicles" type="number" value="${Number(data.competitorVehicles) || 0}" /></label>
      <label>潜在需求<input name="potentialVehicles" type="number" value="${Number(data.potentialVehicles) || 0}" /></label>
      <label>意向等级
        <select name="intentLevel">
          ${["高", "中", "低", "未知", "待判断"].map((level) => `<option ${data.intentLevel === level ? "selected" : ""}>${level}</option>`).join("")}
        </select>
      </label>
      <label>客户顾虑<input name="concerns" value="${escapeHtml(data.concerns)}" /></label>
      <label>报价信息<input name="quote" value="${escapeHtml(data.quote)}" /></label>
      <label>下次动作<input name="nextAction" value="${escapeHtml(data.nextAction)}" /></label>
      <label>下次跟进<input name="nextFollowDate" type="date" value="${escapeHtml(data.nextFollowDate || todayIso())}" /></label>
      <label class="wide">客户需求<textarea name="needs">${escapeHtml(data.needs || "")}</textarea></label>
      <label class="wide">拜访摘要<textarea name="summary">${escapeHtml(data.summary)}</textarea></label>
      <button class="primary-action wide" type="submit">保存到数据库</button>
    </form>
  `;
}

function renderAssetsView() {
  const idleVehicles = vehicles.filter((item) => item.status === "idle").length;
  const activeContracts = contracts.filter((item) => item.status === "active").length;
  const unpaidTotal = payments
    .filter((item) => item.status !== "paid")
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paidAmount || 0)), 0);
  const openTickets = serviceTickets.filter((item) => item.status !== "resolved").length;
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">车辆、合同、租金、售后</p>
          <h1>经营资产</h1>
        </div>
      </div>
      <div class="summary-strip">
        <div><strong>${vehicles.length}</strong><span>车辆总数</span></div>
        <div><strong>${idleVehicles}</strong><span>空闲车辆</span></div>
        <div><strong>${activeContracts}</strong><span>有效合同</span></div>
        <div><strong>${money(unpaidTotal)}</strong><span>待收租金</span></div>
      </div>
      <div class="asset-grid">
        ${renderVehiclePanel()}
        ${renderContractPanel()}
        ${renderPaymentPanel()}
        ${renderServicePanel(openTickets)}
      </div>
    </section>
  `;
}

function renderSiteOptions(selected = "") {
  return `<option value="">选择站点</option>${sites.map((site) => `<option value="${site.id}" ${Number(selected) === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("")}`;
}

function renderVehicleOptions(selected = "") {
  return `<option value="">不关联车辆</option>${vehicles.map((vehicle) => `<option value="${vehicle.id}" ${Number(selected) === vehicle.id ? "selected" : ""}>${escapeHtml(vehicle.code)}${vehicle.plate ? ` · ${escapeHtml(vehicle.plate)}` : ""}</option>`).join("")}`;
}

function renderContractOptions(selected = "") {
  return `<option value="">不关联合同</option>${contracts.map((contract) => `<option value="${contract.id}" ${Number(selected) === contract.id ? "selected" : ""}>${escapeHtml(contract.title || `${siteName(contract.siteId)}合同`)}</option>`).join("")}`;
}

function renderVehiclePanel() {
  return `
    <section class="panel asset-panel">
      <div class="panel-title"><h2>车辆台账</h2></div>
      <form id="vehicleForm" class="compact-form">
        <input name="code" placeholder="车辆编号" required />
        <input name="plate" placeholder="车牌/识别码" />
        <input name="model" placeholder="车型" />
        <select name="status">
          <option value="idle">空闲</option>
          <option value="rented">在租</option>
          <option value="repair">维修</option>
          <option value="retired">报废</option>
        </select>
        <select name="siteId">${renderSiteOptions()}</select>
        <input name="monthlyRent" type="number" min="0" placeholder="月租" />
        <button class="primary-action" type="submit">新增车辆</button>
      </form>
      <div class="ops-table">
        ${vehicles.length ? vehicles.slice(0, 10).map((vehicle) => `
          <article>
            <div><strong>${escapeHtml(vehicle.code)}</strong><span>${escapeHtml(vehicle.model || "未填车型")} · ${escapeHtml(vehicleStatusLabel(vehicle.status))}</span></div>
            <span>${escapeHtml(siteName(vehicle.siteId))}</span>
            <span>${money(vehicle.monthlyRent)}</span>
          </article>
        `).join("") : renderEmpty("还没有车辆台账")}
      </div>
    </section>
  `;
}

function renderContractPanel() {
  const expiring = contracts.filter((item) => item.status === "active" && item.endDate && item.endDate <= addDays(30));
  return `
    <section class="panel asset-panel">
      <div class="panel-title"><h2>合同到期</h2><span class="mini-badge">${expiring.length} 个 30 天内到期</span></div>
      <form id="contractForm" class="compact-form">
        <select name="siteId" required>${renderSiteOptions()}</select>
        <input name="title" placeholder="合同名称" />
        <input name="vehicleCount" type="number" min="0" placeholder="车辆数" />
        <input name="startDate" type="date" />
        <input name="endDate" type="date" />
        <input name="monthlyRent" type="number" min="0" placeholder="月租" />
        <input name="deposit" type="number" min="0" placeholder="押金" />
        <button class="primary-action" type="submit">新增合同</button>
      </form>
      <div class="ops-table">
        ${contracts.length ? contracts.slice(0, 10).map((contract) => `
          <article class="${contract.status === "active" && contract.endDate && contract.endDate <= addDays(30) ? "warn-row" : ""}">
            <div><strong>${escapeHtml(contract.title || siteName(contract.siteId))}</strong><span>${escapeHtml(siteName(contract.siteId))} · ${escapeHtml(contract.endDate || "未设到期")}</span></div>
            <span>${contract.vehicleCount || 0} 台</span>
            <button class="ghost" data-action="closeContract" data-contract-id="${contract.id}">${contract.status === "active" ? "结束" : "已结束"}</button>
          </article>
        `).join("") : renderEmpty("还没有合同记录")}
      </div>
    </section>
  `;
}

function renderPaymentPanel() {
  return `
    <section class="panel asset-panel">
      <div class="panel-title"><h2>租金收款</h2></div>
      <form id="paymentForm" class="compact-form">
        <select name="siteId" required>${renderSiteOptions()}</select>
        <select name="contractId">${renderContractOptions()}</select>
        <input name="dueDate" type="date" value="${todayIso()}" />
        <input name="amount" type="number" min="0" placeholder="应收金额" required />
        <input name="note" placeholder="备注" />
        <button class="primary-action" type="submit">新增应收</button>
      </form>
      <div class="ops-table">
        ${payments.length ? payments.slice(0, 10).map((payment) => `
          <article class="${payment.status !== "paid" && payment.dueDate && payment.dueDate < todayIso() ? "warn-row" : ""}">
            <div><strong>${escapeHtml(siteName(payment.siteId))}</strong><span>${escapeHtml(payment.dueDate || "未设日期")} · ${escapeHtml(paymentStatusLabel(payment.status))}</span></div>
            <span>${money(payment.amount)}</span>
            <button class="ghost" data-action="markPaymentPaid" data-payment-id="${payment.id}">${payment.status === "paid" ? "已收" : "标记已收"}</button>
          </article>
        `).join("") : renderEmpty("还没有应收记录")}
      </div>
    </section>
  `;
}

function renderServicePanel(openTickets) {
  return `
    <section class="panel asset-panel">
      <div class="panel-title"><h2>售后工单</h2><span class="mini-badge">${openTickets} 个待处理</span></div>
      <form id="ticketForm" class="compact-form">
        <select name="siteId" required>${renderSiteOptions()}</select>
        <select name="vehicleId">${renderVehicleOptions()}</select>
        <input name="title" placeholder="售后问题" required />
        <select name="priority">
          <option value="normal">普通</option>
          <option value="high">紧急</option>
        </select>
        <input name="summary" placeholder="处理说明" />
        <button class="primary-action" type="submit">新增工单</button>
      </form>
      <div class="ops-table">
        ${serviceTickets.length ? serviceTickets.slice(0, 10).map((ticket) => `
          <article class="${ticket.status !== "resolved" ? "warn-row" : ""}">
            <div><strong>${escapeHtml(ticket.title)}</strong><span>${escapeHtml(siteName(ticket.siteId))} · ${escapeHtml(vehicleName(ticket.vehicleId))}</span></div>
            <span>${escapeHtml(ticketStatusLabel(ticket.status))}</span>
            <button class="ghost" data-action="resolveTicket" data-ticket-id="${ticket.id}">${ticket.status === "resolved" ? "已解决" : "解决"}</button>
          </article>
        `).join("") : renderEmpty("还没有售后记录")}
      </div>
    </section>
  `;
}

function renderDashboardView() {
  const activeCount = sites.filter((site) => site.status === "active").length;
  const intentCount = sites.filter((site) => site.status === "intent").length;
  const targetCount = sites.filter((site) => site.status === "target").length;
  const vehicleTotal = sites.reduce((sum, site) => sum + (Number(site.currentVehicles) || 0), 0);
  const potentialTotal = sites.reduce((sum, site) => sum + (Number(site.potentialVehicles) || 0), 0);
  const idleVehicles = vehicles.filter((item) => item.status === "idle").length;
  const activeContracts = contracts.filter((item) => item.status === "active").length;
  const unpaidAmount = payments.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paidAmount || 0)), 0);
  const openTickets = serviceTickets.filter((item) => item.status !== "resolved").length;
  const month = todayIso().slice(0, 7);
  const monthVisits = visits.filter((visit) => String(visit.time).startsWith(month)).length;
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">来自 SQLite 数据库</p>
          <h1>数据看板</h1>
        </div>
      </div>
      <div class="dashboard-grid">
        ${renderStat("总站点", sites.length)}
        ${renderStat("已合作", activeCount)}
        ${renderStat("有意向", intentCount)}
        ${renderStat("未拜访", targetCount)}
        ${renderStat("现有车辆", vehicleTotal)}
        ${renderStat("潜在需求", potentialTotal)}
        ${renderStat("本月拜访", monthVisits)}
        ${renderStat("即将跟进", dueSites(7).length)}
        ${renderStat("台账车辆", vehicles.length)}
        ${renderStat("空闲车辆", idleVehicles)}
        ${renderStat("有效合同", activeContracts)}
        ${renderStat("待处理售后", openTickets)}
      </div>
      <div class="summary-strip">
        <div><strong>${money(unpaidAmount)}</strong><span>待收租金</span></div>
        <div><strong>${contracts.filter((item) => item.status === "active" && item.endDate && item.endDate <= addDays(30)).length}</strong><span>30 天内到期合同</span></div>
        <div><strong>${payments.filter((item) => item.status !== "paid" && item.dueDate && item.dueDate < todayIso()).length}</strong><span>逾期收款</span></div>
        <div><strong>${backups.length}</strong><span>本机备份</span></div>
      </div>
      <div class="two-column">
        ${renderBarPanel("区域分布", countBy("district"))}
        ${renderBarPanel("品牌分布", countBy("brand"))}
      </div>
    </section>
  `;
}

function renderStat(label, value) {
  return `<article class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></article>`;
}

function renderBarPanel(title, data) {
  const max = Math.max(1, ...Object.values(data));
  return `
    <section class="panel">
      <div class="panel-title"><h2>${escapeHtml(title)}</h2></div>
      <div class="bar-list">
        ${Object.entries(data).map(([label, count]) => `
          <div class="bar-row">
            <span>${escapeHtml(label)}</span>
            <i style="width:${Math.max(8, count / max * 100)}%"></i>
            <b>${count}</b>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSettingsView() {
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">data/app.db</p>
          <h1>数据库与备份</h1>
        </div>
      </div>
      <div class="two-column">
        <section class="panel settings-panel">
          <h2>备份与导出</h2>
          <p>${sites.length} 个站点，${visits.length} 条拜访，${vehicles.length} 台车辆，${contracts.length} 份合同。数据已经写入本机 SQLite 数据库。</p>
          <div class="actions">
            <button data-action="createBackup">立即备份</button>
            <button data-action="exportJson">导出 JSON</button>
            <button class="secondary" data-action="exportCsv">导出拜访 CSV</button>
          </div>
          <div class="backup-list">
            ${backups.length ? backups.slice(0, 6).map((item) => `
              <article>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.createdAt)} · ${(Number(item.size) / 1024).toFixed(1)} KB</span>
              </article>
            `).join("") : renderEmpty("还没有备份文件")}
          </div>
        </section>
        <section class="panel settings-panel">
          <h2>账号与导入</h2>
          <p>当前账号：${escapeHtml(currentUser?.username || "")}。导入 JSON 会覆盖当前业务数据，系统会先自动备份当前数据库。</p>
          <div class="actions">
            <button data-action="chooseImport">导入 JSON</button>
            <input id="importFile" type="file" accept="application/json,.json" hidden />
          </div>
          <p>生产环境请通过环境变量修改默认账号密码：KXSL_ADMIN_USER、KXSL_ADMIN_PASSWORD。</p>
        </section>
      </div>
      ${currentUser?.role === "owner" ? renderUserAdminPanel() : ""}
    </section>
  `;
}

function renderUserAdminPanel() {
  return `
    <section class="panel settings-panel user-admin-panel">
      <div class="panel-title">
        <h2>账号开通</h2>
        <span class="mini-badge">${users.length} 个账号</span>
      </div>
      <form id="userForm" class="compact-form">
        <input name="username" placeholder="登录账号" required />
        <input name="name" placeholder="姓名/备注" />
        <input name="password" type="password" placeholder="初始密码，至少 6 位" required />
        <select name="role">
          <option value="sales">业务员</option>
          <option value="viewer">只读查看</option>
          <option value="owner">老板/管理员</option>
        </select>
        <button class="primary-action" type="submit">开通账号</button>
      </form>
      <div class="ops-table">
        ${users.length ? users.map((user) => `
          <article>
            <div>
              <strong>${escapeHtml(user.username)}</strong>
              <span>${escapeHtml(user.name || "未填写姓名")}</span>
            </div>
            <span>${escapeHtml(roleLabel(user.role))}</span>
          </article>
        `).join("") : renderEmpty("还没有账号")}
      </div>
    </section>
  `;
}

function renderSiteForm() {
  const editing = state.siteForm.mode === "edit";
  const site = editing ? getSiteById(state.siteForm.id) : {
    name: state.siteForm.name || "",
    brand: state.siteForm.brand || "",
    district: state.siteForm.district || "",
    address: state.siteForm.address || "",
    status: "target",
    contact: "",
    phone: "",
    currentVehicles: 0,
    competitorVehicles: 0,
    potentialVehicles: 0,
    intentLevel: "未知",
    lastVisit: "",
    nextFollow: todayIso(),
    concerns: [],
    note: "",
    lat: state.siteForm.lat || 34.7466,
    lng: state.siteForm.lng || 113.6254,
  };
  if (!site) return "";
  return `
    <div class="modal-backdrop" data-action="closeModal">
      <form id="siteForm" class="modal" data-mode="${state.siteForm.mode}" data-site-id="${site.id || ""}">
        <div class="modal-head">
          <h2>${editing ? "编辑站点" : "新增站点"}</h2>
          <button type="button" class="icon-button" data-action="closeModal">×</button>
        </div>
        <div class="form-grid">
          <label>站点名称<input name="name" required value="${escapeHtml(site.name)}" /></label>
          <label>快递品牌<input name="brand" required value="${escapeHtml(site.brand)}" /></label>
          <label>行政区<input name="district" required value="${escapeHtml(site.district)}" /></label>
          <label>合作状态
            <select name="status">
              ${Object.entries(statusMeta).map(([key, item]) => `<option value="${key}" ${site.status === key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
            </select>
          </label>
          <label class="wide">详细地址<input name="address" value="${escapeHtml(site.address)}" /></label>
          <label>联系人<input name="contact" value="${escapeHtml(site.contact)}" /></label>
          <label>手机号<input name="phone" value="${escapeHtml(site.phone)}" /></label>
          <label>当前车辆<input name="currentVehicles" type="number" min="0" value="${Number(site.currentVehicles) || 0}" /></label>
          <label>竞品车辆<input name="competitorVehicles" type="number" min="0" value="${Number(site.competitorVehicles) || 0}" /></label>
          <label>潜在需求<input name="potentialVehicles" type="number" min="0" value="${Number(site.potentialVehicles) || 0}" /></label>
          <label>意向等级
            <select name="intentLevel">
              ${["高", "中", "低", "未知", "待判断"].map((level) => `<option ${site.intentLevel === level ? "selected" : ""}>${level}</option>`).join("")}
            </select>
          </label>
          <label>上次拜访<input name="lastVisit" type="date" value="${escapeHtml(site.lastVisit || "")}" /></label>
          <label>下次跟进<input name="nextFollow" type="date" value="${escapeHtml(site.nextFollow || "")}" /></label>
          <div class="wide location-tools">
            <div>
              <strong>坐标定位</strong>
              <span>可现场获取当前位置，也可按上方地址搜索填入经纬度。</span>
            </div>
            <button type="button" data-action="useCurrentLocationForm">当前位置</button>
            <button type="button" class="secondary" data-action="geocodeFormAddress">按地址定位</button>
          </div>
          <label>纬度<input name="lat" type="number" step="0.000001" value="${Number(site.lat) || 34.7466}" /></label>
          <label>经度<input name="lng" type="number" step="0.000001" value="${Number(site.lng) || 113.6254}" /></label>
          <p id="formLocationMessage" class="form-location-message wide"></p>
          <label class="wide">关注点<input name="concerns" value="${escapeHtml((site.concerns || []).join("、"))}" placeholder="用顿号或逗号分隔" /></label>
          <label class="wide">备注<textarea name="note">${escapeHtml(site.note || "")}</textarea></label>
        </div>
        <div class="modal-actions">
          ${editing ? `<button type="button" class="danger" data-action="deleteSite" data-site-id="${site.id}">删除</button>` : "<span></span>"}
          <div>
            <button type="button" class="ghost" data-action="closeModal">取消</button>
            <button class="primary-action" type="submit">保存</button>
          </div>
        </div>
      </form>
    </div>
  `;
}

function renderEmpty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

function bindLoginEvents() {
  document.querySelector("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      state.loginError = "";
      await apiRequest("/api/login", {
        method: "POST",
        body: {
          username: data.username,
          password: data.password,
        },
      });
      await loadData();
      state.loading = false;
      state.view = "map";
      render();
    } catch (error) {
      state.loginError = error.message || "登录失败";
      render();
    }
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.extracted = null;
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  const searchInput = document.querySelector("#searchInput");
  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value;
    render();
    const nextInput = document.querySelector("#searchInput");
    nextInput?.focus();
    nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
  });

  const mapLocateInput = document.querySelector("#mapLocateInput");
  mapLocateInput?.addEventListener("input", () => {
    state.mapSearch = mapLocateInput.value;
  });
  mapLocateInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runMapSearch();
    }
  });

  const discoveryBindings = [
    ["#discoveryCity", "city"],
    ["#discoveryDistrict", "district"],
    ["#discoveryBrand", "brand"],
    ["#discoveryKeyword", "keyword"],
    ["#discoveryPages", "pages"],
  ];
  discoveryBindings.forEach(([selector, key]) => {
    const input = document.querySelector(selector);
    input?.addEventListener("input", () => {
      state.discovery[key] = key === "pages" ? Number(input.value) : input.value;
    });
    input?.addEventListener("change", () => {
      state.discovery[key] = key === "pages" ? Number(input.value) : input.value;
    });
  });

  const visitText = document.querySelector("#visitText");
  visitText?.addEventListener("input", () => {
    state.visitText = visitText.value;
  });

  document.querySelector("#siteForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSiteForm(event.currentTarget);
  });
  document.querySelector("#visitForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveVisitForm(event.currentTarget);
  });
  document.querySelector("#vehicleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveVehicleForm(event.currentTarget);
  });
  document.querySelector("#contractForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveContractForm(event.currentTarget);
  });
  document.querySelector("#paymentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePaymentForm(event.currentTarget);
  });
  document.querySelector("#ticketForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveTicketForm(event.currentTarget);
  });
  document.querySelector("#userForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveUserForm(event.currentTarget);
  });
  document.querySelector("#importFile")?.addEventListener("change", importJsonFile);

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      handleAction(event);
    });
  });
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  const siteId = Number(event.currentTarget.dataset.siteId);
  const contractId = Number(event.currentTarget.dataset.contractId);
  const paymentId = Number(event.currentTarget.dataset.paymentId);
  const ticketId = Number(event.currentTarget.dataset.ticketId);

  if (action === "logout") {
    await apiRequest("/api/logout", { method: "POST", body: {} });
    state.authenticated = false;
    currentUser = null;
    render();
    return;
  }

  if (action === "toggleMapPanel") {
    const panel = event.currentTarget.dataset.panel;
    state.mapPanel = state.mapPanel === panel ? "" : panel;
    render();
    return;
  }

  if (action === "searchDiscovery") {
    await searchDiscovery();
    return;
  }

  if (action === "toggleDiscoveryItem") {
    const poiId = event.currentTarget.dataset.poiId;
    if (event.currentTarget.checked) {
      state.discovery.selected.add(poiId);
    } else {
      state.discovery.selected.delete(poiId);
    }
    render();
    return;
  }

  if (action === "selectAllDiscovery") {
    const next = new Set();
    state.discovery.results.forEach((item) => {
      if (!item.imported) next.add(item.id);
    });
    state.discovery.selected = next;
    render();
    return;
  }

  if (action === "importDiscovery") {
    await importDiscovery();
    return;
  }

  if (action === "closeModal") {
    if (event.currentTarget.classList.contains("modal-backdrop") && event.target !== event.currentTarget) return;
    state.siteForm = null;
    render();
    return;
  }

  if (action === "newSite") {
    state.siteForm = { mode: "new" };
    render();
    return;
  }

  if (action === "editSite") {
    state.siteForm = { mode: "edit", id: siteId };
    render();
    return;
  }

  if (action === "deleteSite") {
    await deleteSite(siteId);
    return;
  }

  if (action === "selectSite") {
    state.selectedSiteId = siteId;
    const site = getSiteById(siteId);
    if (site) state.mapFocus = { lat: site.lat, lng: site.lng, label: site.name, zoom: 15 };
    if (state.view === "today" || state.view === "sites") state.view = "map";
    state.mapPanel = "detail";
    render();
    return;
  }

  if (action === "locateMapSearch") {
    await runMapSearch();
    return;
  }

  if (action === "focusSearchResult") {
    focusSearchResult(Number(event.currentTarget.dataset.resultIndex));
    return;
  }

  if (action === "createSiteAtLocation") {
    createSiteAtLocation(Number(event.currentTarget.dataset.resultIndex));
    return;
  }

  if (action === "useCurrentLocationMap") {
    await createSiteAtCurrentLocation();
    return;
  }

  if (action === "useCurrentLocationForm") {
    await fillFormWithCurrentLocation();
    return;
  }

  if (action === "geocodeFormAddress") {
    await geocodeFormAddress();
    return;
  }

  if (action === "addToRoute") {
    await setRoute([...new Set([...state.routeIds, siteId])]);
    return;
  }

  if (action === "removeFromRoute") {
    await setRoute(state.routeIds.filter((id) => id !== siteId));
    return;
  }

  if (action === "autoRoute") {
    const nextRoute = sites
      .filter((site) => site.status !== "paused")
      .sort((a, b) => routeScore(b) - routeScore(a))
      .slice(0, 5)
      .map((site) => site.id);
    await setRoute(nextRoute);
    return;
  }

  if (action === "routeDueSites") {
    const due = sites
      .filter((site) => site.nextFollow && site.nextFollow <= todayIso() && site.status !== "paused")
      .sort((a, b) => routeScore(b) - routeScore(a))
      .slice(0, 8)
      .map((site) => site.id);
    await setRoute([...new Set([...state.routeIds, ...due])]);
    state.view = "today";
    render();
    return;
  }

  if (action === "completeFollowup") {
    await completeFollowup(siteId);
    return;
  }

  if (action === "clearRoute") {
    await setRoute([]);
    return;
  }

  if (action === "recordVisit") {
    const site = getSiteById(siteId);
    state.selectedSiteId = siteId;
    state.view = "assistant";
    state.visitText = site ? `今天拜访了${site.name}，` : "";
    state.extracted = null;
    render();
    return;
  }

  if (action === "useSelectedSite") {
    const site = getSelectedSite();
    state.visitText = site ? `今天拜访了${site.name}，` : "";
    state.extracted = null;
    render();
    return;
  }

  if (action === "extractVisit") {
    const text = document.querySelector("#visitText")?.value.trim() || "";
    state.visitText = text;
    state.extracted = extractVisitInfo(text);
    render();
    return;
  }

  if (action === "startSpeech") {
    startSpeech();
    return;
  }

  if (action === "clearSearch") {
    state.query = "";
    render();
    return;
  }

  if (action === "exportJson") {
    window.location.href = "/api/export.json";
    return;
  }

  if (action === "exportCsv") {
    window.location.href = "/api/export/visits.csv";
    return;
  }

  if (action === "createBackup") {
    const data = await apiRequest("/api/backup", { method: "POST", body: {} });
    backups = data.backups || backups;
    render();
    return;
  }

  if (action === "closeContract") {
    await closeContract(contractId);
    return;
  }

  if (action === "markPaymentPaid") {
    await markPaymentPaid(paymentId);
    return;
  }

  if (action === "resolveTicket") {
    await resolveTicket(ticketId);
    return;
  }

  if (action === "chooseImport") {
    document.querySelector("#importFile")?.click();
  }
}

async function runMapSearch() {
  const query = (document.querySelector("#mapLocateInput")?.value || state.mapSearch).trim();
  state.mapSearch = query;
  if (!query) {
    state.mapMessage = "请输入站点名、道路、路口或完整地址。";
    state.mapSearchResults = [];
    render();
    return;
  }
  state.mapMessage = "正在搜索定位...";
  state.mapSearchResults = [];
  render();
  try {
    const data = await apiRequest(`/api/geocode?q=${encodeURIComponent(query)}&city=${encodeURIComponent("郑州")}`);
    state.mapSearchResults = data.results || [];
    if (state.mapSearchResults.length) {
      const first = state.mapSearchResults[0];
      state.mapFocus = {
        lat: Number(first.lat),
        lng: Number(first.lng),
        label: first.name || query,
        zoom: 16,
      };
      state.mapMessage = `找到 ${state.mapSearchResults.length} 个定位结果，可直接新增站点。`;
    } else {
      state.mapMessage = "没有找到定位结果，可以尝试输入更完整的地址或现场获取当前位置。";
    }
  } catch (error) {
    state.mapMessage = `定位失败：${error.message}`;
  }
  render();
}

async function searchDiscovery() {
  state.discovery.city = document.querySelector("#discoveryCity")?.value.trim() || state.discovery.city;
  state.discovery.district = document.querySelector("#discoveryDistrict")?.value || "";
  state.discovery.brand = document.querySelector("#discoveryBrand")?.value || state.discovery.brand;
  state.discovery.keyword = document.querySelector("#discoveryKeyword")?.value.trim() || "";
  state.discovery.pages = Number(document.querySelector("#discoveryPages")?.value || state.discovery.pages || 2);
  state.discovery.loading = true;
  state.discovery.message = "正在调用高德 POI 搜索...";
  state.discovery.results = [];
  state.discovery.selected = new Set();
  render();
  try {
    const data = await apiRequest("/api/discovery/search", {
      method: "POST",
      body: {
        city: state.discovery.city,
        district: state.discovery.district,
        brand: state.discovery.brand,
        keyword: state.discovery.keyword,
        pages: state.discovery.pages,
      },
    });
    state.discovery.results = data.results || [];
    state.discovery.selected = new Set();
    state.discovery.results.forEach((item) => {
      if (!item.imported) state.discovery.selected.add(item.id);
    });
    const available = state.discovery.results.filter((item) => !item.imported).length;
    state.discovery.message = `找到 ${state.discovery.results.length} 条候选，${available} 条可导入。`;
  } catch (error) {
    state.discovery.message = `站点发现失败：${error.message}`;
  }
  state.discovery.loading = false;
  render();
}

async function importDiscovery() {
  const selected = state.discovery.results.filter((item) => state.discovery.selected.has(item.id) && !item.imported);
  if (!selected.length) return;
  if (!confirm(`确认导入 ${selected.length} 个站点为未拜访目标站点？`)) return;
  try {
    const data = await apiRequest("/api/discovery/import", {
      method: "POST",
      body: { items: selected },
    });
    sites = data.sites || sites;
    visits = data.visits || visits;
    vehicles = data.vehicles || vehicles;
    contracts = data.contracts || contracts;
    payments = data.payments || payments;
    serviceTickets = data.serviceTickets || serviceTickets;
    backups = data.backups || backups;
    state.routeIds = data.routeIds || state.routeIds;
    const importedIds = new Set((data.imported || []).map((site) => site.externalId).filter(Boolean));
    state.discovery.results = state.discovery.results.map((item) => importedIds.has(item.id) ? { ...item, imported: true } : item);
    state.discovery.selected = new Set();
    state.discovery.message = `已导入 ${(data.imported || []).length} 个站点，跳过 ${(data.skipped || []).length} 个重复项。`;
    render();
  } catch (error) {
    alert(`导入失败：${error.message}`);
  }
}

function focusSearchResult(index) {
  const item = state.mapSearchResults[index];
  if (!item) return;
  state.mapFocus = {
    lat: Number(item.lat),
    lng: Number(item.lng),
    label: item.name || "定位点",
    zoom: 17,
  };
  render();
}

function createSiteAtLocation(index) {
  const item = state.mapSearchResults[index];
  if (!item) return;
  state.mapFocus = {
    lat: Number(item.lat),
    lng: Number(item.lng),
    label: item.name || "定位点",
    zoom: 17,
  };
  state.siteForm = {
    mode: "new",
    name: item.name || "",
    address: item.address || item.name || "",
    lat: Number(item.lat),
    lng: Number(item.lng),
  };
  render();
}

async function createSiteAtCurrentLocation() {
  state.mapMessage = "正在获取当前位置...";
  render();
  try {
    const position = await getCurrentGcjPosition();
    const item = {
      name: "当前位置",
      address: `浏览器定位，精度约 ${Math.round(position.accuracy || 0)} 米`,
      lat: position.lat,
      lng: position.lng,
      source: "browser",
    };
    state.mapSearchResults = [item];
    state.mapFocus = { lat: item.lat, lng: item.lng, label: item.name, zoom: 17 };
    state.siteForm = {
      mode: "new",
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    };
    state.mapMessage = "已获取当前位置，并带入新增站点表单。";
    render();
  } catch (error) {
    state.mapMessage = `当前位置获取失败：${error.message}`;
    render();
  }
}

async function fillFormWithCurrentLocation() {
  setFormLocationMessage("正在获取当前位置...");
  try {
    const position = await getCurrentGcjPosition();
    fillSiteFormLatLng(position.lat, position.lng);
    setFormLocationMessage(`已填入当前位置，精度约 ${Math.round(position.accuracy || 0)} 米。`);
  } catch (error) {
    setFormLocationMessage(`当前位置获取失败：${error.message}`);
  }
}

async function geocodeFormAddress() {
  const form = document.querySelector("#siteForm");
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  const query = [data.district, data.address, data.name].filter(Boolean).join(" ");
  if (!query.trim()) {
    setFormLocationMessage("请先填写站点名称或详细地址。");
    return;
  }
  setFormLocationMessage("正在按地址定位...");
  try {
    const result = await apiRequest(`/api/geocode?q=${encodeURIComponent(query)}&city=${encodeURIComponent("郑州")}`);
    const first = result.results?.[0];
    if (!first) {
      setFormLocationMessage("没有找到该地址，可尝试写得更具体，或使用当前位置。");
      return;
    }
    fillSiteFormLatLng(first.lat, first.lng, first.address);
    setFormLocationMessage(`已定位到：${first.name || first.address}`);
  } catch (error) {
    setFormLocationMessage(`地址定位失败：${error.message}`);
  }
}

function fillSiteFormLatLng(lat, lng, address = "") {
  const form = document.querySelector("#siteForm");
  if (!form) return;
  const latInput = form.elements.lat;
  const lngInput = form.elements.lng;
  latInput.value = Number(lat).toFixed(6);
  lngInput.value = Number(lng).toFixed(6);
  if (address && !form.elements.address.value.trim()) {
    form.elements.address.value = address;
  }
}

function setFormLocationMessage(message) {
  const element = document.querySelector("#formLocationMessage");
  if (element) element.textContent = message;
}

function getCurrentGcjPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const converted = wgs84ToGcj02(position.coords.latitude, position.coords.longitude);
        resolve({
          lat: Number(converted.lat.toFixed(6)),
          lng: Number(converted.lng.toFixed(6)),
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        const messages = {
          1: "定位权限被拒绝",
          2: "暂时无法获取位置",
          3: "定位超时",
        };
        reject(new Error(messages[error.code] || error.message || "定位失败"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  });
}

async function saveSiteForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const payload = {
    name: data.name.trim(),
    brand: data.brand.trim(),
    district: data.district.trim(),
    address: data.address.trim(),
    status: data.status,
    contact: data.contact.trim(),
    phone: data.phone.trim(),
    currentVehicles: Number(data.currentVehicles) || 0,
    competitorVehicles: Number(data.competitorVehicles) || 0,
    potentialVehicles: Number(data.potentialVehicles) || 0,
    intentLevel: data.intentLevel,
    lastVisit: data.lastVisit,
    nextFollow: data.nextFollow,
    concerns: splitTags(data.concerns),
    note: data.note.trim(),
    lat: Number(data.lat) || 34.7466,
    lng: Number(data.lng) || 113.6254,
  };

  try {
    const editing = form.dataset.mode === "edit";
    const result = await apiRequest(editing ? `/api/sites/${form.dataset.siteId}` : "/api/sites", {
      method: editing ? "PUT" : "POST",
      body: payload,
    });
    await loadData();
    state.selectedSiteId = result.site.id;
    state.siteForm = null;
    state.view = "map";
    render();
  } catch (error) {
    alert(`保存失败：${error.message}`);
  }
}

async function saveVisitForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const site = getSiteById(data.siteId) || sites.find((item) => data.siteName.includes(item.name)) || getSelectedSite();
  if (!site) return;
  const payload = {
    siteId: site.id,
    time: dateTimeText(),
    result: data.intentLevel === "高" ? "高意向" : "已记录",
    summary: data.summary.trim(),
    needs: data.needs.trim(),
    concerns: splitTags(data.concerns),
    quote: data.quote.trim(),
    nextAction: data.nextAction.trim(),
    nextFollowDate: data.nextFollowDate || todayIso(),
    contactName: data.contactName.trim(),
    currentVehicles: Number(data.currentVehicles),
    competitorVehicles: Number(data.competitorVehicles),
    potentialVehicles: Number(data.potentialVehicles),
    intentLevel: data.intentLevel,
  };
  try {
    await apiRequest("/api/visits", { method: "POST", body: payload });
    await loadData();
    state.selectedSiteId = site.id;
    state.visitText = "";
    state.extracted = null;
    state.view = "map";
    render();
  } catch (error) {
    alert(`保存失败：${error.message}`);
  }
}

async function deleteSite(id) {
  const site = getSiteById(id);
  if (!site) return;
  if (!confirm(`确定删除「${site.name}」吗？相关拜访记录也会删除。`)) return;
  try {
    await apiRequest(`/api/sites/${id}`, { method: "DELETE" });
    await loadData();
    state.selectedSiteId = sites[0]?.id || null;
    state.siteForm = null;
    render();
  } catch (error) {
    alert(`删除失败：${error.message}`);
  }
}

async function setRoute(routeIds) {
  state.routeIds = routeIds;
  try {
    await apiRequest("/api/route", { method: "PUT", body: { routeIds } });
    render();
  } catch (error) {
    alert(`路线保存失败：${error.message}`);
    await loadData();
    render();
  }
}

async function completeFollowup(siteId) {
  const site = getSiteById(siteId);
  if (!site) return;
  const payload = {
    ...site,
    lastVisit: todayIso(),
    nextFollow: addDays(7),
  };
  try {
    await apiRequest(`/api/sites/${siteId}`, { method: "PUT", body: payload });
    await loadData();
    render();
  } catch (error) {
    alert(`跟进更新失败：${error.message}`);
  }
}

async function saveVehicleForm(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    await apiRequest("/api/vehicles", {
      method: "POST",
      body: {
        code: data.code.trim(),
        plate: data.plate.trim(),
        model: data.model.trim(),
        status: data.status,
        siteId: data.siteId || null,
        monthlyRent: Number(data.monthlyRent) || 0,
      },
    });
    form.reset();
    await loadData();
    render();
  } catch (error) {
    alert(`车辆保存失败：${error.message}`);
  }
}

async function saveUserForm(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await apiRequest("/api/users", {
      method: "POST",
      body: {
        username: data.username.trim(),
        name: data.name.trim(),
        password: data.password,
        role: data.role,
      },
    });
    users = result.users || users;
    form.reset();
    render();
  } catch (error) {
    alert(`账号开通失败：${error.message}`);
  }
}

async function saveContractForm(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    await apiRequest("/api/contracts", {
      method: "POST",
      body: {
        siteId: Number(data.siteId),
        title: data.title.trim(),
        vehicleCount: Number(data.vehicleCount) || 0,
        startDate: data.startDate,
        endDate: data.endDate,
        monthlyRent: Number(data.monthlyRent) || 0,
        deposit: Number(data.deposit) || 0,
        paymentCycle: "monthly",
        status: "active",
      },
    });
    form.reset();
    await loadData();
    render();
  } catch (error) {
    alert(`合同保存失败：${error.message}`);
  }
}

async function savePaymentForm(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    await apiRequest("/api/payments", {
      method: "POST",
      body: {
        siteId: Number(data.siteId),
        contractId: data.contractId || null,
        dueDate: data.dueDate || todayIso(),
        amount: Number(data.amount) || 0,
        paidAmount: 0,
        status: "unpaid",
        note: data.note.trim(),
      },
    });
    form.reset();
    await loadData();
    render();
  } catch (error) {
    alert(`收款保存失败：${error.message}`);
  }
}

async function saveTicketForm(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    await apiRequest("/api/service-tickets", {
      method: "POST",
      body: {
        siteId: Number(data.siteId),
        vehicleId: data.vehicleId || null,
        title: data.title.trim(),
        priority: data.priority,
        status: "open",
        reportedAt: todayIso(),
        summary: data.summary.trim(),
      },
    });
    form.reset();
    await loadData();
    render();
  } catch (error) {
    alert(`售后保存失败：${error.message}`);
  }
}

async function closeContract(id) {
  const contract = getContractById(id);
  if (!contract || contract.status !== "active") return;
  try {
    await apiRequest(`/api/contracts/${id}`, {
      method: "PUT",
      body: {
        ...contract,
        status: "closed",
      },
    });
    await loadData();
    render();
  } catch (error) {
    alert(`合同更新失败：${error.message}`);
  }
}

async function markPaymentPaid(id) {
  const payment = payments.find((item) => item.id === id);
  if (!payment || payment.status === "paid") return;
  try {
    await apiRequest(`/api/payments/${id}`, {
      method: "PUT",
      body: {
        ...payment,
        paidAmount: Number(payment.amount) || 0,
        paidDate: todayIso(),
        status: "paid",
      },
    });
    await loadData();
    render();
  } catch (error) {
    alert(`收款更新失败：${error.message}`);
  }
}

async function resolveTicket(id) {
  const ticket = serviceTickets.find((item) => item.id === id);
  if (!ticket || ticket.status === "resolved") return;
  try {
    await apiRequest(`/api/service-tickets/${id}`, {
      method: "PUT",
      body: {
        ...ticket,
        status: "resolved",
        resolvedAt: todayIso(),
      },
    });
    await loadData();
    render();
  } catch (error) {
    alert(`售后更新失败：${error.message}`);
  }
}

function routeScore(site) {
  const statusScore = { key: 6, active: 4, intent: 5, target: 3, paused: 0 }[site.status] || 0;
  const intentScore = { 高: 4, 中: 2, 低: 1, 未知: 1, 待判断: 1 }[site.intentLevel] || 0;
  const dueScore = site.nextFollow && site.nextFollow <= todayIso() ? 5 : site.nextFollow <= addDays(7) ? 2 : 0;
  return statusScore + intentScore + dueScore + (Number(site.potentialVehicles) || 0) / 2;
}

function dueSites(days = 0) {
  const limit = addDays(days);
  return sites.filter((site) => site.nextFollow && site.nextFollow <= limit && site.status !== "paused");
}

function estimatedDistance() {
  const points = routeSites();
  if (points.length <= 1) return "0.0";
  const kilometers = points.slice(1).reduce((sum, site, index) => sum + distanceKm(points[index], site), 0);
  return kilometers.toFixed(1);
}

function estimatedHours() {
  const points = routeSites().length;
  const distance = Number(estimatedDistance());
  if (!points) return "0.0";
  return (distance / 22 + points * 0.18).toFixed(1);
}

function distanceKm(a, b) {
  const earth = 6371;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function toRad(value) {
  return value * Math.PI / 180;
}

function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng };
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let value = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  value += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return value;
}

function transformLng(x, y) {
  let value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  value += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return value;
}

function countBy(field) {
  return sites.reduce((acc, site) => {
    const key = site[field] || "未填写";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function splitTags(text = "") {
  return String(text).split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function extractVisitInfo(text) {
  const selected = getSelectedSite();
  const site = sites.find((item) => text.includes(item.name) || (text.includes(item.district) && text.includes(item.brand))) || selected;
  const findNumberNear = (keyword) => {
    const match = text.match(new RegExp(`(\\d+)\\s*台[^。；，,]*${keyword}|${keyword}[^。；，,]*(\\d+)\\s*台`));
    return Number(match?.[1] || match?.[2] || 0);
  };
  const contact = text.match(/([\u4e00-\u9fa5]{1,3})(老板|经理|站长|哥|姐)/)?.[0] || site?.contact || "";
  const quote = text.match(/(\d+)\s*(元|块).{0,8}(月租|一台|每台)|月租.{0,8}(\d+)/)?.[0] || "待补充";
  const concerns = ["维修", "价格", "押金", "保险", "电池", "换车", "竞品", "合同", "响应"].filter((word) => text.includes(word));
  const nextAction = text.match(/(周一|周二|周三|周四|周五|周六|周日|明天|后天|下周|月底).{0,16}(联系|回访|再聊|报价|见面|带|发)/)?.[0] || "设置下次跟进";
  const potentialVehicles = findNumberNear("换") || findNumberNear("租") || findNumberNear("需求") || site?.potentialVehicles || 0;
  const currentVehicles = findNumberNear("现在有") || findNumberNear("目前有") || site?.currentVehicles || 0;
  const competitorVehicles = findNumberNear("别家") || findNumberNear("竞品") || site?.competitorVehicles || 0;
  const intentLevel = text.includes("能接受") || text.includes("有意向") || text.includes("下个月") || text.includes("可以先") ? "高" : concerns.length ? "中" : "待判断";
  const nextFollowDate = inferNextFollowDate(text);
  const needs = potentialVehicles ? `预计可推进 ${potentialVehicles} 台` : "";

  return {
    siteId: site?.id,
    siteName: site?.name || "待匹配站点",
    contactName: contact,
    currentVehicles,
    competitorVehicles,
    potentialVehicles,
    intentLevel,
    concerns: concerns.join("、") || "待确认",
    quote,
    nextAction,
    nextFollowDate,
    needs,
    summary: `客户${intentLevel === "高" ? "意向较高" : "需要继续跟进"}。${concerns.length ? `主要关注${concerns.join("、")}。` : ""}${potentialVehicles ? `预计需求 ${potentialVehicles} 台。` : ""}${quote !== "待补充" ? `报价信息：${quote}。` : ""}`,
  };
}

function inferNextFollowDate(text) {
  if (text.includes("后天")) return addDays(2);
  if (text.includes("明天")) return addDays(1);
  const weekMatch = text.match(/周([一二三四五六日天])/);
  if (!weekMatch) return addDays(3);
  const mapByDay = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const target = mapByDay[weekMatch[1]];
  const current = new Date().getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  return addDays(diff);
}

function startSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const textarea = document.querySelector("#visitText");
  if (!textarea) return;
  if (!SpeechRecognition) {
    textarea.value += "\n当前浏览器不支持语音识别，可先手动输入拜访口述。";
    state.visitText = textarea.value;
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    textarea.value += event.results[0][0].transcript;
    state.visitText = textarea.value;
  };
  recognition.start();
}

function importJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("导入会覆盖当前业务数据。系统会先自动备份当前数据库，确认继续？")) {
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      const data = await apiRequest("/api/import", { method: "POST", body: payload });
      sites = data.sites || [];
      visits = data.visits || [];
      vehicles = data.vehicles || [];
      contracts = data.contracts || [];
      payments = data.payments || [];
      serviceTickets = data.serviceTickets || [];
      backups = data.backups || [];
      state.routeIds = data.routeIds || [];
      state.selectedSiteId = sites[0]?.id || null;
      state.view = "map";
      render();
    } catch (error) {
      alert(`导入失败：${error.message}`);
    }
  };
  reader.readAsText(file, "utf-8");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

init();
registerServiceWorker();
