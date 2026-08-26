import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

// Testes de HTTP: auth/autorização, CORS, manutenção, validação, envelope de
// erro — e, sobretudo, o corte por papel VERIFICADO NO CORPO DA RESPOSTA
// (FEAT-0007, seção 6). A lógica de negócio está em dashboard.service.test.ts.
//
// Ver a nota de dashboard.service.test.ts sobre o armazenamento não ser
// isolado entre os `it`; o mesmo `beforeEach` vale aqui.

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

/** Passado explicitamente nas rotas: sem `now` injetável, é o que torna o teste independente do relógio. */
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

let counter = 0;

beforeEach(async () => {
    await env.DB.exec("DELETE FROM candidates");
    await env.DB.exec("DELETE FROM selection_processes WHERE label NOT IN ('2026.1', '2026.2')");
    const { keys } = await env.CANDIDATES_KV.list({ prefix: "dashboard:" });
    await Promise.all(keys.map((key) => env.CANDIDATES_KV.delete(key.name)));
});

async function insertCandidate(
    overrides: { name?: string; createdAt?: string; specialNeeds?: boolean; specialNeedsDescription?: string | null } = {},
) {
    counter += 1;
    const row = {
        id: crypto.randomUUID(),
        name: overrides.name ?? `Candidato Rota ${counter}`,
        email: `candidato-rota-${counter}@example.com`,
        phone: `+557196666${String(counter).padStart(4, "0")}`,
        created_at: overrides.createdAt ?? "2026-08-05 12:00:00",
    };
    const specialNeeds = overrides.specialNeeds ?? false;

    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at),
                 'eng-computacao', 4, 'feminino', 'parda', ?, ?, ?, ?)`,
    )
        .bind(row.id, row.created_at, row.name, row.email, row.phone, row.created_at)
        .run();

    await env.DB.prepare(
        `INSERT INTO candidate_applications
            (id, candidate_id, referral_source, referral_source_other, mej_acknowledged, experience, motivation, saturday_restriction, special_needs, special_needs_description)
         VALUES (?, ?, 'instagram', NULL, 1, 'Experiência.', 'Motivação.', 0, ?, ?)`,
    )
        .bind(crypto.randomUUID(), row.id, specialNeeds ? 1 : 0, specialNeeds ? (overrides.specialNeedsDescription ?? null) : null)
        .run();

    return row;
}

/** `role` é uma claim do JWT, independente do `roles` real — `requireRole` só lê o token. */
async function tokenFor(role: string): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role === "admin" ? "admin" : "avaliador", `user-dash-${counter}@example.com`, `Membro ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

function authed(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function metricsUrl(query = ""): string {
    return `http://local.test/dashboard/metrics?process_id=${EDICAO_2026_2}${query}`;
}

// ============================================================
// O critério de aceite central da feature
// ============================================================

describe("Corte por papel, verificado no corpo da resposta", () => {
    it("um token de avaliador NÃO recebe gênero nem etnia em /dashboard/metrics", async () => {
        await insertCandidate();
        const token = await tokenFor("avaliador");

        const response = await call(new Request(metricsUrl(), { headers: authed(token) }));

        expect(response.status).toBe(200);
        // O texto cru, não o objeto: é o que de fato trafega.
        const raw = await response.text();
        expect(raw).not.toContain("byGender");
        expect(raw).not.toContain("byEthnicity");
        expect(raw).not.toContain("feminino");
        expect(raw).not.toContain("parda");
        // E continua entregando o que é operacional.
        expect(raw).toContain("eng-computacao");
    });

    it("um token de admin recebe os dois blocos", async () => {
        await insertCandidate();
        const token = await tokenFor("admin");

        const response = await call(new Request(metricsUrl(), { headers: authed(token) }));
        const body = await response.json<{ data: { byGender?: unknown[]; byEthnicity?: unknown[] } }>();

        expect(body.data.byGender).toEqual([{ key: "feminino", count: 1 }]);
        expect(body.data.byEthnicity).toEqual([{ key: "parda", count: 1 }]);
    });

    it("depois de um admin ler, o avaliador NÃO recebe a resposta cacheada dele", async () => {
        await insertCandidate();
        const admin = await tokenFor("admin");
        const avaliador = await tokenFor("avaliador");

        // O KV está no caminho aqui: `dashboardRouter` sempre injeta o cache.
        const doAdmin = await call(new Request(metricsUrl(), { headers: authed(admin) }));
        expect(await doAdmin.text()).toContain("byGender");

        const doAvaliador = await call(new Request(metricsUrl(), { headers: authed(avaliador) }));

        expect(await doAvaliador.text()).not.toContain("byGender");
    });

    it("o detalhe segue a mesma regra", async () => {
        const candidate = await insertCandidate();
        const avaliador = await tokenFor("avaliador");
        const admin = await tokenFor("admin");

        const paraAvaliador = await call(
            new Request(`http://local.test/dashboard/candidates/${candidate.id}`, { headers: authed(avaliador) }),
        );
        const paraAdmin = await call(
            new Request(`http://local.test/dashboard/candidates/${candidate.id}`, { headers: authed(admin) }),
        );

        expect(await paraAvaliador.text()).not.toContain("demographics");
        expect(await paraAdmin.text()).toContain("demographics");
    });

    it("FEAT-0014: o detalhe expõe specialNeedsDescription para qualquer papel (sem gate de admin)", async () => {
        const candidate = await insertCandidate({
            specialNeeds: true,
            specialNeedsDescription: "Uso cadeira de rodas — preciso de acesso sem escadas.",
        });
        const avaliador = await tokenFor("avaliador");
        const admin = await tokenFor("admin");

        const paraAvaliador = await call(
            new Request(`http://local.test/dashboard/candidates/${candidate.id}`, { headers: authed(avaliador) }),
        );
        const paraAdmin = await call(
            new Request(`http://local.test/dashboard/candidates/${candidate.id}`, { headers: authed(admin) }),
        );

        const bodyAvaliador = await paraAvaliador.json<{ data: { application: { specialNeedsDescription: string | null } } }>();
        const bodyAdmin = await paraAdmin.json<{ data: { application: { specialNeedsDescription: string | null } } }>();

        expect(bodyAvaliador.data.application.specialNeedsDescription).toBe(
            "Uso cadeira de rodas — preciso de acesso sem escadas.",
        );
        expect(bodyAdmin.data.application.specialNeedsDescription).toBe(
            "Uso cadeira de rodas — preciso de acesso sem escadas.",
        );
    });

    it("a listagem não traz demografia para papel nenhum", async () => {
        await insertCandidate();
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/dashboard/candidates?process_id=${EDICAO_2026_2}`, {
                headers: authed(admin),
            }),
        );
        const body = await response.json<{ data: { items: Record<string, unknown>[] } }>();

        expect(body.data.items[0]).not.toHaveProperty("gender");
        expect(body.data.items[0]).not.toHaveProperty("ethnicity");
        expect(body.data.items[0]?.process).toEqual({ id: EDICAO_2026_2, label: "2026.2" });
    });

    it("FEAT-0014: a listagem não traz specialNeeds nem specialNeedsDescription, mesmo com um candidato descrito (FR-008)", async () => {
        await insertCandidate({ specialNeeds: true, specialNeedsDescription: "Uso cadeira de rodas." });
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/dashboard/candidates?process_id=${EDICAO_2026_2}`, {
                headers: authed(admin),
            }),
        );
        const raw = await response.clone().text();
        const body = await response.json<{ data: { items: Record<string, unknown>[] } }>();

        expect(body.data.items[0]).not.toHaveProperty("specialNeeds");
        expect(body.data.items[0]).not.toHaveProperty("specialNeedsDescription");
        expect(raw).not.toMatch(/cadeira/);
    });
});

// ============================================================
// Autenticação e autorização
// ============================================================

describe("Acesso a /dashboard/*", () => {
    it.each([
        ["metrics", "http://local.test/dashboard/metrics"],
        ["candidates", "http://local.test/dashboard/candidates"],
        ["editions", "http://local.test/dashboard/editions"],
    ])("E6 — %s sem token responde 401", async (_name, url) => {
        const response = await call(new Request(url));

        expect(response.status).toBe(401);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe("INVALID_TOKEN");
    });

    it("E7 — papel fora do conjunto permitido responde 403", async () => {
        const token = await tokenFor("estagiario");

        const response = await call(new Request("http://local.test/dashboard/metrics", { headers: authed(token) }));

        expect(response.status).toBe(403);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe("INSUFFICIENT_ROLE");
    });
});

// ============================================================
// Validação e erros de domínio
// ============================================================

describe("Validação de parâmetros", () => {
    it("E4 — `from` posterior a `to` responde 400 apontando o campo", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/candidates?from=2026-08-20&to=2026-08-01", {
                headers: authed(token),
            }),
        );

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string; field?: string } }>();
        expect(body.error.field).toBe("to");
    });

    it("E5 — `per_page` acima de 100 responde 400, sem clamp silencioso", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/candidates?per_page=101", { headers: authed(token) }),
        );

        expect(response.status).toBe(400);
    });

    it("FEAT-0015 — curso inválido em /dashboard/candidates responde 400 com VALIDATION_ERROR", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/candidates?course=medicina", { headers: authed(token) }),
        );

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("data inexistente responde 400", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/candidates?from=2026-02-31", { headers: authed(token) }),
        );

        expect(response.status).toBe(400);
    });

    it("`process_id` que não é uuid nem `all` responde 400", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/metrics?process_id=corrente", { headers: authed(token) }),
        );

        expect(response.status).toBe(400);
    });

    it("E3 — `process_id` inexistente responde 404", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/metrics?process_id=00000000-0000-4000-8000-000000000000", {
                headers: authed(token),
            }),
        );

        expect(response.status).toBe(404);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe("SELECTION_PROCESS_NOT_FOUND");
    });

    it("E1 — detalhe de candidato inexistente responde 404", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/dashboard/candidates/${crypto.randomUUID()}`, { headers: authed(token) }),
        );

        expect(response.status).toBe(404);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe("CANDIDATE_NOT_FOUND");
    });

    it("`id` não-UUID no path responde 400", async () => {
        const token = await tokenFor("admin");

        const response = await call(
            new Request("http://local.test/dashboard/candidates/nao-e-um-uuid", { headers: authed(token) }),
        );

        expect(response.status).toBe(400);
    });

    it("E8 — intervalo fora da janela da edição responde 200 com lista vazia", async () => {
        await insertCandidate({ createdAt: "2026-08-05 12:00:00" });
        const token = await tokenFor("admin");

        const response = await call(
            new Request(
                `http://local.test/dashboard/candidates?process_id=${EDICAO_2026_2}&from=2026-01-05&to=2026-01-10`,
                { headers: authed(token) },
            ),
        );

        expect(response.status).toBe(200);
        const body = await response.json<{ data: { items: unknown[]; pagination: { total: number } } }>();
        expect(body.data.items).toEqual([]);
        expect(body.data.pagination.total).toBe(0);
    });
});

// ============================================================
// Catálogo de edições
// ============================================================

describe("GET /dashboard/editions", () => {
    it("devolve as edições e a corrente", async () => {
        const token = await tokenFor("avaliador");

        const response = await call(new Request("http://local.test/dashboard/editions", { headers: authed(token) }));

        expect(response.status).toBe(200);
        const body = await response.json<{
            data: { editions: { id: string; label: string }[]; current: { label: string } };
        }>();
        expect(body.data.editions.map((edition) => edition.label)).toContain("2026.1");
        expect(body.data.current.label).toMatch(/^\d{4}\.[12]$/);
    });
});

// ============================================================
// Middleware do prefixo — que um prefixo novo NÃO herda
// ============================================================

describe("Modo de manutenção em /dashboard/*", () => {
    it('bloqueia com 503 quando MAINTENANCE_MODE = "true"', async () => {
        const token = await tokenFor("admin");

        const response = await call(new Request(metricsUrl(), { headers: authed(token) }), {
            MAINTENANCE_MODE: "true",
        });

        expect(response.status).toBe(503);
        expect((await response.json<{ error: { code: string } }>()).error.code).toBe("MAINTENANCE_MODE");
    });
});

describe("CORS de /dashboard/*", () => {
    it("permite a origin da allowlist", async () => {
        const response = await call(
            new Request("http://local.test/dashboard/metrics", {
                method: "OPTIONS",
                headers: { Origin: FRONT_ORIGIN, "Access-Control-Request-Method": "GET" },
            }),
        );

        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FRONT_ORIGIN);
    });

    it("não reflete a origin de um site estranho — a rota devolve dado de candidato", async () => {
        const response = await call(
            new Request("http://local.test/dashboard/metrics", {
                method: "OPTIONS",
                headers: { Origin: "https://site-estranho.test", "Access-Control-Request-Method": "GET" },
            }),
        );

        expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("https://site-estranho.test");
    });
});
