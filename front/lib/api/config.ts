/**
 * Origem da API (Hono/Cloudflare Workers).
 *
 * Em produção o front está na Vercel e a API na Cloudflare — a origem é sempre
 * externa, e é por isso que toda chamada a `/auth/*` precisa de
 * `credentials: "include"` para o cookie de refresh viajar
 * (FEAT-0003-UI, seção 8.2).
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
