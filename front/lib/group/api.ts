import {
  GroupListResponseSchema,
  GroupResponseSchema,
  MoveResultResponseSchema,
  OrganizeResultResponseSchema,
  PreviewOnlineResponseSchema,
  PreviewPresencialResponseSchema,
  type GroupListResponse,
  type GroupSummary,
  type MoveResultResponse,
  type OrganizeResultResponse,
  type PreviewOnlineResponse,
  type PreviewPresencialResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// FEAT-0012 — organização automática de grupos. FEAT-0018 — presencial e online são
// operações independentes; grupo online ganha self-service (join/leave) e atribuição manual.
// FEAT-0021 — presencial ganha prévia configurável (preview) antes de aplicar de verdade, e
// "limpar organização". Espelha `lib/member-checkin/api.ts`.

/**
 * `evaluatorUserIds` (FEAT-0021): ausente = todos os avaliadores presentes. Passar o MESMO
 * array usado num `previewPresencial` anterior reproduz exatamente a prévia (FR-011).
 */
export async function organizePresencial(evaluatorUserIds?: string[]): Promise<OrganizeResultResponse["data"]> {
  const response = await authFetch("/groups/organize/presencial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluatorUserIds }),
  });
  if (!response.ok) throw await toApiError(response);

  return OrganizeResultResponseSchema.parse(await response.json()).data;
}

/** FEAT-0021 (US1) — mesmo cálculo de `organizePresencial`, sem persistir nada. */
export async function previewPresencial(evaluatorUserIds?: string[]): Promise<PreviewPresencialResponse["data"]> {
  const response = await authFetch("/groups/preview/presencial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluatorUserIds }),
  });
  if (!response.ok) throw await toApiError(response);

  return PreviewPresencialResponseSchema.parse(await response.json()).data;
}

/** FEAT-0021 (US2) — "Limpar organização": remove toda a organização presencial. Nunca afeta online. */
export async function clearPresencialOrganization(): Promise<void> {
  const response = await authFetch("/groups/presencial", { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}

/** FEAT-0022 — mesmo conceito de `clearPresencialOrganization`, para o online. Nunca afeta presencial. */
export async function clearOnlineOrganization(): Promise<void> {
  const response = await authFetch("/groups/online", { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}

export async function organizeOnline(): Promise<OrganizeResultResponse["data"]> {
  const response = await authFetch("/groups/organize/online", { method: "POST" });
  if (!response.ok) throw await toApiError(response);

  return OrganizeResultResponseSchema.parse(await response.json()).data;
}

/** FEAT-0022 (US4) — mesmo cálculo de `organizeOnline`, sem persistir nada. */
export async function previewOnline(): Promise<PreviewOnlineResponse["data"]> {
  const response = await authFetch("/groups/preview/online", { method: "POST" });
  if (!response.ok) throw await toApiError(response);

  return PreviewOnlineResponseSchema.parse(await response.json()).data;
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

/** Self-service — o próprio avaliador autenticado se junta a um grupo online (FEAT-0018, US2). */
export async function joinOnlineGroup(groupId: string): Promise<GroupSummary> {
  const response = await authFetch(`/groups/online/${groupId}/join`, { method: "POST" });
  if (!response.ok) throw await toApiError(response);

  return GroupResponseSchema.parse(await response.json()).data;
}

/** Self-service — o próprio avaliador autenticado sai do grupo online em que estiver (FEAT-0018, US2). */
export async function leaveOnlineGroup(): Promise<void> {
  const response = await authFetch("/groups/online/me", { method: "DELETE" });
  if (!response.ok) throw await toApiError(response);
}

/** Atribuição manual do admin, sem o avaliador precisar clicar em nada (FEAT-0018, US3). */
export async function assignEvaluatorOnline(groupId: string, userId: string): Promise<GroupSummary> {
  const response = await authFetch(`/groups/online/${groupId}/evaluators/${userId}`, { method: "PUT" });
  if (!response.ok) throw await toApiError(response);

  return GroupResponseSchema.parse(await response.json()).data;
}
