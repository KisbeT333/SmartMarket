const API = "https://smartmarket-a133.onrender.com/api";

/* ══════════════════════════════════
   STATE / CACHE
══════════════════════════════════ */
let ME             = null;   // thông tin manager đang đăng nhập
let myMarketIds    = [];     // mảng id chợ được phân công

let myMarketsCache  = [];
let stallCache      = [];
let traderCache     = [];
let contractCache   = [];
let invoiceCache    = [];
let productCache    = [];
let stallReqCache   = [];
let renewalCache    = [];
let feedbackCache   = [];
let _allZones       = [];

// Pagination
const pages    = {};
const PAGE_SZ  = 10;

// Delete state
const delState = { id: null, label: "", endpoint: "", onSuccess: null };

// Review state
let currentSrId = null;
let currentRrId = null;
let currentFbId = null;
let currentPage = "dashboard";

/* ══════════════════════════════════
   AUTH
══════════════════════════════════ */
function getToken() { return localStorage.getItem("token") || ""; }
function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
function logout() {
  if (!confirm("Đăng xuất?")) return;
  localStorage.removeItem("token");
  window.location.href = "../pages/login.html";
}

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */
function fmtCurrency(v) {
  return (v == null || v === "") ? "—" : Number(v).toLocaleString("vi-VN") + " đ";
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString("vi-VN") : "—"; }

function emptyState(icon, title, sub = "") {
  return `<div class="empty-state"><i class="fa-solid ${icon}"></i><div class="empty-title">${title}</div>${sub ? `<div class="empty-sub">${sub}</div>` : ""}</div>`;
}
function loadingState() {
  return `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><span class="empty-sub">Đang tải...</span></div>`;
}
function emptyRow(cols, msg = "Chưa có dữ liệu") {
  return `<tr><td colspan="${cols}">${emptyState("fa-inbox", msg)}</td></tr>`;
}
function loadRow(cols) {
  return `<tr><td colspan="${cols}">${loadingState()}</td></tr>`;
}

function fillSelect(el, items, valKey, labelFn, empty = "— Chọn —") {
  if (!el) return;
  const prev = el.value;
  el.innerHTML = `<option value="">${empty}</option>`;
  (items || []).forEach(i => {
    const o = document.createElement("option");
    o.value = i[valKey]; o.textContent = labelFn(i);
    el.appendChild(o);
  });
  if (prev) el.value = prev;
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? "—";
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* ══════════════════════════════════
   TOAST
══════════════════════════════════ */
const T_ICONS = {
  success: "fa-circle-check", error: "fa-circle-exclamation",
  info: "fa-circle-info", warning: "fa-triangle-exclamation"
};
function showToast(msg, type = "info", duration = 3500) {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${T_ICONS[type] || T_ICONS.info} t-icon"></i><div class="t-body">${msg}</div><button class="t-close" onclick="dismissToast(this.parentElement)">×</button>`;
  c.appendChild(el);
  setTimeout(() => dismissToast(el), duration);
}
function dismissToast(el) {
  if (!el?.parentElement) return;
  el.classList.add("leaving");
  setTimeout(() => el?.remove(), 210);
}

/* ══════════════════════════════════
   FORM MESSAGE
══════════════════════════════════ */
function showFormMsg(id, msg, isError = false) {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  el.classList.toggle("error", isError);
  el.classList.toggle("success", !isError);
}
function hideFormMsg(id) {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.remove("show", "error", "success");
  el.textContent = "";
}

/* ══════════════════════════════════
   MODAL
══════════════════════════════════ */
function openModal(id) { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
function closeModalOverlay(e, id) { if (e.target.id === id) closeModal(id); }
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(el => el.classList.remove("open"));
});

/* ══════════════════════════════════
   PAGINATION
══════════════════════════════════ */
function paginate(items, key, size = PAGE_SZ) {
  if (!pages[key]) pages[key] = 1;
  const total = Math.max(1, Math.ceil(items.length / size));
  const cur   = Math.min(Math.max(1, pages[key]), total);
  pages[key]  = cur;
  return { items: items.slice((cur - 1) * size, cur * size), total, cur };
}
function renderPag(containerId, cur, total, count, fnName) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total <= 1) { el.innerHTML = `<span>${count} mục</span>`; return; }
  let btns = "";
  for (let i = 1; i <= total; i++) {
    const edge = i === 1 || i === total, near = Math.abs(i - cur) <= 1;
    if (edge || near) {
      btns += `<button class="btn btn-outline btn-sm pg-btn ${i === cur ? "active" : ""}" onclick="${fnName}(${i})">${i}</button>`;
    } else if (i === 2 || i === total - 1) {
      btns += `<span style="padding:0 4px;color:var(--text3);">…</span>`;
    }
  }
  el.innerHTML = `
    <span>${count} mục · Trang ${cur}/${total}</span>
    <div class="pg-controls">
      <button class="btn btn-outline btn-sm" ${cur <= 1 ? "disabled" : ""} onclick="${fnName}(${cur - 1})">← Trước</button>
      ${btns}
      <button class="btn btn-outline btn-sm" ${cur >= total ? "disabled" : ""} onclick="${fnName}(${cur + 1})">Tiếp →</button>
    </div>`;
}

/* ══════════════════════════════════
   DELETE CHUNG
══════════════════════════════════ */
function openDeleteModal({ id, name, label, endpoint, onSuccess }) {
  delState.id = id; delState.label = label;
  delState.endpoint = endpoint; delState.onSuccess = onSuccess;
  document.getElementById("delTitle").textContent = `Xóa ${label}`;
  document.getElementById("delName").textContent  = name || `#${id}`;
  document.getElementById("delLabel").textContent = label;
  hideFormMsg("delMsg");
  openModal("modalDelete");
}
async function confirmDelete() {
  if (delState.id == null) return;
  const btn = document.getElementById("delConfirmBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
  try {
    const res  = await fetch(`${delState.endpoint}/${delState.id}`, { method: "DELETE", headers: authHeader() });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("delMsg", data.message || "Không thể xóa", true);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
      return;
    }
    showToast(`Đã xóa ${delState.label} thành công`, "success");
    if (delState.onSuccess) delState.onSuccess();
    setTimeout(() => {
      closeModal("modalDelete");
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
    }, 400);
  } catch (err) {
    showFormMsg("delMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
  }
}

/* ══════════════════════════════════
   SUBMIT FORM HELPER
══════════════════════════════════ */
async function submitForm({ url, method, payload, msgId, btnId, successMsg, onSuccess }) {
  const msg  = document.getElementById(msgId);
  const btn  = document.getElementById(btnId);
  const orig = btn?.innerHTML || "";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
  hideFormMsg(msg);
  try {
    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg(msg, data.message || "Không thể lưu", true);
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      return;
    }
    showFormMsg(msg, successMsg, false);
    showToast(successMsg, "success");
    setTimeout(() => { if (onSuccess) onSuccess(); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 600);
  } catch (err) {
    showFormMsg(msg, "Lỗi kết nối: " + err.message, true);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

/* ══════════════════════════════════
   NAVIGATION
══════════════════════════════════ */
const PAGE_TITLES = {
  dashboard:          "Dashboard",
  "my-markets":       "Chợ của tôi",
  stalls:             "Sạp / Gian hàng",
  traders:            "Tiểu thương",
  contracts:          "Hợp đồng",
  "stall-requests":   "Yêu cầu thuê sạp",
  "renewal-requests": "Yêu cầu gia hạn",
  "stall-feedback":   "Phản ánh của sạp",
  invoices:           "Hóa đơn thuê sạp",
  products:           "Sản phẩm trong chợ",
  profile:            "Hồ sơ cá nhân",
};

function goPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add("active");
  const t = document.getElementById("headerTitle");
  if (t) t.textContent = PAGE_TITLES[page] || page;
  currentPage = page;

  const loaders = {
    dashboard:          loadDashboard,
    "my-markets":       loadMyMarkets,
    stalls:             loadStalls,
    traders:            loadTraders,
    contracts:          loadContracts,
    "stall-requests":   loadStallRequests,
    "renewal-requests": loadRenewalRequests,
    "stall-feedback":   loadStallFeedback,
    invoices:           loadInvoices,
    products:           loadProducts,
    profile:            loadProfile,
  };
  if (loaders[page]) loaders[page]();
  if (window.innerWidth <= 720) document.getElementById("sidebar")?.classList.remove("open");
}

function refreshCurrentPage() { goPage(currentPage); }
function toggleSidebar() { document.getElementById("sidebar")?.classList.toggle("open"); }

/* ══════════════════════════════════
   LOAD ME — GET /api/manager/me
   Thông tin manager + danh sách chợ
══════════════════════════════════ */
async function loadMe() {
  try {
    const res  = await fetch(`${API}/manager/me`, { headers: authHeader() });
    if (!res.ok) throw new Error("Unauthorized");
    const data = await res.json();

    // ManagermeRoutes trả về: { success, manager, markets }
    ME           = data.manager || data.data || {};
    myMarketsCache = data.markets || [];
    myMarketIds    = myMarketsCache.map(m => m.id);

    updateSidebarUI();

    if (myMarketsCache.length === 0) {
      showToast("Bạn chưa được Admin phân công quản lý chợ nào. Vui lòng liên hệ Admin.", "warning", 6000);
    }
  } catch (err) {
    // Fallback: parse JWT để lấy tên tối thiểu
    try {
      const token   = getToken();
      const payload = JSON.parse(atob(token.split(".")[1]));
      ME = { full_name: payload.full_name || payload.username, username: payload.username, role_name: payload.role_name };
      updateSidebarUI();
    } catch {}
    showToast("Không thể tải thông tin tài khoản", "warning");
  }
}

function updateSidebarUI() {
  if (!ME) return;
  const initials = (ME.full_name || "MG").split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();

  setEl("mgrName", ME.full_name);
  ["mgrAvatar"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = initials; });
  setEl("wbName", ME.full_name);

  // Hiển thị chợ chính trong sidebar
  if (myMarketsCache.length > 0) {
    const first = myMarketsCache[0];
    setEl("sidebarMarketName", first.name);
    setEl("sidebarMarketMeta", `${first.address || ""}${first.city ? ", " + first.city : ""}`);
    setEl("headerMarketTag", first.name);
    setEl("wbMarket", myMarketsCache.map(m => m.name).join(" · "));

    if (myMarketsCache.length > 1) {
      const more = document.getElementById("sidebarMarketMore");
      if (more) { more.style.display = ""; document.getElementById("sidebarMoreCount").textContent = myMarketsCache.length - 1; }
    }
  }
}

/* ══════════════════════════════════
   LOAD PROFILE
══════════════════════════════════ */
function loadProfile() {
  if (!ME) return;
  const initials = (ME.full_name || "MG").split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();
  const avatar = document.getElementById("profileAvatar");
  if (avatar) avatar.textContent = initials;
  setEl("profileName",     ME.full_name);
  setEl("profileUsername", ME.username);
  setEl("profileRole",     ME.role_name || "MANAGER");
  setEl("profileMarkets",  myMarketsCache.map(m => m.name).join(", ") || "—");

  const listEl = document.getElementById("profileMarketList");
  if (listEl) {
    if (!myMarketsCache.length) { listEl.innerHTML = emptyState("fa-shop", "Chưa được phân công chợ nào"); return; }
    listEl.innerHTML = myMarketsCache.map(m => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13.5px;font-weight:700;">${m.name}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;"><i class="fa-solid fa-location-dot"></i> ${m.address || ""}${m.city ? ", " + m.city : ""}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge badge-green">Hoạt động</span>
          <button class="btn btn-outline btn-sm" onclick="goPage('stalls')"><i class="fa-solid fa-border-all"></i> Sạp</button>
        </div>
      </div>
    `).join("") + (myMarketsCache.length === 0 ? '<div class="tc" style="color:var(--text3);">Chưa có</div>' : "");
  }
}

/* ══════════════════════════════════
   DASHBOARD
══════════════════════════════════ */
async function loadDashboard() {
  try {
    await Promise.all([loadStalls(), loadTraders(), loadContracts(), loadProducts(), loadStallRequests(), loadRenewalRequests(), loadInvoices()]);

    // Stats
    const totalStalls   = stallCache.length;
    const rentedStalls  = stallCache.filter(s => s.status === "rented").length;
    const emptyStalls   = stallCache.filter(s => s.status === "available").length;
    const activeContracts = contractCache.filter(c => c.status === "active").length;
    const overdueInvoices = invoiceCache.filter(f => f.status === "OVERDUE").length;

    setEl("d-stalls-total",   totalStalls);
    setEl("d-traders",        traderCache.length);
    setEl("d-contracts-total", contractCache.length);
    setEl("d-products",       productCache.length);
    setEl("d-overdue-invoices", overdueInvoices);

    const stallSub = document.getElementById("d-stalls-sub");
    if (stallSub) stallSub.innerHTML = `<i class="fa-solid fa-circle-info"></i> Đang thuê: ${rentedStalls} · Trống: ${emptyStalls}`;
    const ctSub = document.getElementById("d-contracts-sub");
    if (ctSub) ctSub.innerHTML = `<i class="fa-solid fa-circle-info"></i> Còn hiệu lực: ${activeContracts}`;
    const odSub = document.getElementById("d-overdue-sub");
    if (odSub) odSub.innerHTML = overdueInvoices > 0
      ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> <a href="#" onclick="goPage('invoices');return false;" style="color:var(--danger);font-weight:600;">Cần xử lý ngay</a>`
      : `<i class="fa-solid fa-circle-check"></i> Không có hóa đơn quá hạn`;

    renderStallStatusChart(totalStalls, rentedStalls, emptyStalls);
    renderExpiringContracts();
    renderDashboardContracts();
    renderPendingAlerts();
    updateRequestBadges();

  } catch (err) {
    showToast("Lỗi tải dashboard: " + err.message, "error");
  }
}

function renderStallStatusChart(total, rented, empty) {
  const maintenance = total - rented - empty;
  const el = document.getElementById("stallStatusChart");
  if (!el) return;
  if (!total) { el.innerHTML = emptyState("fa-border-all", "Không có dữ liệu"); return; }

  const items = [
    { label: "Đang thuê", count: rented,      pct: Math.round(rented / total * 100),      color: "var(--primary)" },
    { label: "Trống",     count: empty,        pct: Math.round(empty / total * 100),        color: "var(--info)" },
    { label: "Bảo trì",  count: maintenance,  pct: Math.round(maintenance / total * 100),  color: "var(--accent)" },
  ];

  el.innerHTML = items.map(i => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;">
        <span style="color:var(--text2);font-weight:500;">${i.label}</span>
        <span style="font-weight:700;">${i.count} <span style="color:var(--text3);font-weight:400;">(${i.pct}%)</span></span>
      </div>
      <div class="prog-wrap"><div class="prog-fill" style="width:${i.pct}%;background:${i.color};"></div></div>
    </div>
  `).join("");
}

function renderExpiringContracts() {
  const el = document.getElementById("expiringContracts");
  if (!el) return;
  const now = Date.now();
  const expiring = contractCache.filter(c => {
    if (c.status !== "active" || !c.end_date) return false;
    const days = Math.floor((new Date(c.end_date).getTime() - now) / 86400000);
    return days >= 0 && days <= 60;
  }).sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

  if (!expiring.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;"><i class="fa-solid fa-circle-check" style="color:var(--primary);font-size:20px;display:block;margin-bottom:8px;"></i>Không có hợp đồng nào sắp hết hạn</div>`;
    return;
  }

  el.innerHTML = expiring.slice(0, 5).map(c => {
    const days = Math.floor((new Date(c.end_date).getTime() - now) / 86400000);
    const urgency = days <= 7 ? "badge-red" : days <= 30 ? "badge-amber" : "badge-blue";
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13px;font-weight:600;">Sạp ${c.stall_code || "—"} <span style="color:var(--text3);font-weight:400;">· ${c.market_name || ""}</span></div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${c.business_name || "—"} · Hết: ${fmtDate(c.end_date)}</div>
        </div>
        <span class="badge ${urgency}">${days} ngày</span>
      </div>`;
  }).join("") + (expiring.length > 5 ? `<div style="text-align:center;margin-top:10px;"><button class="btn btn-outline btn-sm" onclick="goPage('contracts')">Xem tất cả ${expiring.length} HĐ sắp hết hạn</button></div>` : "");
}

function renderDashboardContracts() {
  const el = document.getElementById("d-recentContracts");
  if (!el) return;
  const CT_BADGE = { active: '<span class="badge badge-green">Còn HLực</span>', pending: '<span class="badge badge-amber">Chờ ký</span>', expired: '<span class="badge badge-red">Hết hạn</span>' };
  const rows = contractCache.slice(0, 6).map(c => `
    <tr>
      <td><strong>#${c.id}</strong></td>
      <td>${c.business_name || "—"}</td>
      <td>${c.stall_code || "—"}</td>
      <td>${fmtDate(c.start_date)}</td>
      <td>${fmtDate(c.end_date)}</td>
      <td><strong>${fmtCurrency(c.monthly_rent)}</strong></td>
      <td>${CT_BADGE[c.status] || `<span class="badge badge-gray">${c.status || "—"}</span>`}</td>
    </tr>`).join("") || emptyRow(7, "Chưa có hợp đồng");
  el.innerHTML = rows;
}

function renderPendingAlerts() {
  const alertEl = document.getElementById("dashAlerts");
  if (!alertEl) return;
  const pendingSr = stallReqCache.filter(r => r.status === "PENDING").length;
  const pendingRr = renewalCache.filter(r => r.status === "PENDING").length;
  const overdueN  = invoiceCache.filter(f => f.status === "OVERDUE").length;
  const alerts    = [];
  if (overdueN > 0) alerts.push(`<div class="alert-box alert-danger"><i class="fa-solid fa-triangle-exclamation"></i><span>Có <strong>${overdueN}</strong> hóa đơn thuê sạp đã quá hạn thanh toán trong chợ bạn quản lý. <a href="#" onclick="goPage('invoices');return false;" style="color:var(--danger);font-weight:600;">Xem ngay →</a></span></div>`);
  if (pendingSr > 0) alerts.push(`<div class="alert-box alert-warn"><i class="fa-solid fa-door-open"></i><span>Có <strong>${pendingSr}</strong> yêu cầu thuê sạp đang chờ duyệt. <a href="#" onclick="goPage('stall-requests');return false;" style="color:var(--warning);font-weight:600;">Xét duyệt ngay →</a></span></div>`);
  if (pendingRr > 0) alerts.push(`<div class="alert-box alert-warn"><i class="fa-solid fa-rotate"></i><span>Có <strong>${pendingRr}</strong> yêu cầu gia hạn hợp đồng đang chờ duyệt. <a href="#" onclick="goPage('renewal-requests');return false;" style="color:var(--warning);font-weight:600;">Xét duyệt ngay →</a></span></div>`);
  alertEl.innerHTML = alerts.join("");
}

function updateRequestBadges() {
  const pendingSr = stallReqCache.filter(r => r.status === "PENDING").length;
  const pendingRr = renewalCache.filter(r => r.status === "PENDING").length;
  const pendingFb = feedbackCache.filter(r => r.status === "PENDING").length;
  const overdueN  = invoiceCache.filter(f => f.status === "OVERDUE").length;
  const srBadge   = document.getElementById("navSrBadge");
  const rrBadge   = document.getElementById("navRrBadge");
  const fbBadge   = document.getElementById("navFbBadge");
  const odBadge   = document.getElementById("navOverdueBadge");
  if (srBadge) { srBadge.textContent = pendingSr; srBadge.style.display = pendingSr ? "" : "none"; }
  if (rrBadge) { rrBadge.textContent = pendingRr; rrBadge.style.display = pendingRr ? "" : "none"; }
  if (fbBadge) { fbBadge.textContent = pendingFb; fbBadge.style.display = pendingFb ? "" : "none"; }
  if (odBadge) { odBadge.textContent = overdueN;  odBadge.style.display = overdueN  ? "" : "none"; }
}

/* ══════════════════════════════════
   MY MARKETS — GET /api/manager/me
══════════════════════════════════ */
async function loadMyMarkets() {
  const el = document.getElementById("myMarketsGrid");
  if (!el) return;
  if (!myMarketsCache.length) {
    el.innerHTML = emptyState("fa-shop", "Chưa được phân công chợ nào");
    return;
  }
  el.innerHTML = myMarketsCache.map(m => `
    <div class="card" style="margin-bottom:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:10px;">
        <div>
          <div style="font-size:16px;font-weight:700;margin-bottom:4px;">${m.name}</div>
          <div style="font-size:12.5px;color:var(--text3);"><i class="fa-solid fa-location-dot"></i> ${m.address || ""}${m.city ? ", " + m.city : ""}</div>
        </div>
        <span class="badge badge-green">Hoạt động</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:var(--primary);">${stallCache.filter(s => s.market_name === m.name).length}</div>
          <div style="font-size:11px;color:var(--text3);">Sạp</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:var(--primary);">${traderCache.filter(t => t.market_name === m.name).length}</div>
          <div style="font-size:11px;color:var(--text3);">Tiểu thương</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:var(--primary);">${contractCache.filter(c => c.market_name === m.name && c.status === "active").length}</div>
          <div style="font-size:11px;color:var(--text3);">HĐ còn HLực</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="goPage('stalls')"><i class="fa-solid fa-border-all"></i> Sạp</button>
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="goPage('contracts')"><i class="fa-solid fa-file-contract"></i> Hợp đồng</button>
      </div>
    </div>
  `).join("");
}

/* ══════════════════════════════════
   STALLS — GET /api/stalls (filter by my markets)
══════════════════════════════════ */
const STALL_META = {
  available:   { label: "Trống",      icon: "fa-square-dashed", badge: "blue" },
  rented:      { label: "Đang thuê",  icon: "fa-store",         badge: "green" },
  maintenance: { label: "Bảo trì",    icon: "fa-wrench",        badge: "amber" },
};

async function loadStalls() {
  const gridEl = document.getElementById("stallGrid");
  if (gridEl) gridEl.innerHTML = loadingState();
  try {
    const [sRes, zRes] = await Promise.all([fetch(`${API}/stalls`), fetch(`${API}/zones`)]);
    const allStalls    = (await sRes.json()).data || [];
    _allZones          = (await zRes.json()).data || [];
    // Lọc chỉ sạp thuộc chợ manager quản lý
    stallCache = allStalls.filter(s => myMarketIds.includes(s.market_id));

    // Populate market filter dropdown
    const uniqMarkets = [...new Set(stallCache.map(s => s.market_name).filter(Boolean))];
    ["sFilterMarket"].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '<option value="">Tất cả chợ</option>';
      uniqMarkets.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.value = prev;
    });

    pages["stalls"] = 1;
    renderStalls();
  } catch (err) {
    if (gridEl) gridEl.innerHTML = emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu");
    showToast("Lỗi tải sạp: " + err.message, "error");
  }
}

function renderStalls() {
  const mkt = document.getElementById("sFilterMarket")?.value || "";
  const st  = document.getElementById("sFilterStatus")?.value || "";
  const kw  = (document.getElementById("sSearch")?.value || "").toLowerCase();

  const filtered = stallCache.filter(s => {
    if (mkt && s.market_name !== mkt) return false;
    if (st  && s.status !== st)       return false;
    if (kw  && !(s.code || "").toLowerCase().includes(kw)) return false;
    return true;
  });

  const countEl = document.getElementById("sCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${stallCache.length} sạp`;

  const grid = document.getElementById("stallGrid");
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = emptyState("fa-border-all", "Không tìm thấy sạp", "Thử thay đổi bộ lọc");
    return;
  }

  grid.innerHTML = filtered.map(s => {
    const meta = STALL_META[s.status] || { label: s.status || "—", icon: "fa-circle-question", badge: "gray" };
    return `
      <div class="stall-card status-${s.status || ""}">
        <div class="sc-top">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="sc-icon"><i class="fa-solid ${meta.icon}"></i></div>
            <div>
              <div class="sc-code">${s.code}</div>
              <div class="sc-loc">${s.zone_name || "—"} · ${s.market_name || "—"}</div>
            </div>
          </div>
          <span class="badge badge-${meta.badge}">${meta.label}</span>
        </div>
        <div class="sc-info">
          <div class="sc-info-row"><span>Diện tích</span><span>${s.area_m2 != null ? s.area_m2 + " m²" : "—"}</span></div>
          <div class="sc-info-row"><span>Tiền thuê/tháng</span><span class="sc-rent">${s.monthly_rent ? fmtCurrency(s.monthly_rent) : "—"}</span></div>
        </div>
        <div class="sc-actions">
          <button class="btn btn-outline btn-sm" onclick="openEditStallModal(${s.id})"><i class="fa-solid fa-pen"></i> Sửa</button>
          <button class="btn btn-info btn-sm" onclick="createContractForStall(${s.id})"><i class="fa-solid fa-file-contract"></i> HĐ</button>
        </div>
      </div>`;
  }).join("");
}

function openEditStallModal(id) {
  const s = stallCache.find(x => String(x.id) === String(id));
  if (!s) return;
  hideFormMsg("stallFormMsg");
  document.getElementById("sId").value = s.id;
  document.getElementById("stallModalCode").textContent = s.code;
  document.getElementById("sArea").value   = s.area_m2 || "";
  document.getElementById("sRent").value   = s.monthly_rent || "";
  document.getElementById("sStatus").value = s.status || "available";
  openModal("modalStall");
}

async function submitStall(e) {
  e.preventDefault();
  const id = document.getElementById("sId").value;
  const payload = {
    area_m2:      document.getElementById("sArea").value || null,
    monthly_rent: document.getElementById("sRent").value || null,
    status:       document.getElementById("sStatus").value,
  };
  await submitForm({
    url: `${API}/stalls/${id}`, method: "PUT", payload,
    msgId: "stallFormMsg", btnId: "stallSubmitBtn",
    successMsg: "Cập nhật sạp thành công!",
    onSuccess: () => { loadStalls(); closeModal("modalStall"); },
  });
}

function createContractForStall(stallId) {
  goPage("contracts");
  setTimeout(() => openAddContractModal(stallId), 200);
}

/* ══════════════════════════════════
   TRADERS — GET /api/trader (filter by my markets)
══════════════════════════════════ */
async function loadTraders() {
  const tableEl = document.getElementById("traderTable");
  if (tableEl) tableEl.innerHTML = loadRow(7);
  try {
    const res = await fetch(`${API}/trader`, { headers: authHeader() });
    const all = (await res.json()).data || [];
    traderCache = all.filter(t => myMarketIds.includes(t.market_id));

    const uniqMkt = [...new Set(traderCache.map(t => t.market_name).filter(Boolean))];
    const sel = document.getElementById("tFilterMarket");
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = '<option value="">Tất cả chợ</option>';
      uniqMkt.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.value = prev;
    }
    pages["traders"] = 1;
    renderTraders();
  } catch (err) {
    if (tableEl) tableEl.innerHTML = emptyRow(7, "Lỗi tải dữ liệu");
  }
}

function renderTraders() {
  const mkt = document.getElementById("tFilterMarket")?.value || "";
  const st  = document.getElementById("tFilterStatus")?.value || "";
  const kw  = (document.getElementById("tSearch")?.value || "").toLowerCase();

  const filtered = traderCache.filter(t => {
    if (mkt && t.market_name !== mkt) return false;
    if (st  && t.status !== st)       return false;
    if (kw  && !`${t.full_name || ""} ${t.phone || ""} ${t.business_name || ""}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  const countEl = document.getElementById("tCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${traderCache.length} tiểu thương`;

  const { items, total, cur } = paginate(filtered, "traders");
  const el = document.getElementById("traderTable");
  if (!el) return;

  el.innerHTML = items.map(t => `
    <tr>
      <td><strong>${t.full_name || "—"}</strong></td>
      <td>${t.phone || "—"}</td>
      <td>${t.email || "—"}</td>
      <td>${t.business_name || "—"}</td>
      <td>${t.tax_code || "—"}</td>
      <td>${t.market_name || "—"}</td>
      <td>${t.status === "ACTIVE"
        ? '<span class="badge badge-green">Hoạt động</span>'
        : '<span class="badge badge-red">Tạm khóa</span>'}</td>
    </tr>
  `).join("") || emptyRow(7, "Không tìm thấy tiểu thương");

  renderPag("traderPagination", cur, total, filtered.length, "goTraderPage");
}
function goTraderPage(p) { pages["traders"] = p; renderTraders(); }

/* ══════════════════════════════════
   CONTRACTS — GET /api/contracts
══════════════════════════════════ */
const CT_BADGE = {
  active:  '<span class="badge badge-green">Còn hiệu lực</span>',
  pending: '<span class="badge badge-amber">Chờ ký</span>',
  expired: '<span class="badge badge-red">Đã hết hạn</span>',
};
const CT_TEXT = { active: "Còn hiệu lực", pending: "Chờ ký", expired: "Đã hết hạn" };

async function loadContracts() {
  const listEl = document.getElementById("contractList");
  if (listEl) listEl.innerHTML = loadingState();
  try {
    const res  = await fetch(`${API}/contracts`);
    const all  = (await res.json()).data || [];
    contractCache = all.filter(c => myMarketIds.includes(c.market_id) || myMarketsCache.some(m => m.name === c.market_name));

    const mktSel = document.getElementById("cFilterMarket");
    if (mktSel) {
      const uniq = [...new Set(contractCache.map(c => c.market_name).filter(Boolean))];
      const prev = mktSel.value;
      mktSel.innerHTML = '<option value="">Tất cả chợ</option>';
      uniq.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; mktSel.appendChild(o); });
      mktSel.value = prev;
    }
    pages["contracts"] = 1;
    renderContracts();
  } catch (err) {
    if (listEl) listEl.innerHTML = emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu");
  }
}

function renderContracts() {
  const sf  = document.getElementById("cFilterStatus")?.value || "";
  const mkt = document.getElementById("cFilterMarket")?.value || "";
  const kw  = (document.getElementById("cSearch")?.value || "").toLowerCase();

  const filtered = contractCache.filter(c => {
    if (sf  && c.status !== sf)        return false;
    if (mkt && c.market_name !== mkt)  return false;
    if (kw  && !`${c.business_name || ""} ${c.stall_code || ""}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  const countEl = document.getElementById("cCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${contractCache.length} hợp đồng`;

  const { items, total, cur } = paginate(filtered, "contracts", 8);
  const el = document.getElementById("contractList");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="card">${emptyState("fa-file-contract", "Không tìm thấy hợp đồng", "Thử thay đổi bộ lọc")}</div>`;
    renderPag("contractPagination", 1, 1, 0, "goContractPage");
    return;
  }

  el.innerHTML = items.map(c => {
    const now  = Date.now();
    const days = c.end_date ? Math.floor((new Date(c.end_date).getTime() - now) / 86400000) : null;
    const warn = days !== null && days <= 30 && days >= 0 && c.status === "active"
      ? `<div class="alert-box alert-warn" style="margin-top:10px;padding:8px 12px;font-size:12.5px;"><i class="fa-solid fa-triangle-exclamation"></i> Còn <strong>${days} ngày</strong> hết hạn</div>`
      : "";
    return `
      <div class="contract-card">
        <div class="cc-icon"><i class="fa-solid fa-file-contract"></i></div>
        <div class="cc-body">
          <div class="cc-title">
            Sạp <strong>${c.stall_code || "—"}</strong> · ${c.market_name || "—"}
            ${CT_BADGE[c.status] || `<span class="badge badge-gray">${c.status || "—"}</span>`}
          </div>
          <div class="cc-meta">
            <div class="cc-meta-item"><div class="dl">Cơ sở</div><div class="dv">${c.business_name || "—"}</div></div>
            <div class="cc-meta-item"><div class="dl">Bắt đầu</div><div class="dv">${fmtDate(c.start_date)}</div></div>
            <div class="cc-meta-item"><div class="dl">Kết thúc</div><div class="dv">${fmtDate(c.end_date)}</div></div>
            <div class="cc-meta-item"><div class="dl">Tiền thuê/tháng</div><div class="dv" style="color:var(--primary);">${fmtCurrency(c.monthly_rent)}</div></div>
            <div class="cc-meta-item"><div class="dl">Tiểu thương</div><div class="dv">${c.trader_name || "—"}</div></div>
          </div>
          ${warn}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewContractDetail(${c.id})"><i class="fa-solid fa-eye"></i> Chi tiết</button>
            <button class="btn btn-outline btn-sm" onclick="openEditContractModal(${c.id})"><i class="fa-solid fa-pen"></i> Sửa</button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteContractModal(${c.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
          </div>
        </div>
      </div>`;
  }).join("");

  renderPag("contractPagination", cur, total, filtered.length, "goContractPage");
}
function goContractPage(p) { pages["contracts"] = p; renderContracts(); }

/* ══════════════════════════════════
   INVOICES — GET /api/invoices (lọc theo chợ đang quản lý)
══════════════════════════════════ */
const INV_BADGE = {
  PAID:    '<span class="badge badge-green">Đã thanh toán</span>',
  UNPAID:  '<span class="badge badge-amber">Chưa thanh toán</span>',
  OVERDUE: '<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Quá hạn</span>',
};
function isPayable(status) { return status === "UNPAID" || status === "OVERDUE"; }

async function loadInvoices() {
  const listEl = document.getElementById("invoiceTable");
  if (listEl) listEl.innerHTML = `<tr><td colspan="8" class="tc">${loadingState()}</td></tr>`;
  try {
    const res = await fetch(`${API}/invoices`, { headers: authHeader() });
    const all = (await res.json()).data || [];
    invoiceCache = all.filter(f => myMarketIds.includes(f.market_id) || myMarketsCache.some(m => m.name === f.market_name));

    const mktSel = document.getElementById("iFilterMarket");
    if (mktSel) {
      const uniq = [...new Set(invoiceCache.map(f => f.market_name).filter(Boolean))];
      const prev = mktSel.value;
      mktSel.innerHTML = '<option value="">Tất cả chợ</option>';
      uniq.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; mktSel.appendChild(o); });
      mktSel.value = prev;
    }

    renderInvoiceSummary();
    pages["invoices"] = 1;
    renderInvoices();
    updateRequestBadges();
  } catch (err) {
    if (listEl) listEl.innerHTML = `<tr><td colspan="8">${emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu")}</td></tr>`;
  }
}

function renderInvoiceSummary() {
  const unpaid  = invoiceCache.filter(f => f.status === "UNPAID" || f.status === "OVERDUE");
  const overdue = invoiceCache.filter(f => f.status === "OVERDUE");
  const paid    = invoiceCache.filter(f => f.status === "PAID");
  setEl("i-unpaid-count",  unpaid.length);
  setEl("i-overdue-count", overdue.length);
  setEl("i-paid-count",    paid.length);
  const unpaidAmt = unpaid.reduce((s, f) => s + Number(f.total_amount), 0);
  setHTML("i-unpaid-amount", `<span style="color:var(--danger);">${fmtCurrency(unpaidAmt)}</span>`);
}

function renderInvoices() {
  const sf  = document.getElementById("iFilterStatus")?.value || "";
  const mkt = document.getElementById("iFilterMarket")?.value || "";
  const kw  = (document.getElementById("iSearch")?.value || "").toLowerCase();

  const filtered = invoiceCache.filter(f => {
    if (sf  && f.status !== sf)       return false;
    if (mkt && f.market_name !== mkt) return false;
    if (kw  && !`${f.business_name || ""} ${f.stall_code || ""}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  const countEl = document.getElementById("iCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${invoiceCache.length} hóa đơn`;

  const { items, total, cur } = paginate(filtered, "invoices", 10);
  const el = document.getElementById("invoiceTable");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<tr><td colspan="8">${emptyState("fa-file-invoice", "Không tìm thấy hóa đơn nào")}</td></tr>`;
    renderPag("invoicePagination", 1, 1, 0, "goInvoicePage");
    return;
  }

  el.innerHTML = items.map(f => `
    <tr>
      <td><strong>#${f.id}</strong>${f.contract_period ? `<div style="font-size:11px;color:var(--text3);">Kỳ ${f.contract_period}</div>` : ""}</td>
      <td>${f.market_name || "—"}</td>
      <td><strong>${f.stall_code || "—"}</strong></td>
      <td>${f.business_name || "—"}</td>
      <td><strong class="${isPayable(f.status) ? "inv-unpaid" : "inv-paid"}">${fmtCurrency(f.total_amount)}</strong></td>
      <td>${INV_BADGE[f.status] || f.status}${f.due_date && f.status !== "PAID" ? `<div style="font-size:11px;color:${f.status === "OVERDUE" ? "var(--danger)" : "var(--text3)"};margin-top:2px;">Hạn: ${fmtDate(f.due_date)}</div>` : ""}</td>
      <td>${fmtDate(f.created_at)}</td>
      <td>
        <div class="actions">
          ${isPayable(f.status) ? `
          <button class="btn btn-teal btn-sm" onclick="markInvoicePaid(${f.id})" title="Đánh dấu đã thanh toán (thu tiền mặt tại chợ)">
            <i class="fa-solid fa-check"></i> Đã thu
          </button>` : ""}
        </div>
      </td>
    </tr>`).join("");

  renderPag("invoicePagination", cur, total, filtered.length, "goInvoicePage");
}
function goInvoicePage(p) { pages["invoices"] = p; renderInvoices(); }

/* Manager thu tiền mặt trực tiếp tại chợ → đánh dấu hóa đơn đã thanh toán thủ công
   SỬA: trước đây gọi PUT /api/invoices/:id/status chỉ đổi cờ trạng thái hóa đơn,
   KHÔNG tạo dòng nào trong bảng payments — khiến doanh thu ở Dashboard/Báo cáo
   (tính từ SUM(payments.amount)) và lịch sử thanh toán phía Trader không thấy
   giao dịch này dù hóa đơn đã hiện "Đã thanh toán". Đổi sang gọi đúng
   POST /api/payments (giống cách admin/trader ghi nhận thanh toán) — endpoint
   này tạo payment thật rồi mới cập nhật invoice sang PAID trong 1 transaction. */
async function markInvoicePaid(id) {
  if (!confirm("Xác nhận đã thu tiền hóa đơn này? Hành động này sẽ đánh dấu hóa đơn là Đã thanh toán.")) return;
  const inv = invoiceCache.find(f => String(f.id) === String(id));
  if (!inv) { showToast("Không tìm thấy hóa đơn", "error"); return; }
  try {
    const res  = await fetch(`${API}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ invoice_id: id, amount: inv.total_amount, method: "CASH" }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.message || "Lỗi cập nhật hóa đơn");
    showToast("Đã ghi nhận thanh toán", "success");
    loadInvoices();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  }
}

/* Kích hoạt kiểm tra + tạo hóa đơn tới kỳ ngay lập tức (thay vì đợi cron 00:10) */
async function runBillingNow() {
  const btn = document.getElementById("runBillingBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...'; }
  try {
    const res  = await fetch(`${API}/invoices/run-billing`, { method: "POST", headers: authHeader() });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.message || "Lỗi chạy kiểm tra hóa đơn");
    showToast(data.message || "Đã kiểm tra xong", "success");
    loadInvoices();
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Kiểm tra hóa đơn ngay'; }
  }
}

async function openAddContractModal(preStallId = null) {
  hideFormMsg("contractFormMsg");
  document.getElementById("formContract").reset();
  document.getElementById("ctId").value = "";
  document.getElementById("contractModalTitle").textContent = "Tạo hợp đồng mới";
  document.getElementById("contractSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Tạo hợp đồng';
  document.getElementById("ctTraderId").disabled = false;
  document.getElementById("ctStallId").disabled  = false;
  await _loadTradersStallsForContract();
  if (preStallId) document.getElementById("ctStallId").value = preStallId;
  openModal("modalContract");
}

async function openEditContractModal(id) {
  const c = contractCache.find(x => String(x.id) === String(id));
  if (!c) return;
  hideFormMsg("contractFormMsg");
  document.getElementById("contractModalTitle").textContent = "Sửa hợp đồng";
  document.getElementById("contractSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
  document.getElementById("ctId").value  = c.id;
  document.getElementById("ctTraderId").disabled = true;
  document.getElementById("ctStallId").disabled  = true;
  await _loadTradersStallsForContract();
  document.getElementById("ctTraderId").value = c.trader_id || "";
  document.getElementById("ctStallId").value  = c.stall_id || "";
  document.getElementById("ctStart").value    = c.start_date?.substring(0, 10) || "";
  document.getElementById("ctEnd").value      = c.end_date?.substring(0, 10) || "";
  document.getElementById("ctRent").value     = c.monthly_rent || "";
  document.getElementById("ctStatus").value   = c.status || "active";
  openModal("modalContract");
}

async function _loadTradersStallsForContract() {
  // Dùng cache đã lọc theo chợ của manager
  fillSelect(document.getElementById("ctTraderId"), traderCache, "id", t => `${t.business_name || t.full_name || ""} (${t.market_name || ""})`, "— Chọn tiểu thương —");
  const myStalls = stallCache.filter(s => s.status === "available" || s.status === "rented");
  fillSelect(document.getElementById("ctStallId"), myStalls, "id", s => `${s.code} — ${s.zone_name || ""} · ${s.market_name || ""}`, "— Chọn sạp —");
}

async function submitContract(e) {
  e.preventDefault();
  const id      = document.getElementById("ctId").value;
  const isEdit  = !!id;
  const traderId = document.getElementById("ctTraderId").value;
  const stallId  = document.getElementById("ctStallId").value;
  const start    = document.getElementById("ctStart").value;
  const end      = document.getElementById("ctEnd").value;

  if (!traderId || !stallId || !start || !end) {
    showFormMsg("contractFormMsg", "Vui lòng điền đầy đủ: tiểu thương, sạp, ngày bắt đầu và kết thúc", true);
    return;
  }
  if (new Date(end) <= new Date(start)) {
    showFormMsg("contractFormMsg", "Ngày kết thúc phải sau ngày bắt đầu", true);
    return;
  }

  const payload = isEdit
    ? { start_date: start, end_date: end, monthly_rent: document.getElementById("ctRent").value || null, status: document.getElementById("ctStatus").value }
    : { trader_id: traderId, stall_id: stallId, start_date: start, end_date: end, monthly_rent: document.getElementById("ctRent").value || null, status: document.getElementById("ctStatus").value };

  await submitForm({
    url: isEdit ? `${API}/contracts/${id}` : `${API}/contracts`,
    method: isEdit ? "PUT" : "POST",
    payload,
    msgId: "contractFormMsg",
    btnId: "contractSubmitBtn",
    successMsg: isEdit ? "Cập nhật hợp đồng thành công!" : "Tạo hợp đồng thành công!",
    onSuccess: () => { loadContracts(); loadStalls(); closeModal("modalContract"); },
  });
}

function viewContractDetail(id) {
  const c = contractCache.find(x => String(x.id) === String(id));
  if (!c) return;
  document.getElementById("cdId").textContent = `#${c.id}`;
  document.getElementById("cdGrid").innerHTML = `
    <div class="detail-item"><div class="dl">Cơ sở</div><div class="dv"><strong>${c.business_name || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Tiểu thương</div><div class="dv">${c.trader_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${c.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${c.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Ngày bắt đầu</div><div class="dv">${fmtDate(c.start_date)}</div></div>
    <div class="detail-item"><div class="dl">Ngày kết thúc</div><div class="dv">${fmtDate(c.end_date)}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê/tháng</div><div class="dv" style="color:var(--primary);font-weight:700;">${fmtCurrency(c.monthly_rent)}</div></div>
    <div class="detail-item"><div class="dl">Trạng thái</div><div class="dv">${CT_BADGE[c.status] || c.status}</div></div>
  `;
  const now  = Date.now();
  const days = c.end_date ? Math.floor((new Date(c.end_date).getTime() - now) / 86400000) : null;
  document.getElementById("cdAlert").innerHTML = days !== null && days <= 30 && days >= 0
    ? `<div class="alert-box alert-warn" style="margin-top:12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>Hợp đồng sắp hết hạn sau <strong>${days} ngày</strong></span></div>`
    : "";
  document.getElementById("cdEditBtn").onclick   = () => { closeModal("modalContractDetail"); openEditContractModal(id); };
  document.getElementById("cdDeleteBtn").onclick = () => { closeModal("modalContractDetail"); openDeleteContractModal(id); };

  // Hóa đơn theo kỳ — lấy dữ liệu thật, luôn nạp mới khi mở modal
  let schedEl = document.getElementById("cdSchedule");
  if (!schedEl) {
    const grid = document.getElementById("cdGrid");
    if (grid) { schedEl = document.createElement("div"); schedEl.id = "cdSchedule"; grid.insertAdjacentElement("afterend", schedEl); }
  }
  if (schedEl) schedEl.innerHTML = loadingState();
  fetch(`${API}/invoices`, { headers: authHeader() })
    .then(r => r.ok ? r.json() : { data: [] })
    .then(d => {
      // Cập nhật luôn invoiceCache toàn cục — markInvoicePaid() cần tra cứu
      // từ cache này; nếu không cập nhật, bấm "Đã thu" ngay trong modal này
      // (khi manager chưa từng ghé trang "Hóa đơn") sẽ báo lỗi không tìm thấy.
      invoiceCache = d.data || [];
      const invoices = invoiceCache.filter(f => String(f.contract_id) === String(id));
      if (schedEl) schedEl.innerHTML = renderContractInvoiceSchedule(invoices);
    })
    .catch(() => { if (schedEl) schedEl.innerHTML = ""; });

  openModal("modalContractDetail");
}

function renderContractInvoiceSchedule(invoices) {
  if (!invoices.length) {
    return `<div class="alert-box" style="margin-top:12px;background:var(--bg);border:1px solid var(--border);">
      <i class="fa-solid fa-circle-info"></i><span>Chưa có hóa đơn nào được phát sinh cho hợp đồng này.</span></div>`;
  }
  invoices.sort((a, b) => (Number(a.contract_period) || 0) - (Number(b.contract_period) || 0) || a.id - b.id);
  const overdueN = invoices.filter(i => i.status === "OVERDUE").length;
  return `
    ${overdueN > 0 ? `<div class="alert-box alert-danger" style="margin-top:12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>${overdueN} hóa đơn đã quá hạn thanh toán.</span></div>` : ""}
    <div style="font-size:13px;font-weight:600;margin:14px 0 10px;display:flex;align-items:center;gap:8px;">
      <i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> Hóa đơn theo kỳ (${invoices.length})
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Kỳ</th><th>Hạn thanh toán</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>
        ${invoices.map(inv => {
          const overdue = inv.status === "OVERDUE";
          return `<tr style="${overdue ? "background:var(--danger-pale,#fdecea);" : ""}">
            <td style="font-weight:600;">${inv.contract_period ? "Kỳ " + inv.contract_period : "#" + inv.id}</td>
            <td style="${overdue ? "color:var(--danger);font-weight:600;" : ""}">${fmtDate(inv.due_date)}</td>
            <td style="font-weight:700;color:var(--primary);">${fmtCurrency(inv.total_amount)}</td>
            <td>${INV_BADGE[inv.status] || inv.status}</td>
            <td>${isPayable(inv.status) ? `<button class="btn btn-teal btn-sm" onclick="markInvoicePaid(${inv.id});closeModal('modalContractDetail');">Đã thu</button>` : ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

function openDeleteContractModal(id) {
  const c = contractCache.find(x => String(x.id) === String(id));
  openDeleteModal({ id, name: c ? `#${c.id} — ${c.business_name || ""}` : null, label: "hợp đồng", endpoint: `${API}/contracts`, onSuccess: () => { loadContracts(); loadStalls(); } });
}

/* ══════════════════════════════════
   STALL REQUESTS — /api/stall-requests (ADMIN middleware)
══════════════════════════════════ */
async function loadStallRequests() {
  const listEl = document.getElementById("stallRequestList");
  if (listEl) listEl.innerHTML = loadingState();
  try {
    const res = await fetch(`${API}/stall-requests`, { headers: authHeader() });
    const all = res.ok ? (await res.json()).data || [] : [];
    // Lọc theo chợ manager quản lý
    stallReqCache = all.filter(r => myMarketsCache.some(m => m.name === r.market_name) || myMarketIds.includes(r.stall_market_id));
    updateRequestBadges();
    updateStallReqCounts();
    pages["stall-requests"] = 1;
    renderStallRequests();
  } catch (err) {
    if (listEl) listEl.innerHTML = emptyState("fa-circle-exclamation", "Không thể tải yêu cầu", "Cần quyền Admin hoặc Manager");
  }
}

function updateStallReqCounts() {
  setEl("sr-pending",  stallReqCache.filter(r => r.status === "PENDING").length);
  setEl("sr-approved", stallReqCache.filter(r => r.status === "APPROVED").length);
  setEl("sr-rejected", stallReqCache.filter(r => r.status === "REJECTED").length);
}

function setStallReqFilter(status) {
  const sel = document.getElementById("srFilter");
  if (sel) { sel.value = status; renderStallRequests(); }
}

const REQ_BADGE = {
  PENDING:  '<span class="badge badge-amber">Chờ duyệt</span>',
  APPROVED: '<span class="badge badge-green">Đã duyệt</span>',
  REJECTED: '<span class="badge badge-red">Từ chối</span>',
};

function renderStallRequests() {
  const sf       = document.getElementById("srFilter")?.value || "";
  const filtered = stallReqCache.filter(r => !sf || r.status === sf);

  const countEl = document.getElementById("srCount");
  if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;

  const { items, total, cur } = paginate(filtered, "stall-requests", 6);
  const el = document.getElementById("stallRequestList");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="card">${emptyState("fa-door-open", "Không có yêu cầu nào", "Chưa có tiểu thương gửi yêu cầu thuê sạp")}</div>`;
    renderPag("srPagination", 1, 1, 0, "goSrPage");
    return;
  }

  el.innerHTML = items.map(r => {
    const isPending = r.status === "PENDING";
    return `
      <div class="req-card ${r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
        <div class="req-icon icon-box ${isPending ? "ic-amber" : r.status === "APPROVED" ? "ic-green" : "ic-red"}">
          <i class="fa-solid ${isPending ? "fa-clock" : r.status === "APPROVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
        </div>
        <div class="req-body">
          <div class="req-title">
            Yêu cầu thuê Sạp <strong>${r.stall_code || "—"}</strong> · ${r.market_name || "—"}
            <span style="margin-left:4px;">${REQ_BADGE[r.status] || r.status}</span>
          </div>
          <div class="req-meta">
            <strong>${r.trader_full_name || "—"}</strong> · ${r.business_name || "—"} · SĐT: ${r.trader_phone || "—"}<br>
            Thời gian thuê: <strong>${fmtDate(r.requested_start_date)}</strong> → <strong>${fmtDate(r.requested_end_date)}</strong><br>
            ${r.note ? `Ghi chú: <em>${r.note}</em><br>` : ""}
            Tiền thuê gốc: <strong>${fmtCurrency(r.monthly_rent)}</strong>
            ${r.admin_note ? `<br>Ghi chú quản lý: <em style="color:var(--text3);">${r.admin_note}</em>` : ""}
            ${r.reviewed_at ? `<br><span style="color:var(--text3);font-size:11.5px;">Xử lý lúc: ${fmtDate(r.reviewed_at)}</span>` : ""}
          </div>
          ${isPending ? `
          <div class="req-footer">
            <button class="btn btn-primary btn-sm" onclick="openReviewStallReq(${r.id})">
              <i class="fa-solid fa-gavel"></i> Xét duyệt
            </button>
          </div>` : ""}
        </div>
      </div>`;
  }).join("");

  renderPag("srPagination", cur, total, filtered.length, "goSrPage");
}
function goSrPage(p) { pages["stall-requests"] = p; renderStallRequests(); }

function openReviewStallReq(id) {
  const r = stallReqCache.find(x => String(x.id) === String(id));
  if (!r) return;
  currentSrId = id;
  document.getElementById("srReqId").textContent = `#${r.id}`;
  document.getElementById("srDetailGrid").innerHTML = `
    <div class="detail-item"><div class="dl">Tiểu thương</div><div class="dv"><strong>${r.trader_full_name || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Cơ sở</div><div class="dv">${r.business_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">SĐT</div><div class="dv">${r.trader_phone || "—"}</div></div>
    <div class="detail-item"><div class="dl">Sạp yêu cầu</div><div class="dv"><strong>${r.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${r.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê gốc</div><div class="dv">${fmtCurrency(r.monthly_rent)}</div></div>
    <div class="detail-item"><div class="dl">Bắt đầu YC</div><div class="dv">${fmtDate(r.requested_start_date)}</div></div>
    <div class="detail-item"><div class="dl">Kết thúc YC</div><div class="dv">${fmtDate(r.requested_end_date)}</div></div>
  `;
  document.getElementById("srRentOverride").value = "";
  document.getElementById("srAdminNote").value    = "";
  hideFormMsg("srMsg");
  openModal("modalReviewStallReq");
}

async function reviewStallRequest(action) {
  if (!currentSrId) return;
  const note        = document.getElementById("srAdminNote").value;
  const rentOverride = document.getElementById("srRentOverride").value;
  const isApprove   = action === "approve";
  const btnId       = isApprove ? "srApproveBtn" : "srRejectBtn";
  const btn         = document.getElementById(btnId);
  const orig        = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  hideFormMsg("srMsg");
  try {
    const body = { admin_note: note || null };
    if (isApprove && rentOverride) body.monthly_rent = rentOverride;
    const res  = await fetch(`${API}/stall-requests/${currentSrId}/${action}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("srMsg", data.message || "Lỗi xử lý yêu cầu", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast(isApprove ? "✅ Đã duyệt & tạo hợp đồng mới!" : "❌ Đã từ chối yêu cầu", isApprove ? "success" : "info", 4000);
    await Promise.all([loadStallRequests(), loadContracts(), loadStalls()]);
    setTimeout(() => { closeModal("modalReviewStallReq"); btn.disabled = false; btn.innerHTML = orig; currentSrId = null; }, 500);
  } catch (err) {
    showFormMsg("srMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

/* ══════════════════════════════════
   RENEWAL REQUESTS — /api/renewal-requests
══════════════════════════════════ */
async function loadRenewalRequests() {
  const listEl = document.getElementById("renewalRequestList");
  if (listEl) listEl.innerHTML = loadingState();
  try {
    const res = await fetch(`${API}/renewal-requests`, { headers: authHeader() });
    const all = res.ok ? (await res.json()).data || [] : [];
    renewalCache = all.filter(r => myMarketsCache.some(m => m.name === r.market_name));
    updateRequestBadges();
    updateRenewalCounts();
    pages["renewal-requests"] = 1;
    renderRenewalRequests();
  } catch (err) {
    if (listEl) listEl.innerHTML = emptyState("fa-circle-exclamation", "Không thể tải yêu cầu", "Cần quyền Admin hoặc Manager");
  }
}

function updateRenewalCounts() {
  setEl("rr-pending",  renewalCache.filter(r => r.status === "PENDING").length);
  setEl("rr-approved", renewalCache.filter(r => r.status === "APPROVED").length);
  setEl("rr-rejected", renewalCache.filter(r => r.status === "REJECTED").length);
}

function setRenewalFilter(status) {
  const sel = document.getElementById("rrFilter");
  if (sel) { sel.value = status; renderRenewalRequests(); }
}

function renderRenewalRequests() {
  const sf       = document.getElementById("rrFilter")?.value || "";
  const filtered = renewalCache.filter(r => !sf || r.status === sf);

  const countEl = document.getElementById("rrCount");
  if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;

  const { items, total, cur } = paginate(filtered, "renewal-requests", 6);
  const el = document.getElementById("renewalRequestList");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="card">${emptyState("fa-rotate", "Không có yêu cầu nào", "Chưa có tiểu thương gửi yêu cầu gia hạn")}</div>`;
    renderPag("rrPagination", 1, 1, 0, "goRrPage");
    return;
  }

  el.innerHTML = items.map(r => {
    const isPending = r.status === "PENDING";
    return `
      <div class="req-card ${r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
        <div class="req-icon icon-box ${isPending ? "ic-amber" : r.status === "APPROVED" ? "ic-green" : "ic-red"}">
          <i class="fa-solid ${isPending ? "fa-clock" : r.status === "APPROVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
        </div>
        <div class="req-body">
          <div class="req-title">
            Gia hạn HĐ — Sạp <strong>${r.stall_code || "—"}</strong> · ${r.market_name || "—"}
            <span style="margin-left:4px;">${REQ_BADGE[r.status] || r.status}</span>
          </div>
          <div class="req-meta">
            <strong>${r.trader_full_name || "—"}</strong> · ${r.business_name || "—"}<br>
            HĐ hiện tại hết hạn: <strong>${fmtDate(r.current_end_date)}</strong>
            → Gia hạn đến: <strong style="color:var(--primary);">${fmtDate(r.requested_end_date)}</strong><br>
            Tiền thuê hiện tại: <strong>${fmtCurrency(r.current_monthly_rent)}</strong>
            ${r.requested_monthly_rent ? ` → Đề xuất mới: <strong>${fmtCurrency(r.requested_monthly_rent)}</strong>` : ""}<br>
            ${r.note ? `Ghi chú: <em>${r.note}</em>` : ""}
            ${r.admin_note ? `<br>Ghi chú quản lý: <em style="color:var(--text3);">${r.admin_note}</em>` : ""}
            ${r.reviewed_at ? `<br><span style="color:var(--text3);font-size:11.5px;">Xử lý lúc: ${fmtDate(r.reviewed_at)}</span>` : ""}
          </div>
          ${isPending ? `
          <div class="req-footer">
            <button class="btn btn-primary btn-sm" onclick="openReviewRenewal(${r.id})">
              <i class="fa-solid fa-gavel"></i> Xét duyệt
            </button>
          </div>` : ""}
        </div>
      </div>`;
  }).join("");

  renderPag("rrPagination", cur, total, filtered.length, "goRrPage");
}
function goRrPage(p) { pages["renewal-requests"] = p; renderRenewalRequests(); }

function openReviewRenewal(id) {
  const r = renewalCache.find(x => String(x.id) === String(id));
  if (!r) return;
  currentRrId = id;
  document.getElementById("rrReqId").textContent = `#${r.id}`;
  document.getElementById("rrDetailGrid").innerHTML = `
    <div class="detail-item"><div class="dl">Tiểu thương</div><div class="dv"><strong>${r.trader_full_name || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Cơ sở</div><div class="dv">${r.business_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${r.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${r.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Hết hạn hiện tại</div><div class="dv">${fmtDate(r.current_end_date)}</div></div>
    <div class="detail-item"><div class="dl">Ngày gia hạn YC</div><div class="dv" style="color:var(--primary);font-weight:700;">${fmtDate(r.requested_end_date)}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê hiện tại</div><div class="dv">${fmtCurrency(r.current_monthly_rent)}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê đề xuất</div><div class="dv">${r.requested_monthly_rent ? fmtCurrency(r.requested_monthly_rent) : "— (giữ nguyên)"}</div></div>
  `;
  document.getElementById("rrAdminNote").value = "";
  hideFormMsg("rrMsg");
  openModal("modalReviewRenewal");
}

async function reviewRenewal(action) {
  if (!currentRrId) return;
  const note      = document.getElementById("rrAdminNote").value;
  const isApprove = action === "approve";
  const btnId     = isApprove ? "rrApproveBtn" : "rrRejectBtn";
  const btn       = document.getElementById(btnId);
  const orig      = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  hideFormMsg("rrMsg");
  try {
    const res  = await fetch(`${API}/renewal-requests/${currentRrId}/${action}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ admin_note: note || null }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("rrMsg", data.message || "Lỗi xử lý yêu cầu", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast(isApprove ? "✅ Đã duyệt gia hạn hợp đồng!" : "❌ Đã từ chối yêu cầu gia hạn", isApprove ? "success" : "info", 4000);
    await Promise.all([loadRenewalRequests(), loadContracts()]);
    setTimeout(() => { closeModal("modalReviewRenewal"); btn.disabled = false; btn.innerHTML = orig; currentRrId = null; }, 500);
  } catch (err) {
    showFormMsg("rrMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

/* ══════════════════════════════════
   STALL FEEDBACK — /api/stall-feedback
   Backend đã tự lọc theo markets.manager_id = mình (chỉ trả về phản ánh
   thuộc chợ được admin phân công) — không cần lọc lại ở client.
══════════════════════════════════ */
async function loadStallFeedback() {
  const listEl = document.getElementById("feedbackList");
  if (listEl) listEl.innerHTML = loadingState();
  try {
    const res = await fetch(`${API}/stall-feedback`, { headers: authHeader() });
    feedbackCache = res.ok ? (await res.json()).data || [] : [];
    updateFeedbackCounts();
    updateRequestBadges();
    pages["stall-feedback"] = 1;
    renderStallFeedback();
  } catch (err) {
    if (listEl) listEl.innerHTML = emptyState("fa-circle-exclamation", "Không thể tải phản ánh", "Cần quyền Admin hoặc Manager");
  }
}

function updateFeedbackCounts() {
  setEl("fb-pending",  feedbackCache.filter(r => r.status === "PENDING").length);
  setEl("fb-resolved", feedbackCache.filter(r => r.status === "RESOLVED").length);
  setEl("fb-rejected", feedbackCache.filter(r => r.status === "REJECTED").length);
}

function setFeedbackFilter(status) {
  const sel = document.getElementById("fbFilter");
  if (sel) { sel.value = status; renderStallFeedback(); }
}

const FB_BADGE = {
  PENDING:  '<span class="badge badge-amber">Chờ xử lý</span>',
  RESOLVED: '<span class="badge badge-green">Đã xử lý</span>',
  REJECTED: '<span class="badge badge-red">Từ chối</span>',
};
const FB_TYPE_BADGE = {
  TRADER:   '<span class="badge badge-blue">Tiểu thương</span>',
  CUSTOMER: '<span class="badge badge-gray">Khách hàng</span>',
};

function renderStallFeedback() {
  const tf       = document.getElementById("fbFilterType")?.value || "";
  const sf       = document.getElementById("fbFilter")?.value || "";
  const filtered = feedbackCache.filter(r => (!tf || r.type === tf) && (!sf || r.status === sf));

  const countEl = document.getElementById("fbCount");
  if (countEl) countEl.textContent = `${filtered.length} phản ánh`;

  const { items, total, cur } = paginate(filtered, "stall-feedback", 6);
  const el = document.getElementById("feedbackList");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="card">${emptyState("fa-triangle-exclamation", "Không có phản ánh nào", "Chưa có phản ánh nào từ sạp trong chợ bạn quản lý")}</div>`;
    renderPag("fbPagination", 1, 1, 0, "goFbPage");
    return;
  }

  el.innerHTML = items.map(r => {
    const isPending = r.status === "PENDING";
    return `
      <div class="req-card ${r.status === "RESOLVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
        <div class="req-icon icon-box ${isPending ? "ic-amber" : r.status === "RESOLVED" ? "ic-green" : "ic-red"}">
          <i class="fa-solid ${isPending ? "fa-clock" : r.status === "RESOLVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
        </div>
        <div class="req-body">
          <div class="req-title">
            Sạp <strong>${r.stall_code || "—"}</strong> · ${r.market_name || "—"}
            <span style="margin-left:4px;">${FB_TYPE_BADGE[r.type] || r.type}</span>
            <span style="margin-left:4px;">${FB_BADGE[r.status] || r.status}</span>
          </div>
          <div class="req-meta">
            <strong>${r.sender_name || "—"}</strong>${r.type === "TRADER" && r.business_name ? ` · ${r.business_name}` : ""} · SĐT: ${r.sender_phone || "—"}<br>
            ${r.title ? `<strong>${r.title}</strong><br>` : ""}
            ${r.content || ""}
            ${r.admin_note ? `<br>Ghi chú quản lý: <em style="color:var(--text3);">${r.admin_note}</em>` : ""}
            <br><span style="color:var(--text3);font-size:11.5px;">Gửi: ${fmtDate(r.created_at)}</span>
            ${r.reviewed_at ? ` · Xử lý: ${fmtDate(r.reviewed_at)}` : ""}
          </div>
          ${isPending ? `
          <div class="req-footer">
            <button class="btn btn-primary btn-sm" onclick="openReviewFeedback(${r.id})">
              <i class="fa-solid fa-gavel"></i> Xử lý
            </button>
          </div>` : ""}
        </div>
      </div>`;
  }).join("");

  renderPag("fbPagination", cur, total, filtered.length, "goFbPage");
}
function goFbPage(p) { pages["stall-feedback"] = p; renderStallFeedback(); }

function openReviewFeedback(id) {
  const r = feedbackCache.find(x => String(x.id) === String(id));
  if (!r) return;
  currentFbId = id;
  document.getElementById("fbReqId").textContent = `#${r.id}`;
  document.getElementById("fbDetailGrid").innerHTML = `
    <div class="detail-item"><div class="dl">Loại</div><div class="dv">${FB_TYPE_BADGE[r.type] || r.type}</div></div>
    <div class="detail-item"><div class="dl">Người gửi</div><div class="dv"><strong>${r.sender_name || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">SĐT</div><div class="dv">${r.sender_phone || "—"}</div></div>
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${r.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${r.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Sản phẩm liên quan</div><div class="dv">${r.product_name || "—"}</div></div>
    <div class="detail-item" style="grid-column:1 / -1;"><div class="dl">Tiêu đề</div><div class="dv">${r.title || "—"}</div></div>
    <div class="detail-item" style="grid-column:1 / -1;"><div class="dl">Nội dung phản ánh</div><div class="dv">${r.content || "—"}</div></div>
    <div class="detail-item"><div class="dl">Ngày gửi</div><div class="dv">${fmtDate(r.created_at)}</div></div>
  `;
  document.getElementById("fbAdminNote").value = "";
  hideFormMsg("fbMsg");
  openModal("modalReviewFeedback");
}

async function reviewStallFeedback(action) {
  if (!currentFbId) return;
  const note      = document.getElementById("fbAdminNote").value;
  const isResolve = action === "resolve";
  const btnId     = isResolve ? "fbResolveBtn" : "fbRejectBtn";
  const btn       = document.getElementById(btnId);
  const orig      = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  hideFormMsg("fbMsg");
  try {
    const endpoint = isResolve ? "resolve" : "reject";
    const res  = await fetch(`${API}/stall-feedback/${currentFbId}/${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ admin_note: note || null }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      // 403 = phản ánh không thuộc chợ mình quản lý (bị chặn từ backend)
      showFormMsg("fbMsg", data.message || "Lỗi xử lý phản ánh", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast(isResolve ? "✅ Đã đánh dấu xử lý phản ánh!" : "❌ Đã từ chối phản ánh", isResolve ? "success" : "info", 4000);
    await loadStallFeedback();
    setTimeout(() => { closeModal("modalReviewFeedback"); btn.disabled = false; btn.innerHTML = orig; currentFbId = null; }, 500);
  } catch (err) {
    showFormMsg("fbMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

/* ══════════════════════════════════
   PRODUCTS — /api/products (filter by my markets)
══════════════════════════════════ */
async function loadProducts() {
  const tableEl = document.getElementById("productTable");
  if (tableEl) tableEl.innerHTML = loadRow(5);
  try {
    const res = await fetch(`${API}/products`);
    const all = (await res.json()).data || [];
    productCache = all.filter(p => myMarketIds.includes(p.market_id) || myMarketsCache.some(m => m.name === p.market_name));
    pages["products"] = 1;
    renderProducts();
  } catch {
    const tableEl = document.getElementById("productTable");
    if (tableEl) tableEl.innerHTML = emptyRow(5, "Lỗi tải dữ liệu");
  }
}

function renderProducts() {
  const kw = (document.getElementById("pSearch")?.value || "").toLowerCase();
  const filtered = productCache.filter(p => !kw || `${p.name || ""} ${p.business_name || ""}`.toLowerCase().includes(kw));

  const countEl = document.getElementById("pCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${productCache.length} sản phẩm`;

  const { items, total, cur } = paginate(filtered, "products");
  const el = document.getElementById("productTable");
  if (!el) return;

  el.innerHTML = items.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td><strong style="color:var(--primary);">${fmtCurrency(p.price)}</strong></td>
      <td>${p.business_name || "—"}</td>
      <td>${p.stall_code || "—"}</td>
      <td>${p.market_name || "—"}</td>
    </tr>
  `).join("") || emptyRow(5, "Không tìm thấy sản phẩm");

  renderPag("productPagination", cur, total, filtered.length, "goProductPage");
}
function goProductPage(p) { pages["products"] = p; renderProducts(); }

/* ══════════════════════════════════
   RESPONSIVE
══════════════════════════════════ */
function checkMobile() {
  const btn = document.getElementById("sidebarToggle");
  if (btn) btn.style.display = window.innerWidth <= 720 ? "flex" : "none";
}
window.addEventListener("resize", checkMobile);
checkMobile();

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  await loadMe();
  goPage("dashboard");
});