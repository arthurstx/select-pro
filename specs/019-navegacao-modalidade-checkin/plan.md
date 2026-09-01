# Implementation Plan: Navegação por modalidade + check-in dividido

**Branch**: `019-navegacao-modalidade-checkin` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-navegacao-modalidade-checkin/spec.md`

## Summary

Divide o check-in de candidatos em duas telas reais (presencial/online), via um filtro novo
`attendance` em `ListCandidatesQuerySchema` (reaproveita `AttendanceSchema` já existente) —
sem duplicar rota HTTP nem lógica de busca/paginação. Reorganiza a navegação do painel em dois
grupos de topo, "Presencial" e "Online", cada um levando a Grupos (já existente, FEAT-0018) e
Check-in (novo) da própria modalidade — reaproveitando o tipo `PainelNavGroup` já criado.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi` (query param novo, sem rota nova), Zod

**Storage**: Cloudflare D1 — sem migration, só mais uma condição de `WHERE` sobre coluna já
existente (`candidate_applications.saturday_restriction`)

**Testing**: Vitest + `@cloudflare/vitest-pool-workers` — `checkin.service.test.ts`/
`checkin.routes.test.ts` ganham casos para o filtro novo e o isolamento de cache

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova — mesma query, um `WHERE` a mais

**Constraints**: 10 ms CPU/invocação — sem risco

**Scale/Scope**: 1 campo novo em `shared`; `CheckinRepository`/`CheckinService`/
`checkin-list-cache.ts` ganham o parâmetro; 2 rotas de front novas + 1 componente
compartilhado extraído do `page.tsx` atual; `painel-nav.tsx` reestruturado (2 grupos em vez de
1 grupo + 1 item solto)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ `attendance` entra em `ListCandidatesQuerySchema` (shared), reaproveitando `AttendanceSchema` já existente — sem tipo local em `api`/`front`. |
| II. Spec antes de código | ✅ `spec.md` aprovada (escopo confirmado com o usuário) antes deste plan. |
| III. Banco insubstituível | ✅ Sem migration — filtro sobre coluna já existente. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova. TTL do KV (60s mín.) não muda — só a chave ganha mais um componente. |
| V. Backend com testes | ✅ Testes novos para o filtro e para o isolamento de cache por `attendance`. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/019-navegacao-modalidade-checkin/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/checkin-attendance-filter.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── checkin.schema.ts       # ListCandidatesQuerySchema + attendance: AttendanceSchema.optional()

api/src/
├── repositories/checkin.repository.ts  # ListCandidatesParams + attendance; WHERE em baseConditions
├── services/checkin.service.ts         # listCandidates/fetchAndCacheList repassam attendance
└── lib/checkin-list-cache.ts           # CachedListParams + attendance; keyFor inclui no cache key

api/test/
└── checkin.service.test.ts / checkin.routes.test.ts  # + casos de attendance e isolamento de cache

front/app/painel/check-in/
├── _components/checkin-screen.tsx  # NOVO — extraído do page.tsx atual, recebe `attendance` fixo
├── page.tsx                        # vira redirect para /painel/check-in/presencial
├── presencial/page.tsx             # NOVO — <CheckInScreen attendance="presencial" />
└── online/page.tsx                 # NOVO — <CheckInScreen attendance="online" />

front/components/painel/
└── painel-nav.tsx   # "Grupos" + "Check-in" saem do topo; entram "Presencial"/"Online"
                      # (PainelNavGroup já existente, FEAT-0018) com os 2 filhos cada
```

**Structure Decision**: mesmo padrão já usado na FEAT-0018 para `/painel/grupos/*` — página
fina por rota, componente compartilhado fazendo o trabalho de verdade. Nav reaproveita o tipo
`PainelNavGroup`/`isPainelNavGroup` já existente, sem mudança de componente.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
