import {
    type MemberStatus,
    type SelfDeclaredSignupDTO,
    type SignupRequestDetail,
    type SignupRequestSummary,
    isSelfDeclaredMemberId,
    MEMBER_STATUS_LABELS,
    newSelfDeclaredMemberId,
    normalizeStoredMemberStatus,
    ROLES,
    SelfDeclaredMemberStatusSchema,
} from "shared";

import { type Either, left, right } from "../core/either";
import {
    EmailAlreadyRegisteredError,
    SignupRequestAlreadyDecidedError,
    SignupRequestExpiredError,
    SignupRequestNotFoundError,
} from "../core/errors/auth-errors";
import { logger } from "../lib/logger";
import type { Mailer } from "../lib/mailer";
import { generateOpaqueToken, hashOpaqueToken } from "../lib/opaque-token";
import { hashPassword } from "../lib/password";
import type { AuthRepository } from "../repositories/auth.repository";
import type {
    SignupRequestsRepository,
    SignupRequestWithTokenExpiry,
} from "../repositories/signup-requests.repository";

/** 7 dias (spec.md, Assumptions). */
export const SIGNUP_APPROVAL_TOKEN_TTL_SECONDS = 604_800;

export const PENDING_APPROVAL_MESSAGE =
    "Seu cadastro foi recebido e está aguardando aprovação de um administrador. Você será avisado por email quando houver uma decisão.";

export type SignupRequestReadError = SignupRequestNotFoundError | SignupRequestExpiredError;
export type SignupRequestDecisionError = SignupRequestNotFoundError | SignupRequestAlreadyDecidedError;
export type SelfDeclaredSignupError = EmailAlreadyRegisteredError;

export interface SignupRequestsServiceDeps {
    repository: SignupRequestsRepository;
    authRepository: AuthRepository;
    mailer: Mailer;
    frontOrigin: string;
    signupApprovalEmail: string;
    /** `c.executionCtx.waitUntil` embrulhado — mesmo padrão de `AuthServiceDeps`. */
    defer: (promise: Promise<unknown>) => void;
}

export class SignupRequestsService {
    constructor(private readonly deps: SignupRequestsServiceDeps) {}

    /**
     * `POST /auth/signup-requests` — trilha auto-declarada de trainee/pós-júnior
     * (FEAT-0008, emenda 2026-09-04). Substitui o antigo `create(member:
     * TecMember, ...)`, que delegava do `register()` da Supabase — esse
     * caminho não existe mais: a Supabase só devolve `active`, e
     * pós-júnior/trainee não são mais "encontrados" lá, são descritos aqui.
     *
     * Não consulta a Supabase em nenhum momento. Despacha o e-mail para o
     * admin fora do caminho crítico (`defer`, nunca rejeita — mesmo padrão
     * de `AuthService.dispatchPasswordReset`). Idempotente (FR-016/R3): uma
     * solicitação `pending` já existente para o email não gera duplicata nem
     * segundo e-mail — nem por checagem prévia, nem pela corrida (o índice
     * único parcial do banco é a rede de segurança final).
     */
    async createSelfDeclared(input: SelfDeclaredSignupDTO): Promise<Either<SelfDeclaredSignupError, void>> {
        // Guarda redundante ao schema, de propósito: `active` aqui seria
        // escalonamento de privilégio — é o único status que cria conta sem
        // aprovação. `SelfDeclaredMemberStatusSchema` já barra isso no
        // parse da rota; esta checagem cobre quem chamar o service direto.
        if (!SelfDeclaredMemberStatusSchema.safeParse(input.memberStatus).success) {
            throw new Error(`Status auto-declarado inválido: ${input.memberStatus}`);
        }

        if (await this.deps.authRepository.findUserByEmail(input.email)) {
            logger.warn("signup_requests.create_self_declared.email_conflict", { email: input.email });
            return left(new EmailAlreadyRegisteredError());
        }

        const existing = await this.deps.repository.findPendingByEmail(input.email);
        if (existing) {
            logger.info("signup_requests.create_self_declared.already_pending", { email: input.email });
            return right(undefined);
        }

        const passwordHash = await hashPassword(input.password);
        const requestId = crypto.randomUUID();
        const token = generateOpaqueToken();

        try {
            await this.deps.repository.create(
                {
                    id: requestId,
                    email: input.email,
                    password_hash: passwordHash,
                    // Quem se auto-declara nunca teve uuid da Supabase — ver
                    // shared/src/schemas/member.schema.ts.
                    member_id: newSelfDeclaredMemberId(),
                    full_name: input.fullName,
                    phone: input.phone,
                    // Não pedido no formulário auto-declarado (decisão do plano).
                    birth_date: null,
                    course: input.course,
                    semester: input.semester,
                    gender: input.gender,
                    ethnicity: input.ethnicity,
                    member_status: input.memberStatus,
                    // Não existe cargo de "manager" para quem se auto-declara.
                    manager: false,
                },
                {
                    id: crypto.randomUUID(),
                    signup_request_id: requestId,
                    token_hash: await hashOpaqueToken(token),
                    expires_at: new Date(
                        Date.now() + SIGNUP_APPROVAL_TOKEN_TTL_SECONDS * 1000,
                    ).toISOString(),
                },
            );
        } catch (err) {
            // Corrida entre a checagem acima e este INSERT: outra requisição
            // venceu e já criou a `pending` (índice único parcial, R3).
            // Idempotente também aqui — mesmo efeito de "já existe".
            if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
                logger.info("signup_requests.create_self_declared.race_already_pending", {
                    email: input.email,
                });
                return right(undefined);
            }
            throw err;
        }

        logger.info("signup_requests.create_self_declared.success", {
            requestId,
            email: input.email,
        });

        this.deps.defer(
            this.dispatchApprovalRequest({
                email: input.email,
                memberName: input.fullName,
                status: input.memberStatus,
                reviewUrl: this.buildReviewUrl(token),
            }),
        );

        return right(undefined);
    }

    /** Nunca rejeita: a solicitação já foi gravada, um erro aqui não pode virar resposta diferente. */
    private async dispatchApprovalRequest(params: {
        email: string;
        memberName: string;
        status: string;
        reviewUrl: string;
    }): Promise<void> {
        try {
            await this.deps.mailer.sendSignupApprovalRequest({
                to: this.deps.signupApprovalEmail,
                memberName: params.memberName,
                memberStatusLabel: MEMBER_STATUS_LABELS[params.status as MemberStatus] ?? params.status,
                reviewUrl: params.reviewUrl,
            });
            logger.info("signup_requests.approval_request.dispatched", {});
        } catch (err) {
            logger.error("signup_requests.approval_request.dispatch_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private buildReviewUrl(token: string): string {
        return `${this.deps.frontOrigin.replace(/\/$/, "")}/solicitacoes/${encodeURIComponent(token)}`;
    }

    // ============================================================
    // GET /auth/signup-requests/by-token/:token — sem auth (R2)
    // ============================================================

    async getByToken(token: string): Promise<Either<SignupRequestReadError, SignupRequestDetail>> {
        const row = await this.deps.repository.findByTokenHash(await hashOpaqueToken(token));

        if (!row) {
            logger.warn("signup_requests.get_by_token.not_found", {});
            return left(new SignupRequestNotFoundError());
        }

        if (new Date(row.token_expires_at).getTime() < Date.now()) {
            logger.warn("signup_requests.get_by_token.expired", { requestId: row.id });
            return left(new SignupRequestExpiredError());
        }

        return right(await this.toDetail(row));
    }

    // ============================================================
    // GET /auth/signup-requests — painel, admin (US3)
    // ============================================================

    async list(status: "pending" | "approved" | "rejected"): Promise<SignupRequestSummary[]> {
        const rows = await this.deps.repository.listByStatus(status);

        return Promise.all(rows.map((row) => this.toSummary(row)));
    }

    // ============================================================
    // POST /auth/signup-requests/:id/decision — admin autenticado (R2)
    // ============================================================

    /**
     * Transição atômica (FR-010/SC-004): `repository.decide` só grava se a
     * linha ainda estiver `pending`. Distingue 404 (nunca existiu) de 409
     * (já decidida) com um `findById` prévio — o `UPDATE` sozinho não sabe
     * dizer qual dos dois aconteceu.
     */
    async decide(
        id: string,
        adminUserId: string,
        decision: "approve" | "reject",
    ): Promise<Either<SignupRequestDecisionError, void>> {
        const existing = await this.deps.repository.findById(id);
        if (!existing) {
            logger.warn("signup_requests.decide.not_found", { requestId: id });
            return left(new SignupRequestNotFoundError());
        }

        const newStatus = decision === "approve" ? "approved" : "rejected";
        const decided = await this.deps.repository.decide(id, adminUserId, newStatus);

        if (!decided) {
            logger.warn("signup_requests.decide.already_decided", { requestId: id });
            return left(new SignupRequestAlreadyDecidedError());
        }

        if (decision === "approve") {
            await this.deps.authRepository.createApprovedMemberAccount(
                {
                    id: crypto.randomUUID(),
                    role_id: ROLES.AVALIADOR,
                    email: decided.email,
                    name: decided.full_name,
                    password: decided.password_hash,
                },
                {
                    id: crypto.randomUUID(),
                    member_id: decided.member_id,
                    full_name: decided.full_name,
                    phone: decided.phone,
                    birth_date: decided.birth_date,
                    course: decided.course,
                    semester: decided.semester,
                    gender: decided.gender,
                    ethnicity: decided.ethnicity,
                    status: decided.member_status,
                    manager: decided.manager as unknown as boolean, // D1: 0/1 cru — ver nota em auth.repository
                    synced_at: new Date().toISOString(),
                },
            );
        }

        logger.info("signup_requests.decide.success", {
            requestId: id,
            decision,
            adminUserId,
        });

        this.deps.defer(
            this.dispatchDecisionResult({ to: decided.email, approved: decision === "approve" }),
        );

        return right(undefined);
    }

    /** Nunca rejeita: a decisão já foi gravada, um erro aqui não pode reverter a resposta ao admin. */
    private async dispatchDecisionResult(params: { to: string; approved: boolean }): Promise<void> {
        try {
            await this.deps.mailer.sendSignupDecisionResult(params);
            logger.info("signup_requests.decision_result.dispatched", {});
        } catch (err) {
            logger.error("signup_requests.decision_result.dispatch_failed", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ============================================================
    // Mapeamento para os contratos de `shared`
    // ============================================================

    private async toSummary(row: {
        id: string;
        full_name: string;
        email: string;
        member_id: string;
        member_status: string;
        created_at: string;
    }): Promise<SignupRequestSummary> {
        return {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            memberStatus: this.toMemberStatus(row.member_status),
            createdAt: row.created_at,
            priorRejectionCount: await this.deps.repository.countRejectedByEmail(row.email),
            selfDeclared: isSelfDeclaredMemberId(row.member_id),
        };
    }

    /**
     * Valida em vez de castar: os únicos escritores desta coluna são código
     * nosso com enum validado (`MemberStatusSchema`/`SelfDeclaredMemberStatusSchema`),
     * então um valor fora do enum é dado corrompido, não um caso esperado.
     * `normalizeStoredMemberStatus` traduz o legado `inactive` pré-migration-0016
     * (ver research.md da 008, R7) — lançar aqui, e não em silêncio, evita que
     * o dado corrompido só apareça como `ZodError` no parse do front, longe
     * da causa.
     */
    private toMemberStatus(raw: string): MemberStatus {
        const status = normalizeStoredMemberStatus(raw);
        if (!status) {
            logger.error("signup_requests.unknown_member_status", { raw });
            throw new Error(`member_status desconhecido na solicitação: ${raw}`);
        }
        return status;
    }

    private async toDetail(row: SignupRequestWithTokenExpiry): Promise<SignupRequestDetail> {
        return {
            ...(await this.toSummary(row)),
            status: row.status,
            decidedAt: row.decided_at,
        };
    }
}
