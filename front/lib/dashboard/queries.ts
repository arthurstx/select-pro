"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardCandidatesQuery, DashboardMetricsQuery } from "shared";

import { fetchCandidates, fetchCandidateDetail, fetchEditions, fetchMetrics } from "./api";

export const dashboardKeys = {
  metrics: (params: DashboardMetricsQuery) => ["dashboard", "metrics", params] as const,
  candidates: (params: DashboardCandidatesQuery) => ["dashboard", "candidates", params] as const,
  detail: (id: string) => ["dashboard", "candidate", id] as const,
  editions: () => ["dashboard", "editions"] as const,
};

/**
 * O default global é `staleTime: 5min` + `refetchOnWindowFocus: false`
 * (`app/providers.tsx`), razoável para o resto do app e errado aqui: foi
 * exatamente o que fez o filtro do check-in só atualizar com F5 — voltar a um
 * filtro já visitado servia cache velho sem revalidar (FEAT-0005-UI).
 *
 * O custo de nunca considerar fresco é baixo: o backend serve estas duas
 * rotas de um cache em KV de 60s.
 */
const ALWAYS_REVALIDATE = { staleTime: 0, refetchOnWindowFocus: true } as const;

/** `metrics` e `candidates` são queries SEPARADAS de propósito — ver `useDashboardCandidatesQuery`. */
export function useDashboardMetricsQuery(params: DashboardMetricsQuery) {
  return useQuery({
    queryKey: dashboardKeys.metrics(params),
    queryFn: () => fetchMetrics(params),
    ...ALWAYS_REVALIDATE,
  });
}

/** `dashboardKeys.candidates(params)` guarda os params na posição 2. */
function paramsOf(queryKey: readonly unknown[]): DashboardCandidatesQuery | undefined {
  return queryKey[2] as DashboardCandidatesQuery | undefined;
}

/**
 * Separada de `metrics` porque os filtros da tabela não afetam os agregados:
 * digitar na busca refaz só esta. Numa requisição única, o gráfico piscaria a
 * cada tecla.
 */
export function useDashboardCandidatesQuery(params: DashboardCandidatesQuery) {
  return useQuery({
    queryKey: dashboardKeys.candidates(params),
    queryFn: () => fetchCandidates(params),
    ...ALWAYS_REVALIDATE,

    // Só reaproveita o dado anterior quando SÓ a página mudou. Trocar de
    // busca, de intervalo ou de edição precisa de carregamento de verdade —
    // manter o resultado do filtro anterior faria parecer que o filtro não
    // funcionou (FEAT-0007-UI, seção 8.3).
    placeholderData: (previousData, previousQuery) => {
      if (!previousQuery) return undefined;
      const previous = paramsOf(previousQuery.queryKey);
      if (!previous) return undefined;

      const sameFilter =
        previous.process_id === params.process_id &&
        (previous.search ?? "") === (params.search ?? "") &&
        (previous.from ?? "") === (params.from ?? "") &&
        (previous.to ?? "") === (params.to ?? "") &&
        previous.sort === params.sort;

      return sameFilter ? previousData : undefined;
    },
  });
}

/** Disparada só quando o painel lateral abre. A tabela atrás continua utilizável. */
export function useCandidateDetailQuery(candidateId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.detail(candidateId ?? ""),
    queryFn: () => fetchCandidateDetail(candidateId!),
    enabled: candidateId !== null,
    ...ALWAYS_REVALIDATE,
  });
}

/**
 * Catálogo do seletor. Aqui o default global de 5 minutos é adequado e fica
 * como está: a lista de edições muda uma vez por semestre, não a cada
 * inscrição.
 */
export function useEditionsQuery() {
  return useQuery({
    queryKey: dashboardKeys.editions(),
    queryFn: fetchEditions,
  });
}
