let settings = {};
let products = [];
let cart = JSON.parse(localStorage.getItem("rongtana_cart") || "[]");

const $ = (q) => document.querySelector(q);
const productsEl = $("#products");
const cartDrawer = $("#cartDrawer");
const overlay = $("#overlay");
const checkoutDialog = $("#checkoutDialog");

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    settings = await res.json();
    applySettings();
  } catch {}
}

function escText(v) {
  return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

function applySettings() {
  const root = document.documentElement;
  if (settings.primary) root.style.setProperty("--rose", settings.primary);
  if (settings.secondary) root.style.setProperty("--rose2", settings.secondary);
  if (settings.accent) root.style.setProperty("--gold", settings.accent);
  if (settings.highlight) root.style.setProperty("--pumpkin", settings.highlight);
  document.querySelectorAll(".brand").forEach(x => x.innerHTML = "<span>R</span>" + escText(settings.siteName || "RongTana"));
  const eyebrow = document.querySelector(".hero .eyebrow");
  if (eyebrow) eyebrow.textContent = settings.heroEyebrow || "";
  const title = document.querySelector(".hero h1");
  if (title) {
    const parts = String(settings.heroTitle || "তোমার সাজে|রঙের ছোঁয়া").split("|");
    title.innerHTML = parts.length > 1 ? escText(parts[0]) + "<br><em>" + escText(parts.slice(1).join("|")) + "</em>" : escText(parts[0]);
  }
  const sub = document.querySelector(".hero p");
  if (sub) sub.textContent = settings.heroSubtitle || "";
  document.title = (settings.siteName || "RongTana") + " — চুড়ির অনলাইন শপ";
}

async function loadProducts() {
  const q = encodeURIComponent($("#searchInput").value.trim());
  const category = encodeURIComponent($("#categoryFilter").value);
  const res = await fetch(`/api/products?q=${q}&category=${category}`);
  products = await res.json();
  renderProducts();
}

function money(n) {
  return `৳ ${Number(n).toLocaleString("en-BD")}`;
}

function renderProducts() {
  if (!products.length) {
    productsEl.innerHTML = `<p>কোনো পণ্য পাওয়া যায়নি।</p>`;
    return;
  }

  productsEl.innerHTML = products.map(p => `
    <article class="product-card">
      <img src="${p.image}" alt="${p.name}">
      <div class="product-info">
        <small>${p.category}</small>
        <h3>${p.name}</h3>
        <p>${p.description}</p>
        <div class="product-bottom">
          <span class="price">${money(p.price)}</span>
          <button class="add-btn" onclick="addToCart(${p.id})" ${p.stock <= 0 ? "disabled" : ""}>
            ${p.stock > 0 ? "Add to Cart" : "Out of stock"}
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

async function addToCart(id) {
  let p = products.find(x => x.id === id);

  if (!p) {
    const res = await fetch(`/api/products/${id}`);
    p = await res.json();
  }

  const found = cart.find(x => x.id === id);
  if (found) {
    if (found.qty < p.stock) found.qty++;
  } else {
    cart.push({ ...p, qty: 1 });
  }

  saveCart();
  showToast("Cart-এ যোগ হয়েছে");
}

function saveCart() {
  localStorage.setItem("rongtana_cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  $("#cartCount").textContent = cart.reduce((s, x) => s + x.qty, 0);
  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
  $("#cartTotal").textContent = money(total);
  $("#checkoutTotal").textContent = money(total);

  $("#cartItems").innerHTML = cart.length ? cart.map(x => `
    <div class="cart-item">
      <img src="${x.image}" alt="${x.name}">
      <div>
        <b>${x.name}</b>
        <small>${money(x.price)}</small>
        <div class="qty">
          <button onclick="changeQty(${x.id}, -1)">−</button>
          <span>${x.qty}</span>
          <button onclick="changeQty(${x.id}, 1)">+</button>
        </div>
      </div>
      <button class="remove" onclick="removeItem(${x.id})">✕</button>
    </div>
  `).join("") : "<p>আপনার Cart এখন খালি।</p>";
}

function changeQty(id, delta) {
  const item = cart.find(x => x.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(x => x.id !== id);
  if (item.qty > item.stock) item.qty = item.stock;
  saveCart();
}

function removeItem(id) {
  cart = cart.filter(x => x.id !== id);
  saveCart();
}

function openCart() {
  cartDrawer.classList.add("open");
  overlay.classList.add("show");
}

function closeCart() {
  cartDrawer.classList.remove("open");
  overlay.classList.remove("show");
}

function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

$("#cartButton").onclick = openCart;
$("#closeCart").onclick = closeCart;
overlay.onclick = closeCart;

$("#checkoutButton").onclick = () => {
  if (!cart.length) return showToast("Cart খালি");
  closeCart();
  checkoutDialog.showModal();
};

$("#closeCheckout").onclick = () => checkoutDialog.close();
$("#searchInput").addEventListener("input", loadProducts);
$("#categoryFilter").addEventListener("change", loadProducts);

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = new FormData(e.currentTarget);
  const payload = {
    customer: {
      name: form.get("name"),
      phone: form.get("phone"),
      address: form.get("address"),
      note: form.get("note")
    },
    paymentMethod: "Cash on Delivery",
    items: cart.map(x => ({ productId: x.id, qty: x.qty }))
  };

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    return showToast(data.message || "অর্ডার করা যায়নি");
  }

  cart = [];
  saveCart();
  checkoutDialog.close();
  e.currentTarget.reset();
  showToast(`অর্ডার সফল! Order #${data.id}`);
  loadProducts();
});

renderCart();
loadSettings();
loadProducts();