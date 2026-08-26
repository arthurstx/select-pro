import {
  MemberCheckinListResponseSchema,
  MemberCheckinResponseSchema,
  type MemberCheckinListResponse,
  type MemberCheckinResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// FEAT-0010 — check-in de membros (avaliadores/hosts). Espelha
// `lib/checkin/api.ts` (candidatos), mas sem paginação nem filtro — a lista
// é de dezenas de pessoas por edição, não milhares.

export async function listMemberCheckins(): Promise<MemberCheckinListResponse["data"]> {
  const response = await authFetch("/member-checkins");
  if (!response.ok) throw await toApiError(response);

  return MemberCheckinListResponseSchema.parse(await response.json()).data;
}

export async function markMemberPresent(userId: string): Promise<MemberCheckinResponse["data"]> {
  const response = await authFetch(`/member-checkins/${userId}/checkin`, { method: "PUT" });
  if (!response.ok) throw await toApiError(response);

  return MemberCheckinResponseSchema.parse(await response.json()).data;
}

export async function unmarkMemberPresent(userId: string): Promise<void> {
  const response = await authFetch(`/member-checkins/${userId}/checkin`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}
