// CANVO backend
// D1 database + Admin setup + Products API

// --------------------------------------------------
// Password hashing helpers
// --------------------------------------------------

async function hashPassword(password) {
  const encoder = new TextEncoder();

  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import password as a key
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  // Derive password hash using PBKDF2
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

  // Convert salt and hash to hexadecimal
  const saltHex = Array.from(salt)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  const hashHex = Array.from(hashBytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  // Store algorithm + iterations + salt + hash
  return `pbkdf2$100000$${saltHex}$${hashHex}`;
}


// --------------------------------------------------
// Worker
// --------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ------------------------------------------------
    // 1. API health check
    // ------------------------------------------------

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "CANVO API",
        database: "connected"
      });
    }


    // ------------------------------------------------
    // 2. Real D1 database test
    // ------------------------------------------------

    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS test")
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
            database: "D1 connection failed",
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // ------------------------------------------------
    // 3. First admin account setup
    // ------------------------------------------------

    if (
      url.pathname === "/api/admin/setup" &&
      request.method === "POST"
    ) {
      try {

        // --------------------------------------------
        // Check whether an admin already exists
        // --------------------------------------------

        const adminCount = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM admins")
          .first();

        const existingAdmins = Number(adminCount?.count || 0);

        if (existingAdmins > 0) {
          return Response.json(
            {
              ok: false,
              error: "Admin setup is already completed."
            },
            { status: 403 }
          );
        }


        // --------------------------------------------
        // Check secret setup key
        // --------------------------------------------

        const setupKey = request.headers.get(
          "X-Admin-Setup-Key"
        );

        if (
          !setupKey ||
          setupKey !== env.ADMIN_SETUP_KEY
        ) {
          return Response.json(
            {
              ok: false,
              error: "Invalid setup key."
            },
            { status: 401 }
          );
        }


        // --------------------------------------------
        // Read request body
        // --------------------------------------------

        let body;

        try {
          body = await request.json();
        } catch {
          return Response.json(
            {
              ok: false,
              error: "Invalid JSON request body."
            },
            { status: 400 }
          );
        }


        const name = body?.name?.trim();
        const email = body?.email?.trim().toLowerCase();
        const password = body?.password;


        // --------------------------------------------
        // Validate input
        // --------------------------------------------

        if (!name || !email || !password) {
          return Response.json(
            {
              ok: false,
              error: "Name, email and password are required."
            },
            { status: 400 }
          );
        }


        if (password.length < 10) {
          return Response.json(
            {
              ok: false,
              error: "Password must be at least 10 characters."
            },
            { status: 400 }
          );
        }


        // --------------------------------------------
        // Hash password securely
        // --------------------------------------------

        const passwordHash = await hashPassword(password);


        // --------------------------------------------
        // Create admin account
        // --------------------------------------------

        const result = await env.DB
          .prepare(`
            INSERT INTO admins
            (
              name,
              email,
              password_hash,
              role,
              status
            )
            VALUES (?, ?, ?, 'admin', 'active')
          `)
          .bind(
            name,
            email,
            passwordHash
          )
          .run();


        // --------------------------------------------
        // Success response
        // --------------------------------------------

        return Response.json({
          ok: true,
          message: "Admin account created successfully.",
          admin_id: result.meta.last_row_id
        });

      } catch (error) {

        return Response.json(
          {
            ok: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }


    // ------------------------------------------------
    // 4. Get active products
    // ------------------------------------------------

    if (
      url.pathname === "/api/products" &&
      request.method === "GET"
    ) {
      try {

        const { results } = await env.DB
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
          { status: 500 }
        );
      }
    }


    // ------------------------------------------------
    // 5. Serve the existing CANVO website
    // ------------------------------------------------

    return env.ASSETS.fetch(request);
  }
};
