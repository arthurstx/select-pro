import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de HTTP end-to-end (rota real, D1/KV reais via miniflare). O fetch
 * global é stubado para nunca bater no Resend de verdade — capturamos o
 * corpo da requisição (que contém o OTC em texto plano, exatamente como o
 * candidato receberia por email) em vez de tentar recuperar o código a
 * partir do hash.
 */
const sentEmails: { to: string; code: string }[] = [];

function stubResendFetch() {
    sentEmails.length = 0;

    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (!url.includes("resend.com")) {
                throw new Error(`chamada de rede inesperada em teste: ${url}`);
            }

            const bodyText = typeof init?.body === "string" ? init.body : "{}";
            const payload = JSON.parse(bodyText) as { to: string; text: string };
            const match = /código de confirmação é: (\d{6})/.exec(payload.text);
            if (match) sentEmails.push({ to: payload.to, code: match[1] });

            return new Response(JSON.stringify({ id: "test-email-id" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
}

function lastSentCode(): string {
    const last = sentEmails.at(-1);
    if (!last) throw new Error("nenhum email capturado no stub do Resend");
    return last.code;
}

let counter = 0;
function uniqueCandidateInput() {
    counter += 1;
    return {
        name: `Candidato Route ${counter}`,
        email: `candidato-route-${counter}@example.com`,
        phone: `7188888${String(counter).padStart(4, "0")}`,
        course: "eng-comp",
        semester: 3,
        gender: "outro",
        ethnicity: "nao-informado",
        referralSource: "linkedin",
        mejAcknowledged: true,
        experience: "Já participei de projetos de extensão e hackathons.",
        motivation: "Quero aplicar o que aprendo na prática.",
        saturdayRestriction: false,
        specialNeeds: false,
    };
}

describe("POST /candidate/pre-register e /candidate/confirm-otc (HTTP)", () => {
    beforeEach(() => {
        stubResendFetch();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fluxo feliz completo: pre-register (201) -> confirm-otc (200)", async () => {
        const input = uniqueCandidateInput();

        const preRegisterRes = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
        });
        expect(preRegisterRes.status).toBe(201);
        const preRegisterBody = await preRegisterRes.json<{ data: { pendingId: string; expiresAt: string } }>();
        expect(preRegisterBody.data.pendingId).toMatch(/^[0-9a-f-]{36}$/);

        const confirmRes = await SELF.fetch("http://local.test/candidate/confirm-otc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pendingId: preRegisterBody.data.pendingId, code: lastSentCode() }),
        });
        expect(confirmRes.status).toBe(200);
        const confirmBody = await confirmRes.json<{ data: { id: string; status: string; email: string } }>();
        expect(confirmBody.data.status).toBe("confirmed");
        expect(confirmBody.data.email).toBe(input.email);
        expect(confirmBody.data.id).not.toBe(preRegisterBody.data.pendingId);
    });

    it("E3 - email com formato inválido retorna 400 com envelope de erro", async () => {
        const res = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...uniqueCandidateInput(), email: "não-é-um-email" }),
        });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("INVALID_EMAIL");
        expect(body.error.field).toBe("email");
    });

    it("E4 - telefone com formato inválido retorna 400 com envelope de erro", async () => {
        const res = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...uniqueCandidateInput(), phone: "123" }),
        });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("INVALID_PHONE");
        expect(body.error.field).toBe("phone");
    });

    it("valida que mejAcknowledged deve ser exatamente true (FEAT-0001 v2.0, seção 8.2)", async () => {
        const res = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...uniqueCandidateInput(), mejAcknowledged: false }),
        });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.field).toBe("mejAcknowledged");
    });

    it("E1 - pre-register com email já confirmado retorna 409", async () => {
        const input = uniqueCandidateInput();
        const preRegisterRes = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
        });
        const { data } = await preRegisterRes.json<{ data: { pendingId: string } }>();

        await SELF.fetch("http://local.test/candidate/confirm-otc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pendingId: data.pendingId, code: lastSentCode() }),
        });

        const res = await SELF.fetch("http://local.test/candidate/pre-register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...uniqueCandidateInput(), email: input.email }),
        });

        expect(res.status).toBe(409);
        const body = await res.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    });

    it("E5 - confirm-otc com pendingId inexistente retorna 410", async () => {
        const res = await SELF.fetch("http://local.test/candidate/confirm-otc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pendingId: crypto.randomUUID(), code: "123456" }),
        });

        expect(res.status).toBe(410);
        const body = await res.json<{ error: { code: string } }>();
        expect(body.error.code).toBe("OTC_NOT_FOUND");
    });
});
