// api/ordens-venda.js
import { pool, q, postesIntExpr, getOvColumns } from "./_ov_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok:false, error:"Method not allowed" });
    return;
  }
  try {
    const { ov, empresa, municipio, status, limit = 100, page = 1 } = req.query;
    const c = await getOvColumns();
    const fqn = `${q(c.schema)}.${q(c.table)}`;

    const params = [];
    const where = [];
    if (ov)        { params.push(ov); where.push(`${q(c.ov)} = $${params.length}`); }
    if (empresa)   { params.push(`%${empresa}%`); where.push(`upper(${q(c.empresa)}) like upper($${params.length})`); }
    if (municipio) { params.push(`%${municipio}%`); where.push(`upper(${q(c.municipio)}) like upper($${params.length})`); }
    if (status)    { params.push(`%${status}%`); where.push(`upper(${q(c.status)}) like upper($${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const lim = Math.min(parseInt(limit) || 100, 1000);
    const off = (Math.max(parseInt(page) || 1, 1) - 1) * lim;

    const sql = `
      SELECT
        ${q(c.ov)}              as ordem_venda,
        ${q(c.empresa)}         as empresa,
        ${q(c.municipio)}       as municipio,
        ${q(c.status)}          as status,
        ${postesIntExpr(c.postes)} as postes,
        ${c.data ? q(c.data) + " as data_envio_carta" : "NULL::timestamp as data_envio_carta"}
      FROM ${fqn}
      ${whereSql}
      ORDER BY ${postesIntExpr(c.postes)} DESC NULLS LAST
      LIMIT ${lim} OFFSET ${off}
    `;
    const r = await pool.query(sql, params);
    res.status(200).json({ ok: true, rows: r.rows });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
}
