import crypto from "node:crypto";

const COOKIE_NAME = "cp_download_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  const isProduction = process.env.VERCEL || process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error("SESSION_SECRET ausente ou muito curto. Configure uma chave com pelo menos 32 caracteres.");
  }

  return "dev-local-session-secret-change-before-deploy";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join("; ");
}

function isHttpsRuntime() {
  return process.env.VERCEL || process.env.NODE_ENV === "production";
}

export function createSessionCookie(user) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = base64UrlEncode(JSON.stringify({
    sub: String(user.id),
    username: user.username,
    exp: expiresAt
  }));
  const token = `${payload}.${sign(payload)}`;

  return serializeCookie(COOKIE_NAME, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    secure: isHttpsRuntime(),
    sameSite: "Lax"
  });
}

export function clearSessionCookie() {
  return serializeCookie(COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: isHttpsRuntime(),
    sameSite: "Lax"
  });
}

export function readSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`));

  if (!cookie) return null;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!session.sub || !session.username) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireSession(req, res) {
  const session = readSession(req);
  if (session) return session;

  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Sessão expirada. Faça login novamente." }));
  return null;
}

export function safePasswordEquals(storedPassword, submittedPassword) {
  const left = crypto.createHash("sha256").update(String(storedPassword ?? ""), "utf8").digest();
  const right = crypto.createHash("sha256").update(String(submittedPassword ?? ""), "utf8").digest();
  return crypto.timingSafeEqual(left, right);
}
