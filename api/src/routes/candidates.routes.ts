import { Hono } from "hono";
import { CandidateErrorCode, ConfirmOtcRequestSchema, PreRegisterRequestSchema } from "shared";
import type { ZodError } from "zod";

import {
    EmailAlreadyRegisteredError,
    InvalidOtcError,
    InvalidOtcTypeError,
    OtcNotFoundError,
    PhoneAlreadyRegisteredError,
    TooManyAttemptsError,
} from "../core/errors/candidate-errors";
import { httpError } from "../lib/http-error";
import { ResendMailer } from "../lib/mailer";
import { CandidateRepository } from "../repositories/candidates.repository";
import { PendingRegistrationRepository } from "../repositories/pending-registration.repository";
import { CandidateService } from "../services/candidates.service";

export const candidatesRouter = new Hono<{ Bindings: CloudflareBindings }>();

function buildService(env: CloudflareBindings): CandidateService {
    const candidates = new CandidateRepository(env.DB);
    const pendingRegistrations = new PendingRegistrationRepository(env.PENDING_REGISTRATIONS);
    const mailer = new ResendMailer(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);

    return new CandidateService(candidates, pendingRegistrations, mailer, {
        otcExpiryMinutes: Number(env.OTC_EXPIRY_MINUTES),
        otcMaxAttempts: Number(env.OTC_MAX_ATTEMPTS),
    });
}

/** Diferencia E3 (email inválido) de E4 (telefone inválido) a partir do primeiro issue do Zod. */
function mapPreRegisterValidationError(error: ZodError) {
    const issue = error.issues[0];
    const path = issue?.path[0];

    if (path === "email") {
        return httpError(400, CandidateErrorCode.INVALID_EMAIL, issue.message, "email");
    }
    if (path === "phone") {
        return httpError(400, CandidateErrorCode.INVALID_PHONE, issue.message, "phone");
    }
    return httpError(400, "VALIDATION_ERROR", issue?.message ?? "Dados inválidos", typeof path === "string" ? path : undefined);
}

function mapConfirmOtcValidationError(error: ZodError) {
    const issue = error.issues[0];
    const path = issue?.path[0];
    return httpError(400, "VALIDATION_ERROR", issue?.message ?? "Dados inválidos", typeof path === "string" ? path : undefined);
}

candidatesRouter.post("/pre-register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PreRegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw mapPreRegisterValidationError(parsed.error);
    }

    const service = buildService(c.env);
    const result = await service.preRegister(parsed.data);

    if (result.isLeft()) {
        const error = result.value;
        if (error instanceof EmailAlreadyRegisteredError) {
            throw httpError(409, error.code, error.message, error.field);
        }
        if (error instanceof PhoneAlreadyRegisteredError) {
            throw httpError(409, error.code, error.message, error.field);
        }
        throw httpError(500, "INTERNAL_ERROR", "Erro inesperado");
    }

    return c.json({ data: result.value }, 201);
});

candidatesRouter.post("/confirm-otc", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ConfirmOtcRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw mapConfirmOtcValidationError(parsed.error);
    }

    const service = buildService(c.env);
    const result = await service.confirmOtc(parsed.data.pendingId, parsed.data.code);

    if (result.isLeft()) {
        const error = result.value;
        if (error instanceof OtcNotFoundError) {
            throw httpError(410, error.code, error.message);
        }
        if (error instanceof InvalidOtcError) {
            throw httpError(400, error.code, error.message, error.field);
        }
        if (error instanceof InvalidOtcTypeError) {
            throw httpError(400, error.code, error.message);
        }
        if (error instanceof TooManyAttemptsError) {
            throw httpError(429, error.code, error.message);
        }
        if (error instanceof EmailAlreadyRegisteredError) {
            throw httpError(409, error.code, error.message, error.field);
        }
        if (error instanceof PhoneAlreadyRegisteredError) {
            throw httpError(409, error.code, error.message, error.field);
        }
        throw httpError(500, "INTERNAL_ERROR", "Erro inesperado");
    }

    return c.json({ data: result.value }, 200);
});
