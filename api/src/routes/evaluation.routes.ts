import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    AdminCandidateDetailResponseSchema,
    AdminCandidatesListResponseSchema,
    CheckinErrorCode,
    ErrorResponseSchema,
    EvaluationErrorCode,
    MyGroupResponseSchema,
    ROLES,
    SubmitEvaluationResponseSchema,
    SubmitEvaluationSchema,
} from "shared";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { CandidateRepository } from "../repositories/candidates.repository";
import { EvaluationRepository } from "../repositories/evaluation.repository";
import { GroupRepository } from "../repositories/group.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { EvaluationService } from "../services/evaluation.service";

export const evaluationRouter = new OpenAPIHono<AuthEnv>();

/** Avaliar é restrito a quem tem `role_id = 'avaliador'` — host também cai aqui, FEAT-0012 não distingue os dois para isso. */
const EVALUATOR_ONLY = [requireAuth, requireRole(ROLES.AVALIADOR)];
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const CandidateParamsSchema = z.object({
    candidateId: z.string().uuid().openapi({ param: { name: "candidateId", in: "path" } }),
});

function buildService(c: Context<AuthEnv>): EvaluationService {
    return new EvaluationService(
        new EvaluationRepository(c.env.DB),
        new GroupRepository(c.env.DB),
        new CandidateRepository(c.env.DB),
        new SelectionProcessRepository(c.env.DB),
    );
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409,
    [CheckinErrorCode.CANDIDATE_NOT_FOUND]: 404,
    [EvaluationErrorCode.NOT_IN_ANY_GROUP]: 409,
    [EvaluationErrorCode.CANDIDATE_NOT_IN_EVALUATOR_GROUP]: 409,
};

interface DomainError {
    code: string;
    message: string;
}

function throwDomainError(error: DomainError): never {
    throw httpError(STATUS_BY_ERROR_CODE[error.code] ?? 500, error.code, error.message);
}

// ============================================================
// GET /evaluations/my-group
// ============================================================

const myGroupRoute = createRoute({
    method: "get",
    path: "/my-group",
    tags: ["Evaluations"],
    summary: "Lista os candidatos do grupo presencial do avaliador/host logado (FR-001)",
    description: "myEvaluation nunca revela avaliação de outra pessoa sobre o mesmo candidato (FR-005) — só evaluationCount soma o total.",
    middleware: EVALUATOR_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: { description: "Candidatos do grupo", content: { "application/json": { schema: MyGroupResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é avaliador/host", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, ou avaliador não alocado a nenhum grupo",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

evaluationRouter.openapi(myGroupRoute, async (c) => {
    const result = await buildService(c).myGroup(c.get("auth").sub);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// PUT /evaluations/candidates/{candidateId}
// ============================================================

const submitRoute = createRoute({
    method: "put",
    path: "/candidates/{candidateId}",
    tags: ["Evaluations"],
    summary: "Cria ou atualiza a avaliação do avaliador logado sobre um candidato do seu grupo (FR-002/FR-004)",
    description: "Reenviar substitui a avaliação existente — nunca cria uma segunda (UNIQUE user_id+candidate_id).",
    middleware: EVALUATOR_ONLY,
    security: [{ Bearer: [] }],
    request: { params: CandidateParamsSchema, body: { content: { "application/json": { schema: SubmitEvaluationSchema } } } },
    responses: {
        200: { description: "Avaliação salva", content: { "application/json": { schema: SubmitEvaluationResponseSchema } } },
        400: { description: "Notas fora de 0-5, ou faltando algum critério", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é avaliador/host", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Candidato não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, avaliador sem grupo, ou candidato de outro grupo (FR-003)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

evaluationRouter.openapi(submitRoute, async (c) => {
    const { candidateId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await buildService(c).submit(c.get("auth").sub, candidateId, body);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// GET /evaluations/admin/candidates
// ============================================================

const adminListRoute = createRoute({
    method: "get",
    path: "/admin/candidates",
    tags: ["Evaluations"],
    summary: "Lista candidatos presentes com contagem de avaliações e veredito (FR-007/FR-012)",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: { description: "Candidatos com veredito", content: { "application/json": { schema: AdminCandidatesListResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

evaluationRouter.openapi(adminListRoute, async (c) => {
    const result = await buildService(c).adminList();
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: { candidates: result.value } }, 200);
});

// ============================================================
// GET /evaluations/admin/candidates/{candidateId}
// ============================================================

const adminDetailRoute = createRoute({
    method: "get",
    path: "/admin/candidates/{candidateId}",
    tags: ["Evaluations"],
    summary: "Detalhe de todas as avaliações de um candidato (FR-008)",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: CandidateParamsSchema },
    responses: {
        200: { description: "Detalhe das avaliações", content: { "application/json": { schema: AdminCandidateDetailResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Candidato não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

evaluationRouter.openapi(adminDetailRoute, async (c) => {
    const { candidateId } = c.req.valid("param");
    const result = await buildService(c).adminDetail(candidateId);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});
