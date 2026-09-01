import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, envelope de erro. A
// lógica de negócio está em selection-process-admin.service.test.ts (mesma
// divisão do resto do projeto). Sem endpoint de criação — os processos de
// teste são semeados direto via SQL (a criação continua só via
// `resolveCurrent()`, regra semestral fixa em código).

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
        .bind(id, role, `user-selection-process-rota-${counter}@example.com`, `Membro ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

function uniqueLabel(): string {
    counter += 1;
    return `RotaFEAT0017.${counter}`;
}

async function seedProcess(overrides: { label?: string; starts_at?: string; ends_at?: string } = {}) {
    const id = crypto.randomUUID();
    const label = overrides.label ?? uniqueLabel();
    await env.DB.prepare("INSERT INTO selection_processes (id, label, starts_at, ends_at) VALUES (?, ?, ?, ?)")
        .bind(id, label, overrides.starts_at ?? "2026-01-01", overrides.ends_at ?? "2026-07-31 23:59:59")
        .run();

    return { id, label };
}

// ============================================================
// GET /selection-processes
// ============================================================

describe("GET /selection-processes (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/selection-processes"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/selection-processes", { headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("200 com admin, e o processo semeado aparece na lista", async () => {
        const admin = await tokenFor("admin");
        const { label } = await seedProcess();

        const response = await call(
            new Request("http://local.test/selection-processes", { headers: authed(admin) }),
        );
        const body = await response.json<{ data: { label: string }[] }>();

        expect(response.status).toBe(200);
        expect(body.data.map((p) => p.label)).toContain(label);
    });
});

// ============================================================
// PUT /selection-processes/:id
// ============================================================

describe("PUT /selection-processes/:id (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const { id, label } = await seedProcess();

        const response = await call(
            new Request(`http://local.test/selection-processes/${id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ label, starts_at: "2026-01-01", ends_at: "2026-07-31 23:59:59" }),
            }),
        );
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const avaliador = await tokenFor("avaliador");
        const { id, label } = await seedProcess();

        const response = await call(
            new Request(`http://local.test/selection-processes/${id}`, {
                method: "PUT",
                headers: jsonHeaders(avaliador),
                body: JSON.stringify({ label, starts_at: "2026-01-01", ends_at: "2026-07-31 23:59:59" }),
            }),
        );
        expect(response.status).toBe(403);
    });

    it("200 com admin, starts_at corrigido", async () => {
        const admin = await tokenFor("admin");
        const { id, label } = await seedProcess({ starts_at: "2026-01-01", ends_at: "2026-07-31 23:59:59" });

        const response = await call(
            new Request(`http://local.test/selection-processes/${id}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ label, starts_at: "2026-01-15", ends_at: "2026-07-31 23:59:59" }),
            }),
        );
        const body = await response.json<{ data: { starts_at: string } }>();

        expect(response.status).toBe(200);
        expect(body.data.starts_at).toBe("2026-01-15");
    });

    it("FR-003 - 400 quando starts_at não é anterior a ends_at", async () => {
        const admin = await tokenFor("admin");
        const { id, label } = await seedProcess();

        const response = await call(
            new Request(`http://local.test/selection-processes/${id}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({ label, starts_at: "2026-12-31", ends_at: "2026-01-01" }),
            }),
        );
        expect(response.status).toBe(400);
    });

    it("FR-005 - 404 para id inexistente", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/selection-processes/${crypto.randomUUID()}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({
                    label: uniqueLabel(),
                    starts_at: "2026-01-01",
                    ends_at: "2026-07-31 23:59:59",
                }),
            }),
        );
        expect(response.status).toBe(404);
    });

    it("FR-004 - 409 ao renomear para label já usado por outro processo", async () => {
        const admin = await tokenFor("admin");
        const processA = await seedProcess();
        const processB = await seedProcess();

        const response = await call(
            new Request(`http://local.test/selection-processes/${processB.id}`, {
                method: "PUT",
                headers: jsonHeaders(admin),
                body: JSON.stringify({
                    label: processA.label,
                    starts_at: "2026-01-01",
                    ends_at: "2026-07-31 23:59:59",
                }),
            }),
        );

        expect(response.status).toBe(409);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("SELECTION_PROCESS_LABEL_ALREADY_EXISTS");
    });
});
