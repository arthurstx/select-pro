import { createMiddleware } from "hono/factory";

import { AccessTokenExpiredError, InvalidAccessTokenError } from "../core/errors/auth-errors";
import { type AccessTokenClaims, verifyAccessToken } from "../lib/access-token";
import { httpError } from "../lib/http-error";

export type AuthVariables = {
    auth: AccessTokenClaims;
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables;
};

/**
 * Exige access token válido em `Authorization: Bearer <token>` (não cookie,
 * não query string). Não checa `role` — isso fica para quem precisar dele.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header("Authorization");

    if (!header?.startsWith("Bearer ")) {
        const error = new InvalidAccessTokenError("Autenticação necessária.");
        throw httpError(401, error.code, error.message);
    }

    const result = await verifyAccessToken(header.slice("Bearer ".length).trim(), c.env.JWT_SECRET);

    if (!result.ok) {
        // `TOKEN_EXPIRED` → front renova e repete; `INVALID_TOKEN` → vai para o login.
        const error =
            result.reason === "expired"
                ? new AccessTokenExpiredError()
                : new InvalidAccessTokenError();

        throw httpError(401, error.code, error.message);
    }

    c.set("auth", result.claims);
    await next();
});
