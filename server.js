// server.js — API de Postes + BI de Ordem de Venda (completo)
// -----------------------------------------------------------
// Execução: node server.js
// Requer:   DATABASE_URL no .env (Neon/Postgres)

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import pkg from "pg";
const { Pool } = pkg;

// ---------- Infra ----------
const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Static (ajuste se sua pasta pública tiver outro nome)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -------- Utils ----------
async function hasRelation(name) {
  const q = `select to_regclass($1) ok`;
  const r = await pool.query(q, [name]);
  return !!r.rows?.[0]?.ok;
}
async function resolveFirstExisting(names = []) {
  for (const t of names) {
    if (await hasRelation(t)) return t;
  }
  return null;
}

// ========================= ROTAS EXISTENTES ==========================
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

    const haveDados = await hasRelation("dados_poste");
    if (!haveDados) {
      return res.status(500).json({ error: "Nenhuma view/tabela de postes encontrada." });
    }

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

// POST /api/postes/report  -> Excel (ids[])
app.post("/api/postes/report", async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: "Envie { ids: [] }" });
    }

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
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Postes");
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

// POST /api/auth/logout
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.json({ ok: true });
});

// ====================== BI DE ORDEM DE VENDA =========================

// Tabelas/Views candidatas (inclui as do seu print)
const TABLE_OV_CANDIDATES = [
  "ocupacoes_postes_sumario",
  "ocupacoes_postes",
  "indicadores",
  "indicadores_ocupacao",
  "indicadores_v_ocupacao",
  "ordem_de_venda",
  "ordem_venda",
  "ordem_de_venda_asc"
];

async function resolveOvTable() {
  const tbl = await resolveFirstExisting(TABLE_OV_CANDIDATES);
  if (!tbl) throw new Error("Tabela/view de OVs não encontrada — ajuste TABLE_OV_CANDIDATES.");
  return tbl;
}

// SQL base normalizado (resolve nomes com acentos/espaços)
function baseOvSql(tbl) {
  return `
    SELECT
      COALESCE(empresa, "Empresa") AS empresa,
      COALESCE(municipio, "Município") AS municipio,
      COALESCE("STATUS DA OCUPAÇÃO", status_da_ocupacao, status, '') AS status,
      COALESCE("Postes", postes, 0)::int AS postes,
      COALESCE(ordem_venda, "Carta", "Parecer", '') AS ordem_venda,
      COALESCE("Data envio Carta", data_envio_carta, data) AS data_envio_carta,
      "Carta" AS carta
    FROM ${tbl}
  `;
}

// --------- ROTA RAW esperada pelo front: /api/ov (e aliases) ---------
async function handlerOVRaw(_req, res) {
  try {
    const tbl = await resolveOvTable();
    const sql = `
      WITH base AS (${baseOvSql(tbl)})
      SELECT
        empresa,
        municipio,
        ordem_venda AS ordem,
        status,
        postes,
        data_envio_carta AS data
      FROM base
    `;
    const r = await pool.query(sql);
    res.setHeader('Cache-Control', 'no-store');
    res.json(r.rows ?? []);
  } catch (e) {
    console.error("Erro /api/ov:", e);
    res.status(500).json({ error: "Falha ao consultar OV" });
  }
}
app.get("/api/ov", handlerOVRaw);
app.get("/api/ordens-venda", handlerOVRaw);
app.get("/api/ordensvenda", handlerOVRaw);

// ------------------------- KPIs + quebras ----------------------------
app.get("/api/ov/kpis", async (req, res) => {
  try {
    const { ov, empresa } = req.query;
    const tbl = await resolveOvTable();

    const params = [];
    const where = [];
    if (ov)       { params.push(ov); where.push(`ordem_venda = $${params.length}`); }
    if (empresa)  { params.push(`%${empresa}%`); where.push(`upper(empresa) like upper($${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const base = baseOvSql(tbl);

    const kpisSql = `
      WITH base AS (${base})
      SELECT
        (SELECT COALESCE(SUM(postes),0) FROM base ${whereSql}) AS total_postes,
        (SELECT COUNT(DISTINCT empresa)  FROM base ${whereSql}) AS total_empresas,
        (SELECT COUNT(DISTINCT municipio)FROM base ${whereSql}) AS total_municipios
    `;
    const statusSql = `
      WITH base AS (${base})
      SELECT status, SUM(postes)::int AS total
      FROM base
      ${whereSql}
      GROUP BY status
      ORDER BY total DESC
    `;
    const topEmpresasSql = `
      WITH base AS (${base})
      SELECT empresa, SUM(postes)::int AS total
      FROM base
      ${whereSql}
      GROUP BY empresa
      ORDER BY total DESC
      LIMIT 10
    `;
    const porMunicipioSql = `
      WITH base AS (${base})
      SELECT municipio, SUM(postes)::int AS total
      FROM base
      ${whereSql}
      GROUP BY municipio
      ORDER BY total DESC
      LIMIT 20
    `;

    const [kpis, status, empresas, municipios] = await Promise.all([
      pool.query(kpisSql, params),
      pool.query(statusSql, params),
      pool.query(topEmpresasSql, params),
      pool.query(porMunicipioSql, params),
    ]);

    res.json({
      ok: true,
      filters: { ov: ov || null, empresa: empresa || null },
      kpis: kpis.rows?.[0] || { total_postes: 0, total_empresas: 0, total_municipios: 0 },
      status: status.rows,
      topEmpresas: empresas.rows,
      porMunicipio: municipios.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --------------------------- Grid detalhado --------------------------
app.get("/api/ov/list", async (req, res) => {
  try {
    const tbl = await resolveOvTable();
    const { ov, empresa, municipio, status, limit = 100, page = 1 } = req.query;

    const params = [];
    const where = [];
    if (ov)        { params.push(ov); where.push(`ordem_venda = $${params.length}`); }
    if (empresa)   { params.push(`%${empresa}%`); where.push(`upper(empresa) like upper($${params.length})`); }
    if (municipio) { params.push(`%${municipio}%`); where.push(`upper(municipio) like upper($${params.length})`); }
    if (status)    { params.push(`%${status}%`); where.push(`upper(status) like upper($${params.length})`); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const lim = Math.min(parseInt(limit) || 100, 1000);
    const off = (Math.max(parseInt(page) || 1, 1) - 1) * lim;

    const sql = `
      WITH base AS (${baseOvSql(tbl)})
      SELECT
        ordem_venda,
        empresa,
        municipio,
        status,
        COALESCE(postes,0)::int AS postes,
        data_envio_carta,
        carta
      FROM base
      ${whereSql}
      ORDER BY COALESCE(postes,0) DESC
      LIMIT ${lim} OFFSET ${off}
    `;
    const r = await pool.query(sql, params);
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================ ROOT ===================================
app.get("/", (_req, res) => {
  res.send("API de Postes + BI de OV rodando 🚀");
});

// ============================ START ==================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`> Server on http://localhost:${PORT}`));
