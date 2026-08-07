import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../src/index";
import { signAccessToken } from "../src/lib/access-token";

/**
 * Testes de HTTP: o que só existe na camada da rota — atributos do cookie,
 * CORS, códigos de status, modo de manutenção e o middleware de JWT. A lógica
 * dos fluxos está em `auth.service.test.ts`.
 *
 * Usa `app.fetch(request, env, ctx)` em vez de `SELF.fetch` por dois motivos:
 * os secrets (`JWT_SECRET` e companhia) não existem no `wrangler.jsonc` e
 * precisam ser injetados, e rodar no mesmo isolate do teste é o que permite
 * substituir o `fetch` global pela Supabase falsa.
 */

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

function testEnv(overrides: Record<string, unknown> = {}) {
    return {
        ...env,
        JWT_SECRET,
        FRONT_ORIGIN,
        SUPABASE_URL: "https://tec.supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
        RESEND_API_KEY: "resend-de-teste",
        RESEND_FROM_EMAIL: "acesso@exemplo.test",
        ...overrides,
    } as unknown as CloudflareBindings;
}

async function call(request: Request, envOverrides: Record<string, unknown> = {}) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, testEnv(envOverrides), ctx);
    // Espera o que foi para o `waitUntil` (o envio de email), senão o teste
    // termina antes de o trabalho diferido rodar.
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

let counter = 0;

/**
 * Substitui o `fetch` global — é assim que a Supabase é dublada no nível HTTP.
 * `member` nulo simula "não é membro"; `status` diferente de 200 simula o
 * diretório fora do ar.
 */
const realFetch = globalThis.fetch;

function stubDirectory(options: { member?: unknown; status?: number; reject?: boolean }) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.includes("supabase.test")) {
            if (options.reject) throw new Error("network down");
            if (options.status && options.status !== 200) {
                return new Response("erro", { status: options.status });
            }
            return Response.json(options.member ? [options.member] : []);
        }

        // Resend e qualquer outra chamada externa: aceita silenciosamente.
        if (url.includes("api.resend.com")) {
            return Response.json({ id: "email-de-teste" });
        }

        return realFetch(input, init);
    }) as typeof fetch;
}

function tecMember(overrides: Record<string, unknown> = {}) {
    counter += 1;

    return {
        id: 90_000 + counter,
        full_name: `Membro Rota ${counter}`,
        email: `membro-rota-${counter}@cimatecjr.com.br`,
        phone: `7197776${String(counter).padStart(4, "0")}`,
        birth_date: "2003-05-12",
        course: "Engenharia de Computação",
        semester: 5,
        gender: "Masculino",
        ethnicity: "Parda",
        status: "active",
        manager: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

interface SessionBody {
    data: { accessToken: string; expiresIn: number; user: { id: string; email: string; role: string } };
}

/** Extrai o valor do refresh token do `Set-Cookie`, como o navegador faria. */
function refreshCookieFrom(response: Response): string | undefined {
    const header = response.headers.get("Set-Cookie");
    const match = header?.match(/refresh_token=([^;]*)/);

    return match?.[1] || undefined;
}

async function registerViaHttp(overrides: Record<string, unknown> = {}, password = "senha-de-teste") {
    const member = tecMember(overrides);
    stubDirectory({ member });

    const response = await call(postJson("/auth/register", { email: member.email, password }));
    // O corpo é lido uma vez só (o stream não pode ser relido) e devolvido
    // cru junto do parse, para os testes que precisam inspecionar o texto.
    const rawBody = await response.text();

    return {
        member,
        password,
        response,
        rawBody,
        body: JSON.parse(rawBody) as SessionBody,
        refreshToken: refreshCookieFrom(response),
    };
}

beforeEach(() => {
    stubDirectory({ member: null });
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("POST /auth/register (HTTP)", () => {
    it("cria a conta, responde 201 e já entrega a sessão", async () => {
        const { member, response, body } = await registerViaHttp();

        expect(response.status).toBe(201);
        expect(body.data.user.email).toBe(member.email);
        expect(body.data.user.role).toBe("avaliador");
        expect(body.data.expiresIn).toBe(900);
    });

    it("manda o refresh token no cookie, com todos os atributos que a spec exige", async () => {
        const { response } = await registerViaHttp();
        const cookie = response.headers.get("Set-Cookie") ?? "";

        expect(cookie).toContain("refresh_token=");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        // SameSite=None é obrigatório: front e API estão em domínios diferentes,
        // e com o Lax padrão o cookie nunca chegaria ao /auth/refresh.
        expect(cookie).toContain("SameSite=None");
        expect(cookie).toContain("Path=/auth");
        expect(cookie).toContain("Max-Age=604800");
    });

    it("NUNCA devolve o refresh token no corpo — se estiver lá, o HttpOnly perde o sentido", async () => {
        const { rawBody, refreshToken } = await registerViaHttp();

        expect(refreshToken).toBeTruthy();
        expect(rawBody).not.toContain(refreshToken!);
    });

    it("E2 - responde 403 NOT_A_MEMBER quando a Supabase não devolve linha", async () => {
        stubDirectory({ member: null });

        const response = await call(
            postJson("/auth/register", { email: "estranho@exemplo.com", password: "senha-de-teste" }),
        );

        expect(response.status).toBe(403);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("NOT_A_MEMBER");
    });

    it("E3 - responde 403 MEMBER_NOT_ACTIVE, distinto de E2", async () => {
        const member = tecMember({ status: "alumni" });
        stubDirectory({ member });

        const response = await call(
            postJson("/auth/register", { email: member.email, password: "senha-de-teste" }),
        );

        expect(response.status).toBe(403);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("MEMBER_NOT_ACTIVE");
    });

    it.each([
        ["não-2xx", { status: 500 }],
        ["erro de rede", { reject: true }],
    ])("E5 - %s na Supabase vira 503, não 403", async (_label, options) => {
        stubDirectory(options);

        const response = await call(
            postJson("/auth/register", { email: "alguem@cimatecjr.com.br", password: "senha-de-teste" }),
        );

        // 503 (transitório) e não 403 (definitivo): a UI precisa mandar tentar
        // de novo, não dizer ao membro que ele não pertence à empresa.
        expect(response.status).toBe(503);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("MEMBER_DIRECTORY_UNAVAILABLE");
    });

    it("E4 - senha curta responde 400 WEAK_PASSWORD apontando o campo", async () => {
        const response = await call(
            postJson("/auth/register", { email: "alguem@cimatecjr.com.br", password: "curta" }),
        );

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("WEAK_PASSWORD");
        expect(body.error.field).toBe("password");
    });

    it("E1 - segundo cadastro com o mesmo email responde 409", async () => {
        const { member } = await registerViaHttp();
        stubDirectory({ member });

        const response = await call(
            postJson("/auth/register", { email: member.email, password: "outra-senha" }),
        );

        expect(response.status).toBe(409);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    });
});

describe("POST /auth/login (HTTP)", () => {
    it("responde 200 com sessão e cookie novo", async () => {
        const { member, password } = await registerViaHttp();

        const response = await call(postJson("/auth/login", { email: member.email, password }));

        expect(response.status).toBe(200);
        expect(response.headers.get("Set-Cookie")).toContain("SameSite=None");
    });

    it("E7 - email inexistente e senha errada devolvem respostas idênticas", async () => {
        const { member } = await registerViaHttp();

        const wrongPassword = await call(
            postJson("/auth/login", { email: member.email, password: "senha-errada" }),
        );
        const unknownEmail = await call(
            postJson("/auth/login", { email: "ninguem@exemplo.com", password: "senha-errada" }),
        );

        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);
        // Byte a byte: qualquer diferença aqui reintroduz o verificador de contas.
        expect(await unknownEmail.text()).toBe(await wrongPassword.text());
    });
});

describe("POST /auth/refresh (HTTP)", () => {
    it("rotaciona e devolve um cookie novo", async () => {
        const { refreshToken } = await registerViaHttp();

        const response = await call(
            new Request("http://local.test/auth/refresh", {
                method: "POST",
                headers: { Cookie: `refresh_token=${refreshToken}` },
            }),
        );

        expect(response.status).toBe(200);
        const rotated = refreshCookieFrom(response);
        expect(rotated).toBeTruthy();
        expect(rotated).not.toBe(refreshToken);

        const body = await response.json<{ data: { accessToken: string; expiresIn: number } }>();
        expect(body.data.accessToken).toBeTruthy();
        // O refresh não devolve dados do usuário — só a sessão renovada.
        expect(Object.keys(body.data)).toEqual(["accessToken", "expiresIn"]);
    });

    it("E8 - sem cookie responde 401 MISSING_REFRESH_TOKEN", async () => {
        const response = await call(
            new Request("http://local.test/auth/refresh", { method: "POST" }),
        );

        expect(response.status).toBe(401);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("MISSING_REFRESH_TOKEN");
    });

    it("E9 - token inválido responde 401 e apaga o cookie", async () => {
        const response = await call(
            new Request("http://local.test/auth/refresh", {
                method: "POST",
                headers: { Cookie: "refresh_token=nao-existe" },
            }),
        );

        expect(response.status).toBe(401);
        expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });
});

describe("POST /auth/logout (HTTP)", () => {
    it("responde 204 e apaga o cookie", async () => {
        const { refreshToken } = await registerViaHttp();

        const response = await call(
            new Request("http://local.test/auth/logout", {
                method: "POST",
                headers: { Cookie: `refresh_token=${refreshToken}` },
            }),
        );

        expect(response.status).toBe(204);
        const cookie = response.headers.get("Set-Cookie") ?? "";
        expect(cookie).toContain("Max-Age=0");
        expect(cookie).toContain("Path=/auth");
    });

    it("é idempotente: sem cookie e com cookie já usado também respondem 204", async () => {
        const semCookie = await call(new Request("http://local.test/auth/logout", { method: "POST" }));
        expect(semCookie.status).toBe(204);

        const { refreshToken } = await registerViaHttp();
        const primeiro = await call(
            new Request("http://local.test/auth/logout", {
                method: "POST",
                headers: { Cookie: `refresh_token=${refreshToken}` },
            }),
        );
        const segundo = await call(
            new Request("http://local.test/auth/logout", {
                method: "POST",
                headers: { Cookie: `refresh_token=${refreshToken}` },
            }),
        );

        expect(primeiro.status).toBe(204);
        expect(segundo.status).toBe(204);
    });
});

describe("GET /auth/me e o middleware de JWT", () => {
    function getMe(headers: Record<string, string> = {}) {
        return call(new Request("http://local.test/auth/me", { headers }));
    }

    it("devolve o membro autenticado", async () => {
        const { member, body } = await registerViaHttp();

        const response = await getMe({ Authorization: `Bearer ${body.data.accessToken}` });

        expect(response.status).toBe(200);
        const me = await response.json<{ data: { email: string; profile: { memberId: number } } }>();
        expect(me.data.email).toBe(member.email);
        expect(me.data.profile.memberId).toBe(member.id);
    });

    it("E11 - sem header responde 401 INVALID_TOKEN", async () => {
        const response = await getMe();

        expect(response.status).toBe(401);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("INVALID_TOKEN");
    });

    it("E11 - token assinado com outro secret responde INVALID_TOKEN", async () => {
        const foreign = await signAccessToken(
            { sub: crypto.randomUUID(), email: "a@b.com", role: "avaliador", sid: crypto.randomUUID() },
            "outro-segredo-completamente-diferente",
        );

        const response = await getMe({ Authorization: `Bearer ${foreign}` });

        expect(response.status).toBe(401);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("INVALID_TOKEN");
    });

    it("E11 - token expirado responde TOKEN_EXPIRED, e NÃO INVALID_TOKEN", async () => {
        const { body } = await registerViaHttp();
        const claims = JSON.parse(atob(body.data.accessToken.split(".")[1])) as { sub: string };

        const expired = await signAccessToken(
            { sub: claims.sub, email: "a@b.com", role: "avaliador", sid: crypto.randomUUID() },
            JWT_SECRET,
            -60,
        );

        const response = await getMe({ Authorization: `Bearer ${expired}` });

        expect(response.status).toBe(401);
        const error = await response.json<{ error: { code: string } }>();
        // A distinção é requisito funcional: TOKEN_EXPIRED manda o front
        // renovar, INVALID_TOKEN manda deslogar. Colapsar os dois deslogaria o
        // membro a cada 15 minutos.
        expect(error.error.code).toBe("TOKEN_EXPIRED");
    });

    it("não aceita o access token por cookie ou query string, só pelo header", async () => {
        const { body } = await registerViaHttp();

        const viaCookie = await getMe({ Cookie: `access_token=${body.data.accessToken}` });
        expect(viaCookie.status).toBe(401);

        const viaQuery = await call(
            new Request(`http://local.test/auth/me?token=${body.data.accessToken}`),
        );
        expect(viaQuery.status).toBe(401);
    });
});

describe("Recuperação de senha (HTTP)", () => {
    it("responde 202 idêntico para email cadastrado e desconhecido", async () => {
        const { member } = await registerViaHttp();

        const conhecido = await call(postJson("/auth/forgot-password", { email: member.email }));
        const desconhecido = await call(
            postJson("/auth/forgot-password", { email: "ninguem@exemplo.com" }),
        );

        expect(conhecido.status).toBe(202);
        expect(desconhecido.status).toBe(202);
        expect(await desconhecido.text()).toBe(await conhecido.text());
    });

    it("E14 - token de recuperação inválido responde 400", async () => {
        const response = await call(
            postJson("/auth/reset-password", { token: "inventado", password: "senha-nova-forte" }),
        );

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("E15 - senha nova fora da política responde 400 WEAK_PASSWORD", async () => {
        const response = await call(
            postJson("/auth/reset-password", { token: "qualquer", password: "curta" }),
        );

        expect(response.status).toBe(400);
        const body = await response.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("WEAK_PASSWORD");
        expect(body.error.field).toBe("password");
    });
});

describe("CORS de /auth/*", () => {
    it("libera a origin do front com credentials", async () => {
        const response = await call(
            new Request("http://local.test/auth/refresh", {
                method: "OPTIONS",
                headers: {
                    Origin: FRONT_ORIGIN,
                    "Access-Control-Request-Method": "POST",
                },
            }),
        );

        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FRONT_ORIGIN);
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("NÃO reflete uma origin desconhecida — é o que separa /auth de /candidate", async () => {
        const response = await call(
            new Request("http://local.test/auth/refresh", {
                method: "OPTIONS",
                headers: {
                    Origin: "https://site-malicioso.test",
                    "Access-Control-Request-Method": "POST",
                },
            }),
        );

        // Refletir aqui, com `credentials: true`, entregaria o cookie de sessão
        // a qualquer site que pedisse.
        expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe(
            "https://site-malicioso.test",
        );
    });

    it("/candidate/* libera geral com `*` — e é exatamente por isso que /auth precisa do seu próprio", async () => {
        const response = await call(
            new Request("http://local.test/candidate/register", {
                method: "OPTIONS",
                headers: {
                    Origin: "https://qualquer-um.test",
                    "Access-Control-Request-Method": "POST",
                },
            }),
        );

        // Correto para um fluxo público sem credenciais, e incompatível com
        // cookie: o navegador nem aceita `*` junto de `credentials: true`.
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });
});

describe("Modo de manutenção em /auth/*", () => {
    it('bloqueia com 503 quando MAINTENANCE_MODE = "true"', async () => {
        const response = await call(
            postJson("/auth/login", { email: "alguem@exemplo.com", password: "senha-de-teste" }),
            { MAINTENANCE_MODE: "true" },
        );

        expect(response.status).toBe(503);
        const body = await response.json<{ error: { code: string; message: string } }>();
        expect(body.error.code).toBe("MAINTENANCE_MODE");
        expect(body.error.message).toMatch(/manutenção/i);
    });

    it("deixa passar normalmente quando desligado", async () => {
        const { member, password } = await registerViaHttp();

        const response = await call(postJson("/auth/login", { email: member.email, password }), {
            MAINTENANCE_MODE: "false",
        });

        expect(response.status).toBe(200);
    });

    it("o 503 de manutenção carrega os headers de CORS, senão o front vê erro de CORS", async () => {
        const response = await call(
            postJson(
                "/auth/login",
                { email: "alguem@exemplo.com", password: "senha-de-teste" },
                { Origin: FRONT_ORIGIN },
            ),
            { MAINTENANCE_MODE: "true" },
        );

        expect(response.status).toBe(503);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FRONT_ORIGIN);
    });
});

describe("Escopo do cookie", () => {
    it("o refresh token fica em Path=/auth e não acompanha requisições de negócio", async () => {
        const { response } = await registerViaHttp();

        // Não é uma asserção sobre o Worker, e sim sobre o contrato com o
        // navegador: com Path=/auth, /candidate/* nunca recebe a credencial.
        expect(response.headers.get("Set-Cookie")).toContain("Path=/auth");
    });
});
