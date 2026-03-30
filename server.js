/**
 * server.js — API + Static server (Express) para o app "conecta-poste"
 *
 * ✅ Endpoints esperados pelo seu front-end:
 *   - GET  /api/postes
 *   - POST /api/postes/report     (gera XLSX/CSV por IDs)
 *   - GET  /api/transformadores
 *   - GET  /api/censo
 *   - POST /api/auth/login        (opcional)
 *   - POST /api/auth/logout
 *   - GET  /api/health
 *
 * 🔧 Variáveis de ambiente (recomendadas):
 *   - PORT
 *   - DATABASE_URL  (ou NEON_DATABASE_URL)
 *   - AUTH_REQUIRED=1 (opcional)
 *   - AUTH_TOKEN=...  (opcional, para login simples via token)
 *
 * 📦 Dependências:
 *   npm i express compression cookie-parser pg
 *   (opcional para relatório) npm i exceljs
 *   (fallback)               npm i xlsx
 */

require("dotenv").config();

const express = require("express");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const path = require("path");
const { Pool } = require("pg");

let ExcelJS = null;
let XLSX = null;
try { ExcelJS = require("exceljs"); } catch (_) {}
try { XLSX = require("xlsx"); } catch (_) {}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(compression());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());

// ------------------------ DB ------------------------
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  "";

const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PGPOOL_MAX || 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000,
});

// Helpers: query segura
async function dbQuery(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ------------------------ Auth (opcional) ------------------------
const AUTH_REQUIRED = String(process.env.AUTH_REQUIRED || "").trim() === "1";
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || "").trim();

function getTokenFromReq(req) {
  const cookieTok = req.cookies?.auth_token;
  const hdr = req.headers.authorization || "";
  const bearer = hdr.toLowerCase().startsWith("bearer ") ? hdr.slice(7) : "";
  return cookieTok || bearer || "";
}

function requireAuth(req, res, next) {
  if (!AUTH_REQUIRED && !AUTH_TOKEN) return next(); // sem auth configurado, libera.
  const tok = getTokenFromReq(req);
  if (tok && AUTH_TOKEN && tok === AUTH_TOKEN) return next();
  return res.status(401).json({ error: "Não autorizado" });
}

// ------------------------ Cache in-memory ------------------------
const cache = {
  postes: { ts: 0, data: null, etag: "" },
  transformadores: { ts: 0, data: null, etag: "" },
  censo: { ts: 0, data: null, etag: "" },
};
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);

function fresh(entry) {
  return entry.data && (Date.now() - entry.ts) < CACHE_TTL_MS;
}
function setCache(entry, data, tagPrefix) {
  entry.data = data;
  entry.ts = Date.now();
  entry.etag = `W/"${tagPrefix}-${entry.ts}"`;
}
function sendCachedJson(req, res, entry, computeFn) {
  const ifNone = req.headers["if-none-match"];
  if (fresh(entry) && ifNone && entry.etag && ifNone === entry.etag) {
    res.status(304).end();
    return true;
  }
  if (fresh(entry)) {
    res.setHeader("ETag", entry.etag);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json(entry.data);
    return true;
  }
  return false;
}

// ------------------------ Static ------------------------
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR, {
  maxAge: "2h",
  setHeaders: (res, filePath) => {
    // Evita cache agressivo em HTML
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
  }
}));

// ------------------------ Health ------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ------------------------ Auth endpoints (opcional) ------------------------
app.post("/api/auth/login", (req, res) => {
  // Login simples: envia { token: "..." } igual AUTH_TOKEN
  const token = String(req.body?.token || "").trim();
  if (!AUTH_TOKEN) return res.status(400).json({ error: "AUTH_TOKEN não configurado no servidor." });
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: "Token inválido." });

  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.COOKIE_SECURE || "").trim() === "1",
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 dias
    path: "/",
  });
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.cookie("auth_token", "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  res.json({ ok: true });
});

// ------------------------ API: Postes ------------------------
/**
 * Observação:
 * Seu front agrupa o resultado por p.id e junta empresa/id_insercao, então aqui retornamos "linhas"
 * (um poste pode aparecer repetido por empresa).
 *
 * Ajuste o SQL conforme seu schema (tabela/view).
 */
const POSTES_SQL_DEFAULT = `
  SELECT
    id,
    coordenadas,
    empresa,
    id_insercao,
    nome_municipio,
    nome_bairro,
    nome_logradouro
  FROM postes
`;

app.get("/api/postes", requireAuth, async (req, res) => {
  try {
    // Serve cache (se válido)
    if (sendCachedJson(req, res, cache.postes)) return;

    // Permite sobrescrever SQL via ENV (útil se você usa VIEW)
    const sql = String(process.env.POSTES_SQL || POSTES_SQL_DEFAULT);

    // (Opcional) Filtro por município: ?municipio=SÃO%20JOSÉ%20DOS%20CAMPOS
    const municipio = String(req.query.municipio || "").trim();
    let finalSql = sql;
    const params = [];
    if (municipio) {
      // tenta adicionar WHERE sem quebrar
      finalSql = `${sql}\n WHERE nome_municipio = $1`;
      params.push(municipio);
    }

    const r = await dbQuery(finalSql, params);
    const data = r.rows || [];

    setCache(cache.postes, data, "postes");
    res.setHeader("ETag", cache.postes.etag);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json(data);
  } catch (e) {
    console.error("GET /api/postes erro:", e);
    res.status(500).json({ error: "Falha ao carregar postes.", detail: String(e.message || e) });
  }
});

// ------------------------ API: Transformadores ------------------------
const TRANSFORMADORES_SQL_DEFAULT = `
  SELECT *
  FROM transformadores
`;

app.get("/api/transformadores", requireAuth, async (req, res) => {
  try {
    if (sendCachedJson(req, res, cache.transformadores)) return;

    const sql = String(process.env.TRANSFORMADORES_SQL || TRANSFORMADORES_SQL_DEFAULT);
    const r = await dbQuery(sql);
    const data = r.rows || [];

    setCache(cache.transformadores, data, "transformadores");
    res.setHeader("ETag", cache.transformadores.etag);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json(data);
  } catch (e) {
    console.error("GET /api/transformadores erro:", e);
    res.status(500).json({ error: "Falha ao carregar transformadores.", detail: String(e.message || e) });
  }
});

// ------------------------ API: Censo ------------------------
const CENSO_SQL_DEFAULT = `
  SELECT poste
  FROM censo
`;

app.get("/api/censo", requireAuth, async (req, res) => {
  try {
    if (sendCachedJson(req, res, cache.censo)) return;

    const sql = String(process.env.CENSO_SQL || CENSO_SQL_DEFAULT);
    const r = await dbQuery(sql);
    const data = r.rows || [];

    setCache(cache.censo, data, "censo");
    res.setHeader("ETag", cache.censo.etag);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.json(data);
  } catch (e) {
    console.error("GET /api/censo erro:", e);
    res.status(500).json({ error: "Falha ao carregar censo.", detail: String(e.message || e) });
  }
});

// ------------------------ API: Report (XLSX/CSV) ------------------------
/**
 * POST /api/postes/report
 * body: { ids: [123,456,...] }
 *
 * Retorna XLSX quando ExcelJS estiver disponível.
 * Caso contrário, retorna XLSX via SheetJS (xlsx) ou CSV como fallback.
 */
app.post("/api/postes/report", requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const clean = ids.map((v) => String(v).trim()).filter(Boolean);

    if (!clean.length) return res.status(400).json({ error: "Informe ids: [] no body." });

    // Busca as linhas do DB (mesma forma do /api/postes)
    const sqlBase = String(process.env.POSTES_SQL || POSTES_SQL_DEFAULT);
    const placeholders = clean.map((_, i) => `$${i + 1}`).join(",");
    const sql = `${sqlBase}\n WHERE id::text IN (${placeholders})`;

    const r = await dbQuery(sql, clean);
    const rows = r.rows || [];

    // Monta dataset "tabular"
    const flat = rows.map((p) => ({
      "ID POSTE": p.id ?? "",
      "Município": p.nome_municipio ?? "",
      "Bairro": p.nome_bairro ?? "",
      "Logradouro": p.nome_logradouro ?? "",
      "Empresa": p.empresa ?? "",
      "ID INSERÇÃO": p.id_insercao ?? "",
      "Coordenadas": p.coordenadas ?? "",
    }));

    // 1) ExcelJS
    if (ExcelJS) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Relatório");

      ws.columns = Object.keys(flat[0] || {}).map((k) => ({ header: k, key: k, width: Math.max(12, Math.min(40, k.length + 4)) }));
      ws.addRows(flat);

      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio_postes.xlsx"');

      await wb.xlsx.write(res);
      res.end();
      return;
    }

    // 2) SheetJS (xlsx)
    if (XLSX) {
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relatório");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="relatorio_postes.xlsx"');
      return res.send(buf);
    }

    // 3) CSV fallback
    const headers = Object.keys(flat[0] || {});
    const escape = (v) => {
      const s = String(v ?? "");
      if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    let csv = headers.join(";") + "\n";
    for (const row of flat) {
      csv += headers.map((h) => escape(row[h])).join(";") + "\n";
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="relatorio_postes.csv"');
    res.send(csv);
  } catch (e) {
    console.error("POST /api/postes/report erro:", e);
    res.status(500).json({ error: "Falha ao gerar relatório.", detail: String(e.message || e) });
  }
});

// ------------------------ SPA fallback ------------------------
app.get("*", (req, res) => {
  // Se existir index.html, entrega. (Evita 404 em refresh no Vercel/Render/Glitch)
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ------------------------ Start ------------------------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`✅ Server on :${PORT}`);
  if (!DATABASE_URL) console.warn("⚠️ DATABASE_URL não definido — APIs de banco vão falhar.");
});
