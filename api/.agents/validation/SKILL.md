---
name: zod-openapi-hono
description: >
  Use this skill whenever the user is building a Hono API and wants to add OpenAPI/Swagger
  documentation, request/response validation with Zod, or type-safe route definitions.
  Triggers include: "Hono + Zod", "OpenAPI no Hono", "validação com Zod no Hono",
  "gerar swagger com Hono", "zod-openapi", "@hono/zod-openapi", "documentar API Hono",
  "route validation Hono", "OpenAPIHono", "createRoute Hono". Also use when the user
  asks to add input validation, error handling, or API docs to an existing Hono project.
---

# Zod OpenAPI Hono

Skill para construir APIs Hono com validação Zod e documentação OpenAPI/Swagger automática,
usando `@hono/zod-openapi`.

## Instalação

```bash
npm i hono zod @hono/zod-openapi
```

---

## Fluxo padrão de implementação

Siga sempre esta ordem ao montar uma rota documentada:

1. **Definir schemas Zod** (input e output)
2. **Criar a rota** com `createRoute`
3. **Registrar no app** com `app.openapi(route, handler)`
4. **Expor o doc** com `app.doc('/doc', { ... })`

---

## 1. Importando e Usando Schemas (Padrão SDD)

> [!WARNING]
> **REGRA CRÍTICA DE MONOREPO:** Nunca crie schemas Zod de entidades, payloads de requisição (body) ou respostas (DTOs) localmente no diretório `api/`.
> Importe **SEMPRE** os schemas do pacote compartilhado `shared` para manter a fonte de verdade entre o front e backend.

```ts
import { z } from '@hono/zod-openapi'
import { UserSchema, CreateUserSchema } from 'shared'

// Schema de parâmetro de path (este sim pode ser definido localmente se for só de rota)
const ParamsSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: 'id', in: 'path' },
    example: '123',
  }),
})

// Schema de query
const QuerySchema = z.object({
  page: z.coerce.number().optional().openapi({ example: 1 }),
})

// Schema de erro (também pode vir de shared se for global)
const ErrorSchema = z.object({
  code: z.number().openapi({ example: 400 }),
  message: z.string().openapi({ example: 'Validation Error' }),
}).openapi('Error')
```

> **Atenção com headers:** chaves de header devem ser **lowercase** no schema.
> ```ts
> const HeadersSchema = z.object({
>   authorization: z.string(), // ✅ correto — NÃO use 'Authorization'
> })
> ```

---

## 2. Criando Rotas

```ts
import { createRoute } from '@hono/zod-openapi'

const getUserRoute = createRoute({
  method: 'get',
  path: '/users/{id}',       // Use {param} para path params no OpenAPI
  tags: ['Users'],
  summary: 'Busca usuário por ID',
  request: {
    params: ParamsSchema,    // path params
    query: QuerySchema,      // query params (opcional)
    headers: HeadersSchema,  // headers (opcional)
    body: {                  // body (apenas em POST/PUT/PATCH)
      content: {
        'application/json': { schema: CreateUserSchema }, // Importado de shared
      },
      required: true,        // force validation mesmo sem Content-Type correto
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: UserSchema } },
      description: 'Usuário encontrado',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Erro de validação',
    },
    404: {
      description: 'Não encontrado',
    },
  },
})
```

---

## 3. Configurando o App

```ts
import { OpenAPIHono } from '@hono/zod-openapi'

const app = new OpenAPIHono({
  // defaultHook: handler de erro global para validação (recomendado)
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { code: 422, message: 'Validation Error', errors: result.error.flatten() },
        422
      )
    }
  },
})

// Registrar rota
app.openapi(getUserRoute, (c) => {
  const { id } = c.req.valid('param')   // acesso type-safe ao param
  const { page } = c.req.valid('query') // acesso ao query
  // const body = c.req.valid('json')   // acesso ao body

  return c.json({ id, name: 'João Silva', email: 'joao@email.com' }, 200)
})

// Expor documentação OpenAPI
app.doc('/doc', {
  openapi: '3.0.0',
  info: { version: '1.0.0', title: 'Minha API' },
})

export default app
```

---

## 4. Padrões comuns

### Autenticação Bearer
```ts
// 1. Registrar scheme
app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
})

// 2. Usar na rota
const route = createRoute({
  // ...
  security: [{ Bearer: [] }],
})
```

### Rotas condicionais (ex: só em dev)
```ts
const debugRoute = defineOpenAPIRoute({
  route: createRoute({ /* ... */ }),
  handler: (c) => c.json({ debug: true }),
  addRoute: process.env.NODE_ENV === 'development',
})
```

### Excluir rota da documentação
```ts
const route = createRoute({ /* ... */, hide: true })
```

### OpenAPI v3.1
```ts
app.doc31('/docs', { openapi: '3.1.0', info: { title: 'API', version: '1' } })
```

### Middleware por rota
```ts
import { prettyJSON } from 'hono/pretty-json'
import { cache } from 'hono/cache'

const route = createRoute({
  // ...
  middleware: [prettyJSON(), cache({ cacheName: 'my-cache' })] as const,
})
```

### Registro em lote (openapiRoutes)
```ts
import { defineOpenAPIRoute } from '@hono/zod-openapi'

const getUserRoute = defineOpenAPIRoute({ route, handler })
const createUserRoute = defineOpenAPIRoute({ route: createRoute, handler })

// Registrar tudo de uma vez
app.openapiRoutes([getUserRoute, createUserRoute] as const)
```

---

## 5. Organização modular recomendada

```
src/
├── index.ts              # app principal + doc
└── routes/
    ├── users.ts          # rotas agrupadas por recurso
    └── posts.ts
```

> [!WARNING]
> **NOTA (SDD):** Ao contrário do padrão Hono isolado, **NÃO crie uma pasta `schemas/` local no backend**. 
> Todos os schemas de validação Zod para domínio e request/response (body) devem viver obrigatoriamente na pasta `shared/src/schemas/` do monorepo e ser importados via `import { ... } from 'shared'`.

```ts
// routes/users.ts
export const userRoutes = [getUserRoute, createUserRoute] as const

// index.ts
import { userRoutes } from './routes/users'
app.openapiRoutes([...userRoutes] as const)
```

---

## 6. Armadilhas frequentes

| Problema | Causa | Solução |
|---|---|---|
| `c.req.valid('json')` retorna `{}` | Request sem `Content-Type: application/json` | Adicionar `required: true` no body |
| Rota não encontrada ao usar `.route()` | Path param com sintaxe OpenAPI `{id}` no pai | Usar sintaxe Hono `:id` no pai |
| Header não validado | Chave em maiúscula no schema | Usar sempre lowercase: `authorization` |
| Tipo perdido após `.use()` | `.use()` retorna `Hono`, não `OpenAPIHono` | Usar `$(app.use(...))` ou `HonoToOpenAPIHono` |

---

## Referências

- Para exemplos completos de app, leia: `references/full-example.md`
- Docs oficiais: https://hono.dev / https://github.com/honojs/middleware