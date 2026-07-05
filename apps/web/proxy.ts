import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const hostname = req.headers.get("host") || "";
  const slug = hostname.split(".")[0] || "";
  const publicRoots = ["www", "localhost", "app", "127"];

  if (publicRoots.includes(slug)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
