# Middleware

Padrões não óbvios de middleware: criação tipada, compartilhamento de variáveis entre handlers, e erros globais.

## createMiddleware — Tipagem Correta

Usar `createMiddleware<Env>()` de `hono/factory` para garantir que `c.set/c.get` sejam type-safe dentro do middleware.

```ts
import { createMiddleware } from "hono/factory";

type AppEnv = {
  Variables: {
    userId: string;
    role: "admin" | "user";
  };
  Bindings: {
    DB: D1Database;
  };
};

// ✅ Tipagem correta — c.set e c.get são inferidos
const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) throw new HTTPException(401, { message: "Unauthorized" });

  const user = await verifyToken(token, c.env.DB);
  c.set("userId", user.id);
  c.set("role", user.role);
  await next();
});

// No handler, c.get é tipado:
app.get("/profile", authMiddleware, (c) => {
  const userId = c.get("userId"); // string — tipado corretamente
  return c.json({ userId });
});
```

## ContextVariableMap — Armadilha de Tipo Global

`ContextVariableMap` adiciona tipos **globalmente** para todos os contextos, mesmo onde o middleware não foi registrado. Isso cria falsa sensação de segurança — o TypeScript não vai reclamar, mas o valor será `undefined` em runtime.

```ts
// ⚠️ Cuidado ao usar — afeta tipos de TODA a aplicação
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

// ❌ TypeScript não reclama, mas userId é undefined em runtime
app.get("/public", (c) => {
  const id = c.get("userId"); // tipado como string, mas é undefined
  return c.json({ id });
});

// ✅ Preferir: passar Env como genérico no Hono e usar createMiddleware<Env>
// ContextVariableMap só é seguro para variáveis setadas por middleware global (app.use sem path)
```

## Factory — Handlers Fora da Definição de Rota

Quando é necessário separar handlers da definição de rotas (sem perder tipos), usar `createFactory()`:

```ts
import { createFactory } from "hono/factory";

type AppEnv = {
  Bindings: { DB: D1Database };
  Variables: { userId: string };
};

const factory = createFactory<AppEnv>();

// ✅ Handlers separados com tipos corretos
const getUserHandlers = factory.createHandlers(authMiddleware, async (c) => {
  const userId = c.get("userId"); // tipado corretamente
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first();
  return c.json(user);
});

app.get("/user", ...getUserHandlers);
```

## factory.createApp() — Evitar Duplicação de Env

```ts
// ❌ Env definida em dois lugares
const app = new Hono<AppEnv>()
const mw = createMiddleware<AppEnv>(async (c, next) => { ... })

// ✅ Definir Env uma vez no factory
const factory = createFactory<AppEnv>()
const app = factory.createApp()
const mw = factory.createMiddleware(async (c, next) => { ... })
```

## HTTPException — Erros com Resposta Semântica

```ts
import { HTTPException } from "hono/http-exception";

// Lançar com mensagem simples
throw new HTTPException(401, { message: "Token inválido" });

// Lançar com Response customizada (ex: headers adicionais)
const errorResponse = new Response("Unauthorized", {
  status: 401,
  headers: { "WWW-Authenticate": 'Bearer realm="api"' },
});
throw new HTTPException(401, { res: errorResponse });

// Capturar no onError
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
    // ⚠️ getResponse() não conhece headers já setados no Context
    // Para preservar headers do c, construir nova Response:
    // return new Response(err.message, { status: err.status, headers: c.res.headers })
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
});
```

## c.res — Modificar Response Após Handler

Para modificar a response depois que o handler rodou (em middleware):

```ts
app.use("*", async (c, next) => {
  await next();
  // Adicionar header em todas as respostas
  c.res.headers.append("X-Powered-By", "Hono");
});
```

## c.set / c.get — Escopo por Requisição

Valores em `c.set/c.get` existem **apenas durante a vida daquela requisição** — não são compartilhados entre requisições diferentes.

```ts
app.use(async (c, next) => {
  c.set("requestId", crypto.randomUUID()); // novo a cada request
  await next();
});

app.get("/trace", (c) => {
  return c.json({ requestId: c.get("requestId") });
});
```
