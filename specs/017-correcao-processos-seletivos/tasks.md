---

description: "Task list for 017 — Correção de processos seletivos"
---

# Tasks: Correção de processos seletivos

**Input**: Design documents from `/specs/017-correcao-processos-seletivos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/selection-processes.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

**Organization**: por user story, ordem `shared/` → `api/` → `front/` dentro de cada fase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (contratos compartilhados)

- [X] T001 Criar `shared/src/schemas/selection-process-admin.schema.ts`: `SelectionProcessAdminSummarySchema` (`id`, `label`, `starts_at`, `ends_at`), `SelectionProcessAdminListResponseSchema`, `SelectionProcessAdminResponseSchema`, `UpdateSelectionProcessAdminSchema` (`label`/`starts_at`/`ends_at` obrigatórios, `.superRefine` recusando `starts_at >= ends_at`), `SelectionProcessAdminErrorCode` (`SELECTION_PROCESS_NOT_FOUND`, `SELECTION_PROCESS_LABEL_ALREADY_EXISTS`) — shapes exatos em `data-model.md`/`contracts/selection-processes.md`
- [X] T002 Exportar `selection-process-admin.schema.ts` em `shared/src/index.ts`

**Checkpoint**: `shared` builda sem erro de tipo.

---

## Phase 2: Foundational (bloqueante para as 2 user stories)

Sem migration — `selection_processes` e `UNIQUE(label)` já existem desde a `0006`
(research.md, Decisão 1).

- [X] T003 [P] Criar `api/src/core/errors/selection-process-errors.ts`: `SelectionProcessLabelAlreadyExistsError` (reaproveita `SelectionProcessNotFoundError` já existente em `core/errors/checkin-errors.ts` — não duplicar)
- [X] T004 Adicionar `update({id, label, starts_at, ends_at})` a `api/src/repositories/selection-process.repository.ts` (`UPDATE ... RETURNING *`, mesmo padrão de `RoomsRepository.update`) — `findById`/`findByLabel`/`listAll` já existem, sem alteração
- [X] T005 Criar `api/src/services/selection-process-admin.service.ts`: `list()` (delega `repository.listAll()`) e `update(id, input)` (`Either`, mesmo padrão de `RoomsService.update` — confere `findByLabel` antes do `UPDATE`, devolve `SelectionProcessLabelAlreadyExistsError` se outro processo já usa o `label`; devolve `SelectionProcessNotFoundError` se `findById` não encontrar; captura `UNIQUE constraint failed` como rede de segurança contra corrida)

**Checkpoint**: repositório e service compilam. Nenhuma rota ainda expõe isso.

---

## Phase 3: User Story 1 - Admin corrige uma edição com dados errados (Priority: P1) 🎯 MVP

**Goal**: `GET /selection-processes` lista as edições e `PUT /selection-processes/:id` corrige
`label`/`starts_at`/`ends_at` de uma delas — entrega o fluxo completo (ver edições → corrigir
uma) numa única tela, já que a US2 (P2) é sobre o mesmo `GET` isolado, sem o qual esta tela
não teria o que mostrar antes de editar.

**Independent Test**: cenários 1, 2, 3, 4 e 5 do `quickstart.md` — listar, corrigir
`starts_at`, recusar `starts_at >= ends_at`, recusar `label` duplicado, recusar `id`
inexistente.

### Tests for User Story 1

- [X] T006 [P] [US1] `selection-process-admin.service.test.ts` — `list()` (ordenação por `starts_at DESC`) e `update()` cobrindo sucesso, `label` duplicado (outro processo), `id` inexistente, corrida de `UNIQUE constraint failed`
- [X] T007 [P] [US1] `selection-process.routes.test.ts` — `GET /` e `PUT /:id` com 401/403/200/400 (`starts_at >= ends_at`, campo ausente)/404/409

### Implementation for User Story 1

- [X] T008 [US1] Criar `api/src/routes/selection-process.routes.ts`: `GET /` e `PUT /{id}`, `[requireAuth, requireRole(ROLES.ADMIN)]`, `validationHook` para 400, `STATUS_BY_ERROR_CODE` mapeando `SELECTION_PROCESS_NOT_FOUND`→404 e `SELECTION_PROCESS_LABEL_ALREADY_EXISTS`→409 (mesmo padrão de `rooms.routes.ts`)
- [X] T009 [US1] Montar `selectionProcessRouter` em `api/src/index.ts` sob `/selection-processes`: bloco de CORS próprio (`allowMethods: ["GET", "PUT", "OPTIONS"]`, mesma allowlist `FRONT_ORIGIN` das demais rotas autenticadas) + `maintenanceGuard` próprio
- [X] T010 [US1] [P] Criar `front/lib/selection-processes/selection-processes-api.ts`: `listSelectionProcesses()`, `updateSelectionProcess(id, input)` (mesmo padrão de `front/lib/rooms/rooms-api.ts`)
- [X] T011 [US1] [P] Criar `front/app/painel/processos/page.tsx`: tabela com todas as edições (`label`, `starts_at`, `ends_at`) + ação "editar" que abre um formulário (`Sheet` ou inline, mesmo padrão de `salas/page.tsx`) pré-preenchido com os três campos, `react-hook-form` + `@hookform/resolvers/zod` consumindo `UpdateSelectionProcessAdminSchema` direto de `shared`. Campos de data como texto livre (não `<input type="date">`) — `ends_at` pode conter horário (`AAAA-MM-DD HH:MM:SS`), formato que o input nativo de data não aceita.

**Checkpoint**: US1 funcional e testável isoladamente — a tela entrega listar + corrigir de
ponta a ponta.

---

## Phase 4: User Story 2 - Admin visualiza todas as edições existentes (Priority: P2)

**Goal**: garantir que `GET /selection-processes` (já implementado na US1, pois a tela de
edição depende dele) tem cobertura de teste dedicada e comportamento correto como
funcionalidade independente — não é preciso editar nada para ter valor.

**Independent Test**: cenário 1 do `quickstart.md` isolado — abrir a tela sem editar nada e
conferir que todas as edições aparecem, da mais recente para a mais antiga.

### Tests for User Story 2

- [X] T012 [P] [US2] `selection-process-admin.service.test.ts` — `list()` com 3+ edições cadastradas, confirmando ordenação por `starts_at DESC`. Já coberto pelo teste `"devolve todos os processos, ordenados por starts_at DESC"` escrito em T006 (usa 3 processos — velho/intermediário/novo), sem duplicar.

### Implementation for User Story 2

Nenhuma — `GET /selection-processes` e a tabela do front já foram entregues na US1 (T008,
T011), porque a US1 depende da listagem para funcionar. Esta fase existe para deixar
explícito, e testado à parte, que a listagem por si só (sem nenhuma edição) já é a entrega da
US2.

**Checkpoint**: US1 e US2 funcionam juntas e isoladamente (US2 é, na prática, um subconjunto
já coberto pela US1).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 [P] Item "Processos seletivos" em `front/components/painel/painel-nav.tsx` (`CalendarCogIcon`)
- [X] T014 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; `npm run build --workspace=front` gerou `/painel/processos` sem erro; 451/451 testes `api` (14 novos desta feature) + 20/20 `shared` passando
- [X] T015 Cenários do `quickstart.md` conferidos: 1 (listar) — `GET /selection-processes (HTTP) > 200`; 2 (corrigir `starts_at`) — `PUT ... > 200 com admin, starts_at corrigido`; 3 (`starts_at >= ends_at`) — `FR-003 - 400`; 4 (`label` duplicado) — `FR-004 - 409`; 5 (`id` inexistente) — `FR-005 - 404`; 6 (edição não afeta vínculos) — não tem teste dedicado, mas é garantido por construção: `repository.update()` (T004) só altera `label`/`starts_at`/`ends_at` da própria linha por `id`, nenhuma FK aponta para esses campos (data-model.md) — não há cascata possível de existir

**Checkpoint final**: T001–T014 completos, T015 confirma cobertura ponta a ponta. Deploy
(staging/produção) fica fora deste tasks.md — é puramente aditivo no banco (sem migration) e
segue o fluxo normal de push já documentado em `CONTEXT.md`.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 é o MVP real desta feature**: listar e corrigir juntos, numa tela só, é o que resolve
  o problema relatado (SQL manual para corrigir erro pontual). US2 não introduz rota nem tela
  nova — é a mesma listagem da US1, isolada para garantir que "só ver, sem editar" também tem
  cobertura própria (Independent Test da spec).
- T009 (montar o router) depende de T008 (rotas) existir; T011 (tela) depende de T010 (client
  de API) para não inventar `fetch` solto na página, mesmo padrão de `salas`.

## Implementation Strategy

### MVP First

1. Setup + Foundational
2. US1 → **já é o produto mínimo utilizável**: ver as edições e corrigir uma
3. US2 → formaliza/testa a listagem isolada (sem código novo além do teste)
4. Polish → nav, verificação de build/testes, checklist do quickstart
