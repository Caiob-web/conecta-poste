// api/postes.js
import { Pool } from "pg";

/**
 * Pool global (evita múltiplas conexões em ambientes serverless).
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

// Helpers ----------------------------------------------------------------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const SAFE_BYTE_LIMIT = 3_500_000; // ~3.5MB para evitar RangeError do JSON.stringify

/**
 * Mede bytes do JSON e, se exceder o teto, corta o array até caber.
 */
function fitJsonWithinLimit(payload) {
  // Tenta rápido: se couber, retorna
  let bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes <= SAFE_BYTE_LIMIT) return payload;

  // Se excedeu e tiver items (array), corta até caber
  if (payload && Array.isArray(payload.items)) {
    // bisseção simples
    let lo = 0, hi = payload.items.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const test = { ...payload, items: payload.items.slice(0, mid) };
      const sz = Buffer.byteLength(JSON.stringify(test), "utf8");
      if (sz <= SAFE_BYTE_LIMIT) lo = mid + 1; else hi = mid;
    }
    const finalItems = payload.items.slice(0, Math.max(0, lo - 1));
    const nextCursor =
      finalItems.length > 0 ? finalItems[finalItems.length - 1].id : payload.nextCursor || null;
    const trimmed = { ...payload, items: finalItems, nextCursor };
    // Garantia final
    const finalBytes = Buffer.byteLength(JSON.stringify(trimmed), "utf8");
    if (finalBytes <= SAFE_BYTE_LIMIT) return trimmed;
    // Em último caso: manda vazio com o nextCursor original
    return { items: [], nextCursor: payload.nextCursor || null };
  }

  // Sem items array? Devolve estrutura mínima
  return { items: [], nextCursor: null };
}

// Handler ----------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const pool = getPool();

  // ---------------- Parâmetros ----------------
  const shape = String(req.query.shape || "flat").toLowerCase(); // "flat" | "agg"
  const bbox =
    typeof req.query.bbox === "string"
      ? req.query.bbox.split(",").map((n) => Number(n))
      : null;

  // Paginação
  const limitParam = parseInt(String(req.query.limit || "1000"), 10);
  const limit = clamp(isNaN(limitParam) ? 1000 : limitParam, 100, 5000); // 100..5000
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() !== "" ? req.query.cursor.trim() : null;

  // Segurança: se não veio bbox, ainda assim impõe teto de linhas por página (limit já cuida).
  // Se quiser forçar bbox, descomente:
  // if (!bbox) return res.status(400).json({ error: "bbox obrigatório: lonMin,latMin,lonMax,latMax" });

  // ---------------- WHERE base ----------------
  const where = ["d.coordenadas IS NOT NULL", "TRIM(d.coordenadas) <> ''"];
  const params = [];

  // Filtro por caixa (lonMin,latMin,lonMax,latMax)
  if (bbox && bbox.length === 4 && bbox.every((n) => Number.isFinite(n))) {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    where.push(
      `split_part(d.coordenadas, ',', 1)::float BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(latMin, latMax), Math.max(latMin, latMax));
    where.push(
      `split_part(d.coordenadas, ',', 2)::float BETWEEN $${params.length + 1} AND $${params.length + 2}`
    );
    params.push(Math.min(lonMin, lonMax), Math.max(lonMin, lonMax));
  }

  // Cursor por id (assumindo que d.id é comparável lexicograficamente via ::text; se for numérico, dá pra ::bigint)
  if (cursor) {
    where.push(`d.id::text > $${params.length + 1}`);
    params.push(cursor);
  }

  try {
    let rows;

    if (shape === "agg") {
      // ---- UMA linha por poste (empresas agregadas/distintas) ----
      const sql = `
        SELECT
          d.id::text AS id,
          d.nome_municipio,
          d.nome_bairro,
          d.nome_logradouro,
          -- Campos pesados opcionais: comente se não precisar
          d.material,
          d.altura,
          d.tensao_mecanica,
          d.coordenadas,
          split_part(d.coordenadas, ',', 1)::float AS lat,
          split_part(d.coordenadas, ',', 2)::float AS lon,
          COALESCE(
            ARRAY_AGG(DISTINCT ep.empresa)
              FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
            '{}'
          ) AS empresas,
          COALESCE(
            COUNT(DISTINCT ep.empresa)
              FILTER (WHERE ep.empresa IS NOT NULL AND UPPER(ep.empresa) <> 'DISPONÍVEL'),
            0
          )::int AS qtd_empresas
        FROM dados_poste d
        LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
        WHERE ${where.join(" AND ")}
        GROUP BY d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
                 d.material, d.altura, d.tensao_mecanica, d.coordenadas
        ORDER BY d.id
        LIMIT $${params.length + 1}
      `;
      ({ rows } = await pool.query(sql, [...params, limit]));
    } else {
      // ---- Formato "flat": várias linhas por poste (uma por empresa) ----
      // Enxuto: só colunas necessárias para o cliente. Evite SELECT *
      const sql = `
        SELECT
          d.id::text AS id,
          d.nome_municipio,
          d.nome_bairro,
          d.nome_logradouro,
          d.coordenadas,
          split_part(d.coordenadas, ',', 1)::float AS lat,
          split_part(d.coordenadas, ',', 2)::float AS lon,
          ep.empresa
        FROM dados_poste d
        LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
        WHERE ${where.join(" AND ")}
        ORDER BY d.id
        LIMIT $${params.length + 1}
      `;
      ({ rows } = await pool.query(sql, [...params, limit]));
    }

    // Próximo cursor
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    // Formato preferido do client novo:
    let payload = { items: rows, nextCursor };

    // Última proteção contra RangeError: caber no teto de bytes
    payload = fitJsonWithinLimit(payload);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).end(JSON.stringify(payload));
  } catch (err) {
    console.error("Erro /api/postes:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}

// Desativa o bodyParser por segurança/compatibilidade (não usamos body em GET)
export const config = { api: { bodyParser: false } };
