const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");
const pgSession = require("connect-pg-simple")(session); // ADIÇÃO

const app = express();
const port = process.env.PORT || 3000;

app.set("trust proxy", 1); // ADIÇÃO

// aumenta o limite para uploads grandes
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

// Habilita CORS
app.use(cors());

// Sessão em cookie (expira ao fechar navegador)
app.use(
  session({
    store: new pgSession({
      // usa o mesmo connectionString do pool (abaixo), sem mudar a ordem do arquivo
      conObject: {
        connectionString:
          "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require",
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
      secure: true,    // produção HTTPS
      sameSite: "lax",
    },
  })
);

// Conexão com o banco (Neon ep-broad-smoke)
const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

// === Criação automática da tabela users (se não existir) + VIEW auth_users ===
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

      -- View de compatibilidade esperada por /api/auth/login.js
      CREATE OR REPLACE VIEW public.auth_users AS
      SELECT id, username, password_hash, is_active
      FROM public.users;

      -- Índice para acelerar a busca por username
      CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);
    `);
  } catch (e) {
    console.error("Falha ao garantir tabela/view de usuários:", e);
  }
}
ensureUsersTable();

// Rotas de autenticação
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

// Alias para o front que usa /api/auth/register
app.post("/api/auth/register", (req, res) => {
  app._router.handle(req, res); // delega para a rota /register acima
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
    req.session.justLoggedIn = true; // ADIÇÃO: permite somente o primeiro carregamento do "/"
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no login:", err);
    res.sendStatus(500);
  }
});

// Alias para o front que usa /api/auth/login
app.post("/api/auth/login", (req, res) => {
  app._router.handle(req, res); // delega para a rota /login acima
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

// Middleware de proteção de rotas
app.use((req, res, next) => {
  const openPaths = [
    "/login", "/register",
    "/login.html", "/register.html",
    "/lgpd/",
    "/api/auth/login", "/api/auth/register"
  ];

  if (
    openPaths.some(p => req.path.startsWith(p)) ||
    req.path.match(/\.(html|css|js|png|ico|avif)$/)
  ) return next();

  // BLOQUEIA acesso ao "/" quando não autenticado (Opção A)
  if (!req.session.user && (req.path === "/" || req.path === "")) {
    return res.redirect("/login.html");
  }

  // EXIGIR SENHA A CADA REFRESH DO "/"
  if (req.session.user && (req.path === "/" || req.path === "")) {
    if (req.session.justLoggedIn) {
      // permite este primeiro carregamento do app
      req.session.justLoggedIn = false;
      return next();
    }
    // se tentar acessar/atualizar novamente "/", força novo login
    return req.session.destroy(() => res.redirect("/login.html"));
  }

  if (req.path.startsWith("/api/")) {
    // /api/auth/* já passou pelo openPaths acima
    if (!req.session.user) return res.status(401).json({ error: "Não autorizado" });
    return next();
  }

  if (!req.session.user) return res.redirect("/login.html");
  next();
});

// Serve arquivos estáticos (public)
app.use(express.static(path.join(__dirname, "public")));

// Cache para /api/postes
let cachePostes = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

// GET /api/postes
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

// GET /api/censo
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

// POST /api/postes/report
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
