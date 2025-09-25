const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ ok: false, error: "username e password são obrigatórios" });
      return;
    }

    const q = `
      SELECT id, password_hash
      FROM public.users
      WHERE username = $1 AND (is_active IS NULL OR is_active = TRUE)
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [username]);
    if (!rows.length) {
      res.status(401).json({ ok: false, error: "Credenciais inválidas" });
      return;
    }

    const { id, password_hash } = rows[0];
    const ok = await bcrypt.compare(password, password_hash);
    if (!ok) {
      res.status(401).json({ ok: false, error: "Credenciais inválidas" });
      return;
    }

    // Cookie simples de sessão por Vercel Function (não-httpOnly)
    res.setHeader(
      "Set-Cookie",
      `auth_token=${Buffer.from(String(id)).toString("base64")}; Path=/; SameSite=Lax; Secure`
    );

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ ok: false, error: "Erro interno" });
  }
};
