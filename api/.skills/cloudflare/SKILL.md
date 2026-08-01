---
name: cloudflare
description: >
  Use this skill whenever the user is interacting with Cloudflare Workers resources
  (KV, D1, Bindings, R2) or writing tests using Miniflare/Vitest. Triggers include:
  "Cloudflare Workers", "KV namespace", "D1 database", "Bindings", "c.env",
  "Miniflare", "testes no cloudflare", "wrangler", "wrangler.jsonc".
  Also use when configuring environment variables or adding new Cloudflare services.
---

# Cloudflare Workers & Bindings

Skill para integração e uso de recursos nativos do ecossistema Cloudflare Workers (Bindings, D1, KV) e testes (Miniflare).

## Referências em Uso

A documentação desta skill está modularizada. Leia o respectivo diretório quando precisar aprofundar no assunto:

| Referência | Caminho | O que contém |
| :--- | :--- | :--- |
| **Bindings Gerais** | `references/bindings/` | Tipagem, acesso via `env`, R2, Queues, Workers AI. |
| **D1 Database** | `references/d1/` | Migrations, query methods (.all, .first), batch operations, limites. |
| **KV Namespace** | `references/kv/` | Armazenamento chave-valor, cache, limites. |
| **Miniflare** | `references/miniflare/` | Configuração de testes locais Vitest + Miniflare simulando o ambiente Workers. |

---

## Quick Decisions

- **Acessar qualquer recurso Cloudflare (KV, D1, etc)** → Sempre via `env` (em Hono: `c.env.NOME_DO_BINDING`). Nunca como globais.
- **Armazenamento de arquivos/blobs** → R2 (`env.MY_BUCKET`).
- **Banco de dados Relacional Serverless** → D1 (`env.DB.prepare(sql).all()`).
- **Cache distribuído e rápido** → KV (`env.MY_KV.get(key)`).
- **Testes locais** → Usar Vitest com o enviroment `@cloudflare/vitest-pool-workers` / Miniflare.

---

## Gotchas Comuns (Resumo)

- **Tipagem Hono vs Wrangler:** Ao adicionar um novo binding no `wrangler.jsonc`, rode `npm run cf-typegen` (ou `wrangler types`) para atualizar `worker-configuration.d.ts`. No Hono, passe a tipagem `new Hono<{ Bindings: CloudflareBindings }>()` para que `c.env` seja reconhecido.
- **Conexão Direta a Banco Externo:** Workers **não** suportam conexões TCP brutas (como bibliotecas Node.js padrão do Postgres/MySQL). Use **Hyperdrive** ou conexões via HTTP/REST, ou mude para o D1 (nativo).
- **Global `process.env`:** Não existe no Cloudflare Workers. Variáveis de ambiente também são injetadas no objeto `env`.
