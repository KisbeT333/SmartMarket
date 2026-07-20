/* ══════════════════════════════════════════════════
    SmartMarket Admin — admin.js v2.0
    Đồng bộ 100% với tất cả 19 routes backend
  ══════════════════════════════════════════════════ */

  const API = "http://localhost:3000/api";
  const BASE_URL = "http://localhost:3000";

  // Ghép URL ảnh đầy đủ từ path lưu trong DB (/uploads/products/xxx.jpg)
  function imgUrl(url) {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  // ══════════════════════════════════
  // STATE / CACHE
  // ══════════════════════════════════
  let marketCache   = [];
  let zoneCache     = [];
  let stallCache    = [];
  let traderCache   = [];
  let contractCache = [];
  let productCache  = [];
  let orderCache    = [];
  let invoiceCache  = [];
  let paymentCache  = [];
  let userCache     = [];
  let stallReqCache = [];
  let renewalCache  = [];
  let feedbackCache = [];

  // Pagination state
  const pages = {};
  const PAGE_SIZE = 12;

  // Delete state
  const delState = { id: null, label: "", endpoint: "", onSuccess: null };

  // Review state
  let currentSrId = null;
  let currentRrId = null;
  let currentFbId = null;
  let userStatusTarget = null;
  let _allZones = [];

  // ══════════════════════════════════
  // AUTH
  // ══════════════════════════════════
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

  // Load thông tin admin từ token
  function loadAdminInfo() {
    const token = getToken();
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const el = document.getElementById("sidebarName");
      if (el) el.textContent = payload.full_name || payload.username || "Admin";
      const pName = document.getElementById("profileName");
      if (pName) pName.textContent = payload.full_name || payload.username || "Admin";
      const pUser = document.getElementById("profileUsername");
      if (pUser) pUser.textContent = payload.username || "—";
      const pRole = document.getElementById("profileRole");
      if (pRole) pRole.textContent = payload.role_name || "ADMIN";
    } catch {}
  }

  // ══════════════════════════════════
  // EXPORT (Excel / PDF)
  // ══════════════════════════════════
  // Trước đây dùng thẻ <a href="/api/export/..."> mở tab mới, nhưng request đó
  // KHÔNG gửi kèm header Authorization nên API (yêu cầu đăng nhập) trả về 401
  // và không tải được gì. Ở đây dùng fetch() kèm token, rồi tự tạo blob để tải file.
  async function exportFile(type, btnEl) {
    const isExcel = type === "excel";
    const url = `${API}/export/${type}`;
    const originalHtml = btnEl ? btnEl.innerHTML : "";
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
    }
    try {
      const res = await fetch(url, { headers: { ...authHeader() } });
      if (!res.ok) {
        let msg = `Lỗi ${res.status}`;
        try {
          const data = await res.json();
          if (data?.message) msg = data.message;
        } catch {}
        if (res.status === 401) msg = "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
        throw new Error(msg);
      }
      const blob = await res.blob();

      // Lấy tên file từ header Content-Disposition nếu server có trả về
      let filename = `bao-cao-smartmarket.${isExcel ? "xlsx" : "pdf"}`;
      const cd = res.headers.get("Content-Disposition") || res.headers.get("content-disposition");
      const match = cd && cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
      if (match?.[1]) filename = decodeURIComponent(match[1]);

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast(`Xuất ${isExcel ? "Excel" : "PDF"} thành công!`, "success");
    } catch (err) {
      showToast(`Xuất ${isExcel ? "Excel" : "PDF"} thất bại: ${err.message}`, "error");
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = originalHtml;
      }
    }
  }

  // ══════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════
  const PAGE_TITLES = {
    dashboard: "Dashboard", markets: "Quản lý Chợ", stalls: "Sạp / Gian hàng",
    traders: "Tiểu thương", contracts: "Hợp đồng",
    "stall-requests": "Yêu cầu thuê sạp", "renewal-requests": "Yêu cầu gia hạn",
    "stall-feedback": "Phản ánh của sạp",
    products: "Sản phẩm", orders: "Đơn hàng",
    invoices: "Hóa đơn phí", payments: "Thanh toán",
    users: "Người dùng", reports: "Báo cáo", profile: "Hồ sơ",
  };

  let currentPage = "dashboard";

  function goPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.getElementById(`page-${page}`)?.classList.add("active");
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add("active");
    const t = document.getElementById("headerTitle");
    if (t) t.textContent = PAGE_TITLES[page] || page;
    currentPage = page;

    const loaders = {
      dashboard: loadDashboard,
      markets:   () => { loadMarkets(); loadZones(); },
      stalls:    loadStalls,
      traders:   loadTraders,
      contracts: loadContracts,
      "stall-requests":   loadStallRequests,
      "renewal-requests": loadRenewalRequests,
      "stall-feedback":   loadStallFeedback,
      products:  loadProducts,
      orders:    loadOrders,
      invoices:  loadInvoices,
      payments:  loadPayments,
      users:     loadUsers,
      reports:   loadReports,
      profile:   loadAdminInfo,
    };
    if (loaders[page]) loaders[page]();
    if (window.innerWidth <= 720) document.getElementById("sidebar")?.classList.remove("open");
  }

  function refreshCurrentPage() { goPage(currentPage); }
  function toggleSidebar() { document.getElementById("sidebar")?.classList.toggle("open"); }

  // ══════════════════════════════════
  // MODAL
  // ══════════════════════════════════
  function openModal(id) { document.getElementById(id)?.classList.add("open"); }
  function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
  function closeModalOverlay(e, id) { if (e.target.id === id) closeModal(id); }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(el => el.classList.remove("open"));
  });

  // ══════════════════════════════════
  // TOAST
  // ══════════════════════════════════
  const TOAST_ICONS = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", warning: "fa-triangle-exclamation" };
  function showToast(msg, type = "info", duration = 3500) {
    const c = document.getElementById("toastContainer");
    if (!c) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type]} toast-icon"></i><div class="toast-body">${msg}</div><button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>`;
    c.appendChild(el);
    setTimeout(() => dismissToast(el), duration);
  }
  function dismissToast(el) {
    if (!el?.parentElement) return;
    el.classList.add("leaving");
    setTimeout(() => el?.remove(), 210);
  }

  // ══════════════════════════════════
  // FORM MESSAGE
  // ══════════════════════════════════
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

  // ══════════════════════════════════
  // HELPERS
  // ══════════════════════════════════
  function fmtCurrency(v) { return (v == null || v === "") ? "—" : Number(v).toLocaleString("vi-VN") + " đ"; }
  function fmtDate(v) { return v ? new Date(v).toLocaleDateString("vi-VN") : "—"; }
  function emptyRow(cols, msg = "Chưa có dữ liệu") {
    return `<tr><td colspan="${cols}"><div class="empty-state"><i class="fa-solid fa-inbox"></i><div class="empty-title">${msg}</div></div></td></tr>`;
  }
  function loadRow(cols) {
    return `<tr><td colspan="${cols}"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><span class="empty-sub">Đang tải...</span></div></td></tr>`;
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

  // ── Image upload helper ──────────────────────────────────────
  // Đọc file ảnh được chọn, upload lên API /api/upload-image
  // và trả về URL ảnh đã lưu. Nếu backend chưa hỗ trợ endpoint
  // này thì fallback sang object-URL tạm (chỉ dùng trong session).
  async function uploadImageGeneric(inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return null;

    // Kiểm tra loại & kích thước (tối đa 5 MB)
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      showToast("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF", "warning");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Ảnh không được vượt quá 5 MB", "warning");
      return null;
    }

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API}/upload-image`, {
        method: "POST",
        headers: authHeader(),    // không đặt Content-Type; browser tự gán multipart
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        // Backend trả về { success: true, url: "https://..." }
        if (data.success && data.url) return data.url;
      }
    } catch { /* endpoint chưa có — dùng object URL tạm */ }

    // Fallback: dùng object URL (chỉ hiển thị trong tab hiện tại)
    return URL.createObjectURL(file);
  }
  async function uploadProductImage(inputEl) { return uploadImageGeneric(inputEl); }

  // Hiển thị preview ảnh ngay khi người dùng chọn file
  function previewProductImage(inputEl, previewId, placeholderId, uploadAreaId = "prUploadArea", removeBtnId = "prRemoveImgBtn") {
    const file = inputEl?.files?.[0];
    const prev = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);
    const uploadArea = document.getElementById(uploadAreaId);
    const removeBtn = document.getElementById(removeBtnId);
    if (!prev) return;
    if (file) {
      prev.src = URL.createObjectURL(file);
      prev.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
      if (uploadArea) uploadArea.classList.add("has-image");
      if (removeBtn) removeBtn.style.display = "inline-flex";
    } else {
      prev.src = "";
      prev.style.display = "none";
      if (placeholder) placeholder.style.display = "flex";
      if (uploadArea) uploadArea.classList.remove("has-image");
      if (removeBtn) removeBtn.style.display = "none";
    }
  }

  // Xóa ảnh đang chọn / ảnh hiện tại
  function removeProductImage() {
    const imgInp = document.getElementById("prImageFile");
    const imgUrlInp = document.getElementById("prImageUrl");
    const prev = document.getElementById("prImagePreview");
    const placeholder = document.getElementById("prUploadPlaceholder");
    const uploadArea = document.getElementById("prUploadArea");
    const removeBtn = document.getElementById("prRemoveImgBtn");
    if (imgInp) imgInp.value = "";
    if (imgUrlInp) imgUrlInp.value = "";
    if (prev) { prev.src = ""; prev.style.display = "none"; }
    if (placeholder) placeholder.style.display = "flex";
    if (uploadArea) uploadArea.classList.remove("has-image");
    if (removeBtn) removeBtn.style.display = "none";
  }

  // Xóa ảnh chợ đang chọn / ảnh hiện tại
  function removeMarketImage() {
    const imgInp = document.getElementById("mImageFile");
    const imgUrlInp = document.getElementById("mImageUrl");
    const prev = document.getElementById("mImagePreview");
    const placeholder = document.getElementById("mUploadPlaceholder");
    const uploadArea = document.getElementById("mUploadArea");
    const removeBtn = document.getElementById("mRemoveImgBtn");
    if (imgInp) imgInp.value = "";
    if (imgUrlInp) imgUrlInp.value = "";
    if (prev) { prev.src = ""; prev.style.display = "none"; }
    if (placeholder) placeholder.style.display = "flex";
    if (uploadArea) uploadArea.classList.remove("has-image");
    if (removeBtn) removeBtn.style.display = "none";
  }

  // ══════════════════════════════════
  // PAGINATION
  // ══════════════════════════════════
  function paginate(items, key, size = PAGE_SIZE) {
    if (!pages[key]) pages[key] = 1;
    const total = Math.max(1, Math.ceil(items.length / size));
    const cur = Math.min(Math.max(1, pages[key]), total);
    pages[key] = cur;
    return { items: items.slice((cur - 1) * size, cur * size), total, cur };
  }
  function renderPag(containerId, cur, total, count, fnName) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (total <= 1) { el.innerHTML = `<span>${count} mục</span>`; return; }
    let btns = "";
    for (let i = 1; i <= total; i++) {
      const edge = i === 1 || i === total, near = Math.abs(i - cur) <= 1;
      if (edge || near) btns += `<button class="btn btn-outline btn-sm pg-page-btn ${i === cur ? "active" : ""}" onclick="${fnName}(${i})">${i}</button>`;
      else if (i === 2 || i === total - 1) btns += `<span style="padding:0 4px;color:var(--text3)">…</span>`;
    }
    el.innerHTML = `<span>${count} mục · Trang ${cur}/${total}</span><div class="pg-controls">
      <button class="btn btn-outline btn-sm" ${cur<=1?"disabled":""} onclick="${fnName}(${cur-1})">← Trước</button>
      ${btns}
      <button class="btn btn-outline btn-sm" ${cur>=total?"disabled":""} onclick="${fnName}(${cur+1})">Tiếp →</button>
    </div>`;
  }
  function setPage(key, p, renderFn) { pages[key] = p; renderFn(); }

  // ══════════════════════════════════
  // DELETE CHUNG
  // ══════════════════════════════════
  function openDeleteModal({ id, name, label, endpoint, onSuccess, note }) {
    delState.id = id; delState.label = label; delState.endpoint = endpoint; delState.onSuccess = onSuccess;
    document.getElementById("delTitle").textContent = `Xóa ${label}`;
    document.getElementById("delName").textContent = name || `#${id}`;
    document.getElementById("delLabel").textContent = label;
    const noteEl = document.getElementById("delNote");
    if (note) { noteEl.textContent = "⚠ " + note; noteEl.style.display = "block"; }
    else noteEl.style.display = "none";
    hideFormMsg("delMsg");
    openModal("modalDelete");
  }
  async function confirmDelete() {
    if (delState.id == null) return;
    const btn = document.getElementById("delConfirmBtn");
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
    try {
      const res = await fetch(`${delState.endpoint}/${delState.id}`, { method: "DELETE", headers: authHeader() });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showFormMsg("delMsg", data.message || "Không thể xóa", true);
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
        return;
      }
      showToast(`Đã xóa ${delState.label} thành công`, "success");
      if (delState.onSuccess) delState.onSuccess();
      setTimeout(() => { closeModal("modalDelete"); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa'; }, 400);
    } catch (err) {
      showFormMsg("delMsg", "Lỗi kết nối: " + err.message, true);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa';
    }
  }

  // ══════════════════════════════════
  // SUBMIT FORM HELPER
  // ══════════════════════════════════
  async function submitForm({ url, method, payload, msgId, btnId, successMsg, onSuccess }) {
    const msg = document.getElementById(msgId);
    const btn = document.getElementById(btnId);
    const orig = btn?.innerHTML || "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
    hideFormMsg(msg);
    try {
      const res = await fetch(url, {
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

  // ══════════════════════════════════
  // DASHBOARD — GET /api/dashboard
  // ══════════════════════════════════
  async function loadDashboard() {
    try {
      const [dashRes, prodRes] = await Promise.all([
        fetch(`${API}/dashboard`),
        fetch(`${API}/products`),
      ]);
      const d = (await dashRes.json()).dashboard;
      const prods = (await prodRes.json()).data || [];

      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "—"; };
      set("d-users", d.users);
      set("d-traders", d.traders);
      set("d-products", d.products);
      set("d-orders", d.orders);
      set("d-markets", d.markets);
      set("d-stalls", d.stalls?.total ?? d.stalls);
      set("d-contracts", d.contracts?.total ?? d.contracts);
      set("d-revenue", d.revenue != null ? fmtCurrency(d.revenue) : "—");

      const cSub = document.getElementById("d-contracts-sub");
      if (cSub && d.contracts?.active != null) cSub.innerHTML = `<i class="fa-solid fa-circle-info"></i> Còn hiệu lực: ${d.contracts.active}`;

      // Mini donut: tỉ lệ sạp đang thuê / trống / bảo trì
      if (d.stalls?.total != null) {
        renderStallsMiniDonut(d.stalls.rented || 0, d.stalls.empty || 0, d.stalls.maintenance || 0);
      }

      // Dashboard product table
      const rows = prods.slice(0, 8).map(p => `
        <tr><td>${p.id}</td><td><strong>${p.name}</strong></td><td>${fmtCurrency(p.price)}</td><td>${p.business_name || "—"}</td><td>${p.market_name || "—"}</td></tr>
      `).join("") || emptyRow(5, "Chưa có sản phẩm");
      document.getElementById("d-productTable").innerHTML = rows;

      // Biểu đồ doanh thu theo tháng + sparkline mini trong thẻ Doanh thu
      loadRevenueChart();
      // Biểu đồ top sản phẩm bán chạy
      loadTopProductsChart();

      // Load pending counts for badges
      loadPendingCounts();
      checkAndNotifyOverdueContracts();
    } catch (err) {
      showToast("Lỗi tải dashboard: " + err.message, "error");
    }
  }

  /** Donut mini tỉ lệ sạp đang thuê/trống/bảo trì trong thẻ "Tổng sạp" (dùng conic-gradient) */
  // SỬA: trước đây total = rented + empty, không tính sạp 'maintenance' (vì lúc đó
  // backend gộp maintenance vào empty). Từ khi backend tách riêng maintenance,
  // nếu không cộng vào đây thì % trên vòng donut sẽ bị tính sai (mẫu số hụt mất
  // phần sạp bảo trì) — không lỗi JS nhưng hiển thị sai tỉ lệ.
  function renderStallsMiniDonut(rented, empty, maintenance = 0) {
    const ring = document.getElementById("d-stallsDonut");
    const rentedEl = document.getElementById("d-stalls-rented");
    const emptyEl = document.getElementById("d-stalls-empty");
    const maintenanceEl = document.getElementById("d-stalls-maintenance");
    if (rentedEl) rentedEl.textContent = rented;
    if (emptyEl) emptyEl.textContent = empty;
    if (maintenanceEl) maintenanceEl.textContent = maintenance;
    if (!ring) return;
    const total = rented + empty + maintenance;
    const pctRented = total > 0 ? (rented / total) * 100 : 0;
    const pctEmpty = total > 0 ? (empty / total) * 100 : 0;
    ring.style.background = total > 0
      ? `conic-gradient(var(--primary) 0% ${pctRented}%, var(--info) ${pctRented}% ${pctRented + pctEmpty}%, var(--accent) ${pctRented + pctEmpty}% 100%)`
      : `var(--border)`;
  }

  /** Vẽ sparkline SVG nhỏ (mini area chart) từ 1 mảng số */
  function drawSparkline(svgId, values, color) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    if (!values.length) { svg.innerHTML = ""; return; }
    const w = 200, h = 34, pad = 2;
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const range = (max - min) || 1;
    const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    const pts = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const line = pts.map(p => p.join(",")).join(" ");
    const areaPath = `M${pts[0][0]},${h} ` + pts.map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length - 1][0]},${h} Z`;
    svg.innerHTML = `
      <path class="sp-area" d="${areaPath}" fill="${color}"></path>
      <polyline class="sp-line" points="${line}" stroke="${color}"></polyline>
    `;
  }

  /** GET /api/dashboard/revenue → biểu đồ đường lớn + sparkline mini trong thẻ Doanh thu */
  async function loadRevenueChart() {
    const box = document.getElementById("d-revenueChart");
    if (!box) return;
    try {
      const res = await fetch(`${API}/dashboard/revenue`);
      const json = await res.json();
      const data = (json.data || []).slice(-12); // 12 tháng gần nhất
      if (!data.length) {
        box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-chart-line"></i><div class="empty-title">Chưa có dữ liệu doanh thu</div></div>`;
        return;
      }
      const values = data.map(r => Number(r.revenue) || 0);
      drawSparkline("d-revenueSpark", values, "var(--primary)");
      box.innerHTML = buildRevenueAreaChart(data, values);
    } catch (err) {
      box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div class="empty-title">Không tải được biểu đồ doanh thu</div></div>`;
    }
  }

  function buildRevenueAreaChart(data, values) {
    const w = 640, h = 220, padL = 8, padR = 8, padT = 16, padB = 26;
    const max = Math.max(...values, 1);
    const stepX = values.length > 1 ? (w - padL - padR) / (values.length - 1) : 0;
    const yFor = v => padT + (h - padT - padB) * (1 - v / max);
    const pts = values.map((v, i) => [padL + i * stepX, yFor(v)]);
    const line = pts.map(p => p.join(",")).join(" ");
    const areaPath = `M${pts[0][0]},${h - padB} ` + pts.map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[pts.length - 1][0]},${h - padB} Z`;
    const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
      const y = padT + (h - padT - padB) * (1 - f);
      return `<line class="rc-grid" x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}"></line>`;
    }).join("");
    // Nhãn tháng: chỉ hiện 1 số mốc để tránh dày đặc (đầu, giữa, cuối)
    const labelIdx = new Set([0, Math.floor((values.length - 1) / 2), values.length - 1]);
    const labels = data.map((r, i) => {
      if (!labelIdx.has(i)) return "";
      const [y, m] = String(r.month).split("-");
      return `<text class="rc-axis-label" x="${pts[i][0]}" y="${h - 6}" text-anchor="middle">${m}/${y}</text>`;
    }).join("");
    const dots = pts.map((p, i) => `<circle class="rc-dot" cx="${p[0]}" cy="${p[1]}" r="3"><title>${fmtCurrency(values[i])}</title></circle>`).join("");
    return `
      <svg class="revenue-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rcGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"></stop>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        <path class="rc-area" d="${areaPath}"></path>
        <polyline class="rc-line" points="${line}"></polyline>
        ${dots}
        ${labels}
      </svg>
    `;
  }

  /** GET /api/dashboard/top-products → biểu đồ cột ngang (dạng "Project Status") */
  async function loadTopProductsChart() {
    const box = document.getElementById("d-topProductsChart");
    if (!box) return;
    try {
      const res = await fetch(`${API}/dashboard/top-products`);
      const json = await res.json();
      const data = (json.data || []).slice(0, 6);
      if (!data.length) {
        box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box"></i><div class="empty-title">Chưa có dữ liệu bán hàng</div></div>`;
        return;
      }
      const max = Math.max(...data.map(p => Number(p.sold) || 0), 1);
      box.innerHTML = `<div class="bar-chart">` + data.map((p, i) => {
        const sold = Number(p.sold) || 0;
        const pct = Math.max((sold / max) * 100, 6);
        return `
          <div class="bar-row tp-row">
            <div class="bar-rank">${i + 1}</div>
            <div class="bar-label" title="${p.name}">${p.name}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
            <div class="bar-val">${sold}</div>
          </div>
        `;
      }).join("") + `</div>`;
    } catch (err) {
      box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div class="empty-title">Không tải được top sản phẩm</div></div>`;
    }
  }

  /** Kiểm tra hợp đồng trễ hạn và hiển thị cảnh báo trên dashboard */
  async function checkAndNotifyOverdueContracts() {
    try {
      if (!contractCache.length) {
        const res = await fetch(`${API}/contracts`);
        contractCache = ((await res.json()).data || []).map(c => ({ ...c, _overdueCount: countOverdueInstallments(c) }));
      }
      const overdue = contractCache.filter(c => c._overdueCount > 0 && c.status === "active");
      const alertEl = document.getElementById("dashAlerts");
      if (!alertEl) return;
      if (overdue.length) {
        const totalOverdue = overdue.reduce((s, c) => s + c._overdueCount, 0);
        alertEl.insertAdjacentHTML("beforeend", `<div class="alert-box warn"><i class="fa-solid fa-triangle-exclamation"></i><span>Có <strong>${overdue.length}</strong> hợp đồng với tổng <strong>${totalOverdue}</strong> kỳ thanh toán quá hạn. <a href="#" onclick="goPage('contracts');return false;" style="color:var(--warning);font-weight:600;">Xem ngay →</a></span></div>`);
      }
    } catch {}
  }

  async function loadPendingCounts() {
    try {
      const [srRes, rrRes, fbRes] = await Promise.all([
        fetch(`${API}/stall-requests?status=PENDING`, { headers: authHeader() }),
        fetch(`${API}/renewal-requests?status=PENDING`, { headers: authHeader() }),
        fetch(`${API}/stall-feedback?status=PENDING`, { headers: authHeader() }),
      ]);
      const srData = srRes.ok ? await srRes.json() : { data: [] };
      const rrData = rrRes.ok ? await rrRes.json() : { data: [] };
      const fbData = fbRes.ok ? await fbRes.json() : { data: [] };
      const srCount = (srData.data || []).length;
      const rrCount = (rrData.data || []).length;
      const fbCount = (fbData.data || []).length;

      const srBadge = document.getElementById("navStallReqBadge");
      if (srBadge) { srBadge.textContent = srCount; srBadge.style.display = srCount ? "" : "none"; }
      const rrBadge = document.getElementById("navRenewalBadge");
      if (rrBadge) { rrBadge.textContent = rrCount; rrBadge.style.display = rrCount ? "" : "none"; }
      const fbBadge = document.getElementById("navFeedbackBadge");
      if (fbBadge) { fbBadge.textContent = fbCount; fbBadge.style.display = fbCount ? "" : "none"; }

      // Dashboard alerts
      const alerts = [];
      if (srCount > 0) alerts.push(`<div class="alert-box warn"><i class="fa-solid fa-door-open"></i><span>Có <strong>${srCount}</strong> yêu cầu thuê sạp đang chờ duyệt. <a href="#" onclick="goPage('stall-requests');return false;" style="color:var(--warning);font-weight:600;">Xem ngay →</a></span></div>`);
      if (rrCount > 0) alerts.push(`<div class="alert-box warn"><i class="fa-solid fa-rotate"></i><span>Có <strong>${rrCount}</strong> yêu cầu gia hạn hợp đồng đang chờ duyệt. <a href="#" onclick="goPage('renewal-requests');return false;" style="color:var(--warning);font-weight:600;">Xem ngay →</a></span></div>`);
      if (fbCount > 0) alerts.push(`<div class="alert-box warn"><i class="fa-solid fa-triangle-exclamation"></i><span>Có <strong>${fbCount}</strong> phản ánh của sạp đang chờ xử lý. <a href="#" onclick="goPage('stall-feedback');return false;" style="color:var(--warning);font-weight:600;">Xem ngay →</a></span></div>`);
      const alertEl = document.getElementById("dashAlerts");
      if (alertEl) alertEl.innerHTML = alerts.join("");
    } catch {}
  }

  // ══════════════════════════════════
  // MARKETS — /api/markets
  // ══════════════════════════════════
  async function loadMarkets() {
    document.getElementById("marketGrid").innerHTML = '<div class="tc">Đang tải...</div>';
    try {
      const res = await fetch(`${API}/markets`);
      marketCache = (await res.json()).data || [];
      document.getElementById("marketGrid").innerHTML = marketCache.map(m => `
        <div class="market-card">
          <div class="mc-top">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              ${m.image_url
                ? `<img src="${imgUrl(m.image_url)}" alt="${m.name}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';">`
                : `<div style="width:48px;height:48px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-shop" style="color:var(--text3);"></i></div>`}
              <div><div class="mc-name">${m.name}</div><div class="mc-loc"><i class="fa-solid fa-location-dot"></i> ${m.address || ""}${m.city ? ", " + m.city : ""}</div></div>
            </div>
            <span class="badge badge-green">Hoạt động</span>
          </div>
          <div class="mc-stats">
            <div class="mc-stat"><div class="n">${m.total_zones ?? "—"}</div><div class="l">Khu</div></div>
            <div class="mc-stat"><div class="n">${m.total_stalls ?? "—"}</div><div class="l">Sạp</div></div>
            <div class="mc-stat"><div class="n">${m.total_traders ?? "—"}</div><div class="l">Tiểu thương</div></div>
          </div>
          <div class="mc-manager"><i class="fa-solid fa-user-tie"></i> Quản lý: <strong>${m.manager_name || "Chưa phân công"}</strong></div>
          <div class="mc-actions">
            <button class="btn btn-outline btn-sm" onclick="openEditMarketModal(${m.id})"><i class="fa-solid fa-pen"></i> Sửa</button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteMarket(${m.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
          </div>
        </div>
      `).join("") || '<div class="empty-state"><i class="fa-solid fa-shop"></i><div class="empty-title">Chưa có chợ nào</div></div>';
    } catch (err) { showToast("Lỗi tải chợ: " + err.message, "error"); }
  }

  async function openAddMarketModal() {
    hideFormMsg("marketFormMsg");
    document.getElementById("formMarket").reset();
    document.getElementById("mId").value = "";
    document.getElementById("marketModalTitle").textContent = "Thêm chợ mới";
    document.getElementById("marketSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu chợ';
    removeMarketImage();
    await _loadManagerOptions();
    openModal("modalMarket");
  }
  async function openEditMarketModal(id) {
    const m = marketCache.find(x => String(x.id) === String(id)); if (!m) return;
    hideFormMsg("marketFormMsg");
    document.getElementById("marketModalTitle").textContent = "Sửa thông tin chợ";
    document.getElementById("marketSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
    document.getElementById("mId").value = m.id;
    document.getElementById("mName").value = m.name || "";
    document.getElementById("mAddress").value = m.address || "";
    document.getElementById("mCity").value = m.city || "";
    removeMarketImage();
    if (m.image_url) {
      document.getElementById("mImageUrl").value = m.image_url;
      const prev = document.getElementById("mImagePreview");
      const placeholder = document.getElementById("mUploadPlaceholder");
      const uploadArea = document.getElementById("mUploadArea");
      const removeBtn = document.getElementById("mRemoveImgBtn");
      if (prev) { prev.src = imgUrl(m.image_url); prev.style.display = "block"; }
      if (placeholder) placeholder.style.display = "none";
      if (uploadArea) uploadArea.classList.add("has-image");
      if (removeBtn) removeBtn.style.display = "inline-flex";
    }
    await _loadManagerOptions();
    document.getElementById("mManagerId").value = m.manager_id || "";
    openModal("modalMarket");
  }
  async function _loadManagerOptions() {
    try {
      const res = await fetch(`${API}/users`, { headers: authHeader() });
      const data = await res.json();
      fillSelect(document.getElementById("mManagerId"), data.users || data.data || [], "id", u => `${u.full_name || u.username} (${u.username})`, "— Chưa phân công —");
    } catch {}
  }
  async function submitMarket(e) {
    e.preventDefault();
    const id = document.getElementById("mId").value, isEdit = !!id;
    const name = document.getElementById("mName").value.trim();
    if (!name) { showFormMsg("marketFormMsg", "Vui lòng nhập tên chợ", true); return; }

    const btn = document.getElementById("marketSubmitBtn");
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
    hideFormMsg("marketFormMsg");

    try {
      // Dùng FormData để gửi cả text lẫn file ảnh trong 1 request — giống submitProduct
      const fd = new FormData();
      fd.append("name", name);
      fd.append("address", document.getElementById("mAddress").value.trim() || "");
      fd.append("city", document.getElementById("mCity").value.trim() || "");
      fd.append("manager_id", document.getElementById("mManagerId").value || "");

      // Ảnh: nếu có file mới → gửi file; nếu không → gửi lại URL cũ để backend giữ nguyên
      const imgFileInp = document.getElementById("mImageFile");
      const imgUrlOld  = document.getElementById("mImageUrl")?.value || "";
      if (imgFileInp?.files?.length) {
        fd.append("image", imgFileInp.files[0]);
      } else if (imgUrlOld) {
        fd.append("image_url", imgUrlOld);
      }
      // Nếu cả 2 đều trống → backend tự set NULL (xóa ảnh)

      const res = await fetch(isEdit ? `${API}/markets/${id}` : `${API}/markets`, {
        method: isEdit ? "PUT" : "POST",
        headers: authHeader(),   // KHÔNG đặt Content-Type — browser tự gán multipart boundary
        body: fd,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showFormMsg("marketFormMsg", data.message || "Không thể lưu", true);
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        return;
      }

      const msg = isEdit ? "Cập nhật chợ thành công!" : "Thêm chợ thành công!";
      showFormMsg("marketFormMsg", msg, false);
      showToast(msg, "success");
      setTimeout(() => { loadMarkets(); loadDashboard(); closeModal("modalMarket"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 600);

    } catch (err) {
      showFormMsg("marketFormMsg", "Lỗi kết nối: " + err.message, true);
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }
  function openDeleteMarket(id) {
    const m = marketCache.find(x => String(x.id) === String(id));
    openDeleteModal({ id, name: m?.name, label: "chợ", endpoint: `${API}/markets`, onSuccess: () => { loadMarkets(); loadDashboard(); } });
  }

  // ══════════════════════════════════
  // ZONES — /api/zones
  // ══════════════════════════════════
  async function loadZones() {
    document.getElementById("zoneTable").innerHTML = loadRow(4);
    try {
      const res = await fetch(`${API}/zones`);
      zoneCache = _allZones = (await res.json()).data || [];
      const rows = zoneCache.map(z => `
        <tr><td><span class="badge badge-gray">${z.code || "—"}</span></td><td><strong>${z.name}</strong></td><td>${z.market_name || "—"}</td>
        <td><button class="btn btn-danger btn-sm" onclick="openDeleteZone(${z.id})"><i class="fa-solid fa-trash"></i> Xóa</button></td></tr>
      `).join("") || emptyRow(4, "Chưa có khu nào");
      document.getElementById("zoneTable").innerHTML = rows;
    } catch (err) { document.getElementById("zoneTable").innerHTML = emptyRow(4, "Lỗi tải dữ liệu"); }
  }
  async function openAddZoneModal() {
    hideFormMsg("zoneFormMsg");
    document.getElementById("formZone").reset();
    fillSelect(document.getElementById("zMarketId"), marketCache.length ? marketCache : (await (await fetch(`${API}/markets`)).json()).data || [], "id", m => m.name, "— Chọn chợ —");
    openModal("modalZone");
  }
  async function submitZone(e) {
    e.preventDefault();
    const payload = { market_id: document.getElementById("zMarketId").value, code: document.getElementById("zCode").value.trim() || null, name: document.getElementById("zName").value.trim() };
    if (!payload.market_id || !payload.name) { showFormMsg("zoneFormMsg", "Vui lòng chọn chợ và nhập tên khu", true); return; }
    const btn = e.submitter;
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      const res = await fetch(`${API}/zones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("zoneFormMsg", data.message || "Lỗi", true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }
      showToast("Thêm khu thành công!", "success");
      loadZones(); loadMarkets();
      setTimeout(() => { closeModal("modalZone"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 500);
    } catch (err) { showFormMsg("zoneFormMsg", "Lỗi kết nối: " + err.message, true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
  }
  function openDeleteZone(id) {
    const z = zoneCache.find(x => String(x.id) === String(id));
    openDeleteModal({ id, name: z ? `${z.name} (${z.market_name})` : null, label: "khu", endpoint: `${API}/zones`, onSuccess: () => { loadZones(); loadMarkets(); } });
  }
  function filterZonesByMarket(marketSelId, zoneSelId) {
    const mId = document.getElementById(marketSelId)?.value;
    const filtered = mId ? _allZones.filter(z => String(z.market_id) === String(mId)) : _allZones;
    fillSelect(document.getElementById(zoneSelId), filtered, "id", z => z.name, "— Chọn khu —");
  }

  // ══════════════════════════════════
  // STALLS — /api/stalls
  // ══════════════════════════════════
  async function loadStalls() {
    document.getElementById("stallGrid").innerHTML = '<div class="tc">Đang tải...</div>';
    try {
      const [sRes, zRes] = await Promise.all([fetch(`${API}/stalls`), fetch(`${API}/zones`)]);
      stallCache = (await sRes.json()).data || [];
      _allZones = (await zRes.json()).data || [];
      // Cần dữ liệu hợp đồng để biết ai đang thuê từng sạp
      await _ensureContractsLoaded();
      const mkt = [...new Set(stallCache.map(s => s.market_name).filter(Boolean))];
      const sel = document.getElementById("sFilterMarket");
      const prev = sel.value;
      sel.innerHTML = '<option value="">Tất cả chợ</option>';
      mkt.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.value = prev;
      pages["stalls"] = 1;
      renderStalls();
    } catch (err) { showToast("Lỗi tải sạp: " + err.message, "error"); }
  }

  /** Nạp contractCache nếu chưa có, không đụng UI trang Hợp đồng (an toàn khi gọi từ trang Sạp) */
  async function _ensureContractsLoaded() {
    if (contractCache.length) return;
    try {
      const res = await fetch(`${API}/contracts`);
      const data = (await res.json()).data || [];
      contractCache = data.map(c => ({ ...c, _overdueCount: countOverdueInstallments(c) }));
    } catch { /* giữ nguyên contractCache rỗng nếu lỗi */ }
  }
  const STALL_META = { available: { label: "Trống", icon: "fa-square-dashed", badge: "blue" }, rented: { label: "Đang thuê", icon: "fa-store", badge: "green" }, maintenance: { label: "Bảo trì", icon: "fa-wrench", badge: "amber" } };
  function renderStalls() {
    const mkt = document.getElementById("sFilterMarket")?.value || "";
    const st  = document.getElementById("sFilterStatus")?.value || "";
    const kw  = (document.getElementById("sSearch")?.value || "").toLowerCase();
    const filtered = stallCache.filter(s => {
      if (mkt && s.market_name !== mkt) return false;
      if (st && s.status !== st) return false;
      if (kw && !(s.code || "").toLowerCase().includes(kw)) return false;
      return true;
    });
    const countEl = document.getElementById("sCount");
    if (countEl) countEl.textContent = `${filtered.length} / ${stallCache.length} sạp`;
    if (!filtered.length) { document.getElementById("stallGrid").innerHTML = '<div class="empty-state"><i class="fa-solid fa-border-all"></i><div class="empty-title">Không tìm thấy sạp</div></div>'; return; }
    document.getElementById("stallGrid").innerHTML = filtered.map(s => {
      const meta = STALL_META[s.status] || { label: s.status || "—", icon: "fa-circle-question", badge: "gray" };
      const activeContract = contractCache.find(c => String(c.stall_id) === String(s.id) && c.status === "active");
      const renterName = activeContract?.trader_name || activeContract?.business_name || "—";
      const initials = renterName.split(" ").filter(Boolean).slice(-2).map(w => w[0]).join("").toUpperCase() || "?";
      const renterInfo = activeContract
        ? `<div style="margin-top:8px;padding:8px 10px;background:var(--primary-pale,var(--bg));border-radius:8px;font-size:11.5px;display:flex;gap:8px;align-items:flex-start;">
             <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">${initials}</div>
             <div style="flex:1;min-width:0;">
               <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;font-weight:600;">Người thuê</div>
               <div style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${renterName}">${renterName}</div>
               <div style="color:var(--text2);margin-top:1px;">${activeContract.business_name ? `${activeContract.business_name} · ` : ""}HĐ #${activeContract.id}</div>
             </div>
             ${activeContract._overdueCount > 0 ? `<span class="badge badge-red" style="flex-shrink:0;font-size:10px;">${activeContract._overdueCount} trễ hạn</span>` : ""}
           </div>`
        : "";
      return `<div class="stall-card status-${s.status || ""}">
        <div class="sc-top"><div style="display:flex;gap:10px;align-items:flex-start;"><div class="sc-icon"><i class="fa-solid ${meta.icon}"></i></div><div><div class="sc-code">${s.code}</div><div class="sc-loc">${s.zone_name || "—"} · ${s.market_name || "—"}</div></div></div><span class="badge badge-${meta.badge}">${meta.label}</span></div>
        <div class="sc-info"><div class="sc-info-row"><span>Diện tích</span><span>${s.area_m2 != null ? s.area_m2 + " m²" : "—"}</span></div><div class="sc-info-row"><span>Tiền thuê</span><span class="rent">${s.monthly_rent ? fmtCurrency(s.monthly_rent) : "—"}</span></div></div>
        ${renterInfo}
        <div class="sc-actions"><button class="btn btn-outline btn-sm" onclick="openEditStallModal(${s.id})"><i class="fa-solid fa-pen"></i> Sửa</button><button class="btn btn-danger btn-sm" onclick="openDeleteStall(${s.id})"><i class="fa-solid fa-trash"></i> Xóa</button></div>
      </div>`;
    }).join("");
  }
  async function openAddStallModal() {
    hideFormMsg("stallFormMsg");
    document.getElementById("formStall").reset();
    document.getElementById("sId").value = "";
    document.getElementById("stallModalTitle").textContent = "Thêm sạp mới";
    document.getElementById("stallSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu sạp';
    await _loadMarketsZonesIntoStall();
    openModal("modalStall");
  }
  async function openEditStallModal(id) {
    const s = stallCache.find(x => String(x.id) === String(id)); if (!s) return;
    hideFormMsg("stallFormMsg");
    document.getElementById("stallModalTitle").textContent = "Sửa thông tin sạp";
    document.getElementById("stallSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
    document.getElementById("sId").value = s.id;
    await _loadMarketsZonesIntoStall();
    document.getElementById("sMarketId").value = s.market_id || "";
    filterZonesByMarket("sMarketId", "sZoneId");
    document.getElementById("sZoneId").value = s.zone_id || "";
    document.getElementById("sCode").value = s.code || "";
    document.getElementById("sArea").value = s.area_m2 || "";
    document.getElementById("sRent").value = s.monthly_rent || "";
    document.getElementById("sStatus").value = s.status || "available";
    openModal("modalStall");
  }
  async function _loadMarketsZonesIntoStall() {
    const markets = marketCache.length ? marketCache : (await (await fetch(`${API}/markets`)).json()).data || [];
    fillSelect(document.getElementById("sMarketId"), markets, "id", m => m.name, "— Chọn chợ —");
    fillSelect(document.getElementById("sZoneId"), _allZones, "id", z => `${z.name} (${z.market_name})`, "— Chọn khu —");
  }
  async function submitStall(e) {
    e.preventDefault();
    const id = document.getElementById("sId").value, isEdit = !!id;
    const payload = { market_id: document.getElementById("sMarketId").value, zone_id: document.getElementById("sZoneId").value, code: document.getElementById("sCode").value.trim(), area_m2: document.getElementById("sArea").value || null, monthly_rent: document.getElementById("sRent").value || null, status: document.getElementById("sStatus").value };
    if (!payload.market_id || !payload.zone_id || !payload.code) { showFormMsg("stallFormMsg", "Vui lòng chọn chợ, khu và nhập mã sạp", true); return; }
    await submitForm({ url: isEdit ? `${API}/stalls/${id}` : `${API}/stalls`, method: isEdit ? "PUT" : "POST", payload, msgId: "stallFormMsg", btnId: "stallSubmitBtn", successMsg: isEdit ? "Cập nhật sạp thành công!" : "Thêm sạp thành công!", onSuccess: () => { loadStalls(); loadDashboard(); closeModal("modalStall"); } });
  }
  function openDeleteStall(id) {
    const s = stallCache.find(x => String(x.id) === String(id));
    openDeleteModal({ id, name: s?.code, label: "sạp", endpoint: `${API}/stalls`, note: "Sạp phải không có hợp đồng hoặc sản phẩm liên kết.", onSuccess: () => { loadStalls(); loadDashboard(); } });
  }

  // ══════════════════════════════════
  // TRADERS — /api/trader
  // ══════════════════════════════════
  async function loadTraders() {
    document.getElementById("traderTable").innerHTML = loadRow(7);
    try {
      const res = await fetch(`${API}/trader`, { headers: authHeader() });
      const json = await res.json();
      if (!res.ok || !json.success) {
        traderCache = [];
        document.getElementById("traderTable").innerHTML = emptyRow(7, res.status === 401 || res.status === 403
          ? "Bạn cần đăng nhập lại (hết quyền truy cập danh sách tiểu thương)"
          : (json.message || "Lỗi tải dữ liệu"));
        return;
      }
      traderCache = json.data || [];
      const mkt = [...new Set(traderCache.map(t => t.market_name).filter(Boolean))];
      const sel = document.getElementById("tFilterMarket");
      const prev = sel.value;
      sel.innerHTML = '<option value="">Tất cả chợ</option>';
      mkt.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
      sel.value = prev;
      pages["traders"] = 1;
      renderTraders();
    } catch (err) { document.getElementById("traderTable").innerHTML = emptyRow(7, "Lỗi tải dữ liệu"); }
  }
  function renderTraders() {
    const mkt = document.getElementById("tFilterMarket")?.value || "";
    const st  = document.getElementById("tFilterStatus")?.value || "";
    const kw  = (document.getElementById("tSearch")?.value || "").toLowerCase();
    const filtered = traderCache.filter(t => {
      if (mkt && t.market_name !== mkt) return false;
      if (st && t.status !== st) return false;
      if (kw && !`${t.full_name || ""} ${t.phone || ""} ${t.business_name || ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    const countEl = document.getElementById("tCount");
    if (countEl) countEl.textContent = `${filtered.length} / ${traderCache.length} tiểu thương`;
    const { items, total, cur } = paginate(filtered, "traders");
    document.getElementById("traderTable").innerHTML = items.map(t => `
      <tr><td><strong>${t.full_name || "—"}</strong></td><td>${t.username || "—"}</td><td>${t.phone || "—"}</td><td>${t.business_name || "—"}</td><td>${t.market_name || "—"}</td>
      <td>${t.status === "ACTIVE" ? '<span class="badge badge-green">Hoạt động</span>' : '<span class="badge badge-red">Tạm khóa</span>'}</td>
      <td><div class="actions"><button class="btn btn-outline btn-sm" onclick="openEditTraderModal(${t.id})"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-sm" onclick="openDeleteTrader(${t.id})"><i class="fa-solid fa-trash"></i></button></div></td></tr>
    `).join("") || emptyRow(7, "Không tìm thấy tiểu thương");
    renderPag("traderPagination", cur, total, filtered.length, "goTraderPage");
  }
  function goTraderPage(p) { pages["traders"] = p; renderTraders(); }

  async function openAddTraderModal() {
    document.getElementById("formTrader").reset();
    document.getElementById("ttId").value = "";
    document.getElementById("traderModalTitle").textContent = "Thêm tiểu thương";
    document.getElementById("traderSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu tiểu thương';
    document.getElementById("ttUsername").disabled = false;
    document.getElementById("ttPassword").required = true;
    document.getElementById("ttPwdLabel").innerHTML = 'Mật khẩu <span style="color:var(--danger)">*</span>';
    document.getElementById("ttPwdHint").style.display = "none";
    hideFormMsg("traderFormMsg");
    const markets = marketCache.length ? marketCache : (await (await fetch(`${API}/markets`)).json()).data || [];
    fillSelect(document.getElementById("ttMarketId"), markets, "id", m => m.name, "— Chọn chợ —");
    openModal("modalTrader");
  }
  async function openEditTraderModal(id) {
    const t = traderCache.find(x => String(x.id) === String(id)); if (!t) return;
    document.getElementById("formTrader").reset();
    document.getElementById("ttId").value = t.id;
    document.getElementById("traderModalTitle").textContent = "Sửa tiểu thương";
    document.getElementById("traderSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
    document.getElementById("ttUsername").value = t.username || "";
    document.getElementById("ttUsername").disabled = true;
    document.getElementById("ttFullName").value = t.full_name || "";
    document.getElementById("ttPhone").value = t.phone || "";
    document.getElementById("ttEmail").value = t.email || "";
    document.getElementById("ttBusiness").value = t.business_name || "";
    document.getElementById("ttTax").value = t.tax_code || "";
    document.getElementById("ttStatus").value = t.status || "ACTIVE";
    document.getElementById("ttPassword").required = false;
    document.getElementById("ttPwdLabel").textContent = "Mật khẩu mới (tùy chọn)";
    document.getElementById("ttPwdHint").style.display = "block";
    hideFormMsg("traderFormMsg");
    const markets = marketCache.length ? marketCache : (await (await fetch(`${API}/markets`)).json()).data || [];
    fillSelect(document.getElementById("ttMarketId"), markets, "id", m => m.name, "— Chọn chợ —");
    document.getElementById("ttMarketId").value = t.market_id || "";
    openModal("modalTrader");
  }
  async function submitTrader(e) {
    e.preventDefault();
    const id = document.getElementById("ttId").value, isEdit = !!id;
    const password = document.getElementById("ttPassword").value;
    const payload = { full_name: document.getElementById("ttFullName").value.trim(), phone: document.getElementById("ttPhone").value.trim() || null, email: document.getElementById("ttEmail").value.trim() || null, market_id: document.getElementById("ttMarketId").value, business_name: document.getElementById("ttBusiness").value.trim(), tax_code: document.getElementById("ttTax").value.trim() || null, status: document.getElementById("ttStatus").value };
    if (!isEdit) { payload.username = document.getElementById("ttUsername").value.trim(); payload.password = password; }
    else if (password) payload.password = password;
    if (!payload.full_name || !payload.market_id || !payload.business_name) { showFormMsg("traderFormMsg", "Vui lòng điền đầy đủ thông tin bắt buộc", true); return; }
    if (!isEdit && (!payload.username || !payload.password)) { showFormMsg("traderFormMsg", "Vui lòng nhập tên đăng nhập và mật khẩu", true); return; }
    await submitForm({ url: isEdit ? `${API}/trader/${id}` : `${API}/trader`, method: isEdit ? "PUT" : "POST", payload, msgId: "traderFormMsg", btnId: "traderSubmitBtn", successMsg: isEdit ? "Cập nhật tiểu thương thành công!" : "Thêm tiểu thương thành công!", onSuccess: () => { loadTraders(); loadDashboard(); closeModal("modalTrader"); } });
  }
  function openDeleteTrader(id) {
    const t = traderCache.find(x => String(x.id) === String(id));
    openDeleteModal({ id, name: t?.full_name, label: "tiểu thương", endpoint: `${API}/trader`, note: "Tài khoản đăng nhập liên kết cũng sẽ bị xóa.", onSuccess: () => { loadTraders(); loadDashboard(); } });
  }

  // ══════════════════════════════════
  // CONTRACTS — /api/contracts (nâng cấp: lịch thanh toán theo kỳ)
  // ══════════════════════════════════
  const CONTRACT_BADGE = { active: '<span class="badge badge-green">Còn hiệu lực</span>', pending: '<span class="badge badge-amber">Chờ ký</span>', expired: '<span class="badge badge-red">Đã hết hạn</span>' };
  const CONTRACT_TEXT  = { active: "Còn hiệu lực", pending: "Chờ ký", expired: "Đã hết hạn" };

  /** Xây dựng lịch thanh toán theo tháng từ hợp đồng (mỗi kỳ = payment_step_months tháng) */
  function buildPaymentSchedule(contract) {
    if (!contract.start_date || !contract.end_date || !contract.monthly_rent) return [];
    const start = new Date(contract.start_date);
    const end   = new Date(contract.end_date);
    const rent  = Number(contract.monthly_rent);
    const step  = Number(contract.payment_step_months) || 1;
    const installments = contract.installments || []; // từ backend nếu có

    const schedule = [];
    let current = new Date(start);
    let period  = 1;

    while (current < end) {
      const dueDate = new Date(current);
      dueDate.setDate(dueDate.getDate() + 5); // grace period 5 ngày

      const nextDate = new Date(current);
      nextDate.setMonth(nextDate.getMonth() + step);
      const periodEnd = new Date(nextDate > end ? end : nextDate);
      periodEnd.setDate(periodEnd.getDate() - 1);

      const monthsDiff = monthsBetween(current, nextDate > end ? end : nextDate);
      const computedAmount = Math.round(rent * monthsDiff);
      const found = installments.find(i => i.period === period);
      // Ưu tiên số tiền/ngày đến hạn của hóa đơn thật (nếu kỳ này đã có hóa
      // đơn trong hệ thống) thay vì số tự tính, để không lệch với dữ liệu
      // thật đã ghi nhận thanh toán.
      const amount    = found?.total_amount != null ? Number(found.total_amount) : computedAmount;
      const finalDue  = found?.due_date || dueDate.toISOString().split("T")[0];

      schedule.push({
        period,
        period_start: fmtDate(current.toISOString()),
        period_end:   fmtDate(periodEnd.toISOString()),
        due_date:     finalDue,
        amount,
        status:     found?.status || "UNPAID",
        invoice_id: found?.invoice_id || null,
        paid_date:  found?.paid_date || null,
        is_overdue: (found?.status || "UNPAID") !== "PAID" && new Date() > new Date(finalDue),
      });

      current = nextDate > end ? end : nextDate;
      period++;
      if (current >= end) break;
    }
    return schedule;
  }
  function monthsBetween(d1, d2) {
    const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    return Math.max(1, months);
  }
  function countOverdueInstallments(contract) {
    if (!contract.start_date || !contract.monthly_rent) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return buildPaymentSchedule(contract).filter(inst => inst.status === "UNPAID" && new Date(inst.due_date) < today).length;
  }

  async function loadContracts() {
    document.getElementById("contractTable").innerHTML = loadRow(9);
    try {
      const res = await fetch(`${API}/contracts`);
      contractCache = (await res.json()).data || [];
      contractCache = contractCache.map(c => ({ ...c, _overdueCount: countOverdueInstallments(c) }));
      pages["contracts"] = 1;
      renderContracts();
      renderOverdueAlert();
    } catch (err) { document.getElementById("contractTable").innerHTML = emptyRow(9, "Lỗi tải dữ liệu"); }
  }

  /** Cảnh báo trễ hạn gắn vào khối #dashAlerts sẵn có khi đang ở trang hợp đồng */
  function renderOverdueAlert() {
    const overdue = contractCache.filter(c => c._overdueCount > 0 && c.status === "active");
    let box = document.getElementById("contractOverdueAlert");
    if (!box) {
      box = document.createElement("div");
      box.id = "contractOverdueAlert";
      const filterBar = document.querySelector("#page-contracts .filter-bar");
      if (filterBar) filterBar.insertAdjacentElement("afterend", box);
    }
    if (!overdue.length) { box.innerHTML = ""; return; }
    const totalOverdue = overdue.reduce((s, c) => s + c._overdueCount, 0);
    box.innerHTML = `<div class="alert-box warn" style="margin-bottom:14px;"><i class="fa-solid fa-triangle-exclamation"></i><span>Có <strong>${overdue.length}</strong> hợp đồng với tổng <strong>${totalOverdue}</strong> kỳ thanh toán quá hạn. <a href="#" onclick="filterOverdueContracts();return false;" style="color:var(--warning);font-weight:600;">Xem ngay →</a></span></div>`;
  }
  function filterOverdueContracts() {
    document.getElementById("cFilterStatus").value = "active";
    pages["contracts"] = 1;
    renderContractsFromList(contractCache.filter(c => c._overdueCount > 0 && c.status === "active"));
  }

  function renderContracts() {
    const st = document.getElementById("cFilterStatus")?.value || "";
    const kw = (document.getElementById("cSearch")?.value || "").toLowerCase();
    const filtered = contractCache.filter(c => {
      if (st && c.status !== st) return false;
      if (kw && !`${c.business_name || ""} ${c.stall_code || ""} ${c.market_name || ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    const countEl = document.getElementById("cCount"); if (countEl) countEl.textContent = `${filtered.length} hợp đồng`;
    renderContractsFromList(filtered);
  }
  function renderContractsFromList(filtered) {
    const { items, total, cur } = paginate(filtered, "contracts");
    document.getElementById("contractTable").innerHTML = items.map(c => {
      const overdueTag = c._overdueCount > 0
        ? `<span class="badge badge-red" style="margin-left:4px;"><i class="fa-solid fa-clock"></i> ${c._overdueCount} trễ hạn</span>`
        : "";
      return `
      <tr class="${c._overdueCount > 0 ? "row-overdue" : ""}"><td><strong>#${c.id}</strong></td><td>${c.business_name || "—"}${overdueTag}</td><td>${c.stall_code || "—"}</td><td>${c.market_name || "—"}</td>
      <td>${fmtDate(c.start_date)}</td><td>${fmtDate(c.end_date)}</td>
      <td><strong>${fmtCurrency(c.monthly_rent)}</strong></td>
      <td>${CONTRACT_BADGE[c.status] || `<span class="badge badge-gray">${c.status || "—"}</span>`}</td>
      <td><div class="actions">
        <button class="btn btn-outline btn-sm" onclick="openContractDetail(${c.id})" title="Chi tiết & lịch thanh toán"><i class="fa-solid fa-calendar-check"></i></button>
        <button class="btn btn-outline btn-sm" onclick="openEditContractModal(${c.id})" title="Sửa"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm" onclick="openDeleteContract(${c.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
      </div></td></tr>
    `;
    }).join("") || emptyRow(9, "Không tìm thấy hợp đồng");
    renderPag("contractPagination", cur, total, filtered.length, "goContractPage");
  }
  function goContractPage(p) { pages["contracts"] = p; renderContracts(); }

  async function _loadTradersStallsIntoContract() {
    const [tRes, sRes] = await Promise.all([fetch(`${API}/trader`, { headers: authHeader() }), fetch(`${API}/stalls`)]);
    const traders = (await tRes.json()).data || [];
    const allStalls = (await sRes.json()).data || [];
    const availableStalls = allStalls.filter(s => s.status === "available" || s.status === "rented");
    fillSelect(document.getElementById("ctTraderId"), traders, "id", t => t.business_name || t.full_name || `#${t.id}`, "— Chọn tiểu thương —");
    fillSelect(document.getElementById("ctStallId"), availableStalls, "id", s => `${s.code} — ${s.market_name || ""} [${s.status === "available" ? "🟢 Trống" : "🔴 Đang thuê"}]`, "— Chọn sạp —");
  }
  async function openAddContractModal() {
    hideFormMsg("contractFormMsg");
    document.getElementById("formContract").reset();
    document.getElementById("ctId").value = "";
    document.getElementById("contractModalTitle").textContent = "Tạo hợp đồng mới";
    document.getElementById("contractSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Tạo hợp đồng';
    document.getElementById("ctTraderId").disabled = false;
    document.getElementById("ctStallId").disabled = false;
    const stepEl = document.getElementById("ctPaymentStep");
    if (stepEl) stepEl.value = "1";
    ["ctStart", "ctEnd", "ctRent", "ctPaymentStep"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = previewScheduleInModal;
    });
    await _loadTradersStallsIntoContract();
    openModal("modalContract");
  }
  async function openEditContractModal(id) {
    const c = contractCache.find(x => String(x.id) === String(id)); if (!c) return;
    hideFormMsg("contractFormMsg");
    document.getElementById("contractModalTitle").textContent = "Sửa hợp đồng";
    document.getElementById("contractSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
    document.getElementById("ctId").value = c.id;
    document.getElementById("ctTraderId").disabled = true;
    document.getElementById("ctStallId").disabled = true;
    await _loadTradersStallsIntoContract();
    document.getElementById("ctTraderId").value = c.trader_id || "";
    document.getElementById("ctStallId").value = c.stall_id || "";
    document.getElementById("ctStart").value = c.start_date?.substring(0, 10) || "";
    document.getElementById("ctEnd").value   = c.end_date?.substring(0, 10) || "";
    document.getElementById("ctRent").value  = c.monthly_rent || "";
    document.getElementById("ctStatus").value= c.status || "active";
    const stepEl = document.getElementById("ctPaymentStep");
    if (stepEl) stepEl.value = c.payment_step_months || "1";
    ["ctStart", "ctEnd", "ctRent", "ctPaymentStep"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = previewScheduleInModal;
    });
    previewScheduleInModal();
    openModal("modalContract");
  }

  /** Preview nhanh lịch thanh toán trong modal tạo/sửa hợp đồng */
  function previewScheduleInModal() {
    const preview = document.getElementById("ctSchedulePreview");
    if (!preview) return;
    const startVal = document.getElementById("ctStart")?.value;
    const endVal   = document.getElementById("ctEnd")?.value;
    const rent     = Number(document.getElementById("ctRent")?.value);
    const step     = Number(document.getElementById("ctPaymentStep")?.value) || 1;
    if (!startVal || !endVal || !rent) {
      preview.innerHTML = '<p style="color:var(--text3);font-size:12px;">Nhập đủ thông tin để xem lịch thanh toán dự kiến.</p>';
      return;
    }
    const sched = buildPaymentSchedule({ start_date: startVal, end_date: endVal, monthly_rent: rent, payment_step_months: step, installments: [] });
    const total = sched.reduce((s, i) => s + i.amount, 0);
    preview.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px;">📋 Lịch thanh toán dự kiến — ${sched.length} kỳ · Tổng: <strong style="color:var(--primary);">${fmtCurrency(total)}</strong></div>
      <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;overflow-x:auto;">
        <table style="width:100%;font-size:11.5px;border-collapse:collapse;">
          <thead><tr style="background:var(--bg);"><th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Kỳ</th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Giai đoạn</th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Hạn TT</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);">Số tiền</th></tr></thead>
          <tbody>${sched.map(i => `<tr><td style="padding:5px 8px;">Kỳ ${i.period}</td><td style="padding:5px 8px;color:var(--text2);">${i.period_start} → ${i.period_end}</td><td style="padding:5px 8px;">${fmtDate(i.due_date)}</td><td style="padding:5px 8px;text-align:right;font-weight:600;color:var(--primary);">${fmtCurrency(i.amount)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  async function submitContract(e) {
    e.preventDefault();
    const id = document.getElementById("ctId").value, isEdit = !!id;
    const traderId = document.getElementById("ctTraderId").value;
    const stallId  = document.getElementById("ctStallId").value;
    const startDate = document.getElementById("ctStart").value;
    const endDate   = document.getElementById("ctEnd").value;
    const stepMonths = document.getElementById("ctPaymentStep")?.value || "1";
    if (!traderId || !stallId || !startDate || !endDate) { showFormMsg("contractFormMsg", "Vui lòng điền đầy đủ thông tin", true); return; }
    if (new Date(startDate) >= new Date(endDate)) { showFormMsg("contractFormMsg", "Ngày bắt đầu phải trước ngày kết thúc", true); return; }
    const payload = isEdit
      ? { start_date: startDate, end_date: endDate, monthly_rent: document.getElementById("ctRent").value || null, status: document.getElementById("ctStatus").value, payment_step_months: Number(stepMonths) }
      : { trader_id: traderId, stall_id: stallId, start_date: startDate, end_date: endDate, monthly_rent: document.getElementById("ctRent").value || null, status: document.getElementById("ctStatus").value, payment_step_months: Number(stepMonths) };
    await submitForm({
      url: isEdit ? `${API}/contracts/${id}` : `${API}/contracts`, method: isEdit ? "PUT" : "POST", payload,
      msgId: "contractFormMsg", btnId: "contractSubmitBtn",
      successMsg: isEdit ? "Cập nhật hợp đồng thành công!" : "Tạo hợp đồng thành công!",
      onSuccess: async () => {
        if (!isEdit && stallId) await updateStallStatus(stallId, "rented");
        loadContracts(); loadStalls(); loadDashboard(); closeModal("modalContract");
      },
    });
  }
  async function updateStallStatus(stallId, status) {
    try { await fetch(`${API}/stalls/${stallId}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ status }) }); } catch {}
  }

  function openContractDetail(id) {
    const c = contractCache.find(x => String(x.id) === String(id)); if (!c) return;
    document.getElementById("cdId").textContent = `#${c.id}`;
    const schedule = buildPaymentSchedule(c);
    const totalAmt = schedule.reduce((s, i) => s + i.amount, 0);
    const paidAmt  = schedule.filter(i => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    const overdueN = schedule.filter(i => i.is_overdue).length;
    const paidPct  = totalAmt ? Math.round(paidAmt / totalAmt * 100) : 0;

    document.getElementById("cdGrid").innerHTML = `
      <div class="detail-item"><div class="detail-label">Cơ sở</div><div class="detail-value"><strong>${c.business_name || "—"}</strong></div></div>
      <div class="detail-item"><div class="detail-label">Tiểu thương</div><div class="detail-value">${c.trader_name || "—"}</div></div>
      <div class="detail-item"><div class="detail-label">Sạp</div><div class="detail-value">${c.stall_code || "—"}</div></div>
      <div class="detail-item"><div class="detail-label">Chợ</div><div class="detail-value">${c.market_name || "—"}</div></div>
      <div class="detail-item"><div class="detail-label">Bắt đầu</div><div class="detail-value">${fmtDate(c.start_date)}</div></div>
      <div class="detail-item"><div class="detail-label">Kết thúc</div><div class="detail-value">${fmtDate(c.end_date)}</div></div>
      <div class="detail-item"><div class="detail-label">Tiền thuê/tháng</div><div class="detail-value" style="color:var(--primary);font-weight:700;">${fmtCurrency(c.monthly_rent)}</div></div>
      <div class="detail-item"><div class="detail-label">Bước thanh toán</div><div class="detail-value">${c.payment_step_months || 1} tháng/kỳ</div></div>
      <div class="detail-item"><div class="detail-label">Trạng thái</div><div class="detail-value">${CONTRACT_BADGE[c.status] || c.status || "—"}</div></div>
    `;

    const progressHtml = `
      <div style="margin:16px 0 6px;display:flex;justify-content:space-between;font-size:12px;font-weight:600;"><span>Đã thanh toán</span><span style="color:var(--primary);">${fmtCurrency(paidAmt)} / ${fmtCurrency(totalAmt)} (${paidPct}%)</span></div>
      <div style="height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-bottom:${overdueN > 0 ? "6" : "14"}px;"><div style="height:100%;width:${paidPct}%;background:var(--primary);border-radius:99px;"></div></div>
      ${overdueN > 0 ? `<div class="alert-box danger" style="margin-bottom:12px;"><i class="fa-solid fa-triangle-exclamation"></i><span>${overdueN} kỳ thanh toán đã quá hạn! Cần liên hệ tiểu thương ngay.</span></div>` : ""}
    `;
    const scheduleHtml = `
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> Lịch thanh toán (${schedule.length} kỳ)</div>
      <div style="overflow-x:auto;"><table class="tbl" style="width:100%;font-size:12.5px;"><thead><tr><th>Kỳ</th><th>Giai đoạn</th><th>Hạn thanh toán</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        ${schedule.map(inst => {
          const isOverdue = inst.is_overdue && inst.status !== "PAID";
          const statusBadge = inst.status === "PAID"
            ? `<span class="badge badge-green"><i class="fa-solid fa-check"></i> Đã TT${inst.paid_date ? " · " + fmtDate(inst.paid_date) : ""}</span>`
            : isOverdue ? `<span class="badge badge-red"><i class="fa-solid fa-clock"></i> Quá hạn</span>` : `<span class="badge badge-amber">Chưa thanh toán</span>`;
          const actionBtn = inst.status !== "PAID"
            ? `<button class="btn btn-info btn-sm" onclick="openPayInstallment(${c.id},${inst.period},${inst.amount},'${inst.due_date}')"><i class="fa-solid fa-coins"></i> Thu tiền</button>`
            : `<span style="color:var(--text3);font-size:11px;">—</span>`;
          return `<tr style="${isOverdue ? "background:var(--danger-pale,#fdecea);" : ""}"><td style="font-weight:600;">Kỳ ${inst.period}</td><td style="color:var(--text2);">${inst.period_start} → ${inst.period_end}</td><td style="${isOverdue ? "color:var(--danger);font-weight:600;" : ""}">${fmtDate(inst.due_date)}</td><td style="font-weight:700;color:var(--primary);">${fmtCurrency(inst.amount)}</td><td>${statusBadge}</td><td>${actionBtn}</td></tr>`;
        }).join("")}
      </tbody></table></div>`;

    let schedEl = document.getElementById("cdSchedule");
    if (!schedEl) {
      const grid = document.getElementById("cdGrid");
      if (grid) { schedEl = document.createElement("div"); schedEl.id = "cdSchedule"; grid.insertAdjacentElement("afterend", schedEl); }
    }
    if (schedEl) schedEl.innerHTML = progressHtml + scheduleHtml;

    document.getElementById("cdEditBtn").onclick = () => { closeModal("modalContractDetail"); openEditContractModal(id); };
    openModal("modalContractDetail");
  }
  function openDeleteContract(id) {
    const c = contractCache.find(x => String(x.id) === String(id));
    openDeleteModal({
      id, name: c ? `#${c.id} — ${c.business_name || ""}` : null, label: "hợp đồng", endpoint: `${API}/contracts`,
      note: "Xóa hợp đồng sẽ đổi sạp về trạng thái Trống.",
      onSuccess: async () => { if (c?.stall_id) await updateStallStatus(c.stall_id, "available"); loadContracts(); loadStalls(); loadDashboard(); },
    });
  }

  // ── Thu tiền theo kỳ (installment) ──
  let _currentInstallmentMeta = null;
  function openPayInstallment(contractId, period, amount, dueDate) {
    _currentInstallmentMeta = { contractId, period, amount, dueDate };
    const c = contractCache.find(x => String(x.id) === String(contractId));
    hideFormMsg("paymentFormMsg");
    document.getElementById("formPayment").reset();

    const invSel = document.getElementById("pmtInvoiceId");
    if (invSel) { invSel.innerHTML = `<option value="_installment">Kỳ ${period} — HĐ #${contractId} (${c?.business_name || ""})</option>`; invSel.value = "_installment"; }
    const amtEl = document.getElementById("pmtAmount");
    if (amtEl) amtEl.value = amount;
    const titleEl = document.querySelector("#modalPayment .modal-title");
    if (titleEl) titleEl.textContent = `Thu tiền Kỳ ${period} — HĐ #${contractId}`;

    let infoEl = document.getElementById("pmtInstallmentInfo");
    if (!infoEl) { infoEl = document.createElement("div"); infoEl.id = "pmtInstallmentInfo"; document.getElementById("formPayment")?.prepend(infoEl); }
    const today = new Date(), due = new Date(dueDate), isOverdue = today > due;
    infoEl.innerHTML = `
      <div class="alert-box ${isOverdue ? "danger" : "info"}" style="margin-bottom:12px;font-size:12.5px;">
        <i class="fa-solid fa-${isOverdue ? "triangle-exclamation" : "circle-info"}"></i>
        <span style="display:block;">
          <strong>${isOverdue ? "⚠️ Kỳ này đã quá hạn thanh toán!" : "Thanh toán kỳ đúng hạn"}</strong>
          <span style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;">
            <span style="color:var(--text3);">Hợp đồng:</span><strong>HĐ #${contractId}</strong>
            <span style="color:var(--text3);">Cơ sở:</span><strong>${c?.business_name || "—"}</strong>
            <span style="color:var(--text3);">Kỳ:</span><strong>Kỳ ${period}</strong>
            <span style="color:var(--text3);">Hạn đóng:</span><strong style="${isOverdue ? "color:var(--danger);" : ""}">${fmtDate(dueDate)}</strong>
            <span style="color:var(--text3);">Số tiền:</span><strong style="color:var(--primary);">${fmtCurrency(amount)}</strong>
          </span>
        </span>
      </div>`;
    openModal("modalPayment");
  }

  // ══════════════════════════════════
  // STALL REQUESTS — /api/stall-requests
  // ══════════════════════════════════
  async function loadStallRequests() {
    document.getElementById("stallRequestTable").innerHTML = loadRow(9);
    try {
      const res = await fetch(`${API}/stall-requests`, { headers: authHeader() });
      stallReqCache = res.ok ? (await res.json()).data || [] : [];
      pages["stall-requests"] = 1;
      renderStallRequests();
      loadPendingCounts();
    } catch { document.getElementById("stallRequestTable").innerHTML = emptyRow(9, "Lỗi tải dữ liệu (cần quyền ADMIN)"); }
  }
  const REQ_STATUS_BADGE = { PENDING: '<span class="badge badge-amber">Chờ duyệt</span>', APPROVED: '<span class="badge badge-green">Đã duyệt</span>', REJECTED: '<span class="badge badge-red">Từ chối</span>' };
  function renderStallRequests() {
    const sf = document.getElementById("srFilterStatus")?.value || "";
    const filtered = stallReqCache.filter(r => !sf || r.status === sf);
    const countEl = document.getElementById("srCount"); if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;
    const { items, total, cur } = paginate(filtered, "stall-requests");
    document.getElementById("stallRequestTable").innerHTML = items.map(r => `
      <tr><td><strong>#${r.id}</strong></td><td>${r.trader_full_name || ""}<br><small style="color:var(--text3);">${r.business_name || ""}</small></td>
      <td>${r.stall_code || "—"}</td><td>${r.market_name || "—"}</td>
      <td>${fmtDate(r.requested_start_date)}</td><td>${fmtDate(r.requested_end_date)}</td>
      <td><span style="font-size:12px;color:var(--text2);">${r.note || "—"}</span></td>
      <td>${REQ_STATUS_BADGE[r.status] || r.status}</td>
      <td>${r.status === "PENDING" ? `<div class="actions"><button class="btn btn-primary btn-sm" onclick="openReviewStallReq(${r.id})"><i class="fa-solid fa-gavel"></i> Xét duyệt</button></div>` : `<div style="font-size:12px;color:var(--text3);">${r.reviewed_at ? fmtDate(r.reviewed_at) : "—"}</div>`}</td></tr>
    `).join("") || emptyRow(9, "Không có yêu cầu nào");
    renderPag("srPagination", cur, total, filtered.length, "goSrPage");
  }
  function goSrPage(p) { pages["stall-requests"] = p; renderStallRequests(); }

  function openReviewStallReq(id) {
    const r = stallReqCache.find(x => String(x.id) === String(id)); if (!r) return;
    currentSrId = id;
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
    document.getElementById("srAdminNote").value = "";
    hideFormMsg("srMsg");
    openModal("modalReviewStallReq");
  }
  async function reviewStallRequest(action) {
    if (!currentSrId) return;
    const note = document.getElementById("srAdminNote").value;
    const rentOverride = document.getElementById("srRentOverride").value;
    const isApprove = action === "approve";
    const btnId = isApprove ? "srApproveBtn" : "srRejectBtn";
    const btn = document.getElementById(btnId);
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    hideFormMsg("srMsg");
    try {
      const payload = { admin_note: note || null };
      if (isApprove && rentOverride) payload.monthly_rent = rentOverride;
      const res = await fetch(`${API}/stall-requests/${currentSrId}/${action}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("srMsg", data.message || "Lỗi xử lý", true); btn.disabled = false; btn.innerHTML = orig; return; }
      showToast(isApprove ? "✅ Đã duyệt & tạo hợp đồng mới!" : "❌ Đã từ chối yêu cầu", isApprove ? "success" : "info", 4000);
      loadStallRequests(); loadContracts(); loadStalls();
      setTimeout(() => { closeModal("modalReviewStallReq"); btn.disabled = false; btn.innerHTML = orig; currentSrId = null; }, 500);
    } catch (err) { showFormMsg("srMsg", "Lỗi kết nối: " + err.message, true); btn.disabled = false; btn.innerHTML = orig; }
  }

  // ══════════════════════════════════
  // RENEWAL REQUESTS — /api/renewal-requests
  // ══════════════════════════════════
  async function loadRenewalRequests() {
    document.getElementById("renewalTable").innerHTML = loadRow(9);
    try {
      const res = await fetch(`${API}/renewal-requests`, { headers: authHeader() });
      renewalCache = res.ok ? (await res.json()).data || [] : [];
      pages["renewal-requests"] = 1;
      renderRenewalRequests();
      loadPendingCounts();
    } catch { document.getElementById("renewalTable").innerHTML = emptyRow(9, "Lỗi tải dữ liệu (cần quyền ADMIN)"); }
  }
  function renderRenewalRequests() {
    const sf = document.getElementById("rrFilterStatus")?.value || "";
    const filtered = renewalCache.filter(r => !sf || r.status === sf);
    const countEl = document.getElementById("rrCount"); if (countEl) countEl.textContent = `${filtered.length} yêu cầu`;
    const { items, total, cur } = paginate(filtered, "renewal-requests");
    document.getElementById("renewalTable").innerHTML = items.map(r => `
      <tr><td><strong>#${r.id}</strong></td><td>${r.trader_full_name || ""}<br><small style="color:var(--text3);">${r.business_name || ""}</small></td>
      <td>${r.stall_code || "—"}</td><td>${r.market_name || "—"}</td>
      <td>${fmtDate(r.current_end_date)}</td><td>${fmtDate(r.requested_end_date)}</td>
      <td><span style="font-size:12px;color:var(--text2);">${r.note || "—"}</span></td>
      <td>${REQ_STATUS_BADGE[r.status] || r.status}</td>
      <td>${r.status === "PENDING" ? `<div class="actions"><button class="btn btn-primary btn-sm" onclick="openReviewRenewal(${r.id})"><i class="fa-solid fa-gavel"></i> Xét duyệt</button></div>` : `<div style="font-size:12px;color:var(--text3);">${r.reviewed_at ? fmtDate(r.reviewed_at) : "—"}</div>`}</td></tr>
    `).join("") || emptyRow(9, "Không có yêu cầu nào");
    renderPag("rrPagination", cur, total, filtered.length, "goRrPage");
  }
  function goRrPage(p) { pages["renewal-requests"] = p; renderRenewalRequests(); }

  function openReviewRenewal(id) {
    const r = renewalCache.find(x => String(x.id) === String(id)); if (!r) return;
    currentRrId = id;
    document.getElementById("rrDetailGrid").innerHTML = `
      <div class="detail-item"><div class="dl">Tiểu thương</div><div class="dv"><strong>${r.trader_full_name || "—"}</strong></div></div>
      <div class="detail-item"><div class="dl">Cơ sở</div><div class="dv">${r.business_name || "—"}</div></div>
      <div class="detail-item"><div class="dl">Sạp</div><div class="dv"><strong>${r.stall_code || "—"}</strong></div></div>
      <div class="detail-item"><div class="dl">Chợ</div><div class="dv">${r.market_name || "—"}</div></div>
      <div class="detail-item"><div class="dl">Ngày kết thúc HĐ hiện tại</div><div class="dv">${fmtDate(r.current_end_date)}</div></div>
      <div class="detail-item"><div class="dl">Ngày gia hạn YC</div><div class="dv" style="color:var(--primary);font-weight:600;">${fmtDate(r.requested_end_date)}</div></div>
      <div class="detail-item"><div class="dl">Tiền thuê HĐ hiện tại</div><div class="dv">${fmtCurrency(r.current_monthly_rent)}</div></div>
      <div class="detail-item"><div class="dl">Tiền thuê đề xuất</div><div class="dv">${r.requested_monthly_rent ? fmtCurrency(r.requested_monthly_rent) : "— (giữ nguyên)"}</div></div>
    `;
    document.getElementById("rrAdminNote").value = "";
    hideFormMsg("rrMsg");
    openModal("modalReviewRenewal");
  }
  async function reviewRenewal(action) {
    if (!currentRrId) return;
    const note = document.getElementById("rrAdminNote").value;
    const isApprove = action === "approve";
    const btnId = isApprove ? "rrApproveBtn" : "rrRejectBtn";
    const btn = document.getElementById(btnId);
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    hideFormMsg("rrMsg");
    try {
      const res = await fetch(`${API}/renewal-requests/${currentRrId}/${action}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ admin_note: note || null }) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("rrMsg", data.message || "Lỗi xử lý", true); btn.disabled = false; btn.innerHTML = orig; return; }
      showToast(isApprove ? "✅ Đã duyệt gia hạn hợp đồng!" : "❌ Đã từ chối yêu cầu gia hạn", isApprove ? "success" : "info", 4000);
      loadRenewalRequests(); loadContracts();
      setTimeout(() => { closeModal("modalReviewRenewal"); btn.disabled = false; btn.innerHTML = orig; currentRrId = null; }, 500);
    } catch (err) { showFormMsg("rrMsg", "Lỗi kết nối: " + err.message, true); btn.disabled = false; btn.innerHTML = orig; }
  }

  // ══════════════════════════════════
  // STALL FEEDBACK — /api/stall-feedback
  // Phản ánh từ tiểu thương (sự cố/khiếu nại về sạp) và khách hàng (về sạp/sản phẩm)
  // ══════════════════════════════════
  async function loadStallFeedback() {
    document.getElementById("stallFeedbackTable").innerHTML = loadRow(9);
    try {
      const res = await fetch(`${API}/stall-feedback`, { headers: authHeader() });
      feedbackCache = res.ok ? (await res.json()).data || [] : [];
      pages["stall-feedback"] = 1;
      renderStallFeedback();
      loadPendingCounts();
    } catch { document.getElementById("stallFeedbackTable").innerHTML = emptyRow(9, "Lỗi tải dữ liệu (cần quyền ADMIN)"); }
  }
  const FB_STATUS_BADGE = { PENDING: '<span class="badge badge-amber">Chờ xử lý</span>', RESOLVED: '<span class="badge badge-green">Đã xử lý</span>', REJECTED: '<span class="badge badge-red">Từ chối</span>' };
  const FB_TYPE_BADGE   = { TRADER: '<span class="badge badge-blue">Tiểu thương</span>', CUSTOMER: '<span class="badge badge-gray">Khách hàng</span>' };
  function renderStallFeedback() {
    const tf = document.getElementById("fbFilterType")?.value || "";
    const sf = document.getElementById("fbFilterStatus")?.value || "";
    const filtered = feedbackCache.filter(r => (!tf || r.type === tf) && (!sf || r.status === sf));
    const countEl = document.getElementById("fbCount"); if (countEl) countEl.textContent = `${filtered.length} phản ánh`;
    const { items, total, cur } = paginate(filtered, "stall-feedback");
    document.getElementById("stallFeedbackTable").innerHTML = items.map(r => `
      <tr><td><strong>#${r.id}</strong></td>
      <td>${r.sender_name || "—"}${r.type === "TRADER" && r.business_name ? `<br><small style="color:var(--text3);">${r.business_name}</small>` : ""}</td>
      <td>${FB_TYPE_BADGE[r.type] || r.type}</td>
      <td>${r.stall_code || "—"}</td><td>${r.market_name || "—"}</td>
      <td><span style="font-size:12px;color:var(--text2);max-width:260px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(r.content || "").replace(/"/g, "&quot;")}">${r.title ? `<strong>${r.title}:</strong> ` : ""}${r.content || "—"}</span></td>
      <td>${FB_STATUS_BADGE[r.status] || r.status}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.status === "PENDING" ? `<div class="actions"><button class="btn btn-primary btn-sm" onclick="openReviewFeedback(${r.id})"><i class="fa-solid fa-gavel"></i> Xử lý</button></div>` : `<div style="font-size:12px;color:var(--text3);">${r.reviewed_at ? fmtDate(r.reviewed_at) : "—"}</div>`}</td></tr>
    `).join("") || emptyRow(9, "Không có phản ánh nào");
    renderPag("fbPagination", cur, total, filtered.length, "goFbPage");
  }
  function goFbPage(p) { pages["stall-feedback"] = p; renderStallFeedback(); }

  function openReviewFeedback(id) {
    const r = feedbackCache.find(x => String(x.id) === String(id)); if (!r) return;
    currentFbId = id;
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
    const note = document.getElementById("fbAdminNote").value;
    const isResolve = action === "resolve";
    const btnId = isResolve ? "fbResolveBtn" : "fbRejectBtn";
    const btn = document.getElementById(btnId);
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    hideFormMsg("fbMsg");
    try {
      const endpoint = isResolve ? "resolve" : "reject";
      const res = await fetch(`${API}/stall-feedback/${currentFbId}/${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ admin_note: note || null }) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("fbMsg", data.message || "Lỗi xử lý", true); btn.disabled = false; btn.innerHTML = orig; return; }
      showToast(isResolve ? "✅ Đã đánh dấu xử lý phản ánh!" : "❌ Đã từ chối phản ánh", isResolve ? "success" : "info", 4000);
      loadStallFeedback();
      setTimeout(() => { closeModal("modalReviewFeedback"); btn.disabled = false; btn.innerHTML = orig; currentFbId = null; }, 500);
    } catch (err) { showFormMsg("fbMsg", "Lỗi kết nối: " + err.message, true); btn.disabled = false; btn.innerHTML = orig; }
  }

  // ══════════════════════════════════
  // PRODUCTS — /api/products
  // ══════════════════════════════════
  async function loadProducts() {
    document.getElementById("productTablePage").innerHTML = loadRow(7);
    try {
      const res = await fetch(`${API}/products`);
      productCache = (await res.json()).data || [];
      pages["products"] = 1;
      renderProducts();
      // Dashboard table
      const dashTbl = document.getElementById("d-productTable");
      if (dashTbl) dashTbl.innerHTML = productCache.slice(0, 8).map(p => `
        <tr>
          <td>
            ${p.image_url
              ? `<img src="${imgUrl(p.image_url)}" alt="${p.name}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);display:block;" onerror="this.style.display='none';">`
              : `<div style="width:36px;height:36px;border-radius:4px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text3);font-size:14px;"><i class="fa-solid fa-image"></i></div>`}
          </td>
          <td>${p.id}</td><td><strong>${p.name}</strong></td><td>${fmtCurrency(p.price)}</td><td>${p.business_name || "—"}</td><td>${p.market_name || "—"}</td>
        </tr>`).join("") || emptyRow(6);
    } catch (err) { document.getElementById("productTablePage").innerHTML = emptyRow(7, "Lỗi tải dữ liệu"); }
  }
  function renderProducts() {
    const kw = (document.getElementById("pSearch")?.value || "").toLowerCase();
    const filtered = productCache.filter(p => !kw || `${p.name} ${p.business_name || ""} ${p.stall_code || ""}`.toLowerCase().includes(kw));
    const countEl = document.getElementById("pCount"); if (countEl) countEl.textContent = `${filtered.length} / ${productCache.length} sản phẩm`;
    const { items, total, cur } = paginate(filtered, "products");
    document.getElementById("productTablePage").innerHTML = items.map(p => `
      <tr>
        <td>
          ${p.image_url
            ? `<img src="${imgUrl(p.image_url)}" alt="${p.name}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
              <div style="display:none;width:48px;height:48px;border-radius:6px;border:1px solid var(--border);align-items:center;justify-content:center;background:var(--bg);color:var(--text3);font-size:18px;"><i class="fa-solid fa-image-slash"></i></div>`
            : `<div style="width:48px;height:48px;border-radius:6px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text3);font-size:18px;"><i class="fa-solid fa-image"></i></div>`}
        </td>
        <td>${p.id}</td>
        <td><strong>${p.name}</strong></td>
        <td><strong style="color:var(--primary);">${fmtCurrency(p.price)}</strong></td>
        <td>${p.business_name || "—"}</td>
        <td>${p.stall_code || "—"}</td>
        <td>${p.market_name || "—"}</td>
        <td><div class="actions"><button class="btn btn-outline btn-sm" onclick="openEditProductModal(${p.id})"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-sm" onclick="openDeleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>
    `).join("") || emptyRow(8, "Không tìm thấy sản phẩm");
    renderPag("productPagination", cur, total, filtered.length, "goProductPage");
  }
  function goProductPage(p) { pages["products"] = p; renderProducts(); }

  async function openAddProductModal() {
    hideFormMsg("productFormMsg");
    document.getElementById("formProduct").reset();
    document.getElementById("prId").value = "";
    document.getElementById("productModalTitle").textContent = "Thêm sản phẩm mới";
    document.getElementById("productSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu';
    document.getElementById("prTraderId").disabled = false;
    // Reset ảnh
    const imgPrev = document.getElementById("prImagePreview");
    if (imgPrev) { imgPrev.src = ""; imgPrev.style.display = "none"; }
    const imgInp = document.getElementById("prImageFile");
    if (imgInp) imgInp.value = "";
    const placeholder = document.getElementById("prUploadPlaceholder");
    if (placeholder) placeholder.style.display = "flex";
    const uploadArea = document.getElementById("prUploadArea");
    if (uploadArea) uploadArea.classList.remove("has-image");
    const removeBtn = document.getElementById("prRemoveImgBtn");
    if (removeBtn) removeBtn.style.display = "none";
    const imgUrlInp = document.getElementById("prImageUrl");
    if (imgUrlInp) imgUrlInp.value = "";
    const [tRes, sRes] = await Promise.all([fetch(`${API}/trader`, { headers: authHeader() }), fetch(`${API}/stalls`)]);
    fillSelect(document.getElementById("prTraderId"), (await tRes.json()).data || [], "id", t => t.business_name || t.full_name || `#${t.id}`, "— Chọn tiểu thương —");
    fillSelect(document.getElementById("prStallId"), (await sRes.json()).data || [], "id", s => `${s.code} — ${s.market_name || ""}`, "— Chọn sạp —");
    openModal("modalProduct");
  }
  async function openEditProductModal(id) {
    const p = productCache.find(x => String(x.id) === String(id)); if (!p) return;
    hideFormMsg("productFormMsg");
    document.getElementById("productModalTitle").textContent = "Sửa sản phẩm";
    document.getElementById("productSubmitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cập nhật';
    document.getElementById("prId").value = p.id;
    document.getElementById("prTraderId").disabled = true;
    const [tRes, sRes] = await Promise.all([fetch(`${API}/trader`, { headers: authHeader() }), fetch(`${API}/stalls`)]);
    fillSelect(document.getElementById("prTraderId"), (await tRes.json()).data || [], "id", t => t.business_name || t.full_name || `#${t.id}`, "— Chọn tiểu thương —");
    fillSelect(document.getElementById("prStallId"), (await sRes.json()).data || [], "id", s => `${s.code} — ${s.market_name || ""}`, "— Chọn sạp —");
    document.getElementById("prTraderId").value = p.trader_id || "";
    document.getElementById("prStallId").value  = p.stall_id || "";
    document.getElementById("prName").value     = p.name || "";
    document.getElementById("prPrice").value    = p.price || "";
    // Lưu image_url hiện tại vào hidden input
    const imgUrlInp = document.getElementById("prImageUrl");
    if (imgUrlInp) imgUrlInp.value = p.image_url || "";
    // Reset file input và hiển thị ảnh hiện tại (nếu có)
    const imgInp = document.getElementById("prImageFile");
    if (imgInp) imgInp.value = "";
    const imgPrev = document.getElementById("prImagePreview");
    const placeholder = document.getElementById("prUploadPlaceholder");
    const uploadArea = document.getElementById("prUploadArea");
    const removeBtn = document.getElementById("prRemoveImgBtn");
    if (p.image_url) {
      if (imgPrev) { imgPrev.src = imgUrl(p.image_url); imgPrev.style.display = "block"; }
      if (placeholder) placeholder.style.display = "none";
      if (uploadArea) uploadArea.classList.add("has-image");
      if (removeBtn) removeBtn.style.display = "inline-flex";
    } else {
      if (imgPrev) { imgPrev.src = ""; imgPrev.style.display = "none"; }
      if (placeholder) placeholder.style.display = "flex";
      if (uploadArea) uploadArea.classList.remove("has-image");
      if (removeBtn) removeBtn.style.display = "none";
    }
    openModal("modalProduct");
  }
  async function submitProduct(e) {
    e.preventDefault();
    const id      = document.getElementById("prId").value;
    const isEdit  = !!id;
    const name    = document.getElementById("prName").value.trim();
    const price   = document.getElementById("prPrice").value;
    const stallId = document.getElementById("prStallId").value;
    const traderId= document.getElementById("prTraderId").value;

    if (!name || !price || !stallId || (!isEdit && !traderId)) {
      showFormMsg("productFormMsg", "Vui lòng điền đầy đủ thông tin", true);
      return;
    }

    const btn  = document.getElementById("productSubmitBtn");
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
    hideFormMsg("productFormMsg");

    try {
      // Dùng FormData để gửi cả text lẫn file ảnh trong 1 request
      const fd = new FormData();
      fd.append("name",     name);
      fd.append("price",    price);
      fd.append("stall_id", stallId);
      if (!isEdit) fd.append("trader_id", traderId);

      // Ảnh: nếu có file mới → gửi file; nếu không → gửi lại URL cũ để backend giữ nguyên
      const imgFileInp = document.getElementById("prImageFile");
      const imgUrlOld  = document.getElementById("prImageUrl")?.value || "";
      if (imgFileInp?.files?.length) {
        fd.append("image", imgFileInp.files[0]);   // file mới
      } else if (imgUrlOld) {
        fd.append("image_url", imgUrlOld);          // giữ URL cũ
      }
      // Nếu cả 2 đều trống → backend tự set NULL (xóa ảnh)

      const res  = await fetch(isEdit ? `${API}/products/${id}` : `${API}/products`, {
        method:  isEdit ? "PUT" : "POST",
        headers: authHeader(),   // KHÔNG đặt Content-Type — browser tự gán multipart boundary
        body:    fd,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showFormMsg("productFormMsg", data.message || "Không thể lưu", true);
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        return;
      }

      const msg = isEdit ? "Cập nhật sản phẩm thành công!" : "Thêm sản phẩm thành công!";
      showFormMsg("productFormMsg", msg, false);
      showToast(msg, "success");
      setTimeout(() => { loadProducts(); closeModal("modalProduct"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 600);

    } catch (err) {
      showFormMsg("productFormMsg", "Lỗi kết nối: " + err.message, true);
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }
  function openDeleteProduct(id) {
    const p = productCache.find(x => String(x.id) === String(id));
    openDeleteModal({ id, name: p?.name, label: "sản phẩm", endpoint: `${API}/products`, onSuccess: loadProducts });
  }

  // ══════════════════════════════════
  // ══════════════════════════════════
  // ORDERS — /api/orders
  // ══════════════════════════════════
  const ORDER_STATUS_LABEL = {
    pending:   { text: "Chờ xử lý",     cls: "badge-amber" },
    confirmed: { text: "Đã xác nhận",   cls: "badge-blue"  },
    completed: { text: "Hoàn thành",    cls: "badge-green" },
    cancelled: { text: "Đã hủy",        cls: "badge-red"   },
  };

  async function loadOrders() {
    document.getElementById("orderTable").innerHTML = loadRow(6);
    try {
      const res = await fetch(`${API}/orders`);
      orderCache = (await res.json()).data || [];
      pages["orders"] = 1;
      renderOrders();
    } catch { document.getElementById("orderTable").innerHTML = emptyRow(6, "Lỗi tải dữ liệu"); }
  }
  function renderOrders() {
    const kw = (document.getElementById("oSearch")?.value || "").toLowerCase();
    const filtered = orderCache.filter(o => !kw || `${o.id} ${o.customer_name || ""} ${o.business_name || ""}`.toLowerCase().includes(kw));
    const countEl = document.getElementById("oCount"); if (countEl) countEl.textContent = `${filtered.length} đơn hàng`;
    const { items, total, cur } = paginate(filtered, "orders");
    document.getElementById("orderTable").innerHTML = items.map(o => {
      const st = ORDER_STATUS_LABEL[o.status] || { text: o.status || "—", cls: "badge-gray" };
      return `
      <tr><td><strong>#${o.id}</strong></td>
      <td>${o.customer_name || o.customer_id || "—"}${o.is_guest ? ' <span class="badge badge-gray" style="font-size:10px;">Khách vãng lai</span>' : ""}</td>
      <td>${o.business_name || "—"}</td>
      <td><strong style="color:var(--primary);">${fmtCurrency(o.total_amount)}</strong></td>
      <td>${o.created_at ? fmtDate(o.created_at) : "—"}</td>
      <td>
        <span class="badge ${st.cls}">${st.text}</span>
        ${o.status !== "completed" && o.status !== "cancelled" ? `
          <div style="margin-top:4px;display:flex;gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="updateOrderStatus(${o.id}, 'completed')" title="Đánh dấu hoàn thành"><i class="fa-solid fa-check"></i></button>
            <button class="btn btn-outline btn-sm" onclick="updateOrderStatus(${o.id}, 'cancelled')" title="Hủy đơn"><i class="fa-solid fa-xmark"></i></button>
          </div>` : ""}
      </td></tr>
    `; }).join("") || emptyRow(6, "Không có đơn hàng");
    renderPag("orderPagination", cur, total, filtered.length, "goOrderPage");
  }
  function goOrderPage(p) { pages["orders"] = p; renderOrders(); }

  async function updateOrderStatus(id, status) {
    try {
      const res = await fetch(`${API}/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { alert(data.message || "Cập nhật thất bại"); return; }
      const idx = orderCache.findIndex(o => o.id === id);
      if (idx > -1) orderCache[idx].status = status;
      renderOrders();
    } catch (err) {
      alert("Lỗi kết nối: " + err.message);
    }
  }

  // ══════════════════════════════════
  // INVOICES — /api/invoices
  // ══════════════════════════════════
  async function loadInvoices() {
    document.getElementById("invoiceTable").innerHTML = loadRow(8);
    try {
      const res = await fetch(`${API}/invoices`);
      invoiceCache = (await res.json()).data || [];
      pages["invoices"] = 1;
      renderInvoices();
    } catch { document.getElementById("invoiceTable").innerHTML = emptyRow(8, "Lỗi tải dữ liệu"); }
  }
  function isInvoiceOverdue(inv) {
    if (!inv.due_date) return false;
    return new Date() > new Date(inv.due_date) && inv.status === "UNPAID";
  }
  function renderInvoices() {
    const sf = document.getElementById("invFilterStatus")?.value || "";
    const filtered = invoiceCache.filter(i => !sf || i.status === sf);
    const countEl = document.getElementById("invCount"); if (countEl) countEl.textContent = `${filtered.length} hóa đơn`;
    const { items, total, cur } = paginate(filtered, "invoices");
    document.getElementById("invoiceTable").innerHTML = items.map(i => {
      const overdue = isInvoiceOverdue(i);
      const statusBadge = i.status === "PAID"
        ? '<span class="badge badge-green">Đã thanh toán</span>'
        : overdue ? '<span class="badge badge-red"><i class="fa-solid fa-clock"></i> Quá hạn</span>' : '<span class="badge badge-amber">Chưa thanh toán</span>';
      return `
      <tr class="${overdue ? "row-overdue" : ""}"><td><strong>#${i.id}</strong></td><td>${i.business_name || "—"}</td><td>${i.stall_code || "—"}</td>
      <td>${i.contract_period ? `Kỳ ${i.contract_period}` : (i.note || "—")}</td>
      <td><strong style="color:var(--primary);">${fmtCurrency(i.total_amount)}</strong></td>
      <td>${statusBadge}</td>
      <td>${fmtDate(i.due_date || i.created_at)}</td>
      <td>${i.status === "UNPAID" ? `<button class="btn ${overdue ? "btn-danger" : "btn-info"} btn-sm" onclick="openAddPaymentModal(${i.id},${i.total_amount})"><i class="fa-solid fa-coins"></i> ${overdue ? "Thu ngay" : "Thu tiền"}</button>` : ""}</td></tr>
    `;
    }).join("") || emptyRow(8, "Không có hóa đơn");
    renderPag("invPagination", cur, total, filtered.length, "goInvPage");
  }
  function goInvPage(p) { pages["invoices"] = p; renderInvoices(); }

  async function openAddInvoiceModal() {
    hideFormMsg("invoiceFormMsg");
    document.getElementById("formInvoice").reset();
    const contracts = contractCache.length ? contractCache : (await (await fetch(`${API}/contracts`)).json()).data || [];
    fillSelect(document.getElementById("invContractId"), contracts, "id", c => `HĐ #${c.id} — ${c.business_name || ""} (${c.stall_code || ""})`, "— Chọn hợp đồng —");
    openModal("modalInvoice");
  }
  async function submitInvoice(e) {
    e.preventDefault();
    const payload = { contract_id: document.getElementById("invContractId").value, total_amount: document.getElementById("invAmount").value };
    if (!payload.contract_id || !payload.total_amount) { showFormMsg("invoiceFormMsg", "Vui lòng điền đầy đủ", true); return; }
    const btn = e.submitter; const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      const res = await fetch(`${API}/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("invoiceFormMsg", data.message || "Lỗi tạo hóa đơn", true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }
      showToast("Tạo hóa đơn thành công!", "success");
      loadInvoices();
      setTimeout(() => { closeModal("modalInvoice"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 500);
    } catch (err) { showFormMsg("invoiceFormMsg", "Lỗi kết nối: " + err.message, true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
  }

  // ══════════════════════════════════
  // PAYMENTS — /api/payments
  // ══════════════════════════════════
  async function loadPayments() {
    document.getElementById("paymentTable").innerHTML = loadRow(7);
    try {
      const res = await fetch(`${API}/payments`);
      paymentCache = (await res.json()).data || [];
      const METHOD_LABEL = { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", MOMO: "MoMo", ZALOPAY: "ZaloPay" };
      document.getElementById("paymentTable").innerHTML = paymentCache.map(p => `
        <tr><td><strong>#${p.id}</strong></td><td>HĐon #${p.invoice_id}</td><td>${p.business_name || "—"}</td>
        <td><strong style="color:var(--primary);">${fmtCurrency(p.amount)}</strong></td>
        <td>${METHOD_LABEL[p.method] || p.method || "—"}</td>
        <td>${p.payment_date ? fmtDate(p.payment_date) : "—"}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePayment(${p.id})"><i class="fa-solid fa-trash"></i></button></td></tr>
      `).join("") || emptyRow(7, "Chưa có thanh toán");
    } catch { document.getElementById("paymentTable").innerHTML = emptyRow(7, "Lỗi tải dữ liệu"); }
  }
  async function openAddPaymentModal(invoiceId, amount) {
    _currentInstallmentMeta = null;
    hideFormMsg("paymentFormMsg");
    document.getElementById("formPayment").reset();
    const infoEl = document.getElementById("pmtInstallmentInfo");
    if (infoEl) infoEl.innerHTML = "";
    const titleEl = document.querySelector("#modalPayment .modal-title");
    if (titleEl) titleEl.textContent = "Ghi nhận thanh toán";
    const invoices = invoiceCache.filter(i => i.status === "UNPAID");
    fillSelect(document.getElementById("pmtInvoiceId"), invoices, "id", i => `HĐon #${i.id} — ${i.business_name || ""} (${fmtCurrency(i.total_amount)})`, "— Chọn hóa đơn —");
    if (invoiceId) { document.getElementById("pmtInvoiceId").value = invoiceId; document.getElementById("pmtAmount").value = amount || ""; }
    openModal("modalPayment");
  }
  async function submitPayment(e) {
    e.preventDefault();
    const isInstallment = _currentInstallmentMeta !== null;
    const pmtInvoiceId = document.getElementById("pmtInvoiceId")?.value;
    const amount = document.getElementById("pmtAmount").value;
    const method = document.getElementById("pmtMethod").value;
    if (!amount) { showFormMsg("paymentFormMsg", "Vui lòng nhập số tiền", true); return; }
    const btn = e.submitter; const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      if (isInstallment && pmtInvoiceId === "_installment") {
        // Thanh toán theo kỳ hợp đồng — thử endpoint riêng, fallback nếu chưa có
        const payload = { contract_id: _currentInstallmentMeta.contractId, period: _currentInstallmentMeta.period, amount, method };
        const res = await fetch(`${API}/contracts/${_currentInstallmentMeta.contractId}/pay-installment`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(payload) });
        if (!res.ok) {
          await fallbackInstallmentPayment(payload, method);
        } else {
          const data = await res.json();
          if (!data.success) { showFormMsg("paymentFormMsg", data.message || "Lỗi ghi nhận", true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }
          showToast(`✅ Đã thu kỳ ${_currentInstallmentMeta.period} — ${fmtCurrency(amount)}`, "success");
          _currentInstallmentMeta = null;
          loadPayments(); loadInvoices(); loadContracts();
          setTimeout(() => { closeModal("modalPayment"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 500);
        }
      } else {
        const payload = { invoice_id: pmtInvoiceId, amount, method };
        if (!payload.invoice_id) { showFormMsg("paymentFormMsg", "Vui lòng chọn hóa đơn", true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }
        const res = await fetch(`${API}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok || !data.success) { showFormMsg("paymentFormMsg", data.message || "Lỗi ghi nhận", true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }
        showToast("Ghi nhận thanh toán thành công!", "success");
        loadPayments(); loadInvoices();
        setTimeout(() => { closeModal("modalPayment"); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }, 500);
      }
    } catch (err) { showFormMsg("paymentFormMsg", "Lỗi kết nối: " + err.message, true); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
  }
  /** Fallback: tạo invoice rồi payment nếu backend chưa có /pay-installment */
  async function fallbackInstallmentPayment({ contract_id, period, amount }, method) {
    const invRes = await fetch(`${API}/invoices`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ contract_id, total_amount: amount, period, note: `Kỳ ${period}` }) });
    const invData = await invRes.json();
    if (!invRes.ok || !invData.success) throw new Error(invData.message || "Lỗi tạo hóa đơn");
    const invoiceId = invData.data?.id || invData.id;
    const pmtRes = await fetch(`${API}/payments`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ invoice_id: invoiceId, amount, method }) });
    const pmtData = await pmtRes.json();
    if (!pmtRes.ok || !pmtData.success) throw new Error(pmtData.message || "Lỗi ghi nhận thanh toán");
    showToast(`✅ Đã thu kỳ ${period} — ${fmtCurrency(amount)}`, "success");
    _currentInstallmentMeta = null;
    loadPayments(); loadInvoices(); loadContracts();
    setTimeout(() => closeModal("modalPayment"), 500);
  }
  function deletePayment(id) {
    openDeleteModal({ id, name: `Thanh toán #${id}`, label: "thanh toán", endpoint: `${API}/payments`, onSuccess: () => { loadPayments(); loadInvoices(); } });
  }

  // ══════════════════════════════════
  // USERS — /api/users (ADMIN only)
  // ══════════════════════════════════
  async function loadUsers() {
    document.getElementById("userTable").innerHTML = loadRow(8);
    try {
      const res = await fetch(`${API}/users`, { headers: authHeader() });
      if (res.status === 401 || res.status === 403) { document.getElementById("userTable").innerHTML = emptyRow(8, "Phiên đăng nhập hết hạn hoặc không có quyền"); return; }
      const data = await res.json();
      userCache = data.users || data.data || [];
      const getRole = u => u.role_name || u.role || u.roleName || u.role_code || "";
      const uniqueRoles = [...new Set(userCache.map(getRole).filter(Boolean))];
      const sel = document.getElementById("uFilterRole");
      const prev = sel.value;
      sel.innerHTML = '<option value="">Tất cả vai trò</option>';
      uniqueRoles.forEach(r => { const o = document.createElement("option"); o.value = r; o.textContent = r; sel.appendChild(o); });
      sel.value = prev;
      pages["users"] = 1;
      renderUsers();
    } catch (err) { document.getElementById("userTable").innerHTML = emptyRow(8, "Lỗi tải dữ liệu"); }
  }
  function renderUsers() {
    const getRole = u => u.role_name || u.role || u.roleName || u.role_code || "";
    const role = document.getElementById("uFilterRole")?.value || "";
    const st   = document.getElementById("uFilterStatus")?.value || "";
    const kw   = (document.getElementById("uSearch")?.value || "").toLowerCase();
    const filtered = userCache.filter(u => {
      if (role && getRole(u) !== role) return false;
      if (st && u.status !== st) return false;
      if (kw && !`${u.full_name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
    const countEl = document.getElementById("uCount"); if (countEl) countEl.textContent = `${filtered.length} / ${userCache.length} người dùng`;
    const { items, total, cur } = paginate(filtered, "users");
    document.getElementById("userTable").innerHTML = items.map(u => `
      <tr><td>${u.id}</td><td><strong>${u.full_name || "—"}</strong></td><td>${u.username || "—"}</td><td>${u.email || "—"}</td><td>${u.phone || "—"}</td>
      <td><span class="badge badge-blue">${getRole(u) || "—"}</span></td>
      <td>${u.status === "ACTIVE" ? '<span class="badge badge-green">Hoạt động</span>' : '<span class="badge badge-red">Tạm khóa</span>'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openUserStatusModal(${u.id})"><i class="fa-solid fa-toggle-on"></i> Đổi trạng thái</button></td></tr>
    `).join("") || emptyRow(8, "Không có người dùng");
    renderPag("userPagination", cur, total, filtered.length, "goUserPage");
  }
  function goUserPage(p) { pages["users"] = p; renderUsers(); }

  function openUserStatusModal(id) {
    const u = userCache.find(x => String(x.id) === String(id)); if (!u) return;
    userStatusTarget = id;
    document.getElementById("usName").textContent = `${u.full_name} (${u.username})`;
    document.getElementById("usSelect").value = u.status || "ACTIVE";
    hideFormMsg("usMsg");
    openModal("modalUserStatus");
  }
  async function confirmUserStatus() {
    if (!userStatusTarget) return;
    const btn = document.getElementById("userStatusBtn") || document.querySelector('#modalUserStatus .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      const res = await fetch(`${API}/users/${userStatusTarget}/status`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ status: document.getElementById("usSelect").value }) });
      const data = await res.json();
      if (!res.ok || !data.success) { showFormMsg("usMsg", data.message || "Lỗi", true); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Cập nhật'; } return; }
      showToast("Cập nhật trạng thái thành công!", "success");
      loadUsers();
      setTimeout(() => { closeModal("modalUserStatus"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Cập nhật'; } userStatusTarget = null; }, 400);
    } catch (err) { showFormMsg("usMsg", "Lỗi kết nối: " + err.message, true); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Cập nhật'; } }
  }

  // ══════════════════════════════════
  // REPORTS — /api/reports
  // ══════════════════════════════════
  async function loadReports() {
    document.getElementById("reportSummary").innerHTML = "";
    document.getElementById("reportRecentOrders").innerHTML = loadRow(5);
    try {
      const [sumRes, recentRes, traderRes, stallRes] = await Promise.all([
        fetch(`${API}/reports/summary`),
        fetch(`${API}/reports/recent-orders`),
        fetch(`${API}/reports/top-traders`),
        fetch(`${API}/reports/stall-status`),
      ]);
      const sum    = await sumRes.json();
      const recent = recentRes.ok ? (await recentRes.json()).data || [] : [];
      const traders = traderRes.ok ? (await traderRes.json()).data || [] : [];
      const stallStatus = stallRes.ok ? (await stallRes.json()).data || [] : [];

      // Summary cards
      document.getElementById("reportSummary").innerHTML = `
        <div class="stat-card"><div class="top"><span class="label">Tiểu thương</span><div class="icon-box ic-green"><i class="fa-solid fa-users"></i></div></div><div class="value">${sum.traders ?? "—"}</div></div>
        <div class="stat-card"><div class="top"><span class="label">Sản phẩm</span><div class="icon-box ic-blue"><i class="fa-solid fa-box"></i></div></div><div class="value">${sum.products ?? "—"}</div></div>
        <div class="stat-card"><div class="top"><span class="label">Đơn hàng</span><div class="icon-box ic-amber"><i class="fa-solid fa-cart-shopping"></i></div></div><div class="value">${sum.orders ?? "—"}</div></div>
        <div class="stat-card"><div class="top"><span class="label">Tổng sạp</span><div class="icon-box ic-purple"><i class="fa-solid fa-border-all"></i></div></div><div class="value">${sum.stalls ?? "—"}</div><div class="delta neutral">Đang thuê: ${sum.occupied ?? "—"}</div></div>
        <div class="stat-card"><div class="top"><span class="label">Hóa đơn chưa TT</span><div class="icon-box ic-red"><i class="fa-solid fa-file-invoice-dollar"></i></div></div><div class="value">${sum.unpaid ?? "—"}</div></div>
        <div class="stat-card"><div class="top"><span class="label">Doanh thu</span><div class="icon-box ic-green"><i class="fa-solid fa-coins"></i></div></div><div class="value">${sum.revenue != null ? fmtCurrency(sum.revenue) : "—"}</div></div>
      `;

      // Stall status
      const stallStatusEl = document.getElementById("reportStallStatus");
      if (stallStatusEl) {
        const STATUS_LABEL = { available: "Trống", rented: "Đang thuê", maintenance: "Bảo trì", OCCUPIED: "Đang thuê" };
        const STATUS_COLOR = { available: "var(--info)", rented: "var(--primary)", maintenance: "var(--accent)", OCCUPIED: "var(--primary)" };
        stallStatusEl.innerHTML = stallStatus.map(s => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${STATUS_COLOR[s.status] || "var(--text3)"};flex-shrink:0;"></div>
            <div style="flex:1;font-size:13px;color:var(--text2);">${STATUS_LABEL[s.status] || s.status}</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${s.total}</div>
          </div>
        `).join("") || '<div class="tc" style="color:var(--text3);font-size:13px;padding:20px 0;">Không có dữ liệu</div>';
      }

      // Top traders
      const topTraderEl = document.getElementById("reportTopTraders");
      if (topTraderEl) {
        const maxOrders = Math.max(...traders.map(t => Number(t.total_orders)), 1);
        topTraderEl.innerHTML = traders.map(t => `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;"><span style="color:var(--text2);font-weight:500;">${t.business_name}</span><strong>${t.total_orders} đơn</strong></div>
            <div style="height:6px;background:var(--bg);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${Math.round(Number(t.total_orders)/maxOrders*100)}%;background:var(--primary);border-radius:99px;"></div></div>
          </div>
        `).join("") || '<div class="tc" style="color:var(--text3);font-size:13px;padding:20px 0;">Không có dữ liệu</div>';
      }

      // Recent orders
      document.getElementById("reportRecentOrders").innerHTML = recent.map(o => `
        <tr><td><strong>#${o.id}</strong></td><td>${o.full_name || "—"}</td><td>${o.business_name || "—"}</td>
        <td><strong style="color:var(--primary);">${fmtCurrency(o.total_amount)}</strong></td>
        <td>${fmtDate(o.created_at)}</td></tr>
      `).join("") || emptyRow(5, "Không có đơn hàng gần đây");
    } catch (err) { showToast("Lỗi tải báo cáo: " + err.message, "error"); }
  }

  // ══════════════════════════════════
  // RESPONSIVE
  // ══════════════════════════════════
  function checkMobile() {
    const btn = document.getElementById("sidebarToggle");
    if (btn) btn.style.display = window.innerWidth <= 720 ? "flex" : "none";
  }
  window.addEventListener("resize", checkMobile);
  checkMobile();

  
  document.addEventListener("DOMContentLoaded", () => {
    loadAdminInfo();
    loadDashboard();
    loadProducts();
  });