type LogLevel = "info" | "warn" | "error";

/**
 * Logs estruturados (JSON por linha) — o Worker já tem `observability.enabled`
 * no wrangler.jsonc, então tudo que passa por console.* fica pesquisável no
 * Cloudflare Dashboard/Tail. Formato consistente facilita grep tanto local
 * (`wrangler dev`) quanto em produção.
 */
function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export const logger = {
    info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
    warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
    error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};
