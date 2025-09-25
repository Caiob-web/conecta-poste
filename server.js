const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");
const pgSession = require("connect-pg-simple")(session);

const app = express();
const port = process.env.PORT || 3000;

app.set("trust proxy", 1);

// Body parsers (uploads grandes)
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

// CORS (permite cookies)
app.use(
  cors({
    origin: true,           // mesmo domínio do app
    credentials: true,      // habilita cookies
  })
);

// Sessão persistida no Postgres
const PG_URL =
  "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require";

app.use(
  session({
    store: new pgSession({
      conObject: {
        connectionString: PG_URL,
        ssl: { rejectUnauthorized: false },
      },
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: "uma-chave-secreta",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,         // em produção (HTTPS)
      sameSite: "lax",
    },
  })
);

// Conexão pool
const pool = new Pool({
  connectionString: PG_URL,
  ssl: { rejectUnauthorized: false },
});

// Garante a tabela users
async function ensureUsersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id            bigserial PRIMARY KEY,
        username      text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        is_active     boolean NOT NULL DEFAULT true,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (e) {
    console.error("Falha ao garantir tabela users:", e);
  }
}
ensureUsersTable();

/* =========================
   Handlers nomeados
========================= */
const registerHandler = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "username e password são obrigatórios" });
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
    if (err.code === "23505") {
      return res.status(409).json({ ok: false, error: "username já existe" });
    }
    res.sendStatus(500);
  }
};

const loginHandler = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Dados requeridos" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, password_hash, is_active FROM users WHERE username = $1",
      [username]
    );
    if (!rows.length || rows[0].is_active === false) {
      return res.status(401).json({ ok: false, error: "Credenciais" });
    }
    const { id, password_hash } = rows[0];
    const ok = await bcrypt.compare(password, password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "Credenciais" });

    req.session.user = { id, username };
    req.session.justLoggedIn = true;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro no login:", err);
    res.sendStatus(500);
  }
};

// Rotas de autenticação (POST)
app.post("/register", registerHandler);
app.post("/login", loginHandler);

// Aliases REST para o front: /api/auth/*
app.options("/api/auth/login", (_, res) => res.sendStatus(204));
app.options("/api/auth/register", (_, res) => res.sendStatus(204));
app.post("/api/auth/login", loginHandler);
app.post("/api/auth/register", registerHandler);

// Para GET direto nessas URLs, responde 405 (Method Not Allowed)
app.get(["/api/auth/login", "/api/auth/register"], (req, res) => {
  res.status(405).json({ ok: false, error: "Method Not Allowed" });
});

/* =========================
   Proteção de rotas
========================= */
app.use((req, res, next) => {
  const openPaths = [
    "/login",
    "/register",
    "/login.html",
    "/register.html",
    "/lgpd/",
    "/api/auth/login",
    "/api/auth/register",
  ];

  if (
    openPaths.some((p) => req.path.startsWith(p)) ||
    req.path.match(/\.(html|css|js|png|ico|avif)$/)
  ) {
    return next();
  }

  // Bloqueia "/" sem login
  if (!req.session.user && (req.path === "/" || req.path === "")) {
    return res.redirect("/login.html");
  }

  // Exigir senha a cada refresh do "/"
  if (req.session.user && (req.path === "/" || req.path === "")) {
    if (req.session.justLoggedIn) {
      req.session.justLoggedIn = false;
      return next();
    }
    return req.session.destroy(() => res.redirect("/login.html"));
  }

  // Protege /api/*
  if (req.path.startsWith("/api/")) {
    if (!req.session.user) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    return next();
  }

  if (!req.session.user) {
    return res.redirect("/login.html");
  }

  next();
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro ao destruir sessão:", err);
      return res.sendStatus(500);
    }
    res.clearCookie("connect.sid", { path: "/" });
    res.sendStatus(200);
  });
});

// Arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   Endpoints de dados
========================= */
let cachePostes = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

app.get("/api/postes", async (req, res) => {
  const now = Date.now();
  if (cachePostes && now - cacheTimestamp < CACHE_TTL) {
    return res.json(cachePostes);
  }
  const sql = `
    SELECT d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
           d.material, d.altura, d.tensao_mecanica, d.coordenadas,
           ep.empresa
    FROM dados_poste d
    LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
    WHERE d.coordenadas IS NOT NULL AND TRIM(d.coordenadas)<>''
  `;
  try {
    const { rows } = await pool.query(sql);
    cachePostes = rows;
    cacheTimestamp = now;
    res.json(rows);
  } catch (err) {
    console.error("Erro em /api/postes:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

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

app.post("/api/postes/report", async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }
  const clean = ids.map((x) => String(x).trim()).filter(Boolean);
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
    if (!rows.length) {
      return res.status(404).json({ error: "Nenhum poste encontrado" });
    }

    const mapPostes = {};
    rows.forEach((r) => {
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
      { header: "EMPRESAS", key: "empresas", width: 40 },
    ];

    Object.values(mapPostes).forEach((info) => {
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

app.listen(port, () =>
  console.log(`Servidor rodando na porta ${port}`)
);
