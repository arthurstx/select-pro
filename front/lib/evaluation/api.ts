import {
  AdminCandidateDetailResponseSchema,
  AdminCandidatesListResponseSchema,
  MyGroupResponseSchema,
  SubmitEvaluationResponseSchema,
  type AdminCandidateDetailResponse,
  type AdminCandidatesListResponse,
  type MyGroupResponse,
  type SubmitEvaluationDTO,
  type SubmitEvaluationResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// FEAT-0013 — avaliação dos candidatos. Espelha lib/group/api.ts.

export async function getMyGroup(): Promise<MyGroupResponse["data"]> {
  const response = await authFetch("/evaluations/my-group");
  if (!response.ok) throw await toApiError(response);

  return MyGroupResponseSchema.parse(await response.json()).data;
}

export async function submitEvaluation(candidateId: string, payload: SubmitEvaluationDTO): Promise<SubmitEvaluationResponse["data"]> {
  const response = await authFetch(`/evaluations/candidates/${candidateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await toApiError(response);

  return SubmitEvaluationResponseSchema.parse(await response.json()).data;
}

export async function getAdminCandidates(): Promise<AdminCandidatesListResponse["data"]> {
  const response = await authFetch("/evaluations/admin/candidates");
  if (!response.ok) throw await toApiError(response);

  return AdminCandidatesListResponseSchema.parse(await response.json()).data;
}

export async function getAdminCandidateDetail(candidateId: string): Promise<AdminCandidateDetailResponse["data"]> {
  const response = await authFetch(`/evaluations/admin/candidates/${candidateId}`);
  if (!response.ok) throw await toApiError(response);

  return AdminCandidateDetailResponseSchema.parse(await response.json()).data;
}
