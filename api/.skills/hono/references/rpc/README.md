# RPC

O sistema RPC do Hono compartilha tipos entre servidor e cliente. Tem várias armadilhas não óbvias — especialmente em projetos maiores.

## Setup Mínimo

```ts
// server.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";

const app = new Hono().post(
  "/posts",
  zValidator("json", z.object({ title: z.string(), body: z.string() })),
  (c) => {
    return c.json({ ok: true, id: 1 }, 201); // status code explícito para inferência correta
  },
);

export type AppType = typeof app;

// client.ts
import { hc } from "hono/client";
import type { AppType } from "./server";

const client = hc<AppType>("http://localhost:8787/");
const res = await client.posts.$post({
  json: { title: "Hello", body: "World" },
});
```

## Regras Críticas de Tipagem RPC

**1. Sempre especificar status code em `c.json()`**

```ts
// ❌ Tipo de resposta inferido como genérico
return c.json({ post });

// ✅ Status code explícito — cliente consegue discriminar por status
return c.json({ post }, 200);
return c.json({ error: "not found" }, 404);
```

**2. Nunca usar `c.notFound()` em rotas expostas via RPC**

```ts
// ❌ Cliente recebe tipo `unknown`
if (!post) return c.notFound();

// ✅ Alternativa 1: usar c.json() com status explícito
if (!post) return c.json({ error: "not found" }, 404);

// ✅ Alternativa 2: augmentar NotFoundResponse (mais trabalhoso)
declare module "hono" {
  interface NotFoundResponse
    extends Response, TypedResponse<{ error: string }, 404, "json"> {}
}
app.notFound((c) => c.json({ error: "not found" }, 404));
```

**3. tsconfig deve ter `strict: true` em monorepos**

Sem `"strict": true` em ambos cliente e servidor em monorepos, tipos RPC quebram com erros de inferência profunda.

## RPC com Aplicações Maiores — Chaining Obrigatório

Para que o tipo seja propagado corretamente em sub-apps, os handlers **precisam ser encadeados** (não usar `app.get()` separados).

```ts
// ❌ Tipos RPC não propagam corretamente com app.get() separados
const app = new Hono();
app.get("/", (c) => c.json("list"));
app.post("/", (c) => c.json("create", 201));
export default app;

// ✅ Chaining — tipos são inferidos na cadeia completa
const app = new Hono()
  .get("/", (c) => c.json("list"))
  .post("/", (c) => c.json("create", 201));
export default app;
export type AppType = typeof app;
```

```ts
// index.ts — montar rotas e exportar o tipo composto
import { Hono } from "hono";
import authors from "./routes/authors";
import posts from "./routes/posts";

const app = new Hono();

// ✅ Encadear routes() para manter o tipo
const routes = app.route("/authors", authors).route("/posts", posts);

export default app;
export type AppType = typeof routes; // tipo do resultado encadeado, não do app
```

## Erros Globais não são Inferidos Automaticamente

`app.onError()` e middleware global não aparecem no tipo do cliente. Usar `ApplyGlobalResponse`:

```ts
import type { ApplyGlobalResponse } from "hono/client";

const app = new Hono()
  .get("/users", (c) => c.json({ users: [] }, 200))
  .onError((err, c) => c.json({ error: err.message }, 500));

type AppWithErrors = ApplyGlobalResponse<
  typeof app,
  {
    500: { json: { error: string } };
    401: { json: { error: string } };
  }
>;

const client = hc<AppWithErrors>("http://localhost");
```

## IDE Performance — Problema Conhecido

Muitas rotas deixam o tsserver lento. Soluções por ordem de eficácia:

**1. Compilar antes de usar (recomendado para monorepos)**

```ts
// client-factory.ts — compilar este arquivo resolve a lentidão
import { app } from "./app";
import { hc } from "hono/client";

export type Client = ReturnType<typeof hc<typeof app>>;
export const hcWithType = (...args: Parameters<typeof hc>): Client =>
  hc<typeof app>(...args);

// Usar hcWithType em vez de hc — tipos já calculados no build
const client = hcWithType("http://localhost:8787/");
```

**2. Dividir em múltiplos clientes**

```ts
// Em vez de um cliente gigante para o app inteiro:
import { app as usersApp } from "./routes/users";
const usersClient = hc<typeof usersApp>("/users");

import { app as postsApp } from "./routes/posts";
const postsClient = hc<typeof postsApp>("/posts");
// tsserver tipa cada um separadamente — menos carga por arquivo
```

**3. Verificar versão do Hono (monorepo)**

Se backend e frontend usam versões diferentes do Hono, aparece erro:
`"Type instantiation is excessively deep and possibly infinite"`

Garantir que ambos usam exatamente a mesma versão.

## $url() exige URL absoluta

```ts
// ❌ Lança TypeError: Invalid URL
const client = hc<AppType>("/");
client.api.posts.$url();

// ✅ URL absoluta obrigatória para $url()
const client = hc<AppType>("http://localhost:8787/");
client.api.posts.$url(); // retorna URL object

// Para só o path (sem precisar de URL absoluta), usar $path()
const client = hc<AppType>("/");
client.api.posts.$path(); // '/api/posts' — funciona com URL relativa
```

## Path Parameters no Cliente — Sempre String

```ts
// ✅ param e query sempre como string no cliente, mesmo que o servidor converta
const res = await client.posts[":id"].$get({
  param: { id: "123" }, // string, não number
  query: { page: "1" }, // string — o validator converte com z.coerce.number()
});
```

## InferRequestType / InferResponseType

```ts
import type { InferRequestType, InferResponseType } from "hono/client";

const $post = client.posts.$post;

type Req = InferRequestType<typeof $post>; // tipo do body/form/query
type Res = InferResponseType<typeof $post>; // tipo da resposta (union de todos os status)
type Res200 = InferResponseType<typeof $post, 200>; // tipo específico do status 200
```
