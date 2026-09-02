import { z } from "zod";

// Salas do processo seletivo (FEAT-0011). `rooms(id, name, size)` existe
// desde a 0001, órfã até esta feature.

/**
 * Hosts e limite de grupos NUNCA são colunas — são derivados da capacidade
 * (D5, CONTEXT.md). Função pura, sem I/O: consumida pela API (monta a
 * response) e pelo front (prévia ao vivo no formulário, sem round-trip —
 * mockup Stitch "Gestão de Salas").
 */
export function deriveRoomCapacity(size: number): { hostCount: number; maxGroups: number } {
    if (size <= 50) return { hostCount: 1, maxGroups: 2 };
    if (size <= 80) return { hostCount: 2, maxGroups: 3 };
    return { hostCount: 2, maxGroups: 4 };
}

/**
 * FEAT-0020, ajustado na FEAT-0022 — quantos grupos (presencial OU online, mesma faixa desde a
 * FEAT-0022) formar para `candidateCount` candidatos, mantendo 5-7 candidatos por grupo, 5 como
 * o tamanho ideal. Começa do menor número de grupos que garante que ninguém passa de 7, depois
 * reduz até a média bater 5 por grupo — mas só reduz se isso não empurrar a média acima de 7
 * (`candidateCount / (groups - 1) <= 7`): no intervalo 8-9 candidatos não existe divisão que
 * respeite 5 como piso E 7 como teto ao mesmo tempo (1 grupo estoura o teto, 2 grupos furam o
 * piso) — nesse caso o teto vence, formando 2 grupos abaixo do ideal em vez de 1 grupo grande
 * demais. `maxGroups` (capacidade física da sala, D5) sempre vence como teto — nunca recomenda
 * mais grupos do que a sala comporta. Função pura: consumida pela organização real
 * (`group-organization.ts`, presencial e online) e pela simulação do front (sem round-trip),
 * mesmo padrão de `deriveRoomCapacity`.
 */
export function derivePresencialGroupCount(candidateCount: number, maxGroups: number = Infinity): number {
    if (candidateCount <= 0) return 0;
    if (candidateCount <= 7) return 1; // grupo único, mesmo abaixo de 5 (edge case — pouca gente)

    let groups = Math.min(maxGroups, Math.ceil(candidateCount / 7));
    while (groups > 1 && candidateCount / groups < 5 && candidateCount / (groups - 1) <= 7) groups -= 1;

    return Math.max(1, groups);
}

/**
 * FEAT-0020, ajustado na FEAT-0022 — quantos avaliadores um grupo presencial de `size`
 * candidatos deve ter: 1 para grupo de 5 (o ideal), 2 para grupo de 6-7. Host nunca entra
 * nessa conta — é alocado à sala, não ao grupo (FR-007, `deriveRoomCapacity`).
 */
export function deriveEvaluatorTargetForGroupSize(size: number): 1 | 2 {
    return size >= 6 ? 2 : 1;
}

/**
 * FEAT-0020 — recomendação "do zero" de quantas salas (por faixa de D5) comportariam
 * `totalGroups` grupos, priorizando a maior faixa primeiro (menos salas físicas necessárias —
 * research.md, Decisão 4). Não lê `rooms` cadastradas: é só a matemática da simulação.
 */
export function recommendRoomsForGroups(
    totalGroups: number,
): { maxGroups: number; hostCount: number; roomsNeeded: number }[] {
    if (totalGroups <= 0) return [];

    // Maior faixa primeiro (D5, `deriveRoomCapacity`): >80 → 4 grupos/2 hosts.
    const tiers = [
        { maxGroups: 4, hostCount: 2 },
        { maxGroups: 3, hostCount: 2 },
        { maxGroups: 2, hostCount: 1 },
    ];

    const plan: { maxGroups: number; hostCount: number; roomsNeeded: number }[] = [];
    let remaining = totalGroups;

    const biggest = tiers[0]!;
    const roomsOfBiggest = Math.floor(remaining / biggest.maxGroups);
    if (roomsOfBiggest > 0) {
        plan.push({ ...biggest, roomsNeeded: roomsOfBiggest });
        remaining -= roomsOfBiggest * biggest.maxGroups;
    }

    if (remaining > 0) {
        // Menor faixa que ainda comporta o restante sozinha; se nenhuma comportar (raro — só
        // aconteceria com faixas > a maior existente), usa a maior mesmo assim.
        const tier = [...tiers].reverse().find((t) => t.maxGroups >= remaining) ?? biggest;
        plan.push({ ...tier, roomsNeeded: 1 });
    }

    return plan;
}

/**
 * FEAT-0022 (US1) — quantos hosts a estrutura de salas REALMENTE usada por uma prévia exige,
 * somando `deriveRoomCapacity(size).hostCount` por sala DISTINTA (não por grupo — uma sala com
 * 2 grupos conta uma vez só). `deficit` nunca fica negativo: hosts presentes sobrando não geram
 * "crédito", só zeram o aviso.
 */
export function calculateHostDeficit(
    roomSizesUsed: number[],
    hostsPresentCount: number,
): { required: number; deficit: number } {
    const required = roomSizesUsed.reduce((sum, size) => sum + deriveRoomCapacity(size).hostCount, 0);
    return { required, deficit: Math.max(0, required - hostsPresentCount) };
}

/**
 * FEAT-0022 (US2), ajustado — classifica um grupo presencial frente à configuração ideal: 5
 * candidatos (o tamanho ideal) com 1 avaliador é ideal; 6-7 candidatos com 2 avaliadores é
 * aceitável; qualquer outra combinação (fora de 5-7, ou dentro de 5-7 mas com avaliador a
 * mais/a menos do esperado) fica fora do ideal. Só classifica — não muda o algoritmo real de
 * organização.
 */
export function classifyPresencialGroup(
    candidateCount: number,
    evaluatorCount: number,
): "ideal" | "aceitavel" | "fora_do_ideal" {
    if (candidateCount === 5 && evaluatorCount === 1) return "ideal";
    if ((candidateCount === 6 || candidateCount === 7) && evaluatorCount === 2) return "aceitavel";
    return "fora_do_ideal";
}

export const CreateRoomSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome da sala"),
    size: z.number().int().min(1, "A capacidade deve ser de pelo menos 1 pessoa"),
});
export type CreateRoomDTO = z.infer<typeof CreateRoomSchema>;

/** Mesmo shape do create — `PUT` substitui nome e capacidade juntos (a tela sempre pré-carrega os dois). */
export const UpdateRoomSchema = CreateRoomSchema;
export type UpdateRoomDTO = z.infer<typeof UpdateRoomSchema>;

export const RoomSummarySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    size: z.number().int(),
    hostCount: z.number().int(),
    maxGroups: z.number().int(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export const RoomListResponseSchema = z.object({
    data: z.array(RoomSummarySchema),
});
export type RoomListResponse = z.infer<typeof RoomListResponseSchema>;

export const RoomResponseSchema = z.object({
    data: RoomSummarySchema,
});
export type RoomResponse = z.infer<typeof RoomResponseSchema>;

export const RoomErrorCode = {
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    ROOM_NAME_ALREADY_EXISTS: "ROOM_NAME_ALREADY_EXISTS",
    /** FR-009 — `groups.room_id ... ON DELETE RESTRICT` já impede a exclusão; isto só nomeia a violação. */
    ROOM_HAS_GROUPS: "ROOM_HAS_GROUPS",
} as const;
export type RoomErrorCode = (typeof RoomErrorCode)[keyof typeof RoomErrorCode];
