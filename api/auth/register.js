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

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO public.users (username, password_hash, is_active)
       VALUES ($1, $2, TRUE)`,
      [username, hash]
    );

    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === "23505") {
      res.status(409).json({ ok: false, error: "username já existe" });
    } else {
      console.error("register error:", e);
      res.status(500).json({ ok: false, error: "Erro interno" });
    }
  }
};
