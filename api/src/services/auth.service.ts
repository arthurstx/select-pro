import {
    type AuthUser,
    type ForgotPasswordDTO,
    type LoginDTO,
    type MeResponse,
    type NewSession,
    type RegisterMemberDTO,
    type ResetPasswordDTO,
    isEligibleMemberStatus,
    ROLES,
} from "shared";

import { type Either, left, right } from "../core/either";
import {
    AccountDeactivatedError,
    EmailAlreadyRegisteredError,
    InvalidAccessTokenError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    InvalidResetTokenError,
    MemberDirectoryUnavailableError,
    MemberNotActiveError,
    MissingRefreshTokenError,
    NotAMemberError,
} from "../core/errors/auth-errors";
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from "../lib/access-token";
import { parseUniqueConstraint } from "../lib/d1-errors";
import { logger } from "../lib/logger";
import type { Mailer } from "../lib/mailer";
import type { MemberDirectory } from "../lib/member-directory";
import { generateOpaqueToken, hashOpaqueToken } from "../lib/opaque-token";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../lib/password";
import type { AuthRepository, UserWithRole } from "../repositories/auth.repository";

/** 7 dias. */
export const REFRESH_TOKEN_TTL_SECONDS = 604_800;

/** 30 minutos. */
export const RESET_TOKEN_TTL_SECONDS = 1_800;

/** Sempre esta mensagem, exista ou não o email — nunca revela qual. */
export const FORGOT_PASSWORD_MESSAGE =
    "Se o email estiver cadastrado, você receberá um link de recuperação.";

export interface RequestContext {
    userAgent: string | null;
}

export interface IssuedSession {
    accessToken: string;
    expiresIn: number;
    /** Em claro — só para o `Set-Cookie`. No banco só existe o SHA-256. */
    refreshToken: string;
    user: AuthUser;
}

export type RenewedSession = Omit<IssuedSession, "user">;

export type RegisterError =
    | EmailAlreadyRegisteredError
    | NotAMemberError
    | MemberNotActiveError
    | MemberDirectoryUnavailableError;

export type LoginError = InvalidCredentialsError | AccountDeactivatedError;
export type RefreshError =
    | MissingRefreshTokenError
    | InvalidRefreshTokenError
    | AccountDeactivatedError;
export type MeError = InvalidAccessTokenError | AccountDeactivatedError;

export interface AuthServiceDeps {
    repository: AuthRepository;
    directory: MemberDirectory;
    mailer: Mailer;
    jwtSecret: string;
    frontOrigin: string;
    /** `c.executionCtx.waitUntil` embrulhado, para o service não conhecer HTTP. */
    defer: (promise: Promise<unknown>) => void;
}

export class AuthService {
    constructor(private readonly deps: AuthServiceDeps) {}

    // ============================================================
    // Cadastro — POST /auth/register
    // ============================================================

    async register(
        input: RegisterMemberDTO,
        context: RequestContext,
    ): Promise<Either<RegisterError, IssuedSession>> {
        const existing = await this.deps.repository.findUserByEmail(input.email);
        if (existing) {
            logger.warn("auth.register.email_conflict", { email: input.email });
            return left(new EmailAlreadyRegisteredError());
        }

        let member;
        try {
            member = await this.deps.directory.findByEmail(input.email);
        } catch (err) {
            if (err instanceof MemberDirectoryUnavailableError) {
                // Fail-closed: nada é gravado no D1.
                logger.warn("auth.register.directory_unavailable", { email: input.email });
                return left(err);
            }
            throw err;
        }

        if (!member) {
            logger.warn("auth.register.not_a_member", { email: input.email });
            return left(new NotAMemberError());
        }

        if (!isEligibleMemberStatus(member.status)) {
            logger.warn("auth.register.member_not_eligible", {
                email: input.email,
                status: member.status,
            });
            return left(new MemberNotActiveError());
        }

        const passwordHash = await hashPassword(input.password);
        const userId = crypto.randomUUID();
        const session = await this.buildSession(userId, crypto.randomUUID(), context);
        const syncedAt = new Date().toISOString();

        try {
            await this.deps.repository.createMemberAccount(
                {
                    id: userId,
                    // Todo cadastro entra como avaliador; `admin` só nasce de UPDATE manual.
                    role_id: ROLES.AVALIADOR,
                    email: input.email,
                    name: member.full_name,
                    password: passwordHash,
                },
                {
                    id: crypto.randomUUID(),
                    member_id: member.id,
                    full_name: member.full_name,
                    phone: member.phone,
                    birth_date: member.birth_date,
                    course: member.course,
                    semester: member.semester,
                    gender: member.gender,
                    ethnicity: member.ethnicity,
                    status: member.status,
                    manager: member.manager,
                    synced_at: syncedAt,
                },
                session.row,
            );
        } catch (err) {
            const violation = parseUniqueConstraint(err);

            if (violation?.table === "users" && violation.column === "email") {
                logger.warn("auth.register.email_constraint_conflict", { email: input.email });
                return left(new EmailAlreadyRegisteredError());
            }

            // Aquele membro já tem conta, com outro email — mesma família de conflito, causa diferente.
            if (violation?.table === "member_profiles" && violation.column === "member_id") {
                logger.warn("auth.register.member_already_registered", {
                    email: input.email,
                    memberId: member.id,
                });
                return left(
                    new EmailAlreadyRegisteredError(
                        "Este membro já possui uma conta, cadastrada com outro email.",
                    ),
                );
            }

            logger.error("auth.register.insert_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }

        logger.info("auth.register.success", { userId, email: input.email, memberId: member.id });

        return right(
            await this.issueSession(
                { id: userId, email: input.email, name: member.full_name, role: ROLES.AVALIADOR },
                session,
            ),
        );
    }

    // ============================================================
    // Login — POST /auth/login
    // ============================================================

    async login(
        input: LoginDTO,
        context: RequestContext,
    ): Promise<Either<LoginError, IssuedSession>> {
        const user = await this.deps.repository.findUserByEmail(input.email);

        // Derivação de fachada mesmo com `user` nulo, para não vazar E7 por timing.
        const passwordMatches = await verifyPassword(input.password, user?.password ?? null);

        if (!user || !passwordMatches) {
            logger.warn("auth.login.invalid_credentials", { email: input.email });
            return left(new InvalidCredentialsError());
        }

        if (user.deactivated_at) {
            logger.warn("auth.login.account_deactivated", { userId: user.id });
            await this.deps.repository.revokeAllUserSessions(user.id);
            return left(new AccountDeactivatedError());
        }

        // Reforço do hash: a conta se fortalece sozinha quando `PBKDF2_ITERATIONS` sobe.
        if (user.password && passwordNeedsRehash(user.password)) {
            await this.deps.repository.updateUserPassword(user.id, await hashPassword(input.password));
            logger.info("auth.login.password_rehashed", { userId: user.id });
        }

        const session = await this.buildSession(user.id, crypto.randomUUID(), context);
        await this.deps.repository.insertSession(session.row);

        logger.info("auth.login.success", { userId: user.id });

        return right(await this.issueSession(toAuthUser(user), session));
    }

    // ============================================================
    // Renovação — POST /auth/refresh
    // ============================================================

    async refresh(
        refreshToken: string | undefined,
        context: RequestContext,
    ): Promise<Either<RefreshError, RenewedSession>> {
        if (!refreshToken) {
            return left(new MissingRefreshTokenError());
        }

        const tokenHash = await hashOpaqueToken(refreshToken);
        const session = await this.deps.repository.findSessionByTokenHash(tokenHash);

        if (!session) {
            logger.warn("auth.refresh.session_not_found", {});
            return left(new InvalidRefreshTokenError());
        }

        // Reuso detectado — token já rotacionado. Derruba a família inteira; resposta idêntica à de token inválido.
        if (session.revoked_at) {
            logger.error("auth.refresh.token_reuse_detected", {
                userId: session.user_id,
                familyId: session.family_id,
                sessionId: session.id,
            });
            await this.deps.repository.revokeSessionFamily(session.family_id);
            return left(new InvalidRefreshTokenError());
        }

        if (new Date(session.expires_at).getTime() <= Date.now()) {
            logger.warn("auth.refresh.session_expired", { userId: session.user_id });
            return left(new InvalidRefreshTokenError());
        }

        const user = await this.deps.repository.findUserById(session.user_id);
        if (!user) {
            logger.error("auth.refresh.user_missing", { userId: session.user_id });
            return left(new InvalidRefreshTokenError());
        }

        if (user.deactivated_at) {
            logger.warn("auth.refresh.account_deactivated", { userId: user.id });
            await this.deps.repository.revokeAllUserSessions(user.id);
            return left(new AccountDeactivatedError());
        }

        const next = await this.buildSession(user.id, session.family_id, context);
        await this.deps.repository.rotateSession(session.id, next.row);

        logger.info("auth.refresh.success", { userId: user.id, familyId: session.family_id });

        const issued = await this.issueSession(toAuthUser(user), next);
        return right({
            accessToken: issued.accessToken,
            expiresIn: issued.expiresIn,
            refreshToken: issued.refreshToken,
        });
    }

    // ============================================================
    // Logout — POST /auth/logout
    // ============================================================

    /** Sempre "dá certo": cookie ausente, token desconhecido ou já revogado levam ao mesmo 204. */
    async logout(refreshToken: string | undefined): Promise<void> {
        if (!refreshToken) return;

        const session = await this.deps.repository.findSessionByTokenHash(
            await hashOpaqueToken(refreshToken),
        );
        if (!session) return;

        await this.deps.repository.revokeSessionFamily(session.family_id);
        logger.info("auth.logout.success", { userId: session.user_id });
    }

    // ============================================================
    // Sessão atual — GET /auth/me
    // ============================================================

    async me(userId: string): Promise<Either<MeError, MeResponse["data"]>> {
        const user = await this.deps.repository.findUserWithProfileById(userId);

        if (!user) {
            logger.warn("auth.me.user_missing", { userId });
            return left(new InvalidAccessTokenError());
        }

        if (user.deactivated_at) {
            logger.warn("auth.me.account_deactivated", { userId });
            await this.deps.repository.revokeAllUserSessions(userId);
            return left(new AccountDeactivatedError());
        }

        return right({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            profile: {
                memberId: user.member_id,
                fullName: user.full_name,
                phone: user.phone,
                course: user.course,
                semester: user.semester,
                manager: user.manager === 1,
                syncedAt: user.synced_at,
            },
        });
    }

    // ============================================================
    // Recuperação de senha
    // ============================================================

    /** Sempre 202 e mesma mensagem — a escrita/envio acontece depois da resposta, em `defer`. */
    async forgotPassword(input: ForgotPasswordDTO): Promise<Either<never, { message: string }>> {
        const user = await this.deps.repository.findUserByEmail(input.email);

        this.deps.defer(this.dispatchPasswordReset(user));

        return right({ message: FORGOT_PASSWORD_MESSAGE });
    }

    /** Nunca rejeita: um erro aqui não pode virar resposta diferente ao membro, que já recebeu o 202. */
    private async dispatchPasswordReset(user: UserWithRole | null): Promise<void> {
        try {
            if (!user || user.deactivated_at) return;

            const token = generateOpaqueToken();
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString();

            await this.deps.repository.replaceResetToken({
                id: crypto.randomUUID(),
                user_id: user.id,
                token_hash: await hashOpaqueToken(token),
                expires_at: expiresAt,
            });

            const resetUrl = `${this.deps.frontOrigin.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
            await this.deps.mailer.sendPasswordResetEmail({ to: user.email, resetUrl });

            logger.info("auth.forgot_password.dispatched", { userId: user.id });
        } catch (err) {
            logger.error("auth.forgot_password.dispatch_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /** Troca a senha e derruba todas as sessões — é o ponto do fluxo, não um extra. */
    async resetPassword(input: ResetPasswordDTO): Promise<Either<InvalidResetTokenError, void>> {
        const token = await this.deps.repository.findResetTokenByHash(
            await hashOpaqueToken(input.token),
        );

        if (!token) {
            logger.warn("auth.reset_password.token_not_found", {});
            return left(new InvalidResetTokenError());
        }
        if (token.used_at) {
            logger.warn("auth.reset_password.token_already_used", { userId: token.user_id });
            return left(new InvalidResetTokenError());
        }
        if (new Date(token.expires_at).getTime() <= Date.now()) {
            logger.warn("auth.reset_password.token_expired", { userId: token.user_id });
            return left(new InvalidResetTokenError());
        }

        await this.deps.repository.completePasswordReset({
            userId: token.user_id,
            tokenId: token.id,
            passwordHash: await hashPassword(input.password),
        });

        logger.info("auth.reset_password.success", { userId: token.user_id });

        return right(undefined);
    }

    // ============================================================
    // Auxiliares
    // ============================================================

    private async buildSession(
        userId: string,
        familyId: string,
        context: RequestContext,
    ): Promise<{ row: NewSession; token: string }> {
        const token = generateOpaqueToken();

        return {
            token,
            row: {
                id: crypto.randomUUID(),
                user_id: userId,
                refresh_token_hash: await hashOpaqueToken(token),
                family_id: familyId,
                expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
                user_agent: context.userAgent,
            },
        };
    }

    private async issueSession(
        user: AuthUser,
        session: { row: NewSession; token: string },
    ): Promise<IssuedSession> {
        const accessToken = await signAccessToken(
            { sub: user.id, email: user.email, role: user.role, sid: session.row.id },
            this.deps.jwtSecret,
        );

        return {
            accessToken,
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            refreshToken: session.token,
            user,
        };
    }
}

function toAuthUser(user: UserWithRole): AuthUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}
