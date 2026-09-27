const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const DEFAULT_SETTINGS = {
  siteName: "RongTana",
  primary: "#27AE60",
  secondary: "#2ECC71",
  accent: "#E67E22",
  highlight: "#D35400",
  heroEyebrow: "নতুন কালেকশন • ২০২৬",
  heroTitle: "তোমার সাজে|রঙের ছোঁয়া",
  heroSubtitle: "স্টাইলিশ, ব্রাইডাল ও দৈনন্দিন ব্যবহারের চুড়ি—এক জায়গায়। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।",
  phone: "",
  facebook: "",
  whatsapp: ""
};

app.get("/api/settings", (req, res) => {
  res.json({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) });
});

app.put("/api/admin/settings", (req, res) => {
  const current = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const key of allowed) {
    if (req.body[key] !== undefined) current[key] = String(req.body[key]).trim();
  }
  writeJson(SETTINGS_FILE, current);
  res.json(current);
});

app.get("/api/products", (req, res) => {
  let products = readJson(PRODUCTS_FILE);
  const q = (req.query.q || "").toLowerCase();
  const category = req.query.category || "";

  if (q) {
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  }

  if (category) {
    products = products.filter(p => p.category === category);
  }

  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.post("/api/orders", (req, res) => {
  const { customer, items, paymentMethod = "Cash on Delivery" } = req.body;

  if (!customer?.name || !customer?.phone || !customer?.address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Customer and cart information are required" });
  }

  const products = readJson(PRODUCTS_FILE);
  let total = 0;

  const normalizedItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === Number(item.productId));
    if (!product) return res.status(400).json({ message: `Invalid product: ${item.productId}` });

    const qty = Math.max(1, Number(item.qty) || 1);
    if (qty > product.stock) {
      return res.status(400).json({ message: `${product.name} has only ${product.stock} in stock` });
    }

    total += product.price * qty;
    normalizedItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty
    });
  }

  for (const item of normalizedItems) {
    const product = products.find(p => p.id === item.productId);
    product.stock -= item.qty;
  }

  const orders = readJson(ORDERS_FILE);
  const order = {
    id: Date.now(),
    customer,
    items: normalizedItems,
    total,
    paymentMethod,
    status: "Pending",
    createdAt: new Date().toISOString()
  };

  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
  writeJson(PRODUCTS_FILE, products);

  res.status(201).json(order);
});

// Simple admin endpoints for starter/demo use.
// Add proper auth before production use.
app.get("/api/admin/orders", (req, res) => {
  res.json(readJson(ORDERS_FILE));
});

app.post("/api/admin/products", (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const { name, category, price, stock, image, description } = req.body;

  if (!name || !category || price === undefined) {
    return res.status(400).json({ message: "name, category and price are required" });
  }

  const product = {
    id: Date.now(),
    name,
    category,
    price: Number(price),
    stock: Number(stock || 0),
    image: image || "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=80",
    description: description || ""
  };

  products.unshift(product);
  writeJson(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

app.put("/api/admin/products/:id", (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const index = products.findIndex(p => p.id === Number(req.params.id));
  if (index < 0) return res.status(404).json({ message: "Product not found" });

  products[index] = { ...products[index], ...req.body, id: products[index].id };
  if (req.body.price !== undefined) products[index].price = Number(req.body.price);
  if (req.body.stock !== undefined) products[index].stock = Number(req.body.stock);

  writeJson(PRODUCTS_FILE, products);
  res.json(products[index]);
});

app.delete("/api/admin/products/:id", (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const next = products.filter(p => p.id !== Number(req.params.id));
  if (next.length === products.length) return res.status(404).json({ message: "Product not found" });
  writeJson(PRODUCTS_FILE, next);
  res.json({ success: true });
});

app.patch("/api/admin/orders/:id/status", (req, res) => {
  const orders = readJson(ORDERS_FILE);
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ message: "Order not found" });

  order.status = req.body.status || order.status;
  writeJson(ORDERS_FILE, orders);
  res.json(order);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`RongTana store running at http://localhost:${PORT}`);
});