import type { CheckinStatusFilter, ListCandidatesResponse } from "shared";

export type ListData = ListCandidatesResponse["data"];

function patchItem(data: ListData, candidateId: string, checkedInAt: string | null): ListData {
    return {
        ...data,
        items: data.items.map((item) => (item.id === candidateId ? { ...item, checkedInAt } : item)),
    };
}

/**
 * Aplica uma mudança de presença a UMA página em cache, respeitando o filtro
 * dela. Puro de propósito — é a lógica mais sutil da tela e a única que
 * merece teste próprio (FEAT-0005-UI, seção 8).
 *
 * Três casos:
 * - o item não está nesta página → nada muda. Note que isto inclui o caso
 *   "passou a pertencer a este filtro": inserir exigiria saber a posição de
 *   ordenação correta, que só o servidor tem. Essa página é revalidada
 *   quando o usuário voltar para ela (`staleTime: 0` em `queries.ts`).
 * - o item está e continua pertencendo → só atualiza o `checkedInAt`.
 * - o item está e deixou de pertencer (ex.: desmarcar vendo "Presentes") →
 *   some da lista na hora, e o `total` acompanha.
 */
export function reconcileItem(
    data: ListData,
    candidateId: string,
    checkedInAt: string | null,
    status: CheckinStatusFilter,
): ListData {
    if (!data.items.some((item) => item.id === candidateId)) return data;

    const stillBelongs = status === "todos" || (status === "presentes") === (checkedInAt !== null);
    if (stillBelongs) return patchItem(data, candidateId, checkedInAt);

    const total = Math.max(0, data.pagination.total - 1);

    return {
        ...data,
        items: data.items.filter((item) => item.id !== candidateId),
        pagination: {
            ...data.pagination,
            total,
            totalPages: Math.ceil(total / data.pagination.perPage),
        },
    };
}
