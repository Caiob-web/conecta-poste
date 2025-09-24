// api/gateway.js
const fs = require("fs");
const path = require("path");

function parseCookies(req) {
  const h = req.headers.cookie || "";
  const out = {};
  h.split(/;\s*/).filter(Boolean).forEach(p => {
    const i = p.indexOf("=");
    if (i > -1) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.Path) parts.push(`Path=${opts.Path}`);
  if (opts.HttpOnly) parts.push("HttpOnly");
  if (opts.SameSite) parts.push(`SameSite=${opts.SameSite}`);
  if (opts.Secure) parts.push("Secure");
  if (opts.MaxAge !== undefined) parts.push(`Max-Age=${opts.MaxAge}`);
  res.setHeader("Set-Cookie", [...(res.getHeader("Set-Cookie") || []), parts.join("; ")]);
}

module.exports = (req, res) => {
  // Só trata o "/" e "/index.html"
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  const cookies = parseCookies(req);
  const hasSession = !!cookies["connect.sid"];
  const once = cookies["once"] === "1";

  // Se não tem sessão -> manda pro login
  if (!hasSession) {
    res.statusCode = 302;
    res.setHeader("Location", "/login.html");
    return res.end();
  }

  // Se já carregou uma vez (refresh) -> apaga sessão e volta pro login
  if (once) {
    // limpa cookies
    setCookie(res, "connect.sid", "", { Path: "/", SameSite: "Lax", MaxAge: 0 });
    setCookie(res, "once", "", { Path: "/", SameSite: "Lax", MaxAge: 0 });
    res.statusCode = 302;
    res.setHeader("Location", "/login.html");
    return res.end();
  }

  // Primeira navegação após login -> libera e marca "once=1"
  setCookie(res, "once", "1", { Path: "/", SameSite: "Lax" });

  // Serve o index.html da pasta public
  const file = path.join(process.cwd(), "public", "index.html");
  try {
    const html = fs.readFileSync(file);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = 200;
    return res.end(html);
  } catch (e) {
    res.statusCode = 500;
    return res.end("Falha ao ler index.html");
  }
};
