import { env } from "cloudflare:test";
import { deriveRoomCapacity, type RoomType } from "shared";
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
//
// FEAT-0018: `organize()` virou `organizePresencial()`/`organizeOnline()` — duas operações
// independentes. Testes que precisam das duas modalidades chamam as duas explicitamente.

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

/**
 * FEAT-0021: `group.repository.ts` faz INNER JOIN com `member_profiles` (pra trazer
 * `memberStatus`) — todo avaliador de teste que pode acabar num grupo precisa do perfil,
 * mesma garantia que já vale em produção (FEAT-0003/0008). Espelha `insertEvaluator` de
 * `evaluators.service.test.ts`.
 */
async function insertMemberProfile(userId: string, status: "active" | "inactive" | "trainee" = "active") {
    counter += 1;
    await env.DB.prepare(
        `INSERT INTO member_profiles
                (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            userId,
            crypto.randomUUID(),
            `Perfil Grp ${counter}`,
            `+5571997${String(counter).padStart(6, "0")}`,
            "eng-computacao",
            5,
            "outro",
            "nao-informado",
            status,
            "2026-08-01 00:00:00",
        )
        .run();
}

async function insertCheckedMember(processId: string, actorId: string, isHost = false) {
    counter += 1;
    const userId = crypto.randomUUID();

    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)`)
        .bind(userId, `avaliador-grp-${counter}@example.com`, `Avaliador Grp ${counter}`)
        .run();
    await insertMemberProfile(userId);

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

/** Não precisa de check-in de membro (FEAT-0010) — usado só pra ter um `userId` de avaliador pra entrar num grupo online. */
async function insertEvaluatorUser() {
    counter += 1;
    const userId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)`)
        .bind(userId, `avaliador-online-${counter}@example.com`, `Avaliador Online ${counter}`)
        .run();
    await insertMemberProfile(userId);
    return userId;
}

async function insertRoom(type: RoomType) {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO rooms (id, name, type) VALUES (?, ?, ?)`).bind(id, `Sala Grp ${counter}`, type).run();
    return { id, type };
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

async function roomType(roomId: string): Promise<RoomType> {
    const row = await env.DB.prepare(`SELECT type FROM rooms WHERE id = ?`).bind(roomId).first<{ type: RoomType }>();
    return row?.type ?? "comum";
}

describe("GroupService.organizePresencial — sem sala cadastrada (FR-012)", () => {
    // Precisa continuar sendo o primeiro describe a tocar `rooms` neste arquivo.
    it("NO_ROOMS_AVAILABLE quando há candidato presencial presente e nenhuma sala existe ainda", async () => {
        const NOW = new Date("2101-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertCheckedCandidate(process.id, actorId);

        const result = await service().organizePresencial(undefined, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_ROOMS_AVAILABLE");
    });
});

describe("GroupService.organizePresencial — fluxo principal", () => {
    it("NO_CANDIDATES_PRESENT quando ninguém fez check-in presencial na edição", async () => {
        const NOW = new Date("2102-08-10T12:00:00.000Z");

        const result = await service().organizePresencial(undefined, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_CANDIDATES_PRESENT");
    });

    it("aloca todos os presenciais respeitando D1 e a classificação da sala; avaliador conta pro grupo, host vira responsável da sala (FEAT-0020/FEAT-0021)", async () => {
        const NOW = new Date("2103-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        const room = await insertRoom("comum"); // deriveRoomCapacity("comum").maxGroups === 2

        const candidateIds = [
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }),
        ];
        const avaliadorId = await insertCheckedMember(process.id, actorId);
        const hostId = await insertCheckedMember(process.id, actorId, true);

        const result = await service().organizePresencial(undefined, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;

        const allocatedCandidates = result.value.groups.flatMap((g) => g.candidates.map((c) => c.id));
        expect(allocatedCandidates.sort()).toEqual([...candidateIds].sort());
        expect(result.value.unallocatedCandidateCount).toBe(0);

        // FEAT-0021 — avaliador e host aparecem juntos no grupo (host é o responsável da sala,
        // não conta pro alvo de avaliador-por-grupo, mas aparece na listagem com role="host").
        const allocatedEvaluators = result.value.groups.flatMap((g) => g.evaluators.map((e) => e.userId));
        expect(allocatedEvaluators.sort()).toEqual([avaliadorId, hostId].sort());
        const hostEntry = result.value.groups[0]?.evaluators.find((e) => e.userId === hostId);
        expect(hostEntry?.role).toBe("host");
        const avaliadorEntry = result.value.groups[0]?.evaluators.find((e) => e.userId === avaliadorId);
        expect(avaliadorEntry?.role).toBe("avaliador");

        // FEAT-0020 (FR-003) — 4 candidatos ficam num único grupo (≤5), nunca espalhados.
        expect(result.value.groups).toHaveLength(1);
        expect(result.value.groups[0]?.candidates).toHaveLength(4);

        // D5 — nenhuma sala usada excede seu próprio `maxGroups` (consultado ao vivo).
        const groupsByRoom = new Map<string, number>();
        for (const group of result.value.groups) {
            expect(group.room).not.toBeNull();
            const roomId = group.room!.id;
            groupsByRoom.set(roomId, (groupsByRoom.get(roomId) ?? 0) + 1);
        }
        for (const [roomId, groupCount] of groupsByRoom) {
            const type = await roomType(roomId);
            expect(groupCount).toBeLessThanOrEqual(deriveRoomCapacity(type).maxGroups);
        }

        // D1 — nenhum grupo com exatamente 1 mulher.
        for (const group of result.value.groups) {
            expect(await womenCountInGroup(group.id)).not.toBe(1);
        }

        // Sanidade de que a sala usada é uma sala real cadastrada (a minha, entre outras possíveis).
        expect([room.id, ...groupsByRoom.keys()].length).toBeGreaterThan(0);
    });

    it("reorganizar descarta a organização presencial anterior (FR-011)", async () => {
        const NOW = new Date("2104-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId);

        const first = await service().organizePresencial(undefined, NOW);
        expect(first.isRight()).toBe(true);
        if (!first.isRight()) return;
        const firstGroupIds = first.value.groups.map((g) => g.id);

        const newCandidateId = await insertCheckedCandidate(process.id, actorId);
        const second = await service().organizePresencial(undefined, NOW);
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
});

describe("GroupService.previewPresencial (FEAT-0021)", () => {
    it("não persiste nada — GET equivalente (listGroups) antes/depois do preview fica idêntico", async () => {
        const NOW = new Date("2130-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId);
        await insertCheckedMember(process.id, actorId);

        const before = await new GroupRepository(env.DB).listGroups(process.id);
        const preview = await service().previewPresencial(undefined, NOW);
        const after = await new GroupRepository(env.DB).listGroups(process.id);

        expect(preview.isRight()).toBe(true);
        if (!preview.isRight()) return;
        expect(preview.value.groups.length).toBeGreaterThan(0);
        expect(before).toEqual(after);
        expect(after).toHaveLength(0);
    });

    it("mesmo evaluatorUserIds produz o mesmo resultado de organizePresencial (FR-011)", async () => {
        const NOW = new Date("2131-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId);
        const evaluatorId = await insertCheckedMember(process.id, actorId);
        const otherEvaluatorId = await insertCheckedMember(process.id, actorId);

        const preview = await service().previewPresencial([evaluatorId], NOW);
        expect(preview.isRight()).toBe(true);
        if (!preview.isRight()) return;
        const previewEvaluators = preview.value.groups.flatMap((g) => g.evaluators.map((e) => e.userId));
        expect(previewEvaluators).toEqual([evaluatorId]);
        expect(previewEvaluators).not.toContain(otherEvaluatorId);

        const organized = await service().organizePresencial([evaluatorId], NOW);
        expect(organized.isRight()).toBe(true);
        if (!organized.isRight()) return;
        const organizedEvaluators = organized.value.groups.flatMap((g) => g.evaluators.map((e) => e.userId));
        expect(organizedEvaluators).toEqual(previewEvaluators);
    });

    it("availableEvaluators lista avaliador E host presentes, mesmo quando um dos dois não foi selecionado", async () => {
        const NOW = new Date("2132-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId);
        const evaluatorId = await insertCheckedMember(process.id, actorId);
        const hostId = await insertCheckedMember(process.id, actorId, true);

        const preview = await service().previewPresencial([], NOW); // ninguém selecionado
        expect(preview.isRight()).toBe(true);
        if (!preview.isRight()) return;
        const ids = preview.value.availableEvaluators.map((e) => e.userId).sort();
        expect(ids).toEqual([evaluatorId, hostId].sort());
        expect(preview.value.availableEvaluators.find((e) => e.userId === hostId)?.role).toBe("host");
    });
});

describe("GroupService.clearPresencialOrganization (FEAT-0021)", () => {
    it("remove todos os grupos presenciais; grupos online continuam intactos", async () => {
        const NOW = new Date("2133-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId, { online: false });
        await insertCheckedCandidate(process.id, actorId, { online: true });

        await service().organizePresencial(undefined, NOW);
        const onlineResult = await service().organizeOnline(NOW);
        expect(onlineResult.isRight()).toBe(true);
        if (!onlineResult.isRight()) return;
        const onlineGroupId = onlineResult.value.groups[0]!.id;

        const clearResult = await service().clearPresencialOrganization(NOW);
        expect(clearResult.isRight()).toBe(true);

        const remaining = await new GroupRepository(env.DB).listGroups(process.id);
        expect(remaining.every((g) => g.modality === "online")).toBe(true);
        expect(remaining.some((g) => g.id === onlineGroupId)).toBe(true);
    });

    it("idempotente — limpar sem nenhum grupo presencial organizado não dá erro", async () => {
        const NOW = new Date("2134-08-10T12:00:00.000Z");
        await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);

        const result = await service().clearPresencialOrganization(NOW);

        expect(result.isRight()).toBe(true);
    });
});

describe("GroupService.clearOnlineOrganization (FEAT-0022)", () => {
    it("remove todos os grupos online; grupos presenciais continuam intactos", async () => {
        const NOW = new Date("2138-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId, { online: false });
        await insertCheckedCandidate(process.id, actorId, { online: true });

        const presencialResult = await service().organizePresencial(undefined, NOW);
        expect(presencialResult.isRight()).toBe(true);
        if (!presencialResult.isRight()) return;
        const presencialGroupId = presencialResult.value.groups[0]!.id;

        await service().organizeOnline(NOW);

        const clearResult = await service().clearOnlineOrganization(NOW);
        expect(clearResult.isRight()).toBe(true);

        const remaining = await new GroupRepository(env.DB).listGroups(process.id);
        expect(remaining.every((g) => g.modality === "presencial")).toBe(true);
        expect(remaining.some((g) => g.id === presencialGroupId)).toBe(true);
    });

    it("idempotente — limpar sem nenhum grupo online organizado não dá erro", async () => {
        const NOW = new Date("2139-08-10T12:00:00.000Z");
        await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);

        const result = await service().clearOnlineOrganization(NOW);

        expect(result.isRight()).toBe(true);
    });
});

describe("GroupService.organizeOnline — fluxo principal (FEAT-0018)", () => {
    it("NO_CANDIDATES_PRESENT quando ninguém fez check-in online na edição", async () => {
        const NOW = new Date("2113-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertCheckedCandidate(process.id, actorId, { online: false }); // só presencial

        const result = await service().organizeOnline(NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_CANDIDATES_PRESENT");
    });

    it("forma grupos só com candidatos online, sem sala e sem avaliador, unallocatedCandidateCount sempre 0", async () => {
        const NOW = new Date("2114-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        const onlineId = await insertCheckedCandidate(process.id, actorId, { online: true });

        const result = await service().organizeOnline(NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.unallocatedCandidateCount).toBe(0);
        const group = result.value.groups.find((g) => g.candidates.some((c) => c.id === onlineId));
        expect(group?.modality).toBe("online");
        expect(group?.room).toBeNull();
        expect(group?.evaluators).toEqual([]);
    });

    it("US1 — organizar online não apaga grupos presenciais já organizados, e vice-versa (FR-001, SC-001)", async () => {
        const NOW = new Date("2115-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        const presencialId = await insertCheckedCandidate(process.id, actorId, { online: false });
        const onlineId = await insertCheckedCandidate(process.id, actorId, { online: true });

        const presencialResult = await service().organizePresencial(undefined, NOW);
        expect(presencialResult.isRight()).toBe(true);
        if (!presencialResult.isRight()) return;
        const presencialGroupIds = presencialResult.value.groups.map((g) => g.id);

        const onlineResult = await service().organizeOnline(NOW);
        expect(onlineResult.isRight()).toBe(true);

        const afterOnline = await service().list(NOW);
        expect(afterOnline.isRight()).toBe(true);
        if (!afterOnline.isRight()) return;

        // Os grupos presenciais da primeira organização continuam intactos.
        for (const id of presencialGroupIds) {
            expect(afterOnline.value.some((g) => g.id === id)).toBe(true);
        }
        const presencialGroup = afterOnline.value.find((g) => g.candidates.some((c) => c.id === presencialId));
        const onlineGroup = afterOnline.value.find((g) => g.candidates.some((c) => c.id === onlineId));
        expect(presencialGroup?.modality).toBe("presencial");
        expect(onlineGroup?.modality).toBe("online");

        // Reorganizar só a presencial de novo não mexe no grupo online.
        const onlineGroupIdBefore = onlineGroup!.id;
        await service().organizePresencial(undefined, NOW);
        const afterSecondPresencial = await service().list(NOW);
        expect(afterSecondPresencial.isRight()).toBe(true);
        if (!afterSecondPresencial.isRight()) return;
        expect(afterSecondPresencial.value.some((g) => g.id === onlineGroupIdBefore)).toBe(true);
    });
});

describe("GroupService.previewOnline (FEAT-0022, US4)", () => {
    it("NO_CANDIDATES_PRESENT quando ninguém fez check-in online na edição", async () => {
        const NOW = new Date("2135-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertCheckedCandidate(process.id, actorId, { online: false }); // só presencial

        const result = await service().previewOnline(NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NO_CANDIDATES_PRESENT");
    });

    it("calcula a divisão sem persistir nada — nenhum grupo online real é criado", async () => {
        const NOW = new Date("2136-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        const onlineId = await insertCheckedCandidate(process.id, actorId, { online: true });

        const preview = await service().previewOnline(NOW);

        expect(preview.isRight()).toBe(true);
        if (!preview.isRight()) return;
        const group = preview.value.groups.find((g) => g.candidates.some((c) => c.id === onlineId));
        expect(group?.modality).toBe("online");
        expect(group?.room).toBeNull();
        expect(group?.evaluators).toEqual([]);

        // Nada foi persistido — `list()` não mostra grupo online nenhum pra esta edição.
        const afterPreview = await service().list(NOW);
        expect(afterPreview.isRight()).toBe(true);
        if (!afterPreview.isRight()) return;
        expect(afterPreview.value.some((g) => g.modality === "online")).toBe(false);
    });

    it("resultado da prévia bate com o resultado real de organizeOnline pro mesmo estado (determinístico)", async () => {
        const NOW = new Date("2137-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        for (let i = 0; i < 9; i++) await insertCheckedCandidate(process.id, actorId, { online: true });

        const preview = await service().previewOnline(NOW);
        expect(preview.isRight()).toBe(true);
        if (!preview.isRight()) return;

        const organized = await service().organizeOnline(NOW);
        expect(organized.isRight()).toBe(true);
        if (!organized.isRight()) return;

        expect(preview.value.groups.map((g) => g.candidates.length).sort()).toEqual(
            organized.value.groups.map((g) => g.candidates.length).sort(),
        );
    });
});

describe("GroupService.assignEvaluatorToOnlineGroup / leaveOnlineGroup (US2/US3, FEAT-0018)", () => {
    async function setupOnlineGroup(now: Date) {
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(now);
        const actorId = await insertActor();
        await insertCheckedCandidate(process.id, actorId, { online: true });

        const organized = await service().organizeOnline(now);
        if (!organized.isRight()) throw new Error("setup falhou");

        return { process, group: organized.value.groups[0]! };
    }

    it("primeira entrada: avaliador sem grupo nenhum consegue entrar num grupo online", async () => {
        const NOW = new Date("2116-08-10T12:00:00.000Z");
        const { group } = await setupOnlineGroup(NOW);
        const evaluatorId = await insertEvaluatorUser();

        const result = await service().assignEvaluatorToOnlineGroup(evaluatorId, group.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.evaluators.some((e) => e.userId === evaluatorId)).toBe(true);
    });

    it("entrar em outro grupo online move, não duplica (FR-004)", async () => {
        const NOW = new Date("2117-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        // 2 grupos online distintos: candidatos suficientes pra ultrapassar o tamanho médio de referência.
        await insertCheckedCandidate(process.id, actorId, { online: true });
        for (let i = 0; i < 30; i++) await insertCheckedCandidate(process.id, actorId, { online: true });
        const organized = await service().organizeOnline(NOW);
        if (!organized.isRight()) throw new Error("setup falhou");
        const [groupA, groupB] = organized.value.groups;
        if (!groupA || !groupB) throw new Error("setup precisa de 2 grupos online — ajuste o volume de candidatos");

        const evaluatorId = await insertEvaluatorUser();
        await service().assignEvaluatorToOnlineGroup(evaluatorId, groupA.id, NOW);
        const result = await service().assignEvaluatorToOnlineGroup(evaluatorId, groupB.id, NOW);

        expect(result.isRight()).toBe(true);
        const { results } = await env.DB.prepare(`SELECT group_id FROM group_evaluators WHERE user_id = ?`)
            .bind(evaluatorId)
            .all<{ group_id: string }>();
        expect(results ?? []).toHaveLength(1);
        expect(results?.[0]?.group_id).toBe(groupB.id);
    });

    it("GROUP_MODALITY_MISMATCH ao tentar entrar num grupo presencial por esta via", async () => {
        const NOW = new Date("2118-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        await insertCheckedCandidate(process.id, actorId, { online: false });
        const presencialResult = await service().organizePresencial(undefined, NOW);
        if (!presencialResult.isRight()) throw new Error("setup falhou");
        const presencialGroup = presencialResult.value.groups[0]!;
        const evaluatorId = await insertEvaluatorUser();

        const result = await service().assignEvaluatorToOnlineGroup(evaluatorId, presencialGroup.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_MODALITY_MISMATCH");
    });

    it("GROUP_NOT_FOUND para grupo inexistente", async () => {
        const NOW = new Date("2119-08-10T12:00:00.000Z");
        await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertEvaluatorUser();

        const result = await service().assignEvaluatorToOnlineGroup(evaluatorId, crypto.randomUUID(), NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_NOT_FOUND");
    });

    it("leaveOnlineGroup remove o avaliador do grupo online em que estava (FR-005)", async () => {
        const NOW = new Date("2120-08-10T12:00:00.000Z");
        const { group } = await setupOnlineGroup(NOW);
        const evaluatorId = await insertEvaluatorUser();
        await service().assignEvaluatorToOnlineGroup(evaluatorId, group.id, NOW);

        const result = await service().leaveOnlineGroup(evaluatorId, NOW);

        expect(result.isRight()).toBe(true);
        const row = await env.DB.prepare(`SELECT 1 FROM group_evaluators WHERE user_id = ?`).bind(evaluatorId).first();
        expect(row).toBeNull();
    });

    it("EVALUATOR_NOT_ALLOCATED ao tentar sair sem estar em nenhum grupo online", async () => {
        const NOW = new Date("2121-08-10T12:00:00.000Z");
        await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertEvaluatorUser();

        const result = await service().leaveOnlineGroup(evaluatorId, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("EVALUATOR_NOT_ALLOCATED");
    });

    it("host da edição que entra num grupo online aparece como avaliador, nunca host (FR-007)", async () => {
        const NOW = new Date("2122-08-10T12:00:00.000Z");
        const { process, group } = await setupOnlineGroup(NOW);
        const hostId = await insertCheckedMember(process.id, await insertActor(), true);

        const result = await service().assignEvaluatorToOnlineGroup(hostId, group.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.evaluators.find((e) => e.userId === hostId)?.role).toBe("avaliador");
    });
});

describe("GroupService.moveCandidate / moveEvaluator (US2, FR-009/FR-010 — FEAT-0012, presencial)", () => {
    /**
     * 2 mulheres + 8 homens (10 no total — FEAT-0022: a faixa agora é 5-7, `derivePresencialGroupCount`
     * só forma 1 grupo único até 7 candidatos; precisa de 10 pra forçar 2 grupos de 5 numa sala
     * de 50, D5 maxGroups=2). Distribuição determinística (`distributeByGender`) — grupo A fica
     * com as 2 mulheres + 3 homens, grupo B só com homens.
     */
    async function setupTwoPresencialGroups(now: Date) {
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(now);
        const actorId = await insertActor();
        await insertRoom("comum");

        const women = [
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
            await insertCheckedCandidate(process.id, actorId, { gender: "feminino" }),
        ];
        const men: string[] = [];
        for (let i = 0; i < 8; i++) {
            men.push(await insertCheckedCandidate(process.id, actorId, { gender: "masculino" }));
        }

        const organized = await service().organizePresencial(undefined, now);
        if (!organized.isRight()) throw new Error("setup falhou");

        const groupA = organized.value.groups.find((g) => g.candidates.some((c) => c.id === women[0]))!;
        const groupB = organized.value.groups.find((g) => g.candidates.some((c) => c.id === men[0]))!;

        return { women, men, groupA, groupB };
    }

    it("move com sucesso não gera aviso quando nenhum grupo fica com exatamente 1 mulher", async () => {
        const NOW = new Date("2123-08-10T12:00:00.000Z");
        const { men, groupA, groupB } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(men[0], groupA.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.warning).toBeNull();
        expect(result.value.groups.find((g) => g.id === groupA.id)?.candidates.some((c) => c.id === men[0])).toBe(true);
        expect(result.value.groups.find((g) => g.id === groupB.id)?.candidates.some((c) => c.id === men[0])).toBe(false);
    });

    it("move violando D1 gera aviso GENDER_RULE_VIOLATED, mas ainda move (FR-010)", async () => {
        const NOW = new Date("2124-08-10T12:00:00.000Z");
        const { women, groupA, groupB } = await setupTwoPresencialGroups(NOW);

        // groupA tinha as 2 mulheres; tirar uma deixa 1 lá e cria 1 no destino — os dois violam D1.
        const result = await service().moveCandidate(women[0], groupB.id, NOW);

        expect(result.isRight()).toBe(true);
        if (!result.isRight()) return;
        expect(result.value.warning).toBe("GENDER_RULE_VIOLATED");
    });

    it("mover entre modalidades diferentes é bloqueado (FR-003, invariante rígida)", async () => {
        const NOW = new Date("2125-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        const presencialId = await insertCheckedCandidate(process.id, actorId, { online: false });
        await insertCheckedCandidate(process.id, actorId, { online: true });

        const presencialResult = await service().organizePresencial(undefined, NOW);
        const onlineResult = await service().organizeOnline(NOW);
        if (!presencialResult.isRight() || !onlineResult.isRight()) throw new Error("setup falhou");
        const onlineGroup = onlineResult.value.groups[0]!;

        const result = await service().moveCandidate(presencialId, onlineGroup.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_MODALITY_MISMATCH");
    });

    it("GROUP_NOT_FOUND quando o grupo de destino não existe na edição corrente", async () => {
        const NOW = new Date("2126-08-10T12:00:00.000Z");
        const { women } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(women[0], crypto.randomUUID(), NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("GROUP_NOT_FOUND");
    });

    it("CANDIDATE_NOT_ALLOCATED quando o candidato não está em nenhum grupo da edição", async () => {
        const NOW = new Date("2127-08-10T12:00:00.000Z");
        const { groupA } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveCandidate(crypto.randomUUID(), groupA.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_ALLOCATED");
    });

    it("moveEvaluator: sucesso, sem aviso (D1 é só sobre candidatos)", async () => {
        const NOW = new Date("2128-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actorId = await insertActor();
        await insertRoom("comum");
        // 10 candidatos — FEAT-0022 (faixa 5-7): precisa de mais de 7 pra formar 2 grupos de
        // verdade, senão "mover pro outro grupo" não faz sentido (grupo único).
        for (let i = 0; i < 10; i++) await insertCheckedCandidate(process.id, actorId);
        const evaluatorId = await insertCheckedMember(process.id, actorId);

        const organized = await service().organizePresencial(undefined, NOW);
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
        const NOW = new Date("2129-08-10T12:00:00.000Z");
        const { groupA } = await setupTwoPresencialGroups(NOW);

        const result = await service().moveEvaluator(crypto.randomUUID(), groupA.id, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("EVALUATOR_NOT_ALLOCATED");
    });
});
