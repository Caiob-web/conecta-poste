// api/postes/report.js
import { Pool } from "pg";
import ExcelJS from "exceljs";

/**
 * Pool global para evitar criar várias conexões em ambientes serverless/dev.
 */
const getPool = () => {
  if (!globalThis._pgPool) {
    globalThis._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalThis._pgPool;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // --- validação de entrada ---
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const clean = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  if (!clean.length) {
    return res.status(400).json({ error: "IDs inválidos" });
  }
  // Limite de segurança para evitar carga exagerada
  const MAX_IDS = 600000;
  if (clean.length > MAX_IDS) {
    return res.status(413).json({ error: `Quantidade de IDs excede o limite (${MAX_IDS}).` });
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `
      SELECT
        d.id,
        d.nome_municipio,
        d.nome_bairro,
        d.nome_logradouro,
        d.material,
        d.altura,
        d.tensao_mecanica,
        d.coordenadas,
        NULLIF(TRIM(ep.empresa), '') AS empresa
      FROM dados_poste d
      LEFT JOIN empresa_poste ep ON d.id::text = ep.id_poste
      WHERE d.coordenadas IS NOT NULL
        AND TRIM(d.coordenadas) <> ''
        AND d.id::text = ANY($1)
      ORDER BY d.id
      `,
      [clean]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Nenhum poste encontrado" });
    }

    // --- agrega por poste, removendo empresas vazias/"DISPONÍVEL" ---
    const mapPostes = new Map();
    for (const r of rows) {
      if (!mapPostes.has(r.id)) {
        mapPostes.set(r.id, {
          id: r.id,
          nome_municipio: r.nome_municipio,
          nome_bairro: r.nome_bairro,
          nome_logradouro: r.nome_logradouro,
          material: r.material,
          altura: r.altura,
          tensao_mecanica: r.tensao_mecanica,
          coordenadas: r.coordenadas,
          empresas: new Set(),
        });
      }
      const empresa = r.empresa || "";
      if (empresa && empresa.toUpperCase() !== "DISPONÍVEL") {
        mapPostes.get(r.id).empresas.add(empresa);
      }
    }

    // --- monta Excel (mesmas colunas do seu arquivo atual) ---
    const wb = new ExcelJS.Workbook();
    wb.creator = "Mapa de Postes";
    wb.created = new Date();
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

    // Cabeçalho em negrito e congelado
    sh.getRow(1).font = { bold: true };
    sh.views = [{ state: "frozen", ySplit: 1 }];

    for (const info of mapPostes.values()) {
      sh.addRow({
        id: info.id,
        nome_municipio: info.nome_municipio,
        nome_bairro: info.nome_bairro,
        nome_logradouro: info.nome_logradouro,
        material: info.material,
        altura: info.altura,
        tensao_mecanica: info.tensao_mecanica,
        coordenadas: info.coordenadas,
        empresas: Array.from(info.empresas).join(", "),
      });
    }

    const filename = `relatorio_postes.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Cache-Control", "no-store");

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro report:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
}

// Aumenta limite de body se necessário (ids grandes) – ajuste conforme seu caso.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1GB",
    },
  },
};
