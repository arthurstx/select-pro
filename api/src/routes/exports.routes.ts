import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { CheckinErrorCode, ErrorResponseSchema, ExportCandidatesQuerySchema, ROLES } from "shared";
import type { ZodError } from "zod";

import { SelectionProcessNotFoundError } from "../core/errors/checkin-errors";
import { httpError } from "../lib/http-error";
import { type AuthEnv, requireAuth } from "../middlewares/require-auth";
import { requireRole } from "../middlewares/require-role";
import { SelectionProcessRepository } from "../repositories/selection-process.repository";
import { ExportsRepository } from "../repositories/exports.repository";
import { ExportsService } from "../services/exports.service";

export const exportsRouter = new OpenAPIHono<AuthEnv>();

/** Inteiramente admin-only — dado sensível de candidatos, agregado num único arquivo. */
const ADMIN_ONLY = [requireAuth, requireRole(ROLES.ADMIN)];

function buildService(c: Context<AuthEnv>): ExportsService {
    return new ExportsService(new ExportsRepository(c.env.DB), new SelectionProcessRepository(c.env.DB));
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

/** Nome de arquivo seguro: sem acento/espaço, só `[a-z0-9-]`. */
function slugifyForFilename(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function timestampForFilename(now: Date): string {
    return now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

const exportCandidatesRoute = createRoute({
    method: "get",
    path: "/candidates",
    tags: ["Exports"],
    summary: "Exporta candidatos em CSV",
    description:
        "Gera um CSV com os candidatos do recorte pedido (uma edição ou todas). Gênero e etnia só " +
        "entram quando `include_sensitive=true` é pedido explicitamente. Toda chamada bem-sucedida " +
        "grava um registro de auditoria (quem exportou, quando, recorte, se incluiu campo sensível).",
    middleware: ADMIN_ONLY,
    security: [{ Bearer: [] }],
    request: { query: ExportCandidatesQuerySchema },
    responses: {
        200: { description: "CSV gerado", content: { "text/csv": { schema: { type: "string" } } } },
        400: { description: "Query inválida", content: { "application/json": { schema: ErrorResponseSchema } } },
        401: { description: "Sem sessão", content: { "application/json": { schema: ErrorResponseSchema } } },
        403: { description: "Não é admin", content: { "application/json": { schema: ErrorResponseSchema } } },
        404: {
            description: "Edição do processo seletivo não encontrada",
            content: { "application/json": { schema: ErrorResponseSchema } },
        },
    },
});

exportsRouter.openapi(
    exportCandidatesRoute,
    async (c) => {
        const query = c.req.valid("query");
        const { role: _role, sub: actorId } = c.get("auth");

        const result = await buildService(c).export(query, actorId);
        if (result.isLeft()) {
            const error = result.value;
            if (error instanceof SelectionProcessNotFoundError) {
                throw httpError(404, CheckinErrorCode.SELECTION_PROCESS_NOT_FOUND, error.message);
            }
            // `NoActiveSelectionProcessError` é guarda de invariante (mesma nota de checkin-errors.ts) — não deveria ser alcançável.
            throw httpError(500, "INTERNAL_ERROR", error.message);
        }

        const { csv, scopeLabel } = result.value;
        const filename = `candidatos-${slugifyForFilename(scopeLabel)}-${timestampForFilename(new Date())}.csv`;

        return c.body(csv, 200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        });
    },
    validationHook,
);
