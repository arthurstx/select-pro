---
name: error-handling
description: >
  Error handling em aplicações TypeScript com Hono rodando em Cloudflare Workers.
  Define quando usar Either/Left/Right, throw, HTTPException e app.onError().
  Use esta skill sempre que o usuário estiver definindo estratégia de erros,
  tratando falhas em rotas Hono, ou decidindo entre Either vs throw vs HTTPException.
references:
  - hono
  - cloudflare-workers
  - zod
  - either
---

# Error Handling — Hono + Cloudflare Workers

## Retrieval Sources

Priorize sempre a documentação oficial sobre o conhecimento de treinamento:

| Fonte                                     | URL                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Hono Exception Handling                   | https://hono.dev/docs/api/exception                                              |
| Cloudflare Workers Best Practices         | https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ |
| Cloudflare Durable Objects Error Handling | https://developers.cloudflare.com/durable-objects/best-practices/error-handling/ |

> ⚠️ Se houver conflito entre a documentação oficial e o conhecimento de treinamento, **confie nas docs**.

---

## Products in Use

| Tecnologia         | Papel                                                      |
| ------------------ | ---------------------------------------------------------- |
| TypeScript         | Linguagem principal                                        |
| Hono               | Framework HTTP                                             |
| Cloudflare Workers | Runtime de execução                                        |
| Zod                | Validação de entrada                                       |
| Either/Left/Right  | Erros de domínio esperados (customizado, sem fp-ts/Effect) |

**Não utilizado:** `class-validator`, `Valibot`, `Effect`, `fp-ts`, `Prisma`, `Drizzle`

---

## Quick Decisions

```
Preciso lidar com um erro. O que usar?

É um resultado ESPERADO da operação? (ex: "não encontrado", "sem permissão")
  └─ SIM → Either (left/right)
  └─ NÃO → continua abaixo

É uma falha TÉCNICA/INFRA? (timeout, DNS, DB caiu, fetch falhou)
  └─ SIM → throw new Error(...)

Estou na camada HTTP / handler de rota?
  └─ SIM → throw new HTTPException(status, { message })

Preciso de um handler GLOBAL para erros não tratados?
  └─ SIM → app.onError(...)
```

---

## Detalhamento das Estratégias

Para detalhes, exemplos e padrões avançados de cada estratégia, leia os arquivos:

- `references/api.md` — Either, HTTPException, app.onError()
- `references/patterns.md` — Exemplos completos de fluxo por camada
- `references/gotchas.md` — Erros comuns e o que evitar
- `references/configuration.md` — Setup inicial: Either customizado + Hono + Zod
