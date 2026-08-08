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

export async function registerMember(
  payload: RegisterMemberDTO,
): Promise<AuthSessionResponse["data"]> {
  const response = await postPublic("/auth/register", payload);
  if (!response.ok) throw await toApiError(response);

  return AuthSessionResponseSchema.parse(await response.json()).data;
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
