// middleware.js
import { NextResponse } from "next/server";

// Protege apenas a home ("/") e o "/index.html".
// Não intercepta /api nem arquivos estáticos.
export const config = {
  matcher: ["/", "/index.html"],
};

export default function middleware(req) {
  const cookies = req.headers.get("cookie") || "";
  const hasSession = /(?:^|;\s*)connect\.sid=/.test(cookies);

  // Sem sessão -> vai para a tela de login
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login.html", req.url));
  }

  // Com sessão -> segue o fluxo normal (deixa o index.html ser servido)
  return NextResponse.next();
}
