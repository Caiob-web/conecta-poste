module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }
  // limpa cookie “frontend”
  res.setHeader("Set-Cookie", "auth_token=; Max-Age=0; Path=/; SameSite=Lax; Secure");
  res.status(200).json({ ok: true });
};
