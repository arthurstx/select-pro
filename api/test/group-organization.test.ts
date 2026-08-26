import { describe, expect, it } from "vitest";

import { distributeByGender, organizeGroups } from "../src/services/group-organization";
import type { PresentCandidateRow, PresentMemberRow } from "../src/repositories/group.repository";

// Testes unitários do algoritmo puro (research.md D-tech4/D-tech5) — sem D1, sem I/O.
// A cobertura com D1 real (fixture completo, edição corrente) fica em
// group.service.test.ts.

function candidate(overrides: Partial<PresentCandidateRow> & { id: string }): PresentCandidateRow {
    return {
        name: `Candidato ${overrides.id}`,
        gender: "masculino",
        attendance: "presencial",
        ...overrides,
    };
}

function room(overrides: { id?: string; name: string; size: number }) {
    return { id: overrides.id ?? crypto.randomUUID(), name: overrides.name, size: overrides.size };
}

function member(id: string, role: PresentMemberRow["role"] = "avaliador"): PresentMemberRow {
    return { user_id: id, name: `Membro ${id}`, role };
}

describe("distributeByGender (D1 — nunca exatamente 1 mulher por grupo)", () => {
    it("número par de mulheres: 2 por grupo, nunca 1", () => {
        const women = ["w1", "w2", "w3", "w4"].map((id) => candidate({ id, gender: "feminino" }));

        const slots = distributeByGender(women, 2);

        expect(slots.every((slot) => slot.length === 0 || slot.length >= 2)).toBe(true);
        expect(slots.flat()).toHaveLength(4);
    });

    it("sobra ímpar de mulheres vira trio, nunca uma mulher isolada", () => {
        const women = ["w1", "w2", "w3"].map((id) => candidate({ id, gender: "feminino" }));

        const slots = distributeByGender(women, 3);

        // 3 mulheres, 3 slots: um grupo forma trio, os outros ficam sem mulher — nunca 1.
        expect(slots.filter((slot) => slot.length === 1)).toHaveLength(0);
        expect(slots.flat()).toHaveLength(3);
        expect(slots.some((slot) => slot.length === 3)).toBe(true);
    });

    it("único candidato presente, mulher: fica em grupo de 1 (edge case da spec — não há como formar par)", () => {
        const women = [candidate({ id: "w1", gender: "feminino" })];

        const slots = distributeByGender(women, 1);

        expect(slots[0]).toEqual(["w1"]);
    });

    it("preenchimento de não-mulheres balanceia o tamanho final sem alterar a contagem de mulheres", () => {
        const women = ["w1", "w2"].map((id) => candidate({ id, gender: "feminino" }));
        const men = ["m1", "m2", "m3", "m4"].map((id) => candidate({ id, gender: "masculino" }));

        const slots = distributeByGender([...women, ...men], 2);

        const sizes = slots.map((s) => s.length).sort();
        expect(sizes).toEqual([3, 3]);
    });

    it("gender 'outro' entra no mesmo pool de preenchimento que 'masculino' (data-model.md, Assumptions)", () => {
        const candidates = [candidate({ id: "o1", gender: "outro" }), candidate({ id: "m1", gender: "masculino" })];

        const slots = distributeByGender(candidates, 1);

        expect(slots[0].sort()).toEqual(["m1", "o1"]);
    });
});

describe("organizeGroups — distribuição presencial (D5 via deriveRoomCapacity)", () => {
    it("uma sala de até 50: 2 grupos (D5)", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = Array.from({ length: 10 }, (_, i) => candidate({ id: `c${i}`, gender: "masculino" }));

        const result = organizeGroups({ candidates, rooms: [sala], presentMembers: [] });

        expect(result.groups).toHaveLength(2);
        expect(result.groups.every((g) => g.roomId === sala.id)).toBe(true);
        expect(result.unallocatedCandidateCount).toBe(0);
    });

    it("mais candidatos presenciais do que a capacidade das salas: aloca o que couber, reporta o resto (FR-013)", () => {
        const sala = room({ name: "Sala 1", size: 2 });
        const candidates = Array.from({ length: 5 }, (_, i) => candidate({ id: `c${i}`, gender: "masculino" }));

        const result = organizeGroups({ candidates, rooms: [sala], presentMembers: [] });

        const allocated = result.groups.flatMap((g) => g.candidateIds);
        expect(allocated).toHaveLength(2);
        expect(result.unallocatedCandidateCount).toBe(3);
        // FR-013: quem chegou primeiro (início do array, já ordenado por checked_in_at) é alocado primeiro.
        expect(allocated).toEqual(["c0", "c1"]);
    });

    it("sem sala nenhuma: todos os presenciais ficam não alocados, nenhum grupo formado", () => {
        const candidates = [candidate({ id: "c0" })];

        const result = organizeGroups({ candidates, rooms: [], presentMembers: [] });

        expect(result.groups).toHaveLength(0);
        expect(result.unallocatedCandidateCount).toBe(1);
    });

    it("menos candidatos do que as salas comportam: usa só o necessário, sem grupo vazio", () => {
        const sala1 = room({ name: "Sala 1", size: 50 });
        const sala2 = room({ name: "Sala 2", size: 50 });
        const candidates = [candidate({ id: "c0" })];

        const result = organizeGroups({ candidates, rooms: [sala1, sala2], presentMembers: [] });

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].roomId).toBe(sala1.id);
    });

    it("avaliadores/hosts presentes são distribuídos entre os grupos presenciais formados", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = Array.from({ length: 4 }, (_, i) => candidate({ id: `c${i}` }));
        const members = [member("e1"), member("e2", "host")];

        const result = organizeGroups({ candidates, rooms: [sala], presentMembers: members });

        const allocatedEvaluators = result.groups.flatMap((g) => g.evaluatorUserIds);
        expect(allocatedEvaluators.sort()).toEqual(["e1", "e2"]);
    });

    it("sem nenhum avaliador presente: grupos presenciais são formados mesmo assim, sem avaliador alocado", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = [candidate({ id: "c0" })];

        const result = organizeGroups({ candidates, rooms: [sala], presentMembers: [] });

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].evaluatorUserIds).toEqual([]);
    });
});

describe("organizeGroups — separação online/presencial (FR-003, US3)", () => {
    it("nunca mistura modalidade no mesmo grupo", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = [
            candidate({ id: "p1", attendance: "presencial" }),
            candidate({ id: "o1", attendance: "online" }),
        ];

        const result = organizeGroups({ candidates, rooms: [sala], presentMembers: [] });

        expect(result.groups.every((g) => g.candidateIds.every((id) => (id === "p1" ? g.modality === "presencial" : true)))).toBe(
            true,
        );
        const onlineGroup = result.groups.find((g) => g.candidateIds.includes("o1"));
        expect(onlineGroup?.modality).toBe("online");
        expect(onlineGroup?.roomId).toBeNull();
    });

    it("grupos online não têm sala nem avaliador alocado", () => {
        const candidates = [candidate({ id: "o1", attendance: "online" })];
        const members = [member("e1")];

        const result = organizeGroups({ candidates, rooms: [], presentMembers: members });

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].roomId).toBeNull();
        expect(result.groups[0].evaluatorUserIds).toEqual([]);
    });

    it("sobra ímpar de mulheres entre online também vira trio (D1 se aplica aos dois modos)", () => {
        const women = ["w1", "w2", "w3"].map((id) => candidate({ id, gender: "feminino", attendance: "online" as const }));

        const result = organizeGroups({ candidates: women, rooms: [], presentMembers: [] });

        expect(result.groups.filter((g) => g.candidateIds.length === 1)).toHaveLength(0);
    });

    it("candidatos online não contam para unallocatedCandidateCount (sem limite de capacidade)", () => {
        const candidates = Array.from({ length: 100 }, (_, i) => candidate({ id: `o${i}`, attendance: "online" as const }));

        const result = organizeGroups({ candidates, rooms: [], presentMembers: [] });

        expect(result.unallocatedCandidateCount).toBe(0);
        expect(result.groups.flatMap((g) => g.candidateIds)).toHaveLength(100);
    });
});
