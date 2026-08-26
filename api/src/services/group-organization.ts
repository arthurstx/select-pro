import { deriveRoomCapacity, type RoomRow } from "shared";

import type { GroupToInsert, PresentCandidateRow, PresentMemberRow } from "../repositories/group.repository";

/**
 * Algoritmo de organização automática de grupos (FEAT-0012, research.md D-tech4/D-tech5).
 * Função pura — sem I/O, sem D1 — recebe as "fotos" já carregadas pelo repository e devolve
 * a estrutura de grupos a persistir. Testada isoladamente em `group-organization.test.ts`.
 *
 * Referência de tamanho de grupo online quando não há sala cadastrada — ponto médio da
 * primeira faixa de D5 (`deriveRoomCapacity`). Só usado como último recurso; ver
 * `averageRoomGroupSize`.
 */
const FALLBACK_ONLINE_GROUP_SIZE = 25;

export interface OrganizeInput {
    candidates: PresentCandidateRow[];
    rooms: RoomRow[];
    presentMembers: PresentMemberRow[];
}

export interface OrganizeOutput {
    groups: GroupToInsert[];
    unallocatedCandidateCount: number;
}

export function organizeGroups(input: OrganizeInput): OrganizeOutput {
    const rooms = [...input.rooms].sort((a, b) => a.name.localeCompare(b.name));
    const presencial = input.candidates.filter((c) => c.attendance === "presencial");
    const online = input.candidates.filter((c) => c.attendance === "online");

    const presencialResult = organizePresencial(presencial, rooms, input.presentMembers);
    const onlineResult = organizeOnline(online, rooms);

    return {
        groups: [...presencialResult.groups, ...onlineResult.groups],
        unallocatedCandidateCount: presencialResult.unallocatedCandidateCount,
    };
}

// ------------------------------------------------------------
// Presencial — FR-004/FR-005/FR-006/FR-013
// ------------------------------------------------------------

function organizePresencial(
    candidates: PresentCandidateRow[],
    rooms: RoomRow[],
    presentMembers: PresentMemberRow[],
): OrganizeOutput {
    if (candidates.length === 0) {
        return { groups: [], unallocatedCandidateCount: 0 };
    }

    // Acumula salas (já em ordem de nome) até cobrir o total de presentes, ou esgotar
    // (FR-012/013 tratam "sem sala nenhuma"/"capacidade insuficiente" fora daqui, no service).
    const usedRooms: RoomRow[] = [];
    let capacity = 0;
    for (const room of rooms) {
        if (capacity >= candidates.length) break;
        usedRooms.push(room);
        capacity += room.size;
    }

    if (usedRooms.length === 0) {
        return { groups: [], unallocatedCandidateCount: candidates.length };
    }

    // Slot → sala: cada sala reserva `maxGroups` slots consecutivos.
    const slotRoomIds: string[] = [];
    for (const room of usedRooms) {
        const { maxGroups } = deriveRoomCapacity(room.size);
        for (let i = 0; i < maxGroups; i++) slotRoomIds.push(room.id);
    }

    const unallocatedCandidateCount = Math.max(0, candidates.length - capacity);
    // `candidates` já vem ordenado por `checked_in_at ASC` do repository — quem chegou
    // primeiro é alocado primeiro quando falta capacidade (FR-013).
    const allocatable = candidates.slice(0, capacity);

    const slots = distributeByGender(allocatable, slotRoomIds.length);

    const evaluatorSlots = distributeEvaluatorsAcrossNonEmptySlots(presentMembers, slots);

    const roomsById = new Map(rooms.map((r) => [r.id, r] as const));
    const groupsByRoom = new Map<string, number>();
    const groups: GroupToInsert[] = [];

    slots.forEach((candidateIds, index) => {
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
            evaluatorUserIds: evaluatorSlots[index] ?? [],
        });
    });

    return { groups, unallocatedCandidateCount };
}

// ------------------------------------------------------------
// Online — FR-003/FR-005/FR-007 (US3)
// ------------------------------------------------------------

function organizeOnline(candidates: PresentCandidateRow[], allRooms: RoomRow[]): { groups: GroupToInsert[] } {
    if (candidates.length === 0) {
        return { groups: [] };
    }

    const avgGroupSize = averageRoomGroupSize(allRooms);
    const targetGroups = Math.max(1, Math.ceil(candidates.length / avgGroupSize));

    const slots = distributeByGender(candidates, targetGroups);

    const groups: GroupToInsert[] = [];
    slots.forEach((candidateIds, index) => {
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

    return { groups };
}

/**
 * data-model.md, Assumptions: tamanho médio de grupo entre as salas cadastradas (média de
 * `size / maxGroups` de cada uma), ou `FALLBACK_ONLINE_GROUP_SIZE` sem nenhuma sala.
 */
function averageRoomGroupSize(rooms: RoomRow[]): number {
    if (rooms.length === 0) return FALLBACK_ONLINE_GROUP_SIZE;

    const total = rooms.reduce((sum, room) => sum + room.size / deriveRoomCapacity(room.size).maxGroups, 0);
    return Math.max(1, Math.round(total / rooms.length));
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

/** Mesma técnica de balanceamento por menor grupo, aplicada aos avaliadores/hosts (FR-006). */
function distributeEvaluatorsAcrossNonEmptySlots(members: PresentMemberRow[], candidateSlots: string[][]): string[][] {
    const evaluatorSlots: string[][] = candidateSlots.map(() => []);
    const eligibleSlotIndexes = candidateSlots.map((_, index) => index).filter((index) => candidateSlots[index].length > 0);

    if (eligibleSlotIndexes.length === 0) return evaluatorSlots;

    for (const member of members) {
        const smallest = eligibleSlotIndexes.reduce((min, index) =>
            evaluatorSlots[index].length < evaluatorSlots[min].length ? index : min,
        );
        evaluatorSlots[smallest].push(member.user_id);
    }

    return evaluatorSlots;
}
