import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CheckinErrorCode,
    ErrorResponseSchema,
    EvaluatorErrorCode,
    EvaluatorListResponseSchema,
    EvaluatorResponseSchema,
    EvaluatorRoleFilterSchema,
    ROLES,
    SetEvaluatorRoleSchema,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { EvaluatorsRepository } from "../repositories/evaluators.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { EvaluatorsService } from "../services/evaluators.service";

export const evaluatorsRouter = new OpenAPIHono<AuthEnv>();

/** Gestão de avaliadores é admin-only, inclusive leitura (FR-007). */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const UserIdParamsSchema = z.object({
    userId: z.string().uuid().openapi({
        param: { name: "userId", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

const ListQuerySchema = z.object({
    role: EvaluatorRoleFilterSchema.openapi({ param: { name: "role", in: "query" } }),
});

function buildService(c: Context<AuthEnv>): EvaluatorsService {
    return new EvaluatorsService(new EvaluatorsRepository(c.env.DB), new SelectionProcessRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409,
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
// GET /evaluators
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Evaluators"],
    summary: "Lista avaliadores da edição corrente, com cargo e situação do membro",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { query: ListQuerySchema },
    responses: {
        200: {
            description: "Avaliadores da edição corrente",
            content: { "application/json": { schema: EvaluatorListResponseSchema } },
        },
        400: { description: "Query inválida", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo seletivo corrente",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

evaluatorsRouter.openapi(
    listRoute,
    async (c) => {
        const { role } = c.req.valid("query");
        const result = await buildService(c).list(role);
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// PUT /evaluators/:userId/role
// ============================================================

const setRoleRoute = createRoute({
    method: "put",
    path: "/{userId}/role",
    tags: ["Evaluators"],
    summary: "Alterna o cargo de um avaliador na edição corrente",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        params: UserIdParamsSchema,
        body: { required: true, content: { "application/json": { schema: SetEvaluatorRoleSchema } } },
    },
    responses: {
        200: {
            description: "Cargo atualizado",
            content: { "application/json": { schema: EvaluatorResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Avaliador não encontrado", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo seletivo corrente",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

evaluatorsRouter.openapi(
    setRoleRoute,
    async (c) => {
        const { userId } = c.req.valid("param");
        const { role } = c.req.valid("json");
        const result = await buildService(c).setRole(userId, role);
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);
