import { type NextRequest, NextResponse } from "next/server";

/**
 * Proxy route for Vercel MCP OAuth callback.
 * Vercel's DCR restricts redirect URIs to simple paths, so we receive
 * the callback at /callback and forward it to Better Auth's handler.
 */
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const target = new URL("/api/auth/oauth2/callback/vercel-mcp", url.origin);
  target.search = url.search;
  return NextResponse.redirect(target);
}
