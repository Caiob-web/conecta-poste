// /api/auth/login.js
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();

    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Missing credentials" });
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const { rows } = await client.query(
      "SELECT id, username, password_hash, is_active FROM auth_users WHERE username = $1 LIMIT 1",
      [username]
    );
    await client.end();

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Credenciais inválidas" });
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({ ok: true, token, username: user.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
