---

description: "Task list template for feature implementation"
---

# Tasks: Check-in de membros (avaliadores/hosts) e sinalização de sessão online

**Input**: Design documents from `/specs/010-checkin-membros/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Princípio V da constituição exige teste de service + rota para todo backend novo
— incluídos abaixo, não opcionais nesta feature.

**Organization**: Tasks agrupadas por user story (US1/US2 = check-in de membros, US3 =
sinalização online/presencial do candidato), na ordem de prioridade da spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2 ou US3 (mapeado da spec.md)

## Path Conventions

Monorepo já existente: `shared/src/schemas/`, `api/src/{repositories,services,routes}/`,
`api/test/`, `api/migrations/`, `front/app/painel/`.

---

## Phase 1: Setup

**Purpose**: contrato compartilhado antes de qualquer código de `api`/`front` (Princípio I).

- [ ] T001 Criar `shared/src/schemas/member-checkin.schema.ts` com `MemberCheckinItemSchema`,
      `MemberCheckinListResponseSchema` (com `summary: {total, checkedIn}`),
      `MemberCheckinResponseSchema` e `MemberCheckinErrorCode` (`NO_EVALUATORS_IN_EDITION`),
      reaproveitando `EvaluatorRoleSchema` de `evaluator.schema.ts` e
      `SelectionProcessSummarySchema` de `checkin.schema.ts` — ver contracts/member-checkin-api.md
- [ ] T002 [P] Alterar `shared/src/schemas/checkin.schema.ts`: acrescentar `attendance: z.enum(["online", "presencial"]).nullable()`
      em `CandidateCheckinItemSchema` e `attendanceSummary: z.object({ online: z.number().int(), presencial: z.number().int() })`
      em `ListCandidatesResponseSchema.data` — ver contracts/member-checkin-api.md (seção "alteração em GET /candidates")
- [ ] T003 Exportar os novos schemas/tipos em `shared/src/index.ts`
- [ ] T004 Rodar `npm run build --workspace=shared` (ou `tsc`) para confirmar que os novos
      tipos compilam antes de consumi-los em `api`/`front`

**Checkpoint**: contrato pronto e publicado no workspace `shared` — `api`/`front` já podem importar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema de banco que toda user story de check-in de membro depende.

**⚠️ CRITICAL**: nenhuma rota/service de membro roda sem esta migration.

- [ ] T005 Criar `api/migrations/0013-member-checkin.sql` com `member_checkins` e
      `member_checkin_events` (espelhando `0006-candidate-checkin.sql`) + índices
      `idx_member_checkins_process`, `idx_member_checkin_events_process`,
      `idx_member_checkin_events_user` — ver data-model.md. Migration puramente aditiva,
      sem `MAINTENANCE_MODE` (Constitution Check do plan.md)
- [ ] T006 Aplicar a migration localmente (`wrangler d1 migrations apply <DB> --local`,
      conferir comando exato em `api/package.json`/README) e confirmar que
      `npm run dev --workspace=api` sobe sem erro de schema

**Checkpoint**: banco pronto — US1/US2 podem começar.

---

## Phase 3: User Story 1 - Admin faz check-in de quem vai avaliar no dia (Priority: P1) 🎯 MVP

**Goal**: admin vê a lista de avaliadores/hosts da edição corrente e marca/desmarca presença,
com histórico preservado.

**Independent Test**: com edição corrente e avaliadores/hosts atribuídos (FEAT-0009), marcar
o check-in de um deles via API e confirmar que a lista reflete a mudança com horário —
Cenários 1–7 de quickstart.md.

### Tests for User Story 1 ⚠️

> Escrever antes da implementação, confirmar que falham primeiro (Princípio V).

- [ ] T007 [P] [US1] `api/test/member-checkin.service.test.ts`: marcar, desmarcar,
      idempotência de marcar (sem 2º evento), idempotência de desmarcar (no-op),
      `NO_ACTIVE_SELECTION_PROCESS`, `NO_EVALUATORS_IN_EDITION`, `EVALUATOR_NOT_FOUND`
      (`userId` que não é avaliador/host ativo da edição corrente)
- [ ] T008 [P] [US1] `api/test/member-checkin.routes.test.ts`: contrato HTTP de
      `GET/PUT/DELETE /member-checkins`, status codes e shapes de erro, `403` para papel
      `avaliador` (FR-007), `testEnv()` fixando o que os testes de `checkin.routes.test.ts`
      já fixam

### Implementation for User Story 1

- [ ] T009 [US1] Criar `api/src/repositories/member-checkin.repository.ts`: `listWithCheckin(processId)`
      (join `EvaluatorsRepository`-like + `member_checkins`), `upsertCheckin`/`removeCheckin`
      com o mesmo padrão de `db.batch` + `WHERE changes() > 0` de `checkin.repository.ts`,
      `findCheckin(userId, processId)` — reaproveita `EvaluatorsRepository.listWithRole`
      para achar quem é elegível (research.md D2)
- [ ] T010 [US1] Criar `api/src/services/member-checkin.service.ts`: `listMemberCheckins`
      (resolve edição corrente via `SelectionProcessRepository.resolveCurrent()`, retorna
      `NO_ACTIVE_SELECTION_PROCESS` ou `NO_EVALUATORS_IN_EDITION` conforme o caso, monta
      `summary`), `markPresent(userId, actorId)`, `unmarkPresent(userId, actorId)` —
      `Either`/tratamento de erro no mesmo estilo de `checkin.service.ts`
- [ ] T011 [US1] Criar `api/src/routes/member-checkin.routes.ts`: `GET /`, `PUT /{id}/checkin`,
      `DELETE /{id}/checkin`, `AUTHORIZED = [requireAuth, requireRole(ROLES.ADMIN)]`
      (research.md D5) — mesmo formato `createRoute` de `checkin.routes.ts`
- [ ] T012 [US1] Montar `memberCheckinRouter` em `api/src/index.ts` (mesmo padrão aditivo
      já usado para os demais roteadores — ver nota do CONTEXT.md sobre merges aditivos)
- [ ] T013 [US1] Rodar `npm run test --workspace=api` e confirmar T007/T008 verdes

**Checkpoint**: check-in de membros funcional ponta a ponta via API (Cenários 1–7 de quickstart.md).

---

## Phase 4: User Story 2 - Admin enxerga quantas pessoas já chegaram (Priority: P2)

**Goal**: resumo "X de Y" visível junto da lista de check-in de membros.

**Independent Test**: com N avaliadores/hosts e M com check-in feito, `GET /member-checkins`
devolve `summary.total = N` e `summary.checkedIn = M`, e o resumo muda ao marcar mais um.

**Nota**: `summary` já é calculado dentro de `listMemberCheckins` (T010) — esta fase cobre a
tela; o contrato e o cálculo já existem desde a US1 por serem parte da mesma resposta.

### Implementation for User Story 2

- [ ] T014 [US2] Criar `front/app/painel/check-in-membros/_lib/api.ts`: client fetch para
      `GET/PUT/DELETE /member-checkins` usando os tipos de `shared` (T001)
- [ ] T015 [P] [US2] Criar `front/app/painel/check-in-membros/_components/member-row.tsx`:
      linha da lista com nome, cargo (avaliador/host), estado de presença e ação de
      marcar/desmarcar — reaproveita padrões visuais de `check-in/_components/candidate-row.tsx`
- [ ] T016 [P] [US2] Criar `front/app/painel/check-in-membros/_components/summary-bar.tsx`:
      "X de Y presentes" a partir de `summary` (FR-006)
- [ ] T017 [US2] Criar `front/app/painel/check-in-membros/page.tsx`: compõe `member-row.tsx` +
      `summary-bar.tsx`, estados de "sem processo corrente" (FR-008) e "edição sem
      avaliador/host atribuído" (FR-009) reaproveitando `state-message.tsx` existente
      (`front/app/painel/_components/state-message.tsx`), com mensagens distintas para os
      dois casos (Edge Cases da spec)
- [ ] T018 [US2] Adicionar item "Check-in de membros" em `front/components/painel/painel-nav.tsx`
      (`href: "/painel/check-in-membros"`, ícone a escolher — mesmo padrão comentado dos
      demais itens: guard real é a API, não o menu)

**Checkpoint**: tela de check-in de membros completa, com contador — US1 + US2 entregues.

---

## Phase 5: User Story 3 - Admin distingue candidatos presentes online dos presenciais (Priority: P2)

**Goal**: a tela de check-in de candidatos já existente mostra, para cada presente, se é
online ou presencial, e o total de cada grupo.

**Independent Test**: com candidatos presentes misturando `saturday_restriction` verdadeiro/falso,
`GET /candidates?status=presentes` devolve `attendance` correto por item e `attendanceSummary`
consistente — Cenário 8 de quickstart.md. Independente de US1/US2 (não toca check-in de
membro).

### Tests for User Story 3 ⚠️

- [ ] T019 [P] [US3] Estender `api/test/checkin.service.test.ts`: candidato com
      `saturday_restriction=true` presente → `attendance: "online"`; `false` → `"presencial"`;
      ausente → `attendance: null`; `attendanceSummary` soma corretamente sobre o conjunto
      filtrado (não só a página)
- [ ] T020 [P] [US3] Estender `api/test/checkin.routes.test.ts`: shape da resposta de
      `GET /candidates` inclui `attendance` por item e `attendanceSummary` agregado

### Implementation for User Story 3

- [ ] T021 [US3] Alterar `api/src/repositories/checkin.repository.ts` (`listCandidates`):
      selecionar `c.saturday_restriction` junto do resto (a query já faz `JOIN` com
      `candidates`) e devolver total agregado de online/presencial entre os presentes do
      conjunto filtrado (query de agregação irmã da de `total`, mesmo `WHERE`/`joinClause`
      já existentes — ver research.md D4)
- [ ] T022 [US3] Alterar `api/src/services/checkin.service.ts` (`listCandidates`): mapear
      `saturday_restriction` → `attendance` (`null` quando `checkedInAt` é `null`, senão
      `"online"`/`"presencial"`) e incluir `attendanceSummary` na resposta
- [ ] T023 [US3] Rodar `npm run test --workspace=api` e confirmar T019/T020 verdes
- [ ] T024 [P] [US3] Alterar `front/app/painel/check-in/_components/candidate-row.tsx`:
      exibir rótulo online/presencial ao lado do estado de presença
- [ ] T025 [US3] Alterar `front/app/painel/check-in/_components/filters-bar.tsx` (ou
      componente de resumo irmão, conforme o que já existe na tela): exibir
      `attendanceSummary` (online vs. presencial) entre os presentes

**Checkpoint**: todas as três user stories funcionais e independentemente testáveis.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: consistência com o resto do projeto antes do merge.

- [ ] T026 [P] Rodar `npm run lint`/`npm run typecheck` (ou equivalentes) em `shared`, `api`
      e `front`
- [ ] T027 Rodar toda a suíte `npm run test --workspace=api` (não só os testes novos) para
      confirmar que nada de FEAT-0005/0009 quebrou com as alterações de T021/T022
- [ ] T028 Executar os 8 cenários de `quickstart.md` manualmente (`npm run dev --workspace=api`
      + `curl`) como validação final ponta a ponta
- [ ] T029 Atualizar `task.md` (raiz): marcar FEAT-0010 como `[x]` e `CONTEXT.md` com o
      resumo da feature, seguindo a convenção já usada para 008/009/011/014/015/016

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — mas bloqueia tudo (Princípio I: contrato primeiro)
- **Foundational (Phase 2)**: depende do Setup — bloqueia US1/US2
- **US1 (Phase 3)**: depende de Setup + Foundational
- **US2 (Phase 4)**: depende de US1 (consome a mesma rota/response) — não é paralela a US1
- **US3 (Phase 5)**: depende só de Setup (T002) — **não depende de Foundational nem de
  US1/US2**, pode ser feita em paralelo a elas por outra pessoa/worktree
- **Polish (Phase 6)**: depende de todas as stories que forem entregues

### Parallel Opportunities

- T001/T002 (Setup) em arquivos diferentes — paralelo
- T007/T008 (testes de US1) — paralelo entre si, mas ambos antes de T009–T012
- T015/T016 (componentes de US2) — paralelo
- T019/T020 (testes de US3) — paralelo entre si
- **US3 inteira roda em paralelo a US1+US2** (dependências independentes — ver acima),
  respeitando a regra do CONTEXT.md de nunca editar `shared/src/schemas/` nem migrations em
  paralelo: T001–T005 ficam sequenciais antes de qualquer bifurcação

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → validar Cenários 1–7 do
   quickstart.md → esse é o MVP (check-in de membro funcionando via API).

### Incremental Delivery

1. Setup + Foundational → banco e contrato prontos.
2. US1 → API de check-in de membro completa e testada.
3. US2 → tela de check-in de membro no front (consome a API da US1).
4. US3 → sinalização online/presencial no check-in de candidatos já existente (paralelizável
   com 1–3 depois que Setup termina).
5. Polish → lint/typecheck/suíte completa/quickstart manual/atualização de `task.md`.
