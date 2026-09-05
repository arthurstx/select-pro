import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";
import { hashOpaqueToken } from "../src/lib/opaque-token";

// `decide()` despacha email via `defer` (waitUntil), com o `ResendMailer`
// real — sem estuba isso, um `POST .../decision` bateria de verdade em
// `api.resend.com` (mesma armadilha que `auth.routes.test.ts` já resolve
// com `stubDirectory`).
const realFetch = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = (async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.includes("api.resend.com")) {
            return Response.json({ id: "email-de-teste" });
        }

        return realFetch(input, init);
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

// Testes de HTTP: auth/autorização, envelope de erro, status codes. A lógica
// de negócio está em signup-requests.service.test.ts (mesma divisão que
// auth.routes.test.ts/auth.service.test.ts já usam).
//
// Storage do D1 não é isolado por `it()` neste pool — cada seed usa dados
// únicos por chamada (mesma disciplina de dashboard.routes.test.ts).

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

function testEnv(overrides: Record<string, unknown> = {}) {
    return {
        ...env,
        JWT_SECRET,
        FRONT_ORIGIN,
        RESEND_API_KEY: "resend-de-teste",
        RESEND_FROM_EMAIL: "acesso@exemplo.test",
        SIGNUP_APPROVAL_EMAIL: "gentegestao@cimatecjr.com.br",
        ...overrides,
    } as unknown as CloudflareBindings;
}

async function call(request: Request, envOverrides: Record<string, unknown> = {}) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, testEnv(envOverrides), ctx);
    await waitOnExecutionContext(ctx);

    return response;
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`http://local.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

function authed(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

let counter = 0;

/** `role` é uma claim do JWT — mesmo padrão de dashboard.routes.test.ts. */
async function tokenFor(role: "admin" | "avaliador"): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();

    await env.DB.prepare("INSERT INTO users (id, role_id, email, name) VALUES (?, ?, ?, ?)")
        .bind(id, role, `user-sr-rota-${counter}@example.com`, `Membro Rota ${counter}`)
        .run();

    return signAccessToken({ sub: id, email: `${id}@example.com`, role, sid: "test-sid" }, JWT_SECRET);
}

/** Seed direto no banco — este arquivo testa HTTP, não o fluxo de criação (isso é auth.routes.test.ts). */
async function createPendingSignupRequest(
    overrides: { status?: string; email?: string } = {},
): Promise<{ id: string; token: string; email: string }> {
    counter += 1;
    const id = crypto.randomUUID();
    const email = overrides.email ?? `pendente-rota-${counter}@cimatecjr.com.br`;
    const token = crypto.randomUUID();

    await env.DB.prepare(
        `INSERT INTO signup_requests
            (id, email, password_hash, member_id, full_name, phone, birth_date,
             course, semester, gender, ethnicity, member_status, manager, status)
         VALUES (?, ?, 'hash', ?, ?, '71988880000', '2003-01-01', 'Engenharia de Computação', 5, 'Masculino', 'Parda', ?, 0, 'pending')`,
    )
        .bind(id, email, crypto.randomUUID(), `Pendente Rota ${counter}`, overrides.status ?? "post_junior")
        .run();

    await env.DB.prepare(
        `INSERT INTO signup_approval_tokens (id, signup_request_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            id,
            await hashOpaqueToken(token),
            new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        )
        .run();

    return { id, token, email };
}

// ============================================================
// POST /auth/signup-requests — trilha auto-declarada (FEAT-0008, emenda 2026-09-04)
// ============================================================

function selfDeclaredBody(overrides: Record<string, unknown> = {}) {
    counter += 1;

    return {
        email: `trainee-rota-${counter}@example.com`,
        password: "senha-de-teste",
        memberStatus: "trainee",
        fullName: `Candidato Rota ${counter}`,
        phone: "(71) 98888-7777",
        course: "eng-computacao",
        semester: 3,
        gender: "masculino",
        ethnicity: "parda",
        ...overrides,
    };
}

describe("POST /auth/signup-requests (HTTP)", () => {
    it("202 sem Authorization — qualquer email pode se auto-declarar (FR-001-D)", async () => {
        const body = selfDeclaredBody();

        const response = await call(postJson("/auth/signup-requests", body));
        const json = await response.json<{ data: { status: string; message: string } }>();

        expect(response.status).toBe(202);
        expect(json.data.status).toBe("pending_approval");
        expect(json.data.message).toBeTruthy();
    });

    it("grava o telefone em E.164 mesmo recebendo com máscara", async () => {
        const body = selfDeclaredBody({ phone: "(71) 98888-7777" });

        await call(postJson("/auth/signup-requests", body));

        const row = await env.DB.prepare("SELECT phone FROM signup_requests WHERE email = ?")
            .bind(body.email)
            .first<{ phone: string }>();
        expect(row?.phone).toBe("+5571988887777");
    });

    it("memberStatus 'active' é rejeitado (400) antes de qualquer gravação — FR-001-C/SC-008", async () => {
        const body = selfDeclaredBody({ memberStatus: "active" });

        const response = await call(postJson("/auth/signup-requests", body));

        expect(response.status).toBe(400);
        const json = await response.json<{ error: { code: string } }>();
        expect(json.error.code).toBe("VALIDATION_ERROR");

        const count = await env.DB.prepare(
            "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
        )
            .bind(body.email)
            .first<{ total: number }>();
        expect(count?.total).toBe(0);
    });

    it("não existe nenhuma linha com member_status = 'active' em signup_requests", async () => {
        const row = await env.DB.prepare(
            "SELECT COUNT(*) AS total FROM signup_requests WHERE member_status = 'active'",
        ).first<{ total: number }>();
        expect(row?.total).toBe(0);
    });

    it("senha curta responde 400 WEAK_PASSWORD apontando o campo", async () => {
        const body = selfDeclaredBody({ password: "curta" });

        const response = await call(postJson("/auth/signup-requests", body));

        expect(response.status).toBe(400);
        const json = await response.json<{ error: { code: string; field?: string } }>();
        expect(json.error.code).toBe("WEAK_PASSWORD");
        expect(json.error.field).toBe("password");
    });

    it("fullName ausente responde 400 VALIDATION_ERROR apontando o campo", async () => {
        const { fullName: _omit, ...rest } = selfDeclaredBody();

        const response = await call(postJson("/auth/signup-requests", rest));

        expect(response.status).toBe(400);
        const json = await response.json<{ error: { code: string; field?: string } }>();
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.field).toBe("fullName");
    });

    it("course inválido responde 400 VALIDATION_ERROR apontando o campo", async () => {
        const body = selfDeclaredBody({ course: "curso-que-nao-existe" });

        const response = await call(postJson("/auth/signup-requests", body));

        expect(response.status).toBe(400);
        const json = await response.json<{ error: { code: string; field?: string } }>();
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.field).toBe("course");
    });

    it("email já cadastrado responde 409", async () => {
        const body = selfDeclaredBody();

        await env.DB.prepare(
            `INSERT INTO users (id, role_id, email, name, password) VALUES (?, 'avaliador', ?, 'Já Cadastrado', 'hash')`,
        )
            .bind(crypto.randomUUID(), body.email)
            .run();

        const response = await call(postJson("/auth/signup-requests", body));

        expect(response.status).toBe(409);
        const json = await response.json<{ error: { code: string } }>();
        expect(json.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    });

    it("nunca consulta a Supabase — sem SUPABASE_URL no env, uma tentativa de fetch quebraria o teste", async () => {
        const body = selfDeclaredBody();

        const response = await call(postJson("/auth/signup-requests", body), {
            SUPABASE_URL: undefined,
            SUPABASE_SERVICE_ROLE_KEY: undefined,
        });

        expect(response.status).toBe(202);
    });
});

// ============================================================
// GET /auth/signup-requests
// ============================================================

describe("GET /auth/signup-requests (HTTP)", () => {
    it("401 sem Authorization", async () => {
        const response = await call(new Request("http://local.test/auth/signup-requests"));

        expect(response.status).toBe(401);
    });

    it("403 para avaliador — só admin decide quem entra na empresa", async () => {
        const token = await tokenFor("avaliador");

        const response = await call(
            new Request("http://local.test/auth/signup-requests", { headers: authed(token) }),
        );

        expect(response.status).toBe(403);
    });

    it("200 para admin, e a solicitação criada aparece na fila pending", async () => {
        const admin = await tokenFor("admin");
        const { email } = await createPendingSignupRequest();

        const response = await call(
            new Request("http://local.test/auth/signup-requests?status=pending", {
                headers: authed(admin),
            }),
        );
        const body = await response.json<{ data: { email: string }[] }>();

        expect(response.status).toBe(200);
        expect(body.data.map((r) => r.email)).toContain(email);
    });

    it("filtra por status — aprovadas não aparecem em pending", async () => {
        const admin = await tokenFor("admin");
        const { id, email } = await createPendingSignupRequest();

        await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { ...authed(admin), "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );

        const pending = await call(
            new Request("http://local.test/auth/signup-requests?status=pending", {
                headers: authed(admin),
            }),
        );
        const approved = await call(
            new Request("http://local.test/auth/signup-requests?status=approved", {
                headers: authed(admin),
            }),
        );

        const pendingBody = await pending.json<{ data: { email: string }[] }>();
        const approvedBody = await approved.json<{ data: { email: string }[] }>();

        expect(pendingBody.data.map((r) => r.email)).not.toContain(email);
        expect(approvedBody.data.map((r) => r.email)).toContain(email);
    });
});

// ============================================================
// GET /auth/signup-requests/by-token/:token
// ============================================================

describe("GET /auth/signup-requests/by-token/:token (HTTP)", () => {
    it("200 SEM Authorization — é o destino do link do email (FR-007)", async () => {
        const { token, email } = await createPendingSignupRequest();

        const response = await call(
            new Request(`http://local.test/auth/signup-requests/by-token/${token}`),
        );
        const body = await response.json<{ data: { email: string; status: string } }>();

        expect(response.status).toBe(200);
        expect(body.data.email).toBe(email);
        expect(body.data.status).toBe("pending");
    });

    it("abrir o link repetidamente não muda o estado (FR-007/SC-002)", async () => {
        const { token, id } = await createPendingSignupRequest();

        await call(new Request(`http://local.test/auth/signup-requests/by-token/${token}`));
        await call(new Request(`http://local.test/auth/signup-requests/by-token/${token}`));
        const third = await call(
            new Request(`http://local.test/auth/signup-requests/by-token/${token}`),
        );
        const body = await third.json<{ data: { status: string } }>();

        expect(body.data.status).toBe("pending");

        const row = await env.DB.prepare("SELECT status FROM signup_requests WHERE id = ?")
            .bind(id)
            .first<{ status: string }>();
        expect(row?.status).toBe("pending");
    });

    it("404 para token inexistente", async () => {
        const response = await call(
            new Request("http://local.test/auth/signup-requests/by-token/token-que-nunca-existiu"),
        );

        expect(response.status).toBe(404);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("SIGNUP_REQUEST_NOT_FOUND");
    });
});

// ============================================================
// POST /auth/signup-requests/:id/decision
// ============================================================

describe("POST /auth/signup-requests/:id/decision (HTTP)", () => {
    it("401 sem Authorization — o link do email sozinho NUNCA decide (R2)", async () => {
        const { id } = await createPendingSignupRequest();

        const response = await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );

        expect(response.status).toBe(401);

        const row = await env.DB.prepare("SELECT status FROM signup_requests WHERE id = ?")
            .bind(id)
            .first<{ status: string }>();
        expect(row?.status).toBe("pending");
    });

    it("403 para avaliador", async () => {
        const token = await tokenFor("avaliador");
        const { id } = await createPendingSignupRequest();

        const response = await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { ...authed(token), "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );

        expect(response.status).toBe(403);
    });

    it("204 para admin, e a conta passa a existir", async () => {
        const admin = await tokenFor("admin");
        const { id, email } = await createPendingSignupRequest();

        const response = await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { ...authed(admin), "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );

        expect(response.status).toBe(204);

        const user = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE email = ?")
            .bind(email)
            .first<{ total: number }>();
        expect(user?.total).toBe(1);
    });

    it("FR-010/SC-004 - segunda decisão sobre a mesma solicitação responde 409", async () => {
        const admin = await tokenFor("admin");
        const { id } = await createPendingSignupRequest();

        await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { ...authed(admin), "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );
        const second = await call(
            new Request(`http://local.test/auth/signup-requests/${id}/decision`, {
                method: "POST",
                headers: { ...authed(admin), "content-type": "application/json" },
                body: JSON.stringify({ decision: "reject" }),
            }),
        );

        expect(second.status).toBe(409);
        const body = await second.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("SIGNUP_REQUEST_ALREADY_DECIDED");
    });

    it("404 para id inexistente", async () => {
        const admin = await tokenFor("admin");

        const response = await call(
            new Request(`http://local.test/auth/signup-requests/${crypto.randomUUID()}/decision`, {
                method: "POST",
                headers: { ...authed(admin), "content-type": "application/json" },
                body: JSON.stringify({ decision: "approve" }),
            }),
        );

        expect(response.status).toBe(404);
    });
});
