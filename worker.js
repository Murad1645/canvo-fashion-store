// ============================================================
// CANVO E-COMMERCE BACKEND
// Cloudflare Worker + D1
//
// Features:
// - Health check
// - D1 test
// - First admin setup
// - Admin login
// - Admin session authentication
// - Admin logout
// - Get active products
// - Admin product list
// - Admin create product
// - Existing static website serving
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const SESSION_COOKIE = "canvo_admin_session";

const SESSION_DAYS = 7;


// ============================================================
// PASSWORD HASHING
// ============================================================

async function hashPassword(password) {

  const encoder = new TextEncoder();

  const salt =
    crypto.getRandomValues(
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
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );


  const hashBytes =
    new Uint8Array(derivedBits);


  const saltHex =
    bytesToHex(salt);


  const hashHex =
    bytesToHex(hashBytes);


  return (
    `pbkdf2$100000$${saltHex}$${hashHex}`
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
          salt: salt,
          iterations: iterations,
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
// TIMING SAFE STRING COMPARISON
// ============================================================

function timingSafeEqual(
  a,
  b
) {

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
// RANDOM SESSION TOKEN
// ============================================================

function createSessionToken() {

  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );


  return bytesToHex(bytes);
}


// ============================================================
// HASH SESSION TOKEN
// ============================================================

async function hashSessionToken(
  token
) {

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
// COOKIE PARSER
// ============================================================

function getCookie(
  request,
  name
) {

  const cookieHeader =
    request.headers.get("Cookie");


  if (!cookieHeader) {
    return null;
  }


  const cookies =
    cookieHeader.split(";");


  for (
    const cookie of cookies
  ) {

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
// AUTHENTICATE ADMIN SESSION
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
// JSON RESPONSE HELPER
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
    // 3. FIRST ADMIN SETUP
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/setup" &&
      request.method === "POST"
    ) {

      try {

        const adminCount =
          await env.DB
            .prepare(
              "SELECT COUNT(*) AS count FROM admins"
            )
            .first();


        const existingAdmins =
          Number(
            adminCount?.count || 0
          );


        if (
          existingAdmins > 0
        ) {

          return json(
            {
              ok: false,
              error:
                "Admin setup is already completed."
            },
            403
          );

        }


        const setupKey =
          request.headers.get(
            "X-Admin-Setup-Key"
          );


        if (
          !setupKey ||
          setupKey !==
            env.ADMIN_SETUP_KEY
        ) {

          return json(
            {
              ok: false,
              error:
                "Invalid setup key."
            },
            401
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


        const name =
          body?.name?.trim();


        const email =
          body?.email
            ?.trim()
            .toLowerCase();


        const password =
          body?.password;


        if (
          !name ||
          !email ||
          !password
        ) {

          return json(
            {
              ok: false,
              error:
                "Name, email and password are required."
            },
            400
          );

        }


        if (
          password.length < 10
        ) {

          return json(
            {
              ok: false,
              error:
                "Password must be at least 10 characters."
            },
            400
          );

        }


        const passwordHash =
          await hashPassword(
            password
          );


        const result =
          await env.DB
            .prepare(`
              INSERT INTO admins
              (
                name,
                email,
                password_hash,
                role,
                status
              )
              VALUES
              (?, ?, ?, 'admin', 'active')
            `)
            .bind(
              name,
              email,
              passwordHash
            )
            .run();


        return json({
          ok: true,
          message:
            "Admin account created successfully.",
          admin_id:
            result.meta.last_row_id
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
    // 4. ADMIN LOGIN
    // ========================================================

    if (
      url.pathname ===
        "/api/admin/login" &&
      request.method === "POST"
    ) {

      try {

        const body =
          await request.json();


        const email =
          body?.email
            ?.trim()
            .toLowerCase();


        const password =
          body?.password;


        if (
          !email ||
          !password
        ) {

          return json(
            {
              ok: false,
              error:
                "Email and password are required."
            },
            400
          );

        }


        const admin =
          await env.DB
            .prepare(`
              SELECT
                id,
                name,
                email,
                password_hash,
                role,
                status
              FROM admins
              WHERE email = ?
              LIMIT 1
            `)
            .bind(email)
            .first();


        if (!admin) {

          return json(
            {
              ok: false,
              error:
                "Invalid email or password."
            },
            401
          );

        }


        if (
          admin.status !==
          "active"
        ) {

          return json(
            {
              ok: false,
              error:
                "Admin account is inactive."
            },
            403
          );

        }


        const passwordCorrect =
          await verifyPassword(
            password,
            admin.password_hash
          );


        if (!passwordCorrect) {

          return json(
            {
              ok: false,
              error:
                "Invalid email or password."
            },
            401
          );

        }


        // Create session
        const sessionToken =
          createSessionToken();


        const sessionHash =
          await hashSessionToken(
            sessionToken
          );


        const expiresAt =
          new Date(
            Date.now() +
            SESSION_DAYS *
              24 *
              60 *
              60 *
              1000
          ).toISOString();


        await env.DB
          .prepare(`
            INSERT INTO admin_sessions
            (
              admin_id,
              session_token_hash,
              expires_at
            )
            VALUES (?, ?, ?)
          `)
          .bind(
            admin.id,
            sessionHash,
            expiresAt
          )
          .run();


        const cookie =
          `${SESSION_COOKIE}=${sessionToken}; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Path=/; ` +
          `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;


        return json(
          {
            ok: true,
            message:
              "Login successful.",
            admin: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              role: admin.role
            }
          },
          200,
          {
            "Set-Cookie":
              cookie
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
    // 5. ADMIN SESSION CHECK
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
    // 6. ADMIN LOGOUT
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
    // 7. PUBLIC ACTIVE PRODUCTS
    // ========================================================

    if (
      url.pathname ===
        "/api/products" &&
      request.method === "GET"
    ) {

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
                created_at
              FROM products
              WHERE status = 'active'
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
    // 8. ADMIN — GET ALL PRODUCTS
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
    // 9. ADMIN — CREATE PRODUCT
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
          oldPriceValue ===
            null ||
          oldPriceValue ===
            undefined ||
          oldPriceValue ===
            ""
            ? null
            : Number(oldPriceValue);


        const imageUrl =
          body?.image_url?.trim() ||
          null;


        const status =
          body?.status ===
          "inactive"
            ? "inactive"
            : "active";


        // --------------------------------------------
        // Validation
        // --------------------------------------------

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
            !Number.isFinite(oldPrice) ||
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


        // --------------------------------------------
        // Generate slug
        // --------------------------------------------

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


        // --------------------------------------------
        // Insert product
        // --------------------------------------------

        const result =
          await env.DB
            .prepare(`
              INSERT INTO products
              (
                name,
                slug,
                category,
                description,
                price,
                old_price,
                image_url,
                status
              )
              VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)
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
    // 10. SERVE EXISTING CANVO WEBSITE
    // ========================================================

// ============================================================
// ADMIN EDIT PRODUCT
// ============================================================

if (
  url.pathname.startsWith("/api/admin/products/") &&
  request.method === "PUT"
) {
  const admin = await getAuthenticatedAdmin(request, env);

  if (!admin) {
    return json({
      ok: false,
      error: "Unauthorized. Please login again."
    }, 401);
  }

  try {
    const productId = url.pathname.split("/").pop();

    if (!productId || !/^\d+$/.test(productId)) {
      return json({
        ok: false,
        error: "Invalid product ID."
      }, 400);
    }

    const body = await request.json();

    const name = body?.name?.trim();
    const category = body?.category?.trim();
    const description = body?.description?.trim() || "";
    const price = Number(body?.price);

    const oldPriceValue = body?.old_price;

    const oldPrice =
      oldPriceValue === null ||
      oldPriceValue === undefined ||
      oldPriceValue === ""
        ? null
        : Number(oldPriceValue);

    const imageUrl =
      body?.image_url?.trim() || null;

    const status =
      body?.status === "inactive"
        ? "inactive"
        : "active";

    if (!name || !category) {
      return json({
        ok: false,
        error: "Product name and category are required."
      }, 400);
    }

    if (!Number.isFinite(price) || price < 0) {
      return json({
        ok: false,
        error: "Invalid product price."
      }, 400);
    }

    if (
      oldPrice !== null &&
      (!Number.isFinite(oldPrice) || oldPrice < 0)
    ) {
      return json({
        ok: false,
        error: "Invalid old price."
      }, 400);
    }

    const existing = await env.DB
      .prepare(`
        SELECT id
        FROM products
        WHERE id = ?
        LIMIT 1
      `)
      .bind(productId)
      .first();

    if (!existing) {
      return json({
        ok: false,
        error: "Product not found."
      }, 404);
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
          updated_at = CURRENT_TIMESTAMP
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
      message: "Product updated successfully."
    });

  } catch (error) {
    return json({
      ok: false,
      error: error.message
    }, 500);
  }
}


// ============================================================
// ADMIN DELETE PRODUCT
// ============================================================

if (
  url.pathname.startsWith("/api/admin/products/") &&
  request.method === "DELETE"
) {
  const admin = await getAuthenticatedAdmin(request, env);

  if (!admin) {
    return json({
      ok: false,
      error: "Unauthorized. Please login again."
    }, 401);
  }

  try {
    const productId = url.pathname.split("/").pop();

    if (!productId || !/^\d+$/.test(productId)) {
      return json({
        ok: false,
        error: "Invalid product ID."
      }, 400);
    }

    const existing = await env.DB
      .prepare(`
        SELECT id, name
        FROM products
        WHERE id = ?
        LIMIT 1
      `)
      .bind(productId)
      .first();

    if (!existing) {
      return json({
        ok: false,
        error: "Product not found."
      }, 404);
    }

    // Soft delete:
    // Product remains in database for existing order history,
    // but becomes inactive and disappears from the storefront.

    await env.DB
      .prepare(`
        UPDATE products
        SET
          status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(productId)
      .run();

    return json({
      ok: true,
      message: "Product deleted successfully."
    });

  } catch (error) {
    return json({
      ok: false,
      error: error.message
    }, 500);
  }
}
    
    return env.ASSETS.fetch(
      request
    );

  }

};


// ============================================================
// SLUG GENERATOR
// ============================================================

function createSlug(
  value
) {

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


  return slug ||
    `product-${Date.now()}`;

}
