# Implementation Plan: Check-in de membros (avaliadores/hosts) e sinalização de sessão online

**Branch**: `claude/feat-0010-checkin-membros-u259pj` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-checkin-membros/spec.md`

## Summary

Check-in de avaliadores/hosts na edição corrente do processo seletivo, no mesmo molde do
check-in de candidatos já existente (FEAT-0005): estado atual em tabela própria (existência
da linha = presença) + histórico append-only de marcar/desmarcar, resolvendo a edição
corrente via `SelectionProcessRepository.resolveCurrent()` e a lista de quem pode ter
check-in via `EvaluatorsRepository.listWithRole()` (FEAT-0009). Adicionalmente, a listagem
de check-in de **candidatos** já existente passa a expor, por item e em resumo agregado, se
o candidato presente é "online" ou "presencial" — campo derivado em memória a partir de
`applications.saturday_restriction`, sem migration nem coluna nova.

## Technical Context

**Language/Version**: TypeScript (workspaces `api`, `front`, `shared` do monorepo)

**Primary Dependencies**: Hono + `@hono/zod-openapi` (api), D1 (SQL), Next.js 16 + React 19
+ TailwindCSS v4 (front), Zod (contratos em `shared`)

**Storage**: Cloudflare D1 — nova tabela `member_checkins` (estado atual) + `member_checkin_events`
(histórico append-only), mesmo par usado em `candidate_checkins`/`checkin_events` (migration
`0006`). Nenhuma tabela existente muda de shape.

**Testing**: `vitest-pool-workers` em `api/test/` — `<feature>.service.test.ts` +
`<feature>.routes.test.ts` (Princípio V da constituição)

**Target Platform**: Cloudflare Workers (api) + Vercel (front)

**Project Type**: Web application (backend + frontend do monorepo já existente)

**Performance Goals**: sem meta própria — mesma ordem de grandeza do check-in de candidatos
já em produção (lista de dezenas de pessoas, sem paginação necessária: uma edição não passa
de poucas dezenas de avaliadores/hosts).

**Constraints**: Free tier da Cloudflare (Princípio IV) — sem impacto aqui: nenhuma
criptografia, nenhuma fila, nenhum cache novo em KV (a lista de membros não usa o
`CheckinListCache` existente porque não pagina nem tem volume que justifique).

**Scale/Scope**: uma edição do processo seletivo tem dezenas de avaliadores/hosts (mesma
ordem da lista já exibida pela FEAT-0009), não milhares — nenhuma paginação necessária na
listagem de check-in de membros.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (contrato compartilhado)**: novos schemas em `shared/src/schemas/member-checkin.schema.ts`
  (não em `front/`/`api/`); a sinalização online/presencial estende `checkin.schema.ts`
  existente (`CandidateCheckinItemSchema`), reaproveitando os mesmos tipos de request/response
  já usados pelo front. PASS.
- **Princípio II (spec antes de código)**: spec aprovada em `specs/010-checkin-membros/spec.md`
  antes deste plano. PASS.
- **Princípio III (banco insubstituível)**: migration é puramente aditiva — duas tabelas
  novas, nenhuma tabela existente reconstruída ou alterada. Dispensa `MAINTENANCE_MODE`. PASS.
- **Princípio IV (orçamento da plataforma)**: sem CPU-bound novo, sem KV novo, sem fila.
  PASS — nada a justificar em Complexity Tracking.
- **Princípio V (backend novo vem com testes)**: `member-checkin.service.test.ts` e
  `member-checkin.routes.test.ts` cobrindo marcar/desmarcar/idempotência/edição sem
  processo/edição sem atribuição — mesmo padrão de `checkin.routes.test.ts` existente.
  Planejado na Fase de testes do `tasks.md`.

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
specs/010-checkin-membros/
├── plan.md              # Este arquivo
├── data-model.md        # Fase 1
├── contracts/           # Fase 1 — shapes de request/response (schemas Zod)
├── quickstart.md        # Fase 1
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/src/schemas/
├── member-checkin.schema.ts   # NOVO — contrato do check-in de membro
└── checkin.schema.ts          # ALTERADO — acrescenta sinalização online/presencial

api/migrations/
└── 0013-member-checkin.sql    # NOVO — member_checkins + member_checkin_events

api/src/
├── repositories/
│   └── member-checkin.repository.ts   # NOVO — espelha checkin.repository.ts
├── services/
│   ├── member-checkin.service.ts      # NOVO
│   └── checkin.service.ts             # ALTERADO — deriva online/presencial na listagem
└── routes/
    └── member-checkin.routes.ts       # NOVO — GET/PUT/DELETE análogos a checkin.routes.ts

api/test/
├── member-checkin.service.test.ts     # NOVO
└── member-checkin.routes.test.ts      # NOVO

front/app/painel/
└── check-in-membros/           # NOVO — tela de check-in de avaliadores/hosts
    └── page.tsx / *-screen.tsx (padrão das outras telas do painel)

front/app/painel/check-in/       # ALTERADO — exibe rótulo online/presencial e contagem
```

**Structure Decision**: reaproveita a estrutura vertical já usada por toda feature do
monorepo (`shared` → `api/repositories|services|routes` → `front/app/painel/<feature>`),
sem introduzir camada nova. A nova tela de membros fica irmã da de candidatos
(`front/app/painel/check-in/` já existente), não dentro dela — são fluxos, dados e permissões
diferentes (candidato vs. avaliador/host), mesmo que a UI se pareça.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
