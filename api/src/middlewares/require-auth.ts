import { createMiddleware } from "hono/factory";

import { AccessTokenExpiredError, InvalidAccessTokenError } from "../core/errors/auth-errors";
import { type AccessTokenClaims, verifyAccessToken } from "../lib/access-token";
import { httpError } from "../lib/http-error";

/**
 * Variáveis que o middleware publica no contexto para os handlers protegidos.
 *
 * Exportado porque toda rota atrás de `requireAuth` precisa deste generic para
 * que `c.get("auth")` tenha tipo.
 */
export type AuthVariables = {
    auth: AccessTokenClaims;
};

export type AuthEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables;
};

/**
 * Exige um access token válido em `Authorization: Bearer <token>` (FEAT-0003,
 * seção 4.5).
 *
 * O access token é aceito **apenas** por este header. Ele não vem por cookie e
 * não vem por query string: o cookie é do refresh token, e um token em query
 * string acaba em log de servidor, histórico de navegador e `Referer`.
 *
 * Esta spec entrega o papel no claim `role` e para por aí — quem decide o que
 * cada papel pode fazer é a primeira spec de negócio que precisar disso
 * (FEAT-0003, seção 7). Não há checagem de papel aqui de propósito.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header("Authorization");

    if (!header?.startsWith("Bearer ")) {
        const error = new InvalidAccessTokenError("Autenticação necessária.");
        throw httpError(401, error.code, error.message);
    }

    const result = await verifyAccessToken(header.slice("Bearer ".length).trim(), c.env.JWT_SECRET);

    if (!result.ok) {
        // Os dois códigos precisam ser distintos: `TOKEN_EXPIRED` diz ao front
        // "renove e repita a requisição", `INVALID_TOKEN` diz "a sessão acabou,
        // vá para o login". Um 401 genérico faria o front tratar a expiração de
        // rotina (a cada 15 min) como fim de sessão.
        const error =
            result.reason === "expired"
                ? new AccessTokenExpiredError()
                : new InvalidAccessTokenError();

        throw httpError(401, error.code, error.message);
    }

    c.set("auth", result.claims);
    await next();
});
