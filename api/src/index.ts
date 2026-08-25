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
import { checkinRouter } from "./routes/checkin.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { roomsRouter } from "./routes/rooms.routes";
import { SheetSyncService } from "./services/sheet-sync.service";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

app.use(honoLogger());

// Fluxo público sem sessão/cookies — reflete a origin, sem credentials.
app.use("/candidate/*", cors());

/**
 * `/auth/*` usa allowlist (`FRONT_ORIGIN`) em vez de refletir a origin:
 * `credentials: true` com origin refletida entregaria o cookie de sessão a
 * qualquer site (FEAT-0003, seção 9). Instanciado dentro do handler porque
 * `cors()` precisa de `c.env`, que só existe por requisição.
 */
app.use("/auth/*", (c, next) =>
  cors({
    origin: c.env.FRONT_ORIGIN.split(",").map((entry) => entry.trim()),
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next),
);

/**
 * `/candidates/*` (plural, autenticado) é distinto de `/candidate/*`
 * (singular, público): devolve email/telefone de candidatos, então não pode
 * herdar o `cors()` que reflete qualquer origin. `allowMethods` precisa de
 * PUT/DELETE — as duas rotas de escrita do check-in (FEAT-0005, seção 9).
 */
app.use("/candidates/*", (c, next) =>
  cors({
    origin: c.env.FRONT_ORIGIN.split(",").map((entry) => entry.trim()),
    credentials: true,
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next),
);

/**
 * `/dashboard/*` devolve email, telefone e — para `admin` — gênero e etnia
 * dos candidatos. Mesma allowlist de `/candidates/*`, e nunca o `cors()` que
 * reflete qualquer origin. Só GET: a feature é inteiramente somente leitura.
 *
 * Prefixo novo não herda middleware nenhum — este bloco existe pelo mesmo
 * motivo que a FEAT-0002 E7: lá o cron escapou do guard justamente assim.
 */
app.use("/dashboard/*", (c, next) =>
  cors({
    origin: c.env.FRONT_ORIGIN.split(",").map((entry) => entry.trim()),
    credentials: true,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next),
);

/**
 * `/rooms/*` (FEAT-0011) — inteiramente admin-only, inclusive leitura.
 * `allowMethods` precisa de PUT/DELETE (editar e excluir sala).
 */
app.use("/rooms/*", (c, next) =>
  cors({
    origin: c.env.FRONT_ORIGIN.split(",").map((entry) => entry.trim()),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next),
);

/**
 * Modo de manutenção — fecha a janela de escrita durante migrations de
 * banco. Fica depois do CORS para que o 503 chegue com os headers de
 * origin, e não como erro de CORS.
 */
function maintenanceGuard(
  message: string,
): MiddlewareHandler<{ Bindings: CloudflareBindings }> {
  return async (c, next) => {
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

app.use(
  "/auth/*",
  maintenanceGuard(
    "O acesso está temporariamente indisponível por manutenção. Tente novamente em alguns minutos.",
  ),
);

app.use(
  "/candidates/*",
  maintenanceGuard(
    "O check-in está temporariamente indisponível por manutenção. Tente novamente em alguns minutos.",
  ),
);

app.use(
  "/dashboard/*",
  maintenanceGuard(
    "O painel está temporariamente indisponível por manutenção. Tente novamente em alguns minutos.",
  ),
);

app.use(
  "/rooms/*",
  maintenanceGuard(
    "O cadastro de salas está temporariamente indisponível por manutenção. Tente novamente em alguns minutos.",
  ),
);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.route("/candidate", candidatesRouter);
app.route("/auth", authRouter);
app.route("/candidates", checkinRouter);
app.route("/dashboard", dashboardRouter);
app.route("/rooms", roomsRouter);

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// Documentação OpenAPI, protegida por Basic Auth (DOCS_PASSWORD via `wrangler secret put`).
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

/** Cron de hora em hora: sincroniza a planilha (FEAT-0002) e limpa sessões/tokens vencidos. */
const scheduled: ExportedHandlerScheduledHandler<CloudflareBindings> = async (
  _event,
  env,
) => {
  const maintenanceMode: string = env.MAINTENANCE_MODE;

  const service = new SheetSyncService(
    new CandidateRepository(env.DB),
    new GoogleSheetsClient(env.GOOGLE_SERVICE_ACCOUNT_KEY, env.GOOGLE_SHEET_ID),
    { maintenanceMode: maintenanceMode === "true" },
  );

  // Tarefas independentes: as duas rodam mesmo que uma falhe.
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
    await new AuthRepository(env.DB).pruneExpired();
    logger.info("auth.prune.success", {});
  } catch (err) {
    logger.error("auth.prune.failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    failures.push(err);
  }

  // Repropaga para a Cloudflare marcar a execução do cron como falha no painel.
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Falhas no cron do Worker");
  }
};

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<CloudflareBindings>;
