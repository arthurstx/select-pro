import type { CandidateRow, NewCandidate, PendingRegistration, PreRegisterRequest } from "shared";

import { type Either, left, right } from "../core/either";
import {
    EmailAlreadyRegisteredError,
    InvalidOtcError,
    InvalidOtcTypeError,
    OtcNotFoundError,
    PhoneAlreadyRegisteredError,
    TooManyAttemptsError,
} from "../core/errors/candidate-errors";
import { parseD1ConstraintError } from "../lib/d1-errors";
import { logger } from "../lib/logger";
import type { Mailer } from "../lib/mailer";
import { generateOtcCode, hashOtcCode, verifyOtcCode } from "../lib/otc";
import type { CandidateRepository } from "../repositories/candidates.repository";
import type { PendingRegistrationRepository } from "../repositories/pending-registration.repository";

export interface CandidateServiceConfig {
    otcExpiryMinutes: number;
    otcMaxAttempts: number;
}

type PreRegisterError = EmailAlreadyRegisteredError | PhoneAlreadyRegisteredError;
type PreRegisterResult = { pendingId: string; message: string; expiresAt: string };

type ConfirmOtcError =
    | OtcNotFoundError
    | InvalidOtcTypeError
    | InvalidOtcError
    | TooManyAttemptsError
    | EmailAlreadyRegisteredError
    | PhoneAlreadyRegisteredError;
type ConfirmOtcResult = { id: string; status: "confirmed"; name: string; email: string; updatedAt: string };

export class CandidateService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly pendingRegistrations: PendingRegistrationRepository,
        private readonly mailer: Mailer,
        private readonly config: CandidateServiceConfig,
    ) {}

    async preRegister(input: PreRegisterRequest): Promise<Either<PreRegisterError, PreRegisterResult>> {
        const existingByEmail = await this.candidates.findByEmail(input.email);
        if (existingByEmail) {
            logger.warn("candidate.pre_register.email_conflict", { email: input.email });
            return left(new EmailAlreadyRegisteredError());
        }

        const existingByPhone = await this.candidates.findByPhone(input.phone);
        if (existingByPhone) {
            logger.warn("candidate.pre_register.phone_conflict", { phone: input.phone });
            return left(new PhoneAlreadyRegisteredError());
        }

        const pendingId = crypto.randomUUID();
        const code = generateOtcCode();
        const codeHash = await hashOtcCode(code);
        const expiresAt = new Date(Date.now() + this.config.otcExpiryMinutes * 60_000).toISOString();

        const pending: PendingRegistration = {
            candidate: {
                name: input.name,
                email: input.email,
                phone: input.phone,
                course: input.course,
                semester: input.semester,
                gender: input.gender,
            },
            otc: {
                code_hash: codeHash,
                type: "confirm-email",
                attempts: 0,
                max_attempts: this.config.otcMaxAttempts,
                expires_at: expiresAt,
            },
            created_at: new Date().toISOString(),
        };

        // Grava no KV e só então envia o email — nunca antes do put confirmado (FEAT-0001 seção 6).
        await this.pendingRegistrations.put(pendingId, pending);
        logger.info("candidate.pre_register.pending_created", { pendingId, email: input.email, expiresAt });

        try {
            await this.mailer.sendOtcEmail({ to: input.email, name: input.name, code });
            logger.info("candidate.pre_register.otc_email_sent", { pendingId, email: input.email });
        } catch (err) {
            // Decisão #4 (prompt seção 8): falha no envio não reverte o KV, só loga.
            logger.error("candidate.pre_register.otc_email_failed", {
                pendingId,
                email: input.email,
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return right({ pendingId, message: "Código enviado por email", expiresAt });
    }

    async confirmOtc(pendingId: string, code: string): Promise<Either<ConfirmOtcError, ConfirmOtcResult>> {
        const pending = await this.pendingRegistrations.get(pendingId);
        if (!pending) {
            logger.warn("candidate.confirm_otc.not_found", { pendingId });
            return left(new OtcNotFoundError());
        }

        const isRightType = pending.otc.type === "confirm-email";
        const isValidCode = isRightType && (await verifyOtcCode(code, pending.otc.code_hash));

        if (!isRightType || !isValidCode) {
            // FEAT-0001 seção 8.1: tanto E6 (código errado) quanto E7 (tipo errado)
            // incrementam `attempts` e respeitam o mesmo limite de `max_attempts`.
            const attempts = pending.otc.attempts + 1;
            const reason = isRightType ? "invalid_code" : "invalid_type";

            if (attempts >= pending.otc.max_attempts) {
                await this.pendingRegistrations.delete(pendingId);
                logger.warn("candidate.confirm_otc.too_many_attempts", { pendingId, attempts, reason });
                return left(new TooManyAttemptsError());
            }

            await this.pendingRegistrations.put(pendingId, {
                ...pending,
                otc: { ...pending.otc, attempts },
            });
            logger.warn("candidate.confirm_otc.invalid_attempt", { pendingId, attempts, reason });

            return left(isRightType ? new InvalidOtcError() : new InvalidOtcTypeError());
        }

        const newCandidate: NewCandidate = {
            id: crypto.randomUUID(),
            ...pending.candidate,
        };

        let row: CandidateRow;
        try {
            row = await this.candidates.insert(newCandidate);
        } catch (err) {
            const field = parseD1ConstraintError(err);
            if (field) {
                // E10: mantém o KV de propósito para permitir nova tentativa (FEAT-0001 seção 5).
                logger.warn("candidate.confirm_otc.constraint_conflict", { pendingId, field });
            }
            if (field === "email") return left(new EmailAlreadyRegisteredError());
            if (field === "phone") return left(new PhoneAlreadyRegisteredError());

            logger.error("candidate.confirm_otc.insert_failed", {
                pendingId,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err; // falha técnica genuína (não é E10) — sobe para app.onError()
        }

        // Só chega aqui em sucesso real: E10 (constraint) retorna antes e preserva o KV.
        await this.pendingRegistrations.delete(pendingId);
        logger.info("candidate.confirm_otc.success", { pendingId, candidateId: row.id, email: row.email });

        return right({
            id: row.id,
            status: "confirmed",
            name: row.name,
            email: row.email,
            updatedAt: row.updated_at ?? row.created_at,
        });
    }
}
