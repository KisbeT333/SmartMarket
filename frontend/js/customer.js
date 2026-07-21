/* ══════════════════════════════════════════════════
   SmartMarket — customer.js v1.0
   Khách hàng: Sản phẩm · Chợ · Giỏ hàng · Đơn hàng · Hồ sơ
══════════════════════════════════════════════════ */

const API      = "https://smartmarket-a133.onrender.com/api";
const BASE_URL = "https://smartmarket-a133.onrender.com";

// Ghép URL ảnh đầy đủ từ path lưu trong DB (/uploads/products/xxx.jpg)
function imgUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/* ─── STATE ─── */
let ME            = null;   // user đang đăng nhập
let productCache  = [];
let marketCache   = [];
let stallCache    = [];
let cartCache     = [];     // { id, quantity, product_id, name, price, image_url }
let orderCache    = [];

const pages   = {};
const PAGE_SZ = 12;

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function getToken() {
  return localStorage.getItem("token") || new URLSearchParams(location.search).get("token") || "";
}
function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
function logout() {
  if (!confirm("Đăng xuất?")) return;
  localStorage.removeItem("token");
  window.location.href = "../pages/login.html";
}

/* ── Lưu token từ URL vào localStorage (Google login redirect) ── */
(function saveTokenFromUrl() {
  const urlToken = new URLSearchParams(location.search).get("token");
  if (urlToken) {
    localStorage.setItem("token", urlToken);
    history.replaceState({}, "", location.pathname);
  }
})();

/* ── Đọc thông tin user từ JWT ── */
function parseJwt() {
  try {
    const t = getToken();
    if (!t) return null;
    return JSON.parse(atob(t.split(".")[1]));
  } catch { return null; }
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
const TOAST_ICON = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", warning: "fa-triangle-exclamation" };
function showToast(msg, type = "info", duration = 3200) {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${TOAST_ICON[type]}"></i><span style="flex:1">${msg}</span><button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>`;
  c.appendChild(el);
  setTimeout(() => dismissToast(el), duration);
}
function dismissToast(el) {
  if (!el?.parentElement) return;
  el.classList.add("leaving");
  setTimeout(() => el?.remove(), 220);
}

/* ══════════════════════════════════════
   FORM MESSAGE
══════════════════════════════════════ */
function showMsg(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `form-msg show ${isError ? "error" : "success"}`;
}
function hideMsg(id) {
  const el = document.getElementById(id);
  if (el) el.className = "form-msg";
}

/* ══════════════════════════════════════
   MODAL
══════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }
function closeModalOverlay(e, id) { if (e.target.id === id) closeModal(id); }
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(el => el.classList.remove("open"));
});

/* ══════════════════════════════════════
   NAVIGATION (TABS)
══════════════════════════════════════ */
const TAB_LOADERS = {
  products: loadProducts,
  markets:  loadMarkets,
  wishlist: renderWishlistPage,
  cart:     renderCart,
  orders:   loadOrders,
  profile:  loadProfile,
};

function goTab(tab) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`page-${tab}`)?.classList.add("active");
  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add("active");
  if (TAB_LOADERS[tab]) TAB_LOADERS[tab]();
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function fmtCurrency(v) { return (v == null || v === "") ? "—" : Number(v).toLocaleString("vi-VN") + " đ"; }
function fmtDate(v)     { return v ? new Date(v).toLocaleDateString("vi-VN") : "—"; }
function fmtDateTime(v) {
  if (!v) return "Không rõ thời gian";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "Không rõ thời gian";
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("vi-VN");
  return `${time} · ${date}`;
}
/* Lấy giá trị đầu tiên khác rỗng trong danh sách tên trường (backend có thể đặt tên khác nhau) */
function pickField(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}
const EMOJIS = ["🥦","🥕","🍅","🌽","🥬","🍋","🍎","🧅","🫚","🍞","🥩","🐟","🍄","🥜","🍓","🫐","🧄","🌶️"];
function prodEmoji(name) {
  const map = { thịt:"🥩", cá:"🐟", rau:"🥬", quả:"🍎", trái:"🍎", bánh:"🍞", gạo:"🌾", trứng:"🥚", sữa:"🥛", dầu:"🫚", nấm:"🍄", tôm:"🍤" };
  const n = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(map)) if (n.includes(k)) return v;
  return EMOJIS[Math.abs([...name].reduce((a,c)=>a+c.charCodeAt(0),0)) % EMOJIS.length];
}

/* Dựng vùng ảnh sản phẩm: dùng ảnh thật nếu có, tự động rơi về emoji nếu ảnh lỗi/không có */
function prodMediaHTML(p) {
  const src = imgUrl(p.image_url);
  const emoji = prodEmoji(p.name || "");
  const hasStock = typeof p.stock === "number" && Number.isFinite(p.stock);
  const stockPill = !hasStock ? "" : (p.stock <= 20
    ? `<span class="prod-stock low"><span class="dot"></span>Sắp hết${p.unit ? " · " + p.stock + " " + p.unit : ""}</span>`
    : `<span class="prod-stock"><span class="dot"></span>Còn hàng</span>`);
  const media = src
    ? `<img src="${src}" alt="${p.name}" loading="lazy" onerror="this.outerHTML='<span class=&quot;media-fallback&quot;>${emoji}</span>'">`
    : `<span class="media-fallback">${emoji}</span>`;
  return `${stockPill}${media}`;
}

/* Ảnh sản phẩm trong giỏ hàng — dùng ảnh thật, rơi về emoji nếu lỗi/không có */
function cartItemImgHTML(item) {
  const src = imgUrl(item.image_url);
  const emoji = prodEmoji(item.name || "");
  return src
    ? `<img src="${src}" alt="${item.name || ""}" onerror="this.parentElement.textContent='${emoji}'">`
    : emoji;
}

/* Dựng ảnh bìa cho card chợ, chỉ hiển thị khi có ảnh thật */
function mktMediaHTML(m) {
  const src = imgUrl(m.image_url);
  if (!src) return "";
  return `<div class="mkt-media"><img src="${src}" alt="Ảnh ${m.name}" loading="lazy" onerror="this.closest('.mkt-media').remove()"></div>`;
}

/* ══════════════════════════════════════
   YÊU THÍCH — lưu cục bộ theo trình duyệt
══════════════════════════════════════ */
const WISH_KEY = "smartmarket_wishlist";
function getWishlist() {
  try { return JSON.parse(localStorage.getItem(WISH_KEY)) || []; } catch { return []; }
}
function saveWishlist(arr) { localStorage.setItem(WISH_KEY, JSON.stringify(arr)); }
function isWished(id) { return getWishlist().includes(Number(id)); }

function toggleWishlist(id, e) {
  e && e.stopPropagation && e.stopPropagation();
  id = Number(id);
  let list = getWishlist();
  const was = list.includes(id);
  list = was ? list.filter(x => x !== id) : [...list, id];
  saveWishlist(list);
  updateWishBadge();
  showToast(was ? "Đã bỏ khỏi yêu thích" : "Đã thêm vào yêu thích ❤", was ? "info" : "success", 1800);

  // Cập nhật lại UI đang hiển thị (nếu có)
  document.querySelectorAll(`.prod-wish-btn[data-id="${id}"]`).forEach(b => b.classList.toggle("active", !was));
  const mpBtn = document.getElementById("mpWishBtn");
  if (mpBtn && Number(mpBtn.dataset.id) === id) mpBtn.classList.toggle("active", !was);
  if (document.getElementById("page-wishlist")?.classList.contains("active")) renderWishlistPage();
}

function updateWishBadge() {
  const count = getWishlist().length;
  ["wishBadge", "wishTabBadge"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? "" : "none";
  });
}

function renderWishlistPage() {
  const grid = document.getElementById("wishGrid");
  const list = getWishlist();
  const items = productCache.filter(p => list.includes(Number(p.id)));
  document.getElementById("wishCount").textContent = `${items.length} sản phẩm`;

  if (!productCache.length) {
    grid.innerHTML = [1,2,3].map(() => `<div class="skeleton"></div>`).join("");
    loadProducts().then(renderWishlistPage);
    return;
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-heart-crack"></i><p>Chưa có sản phẩm yêu thích nào</p><button onclick="goTab('products')"><i class="fa-solid fa-store"></i> Khám phá sản phẩm</button></div>`;
    return;
  }

  grid.innerHTML = items.map(p => `
    <div class="prod-card" onclick="openProductDetail(${p.id})">
      <div class="prod-img">
        <button class="prod-wish-btn active" data-id="${p.id}" onclick="toggleWishlist(${p.id}, event)" title="Bỏ yêu thích"><i class="fa-solid fa-heart"></i></button>
        ${prodMediaHTML(p)}
      </div>
      <div class="prod-body">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.business_name || "—"} · ${p.stall_code || ""}</div>
        <div class="prod-foot">
          <div class="prod-price">${fmtCurrency(p.price)}</div>
          <button class="add-cart-btn" onclick="event.stopPropagation();addToCart(${p.id})" title="Thêm vào giỏ">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

/* ══════════════════════════════════════
   ĐÃ XEM GẦN ĐÂY — lưu cục bộ theo trình duyệt
══════════════════════════════════════ */
const RECENT_KEY = "smartmarket_recent";
function pushRecent(id) {
  id = Number(id);
  let arr = getRecentIds().filter(x => x !== id);
  arr.unshift(id);
  arr = arr.slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
}
function getRecentIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

function renderRecentlyViewed() {
  const section = document.getElementById("recentSection");
  const strip   = document.getElementById("recentStrip");
  if (!section || !strip) return;
  const ids = getRecentIds();
  const items = ids.map(id => productCache.find(p => Number(p.id) === id)).filter(Boolean);

  if (!items.length) { section.style.display = "none"; return; }
  section.style.display = "";
  strip.innerHTML = items.map(p => {
    const src = imgUrl(p.image_url);
    const emoji = prodEmoji(p.name || "");
    return `
    <div class="recent-card" onclick="openProductDetail(${p.id})">
      <div class="recent-card-img">${src ? `<img src="${src}" alt="${p.name}" onerror="this.parentElement.textContent='${emoji}'">` : emoji}</div>
      <div class="recent-card-name">${p.name}</div>
      <div class="recent-card-price">${fmtCurrency(p.price)}</div>
    </div>`;
  }).join("");
}

/* Cập nhật số liệu banner chào mừng ở trang Sản phẩm */
function updateWelcomeStats() {
  const pc = document.getElementById("welcomeProdCount");
  const mc = document.getElementById("welcomeMktCount");
  const cc = document.getElementById("welcomeCartCount");
  if (pc) pc.textContent = fmtNum(productCache.length);
  if (mc) mc.textContent = marketCache.length ? fmtNum(marketCache.length) : "—";
  if (cc) cc.textContent = fmtNum(cartCache.reduce((s, i) => s + (i.quantity || 1), 0));
}
function fmtNum(n) { return Number(n || 0).toLocaleString("vi-VN"); }

/* ══════════════════════════════════════
   PAGINATION
══════════════════════════════════════ */
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
    if (edge || near) btns += `<button class="pg-btn ${i === cur ? "active" : ""}" onclick="${fnName}(${i})">${i}</button>`;
    else if (i === 2 || i === total - 1) btns += `<span style="padding:0 3px;color:var(--text3)">…</span>`;
  }
  el.innerHTML = `<span>${count} mục · Trang ${cur}/${total}</span>
    <div class="pg-controls">
      <button class="pg-btn" ${cur<=1?"disabled":""} onclick="${fnName}(${cur-1})">← Trước</button>
      ${btns}
      <button class="pg-btn" ${cur>=total?"disabled":""} onclick="${fnName}(${cur+1})">Tiếp →</button>
    </div>`;
}

/* ══════════════════════════════════════
   PRODUCTS — GET /api/products
══════════════════════════════════════ */
async function loadProducts() {
  document.getElementById("productGrid").innerHTML = [1,2,3,4,5,6].map(()=>`<div class="skeleton"></div>`).join("");
  try {
    const res = await fetch(`${API}/products`);
    productCache = (await res.json()).data || [];

    // Populate market filter
    const markets = [...new Set(productCache.map(p => p.market_name).filter(Boolean))];
    const sel = document.getElementById("prodFilterMarket");
    const prev = sel.value;
    sel.innerHTML = '<option value="">Tất cả chợ</option>';
    markets.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; sel.appendChild(o); });
    if (prev) sel.value = prev;

    pages["products"] = 1;
    renderProducts();
  } catch (err) {
    document.getElementById("productGrid").innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Lỗi tải sản phẩm</p></div>`;
  }
}

function renderProducts() {
  const kw   = (document.getElementById("prodSearch")?.value || "").toLowerCase();
  const mkt  = document.getElementById("prodFilterMarket")?.value || "";
  const sort = document.getElementById("prodSort")?.value || "";
  let filtered = productCache.filter(p => {
    if (mkt && p.market_name !== mkt) return false;
    if (kw  && !`${p.name} ${p.business_name || ""}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  if (sort === "price_asc")  filtered = [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
  if (sort === "price_desc") filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
  if (sort === "name_asc")   filtered = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

  document.getElementById("prodCount").textContent = `${filtered.length} sản phẩm`;
  document.getElementById("prodCountLabel").textContent = `${filtered.length} / ${productCache.length} sản phẩm`;

  const { items, total, cur } = paginate(filtered, "products");
  const grid = document.getElementById("productGrid");

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-box-open"></i><p>Không tìm thấy sản phẩm nào</p><button onclick="document.getElementById('prodSearch').value='';document.getElementById('prodFilterMarket').value='';renderProducts()">Xóa bộ lọc</button></div>`;
    document.getElementById("productPagination").innerHTML = "";
    return;
  }

  grid.innerHTML = items.map(p => `
    <div class="prod-card" onclick="openProductDetail(${p.id})">
      <div class="prod-img">
        <button class="prod-wish-btn ${isWished(p.id) ? "active" : ""}" data-id="${p.id}" onclick="toggleWishlist(${p.id}, event)" title="Yêu thích"><i class="fa-solid fa-heart"></i></button>
        ${prodMediaHTML(p)}
      </div>
      <div class="prod-body">
        <div class="prod-name">${p.name}</div>
        <div class="prod-meta">${p.business_name || "—"} · ${p.stall_code || ""}</div>
        <div class="prod-foot">
          <div class="prod-price">${fmtCurrency(p.price)}</div>
          <button class="add-cart-btn" onclick="event.stopPropagation();addToCart(${p.id})" title="Thêm vào giỏ">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `).join("");

  renderPag("productPagination", cur, total, filtered.length, "goProductPage");
  renderRecentlyViewed();
  updateWelcomeStats();
}
function goProductPage(p) { pages["products"] = p; renderProducts(); }

let mpQty = 1;
function changeMpQty(delta) {
  mpQty = Math.max(1, Math.min(99, mpQty + delta));
  document.getElementById("mpQtyValue").textContent = mpQty;
}

function openProductDetail(id) {
  const p = productCache.find(x => String(x.id) === String(id));
  if (!p) return;
  const emoji = prodEmoji(p.name);
  const src   = imgUrl(p.image_url);
  pushRecent(p.id);

  mpQty = 1;
  document.getElementById("mpQtyValue").textContent = mpQty;

  document.getElementById("mpTitle").textContent = p.name;
  const mpEmoji = document.getElementById("mpEmoji");
  mpEmoji.innerHTML = src
    ? `<img src="${src}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.parentElement.textContent='${emoji}'">`
    : emoji;

  const wishBtn = document.getElementById("mpWishBtn");
  wishBtn.dataset.id = p.id;
  wishBtn.classList.toggle("active", isWished(p.id));
  wishBtn.onclick = () => toggleWishlist(p.id);

  document.getElementById("mpBody").innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text3)">Giá</span><strong style="color:var(--primary);font-size:16px">${fmtCurrency(p.price)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text3)">Cơ sở</span><span>${p.business_name || "—"}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text3)">Sạp</span><span>${p.stall_code || "—"}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:8px 0">
      <span style="color:var(--text3)">Chợ</span><span>${p.market_name || "—"}</span>
    </div>
  `;
  document.getElementById("mpAddBtn").onclick = () => { addToCart(p.id, mpQty); closeModal("modalProduct"); };
  openModal("modalProduct");
  renderRecentlyViewed();
}

/* ══════════════════════════════════════
   MARKETS — GET /api/markets + /api/stalls
══════════════════════════════════════ */
async function loadMarkets() {
  document.getElementById("marketGrid").innerHTML = [1,2,3].map(()=>`<div class="skeleton"></div>`).join("");
  try {
    const [mRes, sRes] = await Promise.all([fetch(`${API}/markets`), fetch(`${API}/stalls`)]);
    marketCache = (await mRes.json()).data || [];
    stallCache  = (await sRes.json()).data || [];
    pages["markets"] = 1;
    renderMarkets();
    updateWelcomeStats();
  } catch {
    document.getElementById("marketGrid").innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Lỗi tải dữ liệu</p></div>`;
  }
}

function renderMarkets() {
  const kw = (document.getElementById("mktSearch")?.value || "").toLowerCase();
  const filtered = marketCache.filter(m => !kw || `${m.name} ${m.address || ""} ${m.city || ""}`.toLowerCase().includes(kw));

  document.getElementById("mktCountLabel").textContent = `${filtered.length} / ${marketCache.length} chợ`;

  const { items, total, cur } = paginate(filtered, "markets", 9);
  const grid = document.getElementById("marketGrid");

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-shop"></i><p>Không tìm thấy chợ nào</p></div>`;
    document.getElementById("marketPagination").innerHTML = "";
    return;
  }

  grid.innerHTML = items.map(m => `
    <div class="mkt-card">
      ${mktMediaHTML(m)}
      <div class="mkt-top">
        <div class="mkt-icon"><i class="fa-solid fa-shop"></i></div>
        <div>
          <div class="mkt-name">${m.name}</div>
          <div class="mkt-addr"><i class="fa-solid fa-location-dot" style="color:var(--accent);margin-right:4px;"></i>${m.address || ""}${m.city ? ", " + m.city : ""}</div>
        </div>
      </div>
      <div class="mkt-stats">
        <div class="stat"><b>${m.total_zones ?? "—"}</b><span>Khu</span></div>
        <div class="stat"><b>${m.total_stalls ?? "—"}</b><span>Sạp</span></div>
        <div class="stat"><b>${m.total_traders ?? "—"}</b><span>Tiểu thương</span></div>
      </div>
      <div class="mkt-actions">
        <button class="btn btn-secondary btn-sm btn-block" onclick="openMarketDetail(${m.id})">
          <i class="fa-solid fa-eye"></i> Xem sạp trống
        </button>
      </div>
    </div>
  `).join("");

  renderPag("marketPagination", cur, total, filtered.length, "goMarketPage");
}
function goMarketPage(p) { pages["markets"] = p; renderMarkets(); }

function openMarketDetail(id) {
  const m = marketCache.find(x => String(x.id) === String(id));
  if (!m) return;
  document.getElementById("mmTitle").textContent = m.name;
  const mmSrc = imgUrl(m.image_url);
  document.getElementById("mmBody").innerHTML = `
    ${mmSrc ? `<div style="height:160px;border-radius:var(--radius-sm);overflow:hidden;margin-bottom:14px;"><img src="${mmSrc}" alt="Ảnh ${m.name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.remove()"></div>` : ""}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <span style="font-size:13px;color:var(--text2)"><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${m.address || ""}${m.city ? ", "+m.city : ""}</span>
      ${m.manager_name ? `<span style="font-size:13px;color:var(--text2)"><i class="fa-solid fa-user-tie"></i> Quản lý: <strong>${m.manager_name}</strong></span>` : ""}
    </div>
    <div style="display:flex;gap:16px;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:14px;">
      <div style="text-align:center;flex:1"><b style="font-size:18px;color:var(--primary)">${m.total_stalls ?? "—"}</b><div style="font-size:12px;color:var(--text3)">Tổng sạp</div></div>
      <div style="text-align:center;flex:1"><b style="font-size:18px;color:var(--primary)">${m.total_traders ?? "—"}</b><div style="font-size:12px;color:var(--text3)">Tiểu thương</div></div>
    </div>
  `;
  const available = stallCache.filter(s => String(s.market_name) === String(m.name) && s.status === "available");
  const stallsEl = document.getElementById("mmStalls");
  if (!available.length) {
    stallsEl.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px;"><i class="fa-solid fa-circle-check" style="color:var(--primary);font-size:20px;display:block;margin-bottom:8px;"></i>Hiện không có sạp trống</div>`;
  } else {
    stallsEl.innerHTML = available.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div>
          <div style="font-weight:600;font-size:13.5px">${s.code}</div>
          <div style="font-size:12px;color:var(--text3)">${s.zone_name || ""} · ${s.area_m2 != null ? s.area_m2 + " m²" : ""}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--primary);font-size:14px">${s.monthly_rent ? fmtCurrency(s.monthly_rent) + "/tháng" : "—"}</div>
          <span class="badge badge-green" style="font-size:11px">Trống</span>
        </div>
      </div>
    `).join("");
  }
  openModal("modalMarket");
}

/* ══════════════════════════════════════
   CART — GET /api/cart/:customerId
══════════════════════════════════════ */
async function loadCart() {
  if (!ME) return;
  try {
    const res = await fetch(`${API}/cart/${ME.id}`);
    cartCache = (await res.json()).data || [];
    updateCartBadge();
  } catch { cartCache = []; }
}

function updateCartBadge() {
  const count = cartCache.reduce((a, c) => a + (c.quantity || 1), 0);
  ["cartBadge", "cartTabBadge"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? "" : "none";
  });
  updateWelcomeStats();
}

async function addToCart(productId, quantity = 1) {
  if (!ME) { showToast("Vui lòng đăng nhập để thêm vào giỏ hàng", "warning"); return; }
  try {
    const res = await fetch(`${API}/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: ME.id, product_id: productId, quantity })
    });
    const data = await res.json();
    if (!res.ok || !data.success) { showToast(data.message || "Không thể thêm vào giỏ", "error"); return; }
    await loadCart();
    showToast("Đã thêm vào giỏ hàng!", "success");
  } catch (err) {
    showToast("Lỗi kết nối: " + err.message, "error");
  }
}

async function updateQty(cartItemId, delta) {
  const item = cartCache.find(x => String(x.id) === String(cartItemId));
  if (!item) return;
  const newQty = (item.quantity || 1) + delta;
  if (newQty < 1) { await removeCartItem(cartItemId); return; }
  try {
    await fetch(`${API}/cart/${cartItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: newQty })
    });
    await loadCart();
    renderCart();
  } catch {}
}

async function removeCartItem(cartItemId) {
  try {
    await fetch(`${API}/cart/${cartItemId}`, { method: "DELETE" });
    await loadCart();
    renderCart();
  } catch {}
}

function renderCart() {
  loadCart().then(() => _renderCartUI());
}

function _renderCartUI() {
  const layout = document.getElementById("cartLayout");
  if (!cartCache.length) {
    layout.innerHTML = `
      <div style="grid-column:1/-1;">
        <div class="empty-state">
          <i class="fa-solid fa-cart-shopping"></i>
          <p>Giỏ hàng trống</p>
          <button onclick="goTab('products')"><i class="fa-solid fa-store"></i> Tiếp tục mua sắm</button>
        </div>
      </div>`;
    return;
  }

  const total = cartCache.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);

  layout.innerHTML = `
    <div class="card">
      <div style="font-weight:700;font-size:15px;margin-bottom:14px;">
        Sản phẩm (${cartCache.length})
      </div>
      ${cartCache.map(item => `
        <div class="cart-item">
          <div class="cart-item-img">${cartItemImgHTML(item)}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name || "—"}</div>
            <div class="cart-item-meta">${fmtCurrency(item.price)} / cái</div>
          </div>
          <div class="qty-ctrl">
            <button onclick="updateQty(${item.id}, -1)">−</button>
            <span>${item.quantity || 1}</span>
            <button onclick="updateQty(${item.id}, 1)">+</button>
          </div>
          <div class="cart-item-price">${fmtCurrency(Number(item.price || 0) * (item.quantity || 1))}</div>
          <button class="remove-btn" onclick="removeCartItem(${item.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join("")}
    </div>
    <div>
      <div class="card cart-summary">
        <div style="font-weight:700;font-size:15px;margin-bottom:14px;">Tóm tắt đơn hàng</div>
        <div class="summary-row"><span>Tạm tính</span><span>${fmtCurrency(total)}</span></div>
        <div class="summary-row"><span>Phí vận chuyển</span><span style="color:var(--primary)">Miễn phí</span></div>
        <div class="summary-row summary-total"><span>Tổng cộng</span><span>${fmtCurrency(total)}</span></div>
        <button class="btn btn-primary btn-block" style="margin-top:16px;" onclick="openCheckout()">
          <i class="fa-solid fa-credit-card"></i> Đặt hàng
        </button>
        <button class="btn btn-secondary btn-block" style="margin-top:8px;" onclick="goTab('products')">
          <i class="fa-solid fa-arrow-left"></i> Tiếp tục mua sắm
        </button>
      </div>
    </div>
  `;
}

const ADDRESS_KEY = "smartmarket_address";
const PAYMETHOD_KEY = "smartmarket_pay_method";

function openCheckout() {
  const total = cartCache.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);

  // Điền lại địa chỉ đã lưu lần trước (nếu có) để tiện cho khách
  document.getElementById("checkoutAddress").value = localStorage.getItem(ADDRESS_KEY) || "";
  document.getElementById("checkoutNote").value = "";

  // Khôi phục phương thức thanh toán đã chọn lần trước
  const savedMethod = localStorage.getItem(PAYMETHOD_KEY) || "cod";
  const radio = document.querySelector(`input[name="payMethod"][value="${savedMethod}"]`);
  if (radio) radio.checked = true;
  onPayMethodChange();

  document.getElementById("checkoutSummary").innerHTML = `
    <div class="co-row"><span>${cartCache.length} sản phẩm</span><span>${fmtCurrency(total)}</span></div>
    <div class="co-row"><span>Phí vận chuyển</span><span style="color:var(--green-800)">Miễn phí</span></div>
    <div class="co-row co-total"><span>Tổng thanh toán</span><span>${fmtCurrency(total)}</span></div>
  `;
  hideMsg("checkoutMsg");
  openModal("modalCheckout");
}

/* Cập nhật giao diện khi khách chọn phương thức thanh toán khác */
function onPayMethodChange() {
  const checked = document.querySelector('input[name="payMethod"]:checked');
  const val = checked ? checked.value : "cod";
  document.querySelectorAll(".pay-option").forEach(el => {
    el.classList.toggle("selected", el.dataset.method === val);
  });
  document.getElementById("payDetailMomo").style.display = val === "momo" ? "" : "none";
  document.getElementById("payDetailBank").style.display = val === "bank" ? "" : "none";
}

async function placeOrder() {
  if (!ME) return;
  hideMsg("checkoutMsg");

  const address = document.getElementById("checkoutAddress").value.trim();
  const note    = document.getElementById("checkoutNote").value.trim();
  const method  = document.querySelector('input[name="payMethod"]:checked')?.value || "cod";

  if (!address) {
    showMsg("checkoutMsg", "Vui lòng nhập địa chỉ giao hàng", true);
    document.getElementById("checkoutAddress").focus();
    return;
  }

  // Lưu lại để lần đặt hàng sau tự điền sẵn
  localStorage.setItem(ADDRESS_KEY, address);
  localStorage.setItem(PAYMETHOD_KEY, method);

  const btn = document.getElementById("confirmOrderBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đặt...';
  try {
    const res = await fetch(`${API}/orders/${ME.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ address, note, payment_method: method })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showMsg("checkoutMsg", data.message || "Không thể đặt hàng", true);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận đặt hàng';
      return;
    }
    const methodLabel = { cod: "thanh toán khi nhận hàng", momo: "ví MoMo", bank: "chuyển khoản ngân hàng" }[method];
    showToast(`🎉 Đặt hàng thành công! Thanh toán qua ${methodLabel}.`, "success", 4500);
    closeModal("modalCheckout");
    await loadCart();
    goTab("orders");
  } catch (err) {
    showMsg("checkoutMsg", "Lỗi kết nối: " + err.message, true);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận đặt hàng';
  }
}

/* ══════════════════════════════════════
   ORDERS — GET /api/orders (lọc theo customer)
══════════════════════════════════════ */
async function loadOrders() {
  document.getElementById("orderList").innerHTML = [1,2].map(()=>`<div class="skeleton" style="height:100px;margin-bottom:12px;"></div>`).join("");
  try {
    const res = await fetch(`${API}/orders`, { headers: authHeader() });
    const all = (await res.json()).data || [];
    // Lọc theo customer_id hiện tại
    orderCache = ME ? all.filter(o => String(o.customer_id) === String(ME.id)) : all;
    renderOrders();
  } catch {
    document.getElementById("orderList").innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Lỗi tải đơn hàng</p></div>`;
  }
}

function renderOrders() {
  const el = document.getElementById("orderList");
  document.getElementById("orderCount").textContent = `${orderCache.length} đơn hàng`;

  if (!orderCache.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box-open"></i><p>Bạn chưa có đơn hàng nào</p><button onclick="goTab('products')"><i class="fa-solid fa-store"></i> Mua sắm ngay</button></div>`;
    return;
  }

  el.innerHTML = orderCache.map(o => {
    const methodMap = { cod: { label: "COD", icon: "fa-truck-fast" }, momo: { label: "MoMo", icon: "fa-wallet" }, bank: { label: "Chuyển khoản", icon: "fa-building-columns" } };
    const pm = methodMap[o.payment_method] || null;

    const business = pickField(o, ["business_name", "businessName", "shop_name", "stall_name", "market_name"])
      || (Array.isArray(o.items) && o.items.length
          ? [...new Set(o.items.map(i => i.business_name).filter(Boolean))].join(", ")
          : null);

    const address = pickField(o, ["address", "shipping_address", "delivery_address", "customer_address"]);
    const orderedAt = pickField(o, ["created_at", "createdAt", "order_date", "ordered_at", "created"]);

    return `
    <div class="order-card">
      <div class="order-head">
        <div>
          <div class="order-id"><i class="fa-solid fa-receipt" style="color:var(--primary);margin-right:6px;"></i>Đơn hàng #${o.id}</div>
          <div class="order-date"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>${fmtDateTime(orderedAt)}</div>
        </div>
        <span class="badge badge-green">Hoàn thành</span>
      </div>
      <div class="order-info-grid">
        <div class="order-info-row"><i class="fa-solid fa-store"></i><span>Cơ sở: <strong>${business || "Chưa cập nhật"}</strong></span></div>
        <div class="order-info-row"><i class="fa-solid fa-location-dot"></i><span>${address || "Chưa cập nhật địa chỉ giao hàng"}</span></div>
      </div>
      <div class="order-foot">
        ${pm ? `<span class="badge"><i class="fa-solid ${pm.icon}" style="margin-right:4px;"></i>${pm.label}</span>` : "<span></span>"}
        <div class="order-total">${fmtCurrency(o.total_amount)}</div>
      </div>
    </div>`;
  }).join("");
}

/* ══════════════════════════════════════
   PROFILE — GET /api/users/profile
══════════════════════════════════════ */
async function loadProfile() {
  if (!ME) return;
  try {
    const res = await fetch(`${API}/users/profile`, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok || !data.user) return;
    const u = data.user;
    const initials = (u.full_name || "KH").split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();
    document.getElementById("profileAvatar").textContent = initials;
    document.getElementById("profileName").textContent   = u.full_name || "—";
    document.getElementById("profileUsername").value     = u.username || "";
    document.getElementById("profileFullName").value     = u.full_name || "";
    document.getElementById("profilePhone").value        = u.phone || "";
    document.getElementById("profileEmail").value        = u.email || "";
    // Cập nhật avatar header
    document.getElementById("avatarBtn").textContent = initials;
  } catch {}
}

async function saveProfile() {
  hideMsg("profileMsg");
  const payload = {
    full_name: document.getElementById("profileFullName").value.trim(),
    phone:     document.getElementById("profilePhone").value.trim() || null,
    email:     document.getElementById("profileEmail").value.trim() || null,
  };
  if (!payload.full_name) { showMsg("profileMsg", "Vui lòng nhập họ và tên", true); return; }
  try {
    const res = await fetch(`${API}/users/${ME.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) { showMsg("profileMsg", data.message || "Không thể cập nhật", true); return; }
    showMsg("profileMsg", "Cập nhật thông tin thành công!");
    showToast("Cập nhật hồ sơ thành công!", "success");
    // Cập nhật avatar
    const initials = (payload.full_name).split(" ").map(w=>w[0]).slice(-2).join("").toUpperCase();
    document.getElementById("profileAvatar").textContent = initials;
    document.getElementById("profileName").textContent   = payload.full_name;
    document.getElementById("avatarBtn").textContent     = initials;
  } catch (err) {
    showMsg("profileMsg", "Lỗi kết nối: " + err.message, true);
  }
}

function openChangePwdModal() {
  document.getElementById("newPwd").value    = "";
  document.getElementById("confirmPwd").value = "";
  hideMsg("pwdMsg");
  openModal("modalChangePwd");
}

async function changePwd() {
  const pwd  = document.getElementById("newPwd").value;
  const conf = document.getElementById("confirmPwd").value;
  if (!pwd || pwd.length < 6) { showMsg("pwdMsg", "Mật khẩu phải ít nhất 6 ký tự", true); return; }
  if (pwd !== conf)            { showMsg("pwdMsg", "Mật khẩu xác nhận không khớp", true); return; }
  try {
    const res = await fetch(`${API}/users/${ME.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (!res.ok || !data.success) { showMsg("pwdMsg", data.message || "Lỗi", true); return; }
    showToast("Đổi mật khẩu thành công!", "success");
    closeModal("modalChangePwd");
  } catch (err) {
    showMsg("pwdMsg", "Lỗi kết nối: " + err.message, true);
  }
}

/* ══════════════════════════════════════
   HEADER DROPDOWN
══════════════════════════════════════ */
function toggleDropdown() {
  document.getElementById("dropdownMenu").classList.toggle("open");
}
document.addEventListener("click", e => {
  const dd = document.getElementById("userDropdown");
  if (dd && !dd.contains(e.target)) document.getElementById("dropdownMenu")?.classList.remove("open");
});

/* ══════════════════════════════════════
   GLOBAL SEARCH (header)
══════════════════════════════════════ */
document.getElementById("globalSearch").addEventListener("input", function() {
  const kw = this.value.trim();
  if (!kw) return;
  // Chuyển sang tab sản phẩm và tìm kiếm
  goTab("products");
  document.getElementById("prodSearch").value = kw;
  renderProducts();
});
document.getElementById("globalSearch").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    const kw = this.value.trim();
    if (!kw) return;
    goTab("products");
    document.getElementById("prodSearch").value = kw;
    renderProducts();
  }
});

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // Đọc thông tin từ JWT
  const payload = parseJwt();
  if (payload) {
    ME = { id: payload.id, username: payload.username, role_name: payload.role_name };
    // Nếu không phải CUSTOMER thì redirect
    if (ME.role_name && !["CUSTOMER", "customer"].includes(ME.role_name.toLowerCase())) {
      // Cho phép mọi role xem trang này nếu muốn; chỉ cảnh báo
      console.warn("Role:", ME.role_name);
    }
    // Hiển thị initials tạm thời từ JWT
    const initials = (payload.full_name || payload.username || "KH").split(" ").map(w=>w[0]).slice(-2).join("").toUpperCase();
    document.getElementById("avatarBtn").textContent = initials;
  }

  // Cá nhân hoá lời chào nếu biết tên
  const welcomeName = document.getElementById("welcomeName");
  if (welcomeName && payload?.full_name) {
    welcomeName.textContent = `Chào ${payload.full_name} 👋`;
  }

  updateWishBadge();
  setupScrollTopBtn();

  // Load dữ liệu ban đầu
  await Promise.all([
    loadProducts(),
    loadMarkets(),
    loadCart(),
  ]);
});

/* ══════════════════════════════════════
   SCROLL TO TOP
══════════════════════════════════════ */
function setupScrollTopBtn() {
  const btn = document.getElementById("scrollTopBtn");
  if (!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("show", window.scrollY > 400);
  }, { passive: true });
}