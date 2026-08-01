---
name: architecture
description: >
  Define o padrão arquitetural Layered (Camadas) da API, injeção de dependências via composição no Hono, e uso do banco de dados D1 com SQL Puro.
  Triggers include: "criar nova funcionalidade", "estrutura de pastas", "onde coloco esse arquivo", "injeção de dependência", "criar service", "criar repository", "arquitetura".
references: []
---

# Architecture Skill (Layered)

Este projeto adota uma **Arquitetura em Camadas (Layered)** focada em simplicidade, baixo *cold start* (devido ao Cloudflare Workers) e desacoplamento via injeção de dependência manual (composição de funções/classes).

## 1. Estrutura de Pastas

A regra de ouro é: **agrupe arquivos por sua função técnica**, e não pelo domínio de negócio.

```text
src/
├── index.ts               # Entry point: monta a instância principal do Hono e registra rotas
├── routes/                # Controladores HTTP: declaram app.openapi(), validam request e enviam response
├── schemas/               # Modelos Zod: schemas de requisição, resposta e tipos DTO
├── services/              # Regras de Negócio: classes ou funções puras que retornam `Either`
├── repositories/          # Banco de Dados: classes que recebem `D1Database` e rodam SQL Puro
└── middlewares/           # Interceptadores globais (ex: auth, logger)
```

**Convenção de nomenclatura:** `[nome].[tipo].ts` (ex: `users.routes.ts`, `users.service.ts`, `users.repository.ts`).

---

## 2. Injeção de Dependências (Composição na Rota)

**NÃO** utilize frameworks de DI (como NestJS, tsyringe, TypeDI). O custo de reflexão e inicialização no Edge é proibitivo.
**A injeção ocorre no Handler da Rota Hono**, garantindo que possamos ler o objeto `c.env.DB` a cada requisição.

**Padrão Exigido:**

```ts
// src/routes/users.routes.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { UserRepository } from '../repositories/users.repository'
import { UserService } from '../services/users.service'
import { getUserRoute } from '../schemas/users.schemas'

export const usersRouter = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

usersRouter.openapi(getUserRoute, async (c) => {
  // 1. Extração do DB do Cloudflare Env
  const db = c.env.DB;
  
  // 2. Composição / Injeção manual
  const repo = new UserRepository(db);
  const service = new UserService(repo);
  
  // 3. Execução
  const result = await service.getUser(c.req.valid('param').id);
  
  // 4. Response
  if (isLeft(result)) {
    return c.json({ error: result.left.message }, 400); // Exemplo simplificado
  }
  return c.json(result.right, 200);
})
```

---

## 3. Banco de Dados (D1 e SQL Puro)

- **Sem ORM:** Não utilizamos Drizzle, Kysely ou Prisma. As queries devem ser escritas em **SQL Puro** usando as APIs nativas do D1 (`.prepare()`, `.bind()`, `.all()`, `.first()`).
- **Segurança:** **Sempre** utilize `.bind()` para passar variáveis. Nunca concatene strings no SQL para evitar SQL Injection.

**Exemplo de Repository:**

```ts
// src/repositories/users.repository.ts
export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string) {
    const result = await this.db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(id)
      .first();
      
    return result; // null se não encontrar
  }
}
```

---

## 4. Regras de Negócio (Services)

- O Service **nunca** deve saber que está rodando dentro do Hono, e **nunca** deve acessar `c.req` ou `c.json`.
- O Service recebe o Repository pelo construtor.
- O Service deve retornar o padrão **Either (Left/Right)** (ver skill de `error-handling`) em caso de erros previsíveis do domínio, deixando o "throw" apenas para falhas críticas de infraestrutura.
