import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
    CandidateErrorCode,
    ConfirmOtcRequestSchema,
    ConfirmOtcResponseSchema,
    ErrorResponseSchema,
    PreRegisterRequestSchema,
    PreRegisterResponseSchema,
} from "shared";
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

export const candidatesRouter = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

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
        return { code: CandidateErrorCode.INVALID_EMAIL as string, message: issue.message, field: "email" };
    }
    if (path === "phone") {
        return { code: CandidateErrorCode.INVALID_PHONE as string, message: issue.message, field: "phone" };
    }
    return {
        code: "VALIDATION_ERROR",
        message: issue?.message ?? "Dados inválidos",
        field: typeof path === "string" ? path : undefined,
    };
}

function mapConfirmOtcValidationError(error: ZodError) {
    const issue = error.issues[0];
    const path = issue?.path[0];
    return {
        code: "VALIDATION_ERROR",
        message: issue?.message ?? "Dados inválidos",
        field: typeof path === "string" ? path : undefined,
    };
}

const preRegisterRoute = createRoute({
    method: "post",
    path: "/pre-register",
    tags: ["Candidates"],
    summary: "Pré-cadastra um candidato",
    description: "Valida os dados do candidato, cria um registro pendente no KV e envia um código OTC de 6 dígitos por email para confirmação.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: PreRegisterRequestSchema } },
        },
    },
    responses: {
        201: {
            description: "Pré-cadastro criado e código enviado por email",
            content: { "application/json": { schema: PreRegisterResponseSchema } },
        },
        400: {
            description: "Email ou telefone inválido (E3/E4)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Email ou telefone já cadastrado por um candidato confirmado (E1/E2)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        500: {
            description: "Erro inesperado",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

const confirmOtcRoute = createRoute({
    method: "post",
    path: "/confirm-otc",
    tags: ["Candidates"],
    summary: "Confirma o código OTC do pré-cadastro",
    description: "Valida o código de 6 dígitos enviado por email contra o registro pendente no KV e, se válido, efetiva o cadastro do candidato no banco.",
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: ConfirmOtcRequestSchema } },
        },
    },
    responses: {
        200: {
            description: "Cadastro confirmado",
            content: { "application/json": { schema: ConfirmOtcResponseSchema } },
        },
        400: {
            description: "Código inválido (E6) ou de tipo incorreto (E7)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Email ou telefone já cadastrado por um candidato confirmado (E10)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        410: {
            description: "Código expirado ou pendingId inexistente (E5)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        429: {
            description: "Número de tentativas excedido (E9)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        500: {
            description: "Erro inesperado",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

candidatesRouter.openapi(
    preRegisterRoute,
    async (c) => {
        const body = c.req.valid("json");
        const service = buildService(c.env);
        const result = await service.preRegister(body);

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
    },
    (result, c) => {
        if (!result.success) {
            return c.json({ error: mapPreRegisterValidationError(result.error) }, 400);
        }
    },
);

candidatesRouter.openapi(
    confirmOtcRoute,
    async (c) => {
        const { pendingId, code } = c.req.valid("json");
        const service = buildService(c.env);
        const result = await service.confirmOtc(pendingId, code);

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
    },
    (result, c) => {
        if (!result.success) {
            return c.json({ error: mapConfirmOtcValidationError(result.error) }, 400);
        }
    },
);
