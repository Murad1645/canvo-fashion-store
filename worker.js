var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var SESSION_COOKIE = "canvo_admin_session";
var SESSION_DAYS = 7;
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashBytes = new Uint8Array(derivedBits);
  return `pbkdf2$100000$${bytesToHex(salt)}$${bytesToHex(hashBytes)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];
    const salt = hexToBytes(saltHex);
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );
    const actualHash = new Uint8Array(derivedBits);
    const actualHashHex = bytesToHex(actualHash);
    return timingSafeEqual(
      actualHashHex,
      expectedHashHex
    );
  } catch {
    return false;
  }
}
__name(verifyPassword, "verifyPassword");
function bytesToHex(bytes) {
  return Array.from(bytes).map(
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(hex) {
  const bytes = new Uint8Array(
    hex.length / 2
  );
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(
      hex.substring(i, i + 2),
      16
    );
  }
  return bytes;
}
__name(hexToBytes, "hexToBytes");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
function createSessionToken() {
  const bytes = crypto.getRandomValues(
    new Uint8Array(32)
  );
  return bytesToHex(bytes);
}
__name(createSessionToken, "createSessionToken");
async function hashSessionToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );
  return bytesToHex(
    new Uint8Array(hashBuffer)
  );
}
__name(hashSessionToken, "hashSessionToken");
function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [
      key,
      ...valueParts
    ] = cookie.trim().split("=");
    if (key === name) {
      return valueParts.join("=");
    }
  }
  return null;
}
__name(getCookie, "getCookie");
async function getAuthenticatedAdmin(request, env) {
  const sessionToken = getCookie(
    request,
    SESSION_COOKIE
  );
  if (!sessionToken) {
    return null;
  }
  const sessionHash = await hashSessionToken(
    sessionToken
  );
  const session = await env.DB.prepare(`
        SELECT
          s.id AS session_id,
          s.admin_id,
          s.expires_at,
          a.name,
          a.email,
          a.role,
          a.status
        FROM admin_sessions s
        INNER JOIN admins a
          ON a.id = s.admin_id
        WHERE
          s.session_token_hash = ?
          AND a.status = 'active'
        LIMIT 1
      `).bind(sessionHash).first();
  if (!session) {
    return null;
  }
  const expiresAt = new Date(
    session.expires_at
  ).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await env.DB.prepare(`
        DELETE FROM admin_sessions
        WHERE id = ?
      `).bind(session.session_id).run();
    return null;
  }
  return session;
}
__name(getAuthenticatedAdmin, "getAuthenticatedAdmin");
var CUSTOMER_SESSION_COOKIE = "canvo_customer_session";
var CUSTOMER_SESSION_DAYS = 7;
function normalizeCustomerPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00880")) digits = digits.slice(2);
  if (digits.startsWith("8801") && digits.length === 13) digits = "0" + digits.slice(3);
  if (digits.startsWith("880") && digits.length === 13) digits = "0" + digits.slice(3);
  return digits;
}
__name(normalizeCustomerPhone, "normalizeCustomerPhone");
function customerPhoneCandidates(value) {
  const local = normalizeCustomerPhone(value);
  if (!local) return [];
  const international = local.startsWith("0") ? "+88" + local : local;
  const noPlus = international.replace(/^\+/, "");
  return [.../* @__PURE__ */ new Set([local, international, noPlus])];
}
__name(customerPhoneCandidates, "customerPhoneCandidates");
async function getAuthenticatedCustomer(request, env) {
  const token = getCookie(request, CUSTOMER_SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const session = await env.DB.prepare(`
    SELECT s.id AS session_id, s.customer_id, s.expires_at,
           c.name, c.phone, c.address, c.city, c.status AS customer_status,
           a.status AS account_status
    FROM customer_sessions s
    INNER JOIN customer_accounts a ON a.customer_id = s.customer_id
    INNER JOIN customers c ON c.id = s.customer_id
    WHERE s.session_token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  if (!session || session.customer_status !== "active" || session.account_status !== "active") return null;
  const expires = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    await env.DB.prepare("DELETE FROM customer_sessions WHERE id = ?").bind(session.session_id).run();
    return null;
  }
  return session;
}
__name(getAuthenticatedCustomer, "getAuthenticatedCustomer");
async function createCustomerSession(env, customerId) {
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare(`
    INSERT INTO customer_sessions (customer_id, session_token_hash, expires_at)
    VALUES (?, ?, ?)
  `).bind(customerId, tokenHash, expiresAt).run();
  return `${CUSTOMER_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${CUSTOMER_SESSION_DAYS * 86400}`;
}
__name(createCustomerSession, "createCustomerSession");
function json(data, status = 200, extraHeaders = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        ...extraHeaders
      }
    }
  );
}
__name(json, "json");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "CANVO API",
        database: "connected"
      });
    }
    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.DB.prepare(
          "SELECT 1 AS test"
        ).first();
        return json({
          ok: true,
          database: "CANVO D1 connected",
          result
        });
      } catch (error) {
        return json(
          {
            ok: false,
            database: "D1 connection failed",
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/customer/register" && request.method === "POST") {
      try {
        const body = await request.json();
        const name = String(body?.name || "").trim().slice(0, 100);
        const phone = normalizeCustomerPhone(body?.phone);
        const password = body?.password;
        if (name.length < 2 || !/^01[3-9]\d{8}$/.test(phone) || typeof password !== "string" || password.length < 8 || password.length > 128) {
          return json({ ok: false, error: "Enter your name, a valid Bangladesh mobile number, and a password of at least 8 characters." }, 400);
        }
        const existingAccount = await env.DB.prepare("SELECT id FROM customer_accounts WHERE phone = ? LIMIT 1").bind(phone).first();
        if (existingAccount) return json({ ok: false, error: "An account already exists for this phone number. Please log in." }, 409);
        const candidates = customerPhoneCandidates(phone);
        const placeholders = candidates.map(() => "?").join(",");
        let customer = await env.DB.prepare(`SELECT id, name, phone FROM customers WHERE phone IN (${placeholders}) ORDER BY id ASC LIMIT 1`).bind(...candidates).first();
        let customerId;
        if (customer) {
          customerId = customer.id;
          await env.DB.prepare(`UPDATE customers SET name = ?, phone = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(name, phone, customerId).run();
        } else {
          const created = await env.DB.prepare(`INSERT INTO customers (name, phone, address, city, country, status) VALUES (?, ?, '', '', 'Bangladesh', 'active')`).bind(name, phone).run();
          customerId = created.meta.last_row_id;
        }
        const passwordHash = await hashPassword(password);
        await env.DB.prepare(`INSERT INTO customer_accounts (customer_id, phone, password_hash, status) VALUES (?, ?, ?, 'active')`).bind(customerId, phone, passwordHash).run();
        const cookie = await createCustomerSession(env, customerId);
        return json({ ok: true, message: "Account created successfully.", customer: { id: customerId, name, phone } }, 201, { "Set-Cookie": cookie });
      } catch (error) {
        console.error("Customer registration error:", error);
        return json({ ok: false, error: "Unable to create the account. Run the customer account migration and try again." }, 500);
      }
    }
    if (url.pathname === "/api/customer/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const phone = normalizeCustomerPhone(body?.phone);
        const password = body?.password;
        if (!/^01[3-9]\d{8}$/.test(phone) || typeof password !== "string" || !password) {
          return json({ ok: false, error: "Enter your registered phone number and password." }, 400);
        }
        const account = await env.DB.prepare(`
      SELECT a.customer_id, a.phone, a.password_hash, a.status, c.name
      FROM customer_accounts a INNER JOIN customers c ON c.id = a.customer_id
      WHERE a.phone = ? LIMIT 1
    `).bind(phone).first();
        if (!account || account.status !== "active" || !await verifyPassword(password, account.password_hash)) {
          return json({ ok: false, error: "Invalid phone number or password." }, 401);
        }
        const cookie = await createCustomerSession(env, account.customer_id);
        return json({ ok: true, message: "Login successful.", customer: { id: account.customer_id, name: account.name, phone: account.phone } }, 200, { "Set-Cookie": cookie });
      } catch (error) {
        console.error("Customer login error:", error);
        return json({ ok: false, error: "Unable to process login right now." }, 500);
      }
    }
    if (url.pathname === "/api/customer/me" && request.method === "GET") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, authenticated: false }, 401);
      return json({ ok: true, authenticated: true, customer: { id: customer.customer_id, name: customer.name, phone: customer.phone } });
    }
    if (url.pathname === "/api/customer/logout" && request.method === "POST") {
      try {
        const token = getCookie(request, CUSTOMER_SESSION_COOKIE);
        if (token) {
          const tokenHash = await hashSessionToken(token);
          await env.DB.prepare("DELETE FROM customer_sessions WHERE session_token_hash = ?").bind(tokenHash).run();
        }
        return json({ ok: true, message: "Logged out successfully." }, 200, { "Set-Cookie": `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` });
      } catch (error) {
        console.error("Customer logout error:", error);
        return json({ ok: false, error: "Unable to log out right now." }, 500);
      }
    }
    if (url.pathname === "/api/customer/profile" && request.method === "GET") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      return json({ ok: true, profile: { id: customer.customer_id, name: customer.name, phone: customer.phone, address: customer.address || "", city: customer.city || "" } });
    }
    if (url.pathname === "/api/customer/profile" && request.method === "PATCH") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      try {
        const body = await request.json();
        const name = String(body?.name || "").trim().slice(0, 100);
        const address = String(body?.address || "").trim().slice(0, 500);
        const city = String(body?.city || "").trim().slice(0, 100);
        if (name.length < 2) return json({ ok: false, error: "Please enter your full name." }, 400);
        await env.DB.prepare("UPDATE customers SET name = ?, address = ?, city = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, address, city, customer.customer_id).run();
        return json({ ok: true, message: "Account details updated." });
      } catch (error) {
        console.error("Customer profile update error:", error);
        return json({ ok: false, error: "Unable to update account details." }, 500);
      }
    }
    if (url.pathname === "/api/customer/orders" && request.method === "GET") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      try {
        const { results } = await env.DB.prepare(`
      SELECT id, order_number, subtotal, shipping_fee, total_amount, payment_method,
             payment_status, order_status, shipping_name, shipping_phone,
             shipping_address, shipping_city, created_at, updated_at
      FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100
    `).bind(customer.customer_id).all();
        return json({ ok: true, orders: results });
      } catch (error) {
        console.error("Customer order history error:", error);
        return json({ ok: false, error: "Unable to load order history." }, 500);
      }
    }
    if (url.pathname === "/api/customer/orders/tracking" && request.method === "GET") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      try {
        const orderNumber = String(url.searchParams.get("orderNumber") || "").trim();
        const orderIdParam = String(url.searchParams.get("orderId") || "").trim();
        if (!orderNumber && !/^\d+$/.test(orderIdParam)) {
          return json({ ok: false, error: "Provide a valid order number or order ID." }, 400);
        }
        const order = await env.DB.prepare(`
          SELECT id, order_number, order_status, created_at, updated_at,
                 shipping_name, shipping_phone, shipping_address, shipping_city
          FROM orders
          WHERE customer_id = ? AND (order_number = ? OR (? != '' AND id = ?))
          LIMIT 1
        `).bind(customer.customer_id, orderNumber, orderIdParam, Number(orderIdParam || 0)).first();
        if (!order) return json({ ok: false, error: "Order not found in your account." }, 404);
        const { results: history } = await env.DB.prepare(`
          SELECT old_status, new_status, note, created_at
          FROM order_status_history
          WHERE order_id = ?
          ORDER BY id ASC
        `).bind(order.id).all();
        return json({ ok: true, order, history });
      } catch (error) {
        console.error("Customer order tracking error:", error);
        return json({ ok: false, error: "Unable to load tracking information." }, 500);
      }
    }
    if (url.pathname === "/api/customer/wishlist" && request.method === "GET") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      try {
        const { results } = await env.DB.prepare(`
      SELECT p.id, p.name, p.category, p.price, p.old_price, p.image_url
      FROM customer_wishlist w INNER JOIN products p ON p.id = w.product_id
      WHERE w.customer_id = ? AND p.status = 'active' ORDER BY w.created_at DESC
    `).bind(customer.customer_id).all();
        return json({ ok: true, wishlist: results });
      } catch (error) {
        console.error("Customer wishlist error:", error);
        return json({ ok: false, error: "Unable to load wishlist. Run the customer account migration." }, 500);
      }
    }
    if (url.pathname === "/api/customer/wishlist" && request.method === "POST") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      try {
        const body = await request.json();
        const productId = Number(body?.productId);
        if (!Number.isInteger(productId) || productId < 1) return json({ ok: false, error: "Invalid product." }, 400);
        const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND status = 'active'").bind(productId).first();
        if (!product) return json({ ok: false, error: "Product not found." }, 404);
        await env.DB.prepare("INSERT OR IGNORE INTO customer_wishlist (customer_id, product_id) VALUES (?, ?)").bind(customer.customer_id, productId).run();
        return json({ ok: true, message: "Added to wishlist." });
      } catch (error) {
        console.error("Wishlist add error:", error);
        return json({ ok: false, error: "Unable to update wishlist." }, 500);
      }
    }
    const customerWishlistDelete = url.pathname.match(/^\/api\/customer\/wishlist\/(\d+)$/);
    if (customerWishlistDelete && request.method === "DELETE") {
      const customer = await getAuthenticatedCustomer(request, env);
      if (!customer) return json({ ok: false, error: "Please log in." }, 401);
      await env.DB.prepare("DELETE FROM customer_wishlist WHERE customer_id = ? AND product_id = ?").bind(customer.customer_id, Number(customerWishlistDelete[1])).run();
      return json({ ok: true, message: "Removed from wishlist." });
    }
    if (request.method === "POST" && url.pathname === "/api/orders") {
      try {
        const body = await request.json();
        const customer = body.customer || {};
        const items = Array.isArray(body.items) ? body.items : [];
        if (!customer.name || !customer.phone || !customer.district || !customer.thana || !customer.address) {
          return json(
            {
              ok: false,
              error: "Please provide all required customer information."
            },
            400
          );
        }
        if (!items.length) {
          return json(
            {
              ok: false,
              error: "Order must contain at least one item."
            },
            400
          );
        }
        const authenticatedCustomer = await getAuthenticatedCustomer(request, env);
        if (!authenticatedCustomer) {
          return json(
            { ok: false, error: "Please log in before placing an order.", loginRequired: true },
            401
          );
        }
        const customerId = authenticatedCustomer.customer_id;
        customer.phone = authenticatedCustomer.phone;
        await env.DB.prepare(`
        UPDATE customers
        SET name = ?, address = ?, city = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
          String(customer.name).trim(),
          String(customer.address).trim(),
          String(customer.district).trim(),
          customerId
        ).run();
        const orderItems = [];
        let subtotal = 0;
        for (const item of items) {
          const productId = Number(item.productId);
          const variantId = Number(item.variantId);
          const quantity = Number(item.quantity);
          if (!Number.isInteger(productId) || !Number.isInteger(variantId) || !Number.isInteger(quantity) || quantity <= 0) {
            return json(
              {
                ok: false,
                error: "Invalid product, variant or quantity."
              },
              400
            );
          }
          const product = await env.DB.prepare(`
            SELECT
              id,
              name,
              price,
              status
            FROM products
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
          `).bind(
            productId
          ).first();
          if (!product) {
            return json(
              {
                ok: false,
                error: `Product ${productId} was not found or is inactive.`
              },
              404
            );
          }
          const variant = await env.DB.prepare(`
            SELECT
              id,
              product_id,
              size,
              color,
              sku,
              stock_quantity
            FROM product_variants
            WHERE id = ?
              AND product_id = ?
          `).bind(
            variantId,
            productId
          ).first();
          if (!variant) {
            return json(
              {
                ok: false,
                error: `Selected variant for ${product.name} was not found.`
              },
              404
            );
          }
          if (Number(variant.stock_quantity) < quantity) {
            return json(
              {
                ok: false,
                error: `Only ${variant.stock_quantity} unit(s) of ${product.name} are available.`
              },
              400
            );
          }
          const unitPrice = Number(product.price);
          const itemSubtotal = unitPrice * quantity;
          subtotal += itemSubtotal;
          orderItems.push({
            productId,
            variantId,
            productName: product.name,
            size: variant.size || null,
            color: variant.color || null,
            unitPrice,
            quantity,
            subtotal: itemSubtotal
          });
        }
        const shippingSettings = await env.DB.prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `).first();
        if (!shippingSettings) {
          return json(
            {
              ok: false,
              error: "Shipping settings are not configured."
            },
            500
          );
        }
        const freeShippingThreshold = Number(shippingSettings.free_shipping_threshold);
        const standardShippingCharge = Number(shippingSettings.shipping_charge);
        if (!Number.isFinite(freeShippingThreshold) || freeShippingThreshold < 0 || !Number.isFinite(standardShippingCharge) || standardShippingCharge < 0) {
          return json(
            {
              ok: false,
              error: "Shipping settings contain invalid values."
            },
            500
          );
        }
        const shippingFee = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : standardShippingCharge;
        const discount = Number(
          body.discount || 0
        );
        if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
          return json(
            {
              ok: false,
              error: "Invalid discount amount."
            },
            400
          );
        }
        const totalAmount = subtotal + shippingFee - discount;
        let partialPayment = Number(
          body.partialPayment || 0
        );
        if (!Number.isFinite(partialPayment) || partialPayment < 0) {
          return json(
            {
              ok: false,
              error: "Invalid partial payment amount."
            },
            400
          );
        }
        if (partialPayment > totalAmount) {
          partialPayment = totalAmount;
        }
        const paymentMethod = body.paymentMethod || "online";
        const orderNumber = `CANVO-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const shippingAddress = `${customer.thana}, ${customer.address}`;
        const orderResult = await env.DB.prepare(`
          INSERT INTO orders (
            order_number,
            customer_id,
            subtotal,
            shipping_fee,
            total_amount,
            payment_method,
            payment_status,
            order_status,
            shipping_name,
            shipping_phone,
            shipping_address,
            shipping_city,
            notes,
            discount,
            partial_payment
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `).bind(
          orderNumber,
          customerId,
          subtotal,
          shippingFee,
          totalAmount,
          paymentMethod,
          "pending",
          "pending",
          customer.name,
          customer.phone,
          shippingAddress,
          customer.district,
          customer.note || "",
          discount,
          partialPayment
        ).run();
        const orderId = orderResult.meta.last_row_id;
        const statements = [];
        for (const item of orderItems) {
          statements.push(
            env.DB.prepare(`
            INSERT INTO order_items (
              order_id,
              product_id,
              variant_id,
              product_name,
              size,
              color,
              quantity,
              unit_price,
              subtotal
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
              orderId,
              item.productId,
              item.variantId,
              item.productName,
              item.size,
              item.color,
              item.quantity,
              item.unitPrice,
              item.subtotal
            )
          );
          statements.push(
            env.DB.prepare(`
            UPDATE product_variants
            SET
              stock_quantity =
                stock_quantity - ?,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
              AND stock_quantity >= ?
          `).bind(
              item.quantity,
              item.variantId,
              item.quantity
            )
          );
        }
        await env.DB.batch(
          statements
        );
        await env.DB.prepare(`
          INSERT INTO order_status_history
            (order_id, old_status, new_status, note, changed_by_admin_id)
          VALUES (?, NULL, 'pending', 'Order placed', NULL)
        `).bind(orderId).run();
        return json(
          {
            ok: true,
            message: "Order created successfully.",
            order: {
              id: orderId,
              orderNumber,
              customerId,
              subtotal,
              shippingFee,
              discount,
              total: totalAmount,
              partialPayment,
              paymentMethod,
              paymentStatus: "pending",
              orderStatus: "pending"
            }
          },
          201
        );
      } catch (error) {
        console.error(
          "Create order error:",
          error
        );
        return json(
          {
            ok: false,
            error: "Unable to create order.",
            details: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      try {
        let body;
        try {
          body = await request.json();
        } catch {
          return json(
            { ok: false, error: "Invalid JSON request body." },
            400
          );
        }
        const email = String(body?.email || "").trim().toLowerCase();
        const password = body?.password;
        if (!email || typeof password !== "string" || !password) {
          return json(
            { ok: false, error: "Email and password are required." },
            400
          );
        }
        const admin = await env.DB.prepare(`
            SELECT id, name, email, password_hash, role, status
            FROM admins
            WHERE lower(email) = ?
            LIMIT 1
          `).bind(email).first();
        if (!admin || admin.status !== "active") {
          return json(
            { ok: false, error: "Invalid email or password." },
            401
          );
        }
        const passwordCorrect = await verifyPassword(
          password,
          admin.password_hash
        );
        if (!passwordCorrect) {
          return json(
            { ok: false, error: "Invalid email or password." },
            401
          );
        }
        const sessionToken = createSessionToken();
        const sessionHash = await hashSessionToken(sessionToken);
        const expiresAt = new Date(
          Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3
        ).toISOString();
        await env.DB.prepare(`
            INSERT INTO admin_sessions
              (admin_id, session_token_hash, expires_at)
            VALUES (?, ?, ?)
          `).bind(admin.id, sessionHash, expiresAt).run();
        const cookie = `${SESSION_COOKIE}=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
        return json(
          {
            ok: true,
            message: "Login successful.",
            admin: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              role: admin.role
            }
          },
          200,
          { "Set-Cookie": cookie }
        );
      } catch (error) {
        console.error("Admin login error:", error);
        return json(
          { ok: false, error: "Unable to process login right now." },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/me" && request.method === "GET") {
      try {
        const admin = await getAuthenticatedAdmin(
          request,
          env
        );
        if (!admin) {
          return json(
            {
              authenticated: false
            },
            401
          );
        }
        return json({
          authenticated: true,
          admin: {
            id: admin.admin_id,
            name: admin.name,
            email: admin.email,
            role: admin.role
          }
        });
      } catch (error) {
        return json(
          {
            authenticated: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/settings/shipping" && request.method === "GET") {
      try {
        const settings = await env.DB.prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `).first();
        if (!settings) {
          return json(
            {
              ok: false,
              error: "Shipping settings not found."
            },
            404
          );
        }
        return json({
          ok: true,
          settings: {
            freeShippingThreshold: Number(
              settings.free_shipping_threshold
            ),
            shippingCharge: Number(
              settings.shipping_charge
            )
          }
        });
      } catch (error) {
        console.error(
          "Public shipping settings error:",
          error
        );
        return json(
          {
            ok: false,
            error: "Unable to load shipping settings."
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/settings/shipping" && request.method === "GET") {
      try {
        const admin = await getAuthenticatedAdmin(
          request,
          env
        );
        if (!admin) {
          return json(
            {
              ok: false,
              error: "Unauthorized."
            },
            401
          );
        }
        const settings = await env.DB.prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge,
            updated_at
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `).first();
        if (!settings) {
          return json(
            {
              ok: false,
              error: "Shipping settings not found."
            },
            404
          );
        }
        return json({
          ok: true,
          settings: {
            freeShippingThreshold: Number(
              settings.free_shipping_threshold
            ),
            shippingCharge: Number(
              settings.shipping_charge
            ),
            updatedAt: settings.updated_at
          }
        });
      } catch (error) {
        console.error(
          "Get shipping settings error:",
          error
        );
        return json(
          {
            ok: false,
            error: "Unable to load shipping settings."
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/settings/shipping" && request.method === "PUT") {
      try {
        const admin = await getAuthenticatedAdmin(
          request,
          env
        );
        if (!admin) {
          return json(
            {
              ok: false,
              error: "Unauthorized."
            },
            401
          );
        }
        const body = await request.json();
        const freeShippingThreshold = Number(
          body.freeShippingThreshold
        );
        const shippingCharge = Number(
          body.shippingCharge
        );
        if (!Number.isFinite(
          freeShippingThreshold
        ) || freeShippingThreshold < 0) {
          return json(
            {
              ok: false,
              error: "Invalid free shipping threshold."
            },
            400
          );
        }
        if (!Number.isFinite(
          shippingCharge
        ) || shippingCharge < 0) {
          return json(
            {
              ok: false,
              error: "Invalid shipping charge."
            },
            400
          );
        }
        await env.DB.prepare(`
        UPDATE store_settings
        SET
          free_shipping_threshold = ?,
          shipping_charge = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = 1
      `).bind(
          freeShippingThreshold,
          shippingCharge
        ).run();
        return json({
          ok: true,
          message: "Shipping settings updated successfully.",
          settings: {
            freeShippingThreshold,
            shippingCharge
          }
        });
      } catch (error) {
        console.error(
          "Update shipping settings error:",
          error
        );
        return json(
          {
            ok: false,
            error: "Unable to update shipping settings."
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      try {
        const sessionToken = getCookie(
          request,
          SESSION_COOKIE
        );
        if (sessionToken) {
          const sessionHash = await hashSessionToken(
            sessionToken
          );
          await env.DB.prepare(`
              DELETE FROM admin_sessions
              WHERE session_token_hash = ?
            `).bind(sessionHash).run();
        }
        const clearCookie = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
        return json(
          {
            ok: true,
            message: "Logged out successfully."
          },
          200,
          {
            "Set-Cookie": clearCookie
          }
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/products" && request.method === "GET") {
      try {
        const {
          results
        } = await env.DB.prepare(`
          SELECT
            id,
            name,
            slug,
            category,
            description,
            price,
            old_price,
            image_url,
            status,
            created_at
          FROM products
          WHERE status = 'active'
          ORDER BY id DESC
        `).all();
        const productsWithImages = await Promise.all(
          results.map(
            async (product) => {
              const {
                results: images
              } = await env.DB.prepare(`
                  SELECT
                    id,
                    image_url,
                    sort_order,
                    is_main
                  FROM product_images
                  WHERE product_id = ?
                  ORDER BY
                    is_main DESC,
                    sort_order ASC,
                    id ASC
                `).bind(product.id).all();
              const mainImage = images.find(
                (image) => Number(image.is_main) === 1
              );
              const mainImageUrl = mainImage?.image_url || images[0]?.image_url || product.image_url || null;
              return {
                ...product,
                // Main/thumbnail image
                image_url: mainImageUrl,
                // All product images
                images
              };
            }
          )
        );
        return json({
          ok: true,
          products: productsWithImages
        });
      } catch (error) {
        console.error(
          "Public products error:",
          error
        );
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/products/"
    ) && url.pathname.endsWith(
      "/variants"
    ) && request.method === "GET") {
      try {
        const parts = url.pathname.split("/");
        const productId = Number(parts[3]);
        if (!Number.isInteger(
          productId
        ) || productId <= 0) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const product = await env.DB.prepare(`
              SELECT id
              FROM products
              WHERE id = ?
                AND status = 'active'
              LIMIT 1
            `).bind(productId).first();
        if (!product) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        const {
          results
        } = await env.DB.prepare(`
              SELECT
                id,
                product_id,
                size,
                color,
                sku,
                stock_quantity
              FROM product_variants
              WHERE product_id = ?
                AND stock_quantity > 0
              ORDER BY id ASC
            `).bind(productId).all();
        return json({
          ok: true,
          variants: results
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith("/api/admin/variants/") && request.method === "PUT") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const variantId = url.pathname.split("/").pop();
        if (!variantId || !/^\d+$/.test(variantId)) {
          return json(
            {
              ok: false,
              error: "Invalid variant ID."
            },
            400
          );
        }
        const body = await request.json();
        const stockQuantity = Number(
          body.stock_quantity
        );
        if (!Number.isInteger(
          stockQuantity
        ) || stockQuantity < 0) {
          return json(
            {
              ok: false,
              error: "Stock quantity must be a non-negative integer."
            },
            400
          );
        }
        const variant = await env.DB.prepare(`
          SELECT
            id,
            product_id,
            size,
            color,
            sku,
            stock_quantity
          FROM product_variants
          WHERE id = ?
          LIMIT 1
        `).bind(variantId).first();
        if (!variant) {
          return json(
            {
              ok: false,
              error: "Variant not found."
            },
            404
          );
        }
        await env.DB.prepare(`
        UPDATE product_variants
        SET
          stock_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
          stockQuantity,
          variantId
        ).run();
        return json({
          ok: true,
          message: "Stock updated successfully.",
          variant: {
            id: variant.id,
            product_id: variant.product_id,
            size: variant.size,
            color: variant.color,
            sku: variant.sku,
            stock_quantity: stockQuantity
          }
        });
      } catch (error) {
        console.error(
          "Update stock error:",
          error
        );
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/customers" && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const {
          results
        } = await env.DB.prepare(`
          SELECT
            id,
            name,
            email,
            phone,
            address,
            city,
            postal_code,
            country,
            status,
            created_at,
            updated_at
          FROM customers
          ORDER BY id DESC
        `).all();
        return json({
          ok: true,
          customers: results,
          count: results.length
        });
      } catch (error) {
        console.error(
          "Get admin customers error:",
          error
        );
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    const statusUpdateMatch = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
    if (statusUpdateMatch && request.method === "PUT") {
      const admin = await getAuthenticatedAdmin(request, env);
      if (!admin) return json({ ok: false, error: "Unauthorized." }, 401);
      try {
        const orderId = Number(statusUpdateMatch[1]);
        let body;
        try { body = await request.json(); }
        catch { return json({ ok: false, error: "Invalid JSON request body." }, 400); }
        const allowedStatuses = ["pending", "confirmed", "processing", "packaging", "shipped", "delivered", "cancelled", "delivery_failed"];
        const newStatus = String(body?.status || "").trim().toLowerCase();
        const note = String(body?.note || "").trim().slice(0, 500);
        if (!allowedStatuses.includes(newStatus)) {
          return json({ ok: false, error: "Invalid order status." }, 400);
        }
        const order = await env.DB.prepare("SELECT id, order_status FROM orders WHERE id = ? LIMIT 1").bind(orderId).first();
        if (!order) return json({ ok: false, error: "Order not found." }, 404);
        const oldStatus = String(order.order_status || "pending").toLowerCase();
        if (oldStatus === newStatus && !note) {
          return json({ ok: true, message: "Order already has this status.", status: newStatus });
        }
        await env.DB.batch([
          env.DB.prepare("UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newStatus, orderId),
          env.DB.prepare(`
            INSERT INTO order_status_history
              (order_id, old_status, new_status, note, changed_by_admin_id)
            VALUES (?, ?, ?, ?, ?)
          `).bind(orderId, oldStatus, newStatus, note, admin.admin_id)
        ]);
        return json({ ok: true, message: "Order status updated.", orderId, oldStatus, status: newStatus });
      } catch (error) {
        console.error("Admin order status update error:", error);
        return json({ ok: false, error: "Unable to update order status." }, 500);
      }
    }
    if (url.pathname === "/api/admin/orders" && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const {
          results
        } = await env.DB.prepare(`
          SELECT
            id,
            order_number,
            customer_id,
            subtotal,
            shipping_fee,
            total_amount,
            payment_method,
            payment_status,
            order_status,
            shipping_name,
            shipping_phone,
            shipping_address,
            shipping_city,
            notes,
            discount,
            partial_payment,
            created_at,
            updated_at
          FROM orders
          ORDER BY id DESC
        `).all();
        return json({
          ok: true,
          orders: results
        });
      } catch (error) {
        console.error(
          "Get admin orders error:",
          error
        );
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/orders/"
    ) && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const orderId = url.pathname.split("/").pop();
        if (!orderId || !/^\d+$/.test(orderId)) {
          return json(
            {
              ok: false,
              error: "Invalid order ID."
            },
            400
          );
        }
        const order = await env.DB.prepare(`
          SELECT
            id,
            order_number,
            customer_id,
            subtotal,
            shipping_fee,
            total_amount,
            payment_method,
            payment_status,
            order_status,
            shipping_name,
            shipping_phone,
            shipping_address,
            shipping_city,
            notes,
            discount,
            partial_payment,
            created_at,
            updated_at
          FROM orders
          WHERE id = ?
          LIMIT 1
        `).bind(orderId).first();
        if (!order) {
          return json(
            {
              ok: false,
              error: "Order not found."
            },
            404
          );
        }
        const {
          results: items
        } = await env.DB.prepare(`
          SELECT
            id,
            product_id,
            variant_id,
            product_name,
            size,
            color,
            quantity,
            unit_price,
            subtotal
          FROM order_items
          WHERE order_id = ?
          ORDER BY id ASC
        `).bind(orderId).all();
        return json({
          ok: true,
          order: {
            ...order,
            items
          }
        });
      } catch (error) {
        console.error(
          "Get single order error:",
          error
        );
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/products" && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const {
          results
        } = await env.DB.prepare(`
              SELECT
                id,
                name,
                slug,
                category,
                description,
                price,
                old_price,
                image_url,
                status,
                created_at,
                updated_at
              FROM products
              ORDER BY id DESC
            `).all();
        return json({
          ok: true,
          products: results
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.match(/^\/api\/admin\/products\/\d+\/images$/) && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const parts = url.pathname.split("/");
        const productId = Number(parts[4]);
        if (!Number.isInteger(productId) || productId <= 0) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const product = await env.DB.prepare(`
          SELECT id, name
          FROM products
          WHERE id = ?
          LIMIT 1
        `).bind(productId).first();
        if (!product) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        const { results } = await env.DB.prepare(`
          SELECT
            id,
            product_id,
            image_url,
            sort_order,
            is_main,
            created_at,
            updated_at
          FROM product_images
          WHERE product_id = ?
          ORDER BY sort_order ASC, id ASC
        `).bind(productId).all();
        return json({
          ok: true,
          product,
          images: results
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.match(/^\/api\/admin\/products\/\d+\/images$/) && request.method === "POST") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const parts = url.pathname.split("/");
        const productId = Number(parts[4]);
        if (!Number.isInteger(productId) || productId <= 0) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const product = await env.DB.prepare(`
          SELECT id
          FROM products
          WHERE id = ?
          LIMIT 1
        `).bind(productId).first();
        if (!product) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        const body = await request.json();
        const imageUrl = body?.image_url?.trim();
        const sortOrder = Number.isInteger(
          Number(body?.sort_order)
        ) ? Number(body.sort_order) : 0;
        const isMain = body?.is_main ? 1 : 0;
        if (!imageUrl) {
          return json(
            {
              ok: false,
              error: "Image URL is required."
            },
            400
          );
        }
        if (isMain === 1) {
          await env.DB.prepare(`
          UPDATE product_images
          SET is_main = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE product_id = ?
        `).bind(productId).run();
        }
        const result = await env.DB.prepare(`
          INSERT INTO product_images
          (
            product_id,
            image_url,
            sort_order,
            is_main
          )
          VALUES (?, ?, ?, ?)
        `).bind(
          productId,
          imageUrl,
          sortOrder,
          isMain
        ).run();
        return json(
          {
            ok: true,
            message: "Product image added successfully.",
            image_id: result.meta.last_row_id
          },
          201
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.match(/^\/api\/admin\/product-images\/\d+$/) && request.method === "DELETE") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const parts = url.pathname.split("/");
        const imageId = Number(parts[4]);
        if (!Number.isInteger(imageId) || imageId <= 0) {
          return json(
            {
              ok: false,
              error: "Invalid image ID."
            },
            400
          );
        }
        const image = await env.DB.prepare(`
          SELECT id
          FROM product_images
          WHERE id = ?
          LIMIT 1
        `).bind(imageId).first();
        if (!image) {
          return json(
            {
              ok: false,
              error: "Product image not found."
            },
            404
          );
        }
        await env.DB.prepare(`
        DELETE FROM product_images
        WHERE id = ?
      `).bind(imageId).run();
        return json({
          ok: true,
          message: "Product image deleted successfully."
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname === "/api/admin/products" && request.method === "POST") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized. Please login again."
          },
          401
        );
      }
      try {
        const body = await request.json();
        const name = body?.name?.trim();
        const category = body?.category?.trim();
        const description = body?.description?.trim() || "";
        const price = Number(body?.price);
        const oldPriceValue = body?.old_price;
        const oldPrice = oldPriceValue === null || oldPriceValue === void 0 || oldPriceValue === "" ? null : Number(oldPriceValue);
        const imageUrl = body?.image_url?.trim() || null;
        const status = body?.status === "inactive" ? "inactive" : "active";
        if (!name || !category) {
          return json(
            {
              ok: false,
              error: "Product name and category are required."
            },
            400
          );
        }
        if (!Number.isFinite(price) || price < 0) {
          return json(
            {
              ok: false,
              error: "Invalid product price."
            },
            400
          );
        }
        if (oldPrice !== null && (!Number.isFinite(
          oldPrice
        ) || oldPrice < 0)) {
          return json(
            {
              ok: false,
              error: "Invalid old price."
            },
            400
          );
        }
        const baseSlug = createSlug(name);
        let slug = baseSlug;
        let counter = 2;
        while (true) {
          const existing = await env.DB.prepare(`
                SELECT id
                FROM products
                WHERE slug = ?
                LIMIT 1
              `).bind(slug).first();
          if (!existing) {
            break;
          }
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        const result = await env.DB.prepare(`
              INSERT INTO products (
                name,
                slug,
                category,
                description,
                price,
                old_price,
                image_url,
                status
              )
              VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?
              )
            `).bind(
          name,
          slug,
          category,
          description,
          price,
          oldPrice,
          imageUrl,
          status
        ).run();
        return json(
          {
            ok: true,
            message: "Product created successfully.",
            product_id: result.meta.last_row_id,
            slug
          },
          201
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/products/"
    ) && request.method === "PUT") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized. Please login again."
          },
          401
        );
      }
      try {
        const productId = url.pathname.split("/").pop();
        if (!productId || !/^\d+$/.test(productId)) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const body = await request.json();
        const name = body?.name?.trim();
        const category = body?.category?.trim();
        const description = body?.description?.trim() || "";
        const price = Number(body?.price);
        const oldPriceValue = body?.old_price;
        const oldPrice = oldPriceValue === null || oldPriceValue === void 0 || oldPriceValue === "" ? null : Number(oldPriceValue);
        const imageUrl = body?.image_url?.trim() || null;
        const status = body?.status === "inactive" ? "inactive" : "active";
        if (!name || !category) {
          return json(
            {
              ok: false,
              error: "Product name and category are required."
            },
            400
          );
        }
        if (!Number.isFinite(price) || price < 0) {
          return json(
            {
              ok: false,
              error: "Invalid product price."
            },
            400
          );
        }
        if (oldPrice !== null && (!Number.isFinite(
          oldPrice
        ) || oldPrice < 0)) {
          return json(
            {
              ok: false,
              error: "Invalid old price."
            },
            400
          );
        }
        const existing = await env.DB.prepare(`
              SELECT id
              FROM products
              WHERE id = ?
              LIMIT 1
            `).bind(productId).first();
        if (!existing) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        await env.DB.prepare(`
            UPDATE products
            SET
              name = ?,
              category = ?,
              description = ?,
              price = ?,
              old_price = ?,
              image_url = ?,
              status = ?,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
          name,
          category,
          description,
          price,
          oldPrice,
          imageUrl,
          status,
          productId
        ).run();
        return json({
          ok: true,
          message: "Product updated successfully."
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/products/"
    ) && request.method === "DELETE") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const productId = url.pathname.split("/").pop();
        if (!productId || !/^\d+$/.test(productId)) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const existing = await env.DB.prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `).bind(productId).first();
        if (!existing) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        await env.DB.prepare(`
            UPDATE products
            SET
              status = 'inactive',
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(productId).run();
        return json({
          ok: true,
          message: "Product deleted successfully."
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/products/"
    ) && url.pathname.endsWith(
      "/variants"
    ) && request.method === "GET") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const parts = url.pathname.split("/");
        const productId = parts[4];
        if (!productId || !/^\d+$/.test(productId)) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const product = await env.DB.prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `).bind(productId).first();
        if (!product) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        const {
          results
        } = await env.DB.prepare(`
              SELECT
                id,
                product_id,
                size,
                color,
                sku,
                stock_quantity,
                created_at,
                updated_at
              FROM product_variants
              WHERE product_id = ?
              ORDER BY id ASC
            `).bind(productId).all();
        return json({
          ok: true,
          product,
          variants: results
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/products/"
    ) && url.pathname.endsWith(
      "/variants"
    ) && request.method === "POST") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const parts = url.pathname.split("/");
        const productId = parts[4];
        if (!productId || !/^\d+$/.test(productId)) {
          return json(
            {
              ok: false,
              error: "Invalid product ID."
            },
            400
          );
        }
        const product = await env.DB.prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `).bind(productId).first();
        if (!product) {
          return json(
            {
              ok: false,
              error: "Product not found."
            },
            404
          );
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return json(
            {
              ok: false,
              error: "Invalid JSON request body."
            },
            400
          );
        }
        const size = body?.size?.trim() || null;
        const color = body?.color?.trim() || null;
        const sku = body?.sku?.trim() || null;
        const stockQuantity = Number(
          body?.stock_quantity ?? 0
        );
        if (!Number.isFinite(
          stockQuantity
        ) || !Number.isInteger(
          stockQuantity
        ) || stockQuantity < 0) {
          return json(
            {
              ok: false,
              error: "Stock quantity must be a non-negative integer."
            },
            400
          );
        }
        if (!size && !color) {
          return json(
            {
              ok: false,
              error: "At least size or color is required."
            },
            400
          );
        }
        if (sku) {
          const existingSku = await env.DB.prepare(`
                SELECT id
                FROM product_variants
                WHERE sku = ?
                LIMIT 1
              `).bind(sku).first();
          if (existingSku) {
            return json(
              {
                ok: false,
                error: "This SKU already exists."
              },
              409
            );
          }
        }
        const result = await env.DB.prepare(`
              INSERT INTO product_variants (
                product_id,
                size,
                color,
                sku,
                stock_quantity
              )
              VALUES (?, ?, ?, ?, ?)
            `).bind(
          productId,
          size,
          color,
          sku,
          stockQuantity
        ).run();
        return json(
          {
            ok: true,
            message: "Product variant created successfully.",
            variant_id: result.meta.last_row_id
          },
          201
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/variants/"
    ) && request.method === "PUT") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const variantId = url.pathname.split("/").pop();
        if (!variantId || !/^\d+$/.test(variantId)) {
          return json(
            {
              ok: false,
              error: "Invalid variant ID."
            },
            400
          );
        }
        const existing = await env.DB.prepare(`
              SELECT
                id,
                product_id
              FROM product_variants
              WHERE id = ?
              LIMIT 1
            `).bind(variantId).first();
        if (!existing) {
          return json(
            {
              ok: false,
              error: "Variant not found."
            },
            404
          );
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return json(
            {
              ok: false,
              error: "Invalid JSON request body."
            },
            400
          );
        }
        const size = body?.size?.trim() || null;
        const color = body?.color?.trim() || null;
        const sku = body?.sku?.trim() || null;
        const stockQuantity = Number(
          body?.stock_quantity ?? 0
        );
        if (!Number.isFinite(
          stockQuantity
        ) || !Number.isInteger(
          stockQuantity
        ) || stockQuantity < 0) {
          return json(
            {
              ok: false,
              error: "Stock quantity must be a non-negative integer."
            },
            400
          );
        }
        if (!size && !color) {
          return json(
            {
              ok: false,
              error: "At least size or color is required."
            },
            400
          );
        }
        if (sku) {
          const existingSku = await env.DB.prepare(`
                SELECT id
                FROM product_variants
                WHERE sku = ?
                  AND id != ?
                LIMIT 1
              `).bind(
            sku,
            variantId
          ).first();
          if (existingSku) {
            return json(
              {
                ok: false,
                error: "This SKU already exists."
              },
              409
            );
          }
        }
        await env.DB.prepare(`
            UPDATE product_variants
            SET
              size = ?,
              color = ?,
              sku = ?,
              stock_quantity = ?,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
          size,
          color,
          sku,
          stockQuantity,
          variantId
        ).run();
        return json({
          ok: true,
          message: "Product variant updated successfully."
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    if (url.pathname.startsWith(
      "/api/admin/variants/"
    ) && request.method === "DELETE") {
      const admin = await getAuthenticatedAdmin(
        request,
        env
      );
      if (!admin) {
        return json(
          {
            ok: false,
            error: "Unauthorized."
          },
          401
        );
      }
      try {
        const variantId = url.pathname.split("/").pop();
        if (!variantId || !/^\d+$/.test(variantId)) {
          return json(
            {
              ok: false,
              error: "Invalid variant ID."
            },
            400
          );
        }
        const existing = await env.DB.prepare(`
              SELECT id
              FROM product_variants
              WHERE id = ?
              LIMIT 1
            `).bind(variantId).first();
        if (!existing) {
          return json(
            {
              ok: false,
              error: "Variant not found."
            },
            404
          );
        }
        await env.DB.prepare(`
            DELETE FROM product_variants
            WHERE id = ?
          `).bind(variantId).run();
        return json({
          ok: true,
          message: "Product variant deleted successfully."
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error.message
          },
          500
        );
      }
    }
    return env.ASSETS.fetch(
      request
    );
  }
};
function createSlug(value) {
  const slug = String(value).toLowerCase().trim().replace(
    /[^a-z0-9]+/g,
    "-"
  ).replace(
    /^-+|-+$/g,
    ""
  );
  return slug || `product-${Date.now()}`;
}
__name(createSlug, "createSlug");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
