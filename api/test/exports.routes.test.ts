import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, status codes, Content-Type/Content-Disposition. A
// lógica de negócio está em exports.service.test.ts (mesma divisão do resto do projeto).

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";
const EDICAO_2026_2 = "ace24839-ec23-4942-9065-dbd45742034e";

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
        .bind(id, role, `user-export-rota-${counter}@example.com`, `Membro Export ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

async function insertCandidate(processId: string, name: string) {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, ?, 'eng-computacao', 3, 'feminino', 'parda', ?, ?, ?, '2026-08-05 12:00:00')`,
    )
        .bind(id, processId, name, `candidato-export-rota-${counter}@example.com`, `+557199999${String(counter).padStart(4, "0")}`)
        .run();

    return id;
}

beforeEach(async () => {
    await env.DB.exec("DELETE FROM candidates");
    await env.DB.exec("DELETE FROM candidate_export_events");
});

describe("GET /exports/candidates (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/exports/candidates"));
        expect(response.status).toBe(401);
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const response = await call(
            new Request("http://local.test/exports/candidates", { headers: authed(token) }),
        );
        expect(response.status).toBe(403);
    });

    it("200 com admin, Content-Type text/csv e Content-Disposition attachment", async () => {
        const admin = await tokenFor("admin");
        await insertCandidate(EDICAO_2026_2, "Candidato Rota");

        const response = await call(
            new Request(`http://local.test/exports/candidates?process_id=${EDICAO_2026_2}`, {
                headers: authed(admin),
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/csv");
        expect(response.headers.get("Content-Disposition")).toContain("attachment");

        const body = await response.text();
        expect(body).toContain("Candidato Rota");
    });

    it("US3 - após 200, um evento de auditoria existe no banco", async () => {
        const admin = await tokenFor("admin");
        await insertCandidate(EDICAO_2026_2, "Candidato Auditado");

        const response = await call(
            new Request(`http://local.test/exports/candidates?process_id=${EDICAO_2026_2}`, {
                headers: authed(admin),
            }),
        );
        expect(response.status).toBe(200);

        const { results } = await env.DB.prepare(
            "SELECT * FROM candidate_export_events ORDER BY created_at DESC LIMIT 1",
        ).all<{ process_id: string; row_count: number }>();

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ process_id: EDICAO_2026_2, row_count: 1 });
    });

    it("US2 - include_sensitive=true acrescenta genero/etnia ao CSV", async () => {
        const admin = await tokenFor("admin");
        await insertCandidate(EDICAO_2026_2, "Candidato Sensivel");

        const response = await call(
            new Request(
                `http://local.test/exports/candidates?process_id=${EDICAO_2026_2}&include_sensitive=true`,
                { headers: authed(admin) },
            ),
        );

        const body = await response.text();
        expect(body).toContain("genero");
        expect(body).toContain("etnia");
    });

    it("include_sensitive ausente não inclui genero/etnia", async () => {
        const admin = await tokenFor("admin");
        await insertCandidate(EDICAO_2026_2, "Candidato Nao Sensivel");

        const response = await call(
            new Request(`http://local.test/exports/candidates?process_id=${EDICAO_2026_2}`, {
                headers: authed(admin),
            }),
        );

        const body = await response.text();
        expect(body).not.toContain("genero");
        expect(body).not.toContain("etnia");
    });

    it("404 para edição inexistente", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/exports/candidates?process_id=${crypto.randomUUID()}`, {
                headers: authed(admin),
            }),
        );

        expect(response.status).toBe(404);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("SELECTION_PROCESS_NOT_FOUND");
    });

    it("400 para data em formato inválido", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/exports/candidates?from=31-08-2026", { headers: authed(admin) }),
        );

        expect(response.status).toBe(400);
    });

    it("400 para intervalo de data invertido", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/exports/candidates?from=2026-08-20&to=2026-08-01", {
                headers: authed(admin),
            }),
        );

        expect(response.status).toBe(400);
    });
});
