// middleware.js
export const config = {
  matcher: ["/", "/index.html"]
};

export default function middleware(req) {
  const url = new URL(req.url);
  const cookies = req.headers.get("cookie") || "";
  const hasSession = /(?:^|;\s*)connect\.sid=/.test(cookies);
  const once = /(?:^|;\s*)once=1(?:;|$)/.test(cookies);

  // sem sessão -> manda pro login e zera "once"
  if (!hasSession) {
    const headers = new Headers({ Location: "/login.html" });
    headers.append("Set-Cookie", "once=; Path=/; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  }

  // já marcou primeira carga -> refresh volta pro login e zera "once"
  if (once) {
    const headers = new Headers({ Location: "/login.html" });
    headers.append("Set-Cookie", "once=; Path=/; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  }

  // 1ª navegação após login -> marca "once=1" e segue
  const res = new Response(null, { status: 200 });
  res.headers.append("Set-Cookie", "once=1; Path=/; SameSite=Lax");
  return res;
}
