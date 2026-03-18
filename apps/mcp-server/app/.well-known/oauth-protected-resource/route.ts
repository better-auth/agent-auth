const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3400";

export const dynamic = "force-dynamic";

// RFC 9728 — OAuth Protected Resource Metadata
export const GET = async () => {
  return new Response(
    JSON.stringify({
      resource: BASE_URL,
      authorization_servers: [BASE_URL],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
      },
    },
  );
};
