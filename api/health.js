const { getConnectionString } = require("./_auth.js");

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: true,
    hasDatabaseConfig: Boolean(getConnectionString()),
    envNames: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
      POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
      POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
      POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING)
    }
  }));
};
