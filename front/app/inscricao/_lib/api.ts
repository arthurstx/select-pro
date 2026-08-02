import type {
  ConfirmOtcRequest,
  ConfirmOtcResponse,
  PreRegisterRequest,
  PreRegisterResponse,
} from "shared";

import { toApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<TResponse>;
}

export function preRegisterCandidate(data: PreRegisterRequest): Promise<PreRegisterResponse> {
  return postJson<PreRegisterResponse>("/candidate/pre-register", data);
}

export function confirmOtc(data: ConfirmOtcRequest): Promise<ConfirmOtcResponse> {
  return postJson<ConfirmOtcResponse>("/candidate/confirm-otc", data);
}
