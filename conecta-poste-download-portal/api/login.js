const { Pool } = require("pg");
const { createSessionCookie, safePasswordEquals, getConnectionString } = require("./_auth.js");

let pool;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getDatabase() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL/POSTGRES_URL não configurada.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }

  return pool;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método não permitido." });
  }

  try {
    const { username = "", password = "" } = req.body || {};
    const normalizedUsername = String(username).trim();
    const submittedPassword = String(password);

    if (!normalizedUsername || !submittedPassword) {
      return sendJson(res, 400, { error: "Informe usuário e senha." });
    }

    if (normalizedUsername.length > 120 || submittedPassword.length > 200) {
      return sendJson(res, 400, { error: "Usuário ou senha inválidos." });
    }

    const db = getDatabase();
    const { rows } = await db.query(`
      select id, username, "password" as password, is_active
      from public.users
      where lower(username) = lower($1)
      limit 1
    `, [normalizedUsername]);

    const user = rows[0];
    const isActive = user?.is_active === true;
    const isValidPassword = user && safePasswordEquals(user.password, submittedPassword);

    if (!isActive || !isValidPassword) {
      return sendJson(res, 401, { error: "Usuário ou senha inválidos." });
    }

    res.setHeader("Set-Cookie", createSessionCookie(user));
    return sendJson(res, 200, {
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error("Falha no login do portal:", error.message);
    return sendJson(res, 500, { error: "Não foi possível autenticar agora. Tente novamente em instantes." });
  }
};
