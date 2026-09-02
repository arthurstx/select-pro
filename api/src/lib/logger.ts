type LogLevel = "info" | "warn" | "error";

/** Logs estruturados (JSON por linha) — pesquisáveis no Cloudflare Dashboard/Tail. */
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
