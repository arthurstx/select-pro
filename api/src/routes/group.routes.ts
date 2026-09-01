import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import {
    CheckinErrorCode,
    ErrorResponseSchema,
    GroupErrorCode,
    GroupListResponseSchema,
    GroupResponseSchema,
    MoveResultResponseSchema,
    OrganizePresencialBodySchema,
    OrganizeResultResponseSchema,
    PreviewOnlineResponseSchema,
    PreviewPresencialResponseSchema,
    ROLES,
} from "shared";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { GroupRepository } from "../repositories/group.repository";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { GroupService } from "../services/group.service";

export const groupRouter = new OpenAPIHono<AuthEnv>();

/** Organização/ajuste manual de grupos é admin-only (spec 012, FR-014) — mesma restrição do check-in de membros. */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

/** FEAT-0018 — self-service de grupo online é do próprio avaliador, nunca admin-only. */
const AVALIADOR_ONLY = [requireAuth, requireRole(ROLES.AVALIADOR)];

const GroupIdParamsSchema = z.object({
    groupId: z.string().uuid().openapi({ param: { name: "groupId", in: "path" } }),
});

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
// POST /groups/organize/presencial
// ============================================================

const organizePresencialRoute = createRoute({
    method: "post",
    path: "/organize/presencial",
    tags: ["Groups"],
    summary: "Organiza automaticamente os grupos PRESENCIAIS da edição corrente (D1/D5)",
    description:
        "Descarta só a organização presencial anterior (FEAT-0018 — independente da online) e forma uma nova a partir do check-in mais atual. " +
        "Body opcional: `evaluatorUserIds` restringe quais avaliadores presentes entram no cálculo (FEAT-0021) — ausente = todos.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        body: { required: true, content: { "application/json": { schema: OrganizePresencialBodySchema } } },
    },
    responses: {
        200: {
            description: "Organização presencial resultante",
            content: { "application/json": { schema: OrganizeResultResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, sem candidato presencial presente, ou nenhuma sala cadastrada",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(
    organizePresencialRoute,
    async (c) => {
        const { evaluatorUserIds } = c.req.valid("json");
        const result = await buildService(c).organizePresencial(evaluatorUserIds);
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// POST /groups/preview/presencial (FEAT-0021)
// ============================================================

const previewPresencialRoute = createRoute({
    method: "post",
    path: "/preview/presencial",
    tags: ["Groups"],
    summary: "Prévia da organização PRESENCIAL — não persiste nada",
    description:
        "Mesmo cálculo de `POST /organize/presencial`, sem gravar no banco. Mesmo body (`evaluatorUserIds` opcional). " +
        "`data.availableEvaluators` lista todos os avaliadores/hosts presentes, pro front montar o seletor.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        body: { required: true, content: { "application/json": { schema: OrganizePresencialBodySchema } } },
    },
    responses: {
        200: {
            description: "Prévia da organização presencial",
            content: { "application/json": { schema: PreviewPresencialResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, sem candidato presencial presente, ou nenhuma sala cadastrada",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(
    previewPresencialRoute,
    async (c) => {
        const { evaluatorUserIds } = c.req.valid("json");
        const result = await buildService(c).previewPresencial(evaluatorUserIds);
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// DELETE /groups/presencial (FEAT-0021 — "Limpar organização")
// ============================================================

const clearPresencialRoute = createRoute({
    method: "delete",
    path: "/presencial",
    tags: ["Groups"],
    summary: "Remove toda a organização PRESENCIAL da edição corrente",
    description: "Candidatos, avaliadores e hosts perdem toda associação. Nunca afeta grupos online (FEAT-0018).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        204: { description: "Organização presencial removida (idempotente)" },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

groupRouter.openapi(clearPresencialRoute, async (c) => {
    const result = await buildService(c).clearPresencialOrganization();
    if (result.isLeft()) throwDomainError(result.value);

    return c.body(null, 204);
});

// ============================================================
// DELETE /groups/online (FEAT-0022 — "Limpar organização" no online)
// ============================================================

const clearOnlineRoute = createRoute({
    method: "delete",
    path: "/online",
    tags: ["Groups"],
    summary: "Remove toda a organização ONLINE da edição corrente",
    description: "Candidatos e avaliadores atribuídos (manualmente ou por self-service) perdem toda associação. Nunca afeta grupos presenciais.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        204: { description: "Organização online removida (idempotente)" },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

groupRouter.openapi(clearOnlineRoute, async (c) => {
    const result = await buildService(c).clearOnlineOrganization();
    if (result.isLeft()) throwDomainError(result.value);

    return c.body(null, 204);
});

// ============================================================
// POST /groups/organize/online
// ============================================================

const organizeOnlineRoute = createRoute({
    method: "post",
    path: "/organize/online",
    tags: ["Groups"],
    summary: "Organiza automaticamente os grupos ONLINE da edição corrente (D1)",
    description:
        "Só separa candidatos online em grupos — sem sala, sem avaliador/host (FEAT-0018). Descarta só a organização online anterior, nunca a presencial.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Organização online resultante (unallocatedCandidateCount sempre 0)",
            content: { "application/json": { schema: OrganizeResultResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, ou sem candidato online presente",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(organizeOnlineRoute, async (c) => {
    const result = await buildService(c).organizeOnline();
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// POST /groups/preview/online (FEAT-0022)
// ============================================================

const previewOnlineRoute = createRoute({
    method: "post",
    path: "/preview/online",
    tags: ["Groups"],
    summary: "Prévia da organização ONLINE — não persiste nada",
    description:
        "Mesmo cálculo de `POST /organize/online`, sem gravar no banco. Sem body (o online não tem seleção de participante como o presencial). " +
        "`data.groups[].evaluators` sempre `[]` — avaliador nunca entra no cálculo automático do online.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Prévia da organização online",
            content: { "application/json": { schema: PreviewOnlineResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, ou sem candidato online presente",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(previewOnlineRoute, async (c) => {
    const result = await buildService(c).previewOnline();
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
    description: "Não recalcula — lê o resultado das últimas organizações presencial/online. `groups: []` quando ainda não organizado.",
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
    summary: "Move um avaliador/host JÁ ALOCADO para outro grupo (FR-009)",
    description:
        "Mesma restrição de modalidade da rota de candidato. `warning` é sempre `null` — D1 é sobre candidatos. " +
        "Para a primeira alocação a um grupo online, ver `PUT /groups/online/{groupId}/evaluators/{userId}` (FEAT-0018).",
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

// ============================================================
// POST /groups/online/{groupId}/join (self-service, avaliador)
// ============================================================

const joinOnlineGroupRoute = createRoute({
    method: "post",
    path: "/online/{groupId}/join",
    tags: ["Groups"],
    summary: "Avaliador se junta a um grupo online por conta própria (FEAT-0018, US2)",
    description: "Se já estiver em outro grupo (presencial ou online), é movido — nunca duplica (FR-004).",
    middleware: AVALIADOR_ONLY,
    security: [{ Bearer: [] }],
    request: { params: GroupIdParamsSchema },
    responses: {
        200: {
            description: "Grupo de destino já atualizado",
            content: { "application/json": { schema: GroupResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é avaliador", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Grupo não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, ou o grupo de destino não é online",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(joinOnlineGroupRoute, async (c) => {
    const { groupId } = c.req.valid("param");
    const result = await buildService(c).assignEvaluatorToOnlineGroup(c.get("auth").sub, groupId);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// PUT /groups/online/{groupId}/evaluators/{userId} (admin, atribuição manual — US3)
// ============================================================

const assignEvaluatorRoute = createRoute({
    method: "put",
    path: "/online/{groupId}/evaluators/{userId}",
    tags: ["Groups"],
    summary: "Gestão atribui manualmente um avaliador a um grupo online (FEAT-0018, US3)",
    description: "Mesmo mecanismo do self-service (`join`), mas o admin escolhe o avaliador.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: EvaluatorParamsSchema },
    responses: {
        200: {
            description: "Grupo de destino já atualizado",
            content: { "application/json": { schema: GroupResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Grupo não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sem processo corrente, ou o grupo de destino não é online",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

groupRouter.openapi(assignEvaluatorRoute, async (c) => {
    const { groupId, userId } = c.req.valid("param");
    const result = await buildService(c).assignEvaluatorToOnlineGroup(userId, groupId);
    if (result.isLeft()) throwDomainError(result.value);

    return c.json({ data: result.value }, 200);
});

// ============================================================
// DELETE /groups/online/me (self-service, avaliador)
// ============================================================

const leaveOnlineGroupRoute = createRoute({
    method: "delete",
    path: "/online/me",
    tags: ["Groups"],
    summary: "Avaliador sai do grupo online em que estiver (FEAT-0018, US2)",
    middleware: AVALIADOR_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        204: { description: "Saiu com sucesso" },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é avaliador", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "Não estava em nenhum grupo online",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: { description: "Sem processo corrente", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

groupRouter.openapi(leaveOnlineGroupRoute, async (c) => {
    const result = await buildService(c).leaveOnlineGroup(c.get("auth").sub);
    if (result.isLeft()) throwDomainError(result.value);

    return c.body(null, 204);
});
