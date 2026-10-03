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

    // Serve the existing CANVO website
    return env.ASSETS.fetch(request);
  }
};
