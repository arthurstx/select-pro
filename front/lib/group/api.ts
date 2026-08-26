import {
  GroupListResponseSchema,
  MoveResultResponseSchema,
  OrganizeResultResponseSchema,
  type GroupListResponse,
  type MoveResultResponse,
  type OrganizeResultResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// FEAT-0012 — organização automática de grupos. Espelha `lib/member-checkin/api.ts`.

export async function organizeGroups(): Promise<OrganizeResultResponse["data"]> {
  const response = await authFetch("/groups/organize", { method: "POST" });
  if (!response.ok) throw await toApiError(response);

  return OrganizeResultResponseSchema.parse(await response.json()).data;
}

export async function listGroups(): Promise<GroupListResponse["data"]> {
  const response = await authFetch("/groups");
  if (!response.ok) throw await toApiError(response);

  return GroupListResponseSchema.parse(await response.json()).data;
}

export async function moveCandidate(groupId: string, candidateId: string): Promise<MoveResultResponse["data"]> {
  const response = await authFetch(`/groups/${groupId}/candidates/${candidateId}`, { method: "PATCH" });
  if (!response.ok) throw await toApiError(response);

  return MoveResultResponseSchema.parse(await response.json()).data;
}

export async function moveEvaluator(groupId: string, userId: string): Promise<MoveResultResponse["data"]> {
  const response = await authFetch(`/groups/${groupId}/evaluators/${userId}`, { method: "PATCH" });
  if (!response.ok) throw await toApiError(response);

  return MoveResultResponseSchema.parse(await response.json()).data;
}
