import {
  AuthSessionResponseSchema,
  ForgotPasswordResponseSchema,
  MeResponseSchema,
  RegisterPendingResponseSchema,
  SignupRequestDetailResponseSchema,
  SignupRequestListResponseSchema,
  type AuthSessionResponse,
  type ForgotPasswordDTO,
  type ForgotPasswordResponse,
  type LoginDTO,
  type MeResponse,
  type RegisterMemberDTO,
  type ResetPasswordDTO,
  type SelfDeclaredSignupDTO,
  type SignupDecisionDTO,
  type SignupRequestDetail,
  type SignupRequestStatus,
  type SignupRequestSummary,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { API_BASE_URL } from "@/lib/api/config";

import { authFetch } from "./session";

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

/**
 * `POST /auth/register` — trilha do membro Efetivo (FEAT-0008, emenda
 * 2026-09-04). Desde a emenda, só existe a resposta 201: um status
 * diferente de `active` na Supabase é recusado (403), não vira mais
 * pendência. Trainee/pós-júnior usam `createSignupRequest` abaixo.
 */
export async function registerMember(payload: RegisterMemberDTO): Promise<AuthSessionResponse["data"]> {
  const response = await postPublic("/auth/register", payload);
  if (!response.ok) throw await toApiError(response);

  return AuthSessionResponseSchema.parse(await response.json()).data;
}

/**
 * `POST /auth/signup-requests` — trilha auto-declarada de trainee/pós-júnior
 * (FEAT-0008, emenda 2026-09-04). Não abre sessão: a conta só nasce quando
 * um admin aprova (`decideSignupRequest`, mais abaixo). Pública, como o
 * cadastro de efetivo.
 */
export async function createSignupRequest(
  payload: SelfDeclaredSignupDTO,
): Promise<{ message: string }> {
  const response = await postPublic("/auth/signup-requests", payload);
  if (!response.ok) throw await toApiError(response);

  return RegisterPendingResponseSchema.parse(await response.json()).data;
}

export async function login(payload: LoginDTO): Promise<AuthSessionResponse["data"]> {
  const response = await postPublic("/auth/login", payload);
  if (!response.ok) throw await toApiError(response);

  return AuthSessionResponseSchema.parse(await response.json()).data;
}

export async function forgotPassword(
  payload: ForgotPasswordDTO,
): Promise<ForgotPasswordResponse["data"]> {
  const response = await postPublic("/auth/forgot-password", payload);
  if (!response.ok) throw await toApiError(response);

  return ForgotPasswordResponseSchema.parse(await response.json()).data;
}

export async function resetPassword(payload: ResetPasswordDTO): Promise<void> {
  const response = await postPublic("/auth/reset-password", payload);
  if (!response.ok) throw await toApiError(response);
}

export async function fetchCurrentUser(): Promise<MeResponse["data"]> {
  const response = await authFetch("/auth/me");
  if (!response.ok) throw await toApiError(response);

  return MeResponseSchema.parse(await response.json()).data;
}

/** Nunca lança: a limpeza do estado local não pode depender do sucesso da chamada. */
export async function logout(): Promise<void> {
  await postPublic("/auth/logout").catch(() => undefined);
}

// ------------------------------------------------------------
// Solicitações de cadastro (FEAT-0008)
// ------------------------------------------------------------

/**
 * Sem `authFetch`, de propósito: é o destino do link do email, aberto sem
 * sessão (FR-007/R2). A decisão em si (`decideSignupRequest`) já exige login.
 */
export async function getSignupRequestByToken(token: string): Promise<SignupRequestDetail> {
  const response = await fetch(
    `${API_BASE_URL}/auth/signup-requests/by-token/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw await toApiError(response);

  return SignupRequestDetailResponseSchema.parse(await response.json()).data;
}

export async function listSignupRequests(
  status: SignupRequestStatus = "pending",
): Promise<SignupRequestSummary[]> {
  const response = await authFetch(`/auth/signup-requests?status=${status}`);
  if (!response.ok) throw await toApiError(response);

  return SignupRequestListResponseSchema.parse(await response.json()).data;
}

export async function decideSignupRequest(id: string, decision: SignupDecisionDTO["decision"]): Promise<void> {
  const response = await authFetch(`/auth/signup-requests/${id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision } satisfies SignupDecisionDTO),
  });
  if (!response.ok) throw await toApiError(response);
}
