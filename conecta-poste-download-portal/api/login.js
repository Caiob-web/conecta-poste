import { neon } from "@neondatabase/serverless";
import { createSessionCookie, safePasswordEquals } from "./_auth.js";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
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

    const sql = getDatabase();
    const rows = await sql`
      select id, username, "password" as password, is_active
      from public.users
      where lower(username) = lower(${normalizedUsername})
      limit 1
    `;

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
}
