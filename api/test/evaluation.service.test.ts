import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { EvaluationScores } from "shared";

import { CandidateRepository } from "../src/repositories/candidates.repository";
import { EvaluationRepository } from "../src/repositories/evaluation.repository";
import { GroupRepository } from "../src/repositories/group.repository";
import { SelectionProcessRepository } from "../src/repositories/selection-process.repository";
import { EvaluationService } from "../src/services/evaluation.service";

// D1 real via miniflare. Storage NÃO é isolado por `it()`, só por ARQUIVO (mesma
// descoberta de outras suítes) — cada teste usa um ANO diferente para isolar
// candidatos/grupos/avaliações (todos escopados por `process_id`, direta ou
// indiretamente). Grupos são inseridos direto via SQL, sem rodar o algoritmo de
// organização (FEAT-0012) — controla exatamente a composição que cada cenário precisa.

let counter = 0;

function service(): EvaluationService {
    return new EvaluationService(
        new EvaluationRepository(env.DB),
        new GroupRepository(env.DB),
        new CandidateRepository(env.DB),
        new SelectionProcessRepository(env.DB),
    );
}

async function insertUser(role: "avaliador" | "admin" = "avaliador") {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)`)
        .bind(id, role, `user-eval-${counter}@example.com`, `Usuario Eval ${counter}`)
        .run();
    return id;
}

async function insertCandidate(processId: string) {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, ?, 'eng-computacao', 3, 'outro', 'nao-informado', ?, ?, ?, '2026-08-05 12:00:00')`,
    )
        .bind(id, processId, `Candidato Eval ${counter}`, `candidato-eval-${counter}@example.com`, `+557198885${String(counter).padStart(4, "0")}`)
        .run();
    return id;
}

async function checkIn(candidateId: string, processId: string, actorId: string) {
    await env.DB.prepare(`INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), candidateId, processId, actorId)
        .run();
}

async function insertGroup(processId: string, modality: "presencial" | "online" = "presencial") {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO groups (id, process_id, room_id, modality, name) VALUES (?, ?, NULL, ?, ?)`)
        .bind(id, processId, modality, `Grupo Eval ${counter}`)
        .run();
    return id;
}

async function addCandidateToGroup(groupId: string, candidateId: string) {
    await env.DB.prepare(`INSERT INTO group_candidates (group_id, candidate_id) VALUES (?, ?)`).bind(groupId, candidateId).run();
}

async function addEvaluatorToGroup(groupId: string, userId: string) {
    await env.DB.prepare(`INSERT INTO group_evaluators (group_id, user_id) VALUES (?, ?)`).bind(groupId, userId).run();
}

const FULL_SCORES: EvaluationScores = {
    raciocinio_logico: 4,
    trabalho_equipe: 5,
    lideranca: 3,
    proatividade: 4,
    comunicacao: 5,
};

describe("EvaluationService.submit / myGroup (US1)", () => {
    it("fluxo feliz: avaliador registra e a avaliação aparece em myGroup", async () => {
        const NOW = new Date("2201-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);
        const groupId = await insertGroup(process.id);
        await addEvaluatorToGroup(groupId, evaluatorId);
        await addCandidateToGroup(groupId, candidateId);

        const submitResult = await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        expect(submitResult.isRight()).toBe(true);

        const myGroupResult = await service().myGroup(evaluatorId, NOW);
        expect(myGroupResult.isRight()).toBe(true);
        if (!myGroupResult.isRight()) return;

        const candidate = myGroupResult.value.candidates.find((c) => c.id === candidateId);
        expect(candidate?.myEvaluation?.overallColor).toBe("GREEN");
        expect(candidate?.myEvaluation?.scores).toEqual(FULL_SCORES);
        expect(candidate?.evaluationCount).toBe(1);
    });

    it("FEAT-0018 — avaliador alocado a um grupo ONLINE consegue avaliar os candidatos desse grupo", async () => {
        const NOW = new Date("2203-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);
        const groupId = await insertGroup(process.id, "online");
        await addEvaluatorToGroup(groupId, evaluatorId);
        await addCandidateToGroup(groupId, candidateId);

        const submitResult = await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        expect(submitResult.isRight()).toBe(true);

        const myGroupResult = await service().myGroup(evaluatorId, NOW);
        expect(myGroupResult.isRight()).toBe(true);
        if (!myGroupResult.isRight()) return;

        const candidate = myGroupResult.value.candidates.find((c) => c.id === candidateId);
        expect(candidate?.myEvaluation?.overallColor).toBe("GREEN");
        expect(candidate?.evaluationCount).toBe(1);
    });

    it("reenviar edita a mesma avaliação, não duplica (FR-004)", async () => {
        const NOW = new Date("2202-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);
        const groupId = await insertGroup(process.id);
        await addEvaluatorToGroup(groupId, evaluatorId);
        await addCandidateToGroup(groupId, candidateId);

        await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        await service().submit(evaluatorId, candidateId, { scores: { ...FULL_SCORES, lideranca: 1 }, overallColor: "RED" }, NOW);

        const { results } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM evaluations WHERE user_id = ? AND candidate_id = ?`)
            .bind(evaluatorId, candidateId)
            .all<{ n: number }>();
        expect(results?.[0]?.n).toBe(1);

        const myGroupResult = await service().myGroup(evaluatorId, NOW);
        if (!myGroupResult.isRight()) throw new Error("falhou");
        const candidate = myGroupResult.value.candidates.find((c) => c.id === candidateId);
        expect(candidate?.myEvaluation?.overallColor).toBe("RED");
        expect(candidate?.myEvaluation?.scores.lideranca).toBe(1);
        expect(candidate?.evaluationCount).toBe(1);
    });

    it("NOT_IN_ANY_GROUP quando o avaliador não está alocado a nenhum grupo", async () => {
        const NOW = new Date("2203-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);

        const result = await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("NOT_IN_ANY_GROUP");
    });

    it("CANDIDATE_NOT_IN_EVALUATOR_GROUP quando o candidato está em outro grupo (FR-003)", async () => {
        const NOW = new Date("2204-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);
        const myGroupId = await insertGroup(process.id);
        const otherGroupId = await insertGroup(process.id);
        await addEvaluatorToGroup(myGroupId, evaluatorId);
        await addCandidateToGroup(otherGroupId, candidateId);

        const result = await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_IN_EVALUATOR_GROUP");
    });

    it("CANDIDATE_NOT_FOUND quando o candidato não existe", async () => {
        const NOW = new Date("2205-08-10T12:00:00.000Z");
        const evaluatorId = await insertUser();

        const result = await service().submit(evaluatorId, crypto.randomUUID(), { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_FOUND");
    });

    it("evaluationCount soma avaliações de outros avaliadores sem expor o conteúdo delas (FR-005)", async () => {
        const NOW = new Date("2206-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const evaluatorA = await insertUser();
        const evaluatorB = await insertUser();
        const candidateId = await insertCandidate(process.id);
        const groupId = await insertGroup(process.id);
        await addEvaluatorToGroup(groupId, evaluatorA);
        await addEvaluatorToGroup(groupId, evaluatorB);
        await addCandidateToGroup(groupId, candidateId);

        await service().submit(evaluatorB, candidateId, { scores: FULL_SCORES, overallColor: "RED", feedback: "segredo do B" }, NOW);

        const myGroupResult = await service().myGroup(evaluatorA, NOW);
        if (!myGroupResult.isRight()) throw new Error("falhou");
        const candidate = myGroupResult.value.candidates.find((c) => c.id === candidateId);

        expect(candidate?.evaluationCount).toBe(1);
        expect(candidate?.myEvaluation).toBeNull();
    });
});

describe("EvaluationService.adminList / adminDetail (US2)", () => {
    it("0 avaliações: pendente, weightedScore null", async () => {
        const NOW = new Date("2210-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actor = await insertUser("admin");
        const candidateId = await insertCandidate(process.id);
        await checkIn(candidateId, process.id, actor);

        const result = await service().adminList(NOW);
        if (!result.isRight()) throw new Error("falhou");

        const candidate = result.value.find((c) => c.id === candidateId);
        expect(candidate?.verdict).toBe("pendente");
        expect(candidate?.evaluationCount).toBe(0);
        expect(candidate?.weightedScore).toBeNull();
    });

    it("1 avaliação vermelha isolada: reprovado (D2 não espera D6)", async () => {
        const NOW = new Date("2211-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actor = await insertUser("admin");
        const evaluatorId = await insertUser();
        const candidateId = await insertCandidate(process.id);
        await checkIn(candidateId, process.id, actor);
        const groupId = await insertGroup(process.id);
        await addEvaluatorToGroup(groupId, evaluatorId);
        await addCandidateToGroup(groupId, candidateId);

        await service().submit(evaluatorId, candidateId, { scores: FULL_SCORES, overallColor: "RED" }, NOW);

        const result = await service().adminList(NOW);
        if (!result.isRight()) throw new Error("falhou");
        const candidate = result.value.find((c) => c.id === candidateId);
        expect(candidate?.verdict).toBe("reprovado");
        expect(candidate?.evaluationCount).toBe(1);
    });

    it("2 avaliações sem vermelha: aprovado; detalhe traz as duas com autor", async () => {
        const NOW = new Date("2212-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actor = await insertUser("admin");
        const evaluatorA = await insertUser();
        const evaluatorB = await insertUser();
        const candidateId = await insertCandidate(process.id);
        await checkIn(candidateId, process.id, actor);
        const groupId = await insertGroup(process.id);
        await addEvaluatorToGroup(groupId, evaluatorA);
        await addEvaluatorToGroup(groupId, evaluatorB);
        await addCandidateToGroup(groupId, candidateId);

        await service().submit(evaluatorA, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        await service().submit(evaluatorB, candidateId, { scores: FULL_SCORES, overallColor: "YELLOW" }, NOW);

        const listResult = await service().adminList(NOW);
        if (!listResult.isRight()) throw new Error("falhou");
        const summary = listResult.value.find((c) => c.id === candidateId);
        expect(summary?.verdict).toBe("aprovado");
        expect(summary?.evaluationCount).toBe(2);
        expect(summary?.weightedScore).toBeCloseTo(4.2, 2); // 4*.25+5*.25+3*.2+4*.15+5*.15

        const detailResult = await service().adminDetail(candidateId, NOW);
        if (!detailResult.isRight()) throw new Error("falhou");
        expect(detailResult.value.verdict).toBe("aprovado");
        expect(detailResult.value.evaluations).toHaveLength(2);
        expect(detailResult.value.evaluations.map((e) => e.overallColor).sort()).toEqual(["GREEN", "YELLOW"]);
    });

    it("1 vermelha entre várias verdes: reprovado mesmo com mínimo atingido (D2, veto)", async () => {
        const NOW = new Date("2213-08-10T12:00:00.000Z");
        const process = await new SelectionProcessRepository(env.DB).resolveCurrent(NOW);
        const actor = await insertUser("admin");
        const evaluatorA = await insertUser();
        const evaluatorB = await insertUser();
        const evaluatorC = await insertUser();
        const candidateId = await insertCandidate(process.id);
        await checkIn(candidateId, process.id, actor);
        const groupId = await insertGroup(process.id);
        for (const evaluatorId of [evaluatorA, evaluatorB, evaluatorC]) await addEvaluatorToGroup(groupId, evaluatorId);
        await addCandidateToGroup(groupId, candidateId);

        await service().submit(evaluatorA, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        await service().submit(evaluatorB, candidateId, { scores: FULL_SCORES, overallColor: "GREEN" }, NOW);
        await service().submit(evaluatorC, candidateId, { scores: FULL_SCORES, overallColor: "RED" }, NOW);

        const result = await service().adminList(NOW);
        if (!result.isRight()) throw new Error("falhou");
        const candidate = result.value.find((c) => c.id === candidateId);
        expect(candidate?.verdict).toBe("reprovado");
        expect(candidate?.evaluationCount).toBe(3);
    });

    it("CANDIDATE_NOT_FOUND no detalhe para candidato inexistente", async () => {
        const NOW = new Date("2214-08-10T12:00:00.000Z");

        const result = await service().adminDetail(crypto.randomUUID(), NOW);

        expect(result.isLeft()).toBe(true);
        if (result.isLeft()) expect(result.value.code).toBe("CANDIDATE_NOT_FOUND");
    });
});
