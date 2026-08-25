import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    AuthErrorCode,
    ErrorResponseSchema,
    ROLES,
    SignupDecisionSchema,
    SignupRequestDetailResponseSchema,
    SignupRequestListResponseSchema,
    SignupRequestStatusSchema,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { buildSignupRequestsService } from "./auth.routes";

export const signupRequestsRouter = new OpenAPIHono<AuthEnv>();

/** Só a decisão e a fila são exclusivas de admin — a leitura por token é pública (R2). */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const TokenParamsSchema = z.object({
    token: z.string().min(1).openapi({
        param: { name: "token", in: "path" },
        example: "a1b2c3d4e5f6...",
    }),
});

const IdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

const ListQuerySchema = z.object({
    status: SignupRequestStatusSchema.default("pending"),
});

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [AuthErrorCode.SIGNUP_REQUEST_NOT_FOUND]: 404,
    [AuthErrorCode.SIGNUP_REQUEST_EXPIRED]: 404,
    [AuthErrorCode.SIGNUP_REQUEST_ALREADY_DECIDED]: 409,
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
            { error: { code: "VALIDATION_ERROR", message: issue?.message ?? "Dados inválidos" } },
            400,
        );
    }
}

// ============================================================
// GET /auth/signup-requests — fila do admin (US3)
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Signup Requests"],
    summary: "Lista solicitações de cadastro por status",
    description:
        "Fila de aprovação do painel administrativo — funciona sozinha, sem depender do e-mail (FR-021). Default `status=pending`.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { query: ListQuerySchema },
    responses: {
        200: {
            description: "Solicitações no status pedido",
            content: { "application/json": { schema: SignupRequestListResponseSchema } },
        },
        401: {
            description: "Sem sessão",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Sessão válida, mas não é admin",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

signupRequestsRouter.openapi(listRoute, async (c) => {
    const { status } = c.req.valid("query");
    const data = await buildSignupRequestsService(c).list(status);

    return c.json({ data }, 200);
});

// ============================================================
// GET /auth/signup-requests/by-token/:token — sem auth (R2/FR-007)
// ============================================================

const getByTokenRoute = createRoute({
    method: "get",
    path: "/by-token/{token}",
    tags: ["Signup Requests"],
    summary: "Mostra uma solicitação a partir do link do email — sem decidir nada",
    description:
        "Sem middleware de autenticação, de propósito: é o destino do link do email, e abrir o link nunca pode produzir uma decisão (FR-007). A decisão em si é uma chamada separada, que exige login (research.md da 008, R2).",
    request: { params: TokenParamsSchema },
    responses: {
        200: {
            description: "Dados da solicitação",
            content: { "application/json": { schema: SignupRequestDetailResponseSchema } },
        },
        404: {
            description: "Token inexistente ou expirado — mesma resposta para os dois (não revela qual)",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

signupRequestsRouter.openapi(getByTokenRoute, async (c) => {
    const { token } = c.req.valid("param");
    const result = await buildSignupRequestsService(c).getByToken(token);

    if (result.isLeft()) {
        throwDomainError(result.value);
    }

    return c.json({ data: result.value }, 200);
});

// ============================================================
// POST /auth/signup-requests/:id/decision — admin autenticado (R2)
// ============================================================

const decisionRoute = createRoute({
    method: "post",
    path: "/{id}/decision",
    tags: ["Signup Requests"],
    summary: "Aprova ou recusa uma solicitação de cadastro",
    description:
        "Exige sessão de admin (R2) — venha do painel ou do link do email após login. Transição atômica: uma solicitação já decidida por outra chamada responde 409, nunca duas decisões conflitantes (FR-010/SC-004).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        params: IdParamsSchema,
        body: {
            required: true,
            content: { "application/json": { schema: SignupDecisionSchema } },
        },
    },
    responses: {
        204: { description: "Decisão registrada" },
        401: {
            description: "Sem sessão",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        403: {
            description: "Sessão válida, mas não é admin",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        404: {
            description: "Solicitação não existe",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
        409: {
            description: "Solicitação já decidida por outra chamada",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

signupRequestsRouter.openapi(
    decisionRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const { decision } = c.req.valid("json");
        const adminUserId = c.get("auth").sub;

        const result = await buildSignupRequestsService(c).decide(id, adminUserId, decision);

        if (result.isLeft()) {
            throwDomainError(result.value);
        }

        return c.body(null, 204);
    },
    validationHook,
);
