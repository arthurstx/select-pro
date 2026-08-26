# Implementation Plan: Papel de host por edição e painel de avaliadores

**Branch**: `feat/papel-host` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-papel-de-host/spec.md`

## Summary

Tabela nova `edition_hosts` — a existência de uma linha `(process_id, user_id)` é o próprio
fato de ser host naquela edição (R1), sem coluna de estado. Painel admin lista avaliadores da
edição corrente com cargo anotado e situação do membro (FEAT-0008), com toggle
avaliador↔host e filtro por cargo. Reaproveita `SelectionProcessRepository.resolveCurrent()`
e `NoActiveSelectionProcessError`, já existentes desde FEAT-0005/0007 — nenhum conceito novo
de "edição corrente" é criado.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod — sem dependência nova

**Storage**: Cloudflare D1 — migration `0010`, aditiva (1 tabela nova)

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`, `evaluators.service.test.ts` +
`evaluators.routes.test.ts` (Princípio V)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova — lista de dezenas de avaliadores, filtro em memória (R4)

**Constraints**: 10 ms CPU/invocação — sem risco, mesma classe de operação do resto do CRUD

**Scale/Scope**: 1 tabela nova; 1 arquivo `shared` novo; 1 router/service/repository novos;
1 tela admin nova (reaproveita o mockup Stitch "Gestão de Avaliadores" já existente para a
lista, adicionando o toggle e o filtro que ele ainda não tinha)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `EvaluatorSummarySchema`/`SetEvaluatorRoleSchema` em `shared/src/schemas/evaluator.schema.ts`. |
| II. Spec antes de código | ✅ `spec.md` aprovado antes deste plan. |
| III. Banco insubstituível | ✅ Migration `0010` cria só uma tabela nova, vazia — aditiva, sem `MAINTENANCE_MODE`. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova. |
| V. Backend com testes | ✅ `evaluators.service.test.ts` + `evaluators.routes.test.ts` novos. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/009-papel-de-host/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/evaluators.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── evaluator.schema.ts        # NOVO — EvaluatorRoleSchema, SetEvaluatorRoleSchema,
                                # EvaluatorSummarySchema, EvaluatorListResponseSchema

api/migrations/
└── 0010-edition-hosts.sql     # aditiva — 1 tabela nova

api/src/
├── routes/evaluators.routes.ts          # NOVO — GET/PUT, [requireAuth, requireRole(ADMIN)]
├── services/evaluators.service.ts       # NOVO — reusa SelectionProcessRepository.resolveCurrent()
├── repositories/evaluators.repository.ts # NOVO
└── index.ts                              # + CORS/maintenanceGuard para /evaluators/*, monta router

api/test/
├── evaluators.service.test.ts  # novo
└── evaluators.routes.test.ts   # novo

front/lib/evaluators/
└── evaluators-api.ts            # NOVO — mesmo padrão de lib/rooms/rooms-api.ts

front/app/painel/avaliadores/
└── page.tsx                     # NOVO — tabela + toggle + filtro (mockup Stitch "Gestão de Avaliadores")

front/components/painel/painel-nav.tsx
└── + item "Avaliadores"
```

**Structure Decision**: domínio novo (`evaluators`), sem acoplar a `auth.*`. Reaproveita
`SelectionProcessRepository` (já existe) em vez de recriar a resolução de edição corrente —
mesmo padrão que `checkin.service.ts`/`dashboard.service.ts` já usam cada um por conta
própria (duplicação pequena e aceita no projeto, não vale extrair agora fora do escopo desta
feature).

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
