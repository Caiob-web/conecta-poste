// server.js
// ====================================================================
// App Express + sessão em PostgreSQL + autenticação simples (sem hash)
// ====================================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");
const pgSession = require("connect-pg-simple")(session);

// ---------------------------------------------------------------
// Config base
// ---------------------------------------------------------------
const app = express();
const port = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

app.disable("x-powered-by"); // hardening simples

// ---------------------------------------------------------------
// Banco (Neon) — sem fallback: exige DATABASE_URL no ambiente
// ---------------------------------------------------------------
const PG_CONN = process.env.DATABASE_URL;
if (!PG_CONN) {
  console.error("Faltou DATABASE_URL no ambiente. Configure e rode de novo.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: PG_CONN,
  ssl: { rejectUnauthorized: false }, // Neon exige SSL
});

// Cria tabela users se não existir
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id            bigserial PRIMARY KEY,
      username      text UNIQUE NOT NULL,
      password_hash text NOT NULL,  -- senha em TEXTO PURO
      is_active     boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
}
ensureUsersTable().catch((e) =>
  console.error("Falha ao garantir tabela users:", e)
);

// ---------------------------------------------------------------
// App base
// ---------------------------------------------------------------
app.set("trust proxy", 1);

app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ limit: "1gb", extended: true }));

app.use(
  cors({
    origin: true, // ajuste para seu domínio ex.: https://conecta-poste.vercel.app
    credentials: true,
  })
);

// Sessão persistida no Postgres
app.use(
  session({
    store: new pgSession({
      conObject: {
        connectionString: PG_CONN,
        ssl: { rejectUnauthorized: false },
      },
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.COOKIE_SECRET || "uma-chave-secreta",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === "production", // exige HTTPS em produção
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
    name: "connect.sid",
  })
);

// ---------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------
async function getUserByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash AS password, is_active
     FROM public.users
     WHERE username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function handleLogin(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Dados obrigatórios" });
    }

    const user = await getUserByUsername(username);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    // Comparação direta (sem hash)
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    req.session.user = { id: user.id, username: user.username };
    req.session.justLoggedIn = true;
    return res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
}

async function handleRegister(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Dados obrigatórios" });
    }

    await pool.query(
      `INSERT INTO public.users (username, password_hash, is_active)
       VALUES ($1, $2, true)`,
      [username, password]
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Usuário já existe" });
    }
    console.error("Erro no register:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
}

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.clearCookie("connect.sid", { path: "/" });
    res.json({ ok: true });
  });
}

function handleMe(req, res) {
  if (!req.session.user) return res.status(401).json({ error: "Não autorizado" });
  res.json({ ok: true, user: req.session.user });
}

// Rotas auth
app.post(["/login", "/api/auth/login"], handleLogin);
app.post(["/register", "/api/auth/register"], handleRegister);
app.post(["/logout", "/api/auth/logout"], handleLogout);
app.get(["/me", "/api/auth/me"], handleMe);

// ---------------------------------------------------------------
// Proteção de rotas
// ---------------------------------------------------------------
app.use((req, res, next) => {
  const openPaths = [
    "/login",
    "/register",
    "/logout",
    "/login.html",
    "/register.html",
    "/lgpd/",
    "/healthz",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
    "/api/auth/me",
  ];

  const isStatic = /\.(html|css|js|png|ico|avif|webp|jpg|jpeg|svg|map|json|txt|csv|wasm)$/i.test(
    req.path
  );

  if (openPaths.some((p) => req.path.startsWith(p)) || isStatic) {
    return next();
  }

  if (!req.session.user && (req.path === "/" || req.path === "")) {
    return res.redirect("/login.html");
  }

  if (req.session.user && (req.path === "/" || req.path === "")) {
    if (req.session.justLoggedIn) {
      req.session.justLoggedIn = false;
      return next();
    }
    return req.session.destroy(() => res.redirect("/login.html"));
  }

  if (req.path.startsWith("/api/")) {
    if (!req.session.user)
      return res.status(401).json({ error: "Não autorizado" });
    return next();
  }

  if (!req.session.user) return res.redirect("/login.html");
  next();
});

// ---------------------------------------------------------------
// Static
// ---------------------------------------------------------------
const __dirnameResolved = path.resolve();
app.use(express.static(path.join(__dirnameResolved, "public")));

// ---------------------------------------------------------------
// APIs do app (postes)
// ---------------------------------------------------------------
let cachePostes = null;
let cacheTs = 0;
const CACHE_TTL = 10 * 60 * 1000;

app.get("/api/postes", async (req, res) => {
  const now = Date.now();
  if (cachePostes && now - cacheTs < CACHE_TTL) {
    return res.json(cachePostes);
    }
  const sql = `
    SELECT d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro,
           d.material, d.altura, d.tensao_mecanica, d.coordenadas,
           ep.empresa
    FROM dados_poste d
    LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
    WHERE d.coordenadas IS NOT NULL AND TRIM(d.coordenadas) <> ''
  `;
  try {
    const { rows } = await pool.query(sql);
    cachePostes = rows;
    cacheTs = now;
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
      WHERE coordenadas IS NOT NULL AND TRIM(coordenadas) <> ''
    `);
    res.json(rows);
  } catch (err) {
    console.error("Erro em /api/censo:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// ---------- NOVO: Relatório Excel por IDs (usado pelo front) ----------
app.post("/api/postes/report", async (req, res) => {
  try {
    const ids = (req.body?.ids || []).map(String).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: "Informe ids" });

    // Coleta dados e agrega empresas por poste
    const sql = `
      SELECT d.id,
             d.nome_municipio,
             d.nome_bairro,
             d.nome_logradouro,
             d.coordenadas,
             array_agg(ep.empresa ORDER BY ep.empresa)
               FILTER (WHERE ep.empresa IS NOT NULL) AS empresas
      FROM dados_poste d
      LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
      WHERE d.id::text = ANY($1)
      GROUP BY d.id, d.nome_municipio, d.nome_bairro, d.nome_logradouro, d.coordenadas
      ORDER BY d.id::text;
    `;
    const { rows } = await pool.query(sql, [ids]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Filtro");
    ws.columns = [
      { header: "ID POSTE", key: "id", width: 16 },
      { header: "Município", key: "municipio", width: 24 },
      { header: "Bairro", key: "bairro", width: 24 },
      { header: "Logradouro", key: "logradouro", width: 30 },
      { header: "Empresas", key: "empresas", width: 40 },
      { header: "Coordenadas", key: "coord", width: 24 },
    ];

    for (const r of rows) {
      ws.addRow({
        id: r.id,
        municipio: r.nome_municipio || "",
        bairro: r.nome_bairro || "",
        logradouro: r.nome_logradouro || "",
        empresas: (r.empresas || []).join(", "),
        coord: r.coordenadas || "",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="relatorio_postes.xlsx"'
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro em /api/postes/report:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// ---------------------------------------------------------------
// Healthcheck & 404
// ---------------------------------------------------------------
app.get("/healthz", (req, res) => res.json({ ok: true }));

if (NODE_ENV !== "production") {
  app.get("/api/auth/debug-db", async (req, res) => {
    try {
      const ping = await pool.query("SELECT 1 as ok");
      const count = await pool.query("SELECT count(*)::int AS users FROM public.users");
      res.json({ ok: true, ping: ping.rows[0].ok === 1, users: count.rows[0].users });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

app.use((req, res) => {
  res.status(404).send("Rota não encontrada");
});

// ---------------------------------------------------------------
// Start local / Export Vercel
// ---------------------------------------------------------------
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port} (${NODE_ENV})`);
  });
}

module.exports = app;
