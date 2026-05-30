const { Pool } = require("pg");
const { getConnectionString } = require("./_auth.js");

module.exports = async function handler(req, res) {
  const connectionString = getConnectionString();
  const status = {
    ok: true,
    hasDatabaseConfig: Boolean(connectionString),
    envNames: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
      POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
      POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
      POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING)
    },
    database: {
      reachable: false,
      usersTable: false
    }
  };

  if (connectionString) {
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await pool.query("select 1");
      status.database.reachable = true;
      await pool.query("select id, username, password, is_active from public.users limit 1");
      status.database.usersTable = true;
    } catch (error) {
      status.database.errorCode = error.code || "UNKNOWN";
      status.database.error = String(error.message || "Erro desconhecido").slice(0, 160);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(status));
};
