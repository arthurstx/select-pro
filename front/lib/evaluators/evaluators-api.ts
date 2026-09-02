import {
  EvaluatorListResponseSchema,
  EvaluatorResponseSchema,
  type EvaluatorRole,
  type EvaluatorRoleFilter,
  type EvaluatorSummary,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// Mesmo padrão de lib/rooms/rooms-api.ts — todas as rotas de /evaluators exigem admin.

export async function listEvaluators(role: EvaluatorRoleFilter = "all"): Promise<EvaluatorSummary[]> {
  const response = await authFetch(`/evaluators?role=${role}`);
  if (!response.ok) throw await toApiError(response);

  return EvaluatorListResponseSchema.parse(await response.json()).data;
}

export async function setEvaluatorRole(userId: string, role: EvaluatorRole): Promise<EvaluatorSummary> {
  const response = await authFetch(`/evaluators/${userId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw await toApiError(response);

  return EvaluatorResponseSchema.parse(await response.json()).data;
}
