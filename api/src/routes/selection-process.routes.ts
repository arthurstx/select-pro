import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CheckinErrorCode,
    ErrorResponseSchema,
    ROLES,
    SelectionProcessAdminErrorCode,
    SelectionProcessAdminListResponseSchema,
    SelectionProcessAdminResponseSchema,
    UpdateSelectionProcessAdminSchema,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { SelectionProcessAdminService } from "../services/selection-process-admin.service";

export const selectionProcessRouter = new OpenAPIHono<AuthEnv>();

/** FEAT-0017 — inteiramente admin-only, mesmo padrão de `/rooms`, `/exports` etc. */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const IdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

function buildService(c: Context<AuthEnv>): SelectionProcessAdminService {
    return new SelectionProcessAdminService(new SelectionProcessRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND]: 404,
    [SelectionProcessAdminErrorCode.SELECTION_PROCESS_LABEL_ALREADY_EXISTS]: 409,
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
// GET /selection-processes
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["SelectionProcesses"],
    summary: "Lista os processos seletivos já criados",
    description: "Ordenados por starts_at DESC. A criação continua exclusivamente automática (resolveCurrent()).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Processos seletivos cadastrados",
            content: { "application/json": { schema: SelectionProcessAdminListResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

selectionProcessRouter.openapi(listRoute, async (c) => {
    const data = await buildService(c).list();
    return c.json({ data }, 200);
});

// ============================================================
// PUT /selection-processes/:id
// ============================================================

const updateRoute = createRoute({
    method: "put",
    path: "/{id}",
    tags: ["SelectionProcesses"],
    summary: "Corrige label/starts_at/ends_at de um processo seletivo existente",
    description: "Correção pontual — não cria processo novo. starts_at deve ser anterior a ends_at.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        params: IdParamsSchema,
        body: { required: true, content: { "application/json": { schema: UpdateSelectionProcessAdminSchema } } },
    },
    responses: {
        200: {
            description: "Processo seletivo atualizado",
            content: { "application/json": { schema: SelectionProcessAdminResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "Processo seletivo não existe",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Já existe outro processo com este label",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

selectionProcessRouter.openapi(
    updateRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).update(id, c.req.valid("json"));
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);
