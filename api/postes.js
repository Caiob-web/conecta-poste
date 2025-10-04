// api/postes.js
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
  const shape = String(req.query.shape || "flat").toLowerCase(); // "flat" | "agg"
  const bbox = typeof req.query.bbox === "string"
    ? req.query.bbox.split(",").map(Number)
    : null;

  // WHERE base
  const where = ["d.coordenadas IS NOT NULL", "TRIM(d.coordenadas) <> ''"];
  const params = [];

  // Filtro por caixa (lonMin,latMin,lonMax,latMax)
  if (bbox && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    // Filtra convertendo o texto "lat,lon" para float no SQL
    where.push(
      `split_part(d.coordenadas, ',', 1)::float BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(latMin, latMax), Math.max(latMin, latMax));
    where.push(
      `split_part(d.coordenadas, ',', 2)::float BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(lonMin, lonMax), Math.max(lonMin, lonMax));
  }

  try {
    let rows;

    if (shape === "agg") {
      // 1 linha por poste (empresas agregadas)
      const sql = `
        SELECT
          d.id,
          d.nome_municipio,
          d.nome_bairro,
          d.nome_logradouro,
          d.material,
          d.altura,
          d.tensao_mecanica,
          d.coordenadas,
          split_part(d.coordenadas, ',', 1)::float AS lat,
          split_part(d.coordenadas, ',', 2)::float AS lon,
          COALESCE(
            ARRAY_AGG(ep.empresa) FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
            '{}'
          ) AS empresas,
          COALESCE(
            COUNT(*) FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
            0
          )::int AS qtd_empresas
        FROM dados_poste d
        LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
        WHERE ${where.join(" AND ")}
        GROUP BY d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
                 d.material, d.altura, d.tensao_mecanica, d.coordenadas
      `;
      ({ rows } = await pool.query(sql, params));
    } else {
      // Formato atual: várias linhas por poste (uma por empresa)
      const sql = `
        SELECT
          d.id,
          d.nome_municipio,
          d.nome_bairro,
          d.nome_logradouro,
          d.material,
          d.altura,
          d.tensao_mecanica,
          d.coordenadas,
          ep.empresa
        FROM dados_poste d
        LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
        WHERE ${where.join(" AND ")}
      `;
      ({ rows } = await pool.query(sql, params));
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Erro /api/postes:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}

// Desativa o bodyParser por segurança/compatibilidade (não usamos body em GET)
export const config = { api: { bodyParser: false } };
