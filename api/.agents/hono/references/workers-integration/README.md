# Workers Integration

Tudo que é específico de Cloudflare Workers ao usar Hono: bindings, executionCtx, múltiplos handlers e testing.

## Tipagem de Bindings

Sem generics, `c.env` é `{}` — sem autocomplete, sem type-safety.

```ts
// ❌ c.env não tem tipo
const app = new Hono();
app.get("/", (c) => {
  c.env.MY_KV; // TypeScript: Property 'MY_KV' does not exist on type '{}'
});

// ✅ Correto
type Bindings = {
  MY_KV: KVNamespace;
  DB: D1Database;
  BUCKET: R2Bucket;
  API_KEY: string; // secrets e variáveis de ambiente também entram aqui
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c) => {
  const val = await c.env.MY_KV.get("key"); // tipado corretamente
  return c.json({ val });
});
```

## Bindings com Variables (padrão completo)

```ts
// types.ts — centralizar para reutilizar em sub-routers
export type AppEnv = {
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
  };
  Variables: {
    userId: string; // valores passados entre middlewares via c.set/c.get
  };
};

// index.ts
const app = new Hono<AppEnv>();
```

## Middleware com Bindings

**Armadilha crítica**: middleware que precisa de valores de `env` não pode receber os valores de fora — `env` só existe na requisição.

```ts
// ❌ Não funciona — USERNAME e PASSWORD não existem ainda no módulo
import { basicAuth } from "hono/basic-auth";

const app = new Hono<{ Bindings: { USERNAME: string; PASSWORD: string } }>();

app.use(
  "/admin/*",
  basicAuth({
    username: process.env.USERNAME, // undefined em Workers
    password: process.env.PASSWORD,
  }),
);

// ✅ Correto — instanciar o middleware dentro do handler que recebe c
app.use("/admin/*", async (c, next) => {
  const auth = basicAuth({
    username: c.env.USERNAME,
    password: c.env.PASSWORD,
  });
  return auth(c, next);
});
```

O mesmo padrão se aplica a: Bearer Auth, JWT, e qualquer middleware que aceite config estática mas precise de valores dinâmicos de `env`.

## executionCtx — Background Tasks

`waitUntil` permite executar trabalho assíncrono **após** a resposta ser enviada. Sem ele, o Worker é encerrado imediatamente após o `return`.

```ts
app.post("/log", async (c) => {
  const body = await c.req.json();

  // ❌ Se await aqui, o cliente espera — latência desnecessária
  // await logToAnalytics(body, c.env)

  // ✅ Executa em background, resposta enviada imediatamente
  c.executionCtx.waitUntil(logToAnalytics(body, c.env));

  return c.json({ ok: true });
});
```

> `c.executionCtx` é o `ExecutionContext` nativo do Workers. Equivalente ao `ctx` em `export default { fetch(req, env, ctx) }`.

## Coexistência com Outros Handlers do Workers

Quando o Worker precisa de `scheduled`, `queue`, ou outros handlers além de `fetch`:

```ts
// ✅ Correto — exportar app.fetch explicitamente
const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("ok"));

export default {
  fetch: app.fetch,

  // Cron job
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    await doCleanup(env);
  },

  // Queue consumer
  queue: async (batch: MessageBatch, env: Env) => {
    for (const msg of batch.messages) {
      await processMessage(msg.body, env);
    }
  },
};

// ❌ Não funciona com outros handlers — só exporta fetch
export default app;
```

## Static Assets (Workers Static Assets)

Para servir arquivos estáticos no Workers (sem Pages):

```toml
# wrangler.toml
assets = { directory = "public" }
```

```ts
// Arquivos em ./public/ são servidos automaticamente pelo Workers runtime
// ./public/favicon.ico → /favicon.ico
// ./public/static/app.js → /static/app.js
// O Hono só recebe requisições que o runtime não resolveu com assets
```

## Instalação de Types

```bash
npm i --save-dev @cloudflare/workers-types
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```

Sem este pacote, tipos como `KVNamespace`, `D1Database`, `R2Bucket`, `ExecutionContext` não existem.

## Testing em Workers

Usar `@cloudflare/vitest-pool-workers` — não usar `vitest` puro, pois ele não tem acesso aos bindings simulados.

```ts
// test/index.test.ts
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("app", () => {
  it("GET / returns 200", async () => {
    // app.request() não precisa de servidor real — testa in-process
    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
  });

  it("POST com body", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" }, // obrigatório para validators
    });
    expect(res.status).toBe(201);
  });
});
```

## Service Bindings como fetch customizado (RPC entre Workers)

```toml
# wrangler.toml
services = [
  { binding = "AUTH_SERVICE", service = "auth-worker" },
]
```

```ts
type Bindings = {
  AUTH_SERVICE: Fetcher; // tipo correto para service bindings
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/protected", async (c) => {
  // Usar o fetch do service binding diretamente
  const res = await c.env.AUTH_SERVICE.fetch(c.req.raw);
  // ...
});

// Para hc (RPC client) usar service binding como transport:
import { hc } from "hono/client";
import type { AuthAppType } from "../auth-worker/src";

const authClient = hc<AuthAppType>("http://localhost", {
  fetch: c.env.AUTH_SERVICE.fetch.bind(c.env.AUTH_SERVICE),
});
```
