import {
  SelectionProcessAdminListResponseSchema,
  SelectionProcessAdminResponseSchema,
  type SelectionProcessAdminSummary,
  type UpdateSelectionProcessAdminDTO,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// Mesmo padrão de lib/rooms/rooms-api.ts — todas as rotas de
// /selection-processes exigem admin. Sem create/delete (FEAT-0017): a
// criação continua só automática (resolveCurrent()).

export async function listSelectionProcesses(): Promise<SelectionProcessAdminSummary[]> {
  const response = await authFetch("/selection-processes");
  if (!response.ok) throw await toApiError(response);

  return SelectionProcessAdminListResponseSchema.parse(await response.json()).data;
}

export async function updateSelectionProcess(
  id: string,
  input: UpdateSelectionProcessAdminDTO,
): Promise<SelectionProcessAdminSummary> {
  const response = await authFetch(`/selection-processes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response);

  return SelectionProcessAdminResponseSchema.parse(await response.json()).data;
}
