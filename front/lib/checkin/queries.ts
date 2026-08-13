"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CheckinStatusFilter, ListCandidatesQuery, ListCandidatesResponse } from "shared";

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

/** `checkinKeys.list(params)` tem os params na posição 2 — usado tanto na leitura quanto nas mutações abaixo. */
function paramsOf(queryKey: readonly unknown[]): ListCandidatesQuery | undefined {
    return queryKey[2] as ListCandidatesQuery | undefined;
}

export function useCandidatesQuery(params: ListCandidatesQuery) {
    return useQuery({
        queryKey: checkinKeys.list(params),
        queryFn: () => listCandidates(params),
        // `keepPreviousData` "cru" mantinha a lista de QUALQUER query anterior
        // visível, mesmo trocando de filtro — o que fazia a troca de aba
        // parecer não ter efeito (mostrava "Todos" por baixo de "Ausentes")
        // e escondia o skeleton, porque `isPending` nunca voltava a `true`.
        // Só reaproveitar dado anterior quando SÓ a página mudou: troca de
        // busca ou de status precisa de um loading de verdade.
        placeholderData: (previousData, previousQuery) => {
            if (!previousQuery) return undefined;
            const previous = paramsOf(previousQuery.queryKey);
            if (!previous) return undefined;

            const sameFilter = previous.status === params.status && (previous.search ?? "") === (params.search ?? "");
            return sameFilter ? previousData : undefined;
        },
    });
}

function patchItem(data: ListData, candidateId: string, checkedInAt: string | null): ListData {
    return {
        ...data,
        items: data.items.map((item) => (item.id === candidateId ? { ...item, checkedInAt } : item)),
    };
}

/**
 * Remove o item da página em cache quando ele deixa de pertencer ao filtro
 * dela (ex.: desmarcar alguém enquanto se olha "Presentes"). Só é seguro
 * fazer isso para o filtro que o item JÁ estava — inserir numa página de um
 * filtro diferente exigiria saber a posição de ordenação certa, que só o
 * servidor tem; por isso o item que passa a pertencer a um filtro não
 * visitado só aparece nele no próximo fetch real (a invalidação do KV no
 * backend garante que esse fetch já vem certo).
 */
function reconcileItem(
    data: ListData,
    candidateId: string,
    checkedInAt: string | null,
    status: CheckinStatusFilter,
): ListData {
    const stillBelongs = status === "todos" || (status === "presentes") === (checkedInAt !== null);
    const wasInThisPage = data.items.some((item) => item.id === candidateId);

    if (!wasInThisPage) return data;

    if (!stillBelongs) {
        const total = Math.max(0, data.pagination.total - 1);
        return {
            ...data,
            items: data.items.filter((item) => item.id !== candidateId),
            pagination: { ...data.pagination, total, totalPages: Math.ceil(total / data.pagination.perPage) },
        };
    }

    return patchItem(data, candidateId, checkedInAt);
}

function listQueries(queryClient: QueryClient) {
    return queryClient.getQueriesData<ListData>({ queryKey: LIST_PREFIX });
}

/**
 * Atualiza (ou remove) a linha em TODAS as listagens em cache — nunca via
 * `invalidateQueries`, que refaria o `GET /candidates` e traria de volta o
 * piscar que a atualização otimista existe para evitar (FEAT-0005-UI, seção
 * 8.2). Cada página em cache decide por conta própria, a partir do próprio
 * `status` (lido da chave, não do updater — `setQueriesData` nesta versão
 * só passa o dado antigo, sem a query), se o item deve só ser atualizado ou
 * sumir da vista.
 */
function patchAllLists(queryClient: QueryClient, candidateId: string, checkedInAt: string | null): void {
    for (const [key, data] of listQueries(queryClient)) {
        if (!data) continue;
        const status = paramsOf(key)?.status ?? "todos";
        queryClient.setQueryData(key, reconcileItem(data, candidateId, checkedInAt, status));
    }
}

function snapshotLists(queryClient: QueryClient) {
    return listQueries(queryClient);
}

function restoreLists(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotLists>): void {
    for (const [key, data] of snapshot) {
        queryClient.setQueryData(key, data);
    }
}

/**
 * Marcar presença. A linha pinta ANTES da resposta do servidor (`onMutate`).
 * Some da vista imediatamente se a página em cache for a de "Ausentes";
 * nas demais, só atualiza o badge no lugar.
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
