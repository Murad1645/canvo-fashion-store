// CANVO backend - D1 database integration

// CANVO backend - D1 database integration

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API health check
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "CANVO API",
        database: "connected"
      });
    }

    // Real D1 database test
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

    // Get active products from D1
    if (url.pathname === "/api/products" && request.method === "GET") {
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

    // Serve the existing CANVO website
    return env.ASSETS.fetch(request);
  }
};
