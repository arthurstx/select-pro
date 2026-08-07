import {
  AuthSessionResponseSchema,
  ForgotPasswordResponseSchema,
  MeResponseSchema,
  type AuthSessionResponse,
  type ForgotPasswordDTO,
  type ForgotPasswordResponse,
  type LoginDTO,
  type MeResponse,
  type RegisterMemberDTO,
  type ResetPasswordDTO,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { API_BASE_URL } from "@/lib/api/config";

import { authFetch } from "./session";

/**
 * Chamadas a `/auth/*` (FEAT-0003, seções 4 e 8).
 *
 * Todas usam `credentials: "include"` — as de sessão porque recebem ou enviam o
 * cookie `HttpOnly` de refresh, e as demais por uniformidade: uma rota que
 * esqueça o flag falha de um jeito difícil de diagnosticar (seção 8.2).
 *
 * Nenhuma resposta é tipada aqui: os schemas vêm de `shared` e são a fonte
 * única do contrato.
 */
async function postPublic(path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** `POST /auth/register` (201) — o cadastro já autentica (seção 4.1). */
export async function registerMember(
  payload: RegisterMemberDTO,
): Promise<AuthSessionResponse["data"]> {
  const response = await postPublic("/auth/register", payload);
  if (!response.ok) throw await toApiError(response);

  return AuthSessionResponseSchema.parse(await response.json()).data;
}

/** `POST /auth/login` (200). */
export async function login(payload: LoginDTO): Promise<AuthSessionResponse["data"]> {
  const response = await postPublic("/auth/login", payload);
  if (!response.ok) throw await toApiError(response);

  return AuthSessionResponseSchema.parse(await response.json()).data;
}

/**
 * `POST /auth/forgot-password` (202).
 *
 * A resposta é a mesma para email existente e inexistente — a tela exibe a
 * `message` que veio do backend, que é condicional de propósito (seção 4.3).
 */
export async function forgotPassword(
  payload: ForgotPasswordDTO,
): Promise<ForgotPasswordResponse["data"]> {
  const response = await postPublic("/auth/forgot-password", payload);
  if (!response.ok) throw await toApiError(response);

  return ForgotPasswordResponseSchema.parse(await response.json()).data;
}

/**
 * `POST /auth/reset-password` (204).
 *
 * Não cria sessão: o backend revoga todas as sessões do usuário, e o membro
 * entra de novo com a senha nova (seção 4.4).
 */
export async function resetPassword(payload: ResetPasswordDTO): Promise<void> {
  const response = await postPublic("/auth/reset-password", payload);
  if (!response.ok) throw await toApiError(response);
}

/** `GET /auth/me` (200) — rota protegida, passa pelo wrapper com renovação. */
export async function fetchCurrentUser(): Promise<MeResponse["data"]> {
  const response = await authFetch("/auth/me");
  if (!response.ok) throw await toApiError(response);

  return MeResponseSchema.parse(await response.json()).data;
}

/**
 * `POST /auth/logout` (204). Idempotente no backend e **nunca lança**: a
 * limpeza do estado local não pode depender do sucesso da chamada, senão uma
 * falha de rede prende o membro dentro da aplicação (seção 8.5).
 */
export async function logout(): Promise<void> {
  await postPublic("/auth/logout").catch(() => undefined);
}
