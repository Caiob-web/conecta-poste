// api/transformadores.js
import { Pool } from "pg";

/**
 * Pool global (evita múltiplas conexões em dev/serverless).
 */
const getPool = () => {
  if (!globalThis._pgPool) {
    globalThis._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalThis._pgPool;
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const pool = getPool();

  // ---- parâmetros opcionais ----
  const bbox =
    typeof req.query.bbox === "string"
      ? req.query.bbox.split(",").map(Number)
      : null;

  // Normaliza coordenadas removendo espaços: "-23.1, -45.2" -> "-23.1,-45.2"
  const coordExpr = `regexp_replace(t.coordenadas, '\\s+', '', 'g')`;
  const latExpr = `split_part(${coordExpr}, ',', 1)::float`;
  const lonExpr = `split_part(${coordExpr}, ',', 2)::float`;

  // WHERE base: coordenadas válidas
  const where = [
    "t.coordenadas IS NOT NULL",
    "TRIM(t.coordenadas) <> ''",
    `split_part(${coordExpr}, ',', 1) <> ''`,
    `split_part(${coordExpr}, ',', 2) <> ''`,
  ];
  const params = [];

  // Filtro por caixa (lonMin,latMin,lonMax,latMax)
  if (bbox && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    const [lonMin, latMin, lonMax, latMax] = bbox;

    // lat entre latMin e latMax
    where.push(`${latExpr} BETWEEN $${params.length + 1} AND $${params.length + 2}`);
    params.push(Math.min(latMin, latMax), Math.max(latMin, latMax));

    // lon entre lonMin e lonMax
    where.push(`${lonExpr} BETWEEN $${params.length + 1} AND $${params.length + 2}`);
    params.push(Math.min(lonMin, lonMax), Math.max(lonMin, lonMax));
  }

  try {
    const sql = `
      SELECT
        t.id_transformador,
        t.referencia_eletrica,
        t.nome_municipio,
        t.tipo_zona,
        t.config,
        t.cap_nominal,
        t.coordenadas,
        t.tipo_oleo,
        ${latExpr} AS lat,
        ${lonExpr} AS lon
      FROM transformadores t
      WHERE ${where.join(" AND ")}
    `;

    const { rows } = await pool.query(sql, params);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Erro /api/transformadores:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}

// Desativa o bodyParser por segurança/compatibilidade (não usamos body em GET)
export const config = { api: { bodyParser: false } };
