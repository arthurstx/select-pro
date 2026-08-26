# Implementation Plan: Organização automática de grupos

**Branch**: `claude/feat-0012-organizacao-grupos` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-organizacao-grupos/spec.md`

## Summary

Um admin aciona a organização automática dos grupos da edição corrente: o sistema distribui
os candidatos presentes (check-in feito, FEAT-0005) entre grupos presenciais (vinculados a
salas cadastradas, FEAT-0011, respeitando D5) e grupos online (sem sala, separados dos
presenciais, FR-003), sempre respeitando D1 (nunca um grupo com exatamente 1 mulher). Aloca
avaliadores/hosts com check-in de membro feito (FEAT-0010) aos grupos presenciais, e permite
ajuste manual pós-organização (mover candidato/avaliador entre grupos). `groups`,
`group_evaluators`, `group_candidates` — órfãs desde a `0001-schema.sql` — passam a ser
usadas pela primeira vez; a abordagem técnica está em `research.md`.

## Technical Context

**Language/Version**: TypeScript (mesmas versões já fixadas no monorepo — `api`: Cloudflare
Workers runtime; `front`: Next.js 16/React 19; `shared`: TS puro).

**Primary Dependencies**: Hono + `@hono/zod-openapi` (api), Zod (shared), TanStack Query
(front) — nenhuma dependência nova.

**Storage**: Cloudflare D1 — migration `0014-group-organization.sql` (ver data-model.md).

**Testing**: `vitest-pool-workers` (api, `<feature>.service.test.ts` +
`<feature>.routes.test.ts`, Princípio V) + `node:test` para lógica pura do front
(`reconcile`-like helpers, se houver).

**Target Platform**: Cloudflare Workers (api) / Vercel (front).

**Project Type**: web application (monorepo `front/` + `api/` + `shared/`).

**Performance Goals**: sem alvo numérico dedicado — volume é dezenas de candidatos/edição
(mesmo racional de escala já usado em FEAT-0010, que dispensou paginação).

**Constraints**: orçamento de CPU do Worker (Princípio IV) — o algoritmo é O(n) sobre
candidatos/avaliadores/salas de uma edição (dezenas), não há operação custosa (sem
criptografia, sem loop combinatório); risco de estourar 10 ms é desprezível.

**Scale/Scope**: uma edição por vez, dezenas de candidatos e de avaliadores/hosts, poucas
salas (unidades). 4 rotas HTTP novas, 1 migration, 1 tela nova de front.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Contrato Compartilhado**: `shared/src/schemas/group.schema.ts` novo é a única fonte
  dos shapes de request/response — `api/` e `front/` importam de lá. ✅ Planejado.
- **II. Spec Antes de Código**: spec em `specs/012-organizacao-grupos/spec.md`, aprovada
  pelo usuário antes deste plan. ✅
- **III. O Banco É Insubstituível**: migration `0014` reconstrói 3 tabelas vazias e órfãs,
  sem filhos com dados (nenhum `INSERT` jamais rodou contra elas em nenhum ambiente
  conhecido). Puramente aditiva em efeito (dispensa `MAINTENANCE_MODE`), mas a task de
  implementação inclui checar staging/produção antes de aplicar lá — ver research.md
  D-tech1. ✅ Planejado, com verificação explícita nas tasks.
- **IV. Orçamento da Plataforma**: sem operação custosa (ver Constraints acima). ✅
- **V. Backend Novo Vem Com Testes**: `group.service.test.ts` + `group.routes.test.ts`
  planejados nas tasks, cobrindo D1, D5, separação de modalidade, reorganização e os 3
  ajustes manuais (mover candidato/avaliador, bloqueio de modalidade cruzada). ✅ Planejado.

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
specs/012-organizacao-grupos/
├── plan.md              # este arquivo
├── research.md          # decisões técnicas D-tech1..D-tech6
├── data-model.md         # schema da migration 0014 + entidades + fluxo do algoritmo
├── quickstart.md        # 9 cenários de validação manual
├── contracts/
│   └── group-api.md     # 4 rotas HTTP
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/
└── group.schema.ts                       # NOVO — contratos desta feature

api/
├── migrations/
│   └── 0014-group-organization.sql       # NOVO
├── src/
│   ├── core/errors/
│   │   └── group-errors.ts               # NOVO — NoCandidatesPresentError, NoRoomsAvailableError, etc.
│   ├── repositories/
│   │   └── group.repository.ts           # NOVO — leitura de presentes + escrita transacional da organização
│   ├── services/
│   │   ├── group-organization.ts         # NOVO — algoritmo puro (D1/D5), sem I/O — testável isolado
│   │   └── group.service.ts              # NOVO — orquestra repository + algoritmo, monta DTOs
│   ├── routes/
│   │   └── group.routes.ts               # NOVO — 4 rotas, admin-only
│   └── index.ts                          # app.route("/groups", groupRouter)
└── test/
    ├── group-organization.test.ts        # NOVO — algoritmo puro (D1/D5), unit, sem D1 real
    ├── group.service.test.ts             # NOVO — service com D1 real (vitest-pool-workers)
    └── group.routes.test.ts              # NOVO — contrato HTTP

front/
├── lib/group/
│   ├── api.ts                            # NOVO — organizeGroups, listGroups, moveCandidate, moveEvaluator
│   └── queries.ts                        # NOVO — TanStack Query, mesmo padrão de lib/member-checkin/
└── app/painel/grupos/
    ├── page.tsx                          # NOVO — botão "organizar grupos" + visualização
    └── _components/
        ├── group-card.tsx                # NOVO — um grupo (candidatos, avaliadores, sala/online)
        └── organize-button.tsx           # NOVO — aciona POST /groups/organize, trata os 3 erros 409
```

**Structure Decision**: segue exatamente o padrão já estabelecido pela FEAT-0010
(`member-checkin.*` em cada workspace) — schema único em `shared`, `repository` +
`service` + `routes` em `api`, `lib/<feature>/{api,queries}.ts` + `app/painel/<feature>/`
em `front`. Única adição de estrutura é `group-organization.ts` separado de `group.service.ts`
dentro de `api/`: o algoritmo (D1/D5) é lógica pura, sem D1/HTTP, isolada para ser testada
como unidade sem `vitest-pool-workers` — nenhuma feature anterior precisou disso porque
nenhuma tinha um algoritmo não-trivial (o resto do projeto é CRUD/consulta).

## Complexity Tracking

*(vazio — nenhuma violação de constituição a justificar)*
