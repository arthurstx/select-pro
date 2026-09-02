# Implementation Plan: Filtro por Curso nas Listagens de Candidatos

**Branch**: `feat/filtro-por-curso` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-filtro-por-curso/spec.md`

## Summary

Adicionar um filtro por curso (`course`, valor único do enum já existente em
`CourseSchema`) às duas telas que listam candidatos — check-in
(`GET /candidates`) e dashboard (`GET /dashboard/candidates`) — usando o mesmo
nome de parâmetro de query e o mesmo componente visual de filtro nas duas
telas. Sem migration: `course` já existe em `candidates`; a mudança é um
`WHERE course = ?` opcional nas queries de listagem já existentes, seguindo o
padrão `conditions[]`/`bindings[]` já usado em `checkin.repository.ts` e
`dashboard.repository.ts`.

## Technical Context

**Language/Version**: TypeScript (Node 22, conforme `engines` do monorepo)

**Primary Dependencies**: Hono + `@hono/zod-openapi` (api), Next.js 16 + React 19 + TanStack Query v5 (front), Zod (shared)

**Storage**: Cloudflare D1 (SQLite) — coluna `course` já existe em `candidates`, sem `CHECK` (validação só no Zod). Sem migration.

**Testing**: Vitest + `vitest-pool-workers` (`api/test/*.service.test.ts`, `*.routes.test.ts`); `tsc --noEmit` e `next build` no front (sem suíte de componente hoje nas telas afetadas)

**Target Platform**: Cloudflare Workers (api) + Vercel (front)

**Project Type**: Web application (monorepo: `front/` + `api/` + `shared/`)

**Performance Goals**: Sem meta nova além do já exigido pelas rotas existentes — filtro adicional é uma cláusula `WHERE` indexável (comparação de igualdade em coluna de baixa cardinalidade), custo desprezível frente ao que já roda.

**Constraints**: Orçamento de 10ms de CPU por invocação no Worker (Free tier) — um `WHERE course = ?` a mais não aproxima desse teto (mesma ordem de grandeza dos filtros de `search`/`status`/`from`/`to` já existentes). Cache em KV (`CheckinListCache`, `DashboardCache`) precisa incluir `course` na chave de variante para não servir lista errada.

**Scale/Scope**: 2 rotas GET alteradas (`api/src/routes/checkin.routes.ts`, `api/src/routes/dashboard.routes.ts`), 2 schemas Zod estendidos, 2 repositórios com mais uma condição de `WHERE`, 1 componente de filtro novo compartilhado no front, 2 telas consumindo o componente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Contrato Compartilhado**: PASS. O parâmetro `course` é adicionado a `ListCandidatesQuerySchema` e `DashboardCandidatesQuerySchema`, ambos em `shared/src/schemas/`, reutilizando `CourseSchema` já existente — sem novo enum, sem duplicação de validação no front ou na api.
- **II. Spec Antes de Código**: PASS. Esta feature muda o contrato de duas rotas GET existentes (novo query param) — spec em `specs/012-filtro-por-curso/spec.md` escrita e validada antes deste plano.
- **III. O Banco É Insubstituível**: PASS / N/A. Sem migration — `course` já existe em `candidates` e não muda de shape. Nenhuma reconstrução de tabela, nenhuma janela de manutenção necessária.
- **IV. Orçamento da Plataforma**: PASS. Filtro adicional é uma comparação de igualdade simples somada a condições já existentes na mesma query — não introduz criptografia, loop, nem chamada de rede extra. As duas camadas de cache em KV (`CheckinListCache`, `DashboardCache`) precisam incorporar `course` na chave de variante (mesmo padrão que `status`/`search` já seguem) para não estourar o TTL mínimo de 60s servindo resultado do curso errado — tratado no data-model/tasks, não é violação, é extensão do padrão existente.
- **V. Backend Novo Vem Com Testes**: PASS (aplicável por extensão). Não é rota nova, mas é mudança de contrato de rota existente — os testes de `checkin.routes.test.ts`/`checkin.service.test.ts` e `dashboard.routes.test.ts`/`dashboard.service.test.ts` (ou repositório, conforme já organizado) precisam cobrir o novo filtro e o caso de valor inválido (400).

Nenhuma violação. Nada a registrar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/012-filtro-por-curso/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/            # Fase 1 — contratos de query/response afetados
└── tasks.md              # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/src/schemas/
├── checkin.schema.ts        # ListCandidatesQuerySchema ganha `course` opcional
└── dashboard.schema.ts      # DashboardCandidatesQuerySchema ganha `course` opcional

api/src/
├── routes/
│   ├── checkin.routes.ts        # (sem mudança de lógica — schema já valida via ListCandidatesQuerySchema)
│   └── dashboard.routes.ts      # (idem, via DashboardCandidatesQuerySchema)
├── services/
│   ├── checkin.service.ts       # repassa `course` para o repositório e para a chave de cache
│   └── dashboard.service.ts     # repassa `course` para o repositório
├── repositories/
│   ├── checkin.repository.ts    # ListCandidatesParams ganha `course`; nova condição WHERE
│   └── dashboard.repository.ts  # ListCandidatesFilters ganha `course`; nova condição WHERE
└── lib/
    └── checkin-list-cache.ts    # CachedListParams ganha `course` (entra na chave)
    # dashboard-cache.ts não muda: é genérico (get/set por chave arbitrária) —
    # quem monta a chave é DashboardService.listCandidates, que ganha `course`
    # no array de `keyFor(...)`.

front/
├── components/
│   └── painel/
│       └── course-filter.tsx    # NOVO — componente único de filtro por curso, reutilizado nas duas telas
└── app/painel/
    ├── check-in/
    │   ├── page.tsx                          # estado `course` no filtro; passa para useCandidatesQuery
    │   └── _components/filters-bar.tsx       # ganha o CourseFilter ao lado dos chips de status
    └── dashboard-screen.tsx                  # estado `course` no filtro; passa para useDashboardCandidatesQuery; usa CourseFilter

api/test/
├── checkin.service.test.ts    # +casos de filtro por curso
├── checkin.routes.test.ts     # +caso 400 para curso inválido
├── dashboard.service.test.ts  # +casos de filtro por curso
└── dashboard.routes.test.ts   # +caso 400 para curso inválido
```

**Structure Decision**: Monorepo existente (Opção 2 — web application com front/api/shared). Nenhum diretório novo de alto nível; a única adição estrutural é `front/components/painel/course-filter.tsx`, ao lado dos demais componentes de `/painel` já compartilhados entre rotas (`painel-nav.tsx`, `painel-sidebar.tsx` etc.) — é o primeiro componente de filtro de candidato usado por mais de uma tela, então não cabe em nenhum `_components/` colocalizado por rota (check-in ou dashboard).

## Complexity Tracking

*Sem violações — seção não aplicável.*
