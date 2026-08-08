/** Origem da API (Hono/Cloudflare Workers) — sempre externa, daí `credentials: "include"` em `/auth/*`. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
