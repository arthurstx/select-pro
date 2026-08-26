import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CheckinErrorCode,
    ErrorResponseSchema,
    EvaluatorErrorCode,
    MemberCheckinErrorCode,
    MemberCheckinListResponseSchema,
    MemberCheckinResponseSchema,
    ROLES,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { MemberCheckinRepository } from "../repositories/member-checkin.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { MemberCheckinService } from "../services/member-checkin.service";

export const memberCheckinRouter = new OpenAPIHono<AuthEnv>();

/** Check-in de membro é admin-only (research.md D5, FEAT-0010) — mais restrito que o de candidato. */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const UserIdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

function buildService(c: Context<AuthEnv>): MemberCheckinService {
    return new MemberCheckinService(new MemberCheckinRepository(c.env.DB), new SelectionProcessRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409,
    [MemberCheckinErrorCode.NO_EVALUATORS_IN_EDITION]: 409,
    [EvaluatorErrorCode.EVALUATOR_NOT_FOUND]: 404,
};

interface DomainError {
    code: string;
    message: string;
    field?: string;
}

function throwDomainError(error: DomainError): never {
    throw httpError(STATUS_BY_ERROR_CODE[error.code] ?? 500, error.code, error.message, error.field);
}

function validationHook(result: { success: boolean; error?: ZodError }, c: Context<AuthEnv>) {
    if (!result.success && result.error) {
        const issue = result.error.issues[0];
        return c.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: issue?.message ?? "Dados inválidos",
                    field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
                },
            },
            400,
        );
    }
}

// ============================================================
// GET /member-checkins
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["MemberCheckins"],
    summary: "Lista avaliadores/hosts da edição corrente, com estado de presença",
    description:
        "Sem paginação — escala de dezenas de pessoas por edição (plan.md, Technical Context). 409 distingue sem-processo-corrente de sem-avaliadores-atribuídos.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Lista com resumo de presença",
            content: { "application/json": { schema: MemberCheckinListResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente (FR-008) ou edição sem avaliador/host atribuído (FR-009)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

memberCheckinRouter.openapi(listRoute, async (c) => {
    const result = await buildService(c).list();
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// PUT /member-checkins/{id}/checkin
// ============================================================

const markRoute = createRoute({
    method: "put",
    path: "/{id}/checkin",
    tags: ["MemberCheckins"],
    summary: "Marca presença de um avaliador/host",
    description: "Idempotente: marcar duas vezes devolve o `checkedInAt` da confirmação original, sem erro.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: UserIdParamsSchema },
    responses: {
        200: {
            description: "Presença confirmada",
            content: { "application/json": { schema: MemberCheckinResponseSchema } },
        },
        400: { description: "`id` não é um UUID válido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "`id` não corresponde a avaliador/host elegível",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

memberCheckinRouter.openapi(
    markRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).markPresent(id, c.get("auth").sub);
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// DELETE /member-checkins/{id}/checkin
// ============================================================

const unmarkRoute = createRoute({
    method: "delete",
    path: "/{id}/checkin",
    tags: ["MemberCheckins"],
    summary: "Desmarca presença de um avaliador/host",
    description: "Idempotente: desmarcar quem já está ausente é no-op — `204` de qualquer forma.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: UserIdParamsSchema },
    responses: {
        204: { description: "Presença desmarcada (ou já estava)" },
        400: { description: "`id` não é um UUID válido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "`id` não corresponde a avaliador/host elegível",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

memberCheckinRouter.openapi(
    unmarkRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).unmarkPresent(id, c.get("auth").sub);
        if (result.isLeft()) throwDomainError(result.value);

        return c.body(null, 204);
    },
    validationHook,
);
