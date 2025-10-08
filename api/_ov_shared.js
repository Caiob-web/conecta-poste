import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

const splitSchemaTable = (rel) => {
  if (!rel) return { schema: "public", table: null };
  const p = String(rel).split(".");
  return p.length === 1 ? { schema: "public", table: p[0] } : { schema: p[0], table: p[1] };
};

async function hasRelation(name) {
  if (!name) return false;
  const { schema, table } = splitSchemaTable(name);
  const sql = `
    SELECT 1 FROM information_schema.tables
     WHERE lower(table_schema)=lower($1) AND lower(table_name)=lower($2)
    UNION ALL
    SELECT 1 FROM information_schema.views
     WHERE lower(table_schema)=lower($1) AND lower(table_name)=lower($2)
    LIMIT 1`;
  const r = await pool.query(sql, [schema || "public", table || name]);
  return r.rowCount > 0;
}
async function resolveFirstExisting(names = []) {
  for (const t of names) if (await hasRelation(t)) return t;
  return null;
}
const normalizeKey = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");

export const postesIntExpr = (col) =>
  `COALESCE(NULLIF(regexp_replace("${col}"::text, '[^0-9]', '', 'g'), ''), '0')::int`;

const TABLE_OV_CANDIDATES = [
  "indicadores.ocupacoes_postes_stage", // a sua tabela
  "public.indicadores",
  "indicadores",
  "ordens_venda",
  "ordem_de_venda",
  "ordem_venda",
  "ordem_de_venda_asc",
  "indicadores_ocupacao",
  "indicadores_v_ocupacao",
];

async function resolveOvTable() {
  const tbl = await resolveFirstExisting(TABLE_OV_CANDIDATES);
  if (!tbl) throw new Error("Tabela/view de OVs não encontrada.");
  const { schema, table } = splitSchemaTable(tbl);
  const meta = await pool.query(
    `select table_schema, table_name
       from information_schema.tables
      where lower(table_schema)=lower($1) and lower(table_name)=lower($2)
     union all
     select table_schema, table_name
       from information_schema.views
      where lower(table_schema)=lower($1) and lower(table_name)=lower($2)
      limit 1`,
    [schema, table]
  );
  const row = meta.rows?.[0];
  return { schema: row?.table_schema || schema || "public", table: row?.table_name || table };
}

export async function getOvColumns() {
  const { schema, table } = await resolveOvTable();
  const cols = await pool.query(
    `select column_name from information_schema.columns
     where lower(table_schema)=lower($1) and lower(table_name)=lower($2)`,
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

  const empresa   = pick(["empresas","empresa","cliente","cliente_empresa","cliente/empresa"]);
  const municipio = pick(["municipio","município"]);
  const status    = pick(["status_da_ocupacao","status","status da ocupacao","status da ocupação","status_ocupacao","status_da_ocupação"]);
  const postes    = pick(["postes","qt_postes","postes_totais","qtd_postes","quantidade_postes"]);
  const ov        = pick(["ordem_venda","ov","ordem","carta"]);
  const data      = pick(["data_envio_carta","data","data_envio","data envio carta","data da carta","created_at"]);

  if (!empresa || !municipio || !status || !postes || !ov) {
    throw new Error(`Mapeamento incompleto: empresa(${empresa}), municipio(${municipio}), status(${status}), postes(${postes}), ov(${ov}), data(${data}).`);
  }
  return { schema, table, empresa, municipio, status, postes, ov, data };
}
