import {
    deriveEvaluatorTargetForGroupSize,
    deriveRoomCapacity,
    derivePresencialGroupCount,
    type RoomRow,
} from "shared";

import type { GroupToInsert, PresentCandidateRow, PresentMemberRow } from "../repositories/group.repository";

/**
 * Algoritmo de organização automática de grupos (FEAT-0012, research.md D-tech4/D-tech5).
 * Duas funções puras e INDEPENDENTES — sem I/O, sem D1 — uma por modalidade (FEAT-0018:
 * presencial e online acontecem em dias diferentes, com pessoas diferentes; não há pool
 * combinado de avaliadores entre as duas, e cada uma é chamada por uma operação de
 * organização separada em `GroupService`). Testadas isoladamente em
 * `group-organization.test.ts`.
 */

export interface OrganizePresencialOutput {
    groups: GroupToInsert[];
    unallocatedCandidateCount: number;
}

// ------------------------------------------------------------
// Presencial — FR-004/FR-005/FR-006/FR-013 (FEAT-0012)
// ------------------------------------------------------------

/** Candidatos presenciais presentes + salas cadastradas + avaliadores/hosts presentes → grupos com sala e avaliador. */
export function organizePresencialGroups(
    candidates: PresentCandidateRow[],
    rooms: RoomRow[],
    presentMembers: PresentMemberRow[],
): OrganizePresencialOutput {
    if (candidates.length === 0) {
        return { groups: [], unallocatedCandidateCount: 0 };
    }

    const sortedRooms = [...rooms].sort((a, b) => a.name.localeCompare(b.name));

    // FEAT-0020: a capacidade real de uma sala não é mais só `room.size` (lugares físicos) —
    // é `min(size, maxGroups * 5)`, porque nenhum grupo pode passar de 5 (FR-003). Uma sala de
    // 50 lugares mas só 2 grupos (D5) não comporta 50 pessoas em grupos válidos, comporta 10.
    // Acumula salas (já em ordem de nome) até cobrir o total de presentes, ou esgotar
    // (FR-012/013 tratam "sem sala nenhuma"/"capacidade insuficiente" fora daqui, no service).
    const roomAssignments: { room: RoomRow; count: number; maxGroups: number }[] = [];
    let remaining = candidates.length;
    for (const room of sortedRooms) {
        if (remaining <= 0) break;
        const { maxGroups } = deriveRoomCapacity(room.size);
        const roomCapacity = Math.min(room.size, maxGroups * 5);
        const count = Math.min(remaining, roomCapacity);
        if (count <= 0) continue;
        roomAssignments.push({ room, count, maxGroups });
        remaining -= count;
    }

    if (roomAssignments.length === 0) {
        return { groups: [], unallocatedCandidateCount: candidates.length };
    }

    const capacity = candidates.length - remaining;
    const unallocatedCandidateCount = Math.max(0, candidates.length - capacity);
    // `candidates` já vem ordenado por `checked_in_at ASC` do repository — quem chegou
    // primeiro é alocado primeiro quando falta capacidade (FR-013).
    const allocatable = candidates.slice(0, capacity);

    // Slot → sala: cada sala reserva tantos slots quanto `derivePresencialGroupCount` recomendar
    // pra sua fatia de candidatos (FEAT-0020) — não mais sempre `maxGroups` fixo.
    const slotRoomIds: string[] = [];
    for (const { room, count, maxGroups } of roomAssignments) {
        const groupsForRoom = derivePresencialGroupCount(count, maxGroups);
        for (let i = 0; i < groupsForRoom; i++) slotRoomIds.push(room.id);
    }

    const candidateSlots = distributeByGender(allocatable, slotRoomIds.length);
    const avaliadores = presentMembers.filter((m) => m.role === "avaliador");
    const hosts = presentMembers.filter((m) => m.role === "host");
    const evaluatorSlots = distributeEvaluatorsByTarget(avaliadores, candidateSlots);
    // FEAT-0021: host é recurso da SALA (compartilhado por todos os grupos dela), não do
    // grupo — distribuído à parte do avaliador-por-grupo (research.md, Decisão 1/2).
    const hostsByRoom = distributeHostsToRooms(hosts, roomAssignments);

    const roomsById = new Map(sortedRooms.map((r) => [r.id, r] as const));
    const groupsByRoom = new Map<string, number>();
    const groups: GroupToInsert[] = [];

    candidateSlots.forEach((candidateIds, index) => {
        if (candidateIds.length === 0) return; // nunca cria grupo vazio (edge case da spec)

        const roomId = slotRoomIds[index];
        const room = roomsById.get(roomId);
        const ordinal = (groupsByRoom.get(roomId) ?? 0) + 1;
        groupsByRoom.set(roomId, ordinal);

        groups.push({
            id: crypto.randomUUID(),
            modality: "presencial",
            roomId,
            name: `${room?.name ?? "Sala"} - Grupo ${ordinal}`,
            candidateIds,
            // O(s) mesmo(s) host(s) da sala aparecem em TODOS os grupos dela — "host
            // responsável" é lido filtrando `evaluators` por `role === "host"` (FEAT-0021).
            evaluatorUserIds: [...(evaluatorSlots[index] ?? []), ...(hostsByRoom.get(roomId) ?? [])],
        });
    });

    return { groups, unallocatedCandidateCount };
}

/**
 * FEAT-0021 — até `deriveRoomCapacity(room.size).hostCount` hosts por sala, em ordem de sala
 * (mesma ordem de `roomAssignments`), consumindo os hosts presentes sequencialmente até
 * acabarem. Host é recurso da sala inteira, não de um grupo específico — por isso os mesmos
 * ids valem pra todos os grupos daquela sala (aplicado por quem chama, `organizePresencialGroups`).
 */
function distributeHostsToRooms(
    hosts: PresentMemberRow[],
    roomAssignments: { room: RoomRow }[],
): Map<string, string[]> {
    const hostsByRoom = new Map<string, string[]>();
    let cursor = 0;

    for (const { room } of roomAssignments) {
        const target = deriveRoomCapacity(room.size).hostCount;
        const assigned: string[] = [];
        while (assigned.length < target && cursor < hosts.length) {
            assigned.push(hosts[cursor]!.user_id);
            cursor += 1;
        }
        hostsByRoom.set(room.id, assigned);
    }

    return hostsByRoom;
}

// ------------------------------------------------------------
// Online — FR-001/FR-002 (FEAT-0018): só separa candidatos, D1, SEM sala/avaliador/host.
// O vínculo avaliador↔grupo online nasce só por ação humana (GroupService.assignEvaluatorToOnlineGroup).
// ------------------------------------------------------------

/**
 * FEAT-0022 (US4, FR-014) — candidatos online presentes → grupos só com candidatos, sem sala
 * (o online nunca teve sala de verdade). Tamanho de grupo via `derivePresencialGroupCount`
 * (sem `maxGroups` — o online não tem teto de sala): já implementa a faixa pedida (4-5 ideal,
 * 3 mínimo aceitável quando não dá pra evitar, nunca deixa 6+ quando redistribuir é possível —
 * conferido manualmente em research.md D1). Antes desta feature o tamanho vinha da MÉDIA das
 * salas cadastradas (`averageRoomGroupSize`, removida) — sem noção nenhuma de faixa ideal.
 */
export function organizeOnlineGroups(candidates: PresentCandidateRow[]): GroupToInsert[] {
    if (candidates.length === 0) {
        return [];
    }

    const targetGroups = derivePresencialGroupCount(candidates.length);
    const candidateSlots = distributeByGender(candidates, targetGroups);

    const groups: GroupToInsert[] = [];
    candidateSlots.forEach((candidateIds, index) => {
        if (candidateIds.length === 0) return;

        groups.push({
            id: crypto.randomUUID(),
            modality: "online",
            roomId: null,
            name: `Grupo Online ${index + 1}`,
            candidateIds,
            evaluatorUserIds: [],
        });
    });

    return groups;
}

// ------------------------------------------------------------
// D1 — nunca um grupo com exatamente 1 mulher (research.md D-tech4, passos 2-3)
// ------------------------------------------------------------

export function distributeByGender(
    candidates: Pick<PresentCandidateRow, "id" | "gender">[],
    groupCount: number,
): string[][] {
    const slots: string[][] = Array.from({ length: groupCount }, () => []);
    if (groupCount === 0) return slots;

    const women = candidates.filter((c) => c.gender === "feminino");
    const others = candidates.filter((c) => c.gender !== "feminino");

    let groupIndex = 0;
    let i = 0;
    while (i < women.length) {
        const remaining = women.length - i;

        if (remaining === 1) {
            // Sobra ímpar: vira trio no ÚLTIMO grupo que já recebeu um par, nunca isolada
            // (D1). Só cai num grupo de 1 quando não há par nenhum formado ainda — o caso
            // de borda "único candidato presente" da spec.
            const target = groupIndex > 0 ? (groupIndex - 1) % groupCount : groupIndex % groupCount;
            slots[target].push(women[i].id);
            i += 1;
        } else {
            slots[groupIndex % groupCount].push(women[i].id, women[i + 1].id);
            i += 2;
            groupIndex += 1;
        }
    }

    // Preenche o resto balanceando pelo grupo com menos gente no momento —
    // nunca altera a contagem de mulheres já fixada acima.
    for (const candidate of others) {
        const smallest = slots.reduce((min, slot, index) => (slot.length < slots[min].length ? index : min), 0);
        slots[smallest].push(candidate.id);
    }

    return slots;
}

/**
 * FEAT-0020 (FR-005/FR-006/FR-007) — 1 avaliador por grupo de 3, 2 por grupo de 4-5,
 * priorizando completar o segundo avaliador dos grupos maiores antes de qualquer outra coisa.
 * Host NUNCA entra no pool — é alocado à sala (`deriveRoomCapacity`), não ao grupo. Substitui
 * o balanceamento "por menor grupo" da FEAT-0012: a semântica mudou de "equilibrar igual" pra
 * "priorizar completar os grupos maiores primeiro" (research.md, Decisão 3).
 */
function distributeEvaluatorsByTarget(members: PresentMemberRow[], candidateSlots: string[][]): string[][] {
    const evaluatorSlots: string[][] = candidateSlots.map(() => []);
    const nonEmptyIndexes = candidateSlots.map((_, index) => index).filter((index) => candidateSlots[index].length > 0);

    if (nonEmptyIndexes.length === 0) return evaluatorSlots;

    const pool = members.filter((m) => m.role === "avaliador");
    if (pool.length === 0) return evaluatorSlots;

    let cursor = 0;

    // Passada 1: garante 1 avaliador em cada grupo não-vazio, em ordem de índice.
    for (const index of nonEmptyIndexes) {
        if (cursor >= pool.length) return evaluatorSlots;
        evaluatorSlots[index].push(pool[cursor]!.user_id);
        cursor += 1;
    }

    // Passada 2: completa o 2º avaliador só dos grupos com alvo 2 (4-5 candidatos), em ordem
    // de índice — para assim que os avaliadores presentes acabarem.
    for (const index of nonEmptyIndexes) {
        if (cursor >= pool.length) return evaluatorSlots;
        if (deriveEvaluatorTargetForGroupSize(candidateSlots[index]!.length) === 2) {
            evaluatorSlots[index].push(pool[cursor]!.user_id);
            cursor += 1;
        }
    }

    return evaluatorSlots;
}
