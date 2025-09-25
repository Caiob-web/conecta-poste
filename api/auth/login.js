// api/auth/login.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe email e password.' });
    }

    const q = `SELECT id, name, email FROM users WHERE email=$1 AND password=$2 LIMIT 1`;
    const { rows } = await pool.query(q, [email, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    console.error('LOGIN ERROR', err);
    return res.status(500).json({ error: 'Falha no login.' });
  }
}
