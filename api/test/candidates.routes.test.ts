import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import app from "../src/index";

// Testes de HTTP end-to-end (rota real, D1 real via miniflare).
let counter = 0;
function uniqueCandidateInput() {
    counter += 1;
    return {
        name: `Candidato Route ${counter}`,
        email: `candidato-route-${counter}@example.com`,
        phone: `7188888${String(counter).padStart(4, "0")}`,
        course: "eng-computacao",
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

function postRegister(body: unknown) {
    return SELF.fetch("http://local.test/candidate/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /candidate/register (HTTP)", () => {
    it("fluxo feliz: inscrição em uma única requisição (201)", async () => {
        const input = uniqueCandidateInput();

        const res = await postRegister(input);

        expect(res.status).toBe(201);
        const body = await res.json<{ data: { id: string; status: string; name: string; email: string } }>();
        expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.data.status).toBe("registered");
        expect(body.data.email).toBe(input.email);
        expect(body.data.name).toBe(input.name);
    });

    it("E3 - email com formato inválido retorna 400 com envelope de erro", async () => {
        const res = await postRegister({ ...uniqueCandidateInput(), email: "não-é-um-email" });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("INVALID_EMAIL");
        expect(body.error.field).toBe("email");
    });

    it("E4 - telefone com formato inválido retorna 400 com envelope de erro", async () => {
        const res = await postRegister({ ...uniqueCandidateInput(), phone: "123" });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("INVALID_PHONE");
        expect(body.error.field).toBe("phone");
    });

    it("valida que mejAcknowledged deve ser exatamente true (FEAT-0001 v3.0, seção 8.2)", async () => {
        const res = await postRegister({ ...uniqueCandidateInput(), mejAcknowledged: false });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { field?: string } }>();
        expect(body.error.field).toBe("mejAcknowledged");
    });

    it("E6 - origem 'outros' sem descrição retorna 400 apontando referralSourceOther", async () => {
        const res = await postRegister({ ...uniqueCandidateInput(), referralSource: "outros" });

        expect(res.status).toBe(400);
        const body = await res.json<{ error: { field?: string } }>();
        expect(body.error.field).toBe("referralSourceOther");
    });

    it("aceita origem 'outros' com descrição preenchida", async () => {
        const res = await postRegister({
            ...uniqueCandidateInput(),
            referralSource: "outros",
            referralSourceOther: "Cartaz no mural do campus",
        });

        expect(res.status).toBe(201);
    });

    it("E1 - segunda inscrição com o mesmo email retorna 409", async () => {
        const input = uniqueCandidateInput();
        expect((await postRegister(input)).status).toBe(201);

        const res = await postRegister({ ...uniqueCandidateInput(), email: input.email });

        expect(res.status).toBe(409);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
        expect(body.error.field).toBe("email");
    });

    it("E2 - segunda inscrição com o mesmo telefone retorna 409", async () => {
        const input = uniqueCandidateInput();
        expect((await postRegister(input)).status).toBe(201);

        const res = await postRegister({ ...uniqueCandidateInput(), phone: input.phone });

        expect(res.status).toBe(409);
        const body = await res.json<{ error: { code: string; field?: string } }>();
        expect(body.error.code).toBe("PHONE_ALREADY_REGISTERED");
        expect(body.error.field).toBe("phone");
    });
});

describe("Modo de manutenção", () => {
    function postRegisterWith(maintenanceMode: string) {
        const request = new Request("http://local.test/candidate/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(uniqueCandidateInput()),
        });

        return app.fetch(request, { ...env, MAINTENANCE_MODE: maintenanceMode });
    }

    it('bloqueia inscrição com 503 quando MAINTENANCE_MODE = "true"', async () => {
        const res = await postRegisterWith("true");

        expect(res.status).toBe(503);
        const body = await res.json<{ error: { code: string; message: string } }>();
        expect(body.error.code).toBe("MAINTENANCE_MODE");
        expect(body.error.message).toMatch(/manutenção/i);
    });

    it('deixa passar normalmente quando MAINTENANCE_MODE = "false"', async () => {
        const res = await postRegisterWith("false");

        expect(res.status).toBe(201);
    });
});
