import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Constrói uma HTTPException cuja resposta segue `ErrorResponseSchema` (shared). */
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
