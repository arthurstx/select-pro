# Implementation Plan: Cadastro de salas

**Branch**: `feat/cadastro-de-salas` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-cadastro-de-salas/spec.md`

## Summary

CRUD de salas sobre a tabela `rooms` (existe desde a `0001`, órfã). Hosts e
limite de grupos nunca são armazenados — são derivados da capacidade por uma
função pura em `shared`, consumida pela API (response) e pelo front (prévia
ao vivo no formulário, sem round-trip). Nome de sala ganha unicidade via
índice novo; exclusão bloqueada por grupo vinculado já é garantida por uma FK
`ON DELETE RESTRICT` que a `0001` deixou pronta e nunca foi usada.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Zod, shadcn `Sheet`/`Table`
(já instalados — sem dependência nova)

**Storage**: Cloudflare D1 — migration `0009`, aditiva (1 índice único)

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`, `rooms.service.test.ts` +
`rooms.routes.test.ts` (Princípio V)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova — `deriveRoomCapacity` é aritmética pura,
custo desprezível

**Constraints**: 10 ms CPU/invocação — sem risco, mesma classe de operação que
o resto do CRUD já feito no projeto

**Scale/Scope**: 1 tabela existente + 1 índice novo; 1 arquivo `shared` novo;
1 router/service/repository novos; 1 tela admin nova (tabela + painel lateral,
já prototipada no Stitch — "Gestão de Salas")

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `CreateRoomSchema`/`UpdateRoomSchema`/`RoomSummarySchema` em `shared/src/schemas/room.schema.ts`. `deriveRoomCapacity` também em `shared` — mesma lógica no front (prévia) e na api (response), nunca duas implementações. |
| II. Spec antes de código | ✅ `spec.md` aprovado antes deste plan. |
| III. Banco insubstituível | ✅ Migration `0009` só cria um índice único sobre tabela vazia — aditiva, sem `MAINTENANCE_MODE`. A regra de exclusão bloqueada (FR-009) não precisa de migration: já existe desde a `0001`. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova. |
| V. Backend com testes | ✅ `rooms.service.test.ts` + `rooms.routes.test.ts` novos. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/011-cadastro-de-salas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/rooms.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── room.schema.ts             # NOVO — deriveRoomCapacity, Create/UpdateRoomSchema,
                                # RoomSummarySchema, RoomErrorCode

api/migrations/
└── 0009-rooms-unique-name.sql # aditiva — 1 índice único

api/src/
├── routes/rooms.routes.ts          # NOVO — GET/POST/PUT/DELETE, [requireAuth, requireRole(ADMIN)]
├── services/rooms.service.ts       # NOVO
├── repositories/rooms.repository.ts # NOVO
├── core/errors/room-errors.ts       # NOVO — RoomNotFoundError, RoomNameAlreadyExistsError, RoomHasGroupsError
└── index.ts                         # + CORS/maintenanceGuard para /rooms/*, monta roomsRouter

api/test/
├── rooms.service.test.ts  # novo
└── rooms.routes.test.ts   # novo

front/app/painel/salas/
└── page.tsx                # NOVO — tabela + Sheet lateral com prévia ao vivo (mockup Stitch "Gestão de Salas")

front/lib/rooms/
└── rooms-api.ts             # NOVO — mesmo padrão de lib/checkin/api.ts

front/components/painel/painel-nav.tsx
└── + item "Salas"
```

**Structure Decision**: domínio novo (`rooms`), sem acoplar a `auth.*` nem a
nenhum router existente (R4). Segue exatamente a Arquitetura em Camadas já
estabelecida — mesma convenção de nomes, mesma composição manual no handler.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
