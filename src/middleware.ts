import { NextResponse, type NextRequest } from "next/server";

// Barreira rápida: sem cookie de sessão nem chega a renderizar páginas internas.
// A validação real (sessão no banco, empresa, permissões) é feita no servidor em cada página/ação.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("ondaro_sid")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
