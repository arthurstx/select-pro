import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A lógica de negócio
// está em evaluation.service.test.ts. Storage do D1 não é isolado por `it()` — todos os
// testes deste arquivo compartilham a edição corrente ("hoje", seed 2026.2).

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

function testEnv(overrides: Record<string, unknown> = {}) {
    return { ...env, JWT_SECRET, FRONT_ORIGIN, ...overrides } as unknown as CloudflareBindings;
}

async function call(request: Request, envOverrides: Record<string, unknown> = {}) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, testEnv(envOverrides), ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

function authed(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
    return { ...authed(token), "content-type": "application/json" };
}

let counter = 0;

async function userAndToken(role: "admin" | "avaliador"): Promise<{ userId: string; token: string }> {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-eval-rota-${counter}@example.com`, `Usuario Eval Rota ${counter}`)
        .run();
    const token = await signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
    return { userId: id, token };
}

async function insertCandidate(): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE '2026-08-26 12:00:00' BETWEEN starts_at AND ends_at), 'eng-computacao', 3, 'outro', 'nao-informado', ?, ?, ?, '2026-08-26 12:00:00')`,
    )
        .bind(id, `Candidato Eval Rota ${counter}`, `candidato-eval-rota-${counter}@example.com`, `+557198884${String(counter).padStart(4, "0")}`)
        .run();
    return id;
}

async function insertGroup(modality: "presencial" | "online" = "presencial"): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT INTO groups (id, process_id, room_id, modality, name)
         VALUES (?, (SELECT id FROM selection_processes WHERE '2026-08-26 12:00:00' BETWEEN starts_at AND ends_at), NULL, ?, ?)`,
    )
        .bind(id, modality, `Grupo Eval Rota ${counter}`)
        .run();
    return id;
}

async function addToGroup(table: "group_candidates" | "group_evaluators", groupId: string, memberId: string) {
    const column = table === "group_candidates" ? "candidate_id" : "user_id";
    await env.DB.prepare(`INSERT INTO ${table} (group_id, ${column}) VALUES (?, ?)`).bind(groupId, memberId).run();
}

const FULL_SCORES = { raciocinio_logico: 4, trabalho_equipe: 5, lideranca: 3, proatividade: 4, comunicacao: 5 };

// ============================================================
// GET /evaluations/my-group
// ============================================================

describe("GET /evaluations/my-group (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/evaluations/my-group"));
        expect(response.status).toBe(401);
    });

    it("403 para admin (rota é de avaliador/host)", async () => {
        const { token } = await userAndToken("admin");
        const response = await call(new Request("http://local.test/evaluations/my-group", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("409 NOT_IN_ANY_GROUP quando o avaliador não está em nenhum grupo", async () => {
        const { token } = await userAndToken("avaliador");
        const response = await call(new Request("http://local.test/evaluations/my-group", { headers: authed(token) }));

        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("NOT_IN_ANY_GROUP");
    });

    it("200 lista os candidatos do grupo", async () => {
        const { userId, token } = await userAndToken("avaliador");
        const candidateId = await insertCandidate();
        const groupId = await insertGroup();
        await addToGroup("group_evaluators", groupId, userId);
        await addToGroup("group_candidates", groupId, candidateId);

        const response = await call(new Request("http://local.test/evaluations/my-group", { headers: authed(token) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { candidates: { id: string; myEvaluation: unknown }[] } };
        const candidate = body.data.candidates.find((c) => c.id === candidateId);
        expect(candidate?.myEvaluation).toBeNull();
    });
});

// ============================================================
// PUT /evaluations/candidates/{candidateId}
// ============================================================

describe("PUT /evaluations/candidates/:candidateId (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ scores: FULL_SCORES, overallColor: "GREEN" }),
            }),
        );
        expect(response.status).toBe(401);
    });

    it("400 quando falta um critério", async () => {
        const { token } = await userAndToken("avaliador");
        const { lideranca: _omit, ...incomplete } = FULL_SCORES;
        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: incomplete, overallColor: "GREEN" }),
            }),
        );
        expect(response.status).toBe(400);
    });

    it("400 quando uma nota está fora de 0-5", async () => {
        const { token } = await userAndToken("avaliador");
        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: { ...FULL_SCORES, lideranca: 6 }, overallColor: "GREEN" }),
            }),
        );
        expect(response.status).toBe(400);
    });

    it("404 CANDIDATE_NOT_FOUND para candidato inexistente", async () => {
        const { token } = await userAndToken("avaliador");
        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: FULL_SCORES, overallColor: "GREEN" }),
            }),
        );
        expect(response.status).toBe(404);
    });

    it("409 CANDIDATE_NOT_IN_EVALUATOR_GROUP quando o candidato está em outro grupo", async () => {
        const { userId, token } = await userAndToken("avaliador");
        const candidateId = await insertCandidate();
        const myGroup = await insertGroup();
        const otherGroup = await insertGroup();
        await addToGroup("group_evaluators", myGroup, userId);
        await addToGroup("group_candidates", otherGroup, candidateId);

        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${candidateId}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: FULL_SCORES, overallColor: "GREEN" }),
            }),
        );

        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("CANDIDATE_NOT_IN_EVALUATOR_GROUP");
    });

    it("200 registra a avaliação", async () => {
        const { userId, token } = await userAndToken("avaliador");
        const candidateId = await insertCandidate();
        const groupId = await insertGroup();
        await addToGroup("group_evaluators", groupId, userId);
        await addToGroup("group_candidates", groupId, candidateId);

        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${candidateId}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: FULL_SCORES, overallColor: "GREEN", feedback: "Muito bem." }),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { overallColor: string; feedback: string | null } };
        expect(body.data.overallColor).toBe("GREEN");
        expect(body.data.feedback).toBe("Muito bem.");
    });

    it("FEAT-0018 — 200 registra a avaliação para candidato de grupo ONLINE", async () => {
        const { userId, token } = await userAndToken("avaliador");
        const candidateId = await insertCandidate();
        const groupId = await insertGroup("online");
        await addToGroup("group_evaluators", groupId, userId);
        await addToGroup("group_candidates", groupId, candidateId);

        const response = await call(
            new Request(`http://local.test/evaluations/candidates/${candidateId}`, {
                method: "PUT",
                headers: jsonHeaders(token),
                body: JSON.stringify({ scores: FULL_SCORES, overallColor: "GREEN" }),
            }),
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { overallColor: string } };
        expect(body.data.overallColor).toBe("GREEN");
    });
});

// ============================================================
// GET /evaluations/admin/candidates(/:candidateId)
// ============================================================

describe("GET /evaluations/admin/candidates (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/evaluations/admin/candidates"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const { token } = await userAndToken("avaliador");
        const response = await call(new Request("http://local.test/evaluations/admin/candidates", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin", async () => {
        const { token } = await userAndToken("admin");
        const response = await call(new Request("http://local.test/evaluations/admin/candidates", { headers: authed(token) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { candidates: unknown[] } };
        expect(Array.isArray(body.data.candidates)).toBe(true);
    });

    it("404 no detalhe de candidato inexistente", async () => {
        const { token } = await userAndToken("admin");
        const response = await call(
            new Request(`http://local.test/evaluations/admin/candidates/${crypto.randomUUID()}`, { headers: authed(token) }),
        );
        expect(response.status).toBe(404);
    });
});
