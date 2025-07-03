// api/censo.js
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-blue-heart-a8qoih6k-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Método não permitido");

  try {
    const { rows } = await pool.query(`
      SELECT poste, cidade, coordenadas
      FROM censo_municipio
      WHERE coordenadas IS NOT NULL AND TRIM(coordenadas)<>''`);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Erro /api/censo:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
}
