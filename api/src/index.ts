import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";
import type { MiddlewareHandler } from "hono/types";

import { logger } from "./lib/logger";
import { candidatesRouter } from "./routes/candidates.routes";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

app.use(honoLogger());

// Fluxo público sem sessão/cookies (FEAT-0001-UI, seção 2) — reflete a origin
// da requisição em vez de credentials, não há estado de auth para proteger.
app.use("/candidate/*", cors());

/**
 * Modo de manutenção — fecha a janela de escrita durante migrations de banco.
 *
 * Migrations que reconstroem `candidates` (ver 0004) rodam em duas etapas
 * inevitavelmente separadas no tempo: primeiro o banco, depois o deploy do
 * Worker com os contratos novos. Sem este bloqueio, uma inscrição enviada
 * nesse intervalo seria gravada pela versão antiga do código — com os valores
 * antigos, e sem CHECK no banco para barrá-la.
 *
 * Fica depois do CORS para que o 503 chegue ao navegador como resposta da
 * API (com os headers de origin), e não como erro de CORS — assim o front
 * exibe a mensagem abaixo em vez de "Algo deu errado".
 */
app.use("/candidate/*", async (c, next) => {
    // `wrangler types` infere o literal "false" a partir do valor commitado no
    // wrangler.jsonc; em runtime a var vale "true" no deploy de manutenção.
    // A anotação explícita como string é o que permite comparar os dois.
    const maintenanceMode: string = c.env.MAINTENANCE_MODE;

    if (maintenanceMode !== "true") {
        return next();
    }

    logger.warn("maintenance.blocked", { path: c.req.path });
    return c.json(
        {
            error: {
                code: "MAINTENANCE_MODE",
                message:
                    "As inscrições estão temporariamente indisponíveis por manutenção. Tente novamente em alguns minutos.",
            },
        },
        503,
    );
});

app.get("/message", (c) => {
    return c.text("Hello Hono!");
});

app.route("/candidate", candidatesRouter);

// Documentação OpenAPI — gerada a partir dos schemas Zod das rotas
// registradas via `.openapi()` (ver api/.agents/validation/SKILL.md).
// Protegida por Basic Auth: expõe todo o schema da API (DOCS_PASSWORD via
// `wrangler secret put`, nunca em `vars`).
const docsAuth: MiddlewareHandler<{ Bindings: CloudflareBindings }> = (c, next) =>
    basicAuth({ username: c.env.DOCS_USER || "admin", password: c.env.DOCS_PASSWORD })(c, next);
app.use("/doc", docsAuth);
app.use("/docs", docsAuth);
app.doc("/doc", {
    openapi: "3.0.0",
    info: {
        title: "Select Pro API",
        version: "1.0.0",
        description: "API pública do fluxo de inscrição de candidatos (FEAT-0001 v3.0).",
    },
});
app.get("/docs", swaggerUI({ url: "/doc" }));

app.onError((err, c) => {
    if (err instanceof HTTPException) {
        logger.warn("http.exception", {
            path: c.req.path,
            status: err.status,
            message: err.message,
        });
        return err.getResponse();
    }

    logger.error("http.unhandled_error", {
        path: c.req.path,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
    });
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
});

export default app;
