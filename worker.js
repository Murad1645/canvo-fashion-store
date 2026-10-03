// CANVO Backend
// D1 Database + Admin Authentication + Products API


// ==================================================
// 1. PASSWORD HASHING
// ==================================================

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
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);

  const saltHex = Array.from(salt)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  const hashHex = Array.from(hashBytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return `pbkdf2$100000$${saltHex}$${hashHex}`;
}


// ==================================================
// 2. PASSWORD VERIFICATION
// ==================================================

async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const algorithm = parts[0];
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const storedHashHex = parts[3];

    if (algorithm !== "pbkdf2") {
      return false;
    }

    if (!Number.isFinite(iterations) || iterations <= 0) {
      return false;
    }

    if (saltHex.length % 2 !== 0) {
      return false;
    }

    const salt = new Uint8Array(
      saltHex.length / 2
    );

    for (let i = 0; i < salt.length; i++) {
      salt[i] = parseInt(
        saltHex.substring(i * 2, i * 2 + 2),
        16
      );
    }

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
        salt: salt,
        iterations: iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

    const calculatedHash = new Uint8Array(
      derivedBits
    );

    const calculatedHashHex = Array.from(
      calculatedHash
    )
      .map(byte =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");

    return calculatedHashHex === storedHashHex;

  } catch {
    return false;
  }
}


// ==================================================
// 3. HASH SESSION TOKEN
// ==================================================

async function hashToken(token) {
  const data = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(data))
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


// ==================================================
// 4. GENERATE SESSION TOKEN
// ==================================================

function generateSessionToken() {
  const bytes = crypto.getRandomValues(
    new Uint8Array(32)
  );

  return Array.from(bytes)
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


// ==================================================
// 5. READ COOKIE
// ==================================================

function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...valueParts] =
      cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(
        valueParts.join("=")
      );
    }
  }

  return null;
}


// ==================================================
// 6. SQLITE DATE FORMAT
// ==================================================

function sqliteDate(date) {
  return date
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}


// ==================================================
// 7. WORKER
// ==================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);


    // ==================================================
    // API HEALTH CHECK
    // ==================================================

    if (
      url.pathname === "/api/health"
    ) {

      return Response.json({
        ok: true,
        service: "CANVO API",
        database: "connected"
      });

    }


    // ==================================================
    // D1 DATABASE TEST
    // ==================================================

    if (
      url.pathname === "/api/db-test"
    ) {

      try {

        const result = await env.DB
          .prepare(
            "SELECT 1 AS test"
          )
          .first();

        return Response.json({
          ok: true,
          database: "CANVO D1 connected",
          result: result
        });

      } catch (error) {

        return Response.json(
          {
            ok: false,
            database:
              "D1 connection failed",
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // FIRST ADMIN SETUP
    // ==================================================

    if (
      url.pathname === "/api/admin/setup" &&
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


        // Admin already exists
        if (existingAdmins > 0) {

          return Response.json(
            {
              ok: false,
              error:
                "Admin setup is already completed."
            },
            {
              status: 403
            }
          );

        }


        // Check setup key
        const setupKey =
          request.headers.get(
            "X-Admin-Setup-Key"
          );


        if (
          !setupKey ||
          setupKey !== env.ADMIN_SETUP_KEY
        ) {

          return Response.json(
            {
              ok: false,
              error:
                "Invalid setup key."
            },
            {
              status: 401
            }
          );

        }


        // Read JSON
        let body;

        try {

          body =
            await request.json();

        } catch {

          return Response.json(
            {
              ok: false,
              error:
                "Invalid JSON request body."
            },
            {
              status: 400
            }
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


        // Validate
        if (
          !name ||
          !email ||
          !password
        ) {

          return Response.json(
            {
              ok: false,
              error:
                "Name, email and password are required."
            },
            {
              status: 400
            }
          );

        }


        if (
          password.length < 10
        ) {

          return Response.json(
            {
              ok: false,
              error:
                "Password must be at least 10 characters."
            },
            {
              status: 400
            }
          );

        }


        // Hash password
        const passwordHash =
          await hashPassword(
            password
          );


        // Create admin
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
              (
                ?,
                ?,
                ?,
                'admin',
                'active'
              )
            `)
            .bind(
              name,
              email,
              passwordHash
            )
            .run();


        return Response.json({
          ok: true,
          message:
            "Admin account created successfully.",
          admin_id:
            result.meta.last_row_id
        });

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // ADMIN LOGIN
    // ==================================================

    if (
      url.pathname === "/api/admin/login" &&
      request.method === "POST"
    ) {

      try {

        let body;

        try {

          body =
            await request.json();

        } catch {

          return Response.json(
            {
              ok: false,
              error:
                "Invalid JSON request body."
            },
            {
              status: 400
            }
          );

        }


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

          return Response.json(
            {
              ok: false,
              error:
                "Email and password are required."
            },
            {
              status: 400
            }
          );

        }


        // Find admin
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


        if (
          !admin ||
          admin.status !== "active"
        ) {

          return Response.json(
            {
              ok: false,
              error:
                "Invalid email or password."
            },
            {
              status: 401
            }
          );

        }


        // Verify password
        const passwordValid =
          await verifyPassword(
            password,
            admin.password_hash
          );


        if (!passwordValid) {

          return Response.json(
            {
              ok: false,
              error:
                "Invalid email or password."
            },
            {
              status: 401
            }
          );

        }


        // Remove expired sessions
        await env.DB
          .prepare(`
            DELETE FROM admin_sessions
            WHERE expires_at <= CURRENT_TIMESTAMP
          `)
          .run();


        // Generate session
        const sessionToken =
          generateSessionToken();

        const sessionTokenHash =
          await hashToken(
            sessionToken
          );


        // 7-day expiry
        const expiresAt =
          sqliteDate(
            new Date(
              Date.now() +
              7 * 24 * 60 * 60 * 1000
            )
          );


        // Save session
        await env.DB
          .prepare(`
            INSERT INTO admin_sessions
            (
              admin_id,
              session_token_hash,
              expires_at
            )
            VALUES
            (
              ?,
              ?,
              ?
            )
          `)
          .bind(
            admin.id,
            sessionTokenHash,
            expiresAt
          )
          .run();


        // Secure cookie
        const cookie = [
          `canvo_admin_session=${encodeURIComponent(
            sessionToken
          )}`,
          "Path=/",
          "HttpOnly",
          "Secure",
          "SameSite=Strict",
          "Max-Age=604800"
        ].join("; ");


        return new Response(
          JSON.stringify({
            ok: true,
            message:
              "Login successful.",
            admin: {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              role: admin.role
            }
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
              "Set-Cookie":
                cookie
            }
          }
        );

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // CURRENT ADMIN SESSION
    // ==================================================

    if (
      url.pathname === "/api/admin/me" &&
      request.method === "GET"
    ) {

      try {

        const sessionToken =
          getCookie(
            request,
            "canvo_admin_session"
          );


        if (!sessionToken) {

          return Response.json(
            {
              ok: false,
              authenticated: false
            },
            {
              status: 401
            }
          );

        }


        const sessionTokenHash =
          await hashToken(
            sessionToken
          );


        const session =
          await env.DB
            .prepare(`
              SELECT
                admin_sessions.id AS session_id,
                admin_sessions.expires_at,
                admins.id,
                admins.name,
                admins.email,
                admins.role,
                admins.status
              FROM admin_sessions
              INNER JOIN admins
                ON admins.id =
                   admin_sessions.admin_id
              WHERE
                admin_sessions.session_token_hash = ?
                AND admin_sessions.expires_at >
                    CURRENT_TIMESTAMP
                AND admins.status = 'active'
              LIMIT 1
            `)
            .bind(
              sessionTokenHash
            )
            .first();


        if (!session) {

          return Response.json(
            {
              ok: false,
              authenticated: false
            },
            {
              status: 401
            }
          );

        }


        return Response.json({
          ok: true,
          authenticated: true,
          admin: {
            id: session.id,
            name: session.name,
            email: session.email,
            role: session.role
          },
          expires_at:
            session.expires_at
        });

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // ADMIN LOGOUT
    // ==================================================

    if (
      url.pathname === "/api/admin/logout" &&
      request.method === "POST"
    ) {

      try {

        const sessionToken =
          getCookie(
            request,
            "canvo_admin_session"
          );


        if (sessionToken) {

          const sessionTokenHash =
            await hashToken(
              sessionToken
            );


          await env.DB
            .prepare(`
              DELETE FROM admin_sessions
              WHERE session_token_hash = ?
            `)
            .bind(
              sessionTokenHash
            )
            .run();

        }


        const cookie = [
          "canvo_admin_session=",
          "Path=/",
          "HttpOnly",
          "Secure",
          "SameSite=Strict",
          "Max-Age=0"
        ].join("; ");


        return new Response(
          JSON.stringify({
            ok: true,
            message:
              "Logged out successfully."
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
              "Set-Cookie":
                cookie
            }
          }
        );

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // GET ACTIVE PRODUCTS
    // ==================================================

    if (
      url.pathname === "/api/products" &&
      request.method === "GET"
    ) {

      try {

        const { results } =
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


        return Response.json({
          ok: true,
          products: results
        });

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          {
            status: 500
          }
        );

      }

    }


    // ==================================================
    // SERVE CANVO WEBSITE
    // ==================================================

    return env.ASSETS.fetch(request);

  }

};
