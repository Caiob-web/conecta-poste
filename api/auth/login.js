// api/auth/login.js
// Login serverless (Vercel) – ESM
// Lê username+password em TEXTO PURO na tabela public.users

import pkg from "pg";
const { Pool } = pkg;

// Reusa o pool entre invocações para evitar overhead
const pool =
  globalThis._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Neon
  });
if (!globalThis._pgPool) globalThis._pgPool = pool;

export default async function handler(req, res) {
  // (Opcional) Preflight simples, caso algum dia chame de outro origin
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Alguns runtimes já preenchem req.body; outros não.
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      body = raw ? JSON.parse(raw) : null;
    }

    const { username, password } = body || {};
    if (!username || !password) {
      res.status(400).json({ error: "Informe username e password." });
      return;
    }

    // Senha em TEXTO PURO, como solicitado
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
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    res.status(200).json({ user: rows[0] });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ error: "Falha no login." });
  }
}
