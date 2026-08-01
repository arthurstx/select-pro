---
name: hono
description: >
  Hono framework skill focused on Cloudflare Workers integration, type-safe patterns, RPC, and routing.
  Triggers include: "Hono routing", "Hono middleware", "criar rota Hono", "Hono RPC", "hono client", "app.route", "c.req", "hono/factory", "Hono + Cloudflare Workers".
  NOTE: For validation (Zod) or OpenAPI docs, do not use this. Use the `validation` (zod-openapi-hono) skill instead to avoid overlap.
references:
  - workers-integration
  - routing
  - middleware
  - rpc
  - validation
---

# Hono + Cloudflare Workers Skill

> Prefer fetching from official docs over pre-trained knowledge.
> When this file conflicts with documentation, **trust the docs**.

## Overview & Quick Start

Hono é um framework web ultrarápido baseado em Web Standards. No contexto de Cloudflare Workers, as principais diferenças em relação a outros runtimes são: como os bindings chegam ao app via `c.env`, como múltiplos handlers de evento coexistem (ex: scheduled), e como o sistema de tipos precisa ser configurado.

```ts
// src/index.ts
import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
};

// É crucial passar o generic para que c.env seja tipado!
const app = new Hono<{ Bindings: Bindings }>();

app.get("/hello", (c) => c.text("Hello Workers!"));

// Coexistindo com outros handlers (cron, queues) no Workers
export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // cron jobs aqui
  },
};
```

## Estrutura Recomendada

```
src/
├── index.ts          # Entry point — monta as rotas e exporta
├── routes/
│   ├── users.ts      # Hono sub-app com chaining (obrigatório para RPC)
│   └── posts.ts
├── middleware/
│   └── auth.ts       # createMiddleware<Env>() de hono/factory
└── types.ts          # Env, Bindings, Variables compartilhados
```

## Quick Decisions

- **Passar bindings (KV, D1, R2) ao app** → `new Hono<{ Bindings: Bindings }>()` — sem generics, `c.env` não tem tipo.
- **Usar bindings dentro de middleware** → instanciar o middleware dentro de um handler que recebe `c`, não fora.
- **Separar rotas em arquivos** → `app.route()` funciona; para RPC, usar **chaining** obrigatoriamente.
- **Rodar tarefas após resposta (background jobs)** → `c.executionCtx.waitUntil(promise)`, nunca `await` direto.
- **Exportar múltiplos handlers** → `export default { fetch: app.fetch, scheduled: ... }`
- **Criar middleware reutilizável com tipos** → `createMiddleware<Env>()` de `hono/factory`.
- **Separar a definição de handlers do roteamento** → `factory.createHandlers()` de `hono/factory`.
- **Erros HTTP semânticos** → `throw new HTTPException(status, { message })` de `hono/http-exception`.
- **HEAD requests** → NÃO criar `app.head()` — Hono converte HEAD → GET automaticamente antes do roteamento.

## Reading Order / Referências

**Início**: Comece lendo a pasta `references/workers-integration/` para setup e bindings, seguido por `references/routing/` para gotchas de rotas.

**Resolução de Problemas Específicos**:
- Bindings não tipados / `c.env` sem autocomplete → leia `references/workers-integration/`
- Middleware com acesso a `env` → leia seção "Middleware com Bindings" em `references/workers-integration/`
- RPC não infere tipos / IDE lenta → leia `references/rpc/`
- `app.head()` não funciona → leia "HEAD requests" em `references/routing/`
- Rota montada com `route()` retorna 404 → leia "Grouping ordering" em `references/routing/`
- Validação retorna `{}` vazio ou Headers não validam → leia `references/validation/` (Mas prefira usar a skill externa de Zod OpenAPI).
