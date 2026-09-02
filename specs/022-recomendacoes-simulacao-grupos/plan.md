# Implementation Plan: Recomendações e Simulação de Grupos (Presencial + Online)

**Branch**: `022-recomendacoes-simulacao-grupos` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-recomendacoes-simulacao-grupos/spec.md`

## Summary

Enriquecer o modal de simulação presencial (FEAT-0021) com diagnóstico de déficit de host
(US1), classificação de desvio do ideal por grupo/sala (US2) e um painel de cenários de
referência (US3) — tudo calculado no front reaproveitando as funções puras já existentes em
`shared` mais duas novas (`classifyPresencialGroup`, `calculateHostDeficit`), sem tocar no
algoritmo real de organização presencial. E trazer o mesmo conceito de simular-antes-de-aplicar
para o online (US4): novo `POST /groups/preview/online`, `organizeOnlineGroups` reescrito para
usar a mesma faixa ideal (via `derivePresencialGroupCount`, sem mudança de comportamento
necessária — ver `research.md` D1), e um modal `SimulateOnlineOrganizeModal` espelhando o
presencial, sem seção de avaliador (atribuição continua manual, coexistindo com o self-service
já existente).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js via npm workspaces

**Primary Dependencies**: Hono + `@hono/zod-openapi` (api), Next.js 16 + React 19 +
`@tanstack/react-query` (front), Zod (shared)

**Storage**: Cloudflare D1 (SQLite) — nenhuma migration nesta feature; só `SELECT` adicional
sobre `rooms.size`, já existente desde a FEAT-0011

**Testing**: `vitest` + `@cloudflare/vitest-pool-workers` (`api/`), `node:test` (`shared/`) —
sem suíte de UI automatizada no `front/` (verificação manual via `quickstart.md`)

**Target Platform**: Cloudflare Workers (api), Vercel (front)

**Project Type**: web application (monorepo: `front/` + `api/` + `shared/`)

**Performance Goals**: sem requisito novo — todo cálculo novo é aritmética simples sobre
listas de dezenas de itens (grupos/salas/avaliadores por edição), muito abaixo do teto de 10ms
de CPU do Worker (Constituição IV)

**Constraints**: nenhuma migration destrutiva (Constituição III não se aplica), nenhuma rota
nova em `/auth/*` (WAF rate limit não entra em jogo), nenhum cache KV novo (sem TTL a
considerar)

**Scale/Scope**: mesma escala das features anteriores de grupos — dezenas de candidatos/grupos/
salas por edição, não milhares

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Contrato Compartilhado**: `room.size` entra em `GroupSummarySchema` (shared); novo
  `PreviewOnlineResponseSchema` (shared). Nenhum DTO local em `front/`/`api/`. ✅
- **II. Spec Antes de Código**: spec em `specs/022-recomendacoes-simulacao-grupos/spec.md`,
  já revisada (decisões de escopo confirmadas antes do `/speckit-specify`). ✅
- **III. O Banco É Insubstituível**: sem migration — `rooms.size` já existe, só passa a ser
  selecionado/exposto. Gate não se aplica. ✅
- **IV. Orçamento da Plataforma**: nenhum cálculo novo se aproxima do teto de CPU (aritmética
  sobre listas pequenas, mesmo padrão das funções já existentes em `room.schema.ts`); nenhuma
  rota `/auth/*` nova; nenhum KV novo. ✅
- **V. Backend Novo Vem Com Testes**: `POST /groups/preview/online` (rota nova) e
  `GroupService.previewOnline` (service novo) recebem `group.routes.test.ts` +
  `group.service.test.ts`, mesmo padrão já usado por `previewPresencial`. `organizeOnlineGroups`
  reescrito recebe cobertura em `group-organization.test.ts`. ✅

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
specs/022-recomendacoes-simulacao-grupos/
├── plan.md              # Este arquivo
├── research.md          # Decisões D1-D9
├── data-model.md        # Contrato GroupSummary.room.size + PreviewOnlineResponse
├── contracts/
│   ├── group-summary-room-size.md
│   └── preview-online.md
├── quickstart.md
└── tasks.md              # /speckit-tasks (próximo passo)
```

### Source Code (repository root)

```text
shared/src/schemas/
├── group.schema.ts        # GroupSummarySchema.room ganha size; novo PreviewOnlineResponseSchema
└── room.schema.ts          # + classifyPresencialGroup, calculateHostDeficit

shared/test/
└── room.schema.test.ts     # testes das duas funções novas + derivePresencialGroupCount sem maxGroups (uso online)

api/src/repositories/
└── group.repository.ts     # GroupRow.room_size; 5 queries passam a SELECT r.size AS room_size

api/src/services/
├── group-organization.ts   # organizeOnlineGroups(candidates) — remove `rooms`, averageRoomGroupSize, FALLBACK_ONLINE_GROUP_SIZE
└── group.service.ts        # novo previewOnline(); toSummary/toPreviewSummary passam room.size adiante

api/src/routes/
└── group.routes.ts         # nova rota POST /groups/preview/online

api/test/
├── group-organization.test.ts
├── group.service.test.ts
└── group.routes.test.ts

front/app/painel/grupos/_components/
├── simulate-organize-modal.tsx        # + diagnóstico de host, desvio do ideal, painel de cenários
├── simulate-online-organize-modal.tsx # NOVO — mesmo padrão, sem seção de avaliador
└── groups-view.tsx                    # modality "online" passa a renderizar o novo modal também

front/lib/group/
├── api.ts        # previewOnline()
└── queries.ts     # usePreviewOnlineMutation()
```

**Structure Decision**: segue exatamente a divisão de camadas já usada pela FEAT-0021
(`shared` → `api` repository/service/route → `front` lib/queries → `front` componente) — nenhum
diretório novo, só arquivos novos dentro da estrutura de `grupos` já existente.

## Complexity Tracking

*Sem violações de princípio nesta feature — seção vazia.*
