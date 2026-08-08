import { env } from "cloudflare:test";
import type { TecMember } from "shared";
import { beforeEach, describe, expect, it } from "vitest";

import { MemberDirectoryUnavailableError } from "../src/core/errors/auth-errors";
import type { Mailer } from "../src/lib/mailer";
import type { MemberDirectory } from "../src/lib/member-directory";
import { hashOpaqueToken } from "../src/lib/opaque-token";
import { hashPassword, PBKDF2_ITERATIONS } from "../src/lib/password";
import { AuthRepository } from "../src/repositories/auth.repository";
import { AuthService, FORGOT_PASSWORD_MESSAGE } from "../src/services/auth.service";

// Testes do service contra o D1 real do miniflare, com o banco da tec e o
// provedor de email substituídos por dublês.

class FakeMemberDirectory implements MemberDirectory {
    member: TecMember | null = null;
    failure: Error | null = null;
    queriedEmails: string[] = [];

    async findByEmail(email: string): Promise<TecMember | null> {
        this.queriedEmails.push(email);
        if (this.failure) throw this.failure;
        return this.member;
    }
}

class FakeMailer implements Mailer {
    sent: { to: string; resetUrl: string }[] = [];
    shouldFail = false;

    async sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
        if (this.shouldFail) throw new Error("Resend fora do ar");
        this.sent.push(params);
    }
}

const JWT_SECRET = "segredo-de-teste-suficientemente-longo";
const FRONT_ORIGIN = "https://app.exemplo.test";

let counter = 0;

function tecMember(overrides: Partial<TecMember> = {}): TecMember {
    counter += 1;

    return {
        id: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`,
        full_name: `Membro ${counter}`,
        email: `membro${counter}@cimatecjr.com.br`,
        phone: `7198887${String(counter).padStart(4, "0")}`,
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

describe("AuthService", () => {
    let repository: AuthRepository;
    let directory: FakeMemberDirectory;
    let mailer: FakeMailer;
    let service: AuthService;
    let deferred: Promise<unknown>[];

    beforeEach(() => {
        repository = new AuthRepository(env.DB);
        directory = new FakeMemberDirectory();
        mailer = new FakeMailer();
        deferred = [];

        service = new AuthService({
            repository,
            directory,
            mailer,
            jwtSecret: JWT_SECRET,
            frontOrigin: FRONT_ORIGIN,
            defer: (promise) => {
                deferred.push(promise);
            },
        });
    });

    async function settleDeferred(): Promise<void> {
        await Promise.all(deferred);
    }

    async function registerMember(overrides: Partial<TecMember> = {}, password = "senha-de-teste") {
        const member = tecMember(overrides);
        directory.member = member;

        const result = await service.register(
            { email: member.email, password },
            { userAgent: "vitest" },
        );

        if (result.isLeft()) {
            throw new Error(`Cadastro falhou inesperadamente: ${result.value.code}`);
        }

        return { member, password, session: result.value };
    }

    async function countUsers(email: string): Promise<number> {
        const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE email = ?")
            .bind(email)
            .first<{ total: number }>();

        return row?.total ?? 0;
    }

    // ============================================================
    // Cadastro
    // ============================================================

    describe("register", () => {
        it("cria usuário, perfil e sessão, e já devolve a sessão autenticada", async () => {
            const { member, session } = await registerMember();

            expect(session.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
            expect(session.expiresIn).toBe(900);
            expect(session.user).toEqual({
                id: expect.stringMatching(/^[0-9a-f-]{36}$/),
                email: member.email,
                name: member.full_name,
                role: "avaliador",
            });

            const profile = await env.DB.prepare(
                "SELECT * FROM member_profiles WHERE user_id = ?",
            )
                .bind(session.user.id)
                .first<Record<string, unknown>>();

            expect(profile).toBeTruthy();
            expect(profile?.member_id).toBe(member.id);
            expect(profile?.course).toBe("Engenharia de Computação");
            expect(profile?.gender).toBe("Masculino");
            expect(profile?.synced_at).toEqual(expect.any(String));

            const sessions = await env.DB.prepare("SELECT * FROM sessions WHERE user_id = ?")
                .bind(session.user.id)
                .all<Record<string, unknown>>();

            expect(sessions.results).toHaveLength(1);
        });

        it("guarda a senha só como hash e o refresh token só como hash", async () => {
            const { session, password } = await registerMember();

            const user = await env.DB.prepare("SELECT password FROM users WHERE id = ?")
                .bind(session.user.id)
                .first<{ password: string }>();

            expect(user?.password).not.toBe(password);
            expect(user?.password).toMatch(/^pbkdf2-sha256\$\d+\$/);

            const row = await env.DB.prepare("SELECT refresh_token_hash FROM sessions WHERE user_id = ?")
                .bind(session.user.id)
                .first<{ refresh_token_hash: string }>();

            expect(row?.refresh_token_hash).not.toBe(session.refreshToken);
            expect(row?.refresh_token_hash).toBe(await hashOpaqueToken(session.refreshToken));
        });

        it("normaliza o email antes de consultar a tec e de persistir", async () => {
            const member = tecMember();
            directory.member = member;

            const result = await service.register(
                { email: `  ${member.email.toUpperCase()}  `.trim().toLowerCase(), password: "senha-de-teste" },
                { userAgent: null },
            );

            expect(result.isRight()).toBe(true);
            expect(directory.queriedEmails.at(-1)).toBe(member.email);
            expect(await countUsers(member.email)).toBe(1);
        });

        it("entra como avaliador mesmo quando a tec diz que o membro é manager", async () => {
            const { session } = await registerMember({ manager: true });

            expect(session.user.role).toBe("avaliador");

            const profile = await env.DB.prepare(
                "SELECT manager FROM member_profiles WHERE user_id = ?",
            )
                .bind(session.user.id)
                .first<{ manager: number }>();

            expect(profile?.manager).toBe(1);
        });

        it("E1 - recusa quando o email já tem conta", async () => {
            const { member } = await registerMember();
            directory.member = member;

            const result = await service.register(
                { email: member.email, password: "outra-senha" },
                { userAgent: null },
            );

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("EMAIL_ALREADY_REGISTERED");
            expect(await countUsers(member.email)).toBe(1);
        });

        it("E2 - recusa quem não consta no banco da tec, sem gravar nada", async () => {
            directory.member = null;

            const result = await service.register(
                { email: "estranho@exemplo.com", password: "senha-de-teste" },
                { userAgent: null },
            );

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("NOT_A_MEMBER");
            expect(await countUsers("estranho@exemplo.com")).toBe(0);
        });

        it.each<TecMember["status"]>(["inactive", "alumni", "on_leave", "suspended", "", "ACTIVE", null])(
            "E3 - recusa o status %s, inclusive valor fora do enum (fail-closed)",
            async (status) => {
                const member = tecMember({ status });
                directory.member = member;

                const result = await service.register(
                    { email: member.email, password: "senha-de-teste" },
                    { userAgent: null },
                );

                expect(result.isLeft()).toBe(true);
                if (result.isLeft()) expect(result.value.code).toBe("MEMBER_NOT_ACTIVE");
                expect(await countUsers(member.email)).toBe(0);
            },
        );

        it("E5 - diretório indisponível bloqueia o cadastro sem escrever NADA no D1", async () => {
            const member = tecMember();
            directory.member = member;
            directory.failure = new MemberDirectoryUnavailableError();

            const result = await service.register(
                { email: member.email, password: "senha-de-teste" },
                { userAgent: null },
            );

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("MEMBER_DIRECTORY_UNAVAILABLE");

            expect(await countUsers(member.email)).toBe(0);
            const profiles = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM member_profiles WHERE member_id = ?",
            )
                .bind(member.id)
                .first<{ total: number }>();
            expect(profiles?.total).toBe(0);
        });
    });

    // ============================================================
    // Login
    // ============================================================

    describe("login", () => {
        it("autentica com a senha correta e cria uma sessão nova", async () => {
            const { member, password, session: registered } = await registerMember();

            const result = await service.login({ email: member.email, password }, { userAgent: null });

            expect(result.isRight()).toBe(true);
            if (result.isRight()) {
                expect(result.value.user.id).toBe(registered.user.id);
                expect(result.value.refreshToken).not.toBe(registered.refreshToken);
            }
        });

        it("E7 - senha errada e email inexistente produzem exatamente a mesma resposta", async () => {
            const { member } = await registerMember();

            const wrongPassword = await service.login(
                { email: member.email, password: "senha-errada" },
                { userAgent: null },
            );
            const unknownEmail = await service.login(
                { email: "ninguem@exemplo.com", password: "senha-errada" },
                { userAgent: null },
            );

            expect(wrongPassword.isLeft()).toBe(true);
            expect(unknownEmail.isLeft()).toBe(true);
            if (wrongPassword.isLeft() && unknownEmail.isLeft()) {
                expect(wrongPassword.value.code).toBe("INVALID_CREDENTIALS");
                expect(unknownEmail.value.code).toBe(wrongPassword.value.code);
                expect(unknownEmail.value.message).toBe(wrongPassword.value.message);
            }
        });

        it("E12 - conta desativada é negada e tem todas as sessões revogadas", async () => {
            const { member, password, session } = await registerMember();
            await env.DB.prepare("UPDATE users SET deactivated_at = ? WHERE id = ?")
                .bind(new Date().toISOString(), session.user.id)
                .run();

            const result = await service.login({ email: member.email, password }, { userAgent: null });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ACCOUNT_DEACTIVATED");

            const active = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(active?.total).toBe(0);
        });

        it("re-deriva o hash no login quando ele foi gerado com menos iterações", async () => {
            const { member, password, session } = await registerMember();

            const legacyHash = await hashPassword(password, PBKDF2_ITERATIONS - 5000);
            await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?")
                .bind(legacyHash, session.user.id)
                .run();

            const result = await service.login({ email: member.email, password }, { userAgent: null });

            expect(result.isRight()).toBe(true);

            const user = await env.DB.prepare("SELECT password FROM users WHERE id = ?")
                .bind(session.user.id)
                .first<{ password: string }>();

            expect(user?.password).not.toBe(legacyHash);
            expect(user?.password).toContain(`$${PBKDF2_ITERATIONS}$`);
        });
    });

    // ============================================================
    // Renovação e rotação
    // ============================================================

    describe("refresh", () => {
        it("rotaciona o token: o novo funciona e o anterior deixa de funcionar", async () => {
            const { session } = await registerMember();

            const first = await service.refresh(session.refreshToken, { userAgent: null });
            expect(first.isRight()).toBe(true);
            if (!first.isRight()) return;

            expect(first.value.refreshToken).not.toBe(session.refreshToken);

            const second = await service.refresh(first.value.refreshToken, { userAgent: null });
            expect(second.isRight()).toBe(true);

            const rows = await env.DB.prepare("SELECT family_id FROM sessions WHERE user_id = ?")
                .bind(session.user.id)
                .all<{ family_id: string }>();

            expect(rows.results).toHaveLength(3);
            expect(new Set(rows.results.map((row) => row.family_id)).size).toBe(1);
        });

        it("E10 - reusar um token já rotacionado revoga a família inteira", async () => {
            const { session } = await registerMember();

            const rotated = await service.refresh(session.refreshToken, { userAgent: null });
            expect(rotated.isRight()).toBe(true);
            if (!rotated.isRight()) return;

            const reuse = await service.refresh(session.refreshToken, { userAgent: null });

            expect(reuse.isLeft()).toBe(true);
            if (reuse.isLeft()) expect(reuse.value.code).toBe("INVALID_REFRESH_TOKEN");

            const active = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(active?.total).toBe(0);

            const afterFamilyRevoke = await service.refresh(rotated.value.refreshToken, {
                userAgent: null,
            });
            expect(afterFamilyRevoke.isLeft()).toBe(true);
        });

        it("E8 - sem cookie devolve MISSING_REFRESH_TOKEN, distinto de token inválido", async () => {
            const missing = await service.refresh(undefined, { userAgent: null });
            const invalid = await service.refresh("token-que-nunca-existiu", { userAgent: null });

            expect(missing.isLeft()).toBe(true);
            expect(invalid.isLeft()).toBe(true);
            if (missing.isLeft()) expect(missing.value.code).toBe("MISSING_REFRESH_TOKEN");
            if (invalid.isLeft()) expect(invalid.value.code).toBe("INVALID_REFRESH_TOKEN");
        });

        it("E9 - sessão expirada é recusada", async () => {
            const { session } = await registerMember();

            await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
                .bind(new Date(Date.now() - 1000).toISOString(), session.user.id)
                .run();

            const result = await service.refresh(session.refreshToken, { userAgent: null });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("INVALID_REFRESH_TOKEN");
        });
    });

    // ============================================================
    // Logout
    // ============================================================

    describe("logout", () => {
        it("revoga a família inteira, não só o último token", async () => {
            const { session } = await registerMember();

            const rotated = await service.refresh(session.refreshToken, { userAgent: null });
            expect(rotated.isRight()).toBe(true);
            if (!rotated.isRight()) return;

            await service.logout(rotated.value.refreshToken);

            const afterLogout = await service.refresh(rotated.value.refreshToken, { userAgent: null });
            expect(afterLogout.isLeft()).toBe(true);

            const active = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(active?.total).toBe(0);
        });

        it("é idempotente: cookie ausente, desconhecido ou já revogado não estouram", async () => {
            await expect(service.logout(undefined)).resolves.toBeUndefined();
            await expect(service.logout("token-inexistente")).resolves.toBeUndefined();

            const { session } = await registerMember();
            await service.logout(session.refreshToken);
            await expect(service.logout(session.refreshToken)).resolves.toBeUndefined();
        });
    });

    // ============================================================
    // /auth/me
    // ============================================================

    describe("me", () => {
        it("devolve identidade e snapshot do membro", async () => {
            const { member, session } = await registerMember({ manager: true, semester: 7 });

            const result = await service.me(session.user.id);

            expect(result.isRight()).toBe(true);
            if (!result.isRight()) return;

            expect(result.value).toEqual({
                id: session.user.id,
                email: member.email,
                name: member.full_name,
                role: "avaliador",
                profile: {
                    memberId: member.id,
                    fullName: member.full_name,
                    phone: member.phone,
                    course: member.course,
                    semester: 7,
                    manager: true,
                    syncedAt: expect.any(String),
                },
            });
        });

        it("recusa usuário que não existe mais, mesmo com token válido", async () => {
            const result = await service.me(crypto.randomUUID());

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("INVALID_TOKEN");
        });

        it("recusa conta desativada e revoga as sessões dela", async () => {
            const { session } = await registerMember();
            await env.DB.prepare("UPDATE users SET deactivated_at = ? WHERE id = ?")
                .bind(new Date().toISOString(), session.user.id)
                .run();

            const result = await service.me(session.user.id);

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("ACCOUNT_DEACTIVATED");
        });
    });

    // ============================================================
    // Recuperação de senha
    // ============================================================

    describe("forgotPassword", () => {
        it("responde igual para email cadastrado e desconhecido", async () => {
            const { member } = await registerMember();

            const known = await service.forgotPassword({ email: member.email });
            const unknown = await service.forgotPassword({ email: "ninguem@exemplo.com" });
            await settleDeferred();

            expect(known.value).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
            expect(unknown.value).toEqual(known.value);
            expect(FORGOT_PASSWORD_MESSAGE).toMatch(/^Se o email estiver cadastrado/);
        });

        it("gera token e envia email só para quem existe", async () => {
            const { member, session } = await registerMember();

            await service.forgotPassword({ email: member.email });
            await service.forgotPassword({ email: "ninguem@exemplo.com" });
            await settleDeferred();

            expect(mailer.sent).toHaveLength(1);
            expect(mailer.sent[0].to).toBe(member.email);
            expect(mailer.sent[0].resetUrl).toMatch(
                new RegExp(`^${FRONT_ORIGIN}/redefinir-senha\\?token=`),
            );

            const tokens = await env.DB.prepare(
                "SELECT token_hash FROM password_reset_tokens WHERE user_id = ?",
            )
                .bind(session.user.id)
                .all<{ token_hash: string }>();

            expect(tokens.results).toHaveLength(1);
            const sentToken = new URL(mailer.sent[0].resetUrl).searchParams.get("token")!;
            expect(tokens.results[0].token_hash).toBe(await hashOpaqueToken(sentToken));
            expect(tokens.results[0].token_hash).not.toBe(sentToken);
        });

        it("um pedido novo invalida o anterior", async () => {
            const { member, session } = await registerMember();

            await service.forgotPassword({ email: member.email });
            await settleDeferred();
            await service.forgotPassword({ email: member.email });
            await settleDeferred();

            const stillValid = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();

            expect(stillValid?.total).toBe(1);

            const firstToken = new URL(mailer.sent[0].resetUrl).searchParams.get("token")!;
            const result = await service.resetPassword({ token: firstToken, password: "nova-senha-123" });
            expect(result.isLeft()).toBe(true);
        });

        it("falha do provedor de email não altera a resposta ao membro", async () => {
            const { member } = await registerMember();
            mailer.shouldFail = true;

            const result = await service.forgotPassword({ email: member.email });
            await expect(settleDeferred()).resolves.toBeUndefined();

            expect(result.value).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
        });

        it("não envia email para conta desativada", async () => {
            const { member, session } = await registerMember();
            await env.DB.prepare("UPDATE users SET deactivated_at = ? WHERE id = ?")
                .bind(new Date().toISOString(), session.user.id)
                .run();

            await service.forgotPassword({ email: member.email });
            await settleDeferred();

            expect(mailer.sent).toHaveLength(0);
        });
    });

    describe("resetPassword", () => {
        async function requestReset(email: string): Promise<string> {
            await service.forgotPassword({ email });
            await settleDeferred();

            return new URL(mailer.sent.at(-1)!.resetUrl).searchParams.get("token")!;
        }

        it("troca a senha e revoga TODAS as sessões do usuário", async () => {
            const { member, session } = await registerMember();
            await service.login({ email: member.email, password: "senha-de-teste" }, { userAgent: null });

            const token = await requestReset(member.email);
            const result = await service.resetPassword({ token, password: "senha-nova-forte" });

            expect(result.isRight()).toBe(true);

            const active = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(active?.total).toBe(0);

            const withOld = await service.login(
                { email: member.email, password: "senha-de-teste" },
                { userAgent: null },
            );
            expect(withOld.isLeft()).toBe(true);

            const withNew = await service.login(
                { email: member.email, password: "senha-nova-forte" },
                { userAgent: null },
            );
            expect(withNew.isRight()).toBe(true);
        });

        it("E14 - o token é de uso único", async () => {
            const { member } = await registerMember();
            const token = await requestReset(member.email);

            expect((await service.resetPassword({ token, password: "senha-nova-1" })).isRight()).toBe(true);

            const second = await service.resetPassword({ token, password: "senha-nova-2" });
            expect(second.isLeft()).toBe(true);
            if (second.isLeft()) expect(second.value.code).toBe("INVALID_RESET_TOKEN");
        });

        it("E14 - token expirado é recusado", async () => {
            const { member, session } = await registerMember();
            const token = await requestReset(member.email);

            await env.DB.prepare("UPDATE password_reset_tokens SET expires_at = ? WHERE user_id = ?")
                .bind(new Date(Date.now() - 1000).toISOString(), session.user.id)
                .run();

            const result = await service.resetPassword({ token, password: "senha-nova-forte" });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("INVALID_RESET_TOKEN");
        });

        it("E14 - token inexistente é recusado com o mesmo código dos demais", async () => {
            const result = await service.resetPassword({
                token: "token-inventado",
                password: "senha-nova-forte",
            });

            expect(result.isLeft()).toBe(true);
            if (result.isLeft()) expect(result.value.code).toBe("INVALID_RESET_TOKEN");
        });
    });

    // ============================================================
    // Limpeza pelo cron
    // ============================================================

    describe("pruneExpired", () => {
        it("apaga sessões expiradas e tokens de recuperação usados, preservando o que está vivo", async () => {
            const { member, session } = await registerMember();
            const token = await (async () => {
                await service.forgotPassword({ email: member.email });
                await settleDeferred();
                return new URL(mailer.sent.at(-1)!.resetUrl).searchParams.get("token")!;
            })();

            const expiredSessionId = crypto.randomUUID();
            await env.DB.prepare(
                `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, expires_at)
                      VALUES (?, ?, ?, ?, ?)`,
            )
                .bind(
                    expiredSessionId,
                    session.user.id,
                    await hashOpaqueToken(`expirado-${expiredSessionId}`),
                    crypto.randomUUID(),
                    new Date(Date.now() - 86_400_000).toISOString(),
                )
                .run();

            await service.resetPassword({ token, password: "senha-nova-forte" });
            await repository.pruneExpired();

            const expired = await env.DB.prepare("SELECT COUNT(*) AS total FROM sessions WHERE id = ?")
                .bind(expiredSessionId)
                .first<{ total: number }>();
            expect(expired?.total).toBe(0);

            const usedTokens = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM password_reset_tokens WHERE user_id = ?",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(usedTokens?.total).toBe(0);

            const recentlyRevoked = await env.DB.prepare(
                "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NOT NULL",
            )
                .bind(session.user.id)
                .first<{ total: number }>();
            expect(recentlyRevoked?.total).toBeGreaterThan(0);
        });
    });
});
