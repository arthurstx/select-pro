import { createMiddleware } from "hono/factory";
import type { Role } from "shared";

import { InsufficientRoleError } from "../core/errors/auth-errors";
import { httpError } from "../lib/http-error";
import type { AuthEnv } from "./require-auth";

/**
 * Exige que `c.get("auth").role` esteja entre os papéis informados. Roda
 * DEPOIS de `requireAuth` (que só valida o token e deliberadamente não olha
 * `role` — FEAT-0003) e é o primeiro middleware de autorização do projeto
 * (FEAT-0005, seção 9).
 *
 * Hoje só existem `admin` e `avaliador`, e `requireRole(ADMIN, AVALIADOR)`
 * não barra ninguém — ele existe para que a próxima rota exclusiva de admin
 * não precise inventar o middleware sob pressão.
 */
export function requireRole(...roles: Role[]) {
    return createMiddleware<AuthEnv>(async (c, next) => {
        const { role } = c.get("auth");

        if (!roles.includes(role as Role)) {
            const error = new InsufficientRoleError();
            throw httpError(403, error.code, error.message);
        }

        await next();
    });
}
