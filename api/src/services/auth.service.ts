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

/** 7 dias. Cobre a semana de trabalho sem forçar login diário; uma sessão parada morre sozinha. */
export const REFRESH_TOKEN_TTL_SECONDS = 604_800;

/** 30 minutos. Limita a janela de um link de recuperação esquecido numa caixa de entrada. */
export const RESET_TOKEN_TTL_SECONDS = 1_800;

/**
 * A resposta de `/auth/forgot-password`, sempre esta, exista ou não o email.
 *
 * A redação é condicional ("se ... estiver") porque precisa ser verdadeira nos
 * dois casos: uma confirmação afirmativa seria mentira num deles e entregaria
 * justamente a informação que o 202 genérico existe para esconder.
 */
export const FORGOT_PASSWORD_MESSAGE =
    "Se o email estiver cadastrado, você receberá um link de recuperação.";

export interface RequestContext {
    /** Guardado em `sessions` para uma futura tela de "sessões ativas". IP não é coletado. */
    userAgent: string | null;
}

/** O que a rota precisa para montar a resposta e o cookie. */
export interface IssuedSession {
    accessToken: string;
    expiresIn: number;
    /** Em claro — só para o `Set-Cookie`. No banco só existe o SHA-256 dele. */
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
    /** Origin do front, usada para montar o link de recuperação. */
    frontOrigin: string;
    /**
     * Agenda trabalho para depois da resposta.
     *
     * É `c.executionCtx.waitUntil` embrulhado numa função, e não o `Context` do
     * Hono: o service continua sem saber que existe HTTP, mas ganha a capacidade
     * de tirar o envio de email do caminho crítico (`api/.agents/architecture`).
     */
    defer: (promise: Promise<unknown>) => void;
}

export class AuthService {
    constructor(private readonly deps: AuthServiceDeps) {}

    // ============================================================
    // Cadastro — POST /auth/register
    // ============================================================

    /**
     * Checagem no D1, checagem no diretório da tec e, só então, escrita.
     *
     * A ordem não é arbitrária: a derivação da senha é a única operação cara em
     * CPU de todo o fluxo, e deixá-la depois das duas validações significa que
     * quem não é membro nunca chega a custar PBKDF2.
     */
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
                // Fail-closed: nada é gravado no D1. Criar a conta "para validar
                // depois" transformaria uma indisponibilidade momentânea da
                // Supabase em conta indevida permanente (FEAT-0003, seção 9).
                logger.warn("auth.register.directory_unavailable", { email: input.email });
                return left(err);
            }
            throw err;
        }

        if (!member) {
            logger.warn("auth.register.not_a_member", { email: input.email });
            return left(new NotAMemberError());
        }

        // Lista, não comparação com "active": esta é a regra da spec com maior
        // chance de mudar, e mudá-la precisa custar uma linha em `shared`. Um
        // status desconhecido cai aqui também — fail-closed, porque a coluna é
        // TEXT livre na origem e a aplicação é a única barreira que existe.
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
                    // Todo cadastro entra como avaliador, sempre. O `manager` da
                    // tec é gravado no snapshot mas não concede papel: cargo na
                    // empresa e permissão na aplicação são coisas diferentes, e
                    // `admin` só nasce de UPDATE manual (FEAT-0003, seção 9).
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
                    // Valores crus da tec, sem conversão para os enums da
                    // aplicação: são dados de um sistema que não controlamos.
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

            // E6: duas requisições com o mesmo email passaram juntas pela
            // checagem prévia e a constraint barrou a segunda. A checagem de
            // cima dá a mensagem no caso comum; a constraint é a invariante.
            if (violation?.table === "users" && violation.column === "email") {
                logger.warn("auth.register.email_constraint_conflict", { email: input.email });
                return left(new EmailAlreadyRegisteredError());
            }

            // Aquele membro já tem conta, com OUTRO email. Mesma família de
            // conflito (409), causa diferente — e a spec não prevê um `code`
            // próprio, então reusa o de email com uma mensagem que descreve o
            // que de fato aconteceu. Só o log distingue os dois casos.
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

    /**
     * O login **não** consulta a Supabase: uma indisponibilidade dela impede
     * cadastros novos, mas não pode derrubar quem já tem conta (seção 9).
     */
    async login(
        input: LoginDTO,
        context: RequestContext,
    ): Promise<Either<LoginError, IssuedSession>> {
        const user = await this.deps.repository.findUserByEmail(input.email);

        // `verifyPassword` é chamado mesmo com `user` nulo, e paga uma derivação
        // de fachada nesse caso. Sem isso, um email inexistente responderia
        // muito mais rápido que uma senha errada e o tempo de resposta viraria o
        // verificador de contas que a resposta idêntica de E7 evita.
        const passwordMatches = await verifyPassword(input.password, user?.password ?? null);

        if (!user || !passwordMatches) {
            logger.warn("auth.login.invalid_credentials", { email: input.email });
            return left(new InvalidCredentialsError());
        }

        // Só depois de a senha conferir. Checar antes diria a qualquer um se um
        // email tem conta desativada — de novo, sem credencial nenhuma.
        if (user.deactivated_at) {
            logger.warn("auth.login.account_deactivated", { userId: user.id });
            await this.deps.repository.revokeAllUserSessions(user.id);
            return left(new AccountDeactivatedError());
        }

        // Reforço do hash: a conta se fortalece sozinha no próximo login depois
        // que `PBKDF2_ITERATIONS` sobe, sem migration e sem ninguém trocar de
        // senha. As duas derivações numa requisição só (a verificação acima e
        // esta) só acontecem depois que a constante muda — que, pela spec, é
        // quando o projeto sai do plano Free e o teto de 10 ms deixa de valer.
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

        // Reuso: alguém apresentou um token que já tinha sido rotacionado. Ou o
        // token vazou, ou o cliente legítimo repetiu uma requisição — e não há
        // como saber qual, então a família inteira cai. O cliente recebe o mesmo
        // erro de um token qualquer inválido: sinalizar a diferença entregaria
        // informação a quem estivesse testando tokens roubados (seção 8.4).
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

        // Rotação: mesma família, token novo. É o que dá sentido a persistir
        // sessão — sem ela um refresh token roubado vale 7 dias em silêncio.
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

    /**
     * Sempre "dá certo", e por isso não devolve `Either`.
     *
     * Cookie ausente, token desconhecido ou sessão já revogada levam ao mesmo
     * 204: não há informação útil em distinguir esses casos, e um erro aqui só
     * atrapalharia o front a limpar o próprio estado — que é a única coisa que
     * ele realmente precisa fazer ao sair.
     */
    async logout(refreshToken: string | undefined): Promise<void> {
        if (!refreshToken) return;

        const session = await this.deps.repository.findSessionByTokenHash(
            await hashOpaqueToken(refreshToken),
        );
        if (!session) return;

        // A família inteira, não só esta linha: sair significa encerrar a sessão
        // que começou naquele login, e a cadeia de rotações é a sessão.
        await this.deps.repository.revokeSessionFamily(session.family_id);
        logger.info("auth.logout.success", { userId: session.user_id });
    }

    // ============================================================
    // Sessão atual — GET /auth/me
    // ============================================================

    /**
     * Lê o banco em vez de devolver o conteúdo do token: esta é a rota que o
     * front usa para reidratar a sessão ao recarregar a página, e nesse momento
     * ele precisa dos dados atuais, não do que estava no token emitido 15
     * minutos antes.
     */
    async me(userId: string): Promise<Either<MeError, MeResponse["data"]>> {
        const user = await this.deps.repository.findUserWithProfileById(userId);

        if (!user) {
            // Assinatura válida, usuário inexistente: a conta foi apagada com o
            // token ainda em circulação. Para o cliente é fim de sessão.
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
                // D1 devolve INTEGER 0/1 para a coluna; o contrato é boolean.
                manager: user.manager === 1,
                syncedAt: user.synced_at,
            },
        });
    }

    // ============================================================
    // Recuperação de senha
    // ============================================================

    /**
     * Responde igual para email existente e inexistente — sempre 202, sempre a
     * mesma mensagem, sem cenário de erro visível ao cliente.
     *
     * O caminho até a resposta é literalmente o mesmo nos dois casos: uma
     * consulta ao D1 e pronto. Geração de token, escrita e envio acontecem
     * **depois** da resposta, em `defer`. Isso não é só arrumação: se a escrita
     * ficasse antes do `return`, o email cadastrado responderia mais devagar que
     * o desconhecido e a rota voltaria a ser um verificador de contas, agora por
     * tempo em vez de por status.
     */
    async forgotPassword(input: ForgotPasswordDTO): Promise<Either<never, { message: string }>> {
        const user = await this.deps.repository.findUserByEmail(input.email);

        this.deps.defer(this.dispatchPasswordReset(user));

        return right({ message: FORGOT_PASSWORD_MESSAGE });
    }

    /**
     * Grava o token e dispara o email, fora do caminho da resposta.
     *
     * Nunca rejeita: um erro aqui não pode virar uma resposta diferente ao
     * membro, que já recebeu o 202. Sem fila, o preço é não ter retry — um
     * Resend fora do ar perde este email e o membro pede de novo (seção 13).
     */
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

    /**
     * Troca a senha e derruba **todas** as sessões do usuário.
     *
     * Revogar tudo é o ponto do fluxo, não um extra: quem redefine a senha ou
     * esqueceu dela, ou desconfia que alguém a tem. Nos dois casos, deixar as
     * sessões antigas vivas anula o motivo da troca.
     */
    async resetPassword(input: ResetPasswordDTO): Promise<Either<InvalidResetTokenError, void>> {
        const token = await this.deps.repository.findResetTokenByHash(
            await hashOpaqueToken(input.token),
        );

        // Os três casos — inexistente, já usado e expirado — devolvem o mesmo
        // erro. Distingui-los diria a quem tem um link velho se ele um dia
        // existiu, e não ajudaria o membro legítimo, cuja ação é a mesma nos
        // três: pedir um link novo.
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

    /**
     * Monta a linha de `sessions` e guarda o token em claro ao lado dela.
     *
     * O token em claro existe só aqui e no `Set-Cookie` — no banco vai apenas o
     * SHA-256, para que um dump do D1 não vire acesso às contas.
     */
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
