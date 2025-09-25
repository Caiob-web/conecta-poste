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

// ---------------------------------------------------------------
// Banco (Neon) — use a mesma connectionString em pool e sessão
// ---------------------------------------------------------------
const PG_CONN =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_CIxXZ6mF9Oud@ep-broad-smoke-a8r82sdg-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: PG_CONN,
  ssl: { rejectUnauthorized: false },
});

// Cria tabela users se não existir (password em texto por decisão do cliente)
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id            bigserial PRIMARY KEY,
      username      text UNIQUE NOT NULL,
      password_hash text NOT NULL,  -- armazenando TEXTO PURO (nome da coluna ficou "hash" por legado)
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
    origin: true, // ajuste para seu domínio (ex.: https://seu-app.vercel.app)
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
// Autenticação (SEM hash — comparação direta de texto)
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

    // Comparação direta (decisão do cliente)
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

// Registra rotas nas duas formas (curta e /api/auth/*)
app.post(["/login", "/api/auth/login"], handleLogin);
app.post(["/register", "/api/auth/register"], handleRegister);
app.post(["/logout", "/api/auth/logout"], handleLogout);
app.get(["/me", "/api/auth/me"], handleMe);

// ---------------------------------------------------------------
// Proteção de rotas (exige sessão em tudo que não for público)
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

  // arquivos estáticos comuns
  const isStatic = /\.(html|css|js|png|ico|avif|webp|jpg|jpeg|svg|map|json|txt|csv|wasm)$/i.test(
    req.path
  );

  if (openPaths.some((p) => req.path.startsWith(p)) || isStatic) {
    return next();
  }

  // Se for a raiz "/" e não autenticado -> login
  if (!req.session.user && (req.path === "/" || req.path === "")) {
    return res.redirect("/login.html");
  }

  // Exigir senha a cada refresh da HOME "/" (comportamento desejado)
  if (req.session.user && (req.path === "/" || req.path === "")) {
    if (req.session.justLoggedIn) {
      req.session.justLoggedIn = false;
      return next();
    }
    return req.session.destroy(() => res.redirect("/login.html"));
  }

  // Protege APIs (exceto /api/auth/* já liberadas acima)
  if (req.path.startsWith("/api/")) {
    if (!req.session.user)
      return res.status(401).json({ error: "Não autorizado" });
    return next();
  }

  // Demais rotas de página
  if (!req.session.user) return res.redirect("/login.html");
  next();
});

// ---------------------------------------------------------------
// Static
// ---------------------------------------------------------------
const __dirnameResolved = path.resolve();
app.use(express.static(path.join(__dirnameResolved, "public")));

// ---------------------------------------------------------------
// APIs do app
// ---------------------------------------------------------------
let cachePostes = null;
let cacheTs = 0;
const CACHE_TTL = 10 * 60 * 1000;

/** GET /api/postes — dados base dos postes */
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

/** GET /api/censo — ids de censo */
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

/** POST /api/postes/report — Excel de IDs */
app.post("/api/postes/report", async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
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
    WHERE d.coordenadas IS NOT NULL AND TRIM(d.coordenadas) <> ''
      AND d.id::text = ANY($1)
  `;

  try {
    const { rows } = await pool.query(sql, [clean]);
    if (!rows.length)
      return res.status(404).json({ error: "Nenhum poste encontrado" });

    const mapPostes = {};
    rows.forEach((r) => {
      if (!mapPostes[r.id])
        mapPostes[r.id] = { ...r, empresas: new Set() };
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

    Object.values(mapPostes).forEach((p) => {
      sh.addRow({
        id: p.id,
        nome_municipio: p.nome_municipio,
        nome_bairro: p.nome_bairro,
        nome_logradouro: p.nome_logradouro,
        material: p.material,
        altura: p.altura,
        tensao_mecanica: p.tensao_mecanica,
        coordenadas: p.coordenadas,
        empresas: [...p.empresas].join(", "),
      });
    });

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
    console.error("Erro report:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ---------------------------------------------------------------
// Healthcheck & 404
// ---------------------------------------------------------------
app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use((req, res) => {
  res.status(404).send("Rota não encontrada");
});

// ---------------------------------------------------------------
// Start
// ---------------------------------------------------------------
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port} (${NODE_ENV})`);
});
