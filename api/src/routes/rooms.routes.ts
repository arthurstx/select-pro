import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CreateRoomSchema,
    ErrorResponseSchema,
    ROLES,
    RoomErrorCode,
    RoomListResponseSchema,
    RoomResponseSchema,
    UpdateRoomSchema,
} from "shared";
import type { ZodError } from "zod";

import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { RoomsRepository } from "../repositories/rooms.repository";
import { RoomsService } from "../services/rooms.service";

export const roomsRouter = new OpenAPIHono<AuthEnv>();

/** Todo o domínio de salas é admin-only, inclusive leitura (FR-010, ver spec.md). */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

const IdParamsSchema = z.object({
    id: z.string().uuid().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

function buildService(c: Context<AuthEnv>): RoomsService {
    return new RoomsService(new RoomsRepository(c.env.DB));
}

const STATUS_BY_ERROR_CODE: Record<string, ContentfulStatusCode> = {
    [RoomErrorCode.ROOM_NOT_FOUND]: 404,
    [RoomErrorCode.ROOM_NAME_ALREADY_EXISTS]: 409,
    [RoomErrorCode.ROOM_HAS_GROUPS]: 409,
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
// GET /rooms
// ============================================================

const listRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Rooms"],
    summary: "Lista as salas cadastradas",
    description: "Hosts e limite de grupos vêm calculados a partir da classificação da sala — nunca colunas próprias.",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    responses: {
        200: {
            description: "Salas cadastradas",
            content: { "application/json": { schema: RoomListResponseSchema } },
        },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
});

roomsRouter.openapi(listRoute, async (c) => {
    const data = await buildService(c).list();
    return c.json({ data }, 200);
});

// ============================================================
// POST /rooms
// ============================================================

const createRoute_ = createRoute({
    method: "post",
    path: "/",
    tags: ["Rooms"],
    summary: "Cadastra uma sala",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        body: { required: true, content: { "application/json": { schema: CreateRoomSchema } } },
    },
    responses: {
        201: {
            description: "Sala criada",
            content: { "application/json": { schema: RoomResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Já existe sala com este nome",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

roomsRouter.openapi(
    createRoute_,
    async (c) => {
        const result = await buildService(c).create(c.req.valid("json"));
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 201);
    },
    validationHook,
);

// ============================================================
// PUT /rooms/:id
// ============================================================

const updateRoute = createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Rooms"],
    summary: "Atualiza nome e/ou classificação de uma sala",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: {
        params: IdParamsSchema,
        body: { required: true, content: { "application/json": { schema: UpdateRoomSchema } } },
    },
    responses: {
        200: {
            description: "Sala atualizada",
            content: { "application/json": { schema: RoomResponseSchema } },
        },
        400: { description: "Payload inválido", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Sala não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Já existe outra sala com este nome",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

roomsRouter.openapi(
    updateRoute,
    async (c) => {
        const { id } = c.req.valid("param");
        const result = await buildService(c).update(id, c.req.valid("json"));
        if (result.isLeft()) throwDomainError(result.value);

        return c.json({ data: result.value }, 200);
    },
    validationHook,
);

// ============================================================
// DELETE /rooms/:id
// ============================================================

const deleteRoute = createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Rooms"],
    summary: "Exclui uma sala sem grupos vinculados",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { params: IdParamsSchema },
    responses: {
        204: { description: "Sala excluída" },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: { description: "Sala não existe", content: { "application/json": { schema: ErrorResponseSchema } } },
        409: {
            description: "Sala tem grupos vinculados",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

roomsRouter.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const result = await buildService(c).delete(id);
    if (result.isLeft()) throwDomainError(result.value);

    return c.body(null, 204);
});
