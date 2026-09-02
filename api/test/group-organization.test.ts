import { describe, expect, it } from "vitest";

import { distributeByGender, organizeOnlineGroups, organizePresencialGroups } from "../src/services/group-organization";
import type { PresentCandidateRow, PresentMemberRow } from "../src/repositories/group.repository";

// Testes unitários do algoritmo puro (research.md D-tech4/D-tech5) — sem D1, sem I/O.
// A cobertura com D1 real (fixture completo, edição corrente) fica em
// group.service.test.ts. FEAT-0018: presencial e online são funções independentes, sem
// pool combinado de avaliadores — cada uma é chamada por uma operação de organização
// separada (dias diferentes, pessoas diferentes).

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
    return { user_id: id, name: `Membro ${id}`, role, memberStatus: "active" };
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

describe("organizePresencialGroups (D5 via deriveRoomCapacity)", () => {
    it("uma sala de até 50: 2 grupos (D5)", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = Array.from({ length: 10 }, (_, i) => candidate({ id: `c${i}`, gender: "masculino" }));

        const result = organizePresencialGroups(candidates, [sala], []);

        expect(result.groups).toHaveLength(2);
        expect(result.groups.every((g) => g.roomId === sala.id)).toBe(true);
        expect(result.unallocatedCandidateCount).toBe(0);
    });

    it("mais candidatos presenciais do que a capacidade das salas: aloca o que couber, reporta o resto (FR-013)", () => {
        const sala = room({ name: "Sala 1", size: 2 });
        const candidates = Array.from({ length: 5 }, (_, i) => candidate({ id: `c${i}`, gender: "masculino" }));

        const result = organizePresencialGroups(candidates, [sala], []);

        const allocated = result.groups.flatMap((g) => g.candidateIds);
        expect(allocated).toHaveLength(2);
        expect(result.unallocatedCandidateCount).toBe(3);
        // FR-013: quem chegou primeiro (início do array, já ordenado por checked_in_at) é alocado primeiro.
        expect(allocated).toEqual(["c0", "c1"]);
    });

    it("sem sala nenhuma: todos ficam não alocados, nenhum grupo formado", () => {
        const candidates = [candidate({ id: "c0" })];

        const result = organizePresencialGroups(candidates, [], []);

        expect(result.groups).toHaveLength(0);
        expect(result.unallocatedCandidateCount).toBe(1);
    });

    it("menos candidatos do que as salas comportam: usa só o necessário, sem grupo vazio", () => {
        const sala1 = room({ name: "Sala 1", size: 50 });
        const sala2 = room({ name: "Sala 2", size: 50 });
        const candidates = [candidate({ id: "c0" })];

        const result = organizePresencialGroups(candidates, [sala1, sala2], []);

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].roomId).toBe(sala1.id);
    });

    it("FEAT-0020/FEAT-0021 — avaliador conta pro alvo do grupo, host vira responsável da sala (não do grupo)", () => {
        const sala = room({ name: "Sala 1", size: 50 }); // D5: 1 host, maxGroups=2
        const candidates = Array.from({ length: 4 }, (_, i) => candidate({ id: `c${i}` }));
        const members = [member("e1"), member("e2", "host")];

        const result = organizePresencialGroups(candidates, [sala], members);

        // 4 candidatos -> 1 grupo único (derivePresencialGroupCount), alvo 2 avaliadores —
        // só 1 avaliador presente, então evaluatorSlots tem só e1; e2 (host) some daí, mas
        // aparece no grupo como host da sala (FEAT-0021).
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]?.evaluatorUserIds).toEqual(["e1", "e2"]);
    });

    it("FEAT-0020/FEAT-0022 (FR-003) — grupos formados têm sempre entre 5 e 7 candidatos", () => {
        const sala = room({ name: "Sala 1", size: 100 }); // maxGroups=4 (D5, >80)
        const candidates = Array.from({ length: 13 }, (_, i) => candidate({ id: `c${i}` }));

        const result = organizePresencialGroups(candidates, [sala], []);

        const sizes = result.groups.map((g) => g.candidateIds.length);
        expect(sizes.every((size) => size >= 5 && size <= 7)).toBe(true);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(13);
    });

    it("FEAT-0020/FEAT-0022 (FR-004) — capacidade insuficiente ainda reporta unallocatedCandidateCount corretamente", () => {
        // Sala de 50 (D5: maxGroups=2) comporta no máximo 2*7=14 candidatos em grupos válidos,
        // mesmo tendo "espaço físico" pra mais — capacidade real é min(size, maxGroups*7).
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = Array.from({ length: 15 }, (_, i) => candidate({ id: `c${i}` }));

        const result = organizePresencialGroups(candidates, [sala], []);

        const allocated = result.groups.flatMap((g) => g.candidateIds);
        expect(allocated).toHaveLength(14);
        expect(result.unallocatedCandidateCount).toBe(1);
    });

    it("FEAT-0020/FEAT-0022 (FR-005/FR-006) — com avaliador de sobra só pro 2º de UM grupo, todo mundo já tem 1 antes de alguém ter 2", () => {
        const sala = room({ name: "Sala 1", size: 100 }); // maxGroups=4
        // 17 candidatos -> 3 grupos (5-7 cada, research.md Decisão 2 ajustada): [6, 6, 5]
        // candidatos — os dois de 6 pedem 2 avaliadores (deriveEvaluatorTargetForGroupSize), o
        // de 5 (o ideal) pede só 1.
        const candidates = Array.from({ length: 17 }, (_, i) => candidate({ id: `c${i}` }));
        // 3 avaliadores cobrem o "1 por grupo" de todo mundo; o 4º é o único 2º avaliador possível.
        const members = Array.from({ length: 4 }, (_, i) => member(`e${i}`));

        const result = organizePresencialGroups(candidates, [sala], members);

        const counts = result.groups.map((g) => g.evaluatorUserIds.length);
        // Todo grupo já tem pelo menos 1 (pass 1 completa antes de qualquer 2º — pass 2).
        expect(counts.every((c) => c >= 1)).toBe(true);
        // Só um grupo tem 2 (o 4º avaliador, único "extra") — nunca um grupo com 2 enquanto
        // outro (de tamanho igual, 6) ainda está com 1.
        expect(counts.filter((c) => c === 2)).toHaveLength(1);
        expect(counts.filter((c) => c === 0)).toHaveLength(0);
    });

    it("FEAT-0020/FEAT-0022 (FR-005) — com avaliadores suficientes, grupo de 5 (ideal) tem exatamente 1 e grupo de 6-7 tem exatamente 2", () => {
        const sala = room({ name: "Sala 1", size: 100 });
        const candidates = Array.from({ length: 13 }, (_, i) => candidate({ id: `c${i}` }));
        const members = Array.from({ length: 6 }, (_, i) => member(`e${i}`)); // avaliadores de sobra

        const result = organizePresencialGroups(candidates, [sala], members);

        for (const group of result.groups) {
            const expected = group.candidateIds.length >= 6 ? 2 : 1;
            expect(group.evaluatorUserIds.length).toBe(expected);
        }
    });

    it("FEAT-0021 — host da sala aparece em TODOS os grupos daquela sala", () => {
        const sala = room({ name: "Sala 1", size: 100 }); // D5: 2 hosts, maxGroups=4
        const candidates = Array.from({ length: 13 }, (_, i) => candidate({ id: `c${i}` })); // -> 2 grupos (5-7 cada)
        const members = [member("h1", "host")];

        const result = organizePresencialGroups(candidates, [sala], members);

        expect(result.groups).toHaveLength(2);
        for (const group of result.groups) {
            expect(group.evaluatorUserIds).toContain("h1");
        }
    });

    it("FEAT-0021 — sala com D5 de 2 hosts recebe até 2, nunca mais que isso", () => {
        const sala = room({ name: "Sala 1", size: 100 }); // D5: 2 hosts
        const candidates = Array.from({ length: 13 }, (_, i) => candidate({ id: `c${i}` }));
        const members = [member("h1", "host"), member("h2", "host"), member("h3", "host")];

        const result = organizePresencialGroups(candidates, [sala], members);

        for (const group of result.groups) {
            const hostsInGroup = group.evaluatorUserIds.filter((id) => id === "h1" || id === "h2" || id === "h3");
            expect(hostsInGroup).toHaveLength(2);
            expect(hostsInGroup.sort()).toEqual(["h1", "h2"]); // os 2 primeiros da lista, h3 sobra
        }
    });

    it("FEAT-0021 — hosts insuficientes: sala fica com menos hosts que o ideal, sem erro", () => {
        const sala = room({ name: "Sala 1", size: 100 }); // D5: 2 hosts
        const candidates = Array.from({ length: 13 }, (_, i) => candidate({ id: `c${i}` }));
        const members = [member("h1", "host")]; // só 1, D5 pede 2

        const result = organizePresencialGroups(candidates, [sala], members);

        for (const group of result.groups) {
            expect(group.evaluatorUserIds).toContain("h1");
            expect(group.evaluatorUserIds.filter((id) => id === "h1")).toHaveLength(1);
        }
    });

    it("FEAT-0021 — segunda sala usada só recebe host depois da primeira estar completa", () => {
        const sala1 = room({ id: "sala-a", name: "Sala A", size: 50 }); // D5: 1 host, maxGroups=2
        const sala2 = room({ id: "sala-b", name: "Sala B", size: 50 }); // D5: 1 host
        // Candidatos suficientes pra estourar a capacidade da sala1 (min(50,2*5)=10) e usar a sala2.
        const candidates = Array.from({ length: 15 }, (_, i) => candidate({ id: `c${i}` }));
        const members = [member("h1", "host"), member("h2", "host")];

        const result = organizePresencialGroups(candidates, [sala1, sala2], members);

        const groupsSala1 = result.groups.filter((g) => g.roomId === "sala-a");
        const groupsSala2 = result.groups.filter((g) => g.roomId === "sala-b");
        expect(groupsSala1.length).toBeGreaterThan(0);
        expect(groupsSala2.length).toBeGreaterThan(0);
        for (const g of groupsSala1) expect(g.evaluatorUserIds).toContain("h1");
        for (const g of groupsSala2) expect(g.evaluatorUserIds).toContain("h2");
    });

    it("sem nenhum avaliador presente: grupos são formados mesmo assim, sem avaliador alocado", () => {
        const sala = room({ name: "Sala 1", size: 50 });
        const candidates = [candidate({ id: "c0" })];

        const result = organizePresencialGroups(candidates, [sala], []);

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].evaluatorUserIds).toEqual([]);
    });

    it("sem candidato nenhum: nenhum grupo, nada não alocado", () => {
        const result = organizePresencialGroups([], [], []);

        expect(result.groups).toHaveLength(0);
        expect(result.unallocatedCandidateCount).toBe(0);
    });
});

describe("organizeOnlineGroups (FEAT-0022 — só candidatos, D1, sem sala/avaliador/host, faixa ideal via derivePresencialGroupCount)", () => {
    it("forma grupo(s) só com candidatos, sem sala e sem avaliador — mesmo passando membros presentes em outro lugar", () => {
        const candidates = [candidate({ id: "o1", attendance: "online" })];

        const groups = organizeOnlineGroups(candidates);

        expect(groups).toHaveLength(1);
        expect(groups[0].modality).toBe("online");
        expect(groups[0].roomId).toBeNull();
        expect(groups[0].evaluatorUserIds).toEqual([]);
    });

    it("sobra ímpar de mulheres também vira trio (D1 se aplica ao online)", () => {
        const women = ["w1", "w2", "w3"].map((id) => candidate({ id, gender: "feminino", attendance: "online" as const }));

        const groups = organizeOnlineGroups(women);

        expect(groups.filter((g) => g.candidateIds.length === 1)).toHaveLength(0);
    });

    it("sem limite de capacidade — todos os candidatos presentes são alocados a algum grupo", () => {
        const candidates = Array.from({ length: 100 }, (_, i) => candidate({ id: `o${i}`, attendance: "online" as const }));

        const groups = organizeOnlineGroups(candidates);

        expect(groups.flatMap((g) => g.candidateIds)).toHaveLength(100);
    });

    it("sem candidato nenhum: nenhum grupo formado", () => {
        const groups = organizeOnlineGroups([]);

        expect(groups).toHaveLength(0);
    });

    it("1 ou 2 candidatos: forma o único grupo possível, mesmo abaixo do mínimo aceitável (FR-014, edge case)", () => {
        expect(organizeOnlineGroups([candidate({ id: "o1", attendance: "online" })])).toHaveLength(1);
        const twoCandidates = ["o1", "o2"].map((id) => candidate({ id, attendance: "online" as const }));
        const groups = organizeOnlineGroups(twoCandidates);
        expect(groups).toHaveLength(1);
        expect(groups[0].candidateIds).toHaveLength(2);
    });

    it("10 ou 15 candidatos: grupos de exatamente 5 (o ideal), FR-014", () => {
        expect(organizeOnlineGroups(Array.from({ length: 10 }, (_, i) => candidate({ id: `o10-${i}`, attendance: "online" as const })))).toHaveLength(2);
        const fifteen = Array.from({ length: 15 }, (_, i) => candidate({ id: `o15-${i}`, attendance: "online" as const }));
        const groups = organizeOnlineGroups(fifteen);
        expect(groups).toHaveLength(3);
        expect(groups.every((g) => g.candidateIds.length === 5)).toBe(true);
    });

    it("8 ou 9 candidatos: gap do intervalo 5-7 — 2 grupos abaixo do ideal, nunca 1 grupo acima do teto de 7 (FR-014)", () => {
        for (const total of [8, 9]) {
            const candidates = Array.from({ length: total }, (_, i) => candidate({ id: `o${total}-${i}`, attendance: "online" as const }));
            const groups = organizeOnlineGroups(candidates);
            expect(groups).toHaveLength(2);
            for (const g of groups) expect(g.candidateIds.length).toBeLessThanOrEqual(7);
        }
    });

    it("20 candidatos: 3 grupos entre 5 e 7 quando a divisão perfeita (5+5+5=15) não é possível (FR-014)", () => {
        const candidates = Array.from({ length: 20 }, (_, i) => candidate({ id: `o${i}`, attendance: "online" as const }));

        const groups = organizeOnlineGroups(candidates);

        expect(groups).toHaveLength(3);
        expect(groups.every((g) => g.candidateIds.length >= 5 && g.candidateIds.length <= 7)).toBe(true);
        expect(groups.flatMap((g) => g.candidateIds)).toHaveLength(20);
    });
});
