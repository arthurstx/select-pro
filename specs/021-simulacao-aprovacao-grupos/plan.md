# Implementation Plan: Simulação com aprovação, limpar organização e badges

**Branch**: `021-simulacao-aprovacao-grupos` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-simulacao-aprovacao-grupos/spec.md`

## Summary

Reformula o fluxo de organização presencial: "Simular grupos" vira um modal com prévia REAL
(nomes, não só números), configurável (escolher avaliadores, promover a host) e só persiste
quando aprovada explicitamente. "Organizar grupos" (ação direta) deixa de existir. "Limpar
organização" some com a organização presencial. Hosts passam a ser atribuídos de verdade a uma
sala (reaproveitando `group_evaluators`, sem tabela nova). `gender`/`memberStatus` passam a
sair em `GET /groups` pra alimentar os badges pedidos (US3/US4) — seguro porque `/groups` já é
inteiramente admin-only.

## Technical Context

**Language/Version**: TypeScript 5.x

**Primary Dependencies**: Hono + `@hono/zod-openapi` (2 rotas novas, 1 rota com body novo),
shadcn `dialog` (novo, via CLI — ver research.md Decisão 7)

**Storage**: Cloudflare D1 — sem migration; muda a composição de `group_evaluators` (host por
sala, não mais nunca) e o corpo aceito por `replaceOrganization`-consumers

**Testing**: Vitest — `group-organization.test.ts` (distribuição de host por sala),
`group.service.test.ts`/`group.routes.test.ts` (preview/clear/evaluatorUserIds/gender/
memberStatus)

**Target Platform**: Cloudflare Workers (api), Next.js 16 / Vercel (front)

**Project Type**: web application (monorepo)

**Performance Goals**: nenhuma nova

**Constraints**: 10 ms CPU/invocação — sem risco, mesma classe de operação da FEAT-0012/0020

**Scale/Scope**: `GroupCandidateSchema`/`GroupEvaluatorSchema` ganham campo; 3 schemas novos
(`AvailableEvaluatorSchema`, `PreviewPresencialResponseSchema`,
`OrganizePresencialBodySchema`); `group-organization.ts` ganha `distributeHostsToRooms`;
`GroupService` ganha `previewPresencial`/`clearPresencialOrganization`, `organizePresencial`
aceita `evaluatorUserIds?`; 2 rotas novas + 1 estendida; front: modal novo substitui o botão
direto de organizar, botão "Limpar organização", badges de sexo/trainee no `GroupCard`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Contrato compartilhado | ✅ Schemas novos/estendidos em `shared`; preview e organize usam o MESMO body (`OrganizePresencialBodySchema`) — sem duplicar forma de request entre os dois. |
| II. Spec antes de código | ✅ `spec.md` aprovada (pedido do usuário já detalhado) antes deste plan. |
| III. Banco insubstituível | ✅ Sem migration — reaproveita `group_evaluators` e `replaceOrganization` já existentes. |
| IV. Orçamento de plataforma | ✅ Sem operação de CPU nova; preview é leitura + cálculo puro, mesma classe do organize real. |
| V. Backend com testes | ✅ Testes novos/atualizados cobrindo host-por-sala, preview, clear, `evaluatorUserIds`. |

Nenhuma violação. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/021-simulacao-aprovacao-grupos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/preview-approve-clear.md
└── tasks.md              # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
shared/src/schemas/group.schema.ts
  # GroupCandidateSchema += gender; GroupEvaluatorSchema += memberStatus
  # + AvailableEvaluatorSchema, PreviewPresencialResponseSchema, OrganizePresencialBodySchema

api/src/repositories/group.repository.ts
  # listPresentMembers: + memberStatus (JOIN member_profiles, mesmo padrão de evaluators.repository.ts)
  # listPresentCandidates: já tem gender internamente (usado por distributeByGender) — só
  # precisa aparecer no DTO de saída também

api/src/services/group-organization.ts
  # distributeHostsToRooms(hosts, roomAssignments) — NOVO
  # organizePresencialGroups: parâmetro `avaliadores` já existente + novo `hosts`; monta
  # evaluatorUserIds = [...avaliadoresDoGrupo, ...hostsDaSala]

api/src/services/group.service.ts
  # organizePresencial(evaluatorUserIds?, now?) — filtra avaliadores antes de chamar o algoritmo
  # previewPresencial(evaluatorUserIds?, now?) — NOVO, mesmo cálculo sem replaceOrganization
  # clearPresencialOrganization(now?) — NOVO, replaceOrganization(..., "presencial", [])

api/src/routes/group.routes.ts
  # POST /organize/presencial — body opcional
  # POST /preview/presencial — NOVO
  # DELETE /presencial — NOVO

api/src/index.ts
  # CORS de /groups/* já tem DELETE; confirmar que cobre o novo path (mesmo prefixo)

api/test/
  ├── group-organization.test.ts   # + distributeHostsToRooms, host por sala replicado
  ├── group.service.test.ts        # + previewPresencial, clearPresencialOrganization, evaluatorUserIds
  └── group.routes.test.ts         # + as 2 rotas novas + body novo na existente

front/components/ui/dialog.tsx     # NOVO — via shadcn CLI

front/app/painel/grupos/_components/
  ├── clear-organization-button.tsx    # NOVO — destrutivo, confirm()
  ├── simulate-organize-modal.tsx      # NOVO — substitui simulate-button.tsx + organize direto
  ├── group-card.tsx                    # + badge de sexo (candidatos), nome vermelho (trainee)
  └── groups-view.tsx                   # troca OrganizeButton+SimulateButton (presencial) por
                                          # ClearOrganizationButton + SimulateOrganizeModal

front/lib/group/api.ts / queries.ts
  # + previewPresencial(evaluatorUserIds?), clearPresencialOrganization(),
  # organizePresencial(evaluatorUserIds?) — assinatura estendida
```

**Structure Decision**: reaproveita a Arquitetura em Camadas já estabelecida — o `preview`
literalmente compartilha o algoritmo puro com o `organize` real, só divergindo no último passo
(persistir ou não). Front concentra a mudança visual grande num componente novo
(`simulate-organize-modal.tsx`), sem reescrever `groups-view.tsx`/`group-card.tsx` além do
necessário pros badges.

## Complexity Tracking

*Vazio — nenhuma violação de princípio a justificar.*
