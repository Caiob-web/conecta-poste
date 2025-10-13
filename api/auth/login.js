// api/auth/login.js
// Login serverless (Vercel) – Condição B
// Lê username+password em TEXTO PURO na tabela public.users

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Informe username e password." });
    }

    // Senha em TEXTO PURO, como você quer
    const sql = `
      SELECT id, username
      FROM public.users
      WHERE is_active = true
        AND username = $1
        AND password = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ error: "Falha no login." });
  }
};
