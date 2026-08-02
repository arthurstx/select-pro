import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";

import { logger } from "./lib/logger";
import { candidatesRouter } from "./routes/candidates.routes";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use(honoLogger());

// Fluxo público sem sessão/cookies (FEAT-0001-UI, seção 2) — reflete a origin
// da requisição em vez de credentials, não há estado de auth para proteger.
app.use("/candidate/*", cors());

app.get("/message", (c) => {
    return c.text("Hello Hono!");
});

app.route("/candidate", candidatesRouter);

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
