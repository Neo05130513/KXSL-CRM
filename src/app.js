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
  ["growth", "拓客"],
  ["visit", "拜访"],
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
  brandFilter: "",
  query: "",
  selectedSiteId: null,
  routeIds: [],
  routePlan: null,
  routePlanning: false,
  routePlanError: "",
  routeGuideSiteId: null,
  growthTab: "sites",
  visitTab: "route",
  currentLocation: null,
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
  mapViewport: null,
  mapPanel: "",
  mapFiltersCollapsed: true,
  mapLocationLoading: false,
  mapLocationPrimed: false,
  visitText: "",
  extracted: null,
  siteForm: null,
  loading: true,
  loginError: "",
  error: "",
};

let map = null;
let routeLayer = null;
let locationRequestInFlight = null;
let suppressMapViewportSync = false;

const DEFAULT_MAP_CENTER = { lat: 34.7466, lng: 113.6254, label: "郑州中心", zoom: 14 };
const LOCATION_STORAGE_KEY = "kxsl-crm:last-location";
const STORED_LOCATION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

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
  restoreCurrentLocation();
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
  const brand = state.brandFilter.trim();
  return sites.filter((site) => {
    const matchesStatus = state.filter === "all" || site.status === state.filter;
    if (!matchesStatus) return false;
    const matchesBrand = !brand || String(site.brand || "").trim() === brand;
    if (!matchesBrand) return false;
    if (!query) return true;
    return [site.name, site.brand, site.district, site.address, site.contact, site.phone, site.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function validSiteCoordinate(site) {
  return Number.isFinite(Number(site?.lat)) && Number.isFinite(Number(site?.lng));
}

function availableBrands() {
  return [...new Set(sites.map((site) => String(site.brand || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function mapNearbyLimit() {
  return window.matchMedia("(max-width: 760px)").matches ? 8 : 10;
}

function mapNearbyRadiusKm() {
  return window.matchMedia("(max-width: 760px)").matches ? 3.2 : 5.2;
}

function mapFallbackCount() {
  return window.matchMedia("(max-width: 760px)").matches ? 6 : 8;
}

function mapOriginPoint() {
  if (state.mapFocus) return { lat: Number(state.mapFocus.lat), lng: Number(state.mapFocus.lng) };
  if (state.mapViewport?.manual) return state.mapViewport;
  if (state.currentLocation) return state.currentLocation;
  return DEFAULT_MAP_CENTER;
}

function siteWithinBounds(site, bounds) {
  if (!bounds) return true;
  return Number(site.lat) <= bounds.north
    && Number(site.lat) >= bounds.south
    && Number(site.lng) <= bounds.east
    && Number(site.lng) >= bounds.west;
}

function dedupeSites(list) {
  const seen = new Set();
  return list.filter((site) => {
    if (!site || seen.has(site.id)) return false;
    seen.add(site.id);
    return true;
  });
}

function mapVisibleSites() {
  const matched = filteredSites().filter(validSiteCoordinate);
  if (!matched.length) return [];

  const origin = mapOriginPoint();
  const sorted = [...matched].sort((a, b) => {
    const distanceDiff = distanceKm(origin, a) - distanceKm(origin, b);
    if (distanceDiff !== 0) return distanceDiff;
    return recommendedScore(b, origin) - recommendedScore(a, origin);
  });
  const inViewport = state.mapViewport?.manual
    ? sorted.filter((site) => siteWithinBounds(site, state.mapViewport.bounds))
    : [];
  const nearby = inViewport.length
    ? inViewport.slice(0, mapNearbyLimit())
    : sorted.filter((site) => distanceKm(origin, site) <= mapNearbyRadiusKm()).slice(0, mapNearbyLimit());

  const primary = nearby.length >= mapFallbackCount() ? nearby : sorted.slice(0, mapNearbyLimit());

  const extras = [];
  const selected = state.mapPanel === "detail" ? getSiteById(state.selectedSiteId) : null;
  if (selected && validSiteCoordinate(selected)) extras.push(selected);
  routeSites().forEach((site) => {
    if (validSiteCoordinate(site) && distanceKm(origin, site) <= mapNearbyRadiusKm() * 1.5) {
      extras.push(site);
    }
  });

  return dedupeSites([...primary, ...extras]).slice(0, mapNearbyLimit() + 3);
}

function mapVisibleSummary(visibleCount, filteredCount) {
  if (state.query.trim() || state.filter !== "all" || state.brandFilter) {
    return `筛选结果 ${visibleCount}${filteredCount > visibleCount ? ` / ${filteredCount}` : ""} 个站点`;
  }
  if (state.mapViewport?.manual) {
    return `当前视野 ${visibleCount}${filteredCount > visibleCount ? ` / ${filteredCount}` : ""} 个站点`;
  }
  if (state.currentLocation) {
    return `附近 ${visibleCount}${filteredCount > visibleCount ? ` / ${filteredCount}` : ""} 个站点`;
  }
  return `中心附近 ${visibleCount}${filteredCount > visibleCount ? ` / ${filteredCount}` : ""} 个站点`;
}

function mapLocationStateText() {
  if (state.mapLocationLoading && state.currentLocation?.source === "stored") {
    return "上次位置 · 正在刷新";
  }
  if (state.mapLocationLoading) {
    return "定位中 · 正在获取当前位置";
  }
  if (!state.currentLocation) {
    return "未定位 · 先显示街道级附近站点";
  }
  const accuracy = Number(state.currentLocation.accuracy) || 0;
  const prefix = state.currentLocation.source === "stored" ? "上次位置" : "已定位";
  return accuracy ? `${prefix} · 精度约 ${Math.round(accuracy)} 米` : prefix;
}

function viewportSnapshotFromMap() {
  if (!map) return null;
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    lat: Number(center.lat.toFixed(6)),
    lng: Number(center.lng.toFixed(6)),
    zoom: Number(map.getZoom()),
    bounds: {
      north: Number(bounds.getNorth().toFixed(6)),
      south: Number(bounds.getSouth().toFixed(6)),
      east: Number(bounds.getEast().toFixed(6)),
      west: Number(bounds.getWest().toFixed(6)),
    },
    manual: true,
  };
}

function sameViewport(a, b) {
  if (!a || !b) return false;
  return a.lat === b.lat
    && a.lng === b.lng
    && a.zoom === b.zoom
    && a.manual === b.manual;
}

function onMapViewportChanged() {
  if (!map || suppressMapViewportSync) return;
  const nextViewport = viewportSnapshotFromMap();
  if (!nextViewport || sameViewport(state.mapViewport, nextViewport)) return;
  state.mapViewport = nextViewport;
  state.mapFocus = null;
  if (state.mapPanel === "detail") state.mapPanel = "";
  render();
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
    requestAnimationFrame(ensureMapLocationContext);
  } else if (map) {
    map.remove();
    map = null;
    routeLayer = null;
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
        <p>站点拓客、拜访路线、跟进记录和数据备份统一管理。</p>
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
  if (state.view === "growth") return renderGrowthView();
  if (state.view === "visit") return renderVisitWorkspaceView();
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

function renderSectionTabs(tabs, active, action, dataKey) {
  return `
    <div class="section-tabs">
      ${tabs.map(([key, label, meta]) => `
        <button class="${active === key ? "active" : ""}" data-action="${action}" data-${dataKey}="${key}">
          <strong>${escapeHtml(label)}</strong>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
        </button>
      `).join("")}
    </div>
  `;
}

function renderGrowthView() {
  const activeTab = state.growthTab || "sites";
  const discovery = state.discovery;
  const selectedCount = discovery.selected.size;
  const titleMeta = activeTab === "discovery" ? "高德 POI 站点线索" : "站点库与线索沉淀";
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${titleMeta}</p>
          <h1>站点拓客</h1>
        </div>
        <div class="page-actions">
          ${activeTab === "discovery" ? `<button class="primary-action" data-action="searchDiscovery" ${discovery.loading ? "disabled" : ""}>${discovery.loading ? "搜索中" : "搜索线索"}</button>` : ""}
          ${activeTab === "sites" ? `<button class="primary-action" data-action="newSite">新增站点</button>` : ""}
        </div>
      </div>
      ${renderSectionTabs([
        ["sites", "站点库", `${filteredSites().length}/${sites.length}`],
        ["discovery", "线索发现", selectedCount ? `已选 ${selectedCount}` : "高德 POI"],
      ], activeTab, "setGrowthTab", "growth-tab")}
      ${activeTab === "discovery" ? renderDiscoveryBody() : renderSitesBody()}
    </section>
  `;
}

function renderVisitWorkspaceView() {
  const activeTab = state.visitTab || "route";
  const tabMeta = {
    route: "推荐路线与导航",
    followups: "逾期、今日和 7 天内跟进",
    record: `当前站点：${getSelectedSite()?.name || "未选择"}`,
  };
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${escapeHtml(tabMeta[activeTab] || "")}</p>
          <h1>拜访跟进</h1>
        </div>
        <div class="page-actions">
          ${activeTab === "route" ? `
            <button class="primary-action" data-action="autoRoute">按当前位置规划</button>
            <button class="ghost" data-action="refreshRoutePlan">刷新驾车路线</button>
          ` : ""}
          ${activeTab === "followups" ? `<button class="primary-action" data-action="routeDueSites">按应跟进生成路线</button>` : ""}
          ${activeTab === "record" ? `<button class="ghost" data-action="useSelectedSite">带入当前站点</button>` : ""}
        </div>
      </div>
      ${renderSectionTabs([
        ["route", "路线", `${routeSites().length} 个站点`],
        ["followups", "跟进", `${dueSites(7).length} 个待跟`],
        ["record", "记录", "口述整理"],
      ], activeTab, "setVisitTab", "visit-tab")}
      ${activeTab === "followups" ? renderFollowupsBody() : activeTab === "record" ? renderVisitRecordBody() : renderRouteBody()}
    </section>
  `;
}

function renderMapView() {
  const matchedSites = filteredSites();
  const visibleSites = mapVisibleSites();
  const selected = getSelectedSite();
  const planned = routeSites();
  const nextStop = planned[0];
  const locationText = mapLocationStateText();
  return `
    <section class="map-shell">
      <div class="map-panel">
        <div id="mapCanvas" class="map-canvas"></div>
        <div class="map-title">
          <strong>郑州快递站点</strong>
          <span>${escapeHtml(mapVisibleSummary(visibleSites.length, matchedSites.length))}</span>
          <span class="map-location-state">${escapeHtml(locationText)}</span>
        </div>
        ${renderMapFilterBar()}
        ${renderMapToolbar(visibleSites.length, matchedSites.length, selected)}
        ${renderMapZoomControls()}
        ${state.mapPanel === "locate" ? renderMapLocator() : ""}
        ${state.mapPanel === "sites" ? `
        <div class="map-search-card map-drawer">
          ${renderSearchControls()}
          ${!state.query.trim() && visibleSites.length < matchedSites.length ? `
            <p class="map-scope-note">地图会跟着当前视野优先显示最近一批站点，避免一次铺满全城；需要全局查找时再用搜索。</p>
          ` : ""}
          <div class="site-list compact">
            ${visibleSites.length ? visibleSites.map(renderSiteListItem).join("") : renderEmpty("没有匹配的站点")}
          </div>
        </div>` : ""}
        <div class="route-floating">
          <div>
            <strong>今日拜访路线</strong>
            <span>${planned.length} 个站点 · ${routeDistanceText()} · ${routeDurationText()}</span>
          </div>
          <div class="route-actions">
            <button data-action="showCurrentLocation">定位我</button>
            <button data-action="autoRoute">按位置规划</button>
            ${nextStop ? `<button class="secondary" data-action="openNavigation" data-site-id="${nextStop.id}">下一站路线</button>` : ""}
          </div>
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

function renderMapZoomControls() {
  return `
    <div class="map-zoom-actions" aria-label="地图缩放">
      <button data-action="zoomMapIn" title="放大地图">＋</button>
      <button data-action="zoomMapOut" title="缩小地图">－</button>
    </div>
  `;
}

function renderMapFilterBar() {
  const brands = availableBrands();
  const activeStatus = state.filter === "all" ? "全部状态" : statusMeta[state.filter]?.label || state.filter;
  const activeBrand = state.brandFilter || "全部品牌";
  const activeQuery = state.query.trim() ? ` · 搜索「${state.query.trim()}」` : "";
  return `
    <div class="map-filter-bar ${state.mapFiltersCollapsed ? "collapsed" : ""}">
      <div class="map-filter-head">
        <div>
          <strong>首页筛选</strong>
          <span>${escapeHtml(activeStatus)} · ${escapeHtml(activeBrand)}${escapeHtml(activeQuery)}</span>
        </div>
        <div class="map-filter-actions">
          ${state.mapFiltersCollapsed ? "" : `<button class="ghost" data-action="resetMapFilters">清空</button>`}
          <button class="ghost" data-action="toggleMapFilters">${state.mapFiltersCollapsed ? "展开" : "收起"}</button>
        </div>
      </div>
      ${state.mapFiltersCollapsed ? "" : `<div class="map-filter-row">
        <div class="quick-filters compact">
          ${renderFilter("all", "全部")}
          ${Object.entries(statusMeta).map(([key, item]) => renderFilter(key, item.label)).join("")}
        </div>
        <label class="map-brand-filter">
          <span>品牌</span>
          <select id="mapBrandFilter">
            <option value="">全部品牌</option>
            ${brands.map((brand) => `<option value="${escapeHtml(brand)}" ${state.brandFilter === brand ? "selected" : ""}>${escapeHtml(brand)}</option>`).join("")}
          </select>
        </label>
      </div>`}
    </div>
  `;
}

function renderMapToolbar(visibleCount, filteredCount, selected) {
  const selectedName = selected?.name || "未选站点";
  const siteMeta = state.query.trim()
    ? `${visibleCount}`
    : visibleCount < filteredCount ? `附近 ${visibleCount}` : `${visibleCount}`;
  const tools = [
    ["sites", "站点", siteMeta],
    ["locate", "搜索", "找地址"],
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
        <strong>站点地址搜索</strong>
        <span>只用于查找地址和新增站点；当前位置路线规划在底部路线栏操作。</span>
      </div>
      <div class="locator-search">
        <input id="mapLocateInput" value="${escapeHtml(state.mapSearch)}" placeholder="输入站点名、路口、地址" />
        <button data-action="locateMapSearch">搜索定位</button>
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
    routeLayer = null;
  }

  const visibleSites = mapVisibleSites();
  const initialCenter = mapOriginPoint();
  const initialZoom = state.mapFocus?.zoom || state.mapViewport?.zoom || (state.currentLocation ? 15 : DEFAULT_MAP_CENTER.zoom);

  map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
  }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

  L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
    subdomains: "1234",
    maxZoom: 19,
    attribution: "&copy; 高德地图",
  }).addTo(map);

  const viewportPoints = [];
  visibleSites.forEach((site) => {
    if (!validSiteCoordinate(site)) return;
    const company = companyFor(site);
    const marker = L.marker([site.lat, site.lng], {
      icon: L.divIcon({
        className: "crm-marker-wrap",
        html: `
          <span class="crm-marker-hit" title="${escapeHtml(site.name)}">
            <i
              class="crm-marker-dot marker-${company.shape || "circle"} ${state.selectedSiteId === site.id ? "selected" : ""}"
              style="--color:${company.color}"
            ></i>
          </span>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(map);
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      state.selectedSiteId = site.id;
      state.mapFocus = { lat: site.lat, lng: site.lng, label: site.name, zoom: 15 };
      state.mapPanel = "detail";
      render();
    });
    viewportPoints.push([site.lat, site.lng]);
  });

  const routePoints = routePolylinePoints();
  if (routePoints.length >= 2) {
    routeLayer = L.polyline(routePoints, {
      color: "#17202a",
      weight: currentRoutePlan() ? 5 : 4,
      opacity: currentRoutePlan() ? 0.78 : 0.58,
      dashArray: currentRoutePlan() ? "" : "8 9",
    }).addTo(map);
  } else {
    routeLayer = null;
  }

  if (state.currentLocation) {
    const location = state.currentLocation;
    const accuracy = Number(location.accuracy) || 0;
    if (accuracy) {
      L.circle([location.lat, location.lng], {
        radius: Math.min(Math.max(accuracy, 30), 900),
        color: "#256fd8",
        weight: 1,
        fillColor: "#256fd8",
        fillOpacity: 0.08,
        opacity: 0.28,
      }).addTo(map);
    }
    L.circleMarker([location.lat, location.lng], {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: "#256fd8",
      fillOpacity: 1,
      className: "current-location-marker",
    }).addTo(map).bindTooltip("我的位置", {
      permanent: false,
      direction: "top",
    });
    viewportPoints.push([location.lat, location.lng]);
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
    viewportPoints.push([state.mapFocus.lat, state.mapFocus.lng]);
  }

  map.on("click", () => {
    if (state.mapPanel === "detail") {
      state.mapPanel = "";
      render();
    }
  });
  map.on("moveend", onMapViewportChanged);

  const applyViewport = () => {
    if (!map) return;
    if (state.mapFocus) {
      map.setView([state.mapFocus.lat, state.mapFocus.lng], state.mapFocus.zoom || 16);
      return;
    }
    if (state.mapViewport?.manual) {
      map.setView([state.mapViewport.lat, state.mapViewport.lng], state.mapViewport.zoom || initialZoom);
      return;
    }
    if (viewportPoints.length > 1) {
      map.fitBounds(viewportPoints, mapFitOptions());
      return;
    }
    if (viewportPoints.length === 1) {
      map.setView(viewportPoints[0], state.currentLocation ? 16 : 15);
      return;
    }
    map.setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], DEFAULT_MAP_CENTER.zoom);
  };

  suppressMapViewportSync = true;
  applyViewport();
  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    applyViewport();
    setTimeout(() => {
      suppressMapViewportSync = false;
    }, 120);
  }, 80);
}

function mapFitOptions() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    return {
      paddingTopLeft: [20, state.mapPanel ? 230 : 150],
      paddingBottomRight: [20, 150],
      maxZoom: 16,
    };
  }
  return {
    paddingTopLeft: [state.mapPanel === "sites" || state.mapPanel === "locate" ? 390 : 96, 176],
    paddingBottomRight: [state.mapPanel === "detail" ? 380 : 96, 110],
    maxZoom: 16,
  };
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
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">高德 POI 站点线索</p>
          <h1>站点发现</h1>
        </div>
        <button class="primary-action" data-action="searchDiscovery" ${discovery.loading ? "disabled" : ""}>${discovery.loading ? "搜索中" : "搜索线索"}</button>
      </div>
      ${renderDiscoveryBody()}
    </section>
  `;
}

function renderDiscoveryBody() {
  const discovery = state.discovery;
  const selectedCount = discovery.selected.size;
  const availableCount = discovery.results.filter((item) => !item.imported).length;
  return `
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
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${todayIso()}</p>
          <h1>今日拜访</h1>
        </div>
        <button class="primary-action" data-action="autoRoute">按位置规划</button>
      </div>
      ${renderRouteBody()}
    </section>
  `;
}

function renderRouteBody() {
  const planned = routeSites();
  const origin = routeOrigin();
  const plan = currentRoutePlan();
  const distanceValue = plan ? Number(plan.distanceKm || 0).toFixed(1) : estimatedDistance();
  const durationValue = plan ? String(Math.max(1, Math.round(Number(plan.durationMinutes) || 0))) : estimatedHours();
  const planState = routePlanStateText();
  const candidateGroups = routeCandidateGroups(origin).filter((group) => group.items.length);
  return `
      <div class="summary-strip route-summary">
        <div><strong>${planned.length}</strong><span>已选站点</span></div>
        <div><strong>${distanceValue}</strong><span>${plan ? "驾车公里" : "估算公里"}</span></div>
        <div><strong>${durationValue}</strong><span>${plan ? "驾车分钟" : "估算小时"}</span></div>
        <div><strong>${escapeHtml(routeOriginShortText())}</strong><span>路线起点</span></div>
      </div>
      <div class="route-builder">
        <section class="panel route-plan-panel">
          <div class="panel-title">
            <div>
              <h2>路线顺序</h2>
              <span>${escapeHtml(planState)}</span>
            </div>
            <div class="route-panel-actions">
              ${planned.length ? `
                <button class="secondary" data-action="optimizeRoute">优化顺序</button>
                <button class="secondary" data-action="openRouteNavigation">站内路线</button>
                <button class="ghost" data-action="openNavigation" data-site-id="${planned[0].id}">查看第一站</button>
                <button class="ghost" data-action="clearRoute">清空</button>
              ` : ""}
            </div>
          </div>
          ${planned.length ? `
            <div class="route-plan-note ${state.routePlanError ? "warn" : ""}">
              <strong>${escapeHtml(plan ? "真实驾车路线已生成" : state.routePlanning ? "正在计算真实驾车路线" : "当前为估算路线")}</strong>
              <span>${escapeHtml(routePlanDetailText(plan, origin, planned))}</span>
            </div>
          ` : ""}
          ${renderRouteGuide(planned, origin, plan)}
          <ol class="route-list">
            ${planned.length ? planned.map((site, index) => renderRouteStep(site, index, planned, origin)).join("") : "<p class=\"empty\">还没有路线。可以按当前位置、当前地图、应跟进或高意向一键生成，也可以从右侧逐个加入。</p>"}
          </ol>
        </section>
        <section class="panel route-choice-panel">
          <div class="panel-title">
            <div>
              <h2>选择站点</h2>
              <span>按业务场景生成，也支持逐个加入</span>
            </div>
          </div>
          <div class="route-presets">
            <button data-action="autoRoute">离我最近</button>
            <button data-action="routeFromMap">当前地图</button>
            <button data-action="routeDueSites">应跟进</button>
            <button data-action="routeHighIntent">高意向</button>
          </div>
          <div class="route-candidate-groups">
            ${candidateGroups.length ? candidateGroups.map(renderRouteCandidateGroup).join("") : "<p class=\"empty\">暂无可加入路线的站点。</p>"}
          </div>
        </section>
      </div>
  `;
}

function renderRouteStep(site, index, planned, origin) {
  const leg = routeLegFor(site.id, index);
  return `
    <li class="route-step">
      <span>${index + 1}</span>
      <button data-action="selectSite" data-site-id="${site.id}">
        <strong>${escapeHtml(site.name)}</strong>
        <em>${escapeHtml(routeStepMeta(site, index, planned, origin, leg))}</em>
        <small>${escapeHtml(routeReasonText(site, origin))}</small>
      </button>
      <div class="route-item-actions">
        <button class="icon-button" data-action="moveRouteItem" data-route-index="${index}" data-direction="-1" title="上移" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" data-action="moveRouteItem" data-route-index="${index}" data-direction="1" title="下移" ${index === planned.length - 1 ? "disabled" : ""}>↓</button>
        <button class="secondary" data-action="openNavigation" data-site-id="${site.id}">站内路线</button>
        <button class="ghost" data-action="recordVisit" data-site-id="${site.id}">记录</button>
        <button class="icon-button" data-action="removeFromRoute" data-site-id="${site.id}" title="移出路线">×</button>
      </div>
    </li>
  `;
}

function renderRouteGuide(planned, origin, plan) {
  if (!planned.length) return "";
  const active = activeRouteGuideSite(planned);
  const activeIndex = planned.findIndex((site) => site.id === active.id);
  const leg = routeLegFor(active.id, activeIndex);
  const previous = activeIndex === 0 ? origin : planned[activeIndex - 1];
  const distanceText = leg
    ? `${(Number(leg.distanceMeters || 0) / 1000).toFixed(1)} 公里`
    : validSiteCoordinate(previous) ? `约 ${distanceKm(previous, active).toFixed(1)} 公里` : "待计算";
  const durationText = leg
    ? `${Math.max(1, Math.round(Number(leg.durationSeconds || 0) / 60))} 分钟`
    : "估算路线";
  const roads = (leg?.roads || []).filter(Boolean);
  return `
    <div class="route-guide">
      <div class="route-guide-head">
        <div>
          <strong>站内路线导航</strong>
          <span>不跳转外部地图，按当前路线逐站推进</span>
        </div>
        <div class="route-guide-actions">
          <button class="ghost" data-action="routeGuidePrevious" ${activeIndex <= 0 ? "disabled" : ""}>上一站</button>
          <button class="ghost" data-action="routeGuideNext" ${activeIndex >= planned.length - 1 ? "disabled" : ""}>下一站</button>
        </div>
      </div>
      <div class="route-guide-main">
        <div>
          <span>第 ${activeIndex + 1} / ${planned.length} 站</span>
          <strong>${escapeHtml(active.name)}</strong>
          <em>${escapeHtml(active.address || `${active.district || ""} ${active.brand || ""}`)}</em>
        </div>
        <div class="route-guide-metrics">
          <span><b>${escapeHtml(distanceText)}</b>本段距离</span>
          <span><b>${escapeHtml(durationText)}</b>本段时间</span>
        </div>
      </div>
      <div class="route-guide-roads">
        ${roads.length ? roads.slice(0, 5).map((road) => `<span>${escapeHtml(road)}</span>`).join("") : `<span>${escapeHtml(plan ? "高德未返回主要道路名称" : "点击刷新驾车路线后显示道路信息")}</span>`}
      </div>
      <div class="route-guide-footer">
        <button class="secondary" data-action="recordVisit" data-site-id="${active.id}">到站后记录</button>
        <button class="ghost" data-action="selectSite" data-site-id="${active.id}">看站点详情</button>
        <button class="ghost" data-action="openExternalNavigation" data-site-id="${active.id}">备用：手机高德导航</button>
      </div>
    </div>
  `;
}

function renderRouteCandidateGroup(group) {
  return `
    <div class="route-candidate-group">
      <div class="route-candidate-title">
        <div>
          <strong>${escapeHtml(group.title)}</strong>
          <span>${escapeHtml(group.subtitle)}</span>
        </div>
        <button class="ghost" data-action="${group.action}">生成</button>
      </div>
      <div class="candidate-list compact-candidates">
        ${group.items.slice(0, 4).map((site) => `
          <article>
            <div>
              <strong>${escapeHtml(site.name)}</strong>
              <span>${escapeHtml(routeReasonText(site, group.origin))}</span>
            </div>
            <div class="candidate-actions">
              <button class="ghost" data-action="selectSite" data-site-id="${site.id}">查看</button>
              <button data-action="addToRoute" data-site-id="${site.id}">加入</button>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFollowupsView() {
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${todayIso()}</p>
          <h1>跟进工作台</h1>
        </div>
        <button class="primary-action" data-action="routeDueSites">把应跟进加入路线</button>
      </div>
      ${renderFollowupsBody()}
    </section>
  `;
}

function renderFollowupsBody() {
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
  return `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">SQLite 数据库</p>
          <h1>站点管理</h1>
        </div>
        <button class="primary-action" data-action="newSite">新增站点</button>
      </div>
      ${renderSitesBody()}
    </section>
  `;
}

function renderSitesBody() {
  const visibleSites = filteredSites();
  return `
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
      ${renderVisitRecordBody()}
    </section>
  `;
}

function renderVisitRecordBody() {
  return `
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
  const activeSites = sites.filter((site) => site.status === "active");
  const intentSites = sites.filter((site) => site.status === "intent");
  const targetSites = sites.filter((site) => site.status === "target");
  const workableSites = sites.filter((site) => site.status !== "paused");
  const month = todayIso().slice(0, 7);
  const monthVisits = visits.filter((visit) => String(visit.time).startsWith(month)).length;
  const weekVisits = visits.filter((visit) => String(visit.time).slice(0, 10) >= addDays(-6)).length;
  const routeRows = routeSites();
  const routeCount = routeRows.length;
  const routePotential = sumPotential(routeRows);
  const overdue = workableSites.filter((site) => site.nextFollow && site.nextFollow < todayIso());
  const dueToday = workableSites.filter((site) => site.nextFollow === todayIso());
  const dueSoon = dueSites(7);
  const noPlan = workableSites.filter((site) => !site.nextFollow);
  const staleSites = workableSites.filter((site) => !site.lastVisit || site.lastVisit < addDays(-30));
  const highIntent = workableSites.filter((site) => site.status === "key" || site.intentLevel === "高");
  const conversion = sites.length ? Math.round(activeSites.length / sites.length * 100) : 0;
  const potentialTotal = sumPotential(workableSites);
  const competitorTotal = workableSites.reduce((sum, site) => sum + (Number(site.competitorVehicles) || 0), 0);
  const forecastVehicles = forecastVehicleTotal(workableSites);
  const topOpportunities = workableSites.sort((a, b) => bossOpportunityScore(b) - bossOpportunityScore(a)).slice(0, 8);
  const urgentSites = [...overdue, ...dueToday].sort((a, b) => bossOpportunityScore(b) - bossOpportunityScore(a)).slice(0, 5);
  const routeEfficiency = routeCount ? `${routePotential}台 / ${routeCount}站` : "未规划";
  const biggestBlocker = overdue.length ? `${overdue.length} 个逾期未跟` : noPlan.length ? `${noPlan.length} 个没下次动作` : targetSites.length ? `${targetSites.length} 个未拜访目标` : "执行节奏正常";
  return `
    <section class="page dashboard-page">
      <div class="page-title">
        <div>
          <p class="eyebrow">老板经营驾驶舱</p>
          <h1>今天该追谁、能拿多少车、卡点在哪</h1>
        </div>
        <div class="page-actions">
          <button class="primary-action" data-action="autoRoute">按位置规划</button>
          <button class="ghost" data-view="growth">拓客找站点</button>
        </div>
      </div>
      <div class="command-strip">
        <section class="command-brief">
          <span>今日经营结论</span>
          <strong>${urgentSites[0] ? `先追 ${escapeHtml(urgentSites[0].name)}` : topOpportunities[0] ? `先推进 ${escapeHtml(topOpportunities[0].name)}` : "先补充有效站点池"}</strong>
          <p>${biggestBlocker}。${routeCount ? `今日路线覆盖 ${routePotential} 台潜在需求。` : "今日路线未排，先按当前位置规划。"}预计可转化车辆 ${forecastVehicles} 台。</p>
          <div class="command-actions">
            <button data-view="visit">看拜访路线</button>
            <button class="secondary" data-view="growth">补充线索</button>
          </div>
        </section>
        <section class="command-metrics">
          ${renderCommandMetric("预计可转车辆", `${forecastVehicles}台`, `潜在池 ${potentialTotal} 台`, "blue")}
          ${renderCommandMetric("今日路线价值", routeEfficiency, routeCount ? `约 ${estimatedDistance()} 公里` : "还没排路线", routeCount ? "green" : "warn")}
          ${renderCommandMetric("跟进缺口", `${overdue.length + noPlan.length}`, `逾期 ${overdue.length} · 未设 ${noPlan.length}`, overdue.length || noPlan.length ? "danger" : "green")}
          ${renderCommandMetric("竞品可替换", `${competitorTotal}台`, `合作转化率 ${conversion}%`, "normal")}
        </section>
      </div>
      <div class="owner-grid">
        <section class="panel owner-panel owner-tasks">
          <div class="panel-title"><h2>老板今天盯这几件事</h2><span class="mini-badge">${todayIso()}</span></div>
          ${renderOwnerTasks([
            {
              label: "第一优先级",
              title: urgentSites[0] ? `把 ${urgentSites[0].name} 跟进掉` : "没有到期跟进，保持拜访节奏",
              detail: urgentSites[0] ? `${urgentSites[0].district} · ${statusLabel(urgentSites[0].status)} · 潜在 ${sitePotential(urgentSites[0])} 台` : `本月已有 ${monthVisits} 条拜访记录。`,
              action: "去跟进",
              view: "visit",
              tone: urgentSites[0] ? "danger" : "green",
            },
            {
              label: "第二优先级",
              title: routeCount ? `今日路线 ${routeCount} 站，先跑高价值点` : "先按当前位置生成路线",
              detail: routeCount ? `路线潜在 ${routePotential} 台，预计 ${estimatedDistance()} 公里。` : "路线空着时，业务员容易随便跑，老板看不到产出。",
              action: "看路线",
              view: "visit",
              tone: routeCount ? "blue" : "warn",
            },
            {
              label: "第三优先级",
              title: targetSites.length ? `把 ${targetSites.length} 个未拜访目标转成记录` : "未拜访池已清空",
              detail: targetSites.length ? "线索只有进入拜访记录，才算进入可控销售流程。" : "继续从高德线索发现补充新目标。",
              action: "去拓客",
              view: "growth",
              tone: targetSites.length ? "normal" : "green",
            },
          ])}
        </section>
        <section class="panel owner-panel forecast-card">
          <div class="panel-title"><h2>车辆机会预测</h2><span class="mini-badge">按意向折算</span></div>
          <div class="forecast-total">
            <span>预计可转化</span>
            <strong>${forecastVehicles}<em>台</em></strong>
            <p>不是总潜在量，而是按高/中/低意向折算后的可推进规模。</p>
          </div>
          ${renderForecastRows([
            ["高意向/重点", highIntent, 0.75, "#256fd8"],
            ["有意向", intentSites, 0.45, "#d99212"],
            ["未拜访目标", targetSites, 0.18, "#d94f45"],
            ["已合作扩租", activeSites, 0.25, "#159a72"],
          ])}
        </section>
        <section class="panel owner-panel opportunity-board">
          <div class="panel-title"><h2>重点站点作战表</h2><span class="mini-badge">按成交价值排序</span></div>
          ${renderOpportunityBoard(topOpportunities)}
        </section>
        <section class="panel owner-panel bottleneck-card">
          <div class="panel-title"><h2>流程卡点</h2></div>
          ${renderBottlenecks([
            ["逾期未跟", overdue.length, "到期没跟会直接丢单", overdue.length ? "danger" : "green"],
            ["未设下次动作", noPlan.length, "没有下次动作就不可控", noPlan.length ? "warn" : "green"],
            ["30天未拜访", staleSites.length, "站点沉睡会拖低转化", staleSites.length ? "warn" : "green"],
            ["未拜访目标", targetSites.length, "线索还没进入销售流程", targetSites.length ? "normal" : "green"],
          ])}
          ${renderFunnelPanel([
            ["目标池", targetSites.length, "#d94f45"],
            ["有意向", intentSites.length, "#d99212"],
            ["高意向", highIntent.length, "#256fd8"],
            ["已合作", activeSites.length, "#159a72"],
          ])}
        </section>
      </div>
      <div class="dashboard-market">
        <section class="panel owner-panel">
          <div class="panel-title"><h2>区域突破口</h2><span class="mini-badge">按潜在车辆</span></div>
          ${renderMarketRows(groupPotentialBy("district").slice(0, 8))}
        </section>
        <section class="panel owner-panel">
          <div class="panel-title"><h2>品牌突破口</h2><span class="mini-badge">按潜在车辆</span></div>
          ${renderMarketRows(groupPotentialBy("brand").slice(0, 8))}
        </section>
        <section class="panel owner-panel discipline-card">
          <div class="panel-title"><h2>执行纪律</h2></div>
          <div class="discipline-grid">
            ${renderDisciplineMetric("本月拜访", monthVisits, "条")}
            ${renderDisciplineMetric("近7天拜访", weekVisits, "条")}
            ${renderDisciplineMetric("路线站点", routeCount, "站")}
            ${renderDisciplineMetric("7天内跟进", dueSoon.length, "个")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderStat(label, value) {
  return `<article class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></article>`;
}

function renderCommandMetric(label, value, detail, tone = "normal") {
  return `
    <article class="command-metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </article>
  `;
}

function renderOwnerTasks(rows) {
  return `
    <div class="owner-task-list">
      ${rows.map((row) => `
        <article class="${escapeHtml(row.tone || "")}">
          <small>${escapeHtml(row.label)}</small>
          <div>
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.detail)}</span>
          </div>
          <button data-view="${escapeHtml(row.view)}">${escapeHtml(row.action)}</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderForecastRows(rows) {
  const max = Math.max(1, ...rows.map(([, rowSites]) => sumPotential(rowSites)));
  return `
    <div class="forecast-rows">
      ${rows.map(([label, rowSites, weight, color]) => {
        const potential = sumPotential(rowSites);
        const weighted = Math.round(potential * weight);
        return `
          <article>
            <div><strong>${escapeHtml(label)}</strong><span>${rowSites.length} 个站点 · 潜在 ${potential} 台</span></div>
            <i style="--color:${color}; width:${Math.max(8, potential / max * 100)}%"></i>
            <b>${weighted} 台</b>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderOpportunityBoard(rows) {
  return `
    <div class="opportunity-board-list">
      ${rows.length ? rows.map((site, index) => `
        <article>
          <span>${index + 1}</span>
          <button data-action="selectSite" data-site-id="${site.id}">
            <strong>${escapeHtml(site.name)}</strong>
            <em>${escapeHtml(site.district)} · ${escapeHtml(site.brand)} · ${escapeHtml(site.nextFollow || "未设跟进")}</em>
          </button>
          <div><b>${sitePotential(site)}</b><small>潜在台数</small></div>
        </article>
      `).join("") : renderEmpty("暂无可推进站点")}
    </div>
  `;
}

function renderBottlenecks(rows) {
  return `
    <div class="bottleneck-grid">
      ${rows.map(([label, value, detail, tone]) => `
        <article class="${escapeHtml(tone)}">
          <strong>${Number(value) || 0}</strong>
          <span>${escapeHtml(label)}</span>
          <p>${escapeHtml(detail)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderMarketRows(rows) {
  const max = Math.max(1, ...rows.map((row) => row.potential));
  return `
    <div class="market-row-list">
      ${rows.length ? rows.map((row) => `
        <article>
          <div><strong>${escapeHtml(row.label)}</strong><span>${row.count} 个站点 · ${row.high} 个高意向</span></div>
          <i style="width:${Math.max(8, row.potential / max * 100)}%"></i>
          <b>${row.potential} 台</b>
        </article>
      `).join("") : renderEmpty("暂无数据")}
    </div>
  `;
}

function renderDisciplineMetric(label, value, unit) {
  return `
    <article>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <em>${escapeHtml(unit)}</em>
    </article>
  `;
}

function sitePotential(site) {
  const explicit = Number(site?.potentialVehicles) || 0;
  const replaceable = Math.ceil((Number(site?.competitorVehicles) || 0) * 0.35);
  return Math.max(explicit, replaceable);
}

function sumPotential(rows) {
  return rows.reduce((sum, site) => sum + sitePotential(site), 0);
}

function forecastVehicleTotal(rows) {
  return Math.round(rows.reduce((sum, site) => {
    const weight = site.status === "active" ? 0.25
      : site.status === "key" || site.intentLevel === "高" ? 0.75
      : site.status === "intent" || site.intentLevel === "中" ? 0.45
      : site.status === "target" ? 0.18
      : 0.1;
    return sum + sitePotential(site) * weight;
  }, 0));
}

function bossOpportunityScore(site) {
  const followScore = site.nextFollow && site.nextFollow < todayIso() ? 12 : site.nextFollow === todayIso() ? 9 : site.nextFollow && site.nextFollow <= addDays(7) ? 5 : 0;
  const intentScore = site.status === "key" ? 10 : site.intentLevel === "高" ? 8 : site.intentLevel === "中" ? 4 : 1;
  return followScore + intentScore + sitePotential(site) * 1.5 + (Number(site.competitorVehicles) || 0) * 0.35;
}

function groupPotentialBy(field) {
  const groups = new Map();
  sites.filter((site) => site.status !== "paused").forEach((site) => {
    const key = site[field] || "未填写";
    const current = groups.get(key) || { label: key, count: 0, potential: 0, high: 0 };
    current.count += 1;
    current.potential += sitePotential(site);
    if (site.status === "key" || site.intentLevel === "高") current.high += 1;
    groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => b.potential - a.potential || b.high - a.high);
}

function renderBossMetric(label, value, detail, tone = "normal") {
  return `
    <article class="boss-metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </article>
  `;
}

function renderActionList(rows) {
  return `
    <div class="boss-action-list">
      ${rows.map((row) => `
        <article class="${row.tone || ""}">
          <div>
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(row.detail)}</span>
          </div>
          <button data-view="${escapeHtml(row.view)}">${escapeHtml(row.action)}</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderOpportunityList(rows) {
  return `
    <div class="opportunity-list">
      ${rows.length ? rows.map((site, index) => `
        <article>
          <span>${index + 1}</span>
          <button data-action="selectSite" data-site-id="${site.id}">
            <strong>${escapeHtml(site.name)}</strong>
            <em>${escapeHtml(site.district)} · ${escapeHtml(statusLabel(site.status))} · ${escapeHtml(site.intentLevel || "未知")}意向</em>
          </button>
          <b>${Number(site.potentialVehicles) || 0} 台</b>
        </article>
      `).join("") : renderEmpty("暂无可推进站点")}
    </div>
  `;
}

function renderRiskList(rows) {
  return `
    <div class="risk-list">
      ${rows.map((row) => `
        <article class="${row.tone}">
          <div><strong>${escapeHtml(row.value)}</strong><span>${escapeHtml(row.label)}</span></div>
          <p>${escapeHtml(row.detail)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFunnelPanel(rows) {
  const max = Math.max(1, ...rows.map(([, value]) => Number(value) || 0));
  return `
    <div class="funnel-list">
      ${rows.map(([label, value, color]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <i style="--color:${color}; width:${Math.max(7, Number(value || 0) / max * 100)}%"></i>
          <b>${Number(value) || 0}</b>
        </div>
      `).join("")}
    </div>
  `;
}

function topCounts(field, limit = 8) {
  return Object.fromEntries(
    Object.entries(countBy(field))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );
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
          <p>${sites.length} 个站点，${visits.length} 条拜访记录。数据已经写入本机 SQLite 数据库。</p>
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

  const mapBrandFilter = document.querySelector("#mapBrandFilter");
  mapBrandFilter?.addEventListener("change", () => {
    state.brandFilter = mapBrandFilter.value;
    render();
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

  if (action === "toggleMapFilters") {
    state.mapFiltersCollapsed = !state.mapFiltersCollapsed;
    render();
    return;
  }

  if (action === "zoomMapIn") {
    map?.zoomIn();
    return;
  }

  if (action === "zoomMapOut") {
    map?.zoomOut();
    return;
  }

  if (action === "setGrowthTab") {
    state.growthTab = event.currentTarget.dataset.growthTab || "sites";
    render();
    return;
  }

  if (action === "setVisitTab") {
    state.visitTab = event.currentTarget.dataset.visitTab || "route";
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
    if (["today", "sites", "visit", "growth", "dashboard"].includes(state.view)) state.view = "map";
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

  if (action === "showCurrentLocation") {
    await showCurrentLocation();
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
    if (Number(state.routeGuideSiteId) === siteId) state.routeGuideSiteId = null;
    await setRoute(state.routeIds.filter((id) => id !== siteId));
    return;
  }

  if (action === "openNavigation") {
    openRouteGuide(siteId);
    return;
  }

  if (action === "openRouteNavigation") {
    openRouteGuide();
    return;
  }

  if (action === "routeGuidePrevious" || action === "routeGuideNext") {
    moveRouteGuide(action === "routeGuideNext" ? 1 : -1);
    return;
  }

  if (action === "openExternalNavigation") {
    openExternalSiteNavigation(siteId);
    return;
  }

  if (action === "openExternalRouteNavigation") {
    openExternalRouteNavigation();
    return;
  }

  if (action === "autoRoute") {
    await autoPlanRoute();
    return;
  }

  if (action === "refreshRoutePlan") {
    await refreshDrivingPlan();
    return;
  }

  if (action === "routeFromMap") {
    await planRouteByMode("map");
    return;
  }

  if (action === "routeHighIntent") {
    await planRouteByMode("highIntent");
    return;
  }

  if (action === "optimizeRoute") {
    const optimized = buildRouteFromCandidates(routeSites(), routeOrigin(), Math.max(state.routeIds.length, 1));
    if (optimized.length) await setRoute(optimized);
    return;
  }

  if (action === "moveRouteItem") {
    const index = Number(event.currentTarget.dataset.routeIndex);
    const direction = Number(event.currentTarget.dataset.direction);
    const targetIndex = index + direction;
    if (Number.isInteger(index) && Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < state.routeIds.length) {
      const nextRoute = [...state.routeIds];
      [nextRoute[index], nextRoute[targetIndex]] = [nextRoute[targetIndex], nextRoute[index]];
      await setRoute(nextRoute);
    }
    return;
  }

  if (action === "routeDueSites") {
    await planRouteByMode("due");
    return;
  }

  if (action === "completeFollowup") {
    await completeFollowup(siteId);
    return;
  }

  if (action === "clearRoute") {
    state.routeGuideSiteId = null;
    await setRoute([]);
    return;
  }

  if (action === "recordVisit") {
    const site = getSiteById(siteId);
    state.selectedSiteId = siteId;
    state.view = "visit";
    state.visitTab = "record";
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

  if (action === "resetMapFilters") {
    state.filter = "all";
    state.brandFilter = "";
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
  try {
    const position = await resolveCurrentLocation();
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

async function showCurrentLocation() {
  try {
    const position = await resolveCurrentLocation({ focus: true, openPanel: true });
    state.mapMessage = `已显示当前位置，精度约 ${Math.round(position.accuracy || 0)} 米。`;
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
    updateCurrentLocation(position);
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

function updateCurrentLocation(position) {
  state.currentLocation = {
    lat: Number(position.lat),
    lng: Number(position.lng),
    accuracy: Number(position.accuracy) || 0,
    updatedAt: position.updatedAt || dateTimeText(),
    savedAt: Number(position.savedAt) || Date.now(),
    source: position.source || "live",
  };
  persistCurrentLocation();
}

function loadStoredCurrentLocation() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lng))) return null;
    const savedAt = Number(data.savedAt) || 0;
    if (savedAt && Date.now() - savedAt > STORED_LOCATION_MAX_AGE_MS) {
      window.localStorage.removeItem(LOCATION_STORAGE_KEY);
      return null;
    }
    return {
      lat: Number(data.lat),
      lng: Number(data.lng),
      accuracy: Number(data.accuracy) || 0,
      updatedAt: data.updatedAt || dateTimeText(),
      savedAt: savedAt || Date.now(),
      source: "stored",
    };
  } catch {
    return null;
  }
}

function restoreCurrentLocation() {
  if (state.currentLocation) return;
  const stored = loadStoredCurrentLocation();
  if (stored) state.currentLocation = stored;
}

function persistCurrentLocation() {
  if (!state.currentLocation || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
      lat: state.currentLocation.lat,
      lng: state.currentLocation.lng,
      accuracy: state.currentLocation.accuracy,
      updatedAt: state.currentLocation.updatedAt,
      savedAt: state.currentLocation.savedAt || Date.now(),
    }));
  } catch {
    // Ignore local storage failures and keep the live location in memory.
  }
}

async function resolveCurrentLocation({ focus = false, silent = false, openPanel = false } = {}) {
  if (!locationRequestInFlight) {
    state.mapLocationLoading = true;
    if (openPanel && state.view === "map") {
      state.mapPanel = "locate";
    }
    if (!silent || state.view === "map") {
      if (!silent) {
        state.mapMessage = "正在获取当前位置...";
      }
      render();
    }
    locationRequestInFlight = getCurrentGcjPosition()
      .then((position) => {
        updateCurrentLocation(position);
        return position;
      })
      .finally(() => {
        state.mapLocationLoading = false;
      });
  }

  const activeRequest = locationRequestInFlight;
  try {
    const position = await activeRequest;
    if (focus) {
      state.mapFocus = { lat: position.lat, lng: position.lng, label: "我的位置", zoom: 16 };
    }
    if (silent && state.view === "map") {
      render();
    }
    return position;
  } finally {
    if (locationRequestInFlight === activeRequest) {
      locationRequestInFlight = null;
    }
  }
}

function ensureMapLocationContext() {
  if (state.view !== "map" || state.loading || !state.authenticated || state.mapLocationPrimed) return;
  state.mapLocationPrimed = true;
  resolveCurrentLocation({ silent: true }).catch(() => {
    if (state.view === "map") render();
  });
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
  state.routeIds = routeIds.map(Number).filter((id) => Number.isFinite(id));
  if (state.routeGuideSiteId && !state.routeIds.includes(Number(state.routeGuideSiteId))) {
    state.routeGuideSiteId = state.routeIds[0] || null;
  }
  state.routePlan = null;
  state.routePlanError = "";
  state.routePlanning = state.routeIds.length > 0;
  try {
    await apiRequest("/api/route", { method: "PUT", body: { routeIds: state.routeIds } });
    render();
    if (state.routeIds.length) {
      await refreshDrivingPlan({ silent: true });
    } else {
      state.routePlanning = false;
      render();
    }
  } catch (error) {
    alert(`路线保存失败：${error.message}`);
    state.routePlanning = false;
    await loadData();
    render();
  }
}

async function refreshDrivingPlan({ silent = false } = {}) {
  const planned = routeSites().filter(validSiteCoordinate);
  if (!planned.length) {
    state.routePlan = null;
    state.routePlanError = "";
    state.routePlanning = false;
    if (!silent) render();
    return;
  }

  const origin = routeOrigin();
  if (!validSiteCoordinate(origin)) {
    state.routePlan = null;
    state.routePlanError = "路线起点缺少有效坐标";
    state.routePlanning = false;
    render();
    return;
  }

  state.routePlanning = true;
  state.routePlanError = "";
  if (!silent) render();
  try {
    const data = await apiRequest("/api/route/driving", {
      method: "POST",
      body: {
        origin: {
          name: origin.name || routeOriginShortText(),
          lat: Number(origin.lat),
          lng: Number(origin.lng),
        },
        stops: planned.map((site) => ({
          id: site.id,
          name: site.name,
          lat: Number(site.lat),
          lng: Number(site.lng),
        })),
      },
    });
    state.routePlan = data;
    state.routePlanError = "";
  } catch (error) {
    state.routePlan = null;
    state.routePlanError = error.message || "驾车路线规划失败";
  } finally {
    state.routePlanning = false;
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

async function autoPlanRoute() {
  await planRouteByMode("nearby");
}

async function planRouteByMode(mode) {
  const modeText = {
    nearby: "当前位置附近",
    map: "当前地图视野",
    due: "应跟进站点",
    highIntent: "高意向站点",
  }[mode] || "推荐站点";

  state.view = "visit";
  state.visitTab = "route";
  state.mapMessage = `正在按${modeText}生成拜访路线...`;
  if (mode === "nearby" && !state.currentLocation && state.view === "map") state.mapPanel = "locate";
  render();

  let origin = routeOrigin();
  let locationWarning = "";
  if (mode === "nearby" && !state.currentLocation) {
    try {
      origin = await resolveCurrentLocation({ silent: true });
    } catch (error) {
      locationWarning = `当前位置获取失败：${error.message}。`;
      origin = routeOrigin();
    }
  }

  const candidates = routeCandidatesForMode(mode, origin);
  const limit = mode === "due" ? 8 : 6;
  const nextRoute = buildRouteFromCandidates(candidates, origin, limit);
  if (!nextRoute.length) {
    state.mapMessage = `${locationWarning}没有可规划的站点，请确认站点坐标、状态或筛选条件。`;
    state.routePlanning = false;
    render();
    return;
  }

  state.mapFocus = { lat: Number(origin.lat), lng: Number(origin.lng), label: routeOriginShortText(), zoom: mode === "map" ? 15 : 14 };
  state.mapMessage = `${locationWarning}已按${modeText}规划 ${nextRoute.length} 个站点，可继续手动增删和上下调整。`;
  await setRoute(nextRoute);
}

function routeOrigin() {
  if (state.currentLocation) {
    return { ...state.currentLocation, name: "我的位置" };
  }
  if (state.mapViewport?.manual) {
    return {
      lat: Number(state.mapViewport.lat),
      lng: Number(state.mapViewport.lng),
      name: "地图中心",
    };
  }
  if (state.mapFocus) {
    return {
      lat: Number(state.mapFocus.lat),
      lng: Number(state.mapFocus.lng),
      name: state.mapFocus.label || "地图焦点",
    };
  }
  return { ...DEFAULT_MAP_CENTER, name: "郑州中心" };
}

function routeOriginShortText() {
  if (state.currentLocation) return state.currentLocation.source === "stored" ? "上次位置" : "当前位置";
  if (state.mapViewport?.manual) return "地图中心";
  if (state.mapFocus) return "地图焦点";
  return "郑州中心";
}

function currentRoutePlan() {
  if (!state.routePlan) return null;
  const planIds = (state.routePlan.routeIds || []).map(Number).join(",");
  const routeIds = state.routeIds.map(Number).join(",");
  return planIds && planIds === routeIds ? state.routePlan : null;
}

function routePlanStateText() {
  if (state.routePlanning) return "正在计算驾车距离和时间";
  if (currentRoutePlan()) return "已按真实驾车路线展示";
  if (state.routePlanError) return "驾车规划暂不可用，先用估算路线";
  if (state.routeIds.length) return "路线已保存，可刷新真实驾车路线";
  return "先选择或生成一条路线";
}

function routePlanDetailText(plan, origin, planned) {
  if (!planned.length) return "";
  if (state.routePlanning) {
    return `起点：${routeOriginShortText()}，正在计算 ${planned.length} 个站点的驾车路线。`;
  }
  if (plan) {
    const roads = (plan.legs || [])
      .flatMap((leg) => leg.roads || [])
      .filter(Boolean)
      .slice(0, 4)
      .join("、");
    return `起点：${origin.name || routeOriginShortText()}，共 ${Number(plan.distanceKm || 0).toFixed(1)} 公里，约 ${Math.max(1, Math.round(Number(plan.durationMinutes) || 0))} 分钟${roads ? `，主要经过 ${roads}` : ""}。`;
  }
  if (state.routePlanError) {
    return `高德驾车规划暂不可用：${state.routePlanError}。当前仍按站点坐标估算顺序，逐站导航不受影响。`;
  }
  return "路线顺序已保存。点击刷新驾车路线后，会用真实道路距离替换估算值。";
}

function routeDistanceText() {
  const plan = currentRoutePlan();
  return `${plan ? Number(plan.distanceKm || 0).toFixed(1) : `约 ${estimatedDistance()}`} 公里`;
}

function routeDurationText() {
  const plan = currentRoutePlan();
  if (plan) return `${Math.max(1, Math.round(Number(plan.durationMinutes) || 0))} 分钟`;
  return `约 ${estimatedHours()} 小时`;
}

function routePolylinePoints() {
  const plan = currentRoutePlan();
  const planPoints = (plan?.legs || []).flatMap((leg) => leg.polyline || []);
  if (planPoints.length >= 2) return planPoints;

  const points = routeSites()
    .filter(validSiteCoordinate)
    .map((site) => [Number(site.lat), Number(site.lng)]);
  const origin = routeOrigin();
  if (points.length && validSiteCoordinate(origin)) {
    points.unshift([Number(origin.lat), Number(origin.lng)]);
  }
  return points;
}

function routeLegFor(siteId, index) {
  const plan = currentRoutePlan();
  if (!plan) return null;
  const direct = plan.legs?.[index];
  if (direct && Number(direct.siteId) === Number(siteId)) return direct;
  return (plan.legs || []).find((leg) => Number(leg.siteId) === Number(siteId)) || null;
}

function activeRouteGuideSite(planned = routeSites()) {
  const routeIds = planned.map((site) => Number(site.id));
  if (!routeIds.length) return null;
  const activeId = Number(state.routeGuideSiteId);
  if (routeIds.includes(activeId)) {
    return planned.find((site) => Number(site.id) === activeId);
  }
  return planned[0];
}

function routeStepMeta(site, index, planned, origin, leg) {
  const base = `${site.district || "未知区域"} · ${site.brand || "未识别品牌"}`;
  if (leg) {
    const km = (Number(leg.distanceMeters || 0) / 1000).toFixed(1);
    const minutes = Math.max(1, Math.round(Number(leg.durationSeconds || 0) / 60));
    const roads = (leg.roads || []).filter(Boolean).slice(0, 2).join(" / ");
    return `${base} · 驾车 ${km}km / ${minutes}分钟${roads ? ` · 经 ${roads}` : ""}`;
  }
  const previous = index === 0 ? origin : planned[index - 1];
  const distance = validSiteCoordinate(previous) && validSiteCoordinate(site) ? ` · 距上一点 ${distanceKm(previous, site).toFixed(1)}km` : "";
  return `${base} · ${site.nextFollow || "待设置跟进"}${distance}`;
}

function routeReasonText(site, origin = null) {
  const reasons = [];
  if (site.nextFollow) {
    if (site.nextFollow < todayIso()) reasons.push(`逾期 ${site.nextFollow}`);
    else if (site.nextFollow === todayIso()) reasons.push("今日跟进");
    else if (site.nextFollow <= addDays(7)) reasons.push(`7天内 ${site.nextFollow}`);
    else reasons.push(`跟进 ${site.nextFollow}`);
  } else {
    reasons.push("未设跟进日");
  }
  if (site.status === "key") reasons.push("重点客户");
  else reasons.push(statusLabel(site.status));
  if (site.intentLevel) reasons.push(`${site.intentLevel}意向`);
  const potential = Number(site.potentialVehicles) || 0;
  if (potential > 0) reasons.push(`潜力 ${potential} 台`);
  if (origin && validSiteCoordinate(origin) && validSiteCoordinate(site)) {
    reasons.push(`离起点 ${distanceKm(origin, site).toFixed(1)}km`);
  }
  return reasons.join(" · ");
}

function routeCandidateGroups(origin) {
  const routeSet = new Set(state.routeIds.map(Number));
  const base = sites.filter((site) => isRouteCandidate(site) && !routeSet.has(Number(site.id)));
  const visible = mapVisibleSites().filter((site) => isRouteCandidate(site) && !routeSet.has(Number(site.id)));
  const due = base
    .filter((site) => site.nextFollow && site.nextFollow <= addDays(7))
    .sort((a, b) => routeScore(b) - routeScore(a));
  const highIntent = base
    .filter((site) => site.status === "key" || site.status === "intent" || String(site.intentLevel || "").includes("高"))
    .sort((a, b) => routeScore(b) - routeScore(a));
  const nearby = [...base].sort((a, b) => distanceKm(origin, a) - distanceKm(origin, b));
  const smart = [...base].sort((a, b) => recommendedScore(b, origin) - recommendedScore(a, origin));

  return [
    { title: "离起点最近", subtitle: `按 ${routeOriginShortText()} 由近到远`, action: "autoRoute", origin, items: nearby },
    { title: "当前地图附近", subtitle: "跟随首页地图视野和筛选条件", action: "routeFromMap", origin, items: visible },
    { title: "应跟进优先", subtitle: "逾期、今日和 7 天内跟进", action: "routeDueSites", origin, items: due },
    { title: "高价值优先", subtitle: "重点、高意向和车辆潜力", action: "routeHighIntent", origin, items: highIntent.length ? highIntent : smart },
  ];
}

function routeCandidatesForMode(mode, origin) {
  const base = sites.filter(isRouteCandidate);
  if (mode === "map") {
    const visible = mapVisibleSites().filter(isRouteCandidate);
    return visible.length ? visible : base;
  }
  if (mode === "due") {
    return base
      .filter((site) => site.nextFollow && site.nextFollow <= addDays(7))
      .sort((a, b) => routeScore(b) - routeScore(a));
  }
  if (mode === "highIntent") {
    return base
      .filter((site) => site.status === "key" || site.status === "intent" || String(site.intentLevel || "").includes("高"))
      .sort((a, b) => routeScore(b) - routeScore(a));
  }
  return [...base].sort((a, b) => recommendedScore(b, origin) - recommendedScore(a, origin));
}

function routeScore(site) {
  const statusScore = { key: 6, active: 4, intent: 5, target: 3, paused: 0 }[site.status] || 0;
  const intentScore = { 高: 4, 中: 2, 低: 1, 未知: 1, 待判断: 1 }[site.intentLevel] || 0;
  const dueScore = site.nextFollow ? (site.nextFollow <= todayIso() ? 5 : site.nextFollow <= addDays(7) ? 2 : 0) : 0;
  return statusScore + intentScore + dueScore + (Number(site.potentialVehicles) || 0) / 2;
}

function buildPriorityRoute(limit = 5) {
  return sites
    .filter(isRouteCandidate)
    .sort((a, b) => routeScore(b) - routeScore(a))
    .slice(0, limit)
    .map((site) => site.id);
}

function buildRouteFromOrigin(origin, limit = 5) {
  const candidates = sites
    .filter(isRouteCandidate)
    .sort((a, b) => recommendedScore(b, origin) - recommendedScore(a, origin))
    .slice(0, Math.max(limit * 2, 8));
  return buildRouteFromCandidates(candidates, origin, limit);
}

function buildRouteFromCandidates(candidates, origin = routeOrigin(), limit = 6) {
  const uniqueCandidates = dedupeSites(candidates)
    .filter(isRouteCandidate)
    .sort((a, b) => recommendedScore(b, origin) - recommendedScore(a, origin))
    .slice(0, Math.max(limit * 2, 10));
  const ordered = [];
  let cursor = origin;
  const remaining = [...uniqueCandidates];
  while (remaining.length && ordered.length < limit) {
    remaining.sort((a, b) => {
      const aDistance = validSiteCoordinate(cursor) ? distanceKm(cursor, a) : 0;
      const bDistance = validSiteCoordinate(cursor) ? distanceKm(cursor, b) : 0;
      return (aDistance - bDistance) || (recommendedScore(b, origin) - recommendedScore(a, origin));
    });
    const next = remaining.shift();
    ordered.push(next);
    cursor = next;
  }
  return ordered.map((site) => site.id);
}

function isRouteCandidate(site) {
  return site.status !== "paused" && Number.isFinite(Number(site.lat)) && Number.isFinite(Number(site.lng));
}

function recommendedScore(site, origin = null) {
  const businessScore = routeScore(site);
  if (!origin) return businessScore;
  const distance = distanceKm(origin, site);
  const nearBonus = Math.max(0, 8 - distance * 0.35);
  return businessScore * 1.4 + nearBonus - distance * 0.08;
}

function dueSites(days = 0) {
  const limit = addDays(days);
  return sites.filter((site) => site.nextFollow && site.nextFollow <= limit && site.status !== "paused");
}

function estimatedDistance() {
  const points = routeSites();
  if (!points.length) return "0.0";
  const origin = routeOrigin();
  const routePoints = validSiteCoordinate(origin) ? [origin, ...points] : points;
  if (routePoints.length <= 1) return "0.0";
  const kilometers = routePoints.slice(1).reduce((sum, site, index) => sum + distanceKm(routePoints[index], site), 0);
  return kilometers.toFixed(1);
}

function estimatedHours() {
  const points = routeSites().length;
  const distance = Number(estimatedDistance());
  if (!points) return "0.0";
  return (distance / 22 + points * 0.18).toFixed(1);
}

function openRouteGuide(siteId = null) {
  const planned = routeSites().filter(validSiteCoordinate);
  if (!planned.length) {
    alert("请先生成或选择一条拜访路线。");
    return;
  }
  const requested = siteId ? getSiteById(siteId) : null;
  state.routeGuideSiteId = requested && planned.some((site) => Number(site.id) === Number(requested.id))
    ? requested.id
    : planned[0].id;
  state.view = "visit";
  state.visitTab = "route";
  render();
}

function moveRouteGuide(direction) {
  const planned = routeSites().filter(validSiteCoordinate);
  if (!planned.length) return;
  const active = activeRouteGuideSite(planned);
  const currentIndex = planned.findIndex((site) => Number(site.id) === Number(active?.id));
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), planned.length - 1);
  state.routeGuideSiteId = planned[nextIndex]?.id || planned[0].id;
  render();
}

function openExternalSiteNavigation(siteId) {
  const site = getSiteById(siteId);
  if (!validSiteCoordinate(site)) {
    alert("这个站点缺少有效坐标，先补充经纬度后再导航。");
    return;
  }
  openExternalNavigation(amapRouteUrl({
    destination: site,
    origin: navigationOrigin(),
  }));
}

function openExternalRouteNavigation() {
  const planned = routeSites().filter(validSiteCoordinate);
  if (!planned.length) {
    alert("请先生成或选择一条拜访路线。");
    return;
  }
  const destination = planned[planned.length - 1];
  const waypoints = planned.slice(0, -1).slice(0, 8);
  openExternalNavigation(amapRouteUrl({
    destination,
    origin: navigationOrigin(),
    waypoints,
  }));
}

function navigationOrigin() {
  return validSiteCoordinate(state.currentLocation) ? { ...state.currentLocation, name: "我的位置" } : null;
}

function amapPointParam(point, fallbackName) {
  const lng = Number(point.lng).toFixed(6);
  const lat = Number(point.lat).toFixed(6);
  const name = String(point.name || fallbackName || "位置").replace(/[,&;]/g, " ");
  return `${lng},${lat},${name}`;
}

function amapRouteUrl({ destination, origin = null, waypoints = [] }) {
  const params = new URLSearchParams();
  if (origin && validSiteCoordinate(origin)) {
    params.set("from", amapPointParam(origin, "我的位置"));
  }
  params.set("to", amapPointParam(destination, "目的地"));
  if (waypoints.length) {
    params.set("via", waypoints.map((site) => amapPointParam(site, "途经点")).join(";"));
  }
  params.set("mode", "car");
  params.set("policy", "1");
  params.set("src", "zhitu-kxsl-crm");
  params.set("coordinate", "gaode");
  params.set("callnative", "1");
  return `https://uri.amap.com/navigation?${params.toString()}`;
}

function openExternalNavigation(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
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
