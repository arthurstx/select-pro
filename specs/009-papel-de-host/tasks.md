---

description: "Task list for 009 — Papel de host por edição"
---

# Tasks: Papel de host por edição e painel de avaliadores

**Input**: Design documents from `/specs/009-papel-de-host/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/evaluators.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

**Organization**: por user story, ordem `shared/` → `api/` → `front/` dentro de cada fase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (contratos compartilhados)

- [x] T001 Criar `shared/src/schemas/evaluator.schema.ts`: `EvaluatorRoleSchema`, `EvaluatorRoleFilterSchema`, `SetEvaluatorRoleSchema`, `EvaluatorSummarySchema`, `EvaluatorListResponseSchema` (shapes exatos em data-model.md)
- [x] T002 Exportar `evaluator.schema.ts` em `shared/src/index.ts`

**Checkpoint**: `shared` builda sem erro de tipo.

---

## Phase 2: Foundational (bloqueante para as 2 user stories)

- [x] T003 Criar `api/migrations/0010-edition-hosts.sql` — `edition_hosts(id, process_id, user_id, created_at)`, `UNIQUE (process_id, user_id)`, 2 índices (schema exato em data-model.md). Aditiva, sem `MAINTENANCE_MODE`.
- [x] T004 Aplicar a migration localmente
- [x] T005 [P] Criar `api/src/repositories/evaluators.repository.ts`: `listWithRole(processId)` (join `users`+`member_profiles`+`edition_hosts`, exclui `deactivated_at IS NOT NULL` — R5), `markHost(processId, userId)` (`INSERT OR IGNORE`), `unmarkHost(processId, userId)` (`DELETE`)
- [x] T006 [P] Criar `api/src/services/evaluators.service.ts` (esqueleto): injeta `EvaluatorsRepository` + `SelectionProcessRepository` (reaproveitado, não recriado — R3); resolve edição corrente e traduz ausência em `NoActiveSelectionProcessError` (reaproveitado de `checkin-errors.ts`, R3)

**Checkpoint**: migration aplicada, repositório e service compilam. Nenhuma rota ainda expõe isso.

---

## Phase 3: User Story 1 - Admin define quem é host na edição corrente (Priority: P1) 🎯 MVP

**Goal**: `GET /evaluators` lista avaliadores com cargo da edição corrente; `PUT /evaluators/:userId/role` alterna.

**Independent Test**: cenários 1–3 e 5 do quickstart.md — listagem com todos como avaliador por padrão, promover a host, voltar a avaliador, e confirmar que uma edição diferente não é afetada.

### Tests for User Story 1

- [x] T007 [P] [US1] `evaluators.service.test.ts`: `list()` devolve todos como `avaliador` por padrão (FR-004), com `memberStatus` correto por pessoa (FR-002); após `setRole(userId, "host")`, a mesma pessoa aparece como `host`; contas desativadas não aparecem (R5) — `api/test/evaluators.service.test.ts`
- [x] T008 [P] [US1] `evaluators.service.test.ts`: `setRole` é idempotente nos dois sentidos (marcar host quem já é host, avaliador quem já é avaliador, não erra); alternar na edição corrente não altera o cargo gravado numa edição diferente (FR-005) — seed de uma segunda `selection_processes` direto via SQL no teste
- [x] T009 [P] [US1] `evaluators.routes.test.ts`: `GET /evaluators` — 401 sem `Authorization`, 403 com `avaliador`, 200 com admin; `PUT /evaluators/:userId/role` — 401 sem `Authorization`, 403 com `avaliador`, 200 com admin e reflete no `GET` seguinte (FR-007/SC-004, as duas rotas) — `api/test/evaluators.routes.test.ts`
- [x] T010 [US1] FR-008 (`409 NO_ACTIVE_SELECTION_PROCESS`) implementado no `service` para as duas rotas (passo 1 do contrato), sem teste dedicado — `resolveCurrent()` cria a janela sob demanda para qualquer data (mesma limitação de `checkin.routes.ts`/`dashboard.routes.ts`: o guard é defensivo, não coberto por teste em nenhum lugar do projeto sem introduzir mocking)

### Implementation for User Story 1

- [x] T011 [US1] Em `evaluators.service.ts`: `list()` e `setRole(userId, role)` (depende de T005, T006)
- [x] T012 [US1] Criar `api/src/routes/evaluators.routes.ts`: `GET /` e `PUT /{userId}/role`, `[requireAuth, requireRole(ROLES.ADMIN)]` (contrato em contracts/evaluators.md) (depende de T011)
- [x] T013 [US1] Montar `evaluatorsRouter` em `api/src/index.ts` sob `/evaluators`, CORS próprio (GET/PUT) e `maintenanceGuard`
- [x] T014 [US1] [P] Criar `front/lib/evaluators/evaluators-api.ts` — `listEvaluators()`, `setEvaluatorRole(userId, role)` (mesmo padrão de `lib/rooms/rooms-api.ts`)
- [x] T015 [US1] [P] Criar `front/app/painel/avaliadores/page.tsx` — tabela (Nome/E-mail/Situação/Cargo) com controle segmentado avaliador↔host por linha (mockup Stitch "Gestão de Avaliadores") (depende de T014)

**Checkpoint**: US1 funcional e testável isoladamente.

---

## Phase 4: User Story 2 - Admin filtra a lista por cargo (Priority: P2)

**Goal**: `GET /evaluators?role=avaliador|host` filtra a lista.

**Independent Test**: cenário 4 do quickstart.md.

### Tests for User Story 2

- [x] T016 [P] [US2] `evaluators.service.test.ts`: `list("host")` devolve só quem é host; `list("avaliador")` devolve só quem não é; `list("all")`/sem filtro devolve todos
- [x] T017 [P] [US2] `evaluators.routes.test.ts`: `GET /evaluators?role=host` filtra corretamente

### Implementation for User Story 2

- [x] T018 [US2] Em `evaluators.service.ts`: `list(filter)` aplica o filtro em memória sobre o resultado de `listWithRole` (R4) (depende de T011)
- [x] T019 [US2] Query param `role` em `GET /` de `evaluators.routes.ts` (`EvaluatorRoleFilterSchema`, default `"all"`)
- [x] T020 [US2] [P] Chips de filtro por cargo em `front/app/painel/avaliadores/page.tsx` (mesmo padrão de `painel/salas/page.tsx` — chips, não um componente `Tabs` novo)

**Checkpoint**: as 2 user stories funcionam juntas e isoladamente.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T021 [P] Adicionar item "Avaliadores" a `front/components/painel/painel-nav.tsx`
- [x] T022 [P] Rodar o quickstart.md completo (6 cenários) contra `wrangler dev` local
- [ ] T023 Aplicar `0010-edition-hosts.sql` em staging, depois produção (Princípio III) — **pendente, ação de infraestrutura fora do escopo da implementação de código**

---

## Dependencies & Execution Order

- **Setup → Foundational → user stories.**
- **US1 é o MVP real**: listar e alternar cargo já entrega o valor completo da feature. US2 (filtro) é conveniência sobre uma lista que já funciona sem ele.
- US2 estende o mesmo `GET /evaluators` de US1 (T019 depende de T012 existir) — não há paralelismo de arquivo entre as duas stories, mesma situação já observada na feature 011 (Rooms): CRUD pequeno, arquivos compartilhados, sequencial por natureza.

## Implementation Strategy

### MVP First

1. Setup + Foundational
2. US1 → produto mínimo utilizável: admin já consegue promover/rebaixar hosts
3. US2 → conveniência (filtro)
4. Polish → nav, staging, produção
