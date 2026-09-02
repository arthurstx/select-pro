# Implementation Plan: Correção de processos seletivos

**Branch**: `017-correcao-processos-seletivos` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-correcao-processos-seletivos/spec.md`

## Summary

CRUD parcial (leitura + edição, sem criação/exclusão) sobre `selection_processes` — tabela
que hoje só nasce automaticamente (`SelectionProcessRepository.resolveCurrent()`, regra
semestral fixa em código) e nunca pode ser corrigida sem SQL direto. A feature dá ao admin
uma tela para listar processos existentes e corrigir `label`/`starts_at`/`ends_at` de um já
existente, pelo `id`. Sem migration — a tabela e a unicidade de `label` já existem desde a
`0006`.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod, shadcn `Table`/`Sheet` (padrão já
usado em `front/app/painel/salas/` — sem dependência nova)

**Storage**: Cloudflare D1 — sem migration nova, escreve sobre `selection_processes`
(migration `0006`, já com `UNIQUE(label)`)

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`,
`selection-process-admin.service.test.ts` + `selection-process.routes.test.ts` (Princípio V)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova — leitura/escrita simples sobre uma tabela pequena
(dezenas de linhas, um processo por semestre)

**Constraints**: 10 ms CPU/invocação — sem risco, mesma classe de operação que o resto do
CRUD já feito no projeto (comparável a `rooms`)

**Scale/Scope**: 1 tabela existente, sem coluna nova; 1 arquivo `shared` novo; 1
router/service novos (reaproveita `SelectionProcessRepository` já existente, só ganha
`update()`); 1 tela admin nova (tabela + edição inline/painel lateral, mesmo padrão de
`salas/`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `UpdateSelectionProcessAdminSchema`/`SelectionProcessAdminSummarySchema` novos em `shared/src/schemas/selection-process-admin.schema.ts`, consumidos por api e front — nenhum DTO local. |
| II. Spec antes de código | ✅ `spec.md` aprovado (escopo confirmado com o usuário antes da spec) antes deste plan. |
| III. Banco insubstituível | ✅ Sem migration — só `UPDATE` sobre linhas existentes. Nenhuma reconstrução de tabela, nenhuma janela de manutenção necessária. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova; sem uso de KV/Queue. |
| V. Backend com testes | ✅ `selection-process-admin.service.test.ts` + `selection-process.routes.test.ts` novos. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/017-correcao-processos-seletivos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/selection-processes.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── selection-process-admin.schema.ts  # NOVO — UpdateSelectionProcessAdminSchema (com
                                        # .superRefine starts_at < ends_at),
                                        # SelectionProcessAdminSummarySchema,
                                        # SelectionProcessAdminListResponseSchema,
                                        # SelectionProcessAdminResponseSchema,
                                        # SelectionProcessAdminErrorCode

api/src/
├── routes/selection-process.routes.ts        # NOVO — GET/PUT, [requireAuth, requireRole(ADMIN)]
├── services/selection-process-admin.service.ts # NOVO — list(), update() (Either, mesmo
│                                                 # padrão de RoomsService)
├── repositories/selection-process.repository.ts # + método update() (já tem findById/
│                                                  # findByLabel/listAll)
├── core/errors/selection-process-errors.ts    # NOVO — SelectionProcessLabelAlreadyExistsError
│                                                 # (reaproveita SelectionProcessNotFoundError
│                                                 # já existente em checkin-errors.ts)
└── index.ts                                    # + CORS/maintenanceGuard para
                                                  # /selection-processes/*, monta o router

api/test/
├── selection-process-admin.service.test.ts  # novo
└── selection-process.routes.test.ts          # novo

front/app/painel/processos/
└── page.tsx                # NOVO — tabela + edição inline/painel lateral (mesmo padrão de
                             # front/app/painel/salas/page.tsx)

front/lib/selection-processes/
└── selection-processes-api.ts  # NOVO — mesmo padrão de front/lib/rooms/

front/components/painel/painel-nav.tsx
└── + item "Processos seletivos"
```

**Structure Decision**: domínio de escrita novo sobre uma entidade já existente
(`selection_processes`), sem acoplar a nenhum router já montado — segue a mesma Arquitetura em
Camadas (rota → service → repository) e o mesmo padrão admin-only (`requireAuth` +
`requireRole(ADMIN)`) já usados em `rooms`/`exports`/`evaluators`. O schema novo em `shared`
ganha nome próprio (`SelectionProcessAdmin*`) para não colidir nem reescrever o
`SelectionProcessSummarySchema` já existente em `checkin.schema.ts` (`{id, label}`, consumido
pelo seletor de edição do dashboard — shape menor, uso diferente).

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
