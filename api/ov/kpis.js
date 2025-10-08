import { pool, q, postesIntExpr, getOvColumns } from "../_ov_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    const { ov, empresa } = req.query;
    const c = await getOvColumns();
    const fqn = `${q(c.schema)}.${q(c.table)}`;

    const params = [];
    const where = [];
    if (ov)      { params.push(ov); where.push(`"${c.ov}" = $${params.length}`); }
    if (empresa) { params.push(`%${empresa}%`); where.push(`upper("${c.empresa}") like upper($${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseSql = `
      SELECT
        "${c.empresa}"           as empresa,
        "${c.municipio}"         as municipio,
        "${c.status}"            as status,
        (${postesIntExpr(c.postes)}) as postes
      FROM ${fqn}
      ${whereSql}
    `;

    const kpisSql = `
      WITH base AS (${baseSql})
      SELECT
        (SELECT COALESCE(SUM(postes),0) FROM base) AS total_postes,
        (SELECT COUNT(DISTINCT empresa)  FROM base) AS total_empresas,
        (SELECT COUNT(DISTINCT municipio)FROM base) AS total_municipios
    `;
    const statusSql = `
      WITH base AS (${baseSql})
      SELECT status, SUM(postes)::int AS total
      FROM base GROUP BY status ORDER BY total DESC
    `;
    const topEmpSql = `
      WITH base AS (${baseSql})
      SELECT empresa, SUM(postes)::int AS total
      FROM base GROUP BY empresa ORDER BY total DESC LIMIT 10
    `;
    const porMunSql = `
      WITH base AS (${baseSql})
      SELECT municipio, SUM(postes)::int AS total
      FROM base GROUP BY municipio ORDER BY total DESC LIMIT 20
    `;

    const [kpis, statusRows, empRows, munRows] = await Promise.all([
      pool.query(kpisSql, params),
      pool.query(statusSql, params),
      pool.query(topEmpSql, params),
      pool.query(porMunSql, params),
    ]);

    res.status(200).json({
      ok: true,
      kpis: kpis.rows?.[0] || { total_postes: 0, total_empresas: 0, total_municipios: 0 },
      status: statusRows.rows,
      topEmpresas: empRows.rows,
      porMunicipio: munRows.rows,
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
}
