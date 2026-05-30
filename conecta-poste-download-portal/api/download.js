import { readSession } from "./_auth.js";

const DEFAULT_DOWNLOAD_URL = "https://github.com/Caiob-web/conecta-poste/releases/latest/download/ConectaPoste-Setup.exe";

export default function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.writeHead(302, { Location: "/?session=expired" });
    return res.end();
  }

  const downloadUrl = process.env.DOWNLOAD_URL || DEFAULT_DOWNLOAD_URL;
  res.writeHead(302, {
    Location: downloadUrl,
    "Cache-Control": "no-store"
  });
  res.end();
}
