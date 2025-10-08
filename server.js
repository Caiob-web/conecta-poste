/**
 * server.js — API de Postes + BI de Ordens de Venda (tabela "indicadores")
 * Execução: node server.js
 * ENV obrigatória: DATABASE_URL (Postgres/Neon)
 * ENV opcional:    APP_USERS="admin:admin,oper:123" (login simples)
 */

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const XLSX = require("xlsx");
const { Pool } = require("pg");

/* ============================= Infra ================================== */
const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true })); // aceita form-encoded (login)
app.use(cookieParser());

// Static (pasta "public")
const __dirnameResolved = __dirname; // CommonJS já expõe __dirname
app.use(express.static(path.join(__dirnameResolved, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ============================ Utils =================================== */
async function hasRelation(name) {
  const r = await pool.query(`select to_regclass($1) ok`, [name]);
  return !!r.rows?.[0]?.ok;
}
async function resolveFirstExisting(names = []) {
  for (const t of names) if (await hasRelation(t)) return t;
  return null;
}
function q(id) {
  return `"${String(id).replace(/"/g, '""')}"`; // quote identifier
}
function splitSchemaTable(rel) {
  if (!rel) return { schema: "public", table: null };
  const parts = String(rel).split(".");
  if (parts.length === 1) return { schema: "public", table: parts[0] };
  return { schema: parts[0], table: parts[1] };
}
function normalizeKey(s) {
  return String(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* ========================= AUTH (login simples) ======================== */
// Usuários via env APP_USERS="admin:admin,gerente:123"
const USERS = (process.env.APP_USERS || "admin:admin")
  .split(",")
  .map(s => {
    const [u, p] = s.split(":");
    return { u: (u || "").trim(), p: (p || "").trim() };
  });

app.post("/api/auth/login", (req, res) => {
  const u = (req.body.usuario || req.body.username || req.body.user || "").toString();
  const p = (req.body.senha   || req.body.password || "").toString();

  const ok = USERS.some(({ u:U, p:P }) => U === u && P === p);
  if (!ok) return res.status(401).json({ ok:false, error:"Credenciais inválidas" });

  // cookie “simples” + devolve user p/ front salvar no localStorage
  res.cookie("auth_token", Buffer.from(`${u}:ok`).toString("base64"), {
    httpOnly: false, sameSite: "lax", path: "/"
  });
  res.json({ ok: true, user: { username: u } });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.json({ ok: true });
});

/* ============================== POSTES ================================ */
// GET /api/postes
app.get("/api/postes", async (req, res) => {
  try {
    const { north, south, east, west, limit } = req.query;
    const max = Math.min(parseInt(limit) || 50000, 100000);

    const preferredView = await resolveFirstExisting([
      "indicadores_v_ocupacao",
      "dados_poste_view",
    ]);

    if (preferredView) {
      const params = [];
      let where = "";
      if ([north, south, east, west].every((v) => v !== undefined)) {
        params.push(south, north, west, east);
        where = `WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4`;
      }
      const sql = `
        SELECT
          id,
          COALESCE(nome_municipio,'') as nome_municipio,
          COALESCE(nome_bairro,'')    as nome_bairro,
          COALESCE(nome_logradouro,'')as nome_logradouro,
          COALESCE(empresa,'')        as empresa,
          latitude, longitude,
          (latitude::text || ',' || longitude::text) as coordenadas
        FROM ${preferredView}
        ${where}
        LIMIT ${max}
      `;
      const r = await pool.query(sql, params);
      return res.json(r.rows);
    }

    if (!(await hasRelation("dados_poste")))
      return res.status(500).json({ error: "Nenhuma view/tabela de postes encontrada." });

    const params = [];
    let where = "";
    if ([north, south, east, west].every((v) => v !== undefined)) {
      params.push(south, north, west, east);
      where = `WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4`;
    }

    const sql = `
      SELECT
        id,
        COALESCE(municipio, nome_municipio, '') as nome_municipio,
        COALESCE(bairro,    nome_bairro,    '') as nome_bairro,
        COALESCE(logradouro,nome_logradouro,'') as nome_logradouro,
        COALESCE(empresa,'')                    as empresa,
        latitude, longitude,
        (latitude::text || ',' || longitude::text) as coordenadas
      FROM dados_poste
      ${where}
      LIMIT ${max}
    `;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/postes/report -> Excel (ids[])
app.post("/api/postes/report", async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ error: "Envie { ids: [] }" });

    const table = (await hasRelation("indicadores_v_ocupacao"))
      ? "indicadores_v_ocupacao"
      : "dados_poste";

    const sql = `
      SELECT
        id,
        COALESCE(municipio, nome_municipio, '') as nome_municipio,
        COALESCE(bairro,    nome_bairro,    '') as nome_bairro,
        COALESCE(logradouro,nome_logradouro,'') as nome_logradouro,
        COALESCE(empresa,'') as empresa,
        (latitude::text || ',' || longitude::text) as coordenadas
      FROM ${table}
      WHERE id = ANY($1::text[])
    `;
    const r = await pool.query(sql, [ids.map(String)]);
    const rows = r.rows.map(x => ({
      "ID POSTE": x.id,
      Município: x.nome_municipio,
      Bairro: x.nome_bairro,
      Logradouro: x.nome_logradouro,
      Empresas: x.empresa,
      Coordenadas: x.coordenadas,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Postes");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio_postes.xlsx"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/censo (stub)
app.get("/api/censo", async (_req, res) => {
  try {
    if (await hasRelation("censo_municipio")) {
      const r = await pool.query(`SELECT DISTINCT id as poste FROM censo_municipio LIMIT 100000`);
      return res.json(r.rows);
    }
    return res.json([]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* ===================== ORDENS DE VENDA / INDICADORES =================== */
const TABLE_OV_CANDIDATES = [
  "indicadores",
  "public.indicadores",
  "ordem_de_venda",
  "ordem_venda",
  "ordem_de_venda_asc",
  "indicadores_ocupacao",
  "indicadores_v_ocupacao",
];

async function resolveOvTable() {
  const tbl = await resolveFirstExisting(TABLE_OV_CANDIDATES);
  if (!tbl) throw new Error("Tabela/view de OVs não encontrada. Ajuste TABLE_OV_CANDIDATES.");

  const { schema, table } = splitSchemaTable(tbl);
  const meta = await pool.query(
    `select table_schema, table_name
     from information_schema.tables
     where (table_schema = $1 and table_name = $2)
        or (table_schema = 'public' and table_name = $3)
     limit 1`,
    [schema, table, tbl]
  );
  const row = meta.rows?.[0];
  return { schema: row?.table_schema || schema || "public", table: row?.table_name || table };
}

async function getOvColumns() {
  const { schema, table } = await resolveOvTable();

  const cols = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2`,
    [schema, table]
  );

  const byNorm = new Map();
  cols.rows.forEach(r => byNorm.set(normalizeKey(r.column_name), r.column_name));

  function pick(cands) {
    for (const c of cands) {
      const k = normalizeKey(c);
      if (byNorm.has(k)) return byNorm.get(k);
      const k2 = normalizeKey(c.replace(/ /g, "_"));
      if (byNorm.has(k2)) return byNorm.get(k2);
    }
    return null;
  }

  const empresa   = pick(["empresa","cliente","cliente_empresa","cliente/empresa"]);
  const municipio = pick(["municipio","município"]);
  const status    = pick(["status_da_ocupacao","status","status da ocupacao","status da ocupação","status_ocupacao","status_da_ocupação"]);
  const postes    = pick(["postes","qt_postes","postes_totais","qtd_postes"]);
  const ov        = pick(["ordem_venda","ov","ordem","carta"]);
  const data      = pick(["data_envio_carta","data","data_envio","data envio carta","data da carta"]);

  if (!empresa || !municipio || !status || !postes || !ov) {
    throw new Error(
      `Não localizei todas as colunas: empresa(${empresa}), municipio(${municipio}), status(${status}), postes(${postes}), ov(${ov}), data(${data}).`
    );
  }

  return { schema, table, empresa, municipio, status, postes, ov, data };
}

// GET /api/ov (dump p/ compatibilidade)
app.get("/api/ov", async (_req, res) => {
  try {
    const c = await getOvColumns();
    const fqn = `${q(c.schema)}.${q(c.table)}`;
    const sql = `
      SELECT
        ${q(c.empresa)}   as empresa,
        ${q(c.municipio)} as municipio,
        ${q(c.status)}    as status,
        ${q(c.postes)}::int as postes,
        ${q(c.ov)}        as ordem_venda,
        ${c.data ? q(c.data) + " as data_envio_carta" : "NULL::timestamp as data_envio_carta"}
      FROM ${fqn}
      LIMIT 200000
    `;
    const r = await pool.query(sql);
    res.json(r.rows);
  } catch (e) {
    console.error("OV /api/ov error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ov/list  (filtros)
app.get("/api/ov/list", async (req, res) => {
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
        ${q(c.ov)}          as ordem_venda,
        ${q(c.empresa)}     as empresa,
        ${q(c.municipio)}   as municipio,
        ${q(c.status)}      as status,
        ${q(c.postes)}::int as postes,
        ${c.data ? q(c.data) + " as data_envio_carta" : "NULL::timestamp as data_envio_carta"}
      FROM ${fqn}
      ${whereSql}
      ORDER BY ${q(c.postes)}::int DESC NULLS LAST
      LIMIT ${lim} OFFSET ${off}
    `;
    const r = await pool.query(sql, params);
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error("OV /api/ov/list error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/ov/kpis (agregados)
app.get("/api/ov/kpis", async (req, res) => {
  try {
    const { ov, empresa } = req.query;
    const c = await getOvColumns();
    const fqn = `${q(c.schema)}.${q(c.table)}`;

    const params = [];
    const where = [];
    if (ov)       { params.push(ov); where.push(`${q(c.ov)} = $${params.length}`); }
    if (empresa)  { params.push(`%${empresa}%`); where.push(`upper(${q(c.empresa)}) like upper($${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseSql = `
      SELECT
        ${q(c.empresa)}   as empresa,
        ${q(c.municipio)} as municipio,
        ${q(c.status)}    as status,
        (${q(c.postes)}::int) as postes
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

    res.json({
      ok: true,
      kpis: kpis.rows?.[0] || { total_postes: 0, total_empresas: 0, total_municipios: 0 },
      status: statusRows.rows,
      topEmpresas: empRows.rows,
      porMunicipio: munRows.rows,
    });
  } catch (e) {
    console.error("OV /api/ov/kpis error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ============================= ROOT =================================== */
app.get("/", (_req, res) => {
  res.send("API de Postes + BI de OV rodando 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`> Server on http://localhost:${PORT}`));
