import { AuthErrorCode, RefreshResponseSchema } from "shared";

import { API_BASE_URL } from "@/lib/api/config";
import { readErrorCode } from "@/lib/api/api-error";

import { createSingleFlight } from "./single-flight";

/**
 * Access token só em memória — nada vai para `localStorage`/`sessionStorage`.
 * O que sobrevive ao reload é o cookie `HttpOnly` de refresh, que o front
 * nunca lê nem escreve.
 */
let accessToken: string | null = null;

/** Assinantes avisados quando a sessão termina por decisão do backend. */
const sessionEndListeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Limpa a credencial local sem avisar ninguém — usado no logout voluntário. */
export function clearAccessToken(): void {
  accessToken = null;
}

/** Nunca deve ser chamado por falha de rede: indisponibilidade momentânea não é fim de sessão. */
export function endSession(): void {
  accessToken = null;
  for (const listener of sessionEndListeners) listener();
}

export function onSessionEnd(listener: () => void): () => void {
  sessionEndListeners.add(listener);
  return () => {
    sessionEndListeners.delete(listener);
  };
}

export type RefreshOutcome =
  | { status: "renewed"; accessToken: string }
  | { status: "no-session" }
  | { status: "unavailable" };

async function requestRefresh(): Promise<RefreshOutcome> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 401) {
    accessToken = null;
    return { status: "no-session" };
  }

  if (!response.ok) return { status: "unavailable" };

  const body = await response.json().catch(() => null);
  const parsed = RefreshResponseSchema.safeParse(body);
  if (!parsed.success) return { status: "unavailable" };

  accessToken = parsed.data.data.accessToken;
  return { status: "renewed", accessToken: parsed.data.data.accessToken };
}

/** Single-flight: chamadas concorrentes compartilham a mesma promise, para o cookie rotacionado nunca ser reapresentado. */
export const refreshSession = createSingleFlight(requestRefresh);

function isSessionEndingCode(code: string | null): boolean {
  return (
    code === AuthErrorCode.INVALID_TOKEN ||
    code === AuthErrorCode.INVALID_REFRESH_TOKEN ||
    code === AuthErrorCode.MISSING_REFRESH_TOKEN
  );
}

function sendAuthorized(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: "include" });
}

/**
 * `fetch` autenticado: ao receber `401 TOKEN_EXPIRED`, renova e repete a
 * requisição uma única vez (evita laço infinito de renovação).
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await sendAuthorized(path, init);
  if (response.status !== 401) return response;

  const code = await readErrorCode(response);

  if (code !== AuthErrorCode.TOKEN_EXPIRED) {
    if (isSessionEndingCode(code)) endSession();
    return response;
  }

  const outcome = await refreshSession();

  if (outcome.status === "no-session") {
    endSession();
    return response;
  }

  if (outcome.status === "unavailable") return response;

  const retried = await sendAuthorized(path, init);
  if (retried.status === 401 && isSessionEndingCode(await readErrorCode(retried))) {
    endSession();
  }

  return retried;
}
