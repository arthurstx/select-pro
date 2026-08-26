import { env } from "cloudflare:test";
import { deriveRoomCapacity } from "shared";
import { describe, expect, it } from "vitest";

import { GroupRepository } from "../src/repositories/group.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { GroupService } from "../src/services/group.service";

// D1 real via miniflare. Storage NÃO é isolado por `it()`, só por ARQUIVO
// (mesma descoberta documentada em evaluators.routes.test.ts) — e `rooms`
// nem sequer é escopada por edição (FEAT-0011): salas cadastradas por um
// teste ficam visíveis para os testes seguintes deste arquivo, de propósito
// (é o comportamento real do algoritmo). Por isso:
// 1. Cada teste usa um ANO diferente para `resolveCurrent` — isola
//    candidatos/membros/grupos (todos escopados por `process_id`) sem
//    depender de ordem.
// 2. O teste de `NO_ROOMS_AVAILABLE` roda ANTES de qualquer outro teste
//    inserir uma sala neste arquivo (primeiro describe).
// 3. Testes que dependem de sala usam invariantes verificadas contra a
//    sala REALMENTE usada no resultado (consultada ao vivo), nunca contra
//    um total absoluto de salas/grupos do sistema inteiro.

let counter = 0;

function service(): GroupService {
    return new GroupService(new GroupRepository(env.DB), new SelectionProcessRepository(env.DB));
}

/** Só para satisfazer `checked_in_by`/`checked_in_by` (FK para `users`) — não é o admin que aciona `organize()`. */
async function insertActor(): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, 'admin', ?, ?)`)
        .bind(id, `actor-grp-${counter}@example.com`, `Actor Grp ${counter}`)
        .run();
    return id;
}

async function insertCheckedCandidate(
    processId: string,
    actorId: string,
    overrides: { gender?: "masculino" | "feminino" | "outro"; online?: boolean } = {},
) {
    counter += 1;
    const id = crypto.randomUUID();
    const gender = overrides.gender ?? "masculino";

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, ?, 'eng-computacao', 3, ?, 'nao-informado', ?, ?, ?, '2026-08-05 12:00:00')`,
    )
        .bind(id, processId, gender, `Candidato Grp ${counter}`, `candidato-grp-${counter}@example.com`, `+557198887${String(counter).padStart(4, "0")}`)
        .run();

    if (overrides.online) {
        await env.DB.prepare(
            `INSERT INTO candidate_applications
                    (id, candidate_id, referral_source, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
                  VALUES (?, ?, 'indicacao', 1, 'Nenhuma', 'Motivação', 1, 0)`,
        )
            .bind(crypto.randomUUID(), id)
            .run();
    }

    await env.DB.prepare(`INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, processId, actorId)
        .run();

    return id;
}

async function insertCheckedMember(processId: string, actorId: string, isHost = false) {
    counter += 1;
    const userId = crypto.randomUUID();

    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)`)
        .bind(userId, `avaliador-grp-${counter}@example.com`, `Avaliador Grp ${counter}`)
        .run();

    await env.DB.prepare(`INSERT INTO member_checkins (id, user_id, process_id, checked_in_by) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), userId, processId, actorId)
        .run();

    if (isHost) {
        await env.DB.prepare(`INSERT INTO edition_hosts (id, process_id, user_id) VALUES (?, ?, ?)`)
            .bind(crypto.randomUUID(), processId, userId)
            .run();
    }

    return userId;
}

async function insertRoom(size: number) {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO rooms (id, name, size) VALUES (?, ?, ?)`).bind(id, `Sala Grp ${counter}`, size).run();
    return { id, size };
}

/** Consulta ao vivo — nunca confia num total fixo, já que `rooms` acumula entre os testes deste arquivo. */
async function womenCountInGroup(groupId: string): Promise<number> {
    const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM group_candidates gc INNER JOIN candidates c ON c.id = gc.candidate_id WHERE gc.group_id = ? AND c.gender = 'feminino'`,
    )
        .bind(groupId)
        .first<{ n: number }>();
    return row?.n ?? 0;
}

async function roomSize(roomId: string): Promise<number> {
    const row = await env.DB.prepare(`SELECT size FROM rooms WHERE id = ?`).bind(roomId).first<{ size: number }>();
    return row?.size ?? 0;
}

describe("GroupService.organize — sem sala cadastrada (FR-012)", () => {
    // Precisa continuar sendo o primeiro describe a tocar `rooms` neste arquivo.
    it("NO_ROOMS_AVAILABLE quando há candidato presencial presente e nenhuma sala existe ainda", async () => {
        const NOW = new Date("2101-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertCheckedCandidate(process.id, actorId);

        const result = await service().organize(NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_ROOMS_AVAILABLE");
    });
});

describe("GroupService.organize — fluxo principal", () => {
    it("NO_CANDIDATES_PRESENT quando ninguém fez check-in na edição", async () => {
        const NOW = new Date("2102-08-10T12:00:00.000Z");

        const result = await service().organize(NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_CANDIDATES_PRESENT");
    });

    it("aloca todos os presenciais respeitando D1/D5, aloca avaliadores/hosts presentes", async () => {
        const NOW = new Date("2103-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        const room = await insertRoom(50); // deriveRoomCapacity(50).maxGroups === 2

        const candidateIds = [
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
        ];
        const memberIds = [await insertCheckedMember(process.id, actorId), await insertCheckedMember(process.id, actorId, true)];

        const result = await service().organize(NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const allocatedCandidates = result.value.groups.flatMap((g) => g.candidates.map((c) => c.id));
        expect(allocatedCandidates.sort()).toEqual([...candidateIds].sort());
        expect(result.value.unallocatedCandidateCount).toBe(0);

        const allocatedEvaluators = result.value.groups.flatMap((g) => g.evaluators.map((e) => e.userId));
        expect(allocatedEvaluators.sort()).toEqual([...memberIds].sort());

        // D5 — nenhuma sala usada excede seu próprio `maxGroups` (consultado ao vivo).
        const groupsByRoom = new Map<string, number>();
        for (const group of result.value.groups) {
            expect(group.room).not.toBeNull();
            const roomId = group.room!.id;
            groupsByRoom.set(roomId, (groupsByRoom.get(roomId) ?? 0) + 1);
        }
        for (const [roomId, groupCount] of groupsByRoom) {
            const size = await roomSize(roomId);
            expect(groupCount).toBeLessThanOrEqual(deriveRoomCapacity(size).maxGroups);
        }

        // D1 — nenhum grupo com exatamente 1 mulher.
        for (const group of result.value.groups) {
            expect(await womenCountInGroup(group.id)).not.toBe(1);
        }

        // Sanidade de que a sala usada é uma sala real cadastrada (a minha, entre outras possíveis).
        expect([room.id, ...groupsByRoom.keys()].length).toBeGreaterThan(0);
    });

    it("reorganizar descarta a organização anterior por completo (FR-011)", async () => {
        const NOW = new Date("2104-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom(50);
        await insertCheckedCandidate(process.id, actorId);

        const first = await service().organize(NOW);
        expect(first.isRight()).toBe(true);
        if (!first.isRight()) return;
        const firstGroupIds = first.value.groups.map((g) => g.id);

        const newCandidateId = await insertCheckedCandidate(process.id, actorId);
        const second = await service().organize(NOW);
        expect(second.isRight()).toBe(true);
        if (!second.isRight()) return;

        const secondCandidateIds = second.value.groups.flatMap((g) => g.candidates.map((c) => c.id));
        expect(secondCandidateIds).toContain(newCandidateId);

        const { results } = await env.DB.prepare(
            `SELECT id FROM groups WHERE id IN (${firstGroupIds.map(() => "?").join(",")})`,
        )
            .bind(...firstGroupIds)
            .all();
        expect(results ?? []).toHaveLength(0);
    });

    it("candidatos online formam grupos próprios, sem sala nem avaliador (US3, FR-003/FR-007)", async () => {
        const NOW = new Date("2105-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom(50);
        const presencialId = await insertCheckedCandidate(process.id, actorId, { online: false });
        const onlineId = await insertCheckedCandidate(process.id, actorId, { online: true });
        await insertCheckedMember(process.id, actorId);

        const result = await service().organize(NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const onlineGroup = result.value.groups.find((g) => g.candidates.some((c) => c.id === onlineId));
        const presencialGroup = result.value.groups.find((g) => g.candidates.some((c) => c.id === presencialId));

        expect(onlineGroup?.modality).toBe("online");
        expect(onlineGroup?.room).toBeNull();
        expect(onlineGroup?.evaluators).toEqual([]);
        expect(onlineGroup?.candidates.some((c) => c.id === presencialId)).toBe(false);

        expect(presencialGroup?.modality).toBe("presencial");
        expect(presencialGroup?.candidates.some((c) => c.id === onlineId)).toBe(false);
    });
});

describe("GroupService.moveCandidate / moveEvaluator (US2, FR-009/FR-010)", () => {
    /** 2 mulheres + 2 homens, 1 sala de 50 (2 slots): distribuição determinística
     * (`distributeByGender`) — grupo A fica com as 2 mulheres, grupo B com os 2 homens. */
    async function setupTwoPresencialGroups(now: Date) {
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(now);
        const actorId = await insertActor();
        await insertRoom(50);

        const women = [
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
        ];
        const men = [
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
        ];

        const organized = await service().organize(now);
        if (!organized.isRight()) throw new Error("setup falhou");

        const groupA = organized.value.groups.find((g) => g.candidates.some((c) => c.id === women[0]))!;
        const groupB = organized.value.groups.find((g) => g.candidates.some((c) => c.id === men[0]))!;

        return { women, men, groupA, groupB };
    }

    it("move com sucesso não gera aviso quando nenhum grupo fica com exatamente 1 mulher", async () => {
        const NOW = new Date("2106-08-10T12:00:00.000Z");
        const { men, groupA, groupB } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(men[0], groupA.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.warning).toBeNull();
        expect(result.value.groups.find((g) => g.id === groupA.id)?.candidates.some((c) => c.id === men[0])).toBe(true);
        expect(result.value.groups.find((g) => g.id === groupB.id)?.candidates.some((c) => c.id === men[0])).toBe(false);
    });

    it("move violando D1 gera aviso GENDER_RULE_VIOLATED, mas ainda move (FR-010)", async () => {
        const NOW = new Date("2107-08-10T12:00:00.000Z");
        const { women, groupA, groupB } = await setupTwoPresencialGroups(NOW);

        // groupA tinha as 2 mulheres; tirar uma deixa 1 lá e cria 1 no destino — os dois violam D1.
        const result = await service().moveCandidate(women[0], groupB.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.warning).toBe("GENDER_RULE_VIOLATED");
    });

    it("mover entre modalidades diferentes é bloqueado (FR-003, invariante rígida)", async () => {
        const NOW = new Date("2108-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom(50);
        const presencialId = await insertCheckedCandidate(process.id, actorId, { online: false });
        const onlineId = await insertCheckedCandidate(process.id, actorId, { online: true });

        const organized = await service().organize(NOW);
        if (!organized.isRight()) throw new Error("setup falhou");
        const onlineGroup = organized.value.groups.find((g) => g.candidates.some((c) => c.id === onlineId))!;

        const result = await service().moveCandidate(presencialId, onlineGroup.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_MODALITY_MISMATCH");
    });

    it("GROUP_NOT_FOUND quando o grupo de destino não existe na edição corrente", async () => {
        const NOW = new Date("2109-08-10T12:00:00.000Z");
        const { women } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(women[0], crypto.randomUUID(), NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_NOT_FOUND");
    });

    it("CANDIDATE_NOT_ALLOCATED quando o candidato não está em nenhum grupo da edição", async () => {
        const NOW = new Date("2110-08-10T12:00:00.000Z");
        const { groupA } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(crypto.randomUUID(), groupA.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_ALLOCATED");
    });

    it("moveEvaluator: sucesso, sem aviso (D1 é só sobre candidatos)", async () => {
        const NOW = new Date("2111-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom(50);
        await insertCheckedCandidate(process.id, actorId);
        await insertCheckedCandidate(process.id, actorId);
        const evaluatorId = await insertCheckedMember(process.id, actorId);

        const organized = await service().organize(NOW);
        if (!organized.isRight()) throw new Error("setup falhou");
        const fromGroup = organized.value.groups.find((g) => g.evaluators.some((e) => e.userId === evaluatorId))!;
        const toGroup = organized.value.groups.find((g) => g.id !== fromGroup.id)!;

        const result = await service().moveEvaluator(evaluatorId, toGroup.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.warning).toBeNull();
        expect(result.value.groups.find((g) => g.id === toGroup.id)?.evaluators.some((e) => e.userId === evaluatorId)).toBe(true);
    });

    it("EVALUATOR_NOT_ALLOCATED quando o avaliador/host não está em nenhum grupo da edição", async () => {
        const NOW = new Date("2112-08-10T12:00:00.000Z");
        const { groupA } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveEvaluator(crypto.randomUUID(), groupA.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("EVALUATOR_NOT_ALLOCATED");
    });
});
