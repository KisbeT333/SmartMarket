/* ══════════════════════════════════════════════════
   SmartMarket — Cổng Tiểu thương
   trader.js v2.0 — Đồng bộ 100% TraderMeRoutes.js
   
   API endpoints sử dụng:
   GET    /api/trader/me                      — thông tin cá nhân
   PUT    /api/trader/me                      — cập nhật hồ sơ
   GET    /api/trader/me/products             — sản phẩm của tôi
   POST   /api/trader/me/products             — thêm SP (multipart)
   PUT    /api/trader/me/products/:id         — sửa SP (multipart)
   DELETE /api/trader/me/products/:id         — xóa SP
   GET    /api/trader/me/orders               — đơn hàng của tôi
   GET    /api/trader/me/orders/:id           — chi tiết đơn hàng
   GET    /api/trader/me/contracts            — hợp đồng của tôi
   POST   /api/trader/me/contracts/:id/renew  — yêu cầu gia hạn
   GET    /api/trader/me/renewal-requests     — lịch sử gia hạn
   GET    /api/trader/me/available-stalls?market_id=X — sạp trống
   POST   /api/trader/me/stall-requests       — đăng ký thuê sạp
   GET    /api/trader/me/stall-requests       — lịch sử đăng ký thuê
   GET    /api/markets                        — danh sách chợ
══════════════════════════════════════════════════ */

const API     = "http://localhost:3000/api";
const API_ME  = `${API}/trader/me`;
const BASE_URL = "http://localhost:3000";

// Ghép URL ảnh đầy đủ từ path lưu trong DB (/uploads/products/xxx.jpg)
function imgUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/* ══════════════════════════════════
   STATE / CACHE
══════════════════════════════════ */
let ME = null;

let myContractCache  = [];
let myProductCache   = [];
let myOrderCache     = [];
let stallReqCache    = [];
let renewalReqCache  = [];
let feedbackCache    = [];
let browseStallCache = [];
let marketCache      = [];

// Pagination
const pages   = {};
const PAGE_SZ = 10;

// Wizard state
let registerStallTarget = null;  // stall object đang đăng ký
let renewContractTarget = null;  // contract object đang gia hạn
let productToDelete     = null;  // id sản phẩm cần xóa
let currentOrderId      = null;
let feedbackStallTarget = null;  // sạp đang chọn để gửi phản ánh

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
function fmtCurrency(v) { return (v == null || v === "") ? "—" : Number(v).toLocaleString("vi-VN") + " đ"; }
function fmtDate(v)     { return v ? new Date(v).toLocaleDateString("vi-VN") : "—"; }
function fmtRelative(v) {
  if (!v) return "";
  const diff = Date.now() - new Date(v).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} ngày trước` : fmtDate(v);
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

function emptyState(icon, title, sub = "") {
  return `<div class="empty-state"><i class="fa-solid ${icon}"></i><div class="empty-title">${title}</div>${sub ? `<div class="empty-sub">${sub}</div>` : ""}</div>`;
}
function loadingState() {
  return `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><span class="empty-sub">Đang tải...</span></div>`;
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

function togglePwd(inputId, iconId) {
  const inp = document.getElementById(inputId);
  const ico = document.getElementById(iconId);
  if (!inp) return;
  inp.type = inp.type === "password" ? "text" : "password";
  if (ico) ico.className = inp.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
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
  el.innerHTML = `<i class="fa-solid ${T_ICONS[type]} toast-icon"></i><div class="toast-body">${msg}</div><button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>`;
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
function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
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
    if (edge || near)
      btns += `<button class="btn btn-outline btn-sm pg-btn ${i === cur ? "active" : ""}" onclick="${fnName}(${i})">${i}</button>`;
    else if (i === 2 || i === total - 1)
      btns += `<span style="padding:0 4px;color:var(--text3);">…</span>`;
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
   NAVIGATION
══════════════════════════════════ */
const PAGE_TITLES = {
  home:               "Trang chủ",
  "my-contracts":     "Hợp đồng của tôi",
  "browse-stalls":    "Xem sạp trống",
  "stall-requests":   "Yêu cầu thuê sạp",
  "renewal-requests": "Yêu cầu gia hạn",
  "stall-feedback":   "Phản ánh sạp",
  "my-payments":      "Hóa đơn & Thanh toán",
  "my-products":      "Sản phẩm của tôi",
  "my-orders":        "Đơn hàng",
  profile:            "Hồ sơ cá nhân",
};

let currentPage = "home";

function goPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add("active");
  setEl("headerTitle", PAGE_TITLES[page] || page);
  currentPage = page;

  const loaders = {
    home:               loadHome,
    "my-contracts":     loadMyContracts,
    "browse-stalls":    initBrowseStalls,
    "stall-requests":   loadStallRequests,
    "renewal-requests": loadRenewalRequests,
    "stall-feedback":   loadMyFeedback,
    "my-payments":      loadMyPayments,
    "my-products":      loadMyProducts,
    "my-orders":        loadMyOrders,
    profile:            loadProfile,
  };
  if (loaders[page]) loaders[page]();
  if (window.innerWidth <= 720) document.getElementById("sidebar")?.classList.remove("open");
}

function toggleSidebar() { document.getElementById("sidebar")?.classList.toggle("open"); }

/* ══════════════════════════════════
   LOAD ME — GET /api/trader/me
══════════════════════════════════ */
async function loadMe() {
  try {
    const res  = await fetch(`${API_ME}`, { headers: authHeader() });
    if (!res.ok) throw new Error("401");
    const data = await res.json();
    ME = data.data;
    updateUI();
  } catch {
    showToast("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại", "error");
    setTimeout(() => window.location.href = "../pages/login.html", 2000);
  }
}

function getInitials(name) {
  return (name || "TT").split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();
}

function updateUI() {
  if (!ME) return;
  const ini = getInitials(ME.full_name);
  ["sidebarAvatar", "headerAvatar", "profileAvatar"].forEach(id => setEl(id, ini));
  setEl("sidebarName", ME.full_name);
  setEl("sidebarBiz",  ME.business_name);
  setEl("wbName", ME.full_name);
  setEl("wbBiz",  `${ME.business_name || "—"} · ${ME.market_name || "—"}`);
}

/* ══════════════════════════════════
   HOME
══════════════════════════════════ */
async function loadHome() {
  try {
    const [cRes, pRes, oRes, srRes, rrRes, invRes] = await Promise.all([
      fetch(`${API_ME}/contracts`,       { headers: authHeader() }),
      fetch(`${API_ME}/products`,        { headers: authHeader() }),
      fetch(`${API_ME}/orders`,          { headers: authHeader() }),
      fetch(`${API_ME}/stall-requests`,  { headers: authHeader() }),
      fetch(`${API_ME}/renewal-requests`,{ headers: authHeader() }),
      fetch(`${API_ME}/invoices`,        { headers: authHeader() }),
    ]);

    myContractCache = cRes.ok  ? (await cRes.json()).data  || [] : [];
    myProductCache  = pRes.ok  ? (await pRes.json()).data  || [] : [];
    myOrderCache    = oRes.ok  ? (await oRes.json()).data  || [] : [];
    stallReqCache   = srRes.ok ? (await srRes.json()).data || [] : [];
    renewalReqCache = rrRes.ok ? (await rrRes.json()).data || [] : [];
    invoiceCache    = invRes.ok ? (await invRes.json()).data || [] : [];

    const activeContracts = myContractCache.filter(c => c.status === "active");
    const pendingCount    = stallReqCache.filter(r => r.status === "PENDING").length
                          + renewalReqCache.filter(r => r.status === "PENDING").length;

    setEl("h-contracts", activeContracts.length);
    setEl("h-products",  myProductCache.length);
    setEl("h-orders",    myOrderCache.length);
    setEl("h-pending",   pendingCount || "0");

    updateNavBadges();
    renderHomeContracts(activeContracts);
    renderHomeOrders();
    renderExpiryAlerts(activeContracts);

    // Badge hóa đơn chưa TT (gồm cả quá hạn) — lấy từ payment-summary cho chính xác 100%
    try {
      const sumRes = await fetch(`${API_ME}/payment-summary`, { headers: authHeader() });
      if (sumRes.ok) {
        const { data } = await sumRes.json();
        const payBadge = document.getElementById("navPayBadge");
        if (payBadge) {
          payBadge.textContent   = data.unpaid_invoices;
          payBadge.style.display = data.unpaid_invoices > 0 ? "" : "none";
        }
      }
    } catch {}
  } catch (err) {
    showToast("Lỗi tải trang chủ: " + err.message, "error");
  }
}

function renderHomeContracts(contracts) {
  const el = document.getElementById("homeContractList");
  if (!el) return;
  if (!contracts.length) {
    el.innerHTML = emptyState("fa-file-contract", "Chưa có hợp đồng nào", "Đăng ký thuê sạp để bắt đầu kinh doanh");
    return;
  }
  const CT_BADGE = {
    active:  '<span class="badge badge-green">Còn hiệu lực</span>',
    pending: '<span class="badge badge-amber">Chờ ký</span>',
    expired: '<span class="badge badge-red">Hết hạn</span>',
  };
  el.innerHTML = contracts.slice(0, 4).map(c => {
    const days = c.end_date ? Math.floor((new Date(c.end_date) - Date.now()) / 86400000) : null;
    const urgency = days !== null && days <= 30 && days >= 0 ? `<span class="badge badge-red" style="font-size:10px;">Còn ${days} ngày</span>` : "";
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13.5px;font-weight:700;">Sạp ${c.stall_code || "—"} ${urgency}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${c.market_name || "—"} · Hết: ${fmtDate(c.end_date)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${CT_BADGE[c.status] || ""}
          <div style="font-size:12.5px;font-weight:700;color:var(--primary);">${fmtCurrency(c.monthly_rent)}/tháng</div>
        </div>
      </div>`;
  }).join("") + (contracts.length > 4 ? `<div style="text-align:center;margin-top:10px;"><button class="btn btn-outline btn-sm" onclick="goPage('my-contracts')">Xem tất cả ${contracts.length} hợp đồng</button></div>` : "");
}

function renderHomeOrders() {
  const el = document.getElementById("homeOrderList");
  if (!el) return;
  if (!myOrderCache.length) { el.innerHTML = emptyState("fa-receipt", "Chưa có đơn hàng nào"); return; }
  el.innerHTML = myOrderCache.slice(0, 5).map(o => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;">#${o.id} · ${o.customer_name || "Khách"}</div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:1px;">${fmtRelative(o.created_at)}</div>
      </div>
      <strong style="color:var(--primary);">${fmtCurrency(o.total_amount)}</strong>
    </div>`).join("");
}

function renderExpiryAlerts(contracts) {
  const el = document.getElementById("homeAlerts");
  if (!el) return;
  const now    = Date.now();
  const expiry = contracts.filter(c => {
    if (!c.end_date) return false;
    const days = Math.floor((new Date(c.end_date) - now) / 86400000);
    return days >= 0 && days <= 30;
  });
  const expiryHtml = expiry.map(c => {
    const days = Math.floor((new Date(c.end_date) - now) / 86400000);
    return `<div class="alert-box alert-warn" style="margin-bottom:10px;">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span>Hợp đồng sạp <strong>${c.stall_code}</strong> tại ${c.market_name} sẽ hết hạn sau <strong>${days} ngày</strong> (${fmtDate(c.end_date)}).
      <a href="#" onclick="openRenewModal(${c.id});return false;" style="color:var(--warning);font-weight:600;margin-left:8px;">Yêu cầu gia hạn →</a></span>
    </div>`;
  }).join("");

  // Cảnh báo hóa đơn quá hạn — dựa trên dữ liệu hóa đơn thật (status OVERDUE do server tự đánh dấu)
  const overdueContracts = contracts
    .map(c => ({ c, n: countOverdueInvoicesForContract(c.id) }))
    .filter(x => x.n > 0);
  const overdueHtml = overdueContracts.map(({ c, n }) => `
    <div class="alert-box alert-danger" style="margin-bottom:10px;">
      <i class="fa-solid fa-clock"></i>
      <span>Sạp <strong>${c.stall_code}</strong> tại ${c.market_name} có <strong>${n} hóa đơn</strong> đã quá hạn thanh toán.
      <a href="#" onclick="goPage('my-payments');return false;" style="color:var(--danger);font-weight:600;margin-left:8px;">Thanh toán ngay →</a></span>
    </div>`).join("");

  el.innerHTML = overdueHtml + expiryHtml;
}

function updateNavBadges() {
  const srPending = stallReqCache.filter(r => r.status === "PENDING").length;
  const rrPending = renewalReqCache.filter(r => r.status === "PENDING").length;
  const fbPending = feedbackCache.filter(r => r.status === "PENDING").length;
  const ctActive  = myContractCache.filter(c => c.status === "active").length;
  const overdueTotal = invoiceCache.filter(f => f.status === "OVERDUE").length;

  const srBadge = document.getElementById("navSrBadge");
  const rrBadge = document.getElementById("navRrBadge");
  const fbBadge = document.getElementById("navFbBadge");
  const ctBadge = document.getElementById("navContractBadge");
  const odBadge = document.getElementById("navOverdueBadge");
  if (srBadge) { srBadge.textContent = srPending; srBadge.style.display = srPending ? "" : "none"; }
  if (rrBadge) { rrBadge.textContent = rrPending; rrBadge.style.display = rrPending ? "" : "none"; }
  if (fbBadge) { fbBadge.textContent = fbPending; fbBadge.style.display = fbPending ? "" : "none"; }
  if (ctBadge) { ctBadge.textContent = ctActive;  ctBadge.style.display = ctActive  ? "" : "none"; }
  if (odBadge) { odBadge.textContent = overdueTotal; odBadge.style.display = overdueTotal ? "" : "none"; }
}

/* ══════════════════════════════════
   MY CONTRACTS — GET /api/trader/me/contracts
══════════════════════════════════ */
const CT_BADGE = {
  active:  '<span class="badge badge-green">Còn hiệu lực</span>',
  pending: '<span class="badge badge-amber">Chờ ký</span>',
  expired: '<span class="badge badge-red">Đã hết hạn</span>',
};
const CT_TEXT = { active: "Còn hiệu lực", pending: "Chờ ký", expired: "Đã hết hạn" };

async function loadMyContracts() {
  setHTML("myContractList", loadingState());
  try {
    const [cRes, invRes] = await Promise.all([
      fetch(`${API_ME}/contracts`, { headers: authHeader() }),
      fetch(`${API_ME}/invoices`,  { headers: authHeader() }),
    ]);
    myContractCache = cRes.ok   ? (await cRes.json()).data   || [] : [];
    invoiceCache     = invRes.ok ? (await invRes.json()).data || [] : [];
    pages["my-contracts"] = 1;
    renderMyContracts();
    updateNavBadges();
  } catch (err) {
    setHTML("myContractList", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu"));
  }
}

function renderMyContracts() {
  const sf       = document.getElementById("ctFilterStatus")?.value || "";
  const filtered = myContractCache.filter(c => !sf || c.status === sf);
  const countEl  = document.getElementById("ctCount");
  if (countEl) countEl.textContent = `${filtered.length} hợp đồng`;

  const { items, total, cur } = paginate(filtered, "my-contracts", 5);
  if (!items.length) {
    setHTML("myContractList", `<div class="card">${emptyState("fa-file-contract", "Không tìm thấy hợp đồng", "Thử đổi bộ lọc hoặc đăng ký thuê sạp")}</div>`);
    renderPag("ctPagination", 1, 1, 0, "goCtPage");
    return;
  }

  const now = Date.now();
  setHTML("myContractList", items.map(c => {
    const days = c.end_date ? Math.floor((new Date(c.end_date) - now) / 86400000) : null;
    const warn = days !== null && days <= 30 && days >= 0
      ? `<div class="alert-box alert-warn" style="margin-top:10px;padding:8px 12px;font-size:12.5px;"><i class="fa-solid fa-triangle-exclamation"></i> Còn <strong>${days} ngày</strong> hết hạn — <a href="#" onclick="openRenewModal(${c.id});return false;" style="color:var(--warning);font-weight:600;">Yêu cầu gia hạn ngay</a></div>`
      : "";
    const overdueN = countOverdueInvoicesForContract(c.id);
    const overdueWarn = overdueN > 0
      ? `<div class="alert-box alert-danger" style="margin-top:10px;padding:8px 12px;font-size:12.5px;"><i class="fa-solid fa-clock"></i> <strong>${overdueN} hóa đơn</strong> đã quá hạn — <a href="#" onclick="goPage('my-payments');return false;" style="color:var(--danger);font-weight:600;">thanh toán ngay</a></div>`
      : "";
    return `
      <div class="contract-card">
        <div class="cc-icon"><i class="fa-solid fa-file-contract"></i></div>
        <div class="cc-body">
          <div class="cc-title">
            Sạp <strong>${c.stall_code || "—"}</strong>
            ${CT_BADGE[c.status] || `<span class="badge badge-gray">${c.status}</span>`}
            ${overdueN > 0 ? `<span class="badge badge-red" style="font-size:10px;">${overdueN} trễ hạn</span>` : ""}
          </div>
          <div class="cc-meta">
            <div class="cc-meta-item"><div class="dl">Chợ</div><div class="dv">${c.market_name || "—"}</div></div>
            <div class="cc-meta-item"><div class="dl">Diện tích</div><div class="dv">${c.area_m2 != null ? c.area_m2 + " m²" : "—"}</div></div>
            <div class="cc-meta-item"><div class="dl">Tiền thuê/tháng</div><div class="dv" style="color:var(--primary);">${fmtCurrency(c.monthly_rent)}</div></div>
            <div class="cc-meta-item"><div class="dl">Bắt đầu</div><div class="dv">${fmtDate(c.start_date)}</div></div>
            <div class="cc-meta-item"><div class="dl">Kết thúc</div><div class="dv">${fmtDate(c.end_date)}</div></div>
          </div>
          ${overdueWarn}
          ${warn}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="viewContractDetail(${c.id})"><i class="fa-solid fa-eye"></i> Chi tiết</button>
            ${c.status === "active" ? `<button class="btn btn-primary btn-sm" onclick="openRenewModal(${c.id})"><i class="fa-solid fa-rotate"></i> Gia hạn</button>` : ""}
            ${c.status === "active" ? `<button class="btn btn-success btn-sm" onclick="goPage('my-products')"><i class="fa-solid fa-box-open"></i> Sản phẩm</button>` : ""}
          </div>
        </div>
      </div>`;
  }).join(""));

  renderPag("ctPagination", cur, total, filtered.length, "goCtPage");
}
function goCtPage(p) { pages["my-contracts"] = p; renderMyContracts(); }

/* ══════════════════════════════════
   LỊCH THANH TOÁN THEO KỲ
   Lấy trực tiếp từ hóa đơn thật (fee_invoices) do server tự sinh —
   KHÔNG tính ảo nữa (bản cũ tính lịch giả định, không khớp dữ liệu thật).
══════════════════════════════════ */
function getContractInvoices(contractId) {
  return invoiceCache
    .filter(f => String(f.contract_id) === String(contractId))
    .sort((a, b) => (Number(a.contract_period) || 0) - (Number(b.contract_period) || 0) || a.id - b.id);
}
function countOverdueInvoicesForContract(contractId) {
  return getContractInvoices(contractId).filter(f => f.status === "OVERDUE").length;
}
function renderScheduleHtml(contractId) {
  const invoices = getContractInvoices(contractId);
  if (!invoices.length) {
    return `<div class="alert-box" style="margin-top:12px;background:var(--bg);border:1px solid var(--border);">
      <i class="fa-solid fa-circle-info"></i><span>Chưa có hóa đơn nào được phát sinh cho hợp đồng này. Hóa đơn sẽ tự động tạo khi tới kỳ thanh toán.</span></div>`;
  }
  const totalAmt = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const paidAmt  = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + Number(i.total_amount), 0);
  const paidPct  = totalAmt ? Math.round(paidAmt / totalAmt * 100) : 0;
  const overdueN = invoices.filter(i => i.status === "OVERDUE").length;
  return `
    <div style="margin:16px 0 6px;display:flex;justify-content:space-between;font-size:12px;font-weight:600;">
      <span>Đã thanh toán</span><span style="color:var(--primary);">${fmtCurrency(paidAmt)} / ${fmtCurrency(totalAmt)} (${paidPct}%)</span>
    </div>
    <div style="height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-bottom:${overdueN > 0 ? "6" : "14"}px;">
      <div style="height:100%;width:${paidPct}%;background:var(--primary);border-radius:99px;"></div>
    </div>
    ${overdueN > 0 ? `<div class="alert-box alert-warn" style="margin-bottom:12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>${overdueN} hóa đơn đã quá hạn thanh toán. Vui lòng thanh toán sớm để tránh gián đoạn.</span></div>` : ""}
    <div style="font-size:13px;font-weight:600;margin:6px 0 10px;display:flex;align-items:center;gap:8px;">
      <i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> Hóa đơn theo kỳ (${invoices.length})
    </div>
    <div style="overflow-x:auto;"><table class="tbl" style="width:100%;font-size:12.5px;">
      <thead><tr><th>Kỳ</th><th>Hạn thanh toán</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>
        ${invoices.map(inv => {
          const overdue = inv.status === "OVERDUE";
          return `<tr style="${overdue ? "background:var(--danger-pale,#fdecea);" : ""}">
            <td style="font-weight:600;">${inv.contract_period ? "Kỳ " + inv.contract_period : "#" + inv.id}</td>
            <td style="${overdue ? "color:var(--danger);font-weight:600;" : ""}">${fmtDate(inv.due_date)}</td>
            <td style="font-weight:700;color:var(--primary);">${fmtCurrency(inv.total_amount)}</td>
            <td>${INV_BADGE[inv.status] || inv.status}</td>
            <td>${isPayable(inv.status) ? `<button class="btn btn-teal btn-sm" onclick="closeModal('modalContractDetail');openPayModal(${inv.id})">Thanh toán</button>` : ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

function viewContractDetail(id) {
  const c = myContractCache.find(x => String(x.id) === String(id));
  if (!c) return;
  setEl("cdId", `#${c.id}`);
  setHTML("cdGrid", `
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${c.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${c.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Diện tích</div><div class="dv">${c.area_m2 != null ? c.area_m2 + " m²" : "—"}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê/tháng</div><div class="dv" style="color:var(--primary);font-weight:700;">${fmtCurrency(c.monthly_rent)}</div></div>
    <div class="detail-item"><div class="dl">Ngày bắt đầu</div><div class="dv">${fmtDate(c.start_date)}</div></div>
    <div class="detail-item"><div class="dl">Ngày kết thúc</div><div class="dv">${fmtDate(c.end_date)}</div></div>
    <div class="detail-item"><div class="dl">Trạng thái</div><div class="dv">${CT_BADGE[c.status] || c.status}</div></div>
  `);
  const now  = Date.now();
  const days = c.end_date ? Math.floor((new Date(c.end_date) - now) / 86400000) : null;
  const expiryAlert = days !== null && days <= 30 && days >= 0
    ? `<div class="alert-box alert-warn" style="margin-top:12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>Hợp đồng sắp hết hạn sau <strong>${days} ngày</strong></span></div>` : "";
  setHTML("cdAlert", expiryAlert);

  // Hóa đơn theo kỳ — luôn nạp mới nhất từ server để chắc chắn khớp thực tế
  // (không dùng cache cũ, vì trạng thái UNPAID/OVERDUE/PAID có thể vừa đổi)
  let schedEl = document.getElementById("cdSchedule");
  if (!schedEl) {
    const grid = document.getElementById("cdGrid");
    if (grid) { schedEl = document.createElement("div"); schedEl.id = "cdSchedule"; grid.insertAdjacentElement("afterend", schedEl); }
  }
  if (schedEl) schedEl.innerHTML = loadingState();
  fetch(`${API_ME}/invoices`, { headers: authHeader() })
    .then(r => r.ok ? r.json() : { data: [] })
    .then(d => {
      invoiceCache = d.data || [];
      if (schedEl) schedEl.innerHTML = renderScheduleHtml(id);
    })
    .catch(() => { if (schedEl) schedEl.innerHTML = ""; });

  const renewBtn = document.getElementById("cdRenewBtn");
  if (renewBtn) {
    if (c.status === "active") {
      renewBtn.style.display = "";
      renewBtn.onclick = () => { closeModal("modalContractDetail"); openRenewModal(id); };
    } else {
      renewBtn.style.display = "none";
    }
  }
  openModal("modalContractDetail");
}

/* ══════════════════════════════════
   RENEWAL — POST /api/trader/me/contracts/:id/renew
══════════════════════════════════ */
function openRenewModal(contractId) {
  const c = myContractCache.find(x => String(x.id) === String(contractId));
  if (!c) return;
  renewContractTarget = c;
  setEl("renewContractId", `#${c.id} (Sạp ${c.stall_code} · ${c.market_name})`);
  document.getElementById("renewEndDate").value = "";
  document.getElementById("renewRent").value    = "";
  document.getElementById("renewNote").value    = "";
  hideFormMsg("renewMsg");
  openModal("modalRenew");
}

async function submitRenewal() {
  if (!renewContractTarget) return;
  const endDate = document.getElementById("renewEndDate").value;
  const rent    = document.getElementById("renewRent").value;
  const note    = document.getElementById("renewNote").value.trim();

  if (!endDate) { showFormMsg("renewMsg", "Vui lòng chọn ngày kết thúc mới", true); return; }
  if (new Date(endDate) <= new Date(renewContractTarget.end_date)) {
    showFormMsg("renewMsg", "Ngày gia hạn phải sau ngày kết thúc hiện tại (" + fmtDate(renewContractTarget.end_date) + ")", true);
    return;
  }

  const btn  = document.getElementById("renewSubmitBtn");
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
  hideFormMsg("renewMsg");

  try {
    const payload = { requested_end_date: endDate, requested_monthly_rent: rent || null, note: note || null };
    const res     = await fetch(`${API_ME}/contracts/${renewContractTarget.id}/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("renewMsg", data.message || "Không thể gửi yêu cầu", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast("✅ Đã gửi yêu cầu gia hạn! Ban quản lý sẽ phản hồi trong 1–3 ngày.", "success", 5000);
    showFormMsg("renewMsg", "Gửi yêu cầu thành công!", false);
    await loadRenewalRequests();
    setTimeout(() => { closeModal("modalRenew"); btn.disabled = false; btn.innerHTML = orig; renewContractTarget = null; }, 1200);
  } catch (err) {
    showFormMsg("renewMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

/* ══════════════════════════════════
   RENEWAL REQUESTS — GET /api/trader/me/renewal-requests
══════════════════════════════════ */
async function loadRenewalRequests() {
  setHTML("renewalList", loadingState());
  try {
    const res       = await fetch(`${API_ME}/renewal-requests`, { headers: authHeader() });
    renewalReqCache = res.ok ? (await res.json()).data || [] : [];
    setEl("rr-pending",  renewalReqCache.filter(r => r.status === "PENDING").length);
    setEl("rr-approved", renewalReqCache.filter(r => r.status === "APPROVED").length);
    setEl("rr-rejected", renewalReqCache.filter(r => r.status === "REJECTED").length);
    updateNavBadges();
    pages["renewal-requests"] = 1;
    renderRenewalRequests();
  } catch {
    setHTML("renewalList", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu"));
  }
}

const REQ_BADGE = {
  PENDING:  '<span class="badge badge-amber">Chờ duyệt</span>',
  APPROVED: '<span class="badge badge-green">Đã duyệt</span>',
  REJECTED: '<span class="badge badge-red">Từ chối</span>',
};

function renderRenewalRequests() {
  const sf       = document.getElementById("rrFilter")?.value || "";
  const filtered = renewalReqCache.filter(r => !sf || r.status === sf);
  const countEl  = document.getElementById("rrCount");
  if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;

  const { items, total, cur } = paginate(filtered, "renewal-requests", 6);
  if (!items.length) {
    setHTML("renewalList", `<div class="card">${emptyState("fa-rotate", "Chưa có yêu cầu gia hạn", "Gửi yêu cầu gia hạn từ trang Hợp đồng")}</div>`);
    renderPag("rrPagination", 1, 1, 0, "goRrPage");
    return;
  }

  setHTML("renewalList", items.map(r => `
    <div class="req-card ${r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
      <div class="req-icon icon-box ${r.status === "PENDING" ? "ic-amber" : r.status === "APPROVED" ? "ic-green" : "ic-red"}">
        <i class="fa-solid ${r.status === "PENDING" ? "fa-clock" : r.status === "APPROVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
      </div>
      <div class="req-body">
        <div class="req-title">Gia hạn HĐ Sạp <strong>${r.stall_code || "—"}</strong> ${REQ_BADGE[r.status] || ""}</div>
        <div class="req-meta">
          Ngày gia hạn đến: <strong style="color:var(--primary);">${fmtDate(r.requested_end_date)}</strong>
          ${r.requested_monthly_rent ? ` · Đề xuất giá: <strong>${fmtCurrency(r.requested_monthly_rent)}</strong>` : ""}
          <br>${r.note ? `Ghi chú: <em>${r.note}</em><br>` : ""}
          ${r.admin_note ? `<span style="color:var(--text3);">Phản hồi: ${r.admin_note}</span><br>` : ""}
          <span style="color:var(--text3);font-size:11.5px;">Gửi lúc: ${fmtRelative(r.created_at)}</span>
          ${r.reviewed_at ? ` · Xử lý: ${fmtDate(r.reviewed_at)}` : ""}
        </div>
      </div>
    </div>`).join(""));

  renderPag("rrPagination", cur, total, filtered.length, "goRrPage");
}
function goRrPage(p) { pages["renewal-requests"] = p; renderRenewalRequests(); }

/* ══════════════════════════════════
   BROWSE STALLS
   GET /api/markets + /api/trader/me/available-stalls?market_id=X
══════════════════════════════════ */
async function initBrowseStalls() {
  // Load danh sách chợ vào select
  if (!marketCache.length) {
    try {
      const res   = await fetch(`${API}/markets`);
      marketCache = (await res.json()).data || [];
    } catch {}
  }
  fillSelect(document.getElementById("browseMarketSelect"), marketCache, "id", m => `${m.name}${m.city ? " — " + m.city : ""}`, "— Chọn chợ —");
  browseStallCache = [];
  setHTML("browseStallGrid", emptyState("fa-arrow-up", "Chọn chợ để xem sạp trống"));
  document.getElementById("browseFilterBar").style.display = "none";
}

async function loadAvailableStalls() {
  const marketId = document.getElementById("browseMarketSelect").value;
  if (!marketId) {
    setHTML("browseStallGrid", emptyState("fa-arrow-up", "Vui lòng chọn chợ"));
    document.getElementById("browseFilterBar").style.display = "none";
    return;
  }

  setHTML("browseStallGrid", loadingState());
  document.getElementById("browseFilterBar").style.display = "none";

  try {
    const res         = await fetch(`${API_ME}/available-stalls?market_id=${marketId}`, { headers: authHeader() });
    browseStallCache  = res.ok ? (await res.json()).data || [] : [];
    document.getElementById("browseFilterBar").style.display = browseStallCache.length ? "flex" : "none";
    pages["browse"] = 1;
    renderBrowseStalls();
  } catch (err) {
    setHTML("browseStallGrid", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu", err.message));
  }
}

function renderBrowseStalls() {
  const kw   = (document.getElementById("browseSearch")?.value || "").toLowerCase();
  const rMin = parseFloat(document.getElementById("browseRentMin")?.value) || 0;
  const rMax = parseFloat(document.getElementById("browseRentMax")?.value) || Infinity;

  const filtered = browseStallCache.filter(s => {
    if (kw && !`${s.code || ""} ${s.zone_name || ""}`.toLowerCase().includes(kw)) return false;
    if (s.monthly_rent && s.monthly_rent < rMin) return false;
    if (s.monthly_rent && s.monthly_rent > rMax) return false;
    return true;
  });

  const countEl = document.getElementById("browseCount");
  if (countEl) countEl.textContent = `${filtered.length} sạp trống`;

  const { items, total, cur } = paginate(filtered, "browse", 12);

  if (!items.length) {
    setHTML("browseStallGrid", emptyState("fa-border-all", "Không tìm thấy sạp trống", "Thử thay đổi bộ lọc hoặc chọn chợ khác"));
    renderPag("browsePagination", 1, 1, 0, "goBrowsePage");
    return;
  }

  setHTML("browseStallGrid", items.map(s => `
    <div class="stall-browse-card" onclick="viewStallDetail(${s.id})">
      <div class="sbc-header">
        <div class="sbc-icon"><i class="fa-solid fa-border-all"></i></div>
        <span class="badge badge-blue"><i class="fa-solid fa-circle" style="font-size:7px;"></i> Trống</span>
      </div>
      <div class="sbc-code">${s.code}</div>
      <div class="sbc-loc"><i class="fa-solid fa-location-dot" style="font-size:10px;margin-right:3px;"></i>${s.zone_name || "—"} · ${s.market_name || "—"}</div>
      <div class="sbc-info">
        <div class="sbc-row"><span>Diện tích</span><span>${s.area_m2 != null ? s.area_m2 + " m²" : "—"}</span></div>
        <div class="sbc-row"><span>Tiền thuê/tháng</span><span class="sbc-rent">${s.monthly_rent ? fmtCurrency(s.monthly_rent) : "Liên hệ"}</span></div>
      </div>
      <div class="sbc-footer">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();viewStallDetail(${s.id})"><i class="fa-solid fa-eye"></i> Xem</button>
        <button class="btn btn-teal btn-sm" onclick="event.stopPropagation();openRegisterStallModal(${s.id})"><i class="fa-solid fa-file-signature"></i> Đăng ký</button>
      </div>
    </div>`).join(""));

  renderPag("browsePagination", cur, total, filtered.length, "goBrowsePage");
}
function goBrowsePage(p) { pages["browse"] = p; renderBrowseStalls(); }

function viewStallDetail(id) {
  const s = browseStallCache.find(x => String(x.id) === String(id));
  if (!s) return;
  setEl("sdCode", s.code);
  setHTML("sdGrid", `
    <div class="detail-item"><div class="dl">Mã sạp</div><div class="dv"><strong>${s.code}</strong></div></div>
    <div class="detail-item"><div class="dl">Khu vực</div><div class="dv">${s.zone_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${s.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Diện tích</div><div class="dv">${s.area_m2 != null ? s.area_m2 + " m²" : "—"}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê/tháng</div><div class="dv" style="color:var(--primary);font-weight:700;">${s.monthly_rent ? fmtCurrency(s.monthly_rent) : "Liên hệ"}</div></div>
    <div class="detail-item"><div class="dl">Trạng thái</div><div class="dv"><span class="badge badge-blue">Đang trống</span></div></div>
  `);
  document.getElementById("sdRegisterBtn").onclick = () => { closeModal("modalStallDetail"); openRegisterStallModal(id); };
  openModal("modalStallDetail");
}

function openRegisterStallModal(stallId) {
  const s = browseStallCache.find(x => String(x.id) === String(stallId));
  if (!s) return;
  registerStallTarget = s;
  setEl("regStallCode", `${s.code} · ${s.zone_name || ""} · ${s.market_name || ""}`);
  setHTML("regStallPreview", `
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${s.code}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${s.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Diện tích</div><div class="dv">${s.area_m2 != null ? s.area_m2 + " m²" : "—"}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê</div><div class="dv" style="color:var(--primary);font-weight:700;">${s.monthly_rent ? fmtCurrency(s.monthly_rent) + "/tháng" : "Liên hệ"}</div></div>
  `);
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("regStartDate").value = today;
  document.getElementById("regStartDate").min   = today;
  document.getElementById("regEndDate").value   = "";
  document.getElementById("regNote").value      = "";
  hideFormMsg("regMsg");
  openModal("modalRegisterStall");
}

/* ══════════════════════════════════
   STALL REQUESTS — POST & GET /api/trader/me/stall-requests
══════════════════════════════════ */
async function submitStallRequest() {
  if (!registerStallTarget) return;
  const startDate = document.getElementById("regStartDate").value;
  const endDate   = document.getElementById("regEndDate").value;
  const note      = document.getElementById("regNote").value.trim();

  if (!startDate || !endDate) { showFormMsg("regMsg", "Vui lòng chọn ngày bắt đầu và kết thúc", true); return; }
  if (new Date(endDate) <= new Date(startDate)) { showFormMsg("regMsg", "Ngày kết thúc phải sau ngày bắt đầu", true); return; }

  const btn  = document.getElementById("regSubmitBtn");
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
  hideFormMsg("regMsg");

  try {
    const payload = { stall_id: registerStallTarget.id, requested_start_date: startDate, requested_end_date: endDate, note: note || null };
    const res     = await fetch(`${API_ME}/stall-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("regMsg", data.message || "Không thể gửi yêu cầu", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast("🎉 Đã gửi yêu cầu thuê sạp! Ban quản lý sẽ liên hệ trong 1–3 ngày làm việc.", "success", 5000);
    showFormMsg("regMsg", "Gửi yêu cầu thành công!", false);
    await loadStallRequests();
    setTimeout(() => { closeModal("modalRegisterStall"); btn.disabled = false; btn.innerHTML = orig; registerStallTarget = null; }, 1500);
  } catch (err) {
    showFormMsg("regMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

async function loadStallRequests() {
  setHTML("stallRequestList", loadingState());
  try {
    const res     = await fetch(`${API_ME}/stall-requests`, { headers: authHeader() });
    stallReqCache = res.ok ? (await res.json()).data || [] : [];
    setEl("sr-pending",  stallReqCache.filter(r => r.status === "PENDING").length);
    setEl("sr-approved", stallReqCache.filter(r => r.status === "APPROVED").length);
    setEl("sr-rejected", stallReqCache.filter(r => r.status === "REJECTED").length);
    updateNavBadges();
    pages["stall-requests"] = 1;
    renderStallRequests();
  } catch {
    setHTML("stallRequestList", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu"));
  }
}

function renderStallRequests() {
  const sf       = document.getElementById("srFilter")?.value || "";
  const filtered = stallReqCache.filter(r => !sf || r.status === sf);
  const countEl  = document.getElementById("srCount");
  if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;

  const { items, total, cur } = paginate(filtered, "stall-requests", 6);
  if (!items.length) {
    setHTML("stallRequestList", `<div class="card">${emptyState("fa-door-open", "Chưa có yêu cầu thuê sạp", "Chọn sạp trống và gửi yêu cầu đăng ký")}</div>`);
    renderPag("srPagination", 1, 1, 0, "goSrPage");
    return;
  }

  setHTML("stallRequestList", items.map(r => `
    <div class="req-card ${r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
      <div class="req-icon icon-box ${r.status === "PENDING" ? "ic-amber" : r.status === "APPROVED" ? "ic-green" : "ic-red"}">
        <i class="fa-solid ${r.status === "PENDING" ? "fa-clock" : r.status === "APPROVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
      </div>
      <div class="req-body">
        <div class="req-title">
          Thuê sạp <strong>${r.stall_code || "—"}</strong> · ${r.market_name || "—"}
          ${REQ_BADGE[r.status] || ""}
        </div>
        <div class="req-meta">
          Thời gian YC: <strong>${fmtDate(r.requested_start_date)}</strong> → <strong>${fmtDate(r.requested_end_date)}</strong><br>
          ${r.note ? `Ghi chú: <em>${r.note}</em><br>` : ""}
          ${r.admin_note ? `<span style="color:var(--text3);">Phản hồi quản lý: ${r.admin_note}</span><br>` : ""}
          <span style="color:var(--text3);font-size:11.5px;">Gửi: ${fmtRelative(r.created_at)}</span>
          ${r.reviewed_at ? ` · Xử lý: ${fmtDate(r.reviewed_at)}` : ""}
        </div>
        ${r.status === "PENDING" ? `
        <div class="req-footer">
          <span style="font-size:12.5px;color:var(--warning);"><i class="fa-solid fa-clock"></i> Đang chờ ban quản lý xét duyệt...</span>
        </div>` : ""}
        ${r.status === "APPROVED" ? `
        <div class="req-footer">
          <button class="btn btn-success btn-sm" onclick="goPage('my-contracts')"><i class="fa-solid fa-file-contract"></i> Xem hợp đồng</button>
        </div>` : ""}
      </div>
    </div>`).join(""));

  renderPag("srPagination", cur, total, filtered.length, "goSrPage");
}
function goSrPage(p) { pages["stall-requests"] = p; renderStallRequests(); }

/* ══════════════════════════════════
   STALL FEEDBACK — /api/stall-feedback
   Tiểu thương gửi phản ánh sự cố/khiếu nại về sạp đang thuê
   POST /api/stall-feedback        — gửi phản ánh mới
   GET  /api/stall-feedback/me     — lịch sử phản ánh của chính mình
══════════════════════════════════ */
const FB_BADGE = {
  PENDING:  '<span class="badge badge-amber">Chờ xử lý</span>',
  RESOLVED: '<span class="badge badge-green">Đã xử lý</span>',
  REJECTED: '<span class="badge badge-red">Từ chối</span>',
};

async function openSendFeedbackModal() {
  const select = document.getElementById("fbStallSelect");
  // Nếu chưa từng tải hợp đồng (vd. vào thẳng trang này mà chưa qua "Trang chủ"
  // hay "Hợp đồng của tôi"), tự tải trước để có danh sách sạp đang thuê.
  if (!myContractCache.length) {
    select.innerHTML = `<option value="">Đang tải danh sách sạp...</option>`;
    try {
      const res = await fetch(`${API_ME}/contracts`, { headers: authHeader() });
      myContractCache = res.ok ? (await res.json()).data || [] : [];
    } catch { myContractCache = []; }
  }

  const activeContracts = myContractCache.filter(c => c.status === "active");
  if (!activeContracts.length) {
    select.innerHTML = `<option value="">— Bạn chưa có sạp nào đang thuê —</option>`;
  } else {
    select.innerHTML = `<option value="">— Chọn sạp đang thuê —</option>` +
      activeContracts.map(c => `<option value="${c.stall_id}">${c.stall_code} · ${c.market_name || ""}</option>`).join("");
  }
  document.getElementById("fbTitle").value   = "";
  document.getElementById("fbContent").value = "";
  hideFormMsg("fbMsg");
  openModal("modalSendFeedback");
}

async function submitStallFeedback() {
  const stallId = document.getElementById("fbStallSelect").value;
  const title   = document.getElementById("fbTitle").value.trim();
  const content = document.getElementById("fbContent").value.trim();

  if (!stallId) { showFormMsg("fbMsg", "Vui lòng chọn sạp cần phản ánh", true); return; }
  if (!content) { showFormMsg("fbMsg", "Vui lòng nhập nội dung phản ánh", true); return; }

  const btn  = document.getElementById("fbSubmitBtn");
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
  hideFormMsg("fbMsg");

  try {
    const payload = { stall_id: stallId, title: title || null, content };
    const res = await fetch(`${API}/stall-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("fbMsg", data.message || "Không thể gửi phản ánh", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast("📩 Đã gửi phản ánh! Ban quản lý sẽ xem xét và phản hồi sớm.", "success", 5000);
    showFormMsg("fbMsg", "Gửi phản ánh thành công!", false);
    await loadMyFeedback();
    setTimeout(() => { closeModal("modalSendFeedback"); btn.disabled = false; btn.innerHTML = orig; }, 1500);
  } catch (err) {
    showFormMsg("fbMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

async function loadMyFeedback() {
  setHTML("feedbackList", loadingState());
  try {
    const res = await fetch(`${API}/stall-feedback/me`, { headers: authHeader() });
    feedbackCache = res.ok ? (await res.json()).data || [] : [];
    setEl("fb-pending",  feedbackCache.filter(r => r.status === "PENDING").length);
    setEl("fb-resolved", feedbackCache.filter(r => r.status === "RESOLVED").length);
    setEl("fb-rejected", feedbackCache.filter(r => r.status === "REJECTED").length);
    updateNavBadges();
    pages["stall-feedback"] = 1;
    renderMyFeedback();
  } catch {
    setHTML("feedbackList", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu"));
  }
}

function renderMyFeedback() {
  const sf       = document.getElementById("fbFilter")?.value || "";
  const filtered = feedbackCache.filter(r => !sf || r.status === sf);
  const countEl  = document.getElementById("fbCount");
  if (countEl) countEl.textContent = `${filtered.length} phản ánh`;

  const { items, total, cur } = paginate(filtered, "stall-feedback", 6);
  if (!items.length) {
    setHTML("feedbackList", `<div class="card">${emptyState("fa-triangle-exclamation", "Chưa có phản ánh nào", "Gửi phản ánh nếu sạp bạn thuê gặp sự cố")}</div>`);
    renderPag("fbPagination", 1, 1, 0, "goFbPage");
    return;
  }

  setHTML("feedbackList", items.map(r => `
    <div class="req-card ${r.status === "RESOLVED" ? "approved" : r.status === "REJECTED" ? "rejected" : ""}">
      <div class="req-icon icon-box ${r.status === "PENDING" ? "ic-amber" : r.status === "RESOLVED" ? "ic-green" : "ic-red"}">
        <i class="fa-solid ${r.status === "PENDING" ? "fa-clock" : r.status === "RESOLVED" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
      </div>
      <div class="req-body">
        <div class="req-title">
          Sạp <strong>${r.stall_code || "—"}</strong> · ${r.market_name || "—"}
          ${FB_BADGE[r.status] || ""}
        </div>
        <div class="req-meta">
          ${r.title ? `<strong>${r.title}</strong><br>` : ""}
          ${r.content || ""}<br>
          ${r.admin_note ? `<span style="color:var(--text3);">Phản hồi quản lý: ${r.admin_note}</span><br>` : ""}
          <span style="color:var(--text3);font-size:11.5px;">Gửi: ${fmtRelative(r.created_at)}</span>
          ${r.reviewed_at ? ` · Xử lý: ${fmtDate(r.reviewed_at)}` : ""}
        </div>
        ${r.status === "PENDING" ? `
        <div class="req-footer">
          <span style="font-size:12.5px;color:var(--warning);"><i class="fa-solid fa-clock"></i> Đang chờ ban quản lý xem xét...</span>
        </div>` : ""}
      </div>
    </div>`).join(""));

  renderPag("fbPagination", cur, total, filtered.length, "goFbPage");
}
function goFbPage(p) { pages["stall-feedback"] = p; renderMyFeedback(); }

/* ══════════════════════════════════
   MY PRODUCTS
   GET  /api/trader/me/products
   POST /api/trader/me/products       (multipart/form-data)
   PUT  /api/trader/me/products/:id   (multipart/form-data)
   DEL  /api/trader/me/products/:id
══════════════════════════════════ */
async function loadMyProducts() {
  setHTML("productGrid", loadingState());
  try {
    const res       = await fetch(`${API_ME}/products`, { headers: authHeader() });
    myProductCache  = res.ok ? (await res.json()).data || [] : [];
    pages["my-products"] = 1;
    renderProducts();
  } catch {
    setHTML("productGrid", emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu"));
  }
}

function renderProducts() {
  const kw = (document.getElementById("pSearch")?.value || "").toLowerCase();
  const filtered = myProductCache.filter(p => !kw || (p.name || "").toLowerCase().includes(kw));
  const countEl  = document.getElementById("pCount");
  if (countEl) countEl.textContent = `${filtered.length} / ${myProductCache.length} sản phẩm`;

  const { items, total, cur } = paginate(filtered, "my-products", 12);
  if (!items.length) {
    setHTML("productGrid", emptyState("fa-box-open", "Không tìm thấy sản phẩm", "Thêm sản phẩm đầu tiên của bạn"));
    renderPag("pPagination", 1, 1, 0, "goPPage");
    return;
  }

  setHTML("productGrid", items.map(p => {
    const src = imgUrl(p.image_url);
    return `
    <div class="product-card">
      <div class="pc-img">
        ${src
          ? `<img src="${src}" alt="${p.name}"
               style="width:100%;height:100%;object-fit:cover;"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
             <div class="pc-no-img" style="display:none;">
               <i class="fa-solid fa-image-slash"></i><span>Ảnh lỗi</span>
             </div>`
          : `<div class="pc-no-img">
               <i class="fa-solid fa-box-open"></i><span>Chưa có ảnh</span>
             </div>`}
      </div>
      <div class="pc-body">
        <div class="pc-name">${p.name}</div>
        <div class="pc-price">${fmtCurrency(p.price)}</div>
        <div class="pc-stall"><i class="fa-solid fa-border-all" style="font-size:10px;"></i> Sạp ${p.stall_code || "—"}</div>
      </div>
      <div class="pc-actions">
        <button class="btn btn-outline btn-sm" onclick="openEditProductModal(${p.id})" title="Sửa"><i class="fa-solid fa-pen"></i> Sửa</button>
        <button class="btn btn-danger btn-sm" onclick="openDeleteProductModal(${p.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;}
  ).join(""));

  renderPag("pPagination", cur, total, filtered.length, "goPPage");
}
function goPPage(p) { pages["my-products"] = p; renderProducts(); }

async function openAddProductModal() {
  // Chỉ cho thêm SP vào sạp đang có hợp đồng active
  if (!myContractCache.length) {
    // Load nếu chưa có
    const res   = await fetch(`${API_ME}/contracts`, { headers: authHeader() });
    myContractCache = res.ok ? (await res.json()).data || [] : [];
  }
  const activeStalls = myContractCache.filter(c => c.status === "active");
  if (!activeStalls.length) {
    showToast("Bạn chưa có hợp đồng sạp còn hiệu lực để thêm sản phẩm", "warning");
    return;
  }

  document.getElementById("formProduct").reset();
  document.getElementById("productId").value = "";
  setEl("productModalTitle", "Thêm sản phẩm mới");
  document.getElementById("productSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu';
  _clearImagePreview();
  hideFormMsg("productFormMsg");

  fillSelect(document.getElementById("productStallId"), activeStalls, "stall_id", c => `Sạp ${c.stall_code} — ${c.market_name || ""}`, "— Chọn sạp —");
  openModal("modalProduct");
}

async function openEditProductModal(id) {
  const p = myProductCache.find(x => String(x.id) === String(id));
  if (!p) return;

  document.getElementById("productId").value   = p.id;
  document.getElementById("productName").value  = p.name || "";
  document.getElementById("productPrice").value = p.price || "";
  setEl("productModalTitle", "Sửa sản phẩm");
  document.getElementById("productSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
  hideFormMsg("productFormMsg");

  // Stall select (chỉ readonly khi sửa vì backend không cho đổi stall qua PUT me/products)
  const activeStalls = myContractCache.filter(c => c.status === "active");
  fillSelect(document.getElementById("productStallId"), activeStalls, "stall_id", c => `Sạp ${c.stall_code} — ${c.market_name || ""}`, "— Chọn sạp —");
  document.getElementById("productStallId").value = p.stall_id || "";

  // Hiện ảnh hiện tại nếu có
  _clearImagePreview();
  if (p.image_url) {
    _showImagePreview(imgUrl(p.image_url), "Ảnh hiện tại", 0);
  }

  openModal("modalProduct");
}

// ── Image preview khi chọn file ──
document.addEventListener("DOMContentLoaded", () => {
  // Không cần addEventListener ở đây nữa vì dùng onchange="onProductImageChange(this)"
});

// Validate & hiển thị preview khi người dùng chọn file
function onProductImageChange(input) {
  const file = input?.files?.[0];
  if (!file) { _clearImagePreview(); return; }

  // Validate loại file
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ALLOWED.includes(file.type)) {
    showToast("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF", "warning");
    input.value = "";
    _clearImagePreview();
    return;
  }

  // Validate kích thước (5 MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast("Ảnh không được vượt quá 5 MB", "warning");
    input.value = "";
    _clearImagePreview();
    return;
  }

  // Đọc file → hiện preview
  const reader = new FileReader();
  reader.onload = e => _showImagePreview(e.target.result, file.name, file.size);
  reader.readAsDataURL(file);
}

// Drag & drop handlers
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById("productUploadArea")?.classList.add("dragover");
}
function handleDragLeave(e) {
  document.getElementById("productUploadArea")?.classList.remove("dragover");
}
function handleDrop(e) {
  e.preventDefault();
  const area = document.getElementById("productUploadArea");
  area?.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  // Gán vào input file
  const input = document.getElementById("productImage");
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  onProductImageChange(input);
}

// Hiển thị preview ảnh (dùng cho cả file mới lẫn ảnh cũ từ server)
function _showImagePreview(src, fileName, fileSize) {
  const area        = document.getElementById("productUploadArea");
  const placeholder = document.getElementById("productUploadPlaceholder");
  const imgEl       = document.getElementById("productImagePreview");
  const fileInfo    = document.getElementById("productFileInfo");
  const fileNameEl  = document.getElementById("productFileName");
  const fileSizeEl  = document.getElementById("productFileSize");

  if (imgEl)       { imgEl.src = src; imgEl.style.display = "block"; }
  if (placeholder) placeholder.style.display = "none";
  if (area)        area.classList.add("has-image");

  // Thanh thông tin file
  if (fileInfo)   fileInfo.style.display = "flex";
  if (fileNameEl) fileNameEl.textContent = fileName || "Ảnh hiện tại";
  if (fileSizeEl) {
    if (fileSize) {
      fileSizeEl.textContent = fileSize > 1024 * 1024
        ? (fileSize / 1024 / 1024).toFixed(1) + " MB"
        : Math.round(fileSize / 1024) + " KB";
    } else {
      fileSizeEl.textContent = "";
    }
  }
}

// Xóa preview, reset về placeholder
function _clearImagePreview() {
  const area        = document.getElementById("productUploadArea");
  const placeholder = document.getElementById("productUploadPlaceholder");
  const imgEl       = document.getElementById("productImagePreview");
  const fileInfo    = document.getElementById("productFileInfo");

  if (imgEl)       { imgEl.src = ""; imgEl.style.display = "none"; }
  if (placeholder) placeholder.style.display = "flex";
  if (area)        area.classList.remove("has-image");
  if (fileInfo)    fileInfo.style.display = "none";
}

// Nút "Xóa ảnh" trong modal
function removeProductImage() {
  const input = document.getElementById("productImage");
  if (input) input.value = "";
  _clearImagePreview();
}

async function submitProduct(e) {
  e.preventDefault();
  const id     = document.getElementById("productId").value;
  const isEdit = !!id;
  const name   = document.getElementById("productName").value.trim();
  const price  = document.getElementById("productPrice").value;
  const stallId= document.getElementById("productStallId").value;
  const image  = document.getElementById("productImage").files[0];

  if (!name || !price || !stallId) { showFormMsg("productFormMsg", "Vui lòng điền đầy đủ thông tin", true); return; }

  const btn  = document.getElementById("productSubmitBtn");
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  hideFormMsg("productFormMsg");

  // Dùng FormData vì backend dùng multer (multipart/form-data)
  const formData = new FormData();
  formData.append("name",  name);
  formData.append("price", price);
  if (!isEdit) formData.append("stall_id", stallId);

  const imgFileInp = document.getElementById("productImage");
  const imgUrlOld  = document.getElementById("productImageUrl")?.value || "";
  if (imgFileInp?.files?.length) {
    formData.append("image", imgFileInp.files[0]);  // ảnh mới
  } else if (imgUrlOld) {
    formData.append("image_url", imgUrlOld);         // giữ ảnh cũ
  }
  // Nếu cả 2 trống (người dùng đã xóa ảnh) → không append gì → backend set NULL

  try {
    const url = isEdit ? `${API_ME}/products/${id}` : `${API_ME}/products`;
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: authHeader(),   // KHÔNG set Content-Type — browser tự set với boundary
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("productFormMsg", data.message || "Không thể lưu sản phẩm", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }
    showToast(isEdit ? "Cập nhật sản phẩm thành công!" : "Thêm sản phẩm thành công!", "success");
    await loadMyProducts();
    setTimeout(() => { closeModal("modalProduct"); btn.disabled = false; btn.innerHTML = orig; }, 600);
  } catch (err) {
    showFormMsg("productFormMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}

function openDeleteProductModal(id) {
  const p = myProductCache.find(x => String(x.id) === String(id));
  if (!p) return;
  productToDelete = id;
  setEl("dpName", p.name);
  hideFormMsg("dpMsg");
  openModal("modalDeleteProduct");
}

async function confirmDeleteProduct() {
  if (!productToDelete) return;
  const btn = document.getElementById("dpConfirmBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const res  = await fetch(`${API_ME}/products/${productToDelete}`, { method: "DELETE", headers: authHeader() });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("dpMsg", data.message || "Không thể xóa sản phẩm", true);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
      return;
    }
    showToast("Đã xóa sản phẩm!", "success");
    await loadMyProducts();
    setTimeout(() => { closeModal("modalDeleteProduct"); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa'; productToDelete = null; }, 400);
  } catch (err) {
    showFormMsg("dpMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
  }
}

/* ══════════════════════════════════
   MY ORDERS
   GET /api/trader/me/orders
   GET /api/trader/me/orders/:id
══════════════════════════════════ */
const ORDER_STATUS_LABEL = {
  pending:   { text: "Chờ xử lý",   cls: "badge-amber" },
  confirmed: { text: "Đã xác nhận", cls: "badge-blue"  },
  completed: { text: "Hoàn thành",  cls: "badge-green" },
  cancelled: { text: "Đã hủy",      cls: "badge-red"   },
};

async function loadMyOrders() {
  document.getElementById("orderTable").innerHTML = `<tr><td colspan="7" class="tc">${loadingState()}</td></tr>`;
  try {
    const res     = await fetch(`${API_ME}/orders`, { headers: authHeader() });
    myOrderCache  = res.ok ? (await res.json()).data || [] : [];
    pages["my-orders"] = 1;
    renderOrders();
  } catch {
    document.getElementById("orderTable").innerHTML = `<tr><td colspan="7" class="tc">${emptyState("fa-circle-exclamation", "Lỗi tải dữ liệu")}</td></tr>`;
  }
}

function renderOrders() {
  const kw       = (document.getElementById("oSearch")?.value || "").toLowerCase();
  const filtered = myOrderCache.filter(o => !kw || `${o.id} ${o.customer_name || ""}`.toLowerCase().includes(kw));
  const countEl  = document.getElementById("oCount");
  if (countEl) countEl.textContent = `${filtered.length} đơn hàng`;

  const { items, total, cur } = paginate(filtered, "my-orders");
  document.getElementById("orderTable").innerHTML = items.map(o => {
    const st = ORDER_STATUS_LABEL[o.status] || { text: o.status || "—", cls: "badge-gray" };
    return `
    <tr>
      <td><strong>#${o.id}</strong></td>
      <td>${o.customer_name || "—"}${o.is_guest ? ' <span class="badge badge-gray" style="font-size:10px;">Khách vãng lai</span>' : ""}</td>
      <td>${o.customer_phone || "—"}</td>
      <td><strong style="color:var(--primary);">${fmtCurrency(o.total_amount)}</strong></td>
      <td>${o.created_at ? fmtDate(o.created_at) : "—"}</td>
      <td><span class="badge ${st.cls}">${st.text}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewOrderDetail(${o.id})"><i class="fa-solid fa-eye"></i> Chi tiết</button>
        ${o.status !== "completed" && o.status !== "cancelled" ? `
          <button class="btn btn-outline btn-sm" onclick="updateMyOrderStatus(${o.id}, 'completed')" title="Đánh dấu hoàn thành"><i class="fa-solid fa-check"></i></button>
        ` : ""}
      </td>
    </tr>`; }).join("") || `<tr><td colspan="7">${emptyState("fa-receipt", "Chưa có đơn hàng")}</td></tr>`;

  renderPag("oPagination", cur, total, filtered.length, "goOPage");
}
function goOPage(p) { pages["my-orders"] = p; renderOrders(); }

async function updateMyOrderStatus(id, status) {
  try {
    const res = await fetch(`${API}/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) { alert(data.message || "Cập nhật thất bại"); return; }
    const idx = myOrderCache.findIndex(o => o.id === id);
    if (idx > -1) myOrderCache[idx].status = status;
    renderOrders();
  } catch (err) {
    alert("Lỗi kết nối: " + err.message);
  }
}

async function viewOrderDetail(id) {
  setEl("odId", `#${id}`);
  setHTML("odGrid", loadingState());
  setHTML("odItems", `<tr><td colspan="4" class="tc">Đang tải...</td></tr>`);
  setEl("odTotal", "—");
  openModal("modalOrderDetail");

  try {
    const res  = await fetch(`${API_ME}/orders/${id}`, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok || !data.success) { setHTML("odGrid", emptyState("fa-circle-exclamation", "Lỗi tải đơn hàng")); return; }
    const o = data.data;
    const st = ORDER_STATUS_LABEL[o.status] || { text: o.status || "—", cls: "badge-gray" };
    setHTML("odGrid", `
      <div class="detail-item"><div class="dl">Mã đơn</div><div class="dv"><strong>#${o.id}</strong></div></div>
      <div class="detail-item"><div class="dl">Khách hàng</div><div class="dv">${o.customer_name || "—"}${o.is_guest ? ' <span class="badge badge-gray" style="font-size:10px;">Khách vãng lai</span>' : ""}</div></div>
      <div class="detail-item"><div class="dl">SĐT khách</div><div class="dv">${o.customer_phone || "—"}</div></div>
      <div class="detail-item"><div class="dl">Địa chỉ giao</div><div class="dv">${o.guest_address || "—"}</div></div>
      <div class="detail-item"><div class="dl">Trạng thái</div><div class="dv"><span class="badge ${st.cls}">${st.text}</span></div></div>
      <div class="detail-item"><div class="dl">Ngày đặt</div><div class="dv">${fmtDate(o.created_at)}</div></div>
    `);
    const items = o.items || [];
    document.getElementById("odItems").innerHTML = items.map(i => `
      <tr>
        <td>${i.product_name || "—"}</td>
        <td>${i.quantity}</td>
        <td>${fmtCurrency(i.price)}</td>
        <td><strong>${fmtCurrency(Number(i.price) * Number(i.quantity))}</strong></td>
      </tr>`).join("") || `<tr><td colspan="4" class="tc">Không có sản phẩm</td></tr>`;
    setEl("odTotal", fmtCurrency(o.total_amount));
  } catch (err) {
    setHTML("odGrid", emptyState("fa-circle-exclamation", "Lỗi: " + err.message));
  }
}

/* ══════════════════════════════════
   PROFILE
   GET /api/trader/me
   PUT /api/trader/me
══════════════════════════════════ */
function loadProfile() {
  if (!ME) return;
  const ini = getInitials(ME.full_name);
  setEl("profileAvatar", ini);
  setEl("profileName",     ME.full_name);
  setEl("profileBiz",      `${ME.business_name || "—"} · ${ME.market_name || "—"}`);
  setEl("profilePhone",    ME.phone);
  setEl("profileEmail",    ME.email);
  setEl("profileUsername", ME.username);
  setEl("profileTaxCode",  ME.tax_code);
  setEl("profileMarket",   `${ME.market_name || "—"} · ${ME.market_address || ""}${ME.market_city ? ", " + ME.market_city : ""}`);
  const statusEl = document.getElementById("profileStatus");
  if (statusEl) statusEl.innerHTML = ME.status === "ACTIVE"
    ? '<span class="badge badge-green">Hoạt động</span>'
    : '<span class="badge badge-red">Tạm khóa</span>';
}

function openEditProfileModal() {
  if (!ME) return;
  document.getElementById("epFullName").value = ME.full_name || "";
  document.getElementById("epPhone").value    = ME.phone || "";
  document.getElementById("epEmail").value    = ME.email || "";
  hideFormMsg("epMsg");
  openModal("modalEditProfile");
}

async function saveProfile() {
  const fullName = document.getElementById("epFullName").value.trim();
  const phone    = document.getElementById("epPhone").value.trim();
  const email    = document.getElementById("epEmail").value.trim();
  if (!fullName) { showFormMsg("epMsg", "Vui lòng nhập họ tên", true); return; }

  const btn = document.querySelector('#modalEditProfile .btn-primary');
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
  hideFormMsg("epMsg");

  try {
    const res  = await fetch(`${API_ME}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ full_name: fullName, phone: phone || null, email: email || null }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showFormMsg("epMsg", data.message || "Không thể cập nhật", true);
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      return;
    }
    // Cập nhật ME local
    Object.assign(ME, { full_name: fullName, phone, email });
    updateUI(); loadProfile();
    showToast("Cập nhật hồ sơ thành công!", "success");
    setTimeout(() => { closeModal("modalEditProfile"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 500);
  } catch (err) {
    showFormMsg("epMsg", "Lỗi kết nối: " + err.message, true);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function changePassword() {
  const current = document.getElementById("pwdCurrent").value;
  const newPwd  = document.getElementById("pwdNew").value;
  const confirm = document.getElementById("pwdConfirm").value;
  hideFormMsg("pwdMsg");
  if (!current || !newPwd || !confirm) { showFormMsg("pwdMsg", "Vui lòng điền đầy đủ các ô mật khẩu", true); return; }
  if (newPwd !== confirm)              { showFormMsg("pwdMsg", "Mật khẩu xác nhận không khớp", true);         return; }
  if (newPwd.length < 6)              { showFormMsg("pwdMsg", "Mật khẩu mới phải có ít nhất 6 ký tự", true); return; }

  try {
    // SỬA: trước đây gọi PUT /api/trader/:id (route quản lý tiểu thương dành
    // cho ADMIN, và route đó từng không có xác thực) để tự đổi mật khẩu —
    // vừa sai kiến trúc vừa là lỗ hổng bảo mật. Giờ dùng đúng endpoint tự
    // phục vụ, xác định trader qua token đăng nhập và yêu cầu đúng mật khẩu
    // hiện tại trước khi đổi.
    const res  = await fetch(`${API_ME}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ current_password: current, new_password: newPwd }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) { showFormMsg("pwdMsg", data.message || "Không thể đổi mật khẩu", true); return; }
    showFormMsg("pwdMsg", "Đổi mật khẩu thành công!", false);
    showToast("Đổi mật khẩu thành công!", "success");
    document.getElementById("pwdCurrent").value = "";
    document.getElementById("pwdNew").value     = "";
    document.getElementById("pwdConfirm").value  = "";
  } catch (err) {
    showFormMsg("pwdMsg", "Lỗi kết nối: " + err.message, true);
  }
}

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
  
  await loadHome();
});
/* ══════════════════════════════════
   PAYMENTS PAGE
   API endpoints:
   GET  /api/trader/me/invoices             — danh sách hóa đơn
   GET  /api/trader/me/invoices/:id         — chi tiết + lịch sử TT
   POST /api/trader/me/invoices/:id/pay     — thanh toán
   GET  /api/trader/me/payments             — lịch sử thanh toán
   GET  /api/trader/me/payment-summary      — tổng quan
══════════════════════════════════ */

let invoiceCache    = [];
let payHistCache    = [];
let selectedPayMethod = "";
let currentInvId    = null;
let payingInvoice   = null;

const INV_BADGE = {
  PAID:    '<span class="badge badge-green">Đã thanh toán</span>',
  UNPAID:  '<span class="badge badge-amber">Chưa thanh toán</span>',
  OVERDUE: '<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Quá hạn</span>',
};
// Trạng thái được coi là "còn phải trả" (khác PAID) — dùng để hiện nút Thanh toán / màu đỏ
function isPayable(status) { return status === "UNPAID" || status === "OVERDUE"; }
const METHOD_LABEL = {
  CASH:          '<i class="fa-solid fa-money-bills"></i> Tiền mặt',
  BANK_TRANSFER: '<i class="fa-solid fa-building-columns"></i> Chuyển khoản',
  MOMO:          '<i class="fa-solid fa-mobile-screen"></i> MoMo',
  VNPAY:         '<i class="fa-solid fa-credit-card"></i> VNPay',
  ZALOPAY:       '<i class="fa-solid fa-wallet"></i> ZaloPay',
};

/* ── Load trang thanh toán ── */
async function loadMyPayments() {
  setHTML("invoiceTable",    `<tr><td colspan="8" class="tc">${loadingState()}</td></tr>`);
  setHTML("payHistoryTable", `<tr><td colspan="7" class="tc">${loadingState()}</td></tr>`);

  try {
    const [sumRes, invRes, histRes] = await Promise.all([
      fetch(`${API_ME}/payment-summary`, { headers: authHeader() }),
      fetch(`${API_ME}/invoices`,        { headers: authHeader() }),
      fetch(`${API_ME}/payments`,        { headers: authHeader() }),
    ]);

    // Summary
    if (sumRes.ok) {
      const { data } = await sumRes.json();
      setEl("pay-unpaid-count",  data.unpaid_invoices);
      setEl("pay-paid-count",    data.paid_invoices);
      setEl("pay-total-count",   data.total_invoices);
      const overdueNote = data.overdue_invoices > 0
        ? ` <span style="color:var(--danger);font-weight:700;">(${data.overdue_invoices} quá hạn)</span>` : "";
      setHTML("pay-unpaid-amount", `<span style="color:var(--danger);">${fmtCurrency(data.unpaid_amount)}</span>${overdueNote}`);
      setHTML("pay-paid-amount",   `<span style="color:var(--primary);">${fmtCurrency(data.paid_amount)}</span>`);
      setHTML("pay-total-amount",  fmtCurrency(data.total_amount));

      // Nav badge: số hóa đơn chưa TT (gồm cả quá hạn)
      const payBadge = document.getElementById("navPayBadge");
      if (payBadge) {
        payBadge.textContent  = data.unpaid_invoices;
        payBadge.style.display = data.unpaid_invoices > 0 ? "" : "none";
      }
    }

    invoiceCache = invRes.ok  ? (await invRes.json()).data  || [] : [];
    payHistCache = histRes.ok ? (await histRes.json()).data || [] : [];

    pages["invoices"] = 1;
    pages["pay-hist"] = 1;
    renderInvoices();
    renderPayHistory();

  } catch (err) {
    showToast("Lỗi tải dữ liệu thanh toán: " + err.message, "error");
  }
}

/* ── Switch tab ── */
function switchPayTab(tab) {
  document.getElementById("payTabInvoices").style.display = tab === "invoices" ? "" : "none";
  document.getElementById("payTabHistory").style.display  = tab === "history"  ? "" : "none";
  document.getElementById("tabInvoices").classList.toggle("active", tab === "invoices");
  document.getElementById("tabHistory").classList.toggle("active",  tab === "history");
}

/* ── Render danh sách hóa đơn ── */
function renderInvoices() {
  const sf       = document.getElementById("invoiceFilter")?.value || "";
  const filtered = invoiceCache.filter(f => !sf || f.status === sf);
  const countEl  = document.getElementById("invCount");
  if (countEl) countEl.textContent = `${filtered.length} hóa đơn`;

  const { items, total, cur } = paginate(filtered, "invoices");
  if (!items.length) {
    document.getElementById("invoiceTable").innerHTML = `<tr><td colspan="8">${emptyState("fa-file-invoice", "Không có hóa đơn nào")}</td></tr>`;
    renderPag("invPagination", 1, 1, 0, "goInvPage");
    return;
  }

  document.getElementById("invoiceTable").innerHTML = items.map(f => `
    <tr>
      <td><strong>#${f.id}</strong>${f.contract_period ? `<div style="font-size:11px;color:var(--text3);">Kỳ ${f.contract_period}</div>` : ""}</td>
      <td><strong>${f.stall_code || "—"}</strong></td>
      <td>${f.market_name || "—"}</td>
      <td>${fmtCurrency(f.monthly_rent)}</td>
      <td><strong class="${isPayable(f.status) ? "inv-unpaid" : "inv-paid"}">${fmtCurrency(f.total_amount)}</strong></td>
      <td>${INV_BADGE[f.status] || f.status}${f.due_date && f.status !== "PAID" ? `<div style="font-size:11px;color:${f.status === "OVERDUE" ? "var(--danger)" : "var(--text3)"};margin-top:2px;">Hạn: ${fmtDate(f.due_date)}</div>` : ""}</td>
      <td>${fmtDate(f.created_at)}</td>
      <td>
        <div class="actions">
          <button class="btn btn-outline btn-sm" onclick="viewInvoiceDetail(${f.id})" title="Xem chi tiết">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${isPayable(f.status) ? `
          <button class="btn btn-teal btn-sm" onclick="openPayModal(${f.id})" title="Thanh toán">
            <i class="fa-solid fa-money-bill-wave"></i> Thanh toán
          </button>` : ""}
        </div>
      </td>
    </tr>`).join("");

  renderPag("invPagination", cur, total, filtered.length, "goInvPage");
}
function goInvPage(p) { pages["invoices"] = p; renderInvoices(); }

/* ── Render lịch sử thanh toán ── */
function renderPayHistory() {
  const { items, total, cur } = paginate(payHistCache, "pay-hist");
  if (!items.length) {
    document.getElementById("payHistoryTable").innerHTML = `<tr><td colspan="7">${emptyState("fa-clock-rotate-left", "Chưa có lần thanh toán nào")}</td></tr>`;
    renderPag("payHistPagination", 1, 1, 0, "goPayHistPage");
    return;
  }
  document.getElementById("payHistoryTable").innerHTML = items.map(p => `
    <tr>
      <td><strong>#${p.id}</strong></td>
      <td>#${p.invoice_id}</td>
      <td>${p.stall_code || "—"}</td>
      <td>${p.market_name || "—"}</td>
      <td><strong style="color:var(--primary);">${fmtCurrency(p.amount)}</strong></td>
      <td>${METHOD_LABEL[p.method] || p.method || "—"}</td>
      <td>${fmtDate(p.payment_date)}</td>
    </tr>`).join("");
  renderPag("payHistPagination", cur, total, payHistCache.length, "goPayHistPage");
}
function goPayHistPage(p) { pages["pay-hist"] = p; renderPayHistory(); }

/* ── Xem chi tiết hóa đơn ── */
async function viewInvoiceDetail(id) {
  currentInvId = id;
  const inv    = invoiceCache.find(f => String(f.id) === String(id));

  setEl("invDetailId", `#${id}`);
  setHTML("invDetailGrid", inv ? `
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${inv.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${inv.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Hợp đồng</div><div class="dv">#${inv.contract_id || "—"}</div></div>
    <div class="detail-item"><div class="dl">Tiền thuê/tháng</div><div class="dv">${fmtCurrency(inv.monthly_rent)}</div></div>
    <div class="detail-item"><div class="dl">Kỳ thanh toán</div><div class="dv">${inv.contract_period ? "Kỳ " + inv.contract_period : "—"}</div></div>
    <div class="detail-item"><div class="dl">Hạn thanh toán</div><div class="dv" style="${inv.status === "OVERDUE" ? "color:var(--danger);font-weight:700;" : ""}">${fmtDate(inv.due_date)}</div></div>
    <div class="detail-item"><div class="dl">Số tiền hóa đơn</div><div class="dv"><strong class="${isPayable(inv.status) ? "inv-unpaid" : "inv-paid"}">${fmtCurrency(inv.total_amount)}</strong></div></div>
    <div class="detail-item"><div class="dl">Trạng thái</div><div class="dv">${INV_BADGE[inv.status] || inv.status}</div></div>
    <div class="detail-item"><div class="dl">Ngày tạo</div><div class="dv">${fmtDate(inv.created_at)}</div></div>
    <div class="detail-item"><div class="dl">Thời hạn HĐ</div><div class="dv">${fmtDate(inv.start_date)} → ${fmtDate(inv.end_date)}</div></div>
  ` : loadingState());

  const payBtn = document.getElementById("invDetailPayBtn");
  if (payBtn) payBtn.style.display = isPayable(inv?.status) ? "" : "none";

  setHTML("invDetailPayments", `<tr><td colspan="4" class="tc">Đang tải...</td></tr>`);
  openModal("modalInvDetail");

  try {
    const res  = await fetch(`${API_ME}/invoices/${id}`, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message);

    const pmts = data.data.payments || [];
    document.getElementById("invDetailPayments").innerHTML = pmts.length
      ? pmts.map(p => `
        <tr>
          <td>#${p.id}</td>
          <td><strong>${fmtCurrency(p.amount)}</strong></td>
          <td>${METHOD_LABEL[p.method] || p.method || "—"}</td>
          <td>${fmtDate(p.payment_date)}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="tc" style="color:var(--text3);">Chưa có lần thanh toán nào</td></tr>`;
  } catch (err) {
    document.getElementById("invDetailPayments").innerHTML = `<tr><td colspan="4" class="tc" style="color:var(--danger);">Lỗi: ${err.message}</td></tr>`;
  }
}

/* ── Mở modal thanh toán ── */
function openPayModal(id) {
  const inv = invoiceCache.find(f => String(f.id) === String(id));
  if (!inv) return;
  if (inv.status === "PAID") { showToast("Hóa đơn này đã được thanh toán", "warning"); return; }

  payingInvoice     = inv;
  selectedPayMethod = "";

  setEl("payInvId", `#${id} — ${fmtCurrency(inv.total_amount)}`);

  setHTML("payInvDetail", `
    <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${inv.stall_code || "—"}</strong></div></div>
    <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${inv.market_name || "—"}</div></div>
    <div class="detail-item"><div class="dl">Số tiền cần thanh toán</div><div class="dv"><strong class="inv-unpaid" style="font-size:16px;">${fmtCurrency(inv.total_amount)}</strong></div></div>
    <div class="detail-item"><div class="dl">Hạn hợp đồng</div><div class="dv">${fmtDate(inv.start_date)} → ${fmtDate(inv.end_date)}</div></div>
  `);

  goPayStep1();
  closeModal("modalInvDetail");
  openModal("modalPay");
}

/* ── Reset về step 1 ── */
function goPayStep1() {
  clearPayCountdown();
  document.getElementById("payStep1").style.display = "";
  document.getElementById("payStep2").style.display = "none";
  document.getElementById("payStep1Footer").style.display = "flex";
  document.getElementById("payStep2Footer").style.display = "none";
  document.getElementById("stepDot1").classList.add("active");
  document.getElementById("stepDot2").classList.remove("active");
  hideFormMsg("payMsg");
  selectedPayMethod = "";
}

/* ── Chọn phương thức → sang step 2 ── */
function selectAndNext(method) {
  if (!payingInvoice) return;
  selectedPayMethod = method;

  document.getElementById("payStep1").style.display = "none";
  document.getElementById("payStep2").style.display = "";
  document.getElementById("payStep1Footer").style.display = "none";
  document.getElementById("payStep2Footer").style.display = "flex";
  document.getElementById("stepDot1").classList.remove("active");
  document.getElementById("stepDot2").classList.add("active");
  hideFormMsg("payMsg");

  const METHOD_NAMES = {
    CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản ngân hàng",
    MOMO: "Ví MoMo", VNPAY: "VNPay", ZALOPAY: "ZaloPay",
  };

  setHTML("payQrSummary", `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);">
      <div style="flex:1;">
        <div style="font-size:12px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Thanh toán qua</div>
        <div style="font-size:15px;font-weight:700;margin-top:2px;">${METHOD_NAMES[method] || method}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--text3);">Số tiền</div>
        <div style="font-size:18px;font-weight:700;color:var(--danger);">${fmtCurrency(payingInvoice.total_amount)}</div>
      </div>
    </div>`);

  if (method === "CASH") {
    renderCashStep();
  } else if (method === "BANK_TRANSFER") {
    renderBankQR();
  } else if (method === "MOMO") {
    renderMomoQR();
  }
}

/* ────────────────────────────────
   TIỀN MẶT
──────────────────────────────── */
function renderCashStep() {
  setHTML("payQrZone", `
    <div style="display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:12px;">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--primary-pale);display:flex;align-items:center;justify-content:center;">
        <i class="fa-solid fa-money-bills" style="font-size:32px;color:var(--primary);"></i>
      </div>
      <div style="font-size:15px;font-weight:700;color:var(--text);">Thanh toán tiền mặt</div>
      <div style="font-size:13px;color:var(--text2);text-align:center;max-width:320px;line-height:1.7;">
        Vui lòng mang <strong style="color:var(--danger);">${fmtCurrency(payingInvoice.total_amount)}</strong>
        đến <strong>quầy thu phí Ban quản lý chợ</strong> để nộp tiền thuê sạp.
        Sau khi nhận biên lai, bấm xác nhận để hệ thống ghi nhận.
      </div>
    </div>`);

  document.getElementById("payBankInfo").style.display = "none";

  setHTML("payQrGuide", `
    <div class="alert-box alert-info">
      <i class="fa-solid fa-circle-info"></i>
      <div>
        <strong>Hướng dẫn:</strong><br>
        1. Đến quầy thu phí Ban quản lý chợ trong giờ hành chính<br>
        2. Xuất trình <strong>Mã hóa đơn #${payingInvoice.id}</strong> và CMND/CCCD<br>
        3. Nộp tiền và nhận biên lai<br>
        4. Bấm <em>"Tôi đã thanh toán"</em> để ghi nhận
      </div>
    </div>`);

  document.getElementById("payCountdownWrap").style.display = "none";
  startPayCountdown(0); // không cần đếm ngược tiền mặt
}

/* ────────────────────────────────
   CHUYỂN KHOẢN NGÂN HÀNG — VietQR
   API: https://img.vietqr.io/image/{bank}-{account}-{template}.png
        ?amount={amount}&addInfo={desc}&accountName={name}
──────────────────────────────── */
function renderBankQR() {
  // ══ CẤU HÌNH TÀI KHOẢN NHẬN (chỉnh lại theo thực tế) ══
  const BANK_CONFIG = {
    bankId:      "970422",          // MB Bank (hoặc thay bằng mã ngân hàng của bạn)
    accountNo:   "0123456789",      // Số tài khoản nhận tiền
    accountName: "QUAN LY CHO SMARTMARKET",
    bankName:    "MB Bank",
  };

  const amount  = payingInvoice.total_amount;
  const desc    = encodeURIComponent(`ThanhToan HoaDon ${payingInvoice.id} Sap ${payingInvoice.stall_code || ""}`);
  const qrUrl   = `https://img.vietqr.io/image/${BANK_CONFIG.bankId}-${BANK_CONFIG.accountNo}-compact2.png?amount=${amount}&addInfo=${desc}&accountName=${encodeURIComponent(BANK_CONFIG.accountName)}`;

  setHTML("payQrZone", `
    <div class="qr-frame qr-frame--bank">
      <div class="qr-brand-bar" style="background:linear-gradient(90deg,#1e6fa8,#3a9bd5);">
        <img src="https://vietqr.io/img/VIETQR.svg" alt="VietQR" style="height:22px;filter:brightness(10);" onerror="this.style.display='none'">
        <span style="color:#fff;font-size:13px;font-weight:700;margin-left:8px;">VietQR</span>
        <span style="color:rgba(255,255,255,0.7);font-size:11px;margin-left:auto;">Mọi ngân hàng — Miễn phí</span>
      </div>
      <div style="padding:16px;display:flex;justify-content:center;">
        <img id="vietqrImg" src="${qrUrl}"
          style="width:220px;height:220px;object-fit:contain;border-radius:10px;"
          onerror="handleQrError('vietqrImg','bank')"
          onload="document.getElementById('qrLoadingNote').style.display='none';">
      </div>
      <div id="qrLoadingNote" style="text-align:center;font-size:12px;color:var(--text3);padding-bottom:8px;">Đang tải mã QR...</div>
      <div style="padding:0 16px 12px;text-align:center;font-size:12px;color:var(--text3);">
        <i class="fa-solid fa-mobile-screen" style="margin-right:4px;"></i>
        Mở app ngân hàng bất kỳ → Quét QR
      </div>
    </div>`);

  // Hiện thông tin tài khoản thủ công
  const bankInfo = document.getElementById("payBankInfo");
  bankInfo.style.display = "";
  setEl("bib-bank",    BANK_CONFIG.bankName);
  setEl("bib-account", BANK_CONFIG.accountNo);
  setEl("bib-name",    BANK_CONFIG.accountName);
  setEl("bib-amount",  fmtCurrency(amount));
  setEl("bib-desc",    `ThanhToan HoaDon ${payingInvoice.id} Sap ${payingInvoice.stall_code || ""}`);

  setHTML("payQrGuide", `
    <div class="alert-box alert-info" style="margin-bottom:0;">
      <i class="fa-solid fa-circle-info"></i>
      <div>
        <strong>Cách quét QR VietQR:</strong><br>
        Mở <strong>bất kỳ app ngân hàng nào</strong> (Vietcombank, MB, BIDV, ACB, Techcombank...)
        → Chọn <em>Quét QR / Chuyển tiền QR</em> → Quét mã trên màn hình.
        Số tiền & nội dung sẽ được điền tự động.
      </div>
    </div>`);

  document.getElementById("payCountdownWrap").style.display = "flex";
  startPayCountdown(10 * 60); // 10 phút
}

/* ────────────────────────────────
   MOMO QR
   Dùng deeplink MoMo: momo://app?action=...
   Đồng thời generate QR bằng api.qrserver.com (free, không cần key)
──────────────────────────────── */
function renderMomoQR() {
  // ══ CẤU HÌNH MOMO (chỉnh lại theo thực tế) ══
  const MOMO_CONFIG = {
    phone:   "0987654321",          // Số điện thoại MoMo nhận tiền
    name:    "BAN QUAN LY CHO",     // Tên hiển thị
  };

  const amount  = payingInvoice.total_amount;
  const desc    = `ThanhToan HoaDon ${payingInvoice.id} Sap ${payingInvoice.stall_code || ""}`;

  // Deep link MoMo
  const momoDeeplink = `momo://transfer?phone=${MOMO_CONFIG.phone}&amount=${amount}&remarks=${encodeURIComponent(desc)}&source=smartmarket`;

  // QR từ api.qrserver.com (encode deeplink vào QR)
  const qrContent = encodeURIComponent(momoDeeplink);
  const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?data=${qrContent}&size=220x220&color=a01f8c&bgcolor=fff&margin=10&format=png`;

  setHTML("payQrZone", `
    <div class="qr-frame qr-frame--momo">
      <div class="qr-brand-bar" style="background:linear-gradient(90deg,#a01f8c,#cc3aab);">
        <span style="color:#fff;font-size:15px;font-weight:800;letter-spacing:-0.3px;">M</span>
        <span style="color:#fff;font-size:13px;font-weight:700;margin-left:6px;">MoMo</span>
        <span style="color:rgba(255,255,255,0.7);font-size:11px;margin-left:auto;">Ví điện tử MoMo</span>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;">
        <img id="momoQrImg" src="${qrUrl}"
          style="width:220px;height:220px;border-radius:10px;object-fit:contain;"
          onerror="handleQrError('momoQrImg','momo')"
          onload="document.getElementById('momoLoadingNote').style.display='none';">
        <div id="momoLoadingNote" style="font-size:12px;color:var(--text3);">Đang tạo mã QR...</div>
        <!-- Nút mở app MoMo trực tiếp (hoạt động trên mobile) -->
        <a href="${momoDeeplink}" class="btn btn-sm" style="background:#a01f8c;color:#fff;border:none;text-decoration:none;margin-top:2px;" id="momoOpenAppBtn">
          <i class="fa-solid fa-mobile-screen-button"></i> Mở app MoMo
        </a>
        <div style="font-size:11.5px;color:var(--text3);text-align:center;">
          Nút "Mở app MoMo" chỉ hoạt động trên điện thoại
        </div>
      </div>
    </div>`);

  // Hiện thông tin thủ công
  const bankInfo = document.getElementById("payBankInfo");
  bankInfo.style.display = "";
  setEl("bib-bank",    "Ví MoMo");
  setEl("bib-account", MOMO_CONFIG.phone);
  setEl("bib-name",    MOMO_CONFIG.name);
  setEl("bib-amount",  fmtCurrency(amount));
  setEl("bib-desc",    desc);

  setHTML("payQrGuide", `
    <div class="alert-box" style="background:#f9eaf7;border:1px solid #e0aad8;color:#7a1566;margin-bottom:0;">
      <i class="fa-solid fa-circle-info"></i>
      <div>
        <strong>Cách quét QR MoMo:</strong><br>
        1. Mở app <strong>MoMo</strong> → Bấm biểu tượng <em>QR / Quét mã</em> ở màn hình chính<br>
        2. Quét mã QR màu tím trên màn hình<br>
        3. Kiểm tra số tiền & nội dung → <strong>Xác nhận chuyển</strong><br>
        4. Quay lại đây bấm <em>"Tôi đã thanh toán"</em>
      </div>
    </div>`);

  document.getElementById("payCountdownWrap").style.display = "flex";
  startPayCountdown(10 * 60); // 10 phút
}

/* ── Xử lý khi QR lỗi ── */
function handleQrError(imgId, type) {
  const img = document.getElementById(imgId);
  if (!img) return;
  img.style.display = "none";

  const note = document.getElementById(type === "bank" ? "qrLoadingNote" : "momoLoadingNote");
  if (note) {
    note.innerHTML = `<div style="color:var(--warning);font-size:12.5px;padding:12px;">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Không tải được mã QR. Vui lòng chuyển khoản thủ công theo thông tin bên dưới.
    </div>`;
  }
}

/* ── Countdown timer ── */
let _payCountdownTimer = null;

function startPayCountdown(seconds) {
  clearPayCountdown();
  if (!seconds) return;
  let remaining = seconds;
  const el = document.getElementById("payCountdown");
  const update = () => {
    if (!el) return;
    const m = String(Math.floor(remaining / 60)).padStart(2, "0");
    const s = String(remaining % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
    if (remaining <= 60) el.style.color = "var(--danger)";
    if (remaining <= 0) {
      clearPayCountdown();
      el.textContent = "Hết hạn";
      showFormMsg("payMsg", "Mã QR đã hết hạn. Vui lòng chọn lại phương thức để tạo mã mới.", true);
      document.getElementById("paySubmitBtn").disabled = true;
    }
    remaining--;
  };
  update();
  _payCountdownTimer = setInterval(update, 1000);
}

function clearPayCountdown() {
  if (_payCountdownTimer) { clearInterval(_payCountdownTimer); _payCountdownTimer = null; }
  const btn = document.getElementById("paySubmitBtn");
  if (btn) btn.disabled = false;
}

/* ── Copy text helper ── */
function copyText(elId) {
  const el  = document.getElementById(elId);
  if (!el) return;
  const txt = el.textContent.trim();
  navigator.clipboard.writeText(txt).then(() => {
    showToast(`Đã sao chép: ${txt}`, "success", 2000);
  }).catch(() => {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(`Đã sao chép!`, "success", 2000);
  });
}
function closePayModal() {
  clearPayCountdown();
  closeModal("modalPay");
  payingInvoice = null;
}
function selectPayMethod() {}
async function submitPayment() {
  if (!payingInvoice) return;
  if (!selectedPayMethod) {
    showFormMsg("payMsg", "Vui lòng chọn phương thức thanh toán", true);
    return;
  }

  const btn  = document.getElementById("paySubmitBtn");
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang ghi nhận...';
  hideFormMsg("payMsg");

  try {
    const res  = await fetch(`${API_ME}/invoices/${payingInvoice.id}/pay`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify({ method: selectedPayMethod }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showFormMsg("payMsg", data.message || "Không thể ghi nhận thanh toán. Vui lòng thử lại.", true);
      btn.disabled = false; btn.innerHTML = orig;
      return;
    }

    clearPayCountdown();
    showToast(`✅ Ghi nhận thanh toán ${fmtCurrency(payingInvoice.total_amount)} thành công!`, "success", 5000);
    closeModal("modalPay");
    btn.disabled = false; btn.innerHTML = orig;
    payingInvoice = null;

    await loadMyPayments();

  } catch (err) {
    showFormMsg("payMsg", "Lỗi kết nối: " + err.message, true);
    btn.disabled = false; btn.innerHTML = orig;
  }
}