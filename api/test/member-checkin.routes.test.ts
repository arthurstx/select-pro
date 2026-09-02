import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A
// lógica de negócio está em member-checkin.service.test.ts (mesma divisão
// de evaluators.routes.test.ts). Storage do D1 não é isolado por `it()`.

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

let counter = 0;

async function tokenFor(role: "admin" | "avaliador"): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-member-checkin-rota-${counter}@example.com`, `Membro MC ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

/** Avaliador completo (com `member_profiles`) — só assim aparece na listagem/é elegível. */
async function createEvaluator(): Promise<{ userId: string; token: string }> {
    counter += 1;
    const userId = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, 'avaliador', ?, ?)")
        .bind(userId, `avaliador-mc-rota-${counter}@example.com`, `Avaliador MC Rota ${counter}`)
        .run();

    await env.DB.prepare(
        `INSERT INTO member_profiles
                (id, user_id, member_id, full_name, phone, course, semester, gender, ethnicity, status, manager, synced_at)
              VALUES (?, ?, ?, ?, ?, 'eng-computacao', 5, 'outro', 'nao-informado', 'active', 0, '2026-08-01 00:00:00')`,
    )
        .bind(
            crypto.randomUUID(),
            userId,
            crypto.randomUUID(),
            `Avaliador MC Rota ${counter}`,
            `+557198${String(counter).padStart(7, "0")}`,
        )
        .run();

    const token = await signAccessToken(
        { sub: userId, email: `avaliador-mc-rota-${counter}@example.com`, role: "avaliador", sid: "test-sid" },
        JWT_SECRET,
    );
    return { userId, token };
}

// ============================================================
// GET /member-checkins
// ============================================================

describe("GET /member-checkins (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/member-checkins"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador — FR-007, mais restrito que o check-in de candidato", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/member-checkins", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin, listando um avaliador recém-criado", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        const response = await call(new Request("http://local.test/member-checkins", { headers: authed(admin) }));
        const body = await response.json<{
            data: { items: { userId: string; role: string; checkedInAt: string | null }[]; summary: { total: number; checkedIn: number } };
        }>();

        expect(response.status).toBe(200);
        const item = body.data.items.find((i) => i.userId === userId);
        expect(item?.role).toBe("avaliador");
        expect(item?.checkedInAt).toBeNull();
        expect(body.data.summary.total).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================
// PUT /member-checkins/{id}/checkin
// ============================================================

describe("PUT /member-checkins/{id}/checkin (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const { userId } = await createEvaluator();
        const response = await call(new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "PUT" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador — FR-007/SC-004", async () => {
        const nonAdmin = await tokenFor("avaliador");
        const { userId } = await createEvaluator();

        const response = await call(
            new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "PUT", headers: authed(nonAdmin) }),
        );
        expect(response.status).toBe(403);
    });

    it("400 quando `id` não é UUID válido", async () => {
        const admin = await tokenFor("admin");
        const response = await call(
            new Request("http://local.test/member-checkins/nao-e-uuid/checkin", { method: "PUT", headers: authed(admin) }),
        );
        expect(response.status).toBe(400);
    });

    it("404 quando `id` não corresponde a avaliador/host elegível", async () => {
        const admin = await tokenFor("admin");
        const response = await call(
            new Request(`http://local.test/member-checkins/${crypto.randomUUID()}/checkin`, {
                method: "PUT",
                headers: authed(admin),
            }),
        );

        expect(response.status).toBe(404);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("EVALUATOR_NOT_FOUND");
    });

    it("fluxo feliz: 200 com o `checkedInAt` resultante, e reflete na listagem", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        const putResponse = await call(
            new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "PUT", headers: authed(admin) }),
        );
        expect(putResponse.status).toBe(200);
        const putBody = await putResponse.json<{ data: { userId: string; checkedInAt: string } }>();
        expect(putBody.data.userId).toBe(userId);
        expect(putBody.data.checkedInAt).toBeTruthy();

        const listResponse = await call(new Request("http://local.test/member-checkins", { headers: authed(admin) }));
        const listBody = await listResponse.json<{ data: { items: { userId: string; checkedInAt: string | null }[] } }>();
        expect(listBody.data.items.find((i) => i.userId === userId)?.checkedInAt).toBeTruthy();
    });
});

// ============================================================
// DELETE /member-checkins/{id}/checkin
// ============================================================

describe("DELETE /member-checkins/{id}/checkin (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const { userId } = await createEvaluator();
        const response = await call(new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "DELETE" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const nonAdmin = await tokenFor("avaliador");
        const { userId } = await createEvaluator();

        const response = await call(
            new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "DELETE", headers: authed(nonAdmin) }),
        );
        expect(response.status).toBe(403);
    });

    it("fluxo feliz: 204 e a listagem volta a mostrar ausente", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        await call(new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "PUT", headers: authed(admin) }));
        const deleteResponse = await call(
            new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "DELETE", headers: authed(admin) }),
        );
        expect(deleteResponse.status).toBe(204);

        const listResponse = await call(new Request("http://local.test/member-checkins", { headers: authed(admin) }));
        const listBody = await listResponse.json<{ data: { items: { userId: string; checkedInAt: string | null }[] } }>();
        expect(listBody.data.items.find((i) => i.userId === userId)?.checkedInAt).toBeNull();
    });

    it("desmarcar quem já está ausente é no-op — 204 de qualquer forma", async () => {
        const admin = await tokenFor("admin");
        const { userId } = await createEvaluator();

        const response = await call(
            new Request(`http://local.test/member-checkins/${userId}/checkin`, { method: "DELETE", headers: authed(admin) }),
        );
        expect(response.status).toBe(204);
    });
});
