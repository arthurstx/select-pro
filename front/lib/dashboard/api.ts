import {
  CandidateDetailResponseSchema,
  DashboardCandidatesQuerySchema,
  DashboardCandidatesResponseSchema,
  DashboardMetricsQuerySchema,
  DashboardMetricsResponseSchema,
  SelectionProcessListResponseSchema,
  type CandidateDetailResponse,
  type DashboardCandidatesQuery,
  type DashboardCandidatesResponse,
  type DashboardMetricsQuery,
  type DashboardMetricsResponse,
  type SelectionProcessListResponse,
} from "shared";

import { toApiError } from "@/lib/api/api-error";
import { authFetch } from "@/lib/auth/session";

// As queries passam pelos MESMOS schemas que o backend valida antes de virar
// URL — defaults e coerção acontecem num lugar só (FEAT-0007, seção 8.2).
// `process_id` ausente significa "edição corrente"; nunca mandar `process_id=`
// vazio, que é o terceiro estado ambíguo que o contrato evita.

function metricsQueryString(query: DashboardMetricsQuery): string {
  const parsed = DashboardMetricsQuerySchema.parse(query);
  const params = new URLSearchParams({ mode: parsed.mode });
  if (parsed.process_id) params.set("process_id", parsed.process_id);

  return params.toString();
}

function candidatesQueryString(query: DashboardCandidatesQuery): string {
  const parsed = DashboardCandidatesQuerySchema.parse(query);
  const params = new URLSearchParams({
    page: String(parsed.page),
    per_page: String(parsed.per_page),
    sort: parsed.sort,
  });
  if (parsed.process_id) params.set("process_id", parsed.process_id);
  if (parsed.search) params.set("search", parsed.search);
  if (parsed.from) params.set("from", parsed.from);
  if (parsed.to) params.set("to", parsed.to);
  if (parsed.course) params.set("course", parsed.course);

  return params.toString();
}

export async function fetchMetrics(query: DashboardMetricsQuery): Promise<DashboardMetricsResponse["data"]> {
  const response = await authFetch(`/dashboard/metrics?${metricsQueryString(query)}`);
  if (!response.ok) throw await toApiError(response);

  return DashboardMetricsResponseSchema.parse(await response.json()).data;
}

export async function fetchCandidates(
  query: DashboardCandidatesQuery,
): Promise<DashboardCandidatesResponse["data"]> {
  const response = await authFetch(`/dashboard/candidates?${candidatesQueryString(query)}`);
  if (!response.ok) throw await toApiError(response);

  return DashboardCandidatesResponseSchema.parse(await response.json()).data;
}

export async function fetchCandidateDetail(id: string): Promise<CandidateDetailResponse["data"]> {
  const response = await authFetch(`/dashboard/candidates/${id}`);
  if (!response.ok) throw await toApiError(response);

  return CandidateDetailResponseSchema.parse(await response.json()).data;
}

export async function fetchEditions(): Promise<SelectionProcessListResponse["data"]> {
  const response = await authFetch("/dashboard/editions");
  if (!response.ok) throw await toApiError(response);

  return SelectionProcessListResponseSchema.parse(await response.json()).data;
}
