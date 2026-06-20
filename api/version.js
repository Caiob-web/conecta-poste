module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    version: "1.0.64",
    tag: "desktop-v1.0.64",
    name: "Conecta Poste Desktop 1.0.64",
    releaseUrl: "https://github.com/Caiob-web/conecta-poste/releases/tag/desktop-v1.0.64",
    downloadUrl: "https://github.com/Caiob-web/conecta-poste/releases/download/desktop-v1.0.64/ConectaPoste-Windows.zip",
    setupUrl: "https://github.com/Caiob-web/conecta-poste/releases/download/desktop-v1.0.64/ConectaPoste-Setup.exe",
    notes: [
      "Controle de versao da base NEON",
      "Sincronizacao delta por alteracoes",
      "Bloqueio contra download completo automatico quando ja existe SQLite local",
      "TRUNCATE no NEON zera a base SQLite local sem baixar registros"
    ]
  });
};
