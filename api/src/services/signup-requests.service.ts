import {
    type MemberStatus,
    type SignupRequestDetail,
    type SignupRequestSummary,
    type TecMember,
    ROLES,
} from "shared";

import { type Either, left, right } from "../core/either";
import {
    SignupRequestAlreadyDecidedError,
    SignupRequestExpiredError,
    SignupRequestNotFoundError,
} from "../core/errors/auth-errors";
import { logger } from "../lib/logger";
import type { Mailer } from "../lib/mailer";
import { generateOpaqueToken, hashOpaqueToken } from "../lib/opaque-token";
import type { AuthRepository } from "../repositories/auth.repository";
import type {
    SignupRequestsRepository,
    SignupRequestWithTokenExpiry,
} from "../repositories/signup-requests.repository";

/** 7 dias (spec.md, Assumptions). */
export const SIGNUP_APPROVAL_TOKEN_TTL_SECONDS = 604_800;

export const PENDING_APPROVAL_MESSAGE =
    "Seu cadastro foi recebido e está aguardando aprovação de um administrador. Você será avisado por email quando houver uma decisão.";

/** Rótulo em português para o e-mail do admin — não é contrato, só texto de mensagem. */
const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
    active: "efetivado",
    inactive: "pós-júnior",
    trainee: "trainee",
};

export type SignupRequestReadError = SignupRequestNotFoundError | SignupRequestExpiredError;
export type SignupRequestDecisionError = SignupRequestNotFoundError | SignupRequestAlreadyDecidedError;

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
     * Registra a solicitação e despacha o e-mail para o admin, fora do
     * caminho crítico (`defer`, nunca rejeita — mesmo padrão de
     * `AuthService.dispatchPasswordReset`). Idempotente (FR-016/R3): uma
     * solicitação `pending` já existente para o email não gera duplicata nem
     * segundo e-mail — nem por checagem prévia, nem pela corrida (o índice
     * único parcial do banco é a rede de segurança final).
     */
    async create(member: TecMember, email: string, passwordHash: string): Promise<void> {
        const existing = await this.deps.repository.findPendingByEmail(email);
        if (existing) {
            logger.info("signup_requests.create.already_pending", { email });
            return;
        }

        const requestId = crypto.randomUUID();
        const token = generateOpaqueToken();

        try {
            await this.deps.repository.create(
                {
                    id: requestId,
                    email,
                    password_hash: passwordHash,
                    member_id: member.id,
                    full_name: member.full_name,
                    phone: member.phone,
                    birth_date: member.birth_date,
                    course: member.course,
                    semester: member.semester,
                    gender: member.gender,
                    ethnicity: member.ethnicity,
                    member_status: member.status ?? "",
                    manager: member.manager,
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
                logger.info("signup_requests.create.race_already_pending", { email });
                return;
            }
            throw err;
        }

        logger.info("signup_requests.create.success", { requestId, email, memberId: member.id });

        this.deps.defer(this.dispatchApprovalRequest({ email, memberName: member.full_name, status: member.status ?? "", reviewUrl: this.buildReviewUrl(token) }));
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
                memberStatusLabel: MEMBER_STATUS_LABEL[params.status as MemberStatus] ?? params.status,
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
        member_status: string;
        created_at: string;
    }): Promise<SignupRequestSummary> {
        return {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            memberStatus: row.member_status as MemberStatus,
            createdAt: row.created_at,
            priorRejectionCount: await this.deps.repository.countRejectedByEmail(row.email),
        };
    }

    private async toDetail(row: SignupRequestWithTokenExpiry): Promise<SignupRequestDetail> {
        return {
            ...(await this.toSummary(row)),
            status: row.status,
            decidedAt: row.decided_at,
        };
    }
}
