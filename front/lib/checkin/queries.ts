"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ListCandidatesQuery, ListCandidatesResponse } from "shared";

import { listCandidates, markPresent, unmarkPresent } from "./api";

type ListData = ListCandidatesResponse["data"];

/**
 * Prefixo comum a toda listagem, independente de página/busca/status — é
 * nele que as mutações otimistas batem para atualizar (e, em erro,
 * restaurar) qualquer página que esteja em cache no momento do clique
 * (FEAT-0005-UI, seção 8).
 */
const LIST_PREFIX = ["checkin", "candidates"] as const;

export const checkinKeys = {
  list: (params: ListCandidatesQuery) => [...LIST_PREFIX, params] as const,
};

export function useCandidatesQuery(params: ListCandidatesQuery) {
  return useQuery({
    queryKey: checkinKeys.list(params),
    queryFn: () => listCandidates(params),
    // A lista não pisca ao trocar de página — a anterior fica visível até a
    // próxima chegar (FEAT-0005-UI, seção 8.3).
    placeholderData: keepPreviousData,
  });
}

function patchItem(data: ListData, candidateId: string, checkedInAt: string | null): ListData {
  return {
    ...data,
    items: data.items.map((item) => (item.id === candidateId ? { ...item, checkedInAt } : item)),
  };
}

/**
 * Atualiza a linha em TODAS as listagens em cache (qualquer página/busca/
 * status já visitados) — nunca via `invalidateQueries`, que refaria o
 * `GET /candidates` e traria de volta o piscar que a atualização otimista
 * existe para evitar (FEAT-0005-UI, seção 8.2).
 */
function patchAllLists(queryClient: QueryClient, candidateId: string, checkedInAt: string | null): void {
  queryClient.setQueriesData<ListData>({ queryKey: LIST_PREFIX }, (old) =>
    old ? patchItem(old, candidateId, checkedInAt) : old,
  );
}

function snapshotLists(queryClient: QueryClient) {
  return queryClient.getQueriesData<ListData>({ queryKey: LIST_PREFIX });
}

function restoreLists(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotLists>): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Marcar presença. A linha pinta ANTES da resposta do servidor (`onMutate`);
 * se o filtro ativo for "Presentes"/"Ausentes", o item marcado NÃO é
 * removido da página corrente até a próxima leitura do servidor — removê-lo
 * na hora faria as linhas seguintes subirem debaixo do dedo, e o próximo
 * toque acertaria a pessoa errada (FEAT-0005-UI, seção 8.2).
 */
export function useMarkPresentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidateId: string) => markPresent(candidateId),
    onMutate: async (candidateId: string) => {
      await queryClient.cancelQueries({ queryKey: LIST_PREFIX });
      const snapshot = snapshotLists(queryClient);
      patchAllLists(queryClient, candidateId, new Date().toISOString());
      return { snapshot };
    },
    onError: (_error, _candidateId, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
    },
    onSuccess: (result) => {
      // Reconcilia com o `checkedInAt` real do servidor — em E4 (presença já
      // confirmada por outro avaliador) é o da confirmação ORIGINAL, não o
      // instante deste clique (FEAT-0005, seção 8.3).
      patchAllLists(queryClient, result.candidateId, result.checkedInAt);
    },
  });
}

/** Desmarcar presença. Mesmo desenho otimista de `useMarkPresentMutation`, invertido. */
export function useUnmarkPresentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (candidateId: string) => unmarkPresent(candidateId),
    onMutate: async (candidateId: string) => {
      await queryClient.cancelQueries({ queryKey: LIST_PREFIX });
      const snapshot = snapshotLists(queryClient);
      patchAllLists(queryClient, candidateId, null);
      return { snapshot };
    },
    onError: (_error, _candidateId, context) => {
      if (context) restoreLists(queryClient, context.snapshot);
    },
  });
}
