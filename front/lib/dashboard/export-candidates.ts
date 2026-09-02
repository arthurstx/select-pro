import type { ExportCandidatesQuery } from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

/**
 * `GET /exports/candidates` devolve `text/csv`, não JSON — por isso não
 * reaproveita o padrão de `lib/*-api.ts` (que faz `.json()`). Sem UI de
 * campos sensíveis: exporta sempre com `include_sensitive=false` (default
 * do backend), mesmo recorte da tabela na tela (processo/busca/intervalo).
 * Um botão dedicado a incluir gênero/etnia fica para quando houver pedido
 * real — implementar sem uso adiaria a decisão de quem deveria poder pedir.
 */
export async function exportCandidatesCsv(filters: Partial<ExportCandidatesQuery>): Promise<void> {
  const params = new URLSearchParams();
  if (filters.process_id) params.set("process_id", filters.process_id);
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.course) params.set("course", filters.course);

  const response = await authFetch(`/exports/candidates?${params.toString()}`);
  if (!response.ok) throw await toApiError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromContentDisposition(response.headers.get("content-disposition"));
  link.click();
  URL.revokeObjectURL(url);
}

function filenameFromContentDisposition(header: string | null): string {
  const match = header?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? "candidatos.csv";
}
