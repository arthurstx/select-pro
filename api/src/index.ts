import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { basicAuth } from "hono/basic-auth";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";
import type { MiddlewareHandler } from "hono/types";

import { GoogleSheetsClient } from "./lib/google-sheets";
import { logger } from "./lib/logger";
import { AuthRepository } from "./repositories/auth.repository";
import { CandidateRepository } from "./repositories/candidates.repository";
import { authRouter } from "./routes/auth.routes";
import { candidatesRouter } from "./routes/candidates.routes";
import { SheetSyncService } from "./services/sheet-sync.service";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

app.use(honoLogger());

// Fluxo público sem sessão/cookies (FEAT-0001-UI, seção 2) — reflete a origin
// da requisição em vez de credentials, não há estado de auth para proteger.
app.use("/candidate/*", cors());

/**
 * CORS de `/auth/*` — separado do de `/candidate/*`, e não por organização.
 *
 * O `cors()` acima **reflete** a origin de quem chama. Isso é correto para um
 * fluxo público sem credenciais, e é inaceitável aqui: `credentials: true` com
 * origin refletida entrega o cookie de sessão a qualquer site que peça. Este
 * middleware usa allowlist explícita, vinda da var `FRONT_ORIGIN`
 * (FEAT-0003, seção 9).
 *
 * Instanciado dentro do handler porque `cors()` precisa do valor de `c.env`,
 * que só existe por requisição — mesmo motivo do `docsAuth` mais abaixo.
 */
app.use("/auth/*", (c, next) =>
  cors({
    // Aceita lista separada por vírgula (produção + previews da Vercel). O
    // middleware devolve no `Access-Control-Allow-Origin` apenas a origin que
    // casar, nunca a lista inteira.
    origin: c.env.FRONT_ORIGIN.split(",").map((entry) => entry.trim()),
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next),
);

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
function maintenanceGuard(
  message: string,
): MiddlewareHandler<{ Bindings: CloudflareBindings }> {
  return async (c, next) => {
    // `wrangler types` infere o literal "false" a partir do valor commitado no
    // wrangler.jsonc; em runtime a var vale "true" no deploy de manutenção.
    // A anotação explícita como string é o que permite comparar os dois
    const maintenanceMode: string = c.env.MAINTENANCE_MODE;

    if (maintenanceMode !== "true") {
      return next();
    }

    logger.warn("maintenance.blocked", { path: c.req.path });
    return c.json({ error: { code: "MAINTENANCE_MODE", message } }, 503);
  };
}

app.use(
  "/candidate/*",
  maintenanceGuard(
    "As inscrições estão temporariamente indisponíveis por manutenção. Tente novamente em alguns minutos.",
  ),
);

/**
 * O mesmo bloqueio cobre `/auth/*` (FEAT-0003, seção 9).
 *
 * Uma migration que toque `users`, `sessions` ou `member_profiles` precisa da
 * mesma janela fechada que `/candidate/*` já tinha — e cadastro, login e
 * refresh escrevem nas três. A mensagem é própria porque quem está tentando
 * entrar na aplicação não está se inscrevendo em processo seletivo nenhum.
 */
app.use(
  "/auth/*",
  maintenanceGuard(
    "O acesso está temporariamente indisponível por manutenção. Tente novamente em alguns minutos.",
  ),
);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.route("/candidate", candidatesRouter);
app.route("/auth", authRouter);

// Declara o esquema Bearer para as rotas protegidas (`security: [{ Bearer: [] }]`).
app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// Documentação OpenAPI — gerada a partir dos schemas Zod das rotas
// registradas via `.openapi()` (ver api/.agents/validation/SKILL.md).
// Protegida por Basic Auth: expõe todo o schema da API (DOCS_PASSWORD via
// `wrangler secret put`, nunca em `vars`).
const docsAuth: MiddlewareHandler<{ Bindings: CloudflareBindings }> = (
  c,
  next,
) =>
  basicAuth({
    username: c.env.DOCS_USER || "admin",
    password: c.env.DOCS_PASSWORD,
  })(c, next);
app.use("/doc", docsAuth);
app.use("/docs", docsAuth);
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    title: "Select Pro API",
    version: "1.0.0",
    description:
      "API pública do fluxo de inscrição de candidatos (FEAT-0001 v3.0).",
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
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
});

/**
 * Trabalho periódico do Worker, pelo Cron Trigger que já roda de hora em hora.
 *
 * Duas tarefas independentes: sincronizar as inscrições com a planilha
 * (FEAT-0002) e limpar sessões e tokens vencidos (FEAT-0003, seção 9). Nenhuma
 * das duas está no caminho de uma requisição de usuário.
 *
 * A composição das dependências acontece aqui pelo mesmo motivo que acontece no
 * handler das rotas (`api/.agents/architecture/SKILL.md`): é o primeiro ponto
 * com acesso ao `env`.
 */
const scheduled: ExportedHandlerScheduledHandler<CloudflareBindings> = async (
  _event,
  env,
) => {
  // `wrangler types` infere o literal "false" a partir do valor commitado;
  // em runtime a var vale "true" no deploy de manutenção (ver middleware acima).
  const maintenanceMode: string = env.MAINTENANCE_MODE;

  const service = new SheetSyncService(
    new CandidateRepository(env.DB),
    new GoogleSheetsClient(env.GOOGLE_SERVICE_ACCOUNT_KEY, env.GOOGLE_SHEET_ID),
    { maintenanceMode: maintenanceMode === "true" },
  );

  // As duas rodam sempre, mesmo que a primeira falhe: são tarefas sem relação
  // entre si, e deixar a planilha fora do ar impedir a limpeza do banco faria
  // um problema virar dois.
  const failures: unknown[] = [];

  try {
    await service.run();
  } catch (err) {
    logger.error("sheet_sync.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    failures.push(err);
  }

  try {
    // A rotação de refresh token grava uma linha por renovação: uma sessão
    // ativa por 7 dias deixa centenas de linhas para trás. Sem esta limpeza,
    // `sessions` cresce sem teto contra o limite de linhas do D1 no plano Free.
    await new AuthRepository(env.DB).pruneExpired();
    logger.info("auth.prune.success", {});
  } catch (err) {
    logger.error("auth.prune.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    failures.push(err);
  }

  // Repropaga de propósito: os logs acima dão os eventos estruturados, e o
  // throw faz a Cloudflare marcar a execução do cron como falha no painel. Sem
  // ele, um erro recorrente ficaria invisível em qualquer métrica.
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Falhas no cron do Worker");
  }
};

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<CloudflareBindings>;
