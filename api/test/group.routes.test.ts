import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A lógica
// de negócio está em group.service.test.ts (mesma divisão de
// member-checkin.routes.test.ts). Storage do D1 não é isolado por `it()` —
// todos os testes deste arquivo compartilham a edição corrente ("hoje",
// seed 2026.2) e a tabela `rooms` (global, sem escopo de edição). Por isso
// a ordem dos describes/its abaixo importa (ver comentários pontuais).

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
    const { token } = await userAndTokenFor(role);
    return token;
}

async function userAndTokenFor(role: "admin" | "avaliador"): Promise<{ userId: string; token: string }> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-group-rota-${counter}@example.com`, `Membro Grupo ${counter}`)
        .run();

    const token = await signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
    return { userId: id, token };
}

async function insertCheckedCandidate(actorId: string) {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at), 'eng-computacao', 3, 'masculino', 'nao-informado', ?, ?, ?, ?)`,
    )
        .bind(id, "2026-08-26 12:00:00", `Candidato Grupo Rota ${counter}`, `candidato-grupo-rota-${counter}@example.com`, `+557198886${String(counter).padStart(4, "0")}`, "2026-08-26 12:00:00")
        .run();

    await env.DB.prepare(
        `INSERT INTO candidate_checkins (id, candidate_id, process_id, checked_in_by)
         VALUES (?, ?, (SELECT id FROM selection_processes WHERE '2026-08-26 12:00:00' BETWEEN starts_at AND ends_at), ?)`,
    )
        .bind(crypto.randomUUID(), id, actorId)
        .run();

    return id;
}

async function insertRoom(size = 50) {
    counter += 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO rooms (id, name, size) VALUES (?, ?, ?)`).bind(id, `Sala Grupo Rota ${counter}`, size).run();
    return id;
}

// ============================================================
// GET /groups
// ============================================================

describe("GET /groups (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/groups", { headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("200 com admin — `groups` é sempre um array (vazio antes de qualquer `organize`, aqui ou não)", async () => {
        const admin = await tokenFor("admin");
        const response = await call(new Request("http://local.test/groups", { headers: authed(admin) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: unknown[] } };
        expect(Array.isArray(body.data.groups)).toBe(true);
    });
});

// ============================================================
// POST /groups/organize
// ============================================================

describe("POST /groups/organize (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/groups/organize", { method: "POST" }));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(new Request("http://local.test/groups/organize", { method: "POST", headers: authed(token) }));
        expect(response.status).toBe(403);
    });

    it("409 NO_ROOMS_AVAILABLE com candidato presencial presente e nenhuma sala cadastrada ainda", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertCheckedCandidate(userId);

        const response = await call(new Request("http://local.test/groups/organize", { method: "POST", headers: authed(token) }));

        // Só é determinístico se nenhum teste anterior deste arquivo cadastrou sala — é o caso aqui (primeiro a tocar `rooms`).
        expect(response.status).toBe(409);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe("NO_ROOMS_AVAILABLE");
    });

    it("200 organiza com sucesso depois de cadastrar uma sala — shape da resposta", async () => {
        const { userId, token } = await userAndTokenFor("admin");
        await insertRoom();
        await insertCheckedCandidate(userId);

        const response = await call(new Request("http://local.test/groups/organize", { method: "POST", headers: authed(token) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            data: { groups: { id: string; modality: string; candidates: unknown[] }[]; unallocatedCandidateCount: number };
        };
        expect(body.data.groups.length).toBeGreaterThan(0);
        expect(typeof body.data.unallocatedCandidateCount).toBe("number");
        expect(body.data.groups[0]).toHaveProperty("modality");
    });

    it("GET /groups depois de organizar reflete o resultado", async () => {
        const admin = await tokenFor("admin");
        const response = await call(new Request("http://local.test/groups", { headers: authed(admin) }));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { groups: unknown[] } };
        // Alguma organização já rodou nos testes anteriores deste describe — a lista não é vazia.
        expect(body.data.groups.length).toBeGreaterThan(0);
    });
});
