import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Constrói uma HTTPException cuja resposta segue o envelope de erro do
 * projeto (`ErrorResponseSchema`, shared/src/schemas/error.schema.ts) —
 * `HTTPException` sozinha só devolveria texto puro.
 */
export function httpError(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    field?: string,
): HTTPException {
    return new HTTPException(status, {
        message,
        res: Response.json({ error: { code, message, field } }, { status }),
    });
}
