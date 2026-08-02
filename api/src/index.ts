import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger as honoLogger } from "hono/logger";

import { logger } from "./lib/logger";
import { candidatesRouter } from "./routes/candidates.routes";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use(honoLogger());

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
