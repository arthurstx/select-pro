import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signAccessToken } from "../src/lib/access-token";
import app from "../src/index";

// Testes de HTTP: auth/autorização, CORS, manutenção, validação, envelope de
// erro. A lógica de negócio (E1-E5, idempotência) está em checkin.service.test.ts.
// Usuário e access token são criados direto no D1/via `signAccessToken` — sem
// passar pelo fluxo de `/auth/register` (que depende da Supabase), porque
// `requireAuth`/`requireRole` só validam o JWT, nunca consultam `roles`.

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

function testEnv(overrides: Record<string, unknown> = {}) {
    return {
        ...env,
        JWT_SECRET,
        FRONT_ORIGIN,
        ...overrides,
    } as unknown as CloudflareBindings;
}

async function call(request: Request, envOverrides: Record<string, unknown> = {}) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, testEnv(envOverrides), ctx);
    await waitOnExecutionContext(ctx);

    return response;
}

let counter = 0;

async function insertUser(roleId: "avaliador" | "admin" = "avaliador") {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, roleId, `user-http-${counter}@example.com`, `Avaliador ${counter}`)
        .run();

    return id;
}

async function insertCandidate(overrides: { name?: string; createdAt?: string } = {}) {
    counter += 1;
    const row = {
        id: crypto.randomUUID(),
        name: overrides.name ?? `Candidato Http ${counter}`,
        email: `candidato-http-${counter}@example.com`,
        phone: `+557199990${String(counter).padStart(4, "0")}`,
        course: "eng-computacao",
        semester: 4,
        gender: "outro",
        ethnicity: "nao-informado",
        created_at: overrides.createdAt ?? "2026-08-05 12:00:00",
    };

    // `process_id` derivado da janela do próprio `created_at` — mesma regra
    // da migration 0007, para o fixture refletir o que a inscrição grava.
    await env.DB.prepare(
        `INSERT INTO candidates (id, process_id, course, semester, gender, ethnicity, name, email, phone, created_at)
         VALUES (?, (SELECT id FROM selection_processes WHERE ? BETWEEN starts_at AND ends_at), ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(row.id, row.created_at, row.course, row.semester, row.gender, row.ethnicity, row.name, row.email, row.phone, row.created_at)
        .run();

    return row;
}

/** FEAT-0010, US3 — `insertCandidate` sozinho não cria `candidate_applications` (ver mesmo helper em checkin.service.test.ts). */
async function insertApplication(candidateId: string, saturdayRestriction: boolean) {
    await env.DB.prepare(
        `INSERT INTO candidate_applications
                (id, candidate_id, referral_source, mej_acknowledged, experience, motivation, saturday_restriction, special_needs)
              VALUES (?, ?, 'indicacao', 1, 'Nenhuma', 'Motivação', ?, 0)`,
    )
        .bind(crypto.randomUUID(), candidateId, saturdayRestriction ? 1 : 0)
        .run();
}

/** `role` é uma claim do JWT, independente do `roles` real — ver comentário do topo do arquivo. */
async function tokenFor(userId: string, role: string): Promise<string> {
    return signAccessToken({ sub: userId, email: `${userId}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

function authed(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

async function avaliador() {
    const userId = await insertUser("avaliador");
    const token = await tokenFor(userId, "avaliador");
    return { userId, token };
}

describe("GET /candidates (HTTP)", () => {
    it("sem token responde 401", async () => {
        const response = await call(new Request("http://local.test/candidates"));
        expect(response.status).toBe(401);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("INVALID_TOKEN");
    });

    it("papel fora do conjunto permitido responde 403", async () => {
        const userId = await insertUser("avaliador");
        // O usuário existe com role_id real, mas o token carrega um papel
        // que `requireRole` não conhece — é só isso que a checagem lê.
        const token = await tokenFor(userId, "estagiario");

        const response = await call(new Request("http://local.test/candidates", { headers: authed(token) }));

        expect(response.status).toBe(403);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("INSUFFICIENT_ROLE");
    });

    it("fluxo feliz: lista paginada, sem dados sensíveis, com o processo corrente", async () => {
        const { token } = await avaliador();
        await insertCandidate({ name: "Http Feliz Um" });
        await insertCandidate({ name: "Http Feliz Dois" });

        const response = await call(new Request("http://local.test/candidates?search=Http+Feliz", { headers: authed(token) }));

        expect(response.status).toBe(200);
        const body = await response.json<{
            data: {
                process: { id: string; label: string };
                items: Array<Record<string, unknown>>;
                attendanceSummary: { online: number; presencial: number };
                pagination: { page: number; perPage: number; total: number; totalPages: number };
            };
        }>();

        expect(body.data.process.label).toMatch(/^\d{4}\.[12]$/);
        expect(body.data.items).toHaveLength(2);
        expect(body.data.pagination.total).toBe(2);
        // FEAT-0010, US3: presente no shape mesmo sem ninguém presente ainda (ambos ausentes aqui).
        expect(body.data.attendanceSummary).toEqual({ online: 0, presencial: 0 });
        for (const item of body.data.items) {
            expect(item).not.toHaveProperty("gender");
            expect(item).not.toHaveProperty("ethnicity");
            expect(item).toHaveProperty("checkedInAt");
            expect(item).toHaveProperty("attendance");
            expect(item.attendance).toBeNull();
            // FEAT-0014 (FR-009): a tela de check-in nunca traz necessidade especial, boolean ou descrição.
            expect(item).not.toHaveProperty("specialNeeds");
            expect(item).not.toHaveProperty("specialNeedsDescription");
        }
    });

    it("E6 - per_page acima de 100 responde 400", async () => {
        const { token } = await avaliador();

        const response = await call(new Request("http://local.test/candidates?per_page=101", { headers: authed(token) }));

        expect(response.status).toBe(400);
    });

    it("E7 - status inválido responde 400", async () => {
        const { token } = await avaliador();

        const response = await call(new Request("http://local.test/candidates?status=invalido", { headers: authed(token) }));

        expect(response.status).toBe(400);
    });

    it("FEAT-0015 — curso inválido responde 400 com VALIDATION_ERROR no campo course", async () => {
        const { token } = await avaliador();

        const response = await call(new Request("http://local.test/candidates?course=medicina", { headers: authed(token) }));

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("FEAT-0015 — filtro por curso válido retorna só candidatos daquele curso", async () => {
        const { token } = await avaliador();
        await insertCandidate({ name: "Http Curso Comp Um" });
        await insertCandidate({ name: "Http Curso Comp Dois" });

        const response = await call(
            new Request("http://local.test/candidates?course=eng-computacao&search=Http+Curso", { headers: authed(token) }),
        );

        expect(response.status).toBe(200);
        const body = await response.json<{ data: { items: Array<{ course: string }> } }>();
        expect(body.data.items).toHaveLength(2);
        for (const item of body.data.items) expect(item.course).toBe("eng-computacao");
    });
});

describe("PUT /candidates/{id}/checkin (HTTP)", () => {
    it("fluxo feliz: marca presença e responde 200 com o estado resultante", async () => {
        const { token, userId } = await avaliador();
        const candidate = await insertCandidate();

        const response = await call(
            new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "PUT", headers: authed(token) }),
        );

        expect(response.status).toBe(200);
        const body = await response.json<{ data: { candidateId: string; checkedInAt: string } }>();
        expect(body.data.candidateId).toBe(candidate.id);
        expect(body.data.checkedInAt).toBeTruthy();

        const row = await env.DB.prepare("SELECT checked_in_by FROM candidate_checkins WHERE candidate_id = ?")
            .bind(candidate.id)
            .first<{ checked_in_by: string }>();
        expect(row?.checked_in_by).toBe(userId);
    });

    it("E1 - candidato inexistente responde 404", async () => {
        const { token } = await avaliador();

        const response = await call(
            new Request(`http://local.test/candidates/${crypto.randomUUID()}/checkin`, {
                method: "PUT",
                headers: authed(token),
            }),
        );

        expect(response.status).toBe(404);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("CANDIDATE_NOT_FOUND");
    });

    it("E3 - candidato de outra edição responde 409", async () => {
        const { token } = await avaliador();
        const candidate = await insertCandidate({ createdAt: "2026-02-10 09:00:00" }); // 2026.1

        const response = await call(
            new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "PUT", headers: authed(token) }),
        );

        expect(response.status).toBe(409);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("CANDIDATE_NOT_IN_ACTIVE_PROCESS");
    });

    it("`id` não-UUID no path responde 400", async () => {
        const { token } = await avaliador();

        const response = await call(
            new Request("http://local.test/candidates/nao-e-um-uuid/checkin", { method: "PUT", headers: authed(token) }),
        );

        expect(response.status).toBe(400);
    });

    it("E4 - marcar duas vezes responde 200 as duas, sem duplicar", async () => {
        const { token } = await avaliador();
        const candidate = await insertCandidate();
        const request = () =>
            call(new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "PUT", headers: authed(token) }));

        const first = await request();
        const second = await request();

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
    });
});

describe("DELETE /candidates/{id}/checkin (HTTP)", () => {
    it("fluxo feliz: desmarca presença e responde 204", async () => {
        const { token } = await avaliador();
        const candidate = await insertCandidate();

        await call(new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "PUT", headers: authed(token) }));
        const response = await call(
            new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "DELETE", headers: authed(token) }),
        );

        expect(response.status).toBe(204);
        const row = await env.DB.prepare("SELECT 1 FROM candidate_checkins WHERE candidate_id = ?")
            .bind(candidate.id)
            .first();
        expect(row).toBeNull();
    });

    it("E5 - desmarcar presença inexistente também responde 204", async () => {
        const { token } = await avaliador();
        const candidate = await insertCandidate();

        const response = await call(
            new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "DELETE", headers: authed(token) }),
        );

        expect(response.status).toBe(204);
    });

    it("E1 - candidato inexistente responde 404", async () => {
        const { token } = await avaliador();

        const response = await call(
            new Request(`http://local.test/candidates/${crypto.randomUUID()}/checkin`, {
                method: "DELETE",
                headers: authed(token),
            }),
        );

        expect(response.status).toBe(404);
    });
});

describe("Modo de manutenção em /candidates/*", () => {
    it('bloqueia com 503 quando MAINTENANCE_MODE = "true"', async () => {
        const { token } = await avaliador();

        const response = await call(new Request("http://local.test/candidates", { headers: authed(token) }), {
            MAINTENANCE_MODE: "true",
        });

        expect(response.status).toBe(503);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("MAINTENANCE_MODE");
    });
});

describe("CORS de /candidates/*", () => {
    it("preflight permite PUT e DELETE para a origin autorizada", async () => {
        const response = await call(
            new Request("http://local.test/candidates/00000000-0000-4000-8000-000000000000/checkin", {
                method: "OPTIONS",
                headers: { Origin: FRONT_ORIGIN, "Access-Control-Request-Method": "PUT" },
            }),
        );

        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FRONT_ORIGIN);
        const allowedMethods = response.headers.get("Access-Control-Allow-Methods") ?? "";
        expect(allowedMethods).toContain("PUT");
        expect(allowedMethods).toContain("DELETE");
    });

    it("origin fora da allowlist não recebe Access-Control-Allow-Origin igual à sua própria origin", async () => {
        const response = await call(
            new Request("http://local.test/candidates", {
                method: "OPTIONS",
                headers: { Origin: "https://site-estranho.test", "Access-Control-Request-Method": "GET" },
            }),
        );

        expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("https://site-estranho.test");
    });
});

describe("GET /candidates — sinalização online/presencial (FEAT-0010, US3/D7)", () => {
    it("candidato presente com restrição de sábado aparece como 'online' no shape HTTP", async () => {
        const { token } = await avaliador();
        const marca = crypto.randomUUID();
        const candidate = await insertCandidate({ name: `Http Online ${marca}` });
        await insertApplication(candidate.id, true);

        await call(new Request(`http://local.test/candidates/${candidate.id}/checkin`, { method: "PUT", headers: authed(token) }));

        const response = await call(new Request(`http://local.test/candidates?search=${marca}`, { headers: authed(token) }));
        const body = await response.json<{
            data: { items: { attendance: string | null }[]; attendanceSummary: { online: number; presencial: number } };
        }>();

        expect(response.status).toBe(200);
        expect(body.data.items[0]?.attendance).toBe("online");
        expect(body.data.attendanceSummary).toEqual({ online: 1, presencial: 0 });
    });
});

describe("GET /candidates?attendance= (FEAT-0019)", () => {
    it("attendance=presencial devolve só presenciais", async () => {
        const { token } = await avaliador();
        const marca = crypto.randomUUID();
        const online = await insertCandidate({ name: `Attendance Filtro Online ${marca}` });
        await insertApplication(online.id, true);
        await call(new Request(`http://local.test/candidates/${online.id}/checkin`, { method: "PUT", headers: authed(token) }));
        const presencial = await insertCandidate({ name: `Attendance Filtro Presencial ${marca}` });
        await insertApplication(presencial.id, false);
        await call(new Request(`http://local.test/candidates/${presencial.id}/checkin`, { method: "PUT", headers: authed(token) }));

        const response = await call(
            new Request(`http://local.test/candidates?search=${marca}&attendance=presencial`, { headers: authed(token) }),
        );
        const body = await response.json<{ data: { items: { name: string }[] } }>();

        expect(response.status).toBe(200);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0]?.name).toBe(presencial.name);
    });

    it("attendance=online devolve só online", async () => {
        const { token } = await avaliador();
        const marca = crypto.randomUUID();
        const online = await insertCandidate({ name: `Attendance Filtro Online 2 ${marca}` });
        await insertApplication(online.id, true);
        await call(new Request(`http://local.test/candidates/${online.id}/checkin`, { method: "PUT", headers: authed(token) }));
        const presencial = await insertCandidate({ name: `Attendance Filtro Presencial 2 ${marca}` });
        await insertApplication(presencial.id, false);
        await call(new Request(`http://local.test/candidates/${presencial.id}/checkin`, { method: "PUT", headers: authed(token) }));

        const response = await call(
            new Request(`http://local.test/candidates?search=${marca}&attendance=online`, { headers: authed(token) }),
        );
        const body = await response.json<{ data: { items: { name: string }[] } }>();

        expect(response.status).toBe(200);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0]?.name).toBe(online.name);
    });
});
