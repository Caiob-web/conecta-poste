// Arquivo: /api/postes.js

const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-blue-heart-a8qoih6k-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false },
});

let cachePostes = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");
  const now = Date.now();
  if (cachePostes && now - cacheTimestamp < CACHE_TTL) {
    return res.status(200).json(cachePostes);
  }
  try {
    const { rows } = await pool.query(`
      SELECT d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
             d.material, d.altura, d.tensao_mecanica, d.coordenadas,
             ep.empresa
      FROM dados_poste d
      LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
      WHERE d.coordenadas IS NOT NULL AND TRIM(d.coordenadas)<>''
    `);
    cachePostes = rows;
    cacheTimestamp = now;
    res.status(200).json(rows);
  } catch (err) {
    console.error("Erro /api/postes:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
}
