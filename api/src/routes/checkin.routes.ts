import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CheckinErrorCode,
    CheckinResponseSchema,
    ErrorResponseSchema,
    ListCandidatesQuerySchema,
    ListCandidatesResponseSchema,
    ROLES,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { CandidateRepository } from "../repositories/candidates.repository";
import { CheckinRepository } from "../repositories/checkin.repository";
import { CheckinService } from "../services/checkin.service";

export const checkinRouter = new OpenAPIHono<AuthEnv>();

// Path param de rota, não entidade — pode ficar local (api/.agents/validation/SKILL.md).
const CandidateIdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

/** Hoje não barra ninguém — só existem esses dois papéis (FEAT-0005, seção 9). */
const AUTHORIZED = [requireAuth, requireRole(ROLES.ADMIN, ROLES.AVALIADOR)];

function buildService(c: Context<AuthEnv>): CheckinService {
    return new CheckinService(new CandidateRepository(c.env.DB), new CheckinRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.CANDIDATE_NOT_FOUND]: 404,
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409,
    [CheckinErrorCode.CANDIDATE_NOT_IN_ACTIVE_PROCESS]: 409,
};

interface DomainError {
    code: string;
    message: string;
    field?: string;
}

function throwDomainError(error: DomainError): never {
    throw httpError(STATUS_BY_ERROR_CODE[error.code] ?? 500, error.code, error.message, error.field);
}

function mapValidationError(error: ZodError): DomainError {
    const issue = error.issues[0];
    const field = issue?.path[0];

    return {
        code: "VALIDATION_ERROR",
        message: issue?.message ?? "Dados inválidos",
        field: typeof field === "string" ? field : undefined,
    };
}

function validationHook(result: { success: boolean; error?: ZodError }, c: Context<AuthEnv>) {
    if (!result.success && result.error) {
        return c.json({ error: mapValidationError(result.error) }, 400);
    }
}

// ============================================================
// GET /candidates
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Candidates"],
    summary: "Lista candidatos do processo seletivo corrente, com estado de presença",
    description:
        "Busca, filtro de status e paginação resolvidos no banco — nunca no cliente. Cria a edição corrente sob demanda se ainda não existir (FEAT-0005, seção 4.1.1).",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { query: ListCandidatesQuerySchema },
    responses: {
        200: {
            description: "Lista paginada",
            content: { "application/json": { schema: ListCandidatesResponseSchema } },
        },
        400: {
            description: "Paginação ou status inválidos (E6/E7)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        401: {
            description: "Token ausente, inválido ou expirado (E8)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Papel não autorizado (E9)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Edição corrente indeterminável (E2) — guarda de invariante, não configuração faltando",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

checkinRouter.openapi(
    listRoute,
    async (c) => {
        const result = await buildService(c).listCandidates(c.req.valid("query"));

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// PUT /candidates/{id}/checkin
// ============================================================

const markRoute = createRoute({
    method: "put",
    path: "/{id}/checkin",
    tags: ["Candidates"],
    summary: "Marca presença do candidato",
    description:
        "Idempotente: dois avaliadores marcando o mesmo candidato ao mesmo tempo veem sucesso os dois (E4), sem erro. Devolve o `checkedInAt` da confirmação original, não um novo.",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { params: CandidateIdParamsSchema },
    responses: {
        200: {
            description: "Presença confirmada",
            content: { "application/json": { schema: CheckinResponseSchema } },
        },
        400: {
            description: "`id` não é um UUID válido",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        401: {
            description: "Token ausente, inválido ou expirado (E8)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Papel não autorizado (E9)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        404: {
            description: "Candidato inexistente (E1)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Sem edição corrente (E2) ou candidato de outra edição (E3)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

checkinRouter.openapi(
    markRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).markPresent(id, c.get("auth").sub);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// DELETE /candidates/{id}/checkin
// ============================================================

const unmarkRoute = createRoute({
    method: "delete",
    path: "/{id}/checkin",
    tags: ["Candidates"],
    summary: "Desmarca presença do candidato",
    description: "Idempotente: desmarcar presença já ausente (E5) é no-op — `204` de qualquer forma, sem erro.",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { params: CandidateIdParamsSchema },
    responses: {
        204: { description: "Presença desmarcada (ou já estava)" },
        400: {
            description: "`id` não é um UUID válido",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        401: {
            description: "Token ausente, inválido ou expirado (E8)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Papel não autorizado (E9)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        404: {
            description: "Candidato inexistente (E1)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Sem edição corrente (E2) — guarda de invariante",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

checkinRouter.openapi(
    unmarkRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).unmarkPresent(id, c.get("auth").sub);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.body(null, 204);
    },
    validationHook,
);
