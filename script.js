/* ==========================================================================
   SmartMarket — Homepage script.js v2.1
   Kết nối API thật từ backend (server.js / routes).
   Không còn dữ liệu mẫu — mọi dữ liệu hiển thị đều lấy trực tiếp từ backend.
   ========================================================================== */

const API      = "http://localhost:3000/api";
const BASE_URL = "http://localhost:3000";

// Ghép URL ảnh đầy đủ từ path lưu trong DB (/uploads/products/xxx.jpg)
function imgUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/* --------------------------------------------------------------------------
   1. FETCH — chỉ dùng dữ liệu thật từ backend, không còn fallback dữ liệu mẫu
   -------------------------------------------------------------------------- */
async function fetchAPI(path) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 3000);
    const res  = await fetch(`${API}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[SmartMarket] Lỗi khi gọi ${path}:`, err.message);
    return null;
  }
}

/* --------------------------------------------------------------------------
   3. TIỆN ÍCH
   -------------------------------------------------------------------------- */
const fmtVND  = (n) => Number(n).toLocaleString("vi-VN") + "đ";
const fmtM    = (n) => (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M đ";
const fmtNum  = (n) => Number(n).toLocaleString("vi-VN");

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, d => d === "đ" ? "d" : "D").toLowerCase();
}

/* --------------------------------------------------------------------------
   4. GIỎ HÀNG — in-memory, giống cart_items trong DB
   -------------------------------------------------------------------------- */
let cart = [];         // [{ product, quantity }]
let allProducts = [];  // cache full product list

function getCartTotal() {
  return cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
}
function getCartCount() {
  return cart.reduce((s, i) => s + i.quantity, 0);
}

function addToCart(product) {
  const existing = cart.find(i => i.product.id === product.id);
  if (existing) existing.quantity++;
  else cart.push({ product, quantity: 1 });
  updateCartBadge();
  renderCartItems();
  openCartDrawer();
}

function updateCartBadge() {
  const el = document.getElementById("cartBadge");
  if (!el) return;
  const count = getCartCount();
  el.textContent = count;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function renderCartItems() {
  const el    = document.getElementById("cartItems");
  const emEl  = document.getElementById("cartEmpty");
  const ftEl  = document.getElementById("cartFooter");
  const ttEl  = document.getElementById("cartTotal");
  if (!el) return;

  if (!cart.length) {
    el.innerHTML = "";
    if (emEl) emEl.style.display = "flex";
    if (ftEl) ftEl.style.display = "none";
    return;
  }

  if (emEl) emEl.style.display = "none";
  if (ftEl) ftEl.style.display = "";
  if (ttEl) ttEl.textContent = fmtVND(getCartTotal());

  el.innerHTML = cart.map((item, idx) => {
    const src = imgUrl(item.product.image_url);
    return `
    <div class="cart-item">
      <div class="ci-icon" style="width:48px;height:48px;border-radius:8px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--paper-card);border:1px solid var(--line);font-size:1.7rem;">${src
        ? `<img src="${src}" alt="${item.product.name}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.textContent='${item.product.icon || "📦"}'">`
        : (item.product.icon || "📦")}</div>
      <div class="ci-body">
        <div class="ci-name">${item.product.name}</div>
        <div class="ci-meta">Sạp ${item.product.stall_code || "—"} · ${item.product.market_name || "—"}</div>
        <div class="ci-qty-row">
          <button class="ci-qty-btn" onclick="changeQty(${idx},-1)" aria-label="Giảm">−</button>
          <span class="ci-qty">${item.quantity}</span>
          <button class="ci-qty-btn" onclick="changeQty(${idx},1)"  aria-label="Tăng">+</button>
          <span class="ci-price" style="margin-left:.5rem;">${fmtVND(item.product.price * item.quantity)}</span>
        </div>
      </div>
      <button class="ci-remove" onclick="removeFromCart(${idx})" aria-label="Xóa khỏi giỏ">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  `; }).join("");
}

function changeQty(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  updateCartBadge();
  renderCartItems();
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  updateCartBadge();
  renderCartItems();
}

function openCartDrawer() {
  const drawer  = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (drawer)  { drawer.removeAttribute("hidden"); }
  if (overlay) overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  const drawer  = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (drawer)  drawer.setAttribute("hidden", "");
  if (overlay) overlay.classList.remove("open");
  document.body.style.overflow = "";
}

/* --------------------------------------------------------------------------
   4b. LỊCH SỬ MUA HÀNG — tra cứu theo SĐT (không cần đăng nhập)
   -------------------------------------------------------------------------- */
const LAST_PHONE_KEY = "sm_last_order_phone";

const ORDER_STATUS_LABEL = {
  pending:   { text: "Chờ xử lý",   cls: "pending"   },
  confirmed: { text: "Đã xác nhận", cls: "confirmed" },
  completed: { text: "Hoàn thành",  cls: "completed" },
  cancelled: { text: "Đã hủy",      cls: "cancelled" },
};

function openOrdersDrawer() {
  const drawer  = document.getElementById("ordersDrawer");
  const overlay = document.getElementById("ordersOverlay");
  if (drawer)  drawer.removeAttribute("hidden");
  if (overlay) overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  const phoneInput = document.getElementById("lookupPhone");
  let savedPhone = "";
  try { savedPhone = localStorage.getItem(LAST_PHONE_KEY) || ""; } catch {}
  if (savedPhone && phoneInput && !phoneInput.value) {
    phoneInput.value = savedPhone;
    fetchOrderHistory(savedPhone);
  }
}

function closeOrdersDrawer() {
  const drawer  = document.getElementById("ordersDrawer");
  const overlay = document.getElementById("ordersOverlay");
  if (drawer)  drawer.setAttribute("hidden", "");
  if (overlay) overlay.classList.remove("open");
  document.body.style.overflow = "";
}

async function fetchOrderHistory(phone) {
  const errEl   = document.getElementById("lookupError");
  const emptyEl = document.getElementById("ordersEmpty");
  const listEl  = document.getElementById("ordersList");
  if (errEl) errEl.style.display = "none";
  if (listEl) listEl.innerHTML = `<p style="text-align:center;color:var(--ink-muted);font-size:.85rem;padding:1rem 0;">Đang tải...</p>`;
  if (emptyEl) emptyEl.style.display = "none";

  try {
    const res  = await fetch(`${API}/orders/history?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (listEl) listEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "flex";
      if (errEl) { errEl.textContent = data.message || "Không tra cứu được đơn hàng"; errEl.style.display = "block"; }
      return;
    }

    try { localStorage.setItem(LAST_PHONE_KEY, phone); } catch {}
    renderOrderHistory(data.data || []);
  } catch {
    if (listEl) listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "flex";
    if (errEl) { errEl.textContent = "Lỗi kết nối tới máy chủ."; errEl.style.display = "block"; }
  }
}

function renderOrderHistory(orders) {
  const listEl  = document.getElementById("ordersList");
  const emptyEl = document.getElementById("ordersEmpty");
  if (!listEl) return;

  if (!orders.length) {
    listEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.style.display = "flex";
      emptyEl.querySelector("p").textContent = "Không tìm thấy đơn hàng nào với số điện thoại này.";
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  listEl.innerHTML = orders.map(o => {
    const st = ORDER_STATUS_LABEL[o.status] || { text: o.status || "—", cls: "pending" };
    const date = o.created_at ? new Date(o.created_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    return `
      <div class="oh-item">
        <div class="oh-item-top">
          <div>
            <div class="oh-code">#${o.order_code || o.id}</div>
            <div class="oh-date">${date}${o.business_name ? " · " + o.business_name : ""}</div>
          </div>
          <span class="oh-badge ${st.cls}">${st.text}</span>
        </div>
        <div class="oh-total">${fmtVND(o.total_amount)}</div>
      </div>`;
  }).join("");
}

function setupOrdersDrawer() {
  document.getElementById("myOrdersBtn")?.addEventListener("click", openOrdersDrawer);
  document.getElementById("ordersDrawerClose")?.addEventListener("click", closeOrdersDrawer);
  document.getElementById("orderLookupForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const phone = (document.getElementById("lookupPhone")?.value || "").trim().replace(/[\s.-]/g, "");
    if (!phone) return;
    fetchOrderHistory(phone);
  });
}

/* --------------------------------------------------------------------------
   5. RENDER — HERO STATS từ /api/dashboard
   -------------------------------------------------------------------------- */
function renderHeroStats(dash) {
  const d = dash?.dashboard || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("statTraders",  fmtNum(d.traders || 0) + "+");
  set("statMarkets",  d.markets || 0);
  set("statProducts", fmtNum(d.products || 0) + "+");

  // Revenue card
  set("revenueValue",  fmtM(d.revenue || 0));
  set("revenueMarket", `Tổng ${d.markets || 0} chợ Cần Thơ`);
  const pct = Math.min(100, Math.round(((d.revenue || 0) / 400000000) * 100));
  requestAnimationFrame(() => {
    const bar = document.getElementById("revenueProgress");
    if (bar) bar.style.width = pct + "%";
  });
  refreshRevenueTime();

  // Rating (placeholder — không có bảng reviews trong schema gốc)
  set("ratingValue", "4.8");
  set("ratingCount", "1.248+ đánh giá");

  // Trader CTA stats
  set("tspTraders", fmtNum(d.traders || 0) + "+");
  set("tspStalls",  fmtNum(d.stalls?.total || 0));
  set("tspOrders",  fmtNum(d.orders || 0) + "+");
  set("tspRevenue", fmtM(d.revenue || 0));
}

function refreshRevenueTime() {
  const el = document.getElementById("revenueUpdated");
  if (!el) return;
  const now = new Date();
  el.textContent = `Cập nhật lúc ${now.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit" })}`;
}

/* --------------------------------------------------------------------------
   6. RENDER — FEATURED PRODUCT (panel nhỏ trong hero)
   -------------------------------------------------------------------------- */
function renderFeaturedProduct(product) {
  const card = document.getElementById("featuredProductCard");
  if (!card || !product) return;
  const src = imgUrl(product.image_url);
  card.innerHTML = `
    <div class="product-media" aria-hidden="true">
      ${src
        ? `<img src="${src}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.parentElement.textContent='📦'">`
        : (product.icon || "📦")}
    </div>
    <div class="product-card-body">
      <p class="product-name">${product.name}</p>
      <p class="product-meta">Sạp ${product.stall_code} · ${product.business_name}</p>
      <div class="product-row">
        <p class="product-price">${fmtVND(product.price)}<small>/${product.unit || "kg"}</small></p>
        <button class="add-btn" type="button" aria-label="Thêm ${product.name} vào giỏ">+</button>
      </div>
    </div>
  `;
  card.querySelector(".add-btn").addEventListener("click", () => addToCart(product));
}

/* --------------------------------------------------------------------------
   7. RENDER — CHỢ từ /api/markets
   -------------------------------------------------------------------------- */
function renderMarkets(markets) {
  const grid = document.getElementById("marketsGrid");
  if (!grid) return;
  grid.innerHTML = markets.map(m => {
    const src = imgUrl(m.image_url);
    return `
    <article class="market-card opacity-reveal">
      <div class="market-media${src ? "" : " no-image"}">
        ${src
          ? `<img src="${src}" alt="Ảnh ${m.name}" loading="lazy" onerror="this.closest('.market-media').classList.add('no-image');this.remove();">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10 5.5 4h13L20 10"/><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M9 20v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5"/></svg>`}
      </div>
      <div class="market-top">
        <h3>${m.name}</h3>
      </div>
      <p class="market-address">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/>
          <circle cx="12" cy="9.5" r="2.3"/>
        </svg>
        <span>${m.address}, ${m.city}</span>
      </p>
      <div class="market-stats">
        <div><b>${fmtNum(m.total_stalls)}</b><span>Sạp</span></div>
        <div><b>${fmtNum(m.total_traders)}</b><span>Tiểu thương</span></div>
        <div><b>${m.total_zones || "—"}</b><span>Khu vực</span></div>
      </div>
    </article>
  `;
  }).join("");
  observeReveal();
  setupMarketsCarousel(markets.length);
}

/* --------------------------------------------------------------------------
   7b. CAROUSEL — điều hướng cuộn ngang cho danh sách chợ
   -------------------------------------------------------------------------- */
function setupMarketsCarousel(count) {
  const grid   = document.getElementById("marketsGrid");
  const prev   = document.getElementById("marketsPrev");
  const next   = document.getElementById("marketsNext");
  const dotsEl = document.getElementById("marketsDots");
  if (!grid || !prev || !next) return;

  const cardGap = () => {
    const card = grid.querySelector(".market-card");
    if (!card) return grid.clientWidth;
    const style = getComputedStyle(grid);
    return card.getBoundingClientRect().width + parseFloat(style.columnGap || style.gap || 0);
  };

  const updateNavState = () => {
    const max = grid.scrollWidth - grid.clientWidth - 2;
    prev.disabled = grid.scrollLeft <= 2;
    next.disabled = grid.scrollLeft >= max;
    if (dotsEl) {
      const idx = Math.round(grid.scrollLeft / cardGap());
      [...dotsEl.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    }
  };

  prev.onclick = () => grid.scrollBy({ left: -cardGap(), behavior: "smooth" });
  next.onclick = () => grid.scrollBy({ left: cardGap(), behavior: "smooth" });
  grid.addEventListener("scroll", updateNavState, { passive: true });
  window.addEventListener("resize", updateNavState, { passive: true });

  // Dots — 1 chấm / chợ
  if (dotsEl) {
    dotsEl.innerHTML = Array.from({ length: count }).map((_, i) =>
      `<button class="dot${i === 0 ? " active" : ""}" type="button" aria-label="Đến chợ ${i + 1}"></button>`
    ).join("");
    [...dotsEl.children].forEach((dot, i) => {
      dot.onclick = () => grid.scrollTo({ left: i * cardGap(), behavior: "smooth" });
    });
  }

  updateNavState();
}

/* --------------------------------------------------------------------------
   8. RENDER — SẢN PHẨM từ /api/products
   -------------------------------------------------------------------------- */
const PRODUCTS_PER_PAGE = 6;
let displayedCount = PRODUCTS_PER_PAGE;
let filteredProducts = [];

function renderProducts(products) {
  filteredProducts = products;
  displayedCount   = PRODUCTS_PER_PAGE;
  displayProducts();
}

function displayProducts() {
  const grid   = document.getElementById("productsGrid");
  const lmWrap = document.getElementById("loadMoreWrap");
  if (!grid) return;

  const slice  = filteredProducts.slice(0, displayedCount);

  if (!slice.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>Không tìm thấy sản phẩm phù hợp.</p>
        <button type="button" id="resetBtn">Xem tất cả sản phẩm</button>
      </div>`;
    document.getElementById("resetBtn")?.addEventListener("click", resetSearch);
    if (lmWrap) lmWrap.style.display = "none";
    return;
  }

  grid.innerHTML = slice.map(p => {
    const hasStock = typeof p.stock === "number" && Number.isFinite(p.stock);
    const stockPill = !hasStock ? "" : (p.stock <= 20
      ? `<span class="stock-pill low"><span class="dot"></span>Sắp hết · ${p.stock}${p.unit ? " " + p.unit : ""}</span>`
      : `<span class="stock-pill"><span class="dot"></span>Còn hàng</span>`);

    // Gộp thông tin sạp, tránh lặp khi stall_code trùng business_name
    const metaParts = [];
    if (p.stall_code && p.stall_code !== p.business_name) metaParts.push(`Sạp ${p.stall_code}`);
    if (p.business_name) metaParts.push(p.business_name);
    const metaLeft = metaParts.join(" · ") || "Sạp SmartMarket";
    const metaLine = p.market_name ? `${metaLeft} — ${p.market_name}` : metaLeft;

    const src = imgUrl(p.image_url);
    return `
      <article class="product-card opacity-reveal">
        <div class="product-media">
          ${stockPill}
          ${src
            ? `<img src="${src}" alt="${p.name}" loading="lazy" onerror="this.outerHTML='<span class=&quot;media-fallback&quot;>${p.icon || "📦"}</span>'">`
            : `<span class="media-fallback">${p.icon || "📦"}</span>`}
        </div>
        <div class="product-card-body">
          <p class="product-name">${p.name}</p>
          <p class="product-meta" title="${metaLine}">${metaLine}</p>
          <div class="product-row">
            <p class="product-price">${fmtVND(p.price)}<small>/${p.unit || "kg"}</small></p>
            <button class="add-btn" type="button" data-id="${p.id}" aria-label="Thêm ${p.name} vào giỏ">+</button>
          </div>
        </div>
      </article>`;
  }).join("");

  grid.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const product = filteredProducts.find(p => String(p.id) === String(btn.dataset.id));
      if (product) addToCart(product);
    });
  });

  if (lmWrap) lmWrap.style.display = displayedCount < filteredProducts.length ? "" : "none";
  observeReveal();
}

function loadMore() {
  displayedCount += PRODUCTS_PER_PAGE;
  displayProducts();
}

/* --------------------------------------------------------------------------
   9. FILTER TABS — theo chợ
   -------------------------------------------------------------------------- */
function buildFilterTabs(markets, allProds) {
  const container = document.getElementById("productFilters");
  if (!container) return;

  // Tab "Tất cả" đã có trong HTML
  markets.forEach(m => {
    const btn = document.createElement("button");
    btn.className      = "filter-tab";
    btn.dataset.market = m.name;
    btn.textContent    = m.name;
    container.appendChild(btn);
  });

  container.addEventListener("click", e => {
    const tab = e.target.closest(".filter-tab");
    if (!tab) return;
    container.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const market = tab.dataset.market || "";
    const filtered = market ? allProds.filter(p => p.market_name === market) : allProds;
    const heading   = document.getElementById("productsHeading");
    if (heading) heading.textContent = market ? `Sản phẩm tại ${market}` : "Sản phẩm tươi mới";
    renderProducts(filtered);
  });
}

/* --------------------------------------------------------------------------
   10. TÌM KIẾM
   -------------------------------------------------------------------------- */
function setupSearch() {
  const form    = document.getElementById("searchForm");
  const input   = document.getElementById("searchInput");
  const heading = document.getElementById("productsHeading");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const q = stripDiacritics(input.value.trim());
    if (!q) { resetSearch(); return; }
    const matches = allProducts.filter(p => stripDiacritics(p.name).includes(q) || stripDiacritics(p.business_name || "").includes(q));
    if (heading) heading.textContent = `Kết quả cho "${input.value.trim()}"`;
    renderProducts(matches);
    document.getElementById("categories")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Reset active tab
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    document.querySelector('.filter-tab[data-market=""]')?.classList.add("active");
  });
}

function resetSearch() {
  const input   = document.getElementById("searchInput");
  const heading = document.getElementById("productsHeading");
  if (input)   input.value = "";
  if (heading) heading.textContent = "Sản phẩm tươi mới";
  renderProducts(allProducts);
  document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('.filter-tab[data-market=""]')?.classList.add("active");
}

/* --------------------------------------------------------------------------
   11. RENDER — TIỂU THƯƠNG từ /api/trader
   -------------------------------------------------------------------------- */
function renderTraders(traders) {
  const grid = document.getElementById("tradersGrid");
  if (!grid) return;

  grid.innerHTML = traders.slice(0, 4).map(t => {
    const initials = t.full_name.split(" ").map(w => w[0]).slice(-2).join("").toUpperCase();
    const stars    = "★".repeat(Math.floor(t.rating || 4.8)) + (t.rating % 1 >= 0.5 ? "½" : "");
    return `
      <article class="trader-card opacity-reveal">
        <div class="tc-avatar">${initials}</div>
        <div>
          <p class="tc-name">${t.full_name}</p>
          <p class="tc-biz">${t.business_name}</p>
        </div>
        <div class="tc-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/>
          </svg>
          Sạp ${t.stall_code} · ${t.market_name}
        </div>
        <div class="tc-rating">
          <span class="star">★</span>
          <strong>${(t.rating || 4.8).toFixed(1)}</strong>
          <span>· ${fmtNum(t.order_count || 0)} đơn</span>
        </div>
        <div class="tc-stats">
          <div class="tc-stat"><b>${t.product_count || 0}</b><span>Sản phẩm</span></div>
          <div class="tc-stat"><b>${fmtNum(t.order_count || 0)}</b><span>Đơn hàng</span></div>
        </div>
      </article>`;
  }).join("");

  observeReveal();
}

/* --------------------------------------------------------------------------
   12. ƯU ĐÃI — điền giá thật từ cache sản phẩm
   -------------------------------------------------------------------------- */
function renderDealPrices(products) {
  // Tôm sú
  const shrimp = products.find(p => p.name.includes("Tôm"));
  if (shrimp) {
    const old  = Math.round(shrimp.price / 0.85);
    document.getElementById("dealOldPrice") && (document.getElementById("dealOldPrice").textContent = fmtVND(old));
    document.getElementById("dealNewPrice") && (document.getElementById("dealNewPrice").textContent = fmtVND(shrimp.price));
  }
  // Rau
  const veg = products.find(p => p.name.includes("Bông cải") || p.name.includes("Rau"));
  if (veg) {
    const discounted = Math.round(veg.price * 0.80);
    document.getElementById("dealVegPrice") && (document.getElementById("dealVegPrice").textContent = fmtVND(discounted) + "/" + (veg.unit || "kg"));
  }
}

/* --------------------------------------------------------------------------
   13. DEAL TIMER — đếm ngược đến cuối ngày
   -------------------------------------------------------------------------- */
function startDealTimer() {
  const el = document.getElementById("dealTimer");
  if (!el) return;

  function tick() {
    const now   = new Date();
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const diff  = Math.max(0, Math.floor((end - now) / 1000));
    const h     = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m     = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s     = String(diff % 60).padStart(2, "0");
    el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* --------------------------------------------------------------------------
   14. REVEAL ON SCROLL
   -------------------------------------------------------------------------- */
let revealObs;
function observeReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".opacity-reveal").forEach(el => el.classList.add("is-visible"));
    return;
  }
  if (!revealObs) {
    revealObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll(".opacity-reveal:not(.is-visible)").forEach(el => revealObs.observe(el));
}

/* --------------------------------------------------------------------------
   15. NAV TOGGLE (mobile)
   -------------------------------------------------------------------------- */
function setupNav() {
  const toggle = document.getElementById("navToggle");
  const nav    = document.getElementById("mainNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }));
}

/* --------------------------------------------------------------------------
   16. HEADER scroll shadow
   -------------------------------------------------------------------------- */
function setupHeaderShadow() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const obs = new IntersectionObserver(([entry]) => {
    header.style.boxShadow = entry.isIntersecting ? "" : "0 2px 20px -10px rgba(0,0,0,.18)";
  }, { threshold: 1 });
  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:1px;height:1px;width:1px;pointer-events:none;";
  document.body.prepend(sentinel);
  obs.observe(sentinel);
}

/* --------------------------------------------------------------------------
   17. CART BUTTON
   -------------------------------------------------------------------------- */
function setupCartBtn() {
  document.getElementById("cartBtn")?.addEventListener("click", () => {
    const drawer = document.getElementById("cartDrawer");
    if (drawer?.hasAttribute("hidden")) openCartDrawer();
    else closeCartDrawer();
  });
  document.getElementById("cartDrawerClose")?.addEventListener("click", closeCartDrawer);
  // Expose globally for HTML inline handlers
  window.closeCartDrawer = closeCartDrawer;
  window.changeQty       = changeQty;
  window.removeFromCart  = removeFromCart;
}

/* --------------------------------------------------------------------------
   17b. CHECKOUT — đặt hàng không cần đăng nhập (COD / chuyển khoản)
   -------------------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

function genOrderCode() {
  return "SM" + Date.now().toString(36).toUpperCase().slice(-6);
}

function renderCheckoutSummary() {
  const el = document.getElementById("checkoutSummary");
  if (!el) return;
  const rows = cart.map(i => `
    <div class="checkout-summary-row">
      <span>${escapeHtml(i.product.name)} × ${i.quantity}</span>
      <b>${fmtVND(i.product.price * i.quantity)}</b>
    </div>`).join("");
  el.innerHTML = rows + `
    <div class="checkout-summary-total">
      <span>Tổng cộng</span>
      <b>${fmtVND(getCartTotal())}</b>
    </div>`;
}

function openCheckoutModal() {
  if (!cart.length) return;
  const modal   = document.getElementById("checkoutModal");
  const overlay = document.getElementById("checkoutOverlay");
  if (!modal || !overlay) return;
  renderCheckoutSummary();
  modal.removeAttribute("hidden");
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("is-open")));
}

function closeCheckoutModal() {
  const modal   = document.getElementById("checkoutModal");
  const overlay = document.getElementById("checkoutOverlay");
  if (!modal || !overlay) return;
  modal.classList.remove("is-open");
  overlay.classList.remove("open");
  document.body.style.overflow = document.getElementById("cartDrawer")?.hasAttribute("hidden") === false ? "hidden" : "";
  setTimeout(() => {
    modal.setAttribute("hidden", "");
    resetCheckoutView();
  }, 300);
}

function clearFieldErrors(form) {
  form.querySelectorAll(".cf-error").forEach(el => el.classList.remove("cf-error"));
  form.querySelectorAll(".cf-error-msg").forEach(el => el.remove());
}

function markFieldError(input, msg) {
  input.classList.add("cf-error");
  const row = input.closest(".cf-row") || input.parentElement;
  const msgEl = document.createElement("div");
  msgEl.className = "cf-error-msg";
  msgEl.textContent = msg;
  row.appendChild(msgEl);
}

function showCheckoutSuccess(order) {
  const formView    = document.getElementById("checkoutFormView");
  const successView = document.getElementById("checkoutSuccessView");
  if (!formView || !successView) return;
  formView.hidden = true;

  const infoBlock = order.payment === "bank" ? `
    <div class="bank-info">
      <div class="bank-info-row"><span>Ngân hàng</span><b>Vietcombank — CN Cần Thơ</b></div>
      <div class="bank-info-row"><span>Số tài khoản</span><b>0071 0001 23456</b></div>
      <div class="bank-info-row"><span>Chủ tài khoản</span><b>CTY TNHH SMARTMARKET</b></div>
      <div class="bank-info-row"><span>Số tiền</span><b>${fmtVND(order.total)}</b></div>
      <div class="bank-info-row"><span>Nội dung CK</span><b>${order.code}</b></div>
    </div>
    <p class="bank-info-note">Vui lòng chuyển khoản đúng nội dung <b>${order.code}</b> trong vòng 24 giờ. Đơn hàng sẽ được xử lý ngay sau khi SmartMarket nhận được thanh toán.</p>
  ` : `
    <p class="bank-info-note">Shipper sẽ liên hệ số <b>${escapeHtml(order.phone)}</b> để giao hàng. Vui lòng chuẩn bị <b>${fmtVND(order.total)}</b> tiền mặt khi nhận hàng.</p>
  `;

  successView.innerHTML = `
    <div class="checkout-success">
      <div class="checkout-success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <h3>Đặt hàng thành công!</h3>
      <p>Cảm ơn <b>${escapeHtml(order.name)}</b>, đơn hàng của bạn đã được ghi nhận.</p>
      <div class="checkout-order-code">Mã đơn hàng: ${order.code}</div>
      ${infoBlock}
      <button type="button" class="checkout-done-btn" id="checkoutDoneBtn">Đóng</button>
    </div>`;
  successView.hidden = false;
  document.getElementById("checkoutDoneBtn")?.addEventListener("click", closeCheckoutModal);
}

function resetCheckoutView() {
  const formView    = document.getElementById("checkoutFormView");
  const successView = document.getElementById("checkoutSuccessView");
  const form        = document.getElementById("checkoutForm");
  if (formView)    formView.hidden = false;
  if (successView) { successView.hidden = true; successView.innerHTML = ""; }
  if (form) {
    form.reset();
    clearFieldErrors(form);
    document.querySelectorAll(".pay-option").forEach((el, i) => el.classList.toggle("is-selected", i === 0));
  }
}

function setupPayOptions() {
  document.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".pay-option").forEach(el => el.classList.remove("is-selected"));
      radio.closest(".pay-option")?.classList.add("is-selected");
    });
  });
}

function setupCheckoutForm() {
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    clearFieldErrors(form);

    const name    = form.name.value.trim();
    const phone   = form.phone.value.trim();
    const email   = form.email.value.trim();
    const address = form.address.value.trim();
    const note    = form.note.value.trim();
    const payment = form.payment.value;

    let valid = true;
    if (!name)    { markFieldError(form.name, "Vui lòng nhập họ tên"); valid = false; }
    const phoneDigits = phone.replace(/[\s.-]/g, "");
    if (!phone)   { markFieldError(form.phone, "Vui lòng nhập số điện thoại"); valid = false; }
    else if (!/^(0|\+84)\d{9,10}$/.test(phoneDigits)) { markFieldError(form.phone, "Số điện thoại chưa hợp lệ"); valid = false; }
    if (!address) { markFieldError(form.address, "Vui lòng nhập địa chỉ giao hàng"); valid = false; }
    if (!cart.length) { valid = false; }
    if (!valid) return;

    const submitBtn = form.querySelector(".checkout-submit-btn");
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    let errorMsg = null;
    let order = null;

    try {
      const res = await fetch(`${API}/orders/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone: phoneDigits, address, note,
          payment_method: payment,
          items: cart.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        errorMsg = data.message || "Không thể đặt hàng, vui lòng thử lại";
      } else {
        order = {
          code: data.order_code,
          name, phone: phoneDigits, email, address, note, payment,
          items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price })),
          total: data.total_amount ?? getCartTotal(),
        };
      }
    } catch (err) {
      errorMsg = "Lỗi kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    }

    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;

    if (errorMsg) {
      const el = document.getElementById("checkoutSummary");
      const errEl = document.createElement("div");
      errEl.className = "cf-error-msg";
      errEl.style.marginTop = ".6rem";
      errEl.textContent = errorMsg;
      el?.parentElement?.insertBefore(errEl, el.nextSibling);
      return;
    }

    showCheckoutSuccess(order);
    try { localStorage.setItem(LAST_PHONE_KEY, phoneDigits); } catch {}

    // Đơn đã lưu vào server — làm trống giỏ hàng
    cart = [];
    updateCartBadge();
    renderCartItems();
  });
}

function setupCheckout() {
  document.getElementById("checkoutBtn")?.addEventListener("click", openCheckoutModal);
  document.getElementById("checkoutClose")?.addEventListener("click", closeCheckoutModal);
  document.getElementById("checkoutOverlay")?.addEventListener("click", closeCheckoutModal);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("checkoutModal");
    if (modal && modal.classList.contains("is-open")) closeCheckoutModal();
  });
  setupPayOptions();
  setupCheckoutForm();
}

/* --------------------------------------------------------------------------
   18. LOAD MORE BTN
   -------------------------------------------------------------------------- */
function setupLoadMore() {
  document.getElementById("loadMoreBtn")?.addEventListener("click", loadMore);
}

/* --------------------------------------------------------------------------
   19. INIT — kéo tất cả API song song
   -------------------------------------------------------------------------- */
async function init() {
  // Footer year
  const fyEl = document.getElementById("footerYear");
  if (fyEl) fyEl.textContent = new Date().getFullYear();

  setupNav();
  setupHeaderShadow();
  setupCartBtn();
  setupCheckout();
  setupOrdersDrawer();
  setupSearch();
  setupLoadMore();
  startDealTimer();
  setupScrollProgress();
  setupSpotlight();
  setupHeroTilt();
  setupSectionHeadings();
  setupCustomCursor();

  // Kéo song song tất cả API — không còn fallback dữ liệu mẫu
  const [dashRes, marketsRes, productsRes, tradersRes] = await Promise.all([
    fetchAPI("/dashboard"),
    fetchAPI("/markets"),
    fetchAPI("/products"),
    fetchAPI("/trader"),
  ]);

  const dash     = dashRes?.dashboard ? dashRes : { dashboard: {} };
  const markets  = (marketsRes?.data  || []);
  const products = (productsRes?.data || []);
  const traders  = (tradersRes?.data  || []);

  // Lưu cache toàn bộ sản phẩm cho tìm kiếm / filter
  allProducts = products;

  // === Hero ===
  renderHeroStats(dash);
  renderFeaturedProduct(products[0]);
  setInterval(refreshRevenueTime, 30000);

  // === Markets ===
  console.log("[SmartMarket] dữ liệu chợ nhận được:", markets);
  renderMarkets(markets);

  // === Products + filter tabs ===
  buildFilterTabs(markets, products);
  renderProducts(products);

  // === Traders ===
  renderTraders(traders);

  // === Deals ===
  renderDealPrices(products);

  // === Trader CTA stats (sử dụng dashboard data) ===
  // (đã được xử lý bên trong renderHeroStats)

  // Cart badge khởi điểm
  updateCartBadge();
  renderCartItems();
}

/* --------------------------------------------------------------------------
   ANIMATION ENHANCEMENTS
   -------------------------------------------------------------------------- */

/* Scroll progress bar */
function setupScrollProgress() {
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  document.body.prepend(bar);
  window.addEventListener("scroll", () => {
    const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
    bar.style.width = Math.min(pct, 100) + "%";
  }, { passive: true });
}

/* Spotlight + interactive 3D tilt on cards */
function setupSpotlight() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CARD_SEL = ".market-card, .product-card, .trader-card";
  const MAX_TILT = 10; // độ nghiêng tối đa (deg)

  document.addEventListener("mousemove", e => {
    const card = e.target.closest(CARD_SEL);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0..1
    const py = (e.clientY - rect.top)  / rect.height;  // 0..1

    // spotlight glow
    card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (py * 100).toFixed(1) + "%");

    // 3D tilt theo vị trí con trỏ
    if (!reduceMotion) {
      const rx = ((px - 0.5) *  MAX_TILT).toFixed(2); // rotateY
      const ry = ((0.5 - py) *  MAX_TILT).toFixed(2); // rotateX
      card.style.setProperty("--rx", rx + "deg");
      card.style.setProperty("--ry", ry + "deg");
    }
  }, { passive: true });

  if (reduceMotion) return;

  document.addEventListener("mouseover", e => {
    const card = e.target.closest(CARD_SEL);
    if (!card) return;
    card.style.setProperty("--ty", "-8px");
    card.style.setProperty("--tscale", "1.02");
  });
  document.addEventListener("mouseout", e => {
    const card = e.target.closest(CARD_SEL);
    if (!card || card.contains(e.relatedTarget)) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--ty", "0px");
    card.style.setProperty("--tscale", "1");
  });
}

/* Nghiêng cả khối hero-panels theo chuyển động chuột trong hero (hiệu ứng showcase 3D) */
function setupHeroTilt() {
  const hero   = document.querySelector(".hero");
  const panels = document.getElementById("heroPanels");
  if (!hero || !panels) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  hero.addEventListener("mousemove", e => {
    const rect = hero.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0..1
    const py = (e.clientY - rect.top)  / rect.height;  // 0..1
    const htx = ((px - 0.5) * 10).toFixed(2); // rotateY
    const hty = ((0.5 - py) * 6).toFixed(2);  // rotateX
    panels.style.setProperty("--htx", htx + "deg");
    panels.style.setProperty("--hty", hty + "deg");
  }, { passive: true });

  hero.addEventListener("mouseleave", () => {
    panels.style.setProperty("--htx", "0deg");
    panels.style.setProperty("--hty", "0deg");
  });
}

/* Custom cursor — chấm nhỏ đi sát chuột + vòng tròn theo sau mượt, đổi trạng thái khi hover nút/link */
function setupCustomCursor() {
  const isFinePointer  = window.matchMedia("(pointer: fine)").matches;
  const reduceMotion   = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!isFinePointer || reduceMotion) return;

  const dot  = document.createElement("div");
  const ring = document.createElement("div");
  dot.className  = "cursor-dot";
  ring.className = "cursor-ring";
  document.body.append(dot, ring);
  document.body.classList.add("custom-cursor-active");

  let mx = window.innerWidth  / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  let primed = false;

  window.addEventListener("mousemove", e => {
    mx = e.clientX; my = e.clientY;
    dot.style.setProperty("--x", mx + "px");
    dot.style.setProperty("--y", my + "px");
    if (!primed) { rx = mx; ry = my; primed = true; }
    dot.style.opacity = "1"; ring.style.opacity = "1";
  }, { passive: true });

  (function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.setProperty("--x", rx + "px");
    ring.style.setProperty("--y", ry + "px");
    requestAnimationFrame(loop);
  })();

  const HOVER_SEL = "a, button, .filter-tab, .icon-btn, .carousel-nav, .dot, input, textarea, [role='button']";
  document.addEventListener("mouseover", e => {
    if (e.target.closest(HOVER_SEL)) document.body.classList.add("cursor-hover");
  });
  document.addEventListener("mouseout", e => {
    const leavingHover = e.target.closest(HOVER_SEL);
    if (leavingHover && !e.relatedTarget?.closest?.(HOVER_SEL)) document.body.classList.remove("cursor-hover");
  });
  document.addEventListener("mousedown", () => document.body.classList.add("cursor-down"));
  document.addEventListener("mouseup",   () => document.body.classList.remove("cursor-down"));
  document.addEventListener("mouseleave", () => { dot.style.opacity = "0"; ring.style.opacity = "0"; });
}

/* Section heading underline reveal */
function setupSectionHeadings() {
  const heads = document.querySelectorAll(".section-head");
  if (!("IntersectionObserver" in window)) {
    heads.forEach(h => h.classList.add("in-view"));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in-view"); obs.unobserve(e.target); } });
  }, { threshold: 0.3 });
  heads.forEach(h => obs.observe(h));
}

/* Ripple on add buttons */
document.addEventListener("click", e => {
  const btn = e.target.closest(".add-btn");
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "ripple-el";
  el.style.left = (e.clientX - rect.left) + "px";
  el.style.top  = (e.clientY - rect.top) + "px";
  btn.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
});

document.addEventListener("DOMContentLoaded", init);