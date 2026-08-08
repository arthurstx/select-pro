import type { RegisterRequest, RegisterResponse } from "shared";

import { toApiError } from "@/lib/api/api-error";
import { API_BASE_URL } from "@/lib/api/config";

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<TResponse>;
}

export function registerCandidate(data: RegisterRequest): Promise<RegisterResponse> {
  return postJson<RegisterResponse>("/candidate/register", data);
}
