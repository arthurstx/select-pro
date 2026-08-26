import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A
// lógica de negócio está em evaluators.service.test.ts (mesma divisão de
// rooms.routes.test.ts). Storage do D1 não é isolado por `it()`.

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

async function tokenFor(role: "admin" | "avaliador"): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-evaluators-rota-${counter}@example.com`, `Membro Evaluators ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

/** Avaliador completo (com `member_profiles`) — só assim aparece na listagem. */
async function createEvaluator(): Promise<{ userId: string; token: string }> {
    counter += 1;
    const userId = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)")
        .bind(userId, `avaliador-rota-${counter}@example.com`, `Avaliador Rota ${counter}`)
        .run();

    await env.DB.prepare(
        `INSERT INTO member_profiles
                (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
              VALUES (?, ?, ?, ?, ?, 'eng-computacao', 5, 'outro', 'nao-informado', 'active', 0, '2026-08-01 00:00:00')`,
    )
        .bind(crypto.randomUUID(), userId, crypto.randomUUID(), `Avaliador Rota ${counter}`, `+557199${String(counter).padStart(7, "0")}`)
        .run();

    const token = await signAccessToken(
        { sub: userId, email: `avaliador-rota-${counter}@example.com`, role: "avaliador", sid: "test-sid" },
        JWT_SECRET,
    );
    return { userId, token };
}

// ============================================================
// GET /evaluators
// ============================================================

describe("GET /evaluators (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/evaluators"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador — FR-007, leitura também é admin-only", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/evaluators", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin, listando um avaliador recém-criado", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        const response = await call(new Request("http://local.test/evaluators", { headers: authed(admin) }));
        const body = await response.json<{ data: { userId: string; role: string }[] }>();

        expect(response.status).toBe(200);
        expect(body.data.find((e) => e.userId === userId)?.role).toBe("avaliador");
    });

    it("US2 - ?role=host filtra corretamente", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();
        await call(
            new Request(`http://local.test/evaluators/${userId}/role`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ role: "host" }),
            }),
        );

        const response = await call(new Request("http://local.test/evaluators?role=host", { headers: authed(admin) }));
        const body = await response.json<{ data: { userId: string; role: string }[] }>();

        expect(response.status).toBe(200);
        expect(body.data.every((e) => e.role === "host")).toBe(true);
        expect(body.data.map((e) => e.userId)).toContain(userId);
    });
});

// ============================================================
// PUT /evaluators/:userId/role
// ============================================================

describe("PUT /evaluators/:userId/role (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const { userId } = await createEvaluator();
        const response = await call(
            new Request(`http://local.test/evaluators/${userId}/role`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ role: "host" }),
            }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador — FR-007/SC-004, escrita também é admin-only", async () => {
        const nonAdmin = await tokenFor("avaliador");
        const { userId } = await createEvaluator();

        const response = await call(
            new Request(`http://local.test/evaluators/${userId}/role`, {
                method: "PUT",
                headers: jsonHeaders(nonAdmin),
                body: JSON.stringify({ role: "host" }),
            }),
        );
        expect(response.status).toBe(403);
    });

    it("200 com admin, e a mudança reflete no GET seguinte", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        const putResponse = await call(
            new Request(`http://local.test/evaluators/${userId}/role`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ role: "host" }),
            }),
        );
        expect(putResponse.status).toBe(200);
        const putBody = await putResponse.json<{ data: { role: string } }>();
        expect(putBody.data.role).toBe("host");

        const getResponse = await call(new Request("http://local.test/evaluators", { headers: authed(admin) }));
        const getBody = await getResponse.json<{ data: { userId: string; role: string }[] }>();
        expect(getBody.data.find((e) => e.userId === userId)?.role).toBe("host");
    });

    it("404 EVALUATOR_NOT_FOUND para userId que não é avaliador ativo", async () => {
        const admin = await tokenFor("admin");
        const response = await call(
            new Request(`http://local.test/evaluators/${crypto.randomUUID()}/role`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ role: "host" }),
            }),
        );
        expect(response.status).toBe(404);
    });
});
