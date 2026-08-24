import { env } from "cloudflare:test";
import type { TecMember } from "shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { Mailer } from "../src/lib/mailer";
import { AuthRepository } from "../src/repositories/auth.repository";
import { SignupRequestsRepository } from "../src/repositories/signup-requests.repository";
import { SignupRequestsService } from "../src/services/signup-requests.service";

// Testes do service contra o D1 real do miniflare (mesmo padrão de
// auth.service.test.ts) — o provedor de email é um dublê.

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

function tecMember(overrides: Partial<TecMember> = {}): TecMember {
    counter += 1;

    return {
        id: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`,
        full_name: `Membro ${counter}`,
        email: `membro-sr-${counter}@cimatecjr.com.br`,
        phone: `7198887${String(counter).padStart(4, "0")}`,
        birth_date: "2003-05-12",
        course: "Engenharia de Computação",
        semester: 5,
        gender: "Masculino",
        ethnicity: "Parda",
        status: "inactive",
        manager: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
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
    // create()
    // ============================================================

    describe("create", () => {
        it("grava a solicitação com o snapshot do membro e o hash da senha", async () => {
            const member = tecMember();

            await service.create(member, member.email, "hash-da-senha");
            await settleDeferred();

            const row = await env.DB.prepare("SELECT * FROM signup_requests WHERE email = ?")
                .bind(member.email)
                .first<Record<string, unknown>>();

            expect(row).toBeTruthy();
            expect(row?.status).toBe("pending");
            expect(row?.password_hash).toBe("hash-da-senha");
            expect(row?.member_id).toBe(member.id);
            expect(row?.full_name).toBe(member.full_name);
            expect(row?.member_status).toBe("inactive");
            expect(row?.decided_by).toBeNull();
        });

        it("despacha o email de aprovação para a caixa institucional, não para o membro", async () => {
            const member = tecMember();

            await service.create(member, member.email, "hash");
            await settleDeferred();

            expect(mailer.approvalRequestsSent).toHaveLength(1);
            expect(mailer.approvalRequestsSent[0].to).toBe(SIGNUP_APPROVAL_EMAIL);
            expect(mailer.approvalRequestsSent[0].memberName).toBe(member.full_name);
            expect(mailer.approvalRequestsSent[0].memberStatusLabel).toBe("pós-júnior");
            expect(mailer.approvalRequestsSent[0].reviewUrl).toMatch(
                new RegExp(`^${FRONT_ORIGIN}/solicitacoes/`),
            );
        });

        it("FR-016 - chamada repetida com pending existente não duplica nem reenvia email", async () => {
            const member = tecMember();

            await service.create(member, member.email, "hash-1");
            await settleDeferred();
            await service.create(member, member.email, "hash-2");
            await settleDeferred();

            const count = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
            )
                .bind(member.email)
                .first<{ total: number }>();

            expect(count?.total).toBe(1);
            expect(mailer.approvalRequestsSent).toHaveLength(1);
        });

        it("FR-018 - após uma recusa, uma nova solicitação para o mesmo email é aceita", async () => {
            const member = tecMember();

            await service.create(member, member.email, "hash-1");
            await settleDeferred();

            const first = await repository.findPendingByEmail(member.email);
            expect(first).toBeTruthy();
            await repository.decide(first!.id, ADMIN_USER_ID, "rejected");

            await service.create(member, member.email, "hash-2");
            await settleDeferred();

            const count = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM signup_requests WHERE email = ?",
            )
                .bind(member.email)
                .first<{ total: number }>();

            expect(count?.total).toBe(2);
            expect(mailer.approvalRequestsSent).toHaveLength(2);

            const pending = await repository.findPendingByEmail(member.email);
            expect(pending?.status).toBe("pending");
        });

        it("SC-006 - falha no envio de email não impede o registro da solicitação", async () => {
            const member = tecMember();
            mailer.shouldFail = true;

            await service.create(member, member.email, "hash");
            await expect(settleDeferred()).resolves.toBeUndefined();

            const row = await repository.findPendingByEmail(member.email);
            expect(row).toBeTruthy();
        });
    });

    // ============================================================
    // getByToken()
    // ============================================================

    describe("getByToken", () => {
        async function createAndGetToken(overrides: Partial<TecMember> = {}): Promise<string> {
            const member = tecMember(overrides);
            await service.create(member, member.email, "hash");
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
        async function createPending(overrides: Partial<TecMember> = {}) {
            const member = tecMember(overrides);
            await service.create(member, member.email, "hash-da-senha");
            await settleDeferred();

            const row = await repository.findPendingByEmail(member.email);
            return { member, requestId: row!.id };
        }

        it("aprovar cria users+member_profiles SEM sessão, e grava autor/horário", async () => {
            const { member, requestId } = await createPending();

            const result = await service.decide(requestId, ADMIN_USER_ID, "approve");
            await settleDeferred();

            expect(result.isRight()).toBe(true);

            const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
                .bind(member.email)
                .first<Record<string, unknown>>();
            expect(user).toBeTruthy();
            expect(user?.password).toBe("hash-da-senha");
            expect(user?.role_id).toBe("avaliador");

            const sessions = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?",
            )
                .bind(user?.id)
                .first<{ total: number }>();
            expect(sessions?.total).toBe(0);

            const request = await env.DB.prepare("SELECT * FROM signup_requests WHERE id = ?")
                .bind(requestId)
                .first<Record<string, unknown>>();
            expect(request?.status).toBe("approved");
            expect(request?.decided_by).toBe(ADMIN_USER_ID);
            expect(request?.decided_at).toEqual(expect.any(String));
        });

        it("aprovar dispara o email de resultado para o solicitante", async () => {
            const { member, requestId } = await createPending();

            await service.decide(requestId, ADMIN_USER_ID, "approve");
            await settleDeferred();

            expect(mailer.decisionResultsSent).toHaveLength(1);
            expect(mailer.decisionResultsSent[0]).toEqual({ to: member.email, approved: true });
        });

        it("recusar NÃO cria conta, só grava a decisão", async () => {
            const { member, requestId } = await createPending();

            const result = await service.decide(requestId, ADMIN_USER_ID, "reject");
            await settleDeferred();

            expect(result.isRight()).toBe(true);

            const user = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE email = ?")
                .bind(member.email)
                .first<{ total: number }>();
            expect(user?.total).toBe(0);

            expect(mailer.decisionResultsSent[0]).toEqual({ to: member.email, approved: false });
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
            const a = tecMember();
            const b = tecMember();
            await service.create(a, a.email, "hash");
            await settleDeferred();
            await service.create(b, b.email, "hash");
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

        it("FR-019 - priorRejectionCount conta recusas anteriores do mesmo email", async () => {
            const member = tecMember();

            const first = await createPendingFor(member.email, member);
            await repository.decide(first, ADMIN_USER_ID, "rejected");

            const second = await createPendingFor(member.email, member);
            await repository.decide(second, ADMIN_USER_ID, "rejected");

            await createPendingFor(member.email, member);

            const pending = await service.list("pending");
            const entry = pending.find((r) => r.email === member.email);

            expect(entry?.priorRejectionCount).toBe(2);
        });

        async function createPendingFor(email: string, member: TecMember): Promise<string> {
            await service.create(member, email, "hash");
            await settleDeferred();
            const row = await repository.findPendingByEmail(email);
            return row!.id;
        }
    });
});
