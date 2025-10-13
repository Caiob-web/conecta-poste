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
      max: 5,
    });
  }
  return globalThis._pgPool;
};

/**
 * Utilitários de parse/validação básica
 */
function parseIntSafe(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const pool = getPool();

  // ---- parâmetros ----
  const shape = String(req.query.shape || "flat").toLowerCase(); // "flat" | "agg"
  const format = String(req.query.format || "json").toLowerCase(); // "json" | "ndjson"
  const orderBy = "d.id"; // estável e indexável (ajuste se necessário)

  // paginação
  const limitReq = parseIntSafe(req.query.limit, 5000);
  const limit = clamp(limitReq, 1000, 20000);
  const cursorReq = parseIntSafe(req.query.cursor, 0);
  const offset = Math.max(0, cursorReq);

  // bbox: lonMin,latMin,lonMax,latMax
  const bbox =
    typeof req.query.bbox === "string"
      ? req.query.bbox.split(",").map(Number)
      : null;

  // WHERE base
  const where = [
    "d.coordenadas IS NOT NULL",
    "btrim(d.coordenadas) <> ''",
    // garante string com vírgula separando lat/lon
    "position(',' in d.coordenadas) > 0",
  ];
  const params = [];

  // Extratores de LAT/LON (robustos a espaços)
  const latExpr = "btrim(split_part(d.coordenadas, ',', 1))::float";
  const lonExpr = "btrim(split_part(d.coordenadas, ',', 2))::float";

  // Filtro por caixa (lonMin,latMin,lonMax,latMax)
  if (
    bbox &&
    bbox.length === 4 &&
    bbox.every((n) => Number.isFinite(n))
  ) {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    // LAT
    where.push(
      `${latExpr} BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(latMin, latMax), Math.max(latMin, latMax));
    // LON
    where.push(
      `${lonExpr} BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(lonMin, lonMax), Math.max(lonMin, lonMax));
  }

  // Helpers SQL paginado
  const baseSelectCols = `
    d.id,
    d.nome_municipio,
    d.nome_bairro,
    d.nome_logradouro,
    d.material,
    d.altura,
    d.tensao_mecanica,
    d.coordenadas,
    ${latExpr} AS lat,
    ${lonExpr} AS lon
  `;

  // Para shape=agg, primeiro limit/offset em d (base) e depois agrega empresas
  const sqlAgg = `
    WITH base AS (
      SELECT ${baseSelectCols}
      FROM dados_poste d
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    )
    SELECT
      b.id,
      b.nome_municipio,
      b.nome_bairro,
      b.nome_logradouro,
      b.material,
      b.altura,
      b.tensao_mecanica,
      b.coordenadas,
      b.lat,
      b.lon,
      COALESCE(
        ARRAY_AGG(ep.empresa) FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
        '{}'
      ) AS empresas,
      COALESCE(
        COUNT(*) FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
        0
      )::int AS qtd_empresas
    FROM base b
    LEFT JOIN empresa_poste ep ON b.id::text = ep.id_poste
    GROUP BY
      b.id, b.nome_municipio, b.nome_bairro, b.nome_logradouro,
      b.material, b.altura, b.tensao_mecanica, b.coordenadas, b.lat, b.lon
    ORDER BY b.id
  `;

  // shape=flat: já é “uma linha por empresa”; ainda assim paginamos em d e juntamos
  const sqlFlat = `
    WITH base AS (
      SELECT d.id
      FROM dados_poste d
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    )
    SELECT
      ${baseSelectCols.replaceAll("d.", "d.")},
      ep.empresa
    FROM dados_poste d
    INNER JOIN base ON base.id = d.id
    LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
    ORDER BY d.id
  `;

  // Monta SQL final + params
  const sql = shape === "agg" ? sqlAgg : sqlFlat;
  const runParams = params.concat([limit, offset]);

  try {
    const client = await pool.connect();
    try {
      // ======= NDJSON streaming =======
      if (format === "ndjson") {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");

        // Vamos iterando páginas e escrevendo para a resposta
        let off = offset;
        // Pequena proteção: no streaming, itera várias páginas até não haver mais (ou quebra antecipada)
        const PAGE = limit;
        while (true) {
          const p = params.concat([PAGE, off]);
          const { rows } = await client.query(sql, p);
          if (!rows.length) break;
          for (const r of rows) {
            // escreve 1 objeto por linha
            res.write(JSON.stringify(r) + "\n");
          }
          off += rows.length;
          if (rows.length < PAGE) break; // última página
          // cede o event loop
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 0));
        }
        res.end();
        return;
      }

      // ======= JSON paginado "leve" =======
      const { rows } = await client.query(sql, runParams);
      const next = rows.length < limit ? null : String(offset + rows.length);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      // Retorna objeto com rows + next em vez de um arrayzão solto
      return res.status(200).json({ rows, next });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Erro /api/postes:", err);
    // Não tente serializar objeto gigante aqui; mantenha mensagem concisa
    return res.status(500).json({ error: "Erro no servidor" });
  }
}

// Desativa o bodyParser por segurança/compatibilidade (não usamos body em GET)
export const config = { api: { bodyParser: false } };
