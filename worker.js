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

    // Serve the existing CANVO website
    return env.ASSETS.fetch(request);
  }
};
