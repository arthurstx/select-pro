import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CheckinErrorCode,
    ErrorResponseSchema,
    GroupErrorCode,
    GroupListResponseSchema,
    MoveResultResponseSchema,
    OrganizeResultResponseSchema,
    ROLES,
} from "shared";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { GroupRepository } from "../repositories/group.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { GroupService } from "../services/group.service";

export const groupRouter = new OpenAPIHono<AuthEnv>();

/** Organização de grupos é admin-only (spec 012, FR-014) — mesma restrição do check-in de membros. */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const CandidateParamsSchema = z.object({
    groupId: z.string().uuid().openapi({ param: { name: "groupId", in: "path" } }),
    candidateId: z.string().uuid().openapi({ param: { name: "candidateId", in: "path" } }),
});

const EvaluatorParamsSchema = z.object({
    groupId: z.string().uuid().openapi({ param: { name: "groupId", in: "path" } }),
    userId: z.string().uuid().openapi({ param: { name: "userId", in: "path" } }),
});

function buildService(c: Context<AuthEnv>): GroupService {
    return new GroupService(new GroupRepository(c.env.DB), new SelectionProcessRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409,
    [GroupErrorCode.NO_CANDIDATES_PRESENT]: 409,
    [GroupErrorCode.NO_ROOMS_AVAILABLE]: 409,
    [GroupErrorCode.GROUP_MODALITY_MISMATCH]: 409,
    [GroupErrorCode.GROUP_NOT_FOUND]: 404,
    [GroupErrorCode.CANDIDATE_NOT_ALLOCATED]: 404,
    [GroupErrorCode.EVALUATOR_NOT_ALLOCATED]: 404,
};

interface DomainError {
    code: string;
    message: string;
}

function throwDomainError(error: DomainError): never {
    throw httpError(STATUS_BY_ERROR_CODE[error.code] ?? 500, error.code, error.message);
}

// ============================================================
// POST /groups/organize
// ============================================================

const organizeRoute = createRoute({
    method: "post",
    path: "/organize",
    tags: ["Groups"],
    summary: "Organiza automaticamente os grupos da edição corrente (D1/D5)",
    description:
        "Descarta qualquer organização anterior da edição corrente e forma uma nova a partir do check-in mais atual (FR-011).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Organização resultante",
            content: { "application/json": { schema: OrganizeResultResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, sem candidato presente, ou candidato presencial presente sem sala cadastrada",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(organizeRoute, async (c) => {
    const result = await buildService(c).organize();
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// GET /groups
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Groups"],
    summary: "Lista a organização atual da edição corrente (FR-008)",
    description: "Não recalcula — lê o resultado do último `POST /groups/organize`. `groups: []` quando ainda não organizado.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Organização atual",
            content: { "application/json": { schema: GroupListResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

groupRouter.openapi(listRoute, async (c) => {
    const result = await buildService(c).list();
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: { groups: result.value } }, 200);
});

// ============================================================
// PATCH /groups/{groupId}/candidates/{candidateId}
// ============================================================

const moveCandidateRoute = createRoute({
    method: "patch",
    path: "/{groupId}/candidates/{candidateId}",
    tags: ["Groups"],
    summary: "Move um candidato para outro grupo (FR-009)",
    description: "Bloqueia mover entre modalidades (FR-003). Avisa, sem bloquear, quando o resultado viola D1 (FR-010).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: CandidateParamsSchema },
    responses: {
        200: {
            description: "Grupos de origem e destino atualizados",
            content: { "application/json": { schema: MoveResultResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "Grupo de destino não existe, ou candidato não está alocado a nenhum grupo da edição",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Sem processo corrente, ou movimento entre grupo presencial e online",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(moveCandidateRoute, async (c) => {
    const { groupId, candidateId } = c.req.valid("param");
    const result = await buildService(c).moveCandidate(candidateId, groupId);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// PATCH /groups/{groupId}/evaluators/{userId}
// ============================================================

const moveEvaluatorRoute = createRoute({
    method: "patch",
    path: "/{groupId}/evaluators/{userId}",
    tags: ["Groups"],
    summary: "Move um avaliador/host para outro grupo (FR-009)",
    description: "Mesma restrição de modalidade da rota de candidato. `warning` é sempre `null` — D1 é sobre candidatos.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: EvaluatorParamsSchema },
    responses: {
        200: {
            description: "Grupos de origem e destino atualizados",
            content: { "application/json": { schema: MoveResultResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "Grupo de destino não existe, ou avaliador/host não está alocado a nenhum grupo da edição",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Sem processo corrente, ou movimento entre grupo presencial e online",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(moveEvaluatorRoute, async (c) => {
    const { groupId, userId } = c.req.valid("param");
    const result = await buildService(c).moveEvaluator(userId, groupId);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});
