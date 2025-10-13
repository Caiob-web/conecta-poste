const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();
const port = process.env.PORT || 3000;

// aumenta o limite para uploads grandes
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

// Habilita CORS
app.use(cors());

// Sessão em cookie (expira ao fechar navegador)
app.use(
  session({
    secret: "uma-chave-secreta",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false },
  })
);

// Conexão com o banco (Neon ep-broad-smoke)
const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const SAFE_BYTE_LIMIT = 3_500_000; // ~3.5MB

function fitJsonWithinLimit(payload) {
  // tenta do jeito atual
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (bytes <= SAFE_BYTE_LIMIT) return payload;
  } catch {
    // se falhar stringify, segue para cortes
  }

  if (payload && Array.isArray(payload.items)) {
    let lo = 0, hi = payload.items.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const test = { ...payload, items: payload.items.slice(0, mid) };
      try {
        const sz = Buffer.byteLength(JSON.stringify(test), "utf8");
        if (sz <= SAFE_BYTE_LIMIT) lo = mid + 1;
        else hi = mid;
      } catch {
        // se stringify falhar, reduz hi
        hi = mid;
      }
    }
    const finalItems = payload.items.slice(0, Math.max(0, lo - 1));
    const nextCursor =
      finalItems.length > 0 ? finalItems[finalItems.length - 1].id : payload.nextCursor || null;
    const trimmed = { ...payload, items: finalItems, nextCursor };
    try {
      const finalBytes = Buffer.byteLength(JSON.stringify(trimmed), "utf8");
      if (finalBytes <= SAFE_BYTE_LIMIT) return trimmed;
    } catch {}
    return { items: [], nextCursor: payload.nextCursor || null };
  }
  return { items: [], nextCursor: null };
}

// ---------------------------------------------------------------------
// Rotas de autenticação
// ---------------------------------------------------------------------
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username e password são obrigatórios" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    res.sendStatus(201);
  } catch (err) {
    console.error("Erro no registro:", err);
    if (err.code === "23505") return res.status(409).json({ error: "username já existe" });
    res.sendStatus(500);
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT id, password_hash FROM users WHERE username = $1",
      [username]
    );
    if (!rows.length) return res.sendStatus(401);
    const { id, password_hash } = rows[0];
    if (!(await bcrypt.compare(password, password_hash))) return res.sendStatus(401);
    req.session.user = { id, username };
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no login:", err);
    res.sendStatus(500);
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Erro ao destruir sessão:", err);
      return res.sendStatus(500);
    }
    res.clearCookie("connect.sid", { path: "/" });
    res.sendStatus(200);
  });
});

// Compat com seu front: POST /api/auth/logout (mesmo efeito do /logout)
app.post("/api/auth/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid", { path: "/" });
      res.sendStatus(200);
    });
  } else {
    res.sendStatus(200);
  }
});

// ---------------------------------------------------------------------
// Middleware de proteção de rotas
// ---------------------------------------------------------------------
app.use((req, res, next) => {
  const openPaths = [
    "/login",
    "/register",
    "/login.html",
    "/register.html",
    "/lgpd/",
    "/api/auth/logout" // liberar logout de compat
  ];
  if (
    openPaths.some(p => req.path.startsWith(p)) ||
    req.path.match(/\.(html|css|js|png|ico|avif|jpg|jpeg|svg|webp)$/)
  ) return next();

  if (req.path.startsWith("/api/")) {
    if (!req.session.user) return res.status(401).json({ error: "Não autorizado" });
    return next();
  }

  if (!req.session.user) return res.redirect("/login.html");
  next();
});

// ---------------------------------------------------------------------
// Serve arquivos estáticos (public)
// ---------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------
// GET /api/postes  (PAGINADO + BBOX + shape=flat|agg)
// Retorna: { items: [...], nextCursor }
// Query:
//   - limit (100..5000), default 1000
//   - cursor (id > cursor)
//   - bbox = lonMin,latMin,lonMax,latMax   [opcional mas recomendado]
//   - shape = flat | agg
// ---------------------------------------------------------------------
app.get("/api/postes", async (req, res) => {
  const shape = String(req.query.shape || "flat").toLowerCase(); // "flat" | "agg"
  const bbox = typeof req.query.bbox === "string"
    ? req.query.bbox.split(",").map(n => Number(n))
    : null;

  const limitParam = parseInt(String(req.query.limit || "1000"), 10);
  const limit = clamp(isNaN(limitParam) ? 1000 : limitParam, 100, 5000);
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() !== ""
    ? req.query.cursor.trim()
    : null;

  const where = ["d.coordenadas IS NOT NULL", "TRIM(d.coordenadas) <> ''"];
  const params = [];

  // BBOX: lonMin,latMin,lonMax,latMax  (coordenadas: "lat,lon")
  if (bbox && bbox.length === 4 && bbox.every(Number.isFinite)) {
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

  // Cursor por id (usa ::text; se id for numérico, pode trocar por ::bigint)
  if (cursor) {
    where.push(`d.id::text > $${params.length + 1}`);
    params.push(cursor);
  }

  try {
    let rows;
    if (shape === "agg") {
      // Uma linha por poste (empresas agregadas/distintas)
      const sql = `
        SELECT
          d.id::text AS id,
          d.nome_municipio,
          d.nome_bairro,
          d.nome_logradouro,
          -- info extra opcional (comente se pesar)
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
      // Formato flat: várias linhas por poste (uma por empresa) — enxuto
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

    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    let payload = { items: rows, nextCursor };
    payload = fitJsonWithinLimit(payload);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).end(JSON.stringify(payload));
  } catch (err) {
    console.error("Erro em /api/postes:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
});

// ---------------------------------------------------------------------
// GET /api/censo  (inalterado)
// ---------------------------------------------------------------------
app.get("/api/censo", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT poste, cidade, coordenadas
      FROM censo_municipio
      WHERE coordenadas IS NOT NULL AND TRIM(coordenadas)<>''
    `);
    res.json(rows);
  } catch (err) {
    console.error("Erro em /api/censo:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// ---------------------------------------------------------------------
// POST /api/postes/report  (inalterado, gera Excel)
// ---------------------------------------------------------------------
app.post("/api/postes/report", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }
  const clean = ids.map(x => String(x).trim()).filter(Boolean);
  if (!clean.length) return res.status(400).json({ error: "Nenhum ID válido" });

  const sql = `
    SELECT d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
           d.material, d.altura, d.tensao_mecanica, d.coordenadas,
           ep.empresa
    FROM dados_poste d
    LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
    WHERE d.coordenadas IS NOT NULL AND TRIM(d.coordenadas)<>''
      AND d.id::text = ANY($1)
  `;
  try {
    const { rows } = await pool.query(sql, [clean]);
    if (!rows.length) return res.status(404).json({ error: "Nenhum poste encontrado" });

    const mapPostes = {};
    rows.forEach(r => {
      if (!mapPostes[r.id]) mapPostes[r.id] = { ...r, empresas: new Set() };
      if (r.empresa) mapPostes[r.id].empresas.add(r.empresa);
    });

    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("Relatório de Postes");
    sh.columns = [
      { header: "ID POSTE", key: "id", width: 15 },
      { header: "MUNICÍPIO", key: "nome_municipio", width: 20 },
      { header: "BAIRRO", key: "nome_bairro", width: 25 },
      { header: "LOGRADOURO", key: "nome_logradouro", width: 30 },
      { header: "MATERIAL", key: "material", width: 15 },
      { header: "ALTURA", key: "altura", width: 10 },
      { header: "TENSÃO", key: "tensao_mecanica", width: 18 },
      { header: "COORDENADAS", key: "coordenadas", width: 30 },
      { header: "EMPRESAS", key: "empresas", width: 40 }
    ];

    Object.values(mapPostes).forEach(info => {
      sh.addRow({
        id: info.id,
        nome_municipio: info.nome_municipio,
        nome_bairro: info.nome_bairro,
        nome_logradouro: info.nome_logradouro,
        material: info.material,
        altura: info.altura,
        tensao_mecanica: info.tensao_mecanica,
        coordenadas: info.coordenadas,
        empresas: [...info.empresas].join(", "),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio_postes.xlsx"
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro report:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 404 genérico
app.use((req, res) => {
  res.status(404).send("Rota não encontrada");
});

// Inicia o servidor
app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
