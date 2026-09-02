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
 * `POST /auth/register` bifurca por status do membro (FEAT-0008): `active`
 * responde 201 com sessão; `inactive`/`trainee` responde 202 sem conta —
 * checar o status ANTES de decidir qual schema faz o parse, ou um cadastro
 * pendente vira ZodError em vez de um resultado tratável.
 */
export type RegisterResult =
  | { kind: "session"; session: AuthSessionResponse["data"] }
  | { kind: "pending_approval"; message: string };

export async function registerMember(payload: RegisterMemberDTO): Promise<RegisterResult> {
  const response = await postPublic("/auth/register", payload);
  if (!response.ok) throw await toApiError(response);

  const json = await response.json();

  if (response.status === 202) {
    return { kind: "pending_approval", message: RegisterPendingResponseSchema.parse(json).data.message };
  }

  return { kind: "session", session: AuthSessionResponseSchema.parse(json).data };
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
