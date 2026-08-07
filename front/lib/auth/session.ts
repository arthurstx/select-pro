import { AuthErrorCode, RefreshResponseSchema } from "shared";

import { API_BASE_URL } from "@/lib/api/config";
import { readErrorCode } from "@/lib/api/api-error";

import { createSingleFlight } from "./single-flight";

/**
 * Sessão do navegador (FEAT-0003-UI, seção 8).
 *
 * O access token vive **só em memória** e morre a cada reload — nada aqui vai
 * para `localStorage` ou `sessionStorage`. O que sobrevive ao reload é o cookie
 * `HttpOnly` de refresh, que o front nunca lê nem escreve: quem o anexa às
 * requisições é o navegador, desde que o `fetch` use `credentials: "include"`.
 *
 * A variável de módulo só é escrita a partir do navegador (handlers e efeitos
 * de Client Components). Durante o SSR ela permanece `null`, então não há risco
 * de um token vazar de uma requisição para outra no servidor.
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

/** Limpa a credencial local **sem** avisar ninguém — usado no logout voluntário. */
export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Encerra a sessão por iniciativa do backend (token inválido, refresh revogado).
 * Nunca deve ser chamado por falha de rede: indisponibilidade momentânea não é
 * fim de sessão (seção 7.5).
 */
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

/**
 * Resultado de uma tentativa de renovação. As três situações precisam ser
 * distinguíveis porque levam a decisões opostas:
 *
 * - `renewed`   → segue em frente com o token novo;
 * - `no-session` → o backend disse que não há sessão: encerra;
 * - `unavailable` → não deu para saber (rede/5xx): **não** encerra nada.
 */
export type RefreshOutcome =
  | { status: "renewed"; accessToken: string }
  | { status: "no-session" }
  | { status: "unavailable" };

async function requestRefresh(): Promise<RefreshOutcome> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      // Sem isto o cookie cross-site não é enviado e o refresh responde 401
      // mesmo com sessão válida (seção 8.2).
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

/**
 * Renova a sessão. **Single-flight**: chamadas concorrentes compartilham a
 * mesma promise, de modo que o cookie rotacionado nunca é reapresentado
 * (seção 8.3 — ver `single-flight.ts` para o porquê).
 */
export const refreshSession = createSingleFlight(requestRefresh);

/** Códigos em que o backend está dizendo que a sessão acabou (seção 7.5). */
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
 * `fetch` autenticado. Anexa o `Authorization: Bearer`, e ao receber
 * `401 TOKEN_EXPIRED` renova a sessão e repete a requisição **uma única vez**
 * (seção 8.3). Um segundo 401 não tenta de novo — é o que impede o laço
 * infinito de renovação.
 *
 * `TOKEN_EXPIRED` é invisível ao membro; `INVALID_TOKEN` encerra a sessão.
 * Tratar os dois como "deslogar" expulsaria o membro a cada 15 minutos.
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

  // Rede fora: devolve o 401 original para a tela tratar como erro transitório,
  // sem derrubar a sessão.
  if (outcome.status === "unavailable") return response;

  const retried = await sendAuthorized(path, init);
  if (retried.status === 401 && isSessionEndingCode(await readErrorCode(retried))) {
    endSession();
  }

  return retried;
}
