import {
  CheckinResponseSchema,
  ListCandidatesQuerySchema,
  ListCandidatesResponseSchema,
  type CheckinResponse,
  type ListCandidatesQuery,
  type ListCandidatesResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

function toQueryString(query: ListCandidatesQuery): string {
  // Passa pelo schema para aplicar defaults/coerção antes de montar a URL —
  // o mesmo contrato que o backend valida (FEAT-0005, seção 8.2).
  const parsed = ListCandidatesQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(parsed.page),
    per_page: String(parsed.per_page),
    status: parsed.status,
  });
  if (parsed.search) params.set("search", parsed.search);

  return params.toString();
}

export async function listCandidates(query: ListCandidatesQuery): Promise<ListCandidatesResponse["data"]> {
  const response = await authFetch(`/candidates?${toQueryString(query)}`);
  if (!response.ok) throw await toApiError(response);

  return ListCandidatesResponseSchema.parse(await response.json()).data;
}

export async function markPresent(candidateId: string): Promise<CheckinResponse["data"]> {
  const response = await authFetch(`/candidates/${candidateId}/checkin`, { method: "PUT" });
  if (!response.ok) throw await toApiError(response);

  return CheckinResponseSchema.parse(await response.json()).data;
}

export async function unmarkPresent(candidateId: string): Promise<void> {
  const response = await authFetch(`/candidates/${candidateId}/checkin`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}
