// ============================================================
// CANVO E-COMMERCE BACKEND
// Cloudflare Worker + D1
// ============================================================

const SESSION_COOKIE = "canvo_admin_session";
const SESSION_DAYS = 7;

// ============================================================
// PASSWORD HASHING
// ============================================================

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

  const hashBytes =
    new Uint8Array(derivedBits);

  return (
    `pbkdf2$100000$${bytesToHex(salt)}$${bytesToHex(hashBytes)}`
  );
}

// ============================================================
// PASSWORD VERIFY
// ============================================================

async function verifyPassword(
  password,
  storedHash
) {
  try {
    const parts =
      storedHash.split("$");

    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2"
    ) {
      return false;
    }

    const iterations =
      Number(parts[1]);

    const saltHex =
      parts[2];

    const expectedHashHex =
      parts[3];

    const salt =
      hexToBytes(saltHex);

    const encoder =
      new TextEncoder();

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );

    const actualHash =
      new Uint8Array(derivedBits);

    const actualHashHex =
      bytesToHex(actualHash);

    return timingSafeEqual(
      actualHashHex,
      expectedHashHex
    );

  } catch {
    return false;
  }
}

// ============================================================
// HEX HELPERS
// ============================================================

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function hexToBytes(hex) {
  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < hex.length;
    i += 2
  ) {
    bytes[i / 2] =
      parseInt(
        hex.substring(i, i + 2),
        16
      );
  }

  return bytes;
}

// ============================================================
// TIMING SAFE COMPARISON
// ============================================================

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================
// SESSION TOKEN
// ============================================================

function createSessionToken() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  return bytesToHex(bytes);
}

async function hashSessionToken(token) {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(token);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToHex(
    new Uint8Array(hashBuffer)
  );
}

// ============================================================
// COOKIE
// ============================================================

function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const [
      key,
      ...valueParts
    ] =
      cookie.trim().split("=");

    if (key === name) {
      return valueParts.join("=");
    }
  }

  return null;
}

// ============================================================
// AUTHENTICATE ADMIN
// ============================================================

async function getAuthenticatedAdmin(
  request,
  env
) {
  const sessionToken =
    getCookie(
      request,
      SESSION_COOKIE
    );

  if (!sessionToken) {
    return null;
  }

  const sessionHash =
    await hashSessionToken(
      sessionToken
    );

  const session =
    await env.DB
      .prepare(`
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
      `)
      .bind(sessionHash)
      .first();

  if (!session) {
    return null;
  }

  const expiresAt =
    new Date(
      session.expires_at
    ).getTime();

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    await env.DB
      .prepare(`
        DELETE FROM admin_sessions
        WHERE id = ?
      `)
      .bind(session.session_id)
      .run();

    return null;
  }

  return session;
}

// ============================================================
// JSON RESPONSE
// ============================================================

function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store",

        ...extraHeaders
      }
    }
  );
}

// ============================================================
// WORKER
// ============================================================

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(request.url);

    // ========================================================
    // 1. HEALTH CHECK
    // ========================================================

    if (
      url.pathname === "/api/health"
    ) {
      return json({
        ok: true,
        service: "CANVO API",
        database: "connected"
      });
    }

    // ========================================================
    // 2. D1 DATABASE TEST
    // ========================================================

    if (
      url.pathname === "/api/db-test"
    ) {
      try {

        const result =
          await env.DB
            .prepare(
              "SELECT 1 AS test"
            )
            .first();

        return json({
          ok: true,
          database:
            "CANVO D1 connected",
          result
        });

      } catch (error) {

        return json(
          {
            ok: false,
            database:
              "D1 connection failed",
            error:
              error.message
          },
          500
        );
      }
    }


    // ========================================================
// 3. CREATE CUSTOMER ORDER
// ========================================================

if (
  request.method === "POST" &&
  url.pathname === "/api/orders"
) {

  try {

    const body =
      await request.json();

    const customer =
      body.customer || {};

    const items =
      Array.isArray(body.items)
        ? body.items
        : [];


    // ----------------------------------------------------
    // BASIC VALIDATION
    // ----------------------------------------------------

    if (
      !customer.name ||
      !customer.phone ||
      !customer.district ||
      !customer.thana ||
      !customer.address
    ) {

      return json(
        {
          ok: false,
          error:
            "Please provide all required customer information."
        },
        400
      );

    }


    if (!items.length) {

      return json(
        {
          ok: false,
          error:
            "Order must contain at least one item."
        },
        400
      );

    }


    // ----------------------------------------------------
    // FIND OR CREATE CUSTOMER
    // ----------------------------------------------------

    let customerRecord =
      await env.DB
        .prepare(`
          SELECT
            id,
            name,
            phone
          FROM customers
          WHERE phone = ?
          LIMIT 1
        `)
        .bind(
          customer.phone
        )
        .first();


    let customerId;


    if (customerRecord) {

      customerId =
        customerRecord.id;


      // Update customer's latest information
      await env.DB
        .prepare(`
          UPDATE customers
          SET
            name = ?,
            address = ?,
            city = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          customer.name,
          customer.address,
          customer.district,
          customerId
        )
        .run();

    } else {

      const customerResult =
        await env.DB
          .prepare(`
            INSERT INTO customers (
              name,
              phone,
              address,
              city,
              country,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            customer.name,
            customer.phone,
            customer.address,
            customer.district,
            "Bangladesh",
            "active"
          )
          .run();


      customerId =
        customerResult.meta.last_row_id;

    }


    // ----------------------------------------------------
    // CHECK PRODUCTS + VARIANTS + STOCK
    // ----------------------------------------------------

    const orderItems = [];

    let subtotal = 0;


    for (const item of items) {

      const productId =
        Number(item.productId);

      const variantId =
        Number(item.variantId);

      const quantity =
        Number(item.quantity);


      if (
        !Number.isInteger(productId) ||
        !Number.isInteger(variantId) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {

        return json(
          {
            ok: false,
            error:
              "Invalid product, variant or quantity."
          },
          400
        );

      }


      // --------------------------------------------------
      // GET ACTIVE PRODUCT
      // --------------------------------------------------

      const product =
        await env.DB
          .prepare(`
            SELECT
              id,
              name,
              price,
              status
            FROM products
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
          `)
          .bind(
            productId
          )
          .first();


      if (!product) {

        return json(
          {
            ok: false,
            error:
              `Product ${productId} was not found or is inactive.`
          },
          404
        );

      }


      // --------------------------------------------------
      // GET VARIANT
      // --------------------------------------------------

      const variant =
        await env.DB
          .prepare(`
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
          `)
          .bind(
            variantId,
            productId
          )
          .first();


      if (!variant) {

        return json(
          {
            ok: false,
            error:
              `Selected variant for ${product.name} was not found.`
          },
          404
        );

      }


      // --------------------------------------------------
      // STOCK CHECK
      // --------------------------------------------------

      if (
        Number(variant.stock_quantity) <
        quantity
      ) {

        return json(
          {
            ok: false,
            error:
              `Only ${variant.stock_quantity} unit(s) of ${product.name} are available.`
          },
          400
        );

      }


      // --------------------------------------------------
      // SERVER-SIDE PRICE
      // --------------------------------------------------

      const unitPrice =
        Number(product.price);

      const itemSubtotal =
        unitPrice * quantity;


      subtotal +=
        itemSubtotal;


      orderItems.push({

        productId,

        variantId,

        productName:
          product.name,

        size:
          variant.size || null,

        color:
          variant.color || null,

        unitPrice,

        quantity,

        subtotal:
          itemSubtotal

      });

    }


    // ----------------------------------------------------
    // SHIPPING — read the current Admin Settings from D1
    // ----------------------------------------------------

    const shippingSettings =
      await env.DB
        .prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `)
        .first();

    if (!shippingSettings) {
      return json(
        {
          ok: false,
          error: "Shipping settings are not configured."
        },
        500
      );
    }

    const freeShippingThreshold =
      Number(shippingSettings.free_shipping_threshold);

    const standardShippingCharge =
      Number(shippingSettings.shipping_charge);

    if (
      !Number.isFinite(freeShippingThreshold) ||
      freeShippingThreshold < 0 ||
      !Number.isFinite(standardShippingCharge) ||
      standardShippingCharge < 0
    ) {
      return json(
        {
          ok: false,
          error: "Shipping settings contain invalid values."
        },
        500
      );
    }

    const shippingFee =
      subtotal === 0 || subtotal >= freeShippingThreshold
        ? 0
        : standardShippingCharge;


    // ----------------------------------------------------
    // DISCOUNT
    // ----------------------------------------------------

    const discount =
      Number(
        body.discount || 0
      );


    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > subtotal
    ) {

      return json(
        {
          ok: false,
          error:
            "Invalid discount amount."
        },
        400
      );

    }


    // ----------------------------------------------------
    // TOTAL
    // ----------------------------------------------------

    const totalAmount =
      subtotal +
      shippingFee -
      discount;


    // ----------------------------------------------------
    // PARTIAL PAYMENT
    // ----------------------------------------------------

    let partialPayment =
      Number(
        body.partialPayment || 0
      );


    if (
      !Number.isFinite(partialPayment) ||
      partialPayment < 0
    ) {

      return json(
        {
          ok: false,
          error:
            "Invalid partial payment amount."
        },
        400
      );

    }


    if (
      partialPayment > totalAmount
    ) {

      partialPayment =
        totalAmount;

    }


    // ----------------------------------------------------
    // PAYMENT METHOD
    // ----------------------------------------------------

    const paymentMethod =
      body.paymentMethod ||
      "online";


    // ----------------------------------------------------
    // CREATE UNIQUE ORDER NUMBER
    // ----------------------------------------------------

    const orderNumber =
      `CANVO-${Date.now()}-${crypto
        .randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;


    // ----------------------------------------------------
    // SHIPPING ADDRESS
    // ----------------------------------------------------
    // Current orders table has no separate "thana" column.
    // Therefore we store:
    // shipping_city    = district
    // shipping_address = thana + address
    // ----------------------------------------------------

    const shippingAddress =
      `${customer.thana}, ${customer.address}`;


    // ----------------------------------------------------
    // CREATE ORDER
    // ----------------------------------------------------

    const orderResult =
      await env.DB
        .prepare(`
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
        `)
        .bind(

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

        )
        .run();


    const orderId =
      orderResult.meta.last_row_id;


    // ----------------------------------------------------
    // INSERT ORDER ITEMS + DECREASE STOCK
    // ----------------------------------------------------

    const statements = [];


    for (const item of orderItems) {

      // ----------------------------------------------
      // INSERT ORDER ITEM
      // ----------------------------------------------

      statements.push(

        env.DB
          .prepare(`
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
          `)
          .bind(

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


      // ----------------------------------------------
      // DECREASE STOCK
      // ----------------------------------------------

      statements.push(

        env.DB
          .prepare(`
            UPDATE product_variants
            SET
              stock_quantity =
                stock_quantity - ?,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
              AND stock_quantity >= ?
          `)
          .bind(

            item.quantity,

            item.variantId,

            item.quantity

          )

      );

    }


    await env.DB.batch(
      statements
    );


    // ----------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------

    return json(
      {
        ok: true,

        message:
          "Order created successfully.",

        order: {

          id:
            orderId,

          orderNumber:
            orderNumber,

          customerId:
            customerId,

          subtotal:
            subtotal,

          shippingFee:
            shippingFee,

          discount:
            discount,

          total:
            totalAmount,

          partialPayment:
            partialPayment,

          paymentMethod:
            paymentMethod,

          paymentStatus:
            "pending",

          orderStatus:
            "pending"

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

        error:
          "Unable to create order.",

        details:
          error.message
      },
      500
    );

  }

}


    // ========================================================
    // 6. ADMIN SESSION CHECK
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/me" &&
      request.method === "GET"
    ) {

      try {

        const admin =
          await getAuthenticatedAdmin(
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
            id:
              admin.admin_id,

            name:
              admin.name,

            email:
              admin.email,

            role:
              admin.role
          }
        });

      } catch (error) {

        return json(
          {
            authenticated: false,
            error:
              error.message
          },
          500
        );
      }
    }
// ========================================================
// PUBLIC SHIPPING SETTINGS
// ========================================================

if (
  url.pathname ===
    "/api/settings/shipping" &&
  request.method === "GET"
) {

  try {

    const settings =
      await env.DB
        .prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `)
        .first();


    if (!settings) {

      return json(
        {
          ok: false,
          error:
            "Shipping settings not found."
        },
        404
      );

    }


    return json({

      ok: true,

      settings: {

        freeShippingThreshold:
          Number(
            settings.free_shipping_threshold
          ),

        shippingCharge:
          Number(
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
        error:
          "Unable to load shipping settings."
      },
      500
    );

  }

}
    // ========================================================
// 7. ADMIN SHIPPING SETTINGS
// ========================================================

// GET SHIPPING SETTINGS
if (
  url.pathname ===
    "/api/admin/settings/shipping" &&
  request.method === "GET"
) {

  try {

    const admin =
      await getAuthenticatedAdmin(
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


    const settings =
      await env.DB
        .prepare(`
          SELECT
            free_shipping_threshold,
            shipping_charge,
            updated_at
          FROM store_settings
          WHERE id = 1
          LIMIT 1
        `)
        .first();


    if (!settings) {

      return json(
        {
          ok: false,
          error:
            "Shipping settings not found."
        },
        404
      );

    }


    return json({
      ok: true,

      settings: {
        freeShippingThreshold:
          Number(
            settings.free_shipping_threshold
          ),

        shippingCharge:
          Number(
            settings.shipping_charge
          ),

        updatedAt:
          settings.updated_at
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
        error:
          "Unable to load shipping settings."
      },
      500
    );

  }

}


// UPDATE SHIPPING SETTINGS
if (
  url.pathname ===
    "/api/admin/settings/shipping" &&
  request.method === "PUT"
) {

  try {

    const admin =
      await getAuthenticatedAdmin(
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


    const body =
      await request.json();


    const freeShippingThreshold =
      Number(
        body.freeShippingThreshold
      );


    const shippingCharge =
      Number(
        body.shippingCharge
      );


    if (
      !Number.isFinite(
        freeShippingThreshold
      ) ||
      freeShippingThreshold < 0
    ) {

      return json(
        {
          ok: false,
          error:
            "Invalid free shipping threshold."
        },
        400
      );

    }


    if (
      !Number.isFinite(
        shippingCharge
      ) ||
      shippingCharge < 0
    ) {

      return json(
        {
          ok: false,
          error:
            "Invalid shipping charge."
        },
        400
      );

    }


    await env.DB
      .prepare(`
        UPDATE store_settings
        SET
          free_shipping_threshold = ?,
          shipping_charge = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = 1
      `)
      .bind(
        freeShippingThreshold,
        shippingCharge
      )
      .run();


    return json({
      ok: true,

      message:
        "Shipping settings updated successfully.",

      settings: {
        freeShippingThreshold:
          freeShippingThreshold,

        shippingCharge:
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
        error:
          "Unable to update shipping settings."
      },
      500
    );

  }

}
    // ========================================================
    // 7. ADMIN LOGOUT
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/logout" &&
      request.method === "POST"
    ) {

      try {

        const sessionToken =
          getCookie(
            request,
            SESSION_COOKIE
          );

        if (sessionToken) {

          const sessionHash =
            await hashSessionToken(
              sessionToken
            );

          await env.DB
            .prepare(`
              DELETE FROM admin_sessions
              WHERE session_token_hash = ?
            `)
            .bind(sessionHash)
            .run();
        }

        const clearCookie =
          `${SESSION_COOKIE}=; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Path=/; ` +
          `Max-Age=0`;

        return json(
          {
            ok: true,
            message:
              "Logged out successfully."
          },
          200,
          {
            "Set-Cookie":
              clearCookie
          }
        );

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
// 8. PUBLIC ACTIVE PRODUCTS
// ========================================================

if (
  url.pathname ===
    "/api/products" &&
  request.method === "GET"
) {

  try {

    // ----------------------------------------------------
    // GET ACTIVE PRODUCTS
    // ----------------------------------------------------

    const {
      results
    } =
      await env.DB
        .prepare(`
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
        `)
        .all();


    // ----------------------------------------------------
    // GET PRODUCT IMAGES
    // ----------------------------------------------------

    const productsWithImages =
      await Promise.all(

        results.map(
          async product => {

            const {
              results: images
            } =
              await env.DB
                .prepare(`
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
                `)
                .bind(product.id)
                .all();


            // ------------------------------------------------
            // FIND MAIN IMAGE
            // ------------------------------------------------

            const mainImage =
              images.find(
                image =>
                  Number(image.is_main) === 1
              );


            // ------------------------------------------------
            // MAIN IMAGE
            //
            // Priority:
            // 1. product_images main image
            // 2. first product_images image
            // 3. old products.image_url
            // ------------------------------------------------

            const mainImageUrl =
              mainImage?.image_url ||
              images[0]?.image_url ||
              product.image_url ||
              null;


            return {

              ...product,

              // Main/thumbnail image
              image_url:
                mainImageUrl,

              // All product images
              images

            };

          }
        )

      );


    // ----------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------

    return json({
      ok: true,
      products:
        productsWithImages
    });


  } catch (error) {

    console.error(
      "Public products error:",
      error
    );


    return json(
      {
        ok: false,
        error:
          error.message
      },
      500
    );

  }

}
    // ========================================================
    // 9. PUBLIC PRODUCT VARIANTS
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/products/"
      ) &&
      url.pathname.endsWith(
        "/variants"
      ) &&
      request.method === "GET"
    ) {

      try {

        const parts =
          url.pathname.split("/");

        const productId =
          Number(parts[3]);

        if (
          !Number.isInteger(
            productId
          ) ||
          productId <= 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product ID."
            },
            400
          );
        }

        const product =
          await env.DB
            .prepare(`
              SELECT id
              FROM products
              WHERE id = ?
                AND status = 'active'
              LIMIT 1
            `)
            .bind(productId)
            .first();

        if (!product) {

          return json(
            {
              ok: false,
              error:
                "Product not found."
            },
            404
          );
        }

        const {
          results
        } =
          await env.DB
            .prepare(`
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
            `)
            .bind(productId)
            .all();

        return json({
          ok: true,
          variants:
            results
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }
// ========================================================
// ADMIN — UPDATE STOCK
// ========================================================

if (
  url.pathname.startsWith("/api/admin/variants/") &&
  request.method === "PUT"
) {

  const admin =
    await getAuthenticatedAdmin(
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

    const variantId =
      url.pathname
        .split("/")
        .pop();


    if (
      !variantId ||
      !/^\d+$/.test(variantId)
    ) {

      return json(
        {
          ok: false,
          error: "Invalid variant ID."
        },
        400
      );

    }


    const body =
      await request.json();


    const stockQuantity =
      Number(
        body.stock_quantity
      );


    if (
      !Number.isInteger(
        stockQuantity
      ) ||
      stockQuantity < 0
    ) {

      return json(
        {
          ok: false,
          error:
            "Stock quantity must be a non-negative integer."
        },
        400
      );

    }


    const variant =
      await env.DB
        .prepare(`
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
        `)
        .bind(variantId)
        .first();


    if (!variant) {

      return json(
        {
          ok: false,
          error: "Variant not found."
        },
        404
      );

    }


    await env.DB
      .prepare(`
        UPDATE product_variants
        SET
          stock_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        stockQuantity,
        variantId
      )
      .run();


    return json({
      ok: true,
      message:
        "Stock updated successfully.",
      variant: {
        id: variant.id,
        product_id: variant.product_id,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        stock_quantity:
          stockQuantity
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
    // ========================================================
// ADMIN — GET ALL CUSTOMERS
// ========================================================

if (
  url.pathname === "/api/admin/customers" &&
  request.method === "GET"
) {

  const admin =
    await getAuthenticatedAdmin(
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
    } =
      await env.DB
        .prepare(`
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
        `)
        .all();


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
// ========================================================
// 10. ADMIN — GET ALL ORDERS
// ========================================================

if (
  url.pathname ===
    "/api/admin/orders" &&
  request.method === "GET"
) {

  const admin =
    await getAuthenticatedAdmin(
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
    } =
      await env.DB
        .prepare(`
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
        `)
        .all();


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
        error:
          error.message
      },
      500
    );

  }

}

  // ========================================================
// 11. ADMIN — GET SINGLE ORDER
// ========================================================

if (
  url.pathname.startsWith(
    "/api/admin/orders/"
  ) &&
  request.method === "GET"
) {

  const admin =
    await getAuthenticatedAdmin(
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

    const orderId =
      url.pathname
        .split("/")
        .pop();


    if (
      !orderId ||
      !/^\d+$/.test(orderId)
    ) {

      return json(
        {
          ok: false,
          error: "Invalid order ID."
        },
        400
      );

    }


    // -----------------------------------------
    // GET ORDER
    // -----------------------------------------

    const order =
      await env.DB
        .prepare(`
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
        `)
        .bind(orderId)
        .first();


    if (!order) {

      return json(
        {
          ok: false,
          error: "Order not found."
        },
        404
      );

    }


    // -----------------------------------------
    // GET ORDER ITEMS
    // -----------------------------------------

    const {
      results: items
    } =
      await env.DB
        .prepare(`
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
        `)
        .bind(orderId)
        .all();


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
    // ========================================================
    // 10. ADMIN — GET ALL PRODUCTS
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/products" &&
      request.method === "GET"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const {
          results
        } =
          await env.DB
            .prepare(`
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
            `)
            .all();

        return json({
          ok: true,
          products:
            results
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }


    // ========================================================
// PRODUCT IMAGES — ADMIN
// ========================================================

// GET ALL IMAGES FOR A PRODUCT
if (
  url.pathname.match(/^\/api\/admin\/products\/\d+\/images$/) &&
  request.method === "GET"
) {

  const admin =
    await getAuthenticatedAdmin(
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

    const parts =
      url.pathname.split("/");

    const productId =
      Number(parts[4]);

    if (
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return json(
        {
          ok: false,
          error: "Invalid product ID."
        },
        400
      );
    }

    const product =
      await env.DB
        .prepare(`
          SELECT id, name
          FROM products
          WHERE id = ?
          LIMIT 1
        `)
        .bind(productId)
        .first();

    if (!product) {
      return json(
        {
          ok: false,
          error: "Product not found."
        },
        404
      );
    }

    const { results } =
      await env.DB
        .prepare(`
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
        `)
        .bind(productId)
        .all();

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


// ADD NEW PRODUCT IMAGE
if (
  url.pathname.match(/^\/api\/admin\/products\/\d+\/images$/) &&
  request.method === "POST"
) {

  const admin =
    await getAuthenticatedAdmin(
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

    const parts =
      url.pathname.split("/");

    const productId =
      Number(parts[4]);

    if (
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return json(
        {
          ok: false,
          error: "Invalid product ID."
        },
        400
      );
    }

    const product =
      await env.DB
        .prepare(`
          SELECT id
          FROM products
          WHERE id = ?
          LIMIT 1
        `)
        .bind(productId)
        .first();

    if (!product) {
      return json(
        {
          ok: false,
          error: "Product not found."
        },
        404
      );
    }

    const body =
      await request.json();

    const imageUrl =
      body?.image_url?.trim();

    const sortOrder =
      Number.isInteger(
        Number(body?.sort_order)
      )
        ? Number(body.sort_order)
        : 0;

    const isMain =
      body?.is_main ? 1 : 0;


    if (!imageUrl) {
      return json(
        {
          ok: false,
          error: "Image URL is required."
        },
        400
      );
    }


    // If this image is Main,
    // remove Main status from other images.
    if (isMain === 1) {

      await env.DB
        .prepare(`
          UPDATE product_images
          SET is_main = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE product_id = ?
        `)
        .bind(productId)
        .run();

    }


    const result =
      await env.DB
        .prepare(`
          INSERT INTO product_images
          (
            product_id,
            image_url,
            sort_order,
            is_main
          )
          VALUES (?, ?, ?, ?)
        `)
        .bind(
          productId,
          imageUrl,
          sortOrder,
          isMain
        )
        .run();


    return json(
      {
        ok: true,
        message:
          "Product image added successfully.",
        image_id:
          result.meta.last_row_id
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


// DELETE PRODUCT IMAGE
if (
  url.pathname.match(/^\/api\/admin\/product-images\/\d+$/) &&
  request.method === "DELETE"
) {

  const admin =
    await getAuthenticatedAdmin(
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

    const parts =
      url.pathname.split("/");

    const imageId =
      Number(parts[4]);

    if (
      !Number.isInteger(imageId) ||
      imageId <= 0
    ) {
      return json(
        {
          ok: false,
          error: "Invalid image ID."
        },
        400
      );
    }

    const image =
      await env.DB
        .prepare(`
          SELECT id
          FROM product_images
          WHERE id = ?
          LIMIT 1
        `)
        .bind(imageId)
        .first();

    if (!image) {
      return json(
        {
          ok: false,
          error: "Product image not found."
        },
        404
      );
    }

    await env.DB
      .prepare(`
        DELETE FROM product_images
        WHERE id = ?
      `)
      .bind(imageId)
      .run();

    return json({
      ok: true,
      message:
        "Product image deleted successfully."
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
    
    // ========================================================
    // 11. ADMIN — CREATE PRODUCT
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/products" &&
      request.method === "POST"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized. Please login again."
          },
          401
        );
      }

      try {

        const body =
          await request.json();

        const name =
          body?.name?.trim();

        const category =
          body?.category?.trim();

        const description =
          body?.description?.trim() ||
          "";

        const price =
          Number(body?.price);

        const oldPriceValue =
          body?.old_price;

        const oldPrice =
          oldPriceValue === null ||
          oldPriceValue === undefined ||
          oldPriceValue === ""
            ? null
            : Number(oldPriceValue);

        const imageUrl =
          body?.image_url?.trim() ||
          null;

        const status =
          body?.status === "inactive"
            ? "inactive"
            : "active";

        if (
          !name ||
          !category
        ) {

          return json(
            {
              ok: false,
              error:
                "Product name and category are required."
            },
            400
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product price."
            },
            400
          );
        }

        if (
          oldPrice !== null &&
          (
            !Number.isFinite(
              oldPrice
            ) ||
            oldPrice < 0
          )
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid old price."
            },
            400
          );
        }

        const baseSlug =
          createSlug(name);

        let slug =
          baseSlug;

        let counter = 2;

        while (true) {

          const existing =
            await env.DB
              .prepare(`
                SELECT id
                FROM products
                WHERE slug = ?
                LIMIT 1
              `)
              .bind(slug)
              .first();

          if (!existing) {
            break;
          }

          slug =
            `${baseSlug}-${counter}`;

          counter++;
        }

        const result =
          await env.DB
            .prepare(`
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
            `)
            .bind(
              name,
              slug,
              category,
              description,
              price,
              oldPrice,
              imageUrl,
              status
            )
            .run();

        return json(
          {
            ok: true,
            message:
              "Product created successfully.",
            product_id:
              result.meta.last_row_id,
            slug
          },
          201
        );

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 12. ADMIN — EDIT PRODUCT
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/products/"
      ) &&
      request.method === "PUT"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized. Please login again."
          },
          401
        );
      }

      try {

        const productId =
          url.pathname
            .split("/")
            .pop();

        if (
          !productId ||
          !/^\d+$/.test(productId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product ID."
            },
            400
          );
        }

        const body =
          await request.json();

        const name =
          body?.name?.trim();

        const category =
          body?.category?.trim();

        const description =
          body?.description?.trim() ||
          "";

        const price =
          Number(body?.price);

        const oldPriceValue =
          body?.old_price;

        const oldPrice =
          oldPriceValue === null ||
          oldPriceValue === undefined ||
          oldPriceValue === ""
            ? null
            : Number(oldPriceValue);

        const imageUrl =
          body?.image_url?.trim() ||
          null;

        const status =
          body?.status === "inactive"
            ? "inactive"
            : "active";

        if (
          !name ||
          !category
        ) {

          return json(
            {
              ok: false,
              error:
                "Product name and category are required."
            },
            400
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product price."
            },
            400
          );
        }

        if (
          oldPrice !== null &&
          (
            !Number.isFinite(
              oldPrice
            ) ||
            oldPrice < 0
          )
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid old price."
            },
            400
          );
        }

        const existing =
          await env.DB
            .prepare(`
              SELECT id
              FROM products
              WHERE id = ?
              LIMIT 1
            `)
            .bind(productId)
            .first();

        if (!existing) {

          return json(
            {
              ok: false,
              error:
                "Product not found."
            },
            404
          );
        }

        await env.DB
          .prepare(`
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
          `)
          .bind(
            name,
            category,
            description,
            price,
            oldPrice,
            imageUrl,
            status,
            productId
          )
          .run();

        return json({
          ok: true,
          message:
            "Product updated successfully."
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 13. ADMIN — DELETE PRODUCT
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/products/"
      ) &&
      request.method === "DELETE"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const productId =
          url.pathname
            .split("/")
            .pop();

        if (
          !productId ||
          !/^\d+$/.test(productId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product ID."
            },
            400
          );
        }

        const existing =
          await env.DB
            .prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `)
            .bind(productId)
            .first();

        if (!existing) {

          return json(
            {
              ok: false,
              error:
                "Product not found."
            },
            404
          );
        }

        await env.DB
          .prepare(`
            UPDATE products
            SET
              status = 'inactive',
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(productId)
          .run();

        return json({
          ok: true,
          message:
            "Product deleted successfully."
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 14. ADMIN — GET VARIANTS
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/products/"
      ) &&
      url.pathname.endsWith(
        "/variants"
      ) &&
      request.method === "GET"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const parts =
          url.pathname.split("/");

        const productId =
          parts[4];

        if (
          !productId ||
          !/^\d+$/.test(productId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product ID."
            },
            400
          );
        }

        const product =
          await env.DB
            .prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `)
            .bind(productId)
            .first();

        if (!product) {

          return json(
            {
              ok: false,
              error:
                "Product not found."
            },
            404
          );
        }

        const {
          results
        } =
          await env.DB
            .prepare(`
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
            `)
            .bind(productId)
            .all();

        return json({
          ok: true,
          product,
          variants:
            results
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 15. ADMIN — ADD VARIANT
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/products/"
      ) &&
      url.pathname.endsWith(
        "/variants"
      ) &&
      request.method === "POST"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const parts =
          url.pathname.split("/");

        const productId =
          parts[4];

        if (
          !productId ||
          !/^\d+$/.test(productId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid product ID."
            },
            400
          );
        }

        const product =
          await env.DB
            .prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
              LIMIT 1
            `)
            .bind(productId)
            .first();

        if (!product) {

          return json(
            {
              ok: false,
              error:
                "Product not found."
            },
            404
          );
        }

        let body;

        try {

          body =
            await request.json();

        } catch {

          return json(
            {
              ok: false,
              error:
                "Invalid JSON request body."
            },
            400
          );
        }

        const size =
          body?.size?.trim() ||
          null;

        const color =
          body?.color?.trim() ||
          null;

        const sku =
          body?.sku?.trim() ||
          null;

        const stockQuantity =
          Number(
            body?.stock_quantity ?? 0
          );

        if (
          !Number.isFinite(
            stockQuantity
          ) ||
          !Number.isInteger(
            stockQuantity
          ) ||
          stockQuantity < 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Stock quantity must be a non-negative integer."
            },
            400
          );
        }

        if (
          !size &&
          !color
        ) {

          return json(
            {
              ok: false,
              error:
                "At least size or color is required."
            },
            400
          );
        }

        if (sku) {

          const existingSku =
            await env.DB
              .prepare(`
                SELECT id
                FROM product_variants
                WHERE sku = ?
                LIMIT 1
              `)
              .bind(sku)
              .first();

          if (existingSku) {

            return json(
              {
                ok: false,
                error:
                  "This SKU already exists."
              },
              409
            );
          }
        }

        const result =
          await env.DB
            .prepare(`
              INSERT INTO product_variants (
                product_id,
                size,
                color,
                sku,
                stock_quantity
              )
              VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
              productId,
              size,
              color,
              sku,
              stockQuantity
            )
            .run();

        return json(
          {
            ok: true,
            message:
              "Product variant created successfully.",
            variant_id:
              result.meta.last_row_id
          },
          201
        );

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 16. ADMIN — UPDATE VARIANT
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/variants/"
      ) &&
      request.method === "PUT"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const variantId =
          url.pathname
            .split("/")
            .pop();

        if (
          !variantId ||
          !/^\d+$/.test(variantId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid variant ID."
            },
            400
          );
        }

        const existing =
          await env.DB
            .prepare(`
              SELECT
                id,
                product_id
              FROM product_variants
              WHERE id = ?
              LIMIT 1
            `)
            .bind(variantId)
            .first();

        if (!existing) {

          return json(
            {
              ok: false,
              error:
                "Variant not found."
            },
            404
          );
        }

        let body;

        try {

          body =
            await request.json();

        } catch {

          return json(
            {
              ok: false,
              error:
                "Invalid JSON request body."
            },
            400
          );
        }

        const size =
          body?.size?.trim() ||
          null;

        const color =
          body?.color?.trim() ||
          null;

        const sku =
          body?.sku?.trim() ||
          null;

        const stockQuantity =
          Number(
            body?.stock_quantity ?? 0
          );

        if (
          !Number.isFinite(
            stockQuantity
          ) ||
          !Number.isInteger(
            stockQuantity
          ) ||
          stockQuantity < 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Stock quantity must be a non-negative integer."
            },
            400
          );
        }

        if (
          !size &&
          !color
        ) {

          return json(
            {
              ok: false,
              error:
                "At least size or color is required."
            },
            400
          );
        }

        if (sku) {

          const existingSku =
            await env.DB
              .prepare(`
                SELECT id
                FROM product_variants
                WHERE sku = ?
                  AND id != ?
                LIMIT 1
              `)
              .bind(
                sku,
                variantId
              )
              .first();

          if (existingSku) {

            return json(
              {
                ok: false,
                error:
                  "This SKU already exists."
              },
              409
            );
          }
        }

        await env.DB
          .prepare(`
            UPDATE product_variants
            SET
              size = ?,
              color = ?,
              sku = ?,
              stock_quantity = ?,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(
            size,
            color,
            sku,
            stockQuantity,
            variantId
          )
          .run();

        return json({
          ok: true,
          message:
            "Product variant updated successfully."
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // 17. ADMIN — DELETE VARIANT
    // ========================================================

    if (
      url.pathname.startsWith(
        "/api/admin/variants/"
      ) &&
      request.method === "DELETE"
    ) {

      const admin =
        await getAuthenticatedAdmin(
          request,
          env
        );

      if (!admin) {

        return json(
          {
            ok: false,
            error:
              "Unauthorized."
          },
          401
        );
      }

      try {

        const variantId =
          url.pathname
            .split("/")
            .pop();

        if (
          !variantId ||
          !/^\d+$/.test(variantId)
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid variant ID."
            },
            400
          );
        }

        const existing =
          await env.DB
            .prepare(`
              SELECT id
              FROM product_variants
              WHERE id = ?
              LIMIT 1
            `)
            .bind(variantId)
            .first();

        if (!existing) {

          return json(
            {
              ok: false,
              error:
                "Variant not found."
            },
            404
          );
        }

        await env.DB
          .prepare(`
            DELETE FROM product_variants
            WHERE id = ?
          `)
          .bind(variantId)
          .run();

        return json({
          ok: true,
          message:
            "Product variant deleted successfully."
        });

      } catch (error) {

        return json(
          {
            ok: false,
            error:
              error.message
          },
          500
        );
      }
    }

    // ========================================================
    // SERVE CANVO WEBSITE
    // ========================================================

    return env.ASSETS.fetch(
      request
    );
  }
};

// ============================================================
// SLUG GENERATOR
// ============================================================

function createSlug(value) {

  const slug =
    String(value)
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  return (
    slug ||
    `product-${Date.now()}`
  );
}