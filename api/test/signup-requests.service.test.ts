import { env } from "cloudflare:test";
import type { SelfDeclaredSignupDTO } from "shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { Mailer } from "../src/lib/mailer";
import { AuthRepository } from "../src/repositories/auth.repository";
import { SignupRequestsRepository } from "../src/repositories/signup-requests.repository";
import { SignupRequestsService } from "../src/services/signup-requests.service";

// Testes do service contra o D1 real do miniflare (mesmo padrão de
// auth.service.test.ts) — o provedor de email é um dublê.
//
// `createSelfDeclared` (FEAT-0008, emenda 2026-09-04) substitui o antigo
// `create(member: TecMember, ...)`: não consulta a Supabase, todo dado de
// perfil vem do próprio payload auto-declarado.

class FakeMailer implements Mailer {
    resetSent: { to: string; resetUrl: string }[] = [];
    approvalRequestsSent: { to: string; memberName: string; memberStatusLabel: string; reviewUrl: string }[] = [];
    decisionResultsSent: { to: string; approved: boolean }[] = [];
    shouldFail = false;

    async sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
        if (this.shouldFail) throw new Error("Resend fora do ar");
        this.resetSent.push(params);
    }

    async sendSignupApprovalRequest(params: {
        to: string;
        memberName: string;
        memberStatusLabel: string;
        reviewUrl: string;
    }): Promise<void> {
        if (this.shouldFail) throw new Error("Resend fora do ar");
        this.approvalRequestsSent.push(params);
    }

    async sendSignupDecisionResult(params: { to: string; approved: boolean }): Promise<void> {
        if (this.shouldFail) throw new Error("Resend fora do ar");
        this.decisionResultsSent.push(params);
    }
}

const FRONT_ORIGIN = "https://app.exemplo.test";
const SIGNUP_APPROVAL_EMAIL = "gentegestao@cimatecjr.com.br";

let counter = 0;

function selfDeclaredInput(overrides: Partial<SelfDeclaredSignupDTO> = {}): SelfDeclaredSignupDTO {
    counter += 1;

    return {
        email: `trainee-sr-${counter}@example.com`,
        password: "senha-de-teste",
        memberStatus: "trainee",
        fullName: `Candidato Auto-declarado ${counter}`,
        phone: `+557198887${String(counter).padStart(4, "0")}`,
        course: "eng-computacao",
        semester: 3,
        gender: "masculino",
        ethnicity: "parda",
        ...overrides,
    };
}

describe("SignupRequestsService", () => {
    let repository: SignupRequestsRepository;
    let authRepository: AuthRepository;
    let mailer: FakeMailer;
    let service: SignupRequestsService;
    let deferred: Promise<unknown>[];
    let ADMIN_USER_ID: string;

    beforeEach(() => {
        repository = new SignupRequestsRepository(env.DB);
        authRepository = new AuthRepository(env.DB);
        mailer = new FakeMailer();
        deferred = [];
        ADMIN_USER_ID = crypto.randomUUID();

        service = new SignupRequestsService({
            repository,
            authRepository,
            mailer,
            frontOrigin: FRONT_ORIGIN,
            signupApprovalEmail: SIGNUP_APPROVAL_EMAIL,
            defer: (promise) => {
                deferred.push(promise);
            },
        });

        // Admin que decide as solicitações — precisa existir por causa da FK
        // `signup_requests.decided_by -> users(id)`. Email único por teste:
        // mesmo com storage isolado por teste, um valor fixo é frágil demais
        // para depender disso.
        counter += 1;
        return env.DB.prepare(
            `INSERT INTO users (id, role_id, email, name, password) VALUES (?, 'admin', ?, 'Admin de Teste', 'hash')`,
        )
            .bind(ADMIN_USER_ID, `admin-sr-teste-${counter}@cimatecjr.com.br`)
            .run();
    });

    async function settleDeferred(): Promise<void> {
        await Promise.all(deferred);
    }

    function extractToken(reviewUrl: string): string {
        return decodeURIComponent(reviewUrl.split("/solicitacoes/")[1]);
    }

    // ============================================================
    // createSelfDeclared()
    // ============================================================

    describe("createSelfDeclared", () => {
        it("grava a solicitação com os dados do formulário e o hash da senha", async () => {
            const input = selfDeclaredInput();

            const result = await service.createSelfDeclared(input);
            await settleDeferred();

            expect(result.isRight()).toBe(true);

            const row = await env.DB.prepare("SELECT * FROM signup_requests WHERE email = ?")
                .bind(input.email)
                .first<Record<string, unknown>>();

            expect(row).toBeTruthy();
            expect(row?.status).toBe("pending");
            expect(row?.password_hash).not.toBe(input.password);
            expect(row?.full_name).toBe(input.fullName);
            expect(row?.phone).toBe(input.phone);
            expect(row?.course).toBe(input.course);
            expect(row?.member_status).toBe("trainee");
            expect(row?.manager).toBe(0);
            expect(row?.birth_date).toBeNull();
            expect(row?.decided_by).toBeNull();
        });

        it("gera um member_id sintético prefixado — nunca colide com um uuid da Supabase", async () => {
            const input = selfDeclaredInput();

            await service.createSelfDeclared(input);
            await settleDeferred();

            const row = await env.DB.prepare("SELECT member_id FROM signup_requests WHERE email = ?")
                .bind(input.email)
                .first<{ member_id: string }>();

            expect(row?.member_id).toMatch(/^self:[0-9a-f-]{36}$/);
        });

        it("não cria nada em users nem sessions", async () => {
            const input = selfDeclaredInput();

            await service.createSelfDeclared(input);
            await settleDeferred();

            const user = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE email = ?")
                .bind(input.email)
                .first<{ total: number }>();
            expect(user?.total).toBe(0);
        });

        it("post_junior também é aceito", async () => {
            const input = selfDeclaredInput({ memberStatus: "post_junior" });

            const result = await service.createSelfDeclared(input);
            await settleDeferred();

            expect(result.isRight()).toBe(true);
            const row = await env.DB.prepare("SELECT member_status FROM signup_requests WHERE email = ?")
                .bind(input.email)
                .first<{ member_status: string }>();
            expect(row?.member_status).toBe("post_junior");
        });

        it("despacha o email de aprovação para a caixa institucional, não para o solicitante", async () => {
            const input = selfDeclaredInput();

            await service.createSelfDeclared(input);
            await settleDeferred();

            expect(mailer.approvalRequestsSent).toHaveLength(1);
            expect(mailer.approvalRequestsSent[0].to).toBe(SIGNUP_APPROVAL_EMAIL);
            expect(mailer.approvalRequestsSent[0].memberName).toBe(input.fullName);
            expect(mailer.approvalRequestsSent[0].memberStatusLabel).toBe("Trainee");
            expect(mailer.approvalRequestsSent[0].reviewUrl).toMatch(
                new RegExp(`^${FRONT_ORIGIN}/solicitacoes/`),
            );
        });

        it("recusa quando já existe conta com este email (conflito, não pendência)", async () => {
            const input = selfDeclaredInput();
            await env.DB.prepare(
                `INSERT INTO users (id, role_id, email, name, password) VALUES (?, 'avaliador', ?, 'Já Cadastrado', 'hash')`,
            )
                .bind(crypto.randomUUID(), input.email)
                .run();

            const result = await service.createSelfDeclared(input);

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("EMAIL_ALREADY_REGISTERED");

            const count = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
            )
                .bind(input.email)
                .first<{ total: number }>();
            expect(count?.total).toBe(0);
        });

        it("FR-016 - chamada repetida com pending existente não duplica nem reenvia email", async () => {
            const email = `trainee-repeat-${++counter}@example.com`;

            await service.createSelfDeclared(selfDeclaredInput({ email, password: "senha-1" }));
            await settleDeferred();
            const second = await service.createSelfDeclared(
                selfDeclaredInput({ email, password: "senha-2" }),
            );
            await settleDeferred();

            expect(second.isRight()).toBe(true);

            const count = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
            )
                .bind(email)
                .first<{ total: number }>();

            expect(count?.total).toBe(1);
            expect(mailer.approvalRequestsSent).toHaveLength(1);
        });

        it("FR-018 - após uma recusa, uma nova solicitação para o mesmo email é aceita", async () => {
            const email = `trainee-rejected-${++counter}@example.com`;

            await service.createSelfDeclared(selfDeclaredInput({ email }));
            await settleDeferred();

            const first = await repository.findPendingByEmail(email);
            expect(first).toBeTruthy();
            await repository.decide(first!.id, ADMIN_USER_ID, "rejected");

            await service.createSelfDeclared(selfDeclaredInput({ email }));
            await settleDeferred();

            const count = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
            )
                .bind(email)
                .first<{ total: number }>();

            expect(count?.total).toBe(2);
            expect(mailer.approvalRequestsSent).toHaveLength(2);

            const pending = await repository.findPendingByEmail(email);
            expect(pending?.status).toBe("pending");
        });

        it("SC-006 - falha no envio de email não impede o registro da solicitação", async () => {
            const input = selfDeclaredInput();
            mailer.shouldFail = true;

            await service.createSelfDeclared(input);
            await expect(settleDeferred()).resolves.toBeUndefined();

            const row = await repository.findPendingByEmail(input.email);
            expect(row).toBeTruthy();
        });
    });

    // ============================================================
    // getByToken()
    // ============================================================

    describe("getByToken", () => {
        async function createAndGetToken(overrides: Partial<SelfDeclaredSignupDTO> = {}): Promise<string> {
            const input = selfDeclaredInput(overrides);
            await service.createSelfDeclared(input);
            await settleDeferred();

            return extractToken(mailer.approvalRequestsSent.at(-1)!.reviewUrl);
        }

        it("FR-007 - devolve os dados sem mudar o estado, mesmo chamado várias vezes", async () => {
            const token = await createAndGetToken();

            const first = await service.getByToken(token);
            const second = await service.getByToken(token);

            expect(first.isRight()).toBe(true);
            expect(second.isRight()).toBe(true);
            if (first.isRight()) expect(first.value.status).toBe("pending");
            if (second.isRight()) expect(second.value.status).toBe("pending");
        });

        it("devolve selfDeclared: true para uma solicitação auto-declarada", async () => {
            const token = await createAndGetToken();

            const result = await service.getByToken(token);

            expect(result.isRight()).toBe(true);
            if (result.isRight()) expect(result.value.selfDeclared).toBe(true);
        });

        it("token inexistente responde SIGNUP_REQUEST_NOT_FOUND", async () => {
            const result = await service.getByToken("token-que-nunca-existiu");

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("SIGNUP_REQUEST_NOT_FOUND");
        });

        it("FR-009 - token expirado responde SIGNUP_REQUEST_EXPIRED", async () => {
            const token = await createAndGetToken();

            await env.DB.prepare("UPDATE signup_approval_tokens SET expires_at = ?")
                .bind(new Date(Date.now() - 1000).toISOString())
                .run();

            const result = await service.getByToken(token);

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("SIGNUP_REQUEST_EXPIRED");
        });
    });

    // ============================================================
    // decide()
    // ============================================================

    describe("decide", () => {
        async function createPending(overrides: Partial<SelfDeclaredSignupDTO> = {}) {
            const input = selfDeclaredInput(overrides);
            await service.createSelfDeclared(input);
            await settleDeferred();

            const row = await repository.findPendingByEmail(input.email);
            return { input, requestId: row!.id, memberId: row!.member_id };
        }

        it("aprovar cria users+member_profiles SEM sessão, e grava autor/horário", async () => {
            const { input, requestId, memberId } = await createPending();

            const result = await service.decide(requestId, ADMIN_USER_ID, "approve");
            await settleDeferred();

            expect(result.isRight()).toBe(true);

            const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
                .bind(input.email)
                .first<Record<string, unknown>>();
            expect(user).toBeTruthy();
            expect(user?.role_id).toBe("avaliador");

            const sessions = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?",
            )
                .bind(user?.id)
                .first<{ total: number }>();
            expect(sessions?.total).toBe(0);

            const profile = await env.DB.prepare(
                "SELECT * FROM member_profiles WHERE user_id = ?",
            )
                .bind(user?.id)
                .first<Record<string, unknown>>();
            expect(profile?.member_id).toBe(memberId);
            expect(profile?.status).toBe("trainee");

            const request = await env.DB.prepare("SELECT * FROM signup_requests WHERE id = ?")
                .bind(requestId)
                .first<Record<string, unknown>>();
            expect(request?.status).toBe("approved");
            expect(request?.decided_by).toBe(ADMIN_USER_ID);
            expect(request?.decided_at).toEqual(expect.any(String));
        });

        it("aprovar dispara o email de resultado para o solicitante", async () => {
            const { input, requestId } = await createPending();

            await service.decide(requestId, ADMIN_USER_ID, "approve");
            await settleDeferred();

            expect(mailer.decisionResultsSent).toHaveLength(1);
            expect(mailer.decisionResultsSent[0]).toEqual({ to: input.email, approved: true });
        });

        it("recusar NÃO cria conta, só grava a decisão", async () => {
            const { input, requestId } = await createPending();

            const result = await service.decide(requestId, ADMIN_USER_ID, "reject");
            await settleDeferred();

            expect(result.isRight()).toBe(true);

            const user = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE email = ?")
                .bind(input.email)
                .first<{ total: number }>();
            expect(user?.total).toBe(0);

            expect(mailer.decisionResultsSent[0]).toEqual({ to: input.email, approved: false });
        });

        it("FR-010/SC-004 - decidir uma solicitação já decidida responde ALREADY_DECIDED", async () => {
            const { requestId } = await createPending();

            await service.decide(requestId, ADMIN_USER_ID, "approve");
            const second = await service.decide(requestId, ADMIN_USER_ID, "reject");

            expect(second.isLeft()).toBe(true);
            if (second.isLeft()) expect(second.value.code).toBe("SIGNUP_REQUEST_ALREADY_DECIDED");
        });

        it("id inexistente responde SIGNUP_REQUEST_NOT_FOUND", async () => {
            const result = await service.decide(crypto.randomUUID(), ADMIN_USER_ID, "approve");

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("SIGNUP_REQUEST_NOT_FOUND");
        });
    });

    // ============================================================
    // list()
    // ============================================================

    describe("list", () => {
        it("lista só o status pedido", async () => {
            const a = selfDeclaredInput();
            const b = selfDeclaredInput();
            await service.createSelfDeclared(a);
            await settleDeferred();
            await service.createSelfDeclared(b);
            await settleDeferred();

            const pending = await service.list("pending");
            const approvedEmails = (await service.list("approved")).map((r) => r.email);

            // Superconjunto, não igualdade: o storage do D1 nos testes não é
            // isolado por `it()` — outros testes deste arquivo deixam linhas
            // `pending` para trás.
            const pendingEmails = pending.map((r) => r.email);
            expect(pendingEmails).toContain(a.email);
            expect(pendingEmails).toContain(b.email);
            expect(approvedEmails).not.toContain(a.email);
            expect(approvedEmails).not.toContain(b.email);
        });

        it("marca selfDeclared: true para toda solicitação auto-declarada", async () => {
            const input = selfDeclaredInput();
            await service.createSelfDeclared(input);
            await settleDeferred();

            const pending = await service.list("pending");
            const entry = pending.find((r) => r.email === input.email);

            expect(entry?.selfDeclared).toBe(true);
        });

        it("FR-019 - priorRejectionCount conta recusas anteriores do mesmo email", async () => {
            const email = `trainee-priorrej-${++counter}@example.com`;

            const first = await createPendingFor(email);
            await repository.decide(first, ADMIN_USER_ID, "rejected");

            const second = await createPendingFor(email);
            await repository.decide(second, ADMIN_USER_ID, "rejected");

            await createPendingFor(email);

            const pending = await service.list("pending");
            const entry = pending.find((r) => r.email === email);

            expect(entry?.priorRejectionCount).toBe(2);
        });

        async function createPendingFor(email: string): Promise<string> {
            await service.createSelfDeclared(selfDeclaredInput({ email }));
            await settleDeferred();
            const row = await repository.findPendingByEmail(email);
            return row!.id;
        }
    });

    // ============================================================
    // toSummary() — legado pré-migration-0016 e dado corrompido
    // ============================================================

    describe("normalização de member_status legado", () => {
        it("uma linha legada 'inactive' aparece como post_junior na listagem", async () => {
            const input = selfDeclaredInput();
            await service.createSelfDeclared(input);
            await settleDeferred();

            await env.DB.prepare("UPDATE signup_requests SET member_status = 'inactive' WHERE email = ?")
                .bind(input.email)
                .run();

            const pending = await service.list("pending");
            const entry = pending.find((r) => r.email === input.email);

            expect(entry?.memberStatus).toBe("post_junior");
        });

        it("um member_status desconhecido lança em vez de vazar silenciosamente", async () => {
            const input = selfDeclaredInput();
            await service.createSelfDeclared(input);
            await settleDeferred();

            await env.DB.prepare("UPDATE signup_requests SET member_status = 'alumni' WHERE email = ?")
                .bind(input.email)
                .run();

            await expect(service.list("pending")).rejects.toThrow(/member_status desconhecido/);
        });
    });
});
