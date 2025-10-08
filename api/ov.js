// /api/ov.js
import { neon } from '@neondatabase/serverless';

const TABLE = 'ocupacoes_postes_sumario'; // nome exato da tabela no Neon

export default async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'DATABASE_URL não configurada' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Campos conforme o print do Neon (com aspas por causa de acentos/espaços)
    const rows = await sql/* sql */`
      SELECT
        "Empresa" AS empresa,
        "Município" AS municipio,
        COALESCE(NULLIF("Parecer", ''), NULLIF("Carta", '')) AS ordem,
        COALESCE("STATUS DA OCUPAÇÃO", '') AS status,
        COALESCE(NULLIF("Postes", ''), '0')::int AS postes,
        "Data envio Carta" AS data
      FROM ${sql(TABLE)}
    `;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(rows ?? []);
  } catch (e) {
    console.error('Erro /api/ov:', e);
    res.status(500).json({ error: 'Falha ao consultar OV' });
  }
}
