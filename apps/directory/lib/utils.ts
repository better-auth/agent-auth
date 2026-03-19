import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const ADMIN_KEY = process.env.DIRECTORY_ADMIN_KEY;

export function requireAdmin(request: Request): Response | null {
  if (!ADMIN_KEY) {
    return Response.json({ error: "Admin operations are not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (key !== ADMIN_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
