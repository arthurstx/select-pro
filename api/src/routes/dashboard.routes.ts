import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CandidateDetailResponseSchema,
    CheckinErrorCode,
    DashboardCandidatesQuerySchema,
    DashboardCandidatesResponseSchema,
    DashboardMetricsQuerySchema,
    DashboardMetricsResponseSchema,
    ErrorResponseSchema,
    ROLES,
    SelectionProcessListResponseSchema,
} from "shared";
import type { ZodError } from "zod";

import { DashboardCache } from "../lib/dashboard-cache";
import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { DashboardRepository } from "../repositories/dashboard.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { DashboardService } from "../services/dashboard.service";

export const dashboardRouter = new OpenAPIHono<AuthEnv>();

// Path param de rota, não entidade — pode ficar local (api/.agents/validation/SKILL.md).
const CandidateIdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

/**
 * Os dois papéis entram nas quatro rotas — mas o CORPO da resposta difere:
 * `admin` recebe gênero e etnia, `avaliador` não. É a primeira feature em que
 * o papel muda a resposta, e não só o acesso; a decisão fica em
 * `DashboardService`, nunca no front.
 */
const AUTHORIZED = [requireAuth, requireRole(ROLES.ADMIN, ROLES.AVALIADOR)];

function buildService(c: Context<AuthEnv>): DashboardService {
    return new DashboardService(
        new DashboardRepository(c.env.DB),
        new SelectionProcessRepository(c.env.DB),
        new DashboardCache(c.env.CANDIDATES_KV),
    );
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [CheckinErrorCode.CANDIDATE_NOT_FOUND]: 404, // E1
    [CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS]: 409, // E2
    [CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND]: 404, // E3
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

const UNAUTHORIZED_RESPONSES = {
    401: {
        description: "Token ausente, inválido ou expirado (E6)",
        content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
        description: "Papel não autorizado (E7)",
        content: { "application/json": { schema: ErrorResponseSchema } },
    },
} as const;

// ============================================================
// GET /dashboard/metrics
// ============================================================

const metricsRoute = createRoute({
    method: "get",
    path: "/metrics",
    tags: ["Dashboard"],
    summary: "Métricas agregadas das inscrições",
    description:
        "`process_id` ausente = edição corrente; um uuid = aquela edição; `all` = todas. Com `mode=by_edition` (só faz sentido em `all`) cada distribuição vem quebrada por edição. **`byGender` e `byEthnicity` só existem no corpo quando o papel é `admin`** — vêm ausentes, não vazios.",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { query: DashboardMetricsQuerySchema },
    responses: {
        200: {
            description: "Agregados do recorte",
            content: { "application/json": { schema: DashboardMetricsResponseSchema } },
        },
        400: {
            description: "`process_id` ou `mode` inválidos",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        ...UNAUTHORIZED_RESPONSES,
        404: {
            description: "`process_id` não corresponde a nenhuma edição (E3)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Edição corrente indeterminável (E2) — guarda de invariante",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

dashboardRouter.openapi(
    metricsRoute,
    async (c) => {
        const result = await buildService(c).metrics(c.req.valid("query"), c.get("auth").role);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// GET /dashboard/candidates
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/candidates",
    tags: ["Dashboard"],
    summary: "Lista de inscritos, filtrável por nome e intervalo de data",
    description:
        "Ordena da inscrição mais recente para a mais antiga — o inverso do check-in. Um intervalo de data sem interseção com a edição escolhida devolve `200` com lista vazia (E8), não erro: os dois recortes temporais se sobrepõem de propósito.",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { query: DashboardCandidatesQuerySchema },
    responses: {
        200: {
            description: "Lista paginada",
            content: { "application/json": { schema: DashboardCandidatesResponseSchema } },
        },
        400: {
            description: "Intervalo invertido (E4) ou paginação inválida (E5)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        ...UNAUTHORIZED_RESPONSES,
        404: {
            description: "`process_id` não corresponde a nenhuma edição (E3)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Edição corrente indeterminável (E2)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

dashboardRouter.openapi(
    listRoute,
    async (c) => {
        const result = await buildService(c).listCandidates(c.req.valid("query"), c.get("auth").role);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// GET /dashboard/candidates/{id}
// ============================================================

const detailRoute = createRoute({
    method: "get",
    path: "/candidates/{id}",
    tags: ["Dashboard"],
    summary: "Inscrição completa de um candidato",
    description:
        "Não é filtrado por edição: o id identifica uma inscrição, e a edição dela vem no corpo. Os textos do questionário saem na íntegra. **`demographics` só existe quando o papel é `admin`.**",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    request: { params: CandidateIdParamsSchema },
    responses: {
        200: {
            description: "Inscrição completa",
            content: { "application/json": { schema: CandidateDetailResponseSchema } },
        },
        400: {
            description: "`id` não é um UUID válido",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        ...UNAUTHORIZED_RESPONSES,
        404: {
            description: "Candidato inexistente (E1)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

dashboardRouter.openapi(
    detailRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).detail(id, c.get("auth").role);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// GET /dashboard/editions
// ============================================================

const editionsRoute = createRoute({
    method: "get",
    path: "/editions",
    tags: ["Dashboard"],
    summary: "Catálogo de edições, para o seletor de recorte",
    description:
        "Existe porque as demais rotas apenas CONSOMEM `process_id`; sem esta, o front saberia qual é a edição corrente mas não teria o uuid da anterior. A corrente é resolvida sob demanda, então sempre aparece na lista.",
    middleware: AUTHORIZED,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Edições da mais recente para a mais antiga",
            content: { "application/json": { schema: SelectionProcessListResponseSchema } },
        },
        ...UNAUTHORIZED_RESPONSES,
        409: {
            description: "Edição corrente indeterminável (E2)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

dashboardRouter.openapi(editionsRoute, async (c) => {
    const result = await buildService(c).editions();

    if (result.isLeft()) {
        throwDomainError(result.value);
    }

    return c.json({ data: result.value }, 200);
});
