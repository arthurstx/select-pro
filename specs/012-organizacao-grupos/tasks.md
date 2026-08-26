---
description: "Task list template for feature implementation"
---

# Tasks: Organização automática de grupos

**Input**: Design documents from `/specs/012-organizacao-grupos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/group-api.md, quickstart.md

**Tests**: incluídos — Princípio V da constitution ("Backend Novo Vem Com Testes") não é opcional.

**Organization**: por user story (US1 presencial, US2 ajuste manual, US3 online), na ordem de
prioridade da spec.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Criar migration `api/migrations/0014-group-organization.sql` recriando `groups`
      (com `process_id`, `room_id` nullable, `modality`, CHECK cruzado), `group_evaluators`
      e `group_candidates` (ambas com `UNIQUE` extra) — schema exato em `data-model.md`.
      **Antes de aplicar em staging/produção** (fora desta sessão), confirmar que as três
      tabelas seguem vazias nesses ambientes (research.md D-tech1) — deixar essa checagem
      documentada como comentário no topo da migration.
- [X] T002 [P] Criar `shared/src/schemas/group.schema.ts`: `GroupModalitySchema`,
      `GroupCandidateSchema`, `GroupEvaluatorSchema`, `GroupSummarySchema`,
      `OrganizeResultResponseSchema`, `GroupListResponseSchema`, `MoveResultResponseSchema`,
      `GroupErrorCode` (`NO_CANDIDATES_PRESENT`, `NO_ROOMS_AVAILABLE`, `GROUP_NOT_FOUND`,
      `CANDIDATE_NOT_ALLOCATED`, `EVALUATOR_NOT_ALLOCATED`, `GROUP_MODALITY_MISMATCH`) —
      shapes exatos em `contracts/group-api.md`.
- [X] T003 [P] Exportar `group.schema` em `shared/src/index.ts`.

**Checkpoint**: contratos existem; `npm run build --workspace=shared` limpo.

---

## Phase 2: Foundational (bloqueia todas as user stories)

- [X] T004 Criar `api/src/core/errors/group-errors.ts`: `NoCandidatesPresentError`,
      `NoRoomsAvailableError`, `GroupNotFoundError`, `CandidateNotAllocatedError`,
      `EvaluatorNotAllocatedError`, `GroupModalityMismatchError` (mesmo padrão de
      `member-checkin-errors.ts`/`room-errors.ts`, `Either`/`left`/`right`).
- [X] T005 Criar `api/src/repositories/group.repository.ts` com os métodos de leitura:
      `listPresentCandidates(processId)` (join `candidate_checkins`/`candidates`/
      `candidate_applications`, retornando `id`, `name`, `gender`, `attendance`, ordenado por
      `checked_in_at ASC` — data-model.md, ordem de desempate FR-013),
      `listPresentMembers(processId)` (join `member_checkins`/`users`/`edition_hosts`,
      retornando `userId`, `name`, `role`), `listRoomsOrdered()` (`rooms` por
      `name ASC` — rooms não tem `created_at`, mesma ordem já usada por
      `RoomsRepository.list()` — reaproveitando `deriveRoomCapacity` do `shared`).
- [X] T006 [P] Criar `api/src/services/group-organization.ts`: função pura
      `organizeGroups(candidates, rooms, presentMembers)` implementando o algoritmo de duas
      fases (research.md D-tech4/D-tech5) **só para candidatos presenciais** nesta task —
      separação online fica para a task da US3. Sem I/O, sem D1: recebe arrays já
      carregados, devolve a estrutura de grupos a persistir. Cobre D1 (nunca 1 mulher),
      mapeamento sala→grupos via `deriveRoomCapacity`, alocação round-robin de
      avaliadores/hosts por sala.
- [X] T007 [P] `api/test/group-organization.test.ts`: testes unitários (sem D1 real) da
      função pura de T006 — casos: número par/ímpar de mulheres, mais candidatos que
      capacidade das salas (retorna lista de não-alocados), sem sala nenhuma, distribuição
      de avaliadores por sala.
- [X] T008 Criar `api/src/repositories/group.repository.ts` (continuação de T005): método de
      escrita transacional `replaceOrganization(processId, groups)` — `db.batch` que primeiro
      `DELETE FROM groups WHERE process_id = ?` (cascade limpa as duas tabelas de junção) e
      depois insere os grupos/alocações novos, nunca estado parcial.
- [X] T009 Criar `api/src/services/group.service.ts`: `organize(processId, actorId)`
      (resolve edição corrente, chama T005 + T006 + `NoCandidatesPresentError`/
      `NoRoomsAvailableError` quando aplicável, persiste via T008, monta `OrganizeResult`),
      `list(processId)` (lê a organização atual sem recalcular).
- [X] T010 Criar `api/src/routes/group.routes.ts`: `POST /groups/organize` e `GET /groups`,
      admin-only (`ADMIN_ONLY`, mesmo padrão de `member-checkin.routes.ts`), mapeando os
      erros de T004 para status HTTP conforme `contracts/group-api.md`.
- [X] T011 Registrar `app.route("/groups", groupRouter)` em `api/src/index.ts`.

**Checkpoint**: `POST /groups/organize`/`GET /groups` funcionam para candidatos presenciais
(sem separação online ainda) — base pronta para as user stories.

---

## Phase 3: User Story 1 - Admin organiza os grupos presenciais do dia (Priority: P1) 🎯 MVP

**Goal**: acionar "organizar grupos" distribui candidatos presenciais presentes entre salas
respeitando D1/D5 e aloca avaliadores/hosts presentes.

**Independent Test**: candidatos presenciais presentes (gêneros mistos) + salas cadastradas
com avaliadores/hosts presentes → `POST /groups/organize` aloca todos, nenhum grupo com 1
mulher, nenhuma sala excede `maxGroups`.

### Tests

- [X] T012 [P] [US1] `api/test/group.service.test.ts`: `organize()` com D1 real
      (`vitest-pool-workers`) — aloca todos os candidatos presenciais presentes, respeita D1
      (nunca 1 mulher), respeita `maxGroups` por sala (D5), aloca avaliadores/hosts
      presentes às salas corretas, `NO_CANDIDATES_PRESENT` quando ninguém presente,
      `NO_ROOMS_AVAILABLE` quando há presencial presente e nenhuma sala.
- [X] T013 [P] [US1] `api/test/group.routes.test.ts`: `POST /groups/organize` (200 com
      shape correto, 409 nos dois erros de domínio, 401/403 fora de admin) e `GET /groups`
      (200, vazio antes de organizar).

### Implementation

- [X] T014 [US1] Reorganizar `organizeGroups` (T006) para aceitar o resultado de
      `listRoomsOrdered` e devolver também `unallocatedCandidateCount` quando a capacidade
      total das salas for menor que o total de presenciais presentes (FR-013).
- [X] T015 [US1] Ajustar `group.service.ts#organize` para propagar
      `unallocatedCandidateCount` no `OrganizeResult` (T009 revisitada).
- [ ] T016 [P] [US1] Criar `front/lib/group/api.ts`: `organizeGroups()`, `listGroups()`
      (mesmo padrão de `front/lib/member-checkin/api.ts`, `authFetch` + `toApiError`).
- [ ] T017 [P] [US1] Criar `front/lib/group/queries.ts`: `useGroupsQuery`,
      `useOrganizeGroupsMutation` (invalida a query de grupos em `onSuccess`, mesmo padrão
      de `useMarkMemberPresentMutation`).
- [ ] T018 [US1] Criar `front/app/painel/grupos/_components/group-card.tsx`: um grupo
      (nome/sala ou "Online", lista de candidatos com nome e modalidade — sem gênero, mesma
      postura de `CandidateCheckinItemSchema`/FEAT-0005 — lista de avaliadores/hosts com
      cargo).
- [ ] T019 [US1] Criar `front/app/painel/grupos/_components/organize-button.tsx`: aciona
      `useOrganizeGroupsMutation`, trata `GroupErrorCode.NO_CANDIDATES_PRESENT` e
      `NO_ROOMS_AVAILABLE` com mensagens específicas (reaproveitar `StateMessage`).
- [ ] T020 [US1] Criar `front/app/painel/grupos/page.tsx`: lista os grupos via
      `useGroupsQuery`, botão de organizar, trata `CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS`.
- [ ] T021 [US1] Adicionar item de navegação "Grupos" em
      `front/components/painel/painel-nav.tsx` (mesmo padrão do item de check-in de
      membros).

**Checkpoint**: US1 completa e testável de forma independente (candidatos online ainda caem
como "não alocados" — resolvido na US3).

---

## Phase 4: User Story 3 - Candidatos online formam grupos próprios (Priority: P2)

**Goal**: candidatos presentes online são separados dos presenciais em grupos próprios,
seguindo D1, sem sala nem avaliador/host alocado.

**Independent Test**: candidatos presentes online + presenciais misturados → `organize`
nunca mistura modalidade no mesmo grupo; grupos online seguem D1 e não têm `room`/
`evaluators`.

### Tests

- [X] T022 [P] [US3] Estender `api/test/group-organization.test.x` (T007): candidatos online
      formam grupos próprios respeitando D1, número de grupos online derivado do tamanho
      médio de grupo presencial (ou 25, sem sala cadastrada — data-model.md Assumptions).
- [X] T023 [P] [US3] Estender `api/test/group.service.test.ts` (T012): `organize()` com
      mistura online/presencial — nenhum grupo resultante mistura modalidade, grupos online
      com `room: null` e `evaluators: []`.

### Implementation

- [X] T024 [US3] Estender `organizeGroups` (T006/T014) para separar `candidates` por
      `attendance` antes de tudo, rodando as fases de D1/preenchimento duas vezes
      (presencial com salas, online sem salas, número de grupos conforme
      data-model.md Assumptions) e concatenando o resultado.
- [ ] T025 [US3] Garantir em `group-card.tsx` (T018) que grupos online aparecem
      identificados ("Online", sem sala, sem seção de avaliadores).

**Checkpoint**: US1 + US3 juntas cobrem a organização automática completa (FR-001 a FR-008,
FR-011 a FR-015).

---

## Phase 5: User Story 2 - Admin ajusta manualmente um grupo (Priority: P2)

**Goal**: mover candidato/avaliador entre grupos já organizados, com aviso (não bloqueio)
para violação de D1 e bloqueio real para mistura de modalidade.

**Independent Test**: com grupos já organizados (US1/US3), mover um candidato de um grupo
para outro reflete nos dois grupos; mover entre modalidades é rejeitado; mover violando D1
é aceito com aviso.

### Tests

- [ ] T026 [P] [US2] `api/test/group.service.test.ts`: `moveCandidate`/`moveEvaluator` —
      move com sucesso (`warning: null`), move violando D1 (`warning:
      "GENDER_RULE_VIOLATED"`, ainda assim persiste), `GROUP_MODALITY_MISMATCH` ao cruzar
      modalidade, `GROUP_NOT_FOUND`/`CANDIDATE_NOT_ALLOCATED`/`EVALUATOR_NOT_ALLOCATED`.
- [ ] T027 [P] [US2] `api/test/group.routes.test.ts`: `PATCH /groups/:groupId/candidates/:candidateId`
      e `PATCH /groups/:groupId/evaluators/:userId` — 200 nos casos válidos, 404/409 nos
      erros de domínio.

### Implementation

- [ ] T028 [US2] `api/src/repositories/group.repository.ts`: `moveCandidate(groupId,
      candidateId)` / `moveEvaluator(groupId, userId)` (`UPDATE` da FK na tabela de junção —
      o `UNIQUE` de data-model.md garante que sair do grupo antigo é automático).
- [ ] T029 [US2] `api/src/services/group.service.ts`: `moveCandidate`/`moveEvaluator` —
      valida existência/modalidade, recalcula composição de gênero dos dois grupos afetados
      para decidir `warning`, chama T028, devolve os dois `GroupSummary` atualizados.
- [ ] T030 [US2] `api/src/routes/group.routes.ts`: as duas rotas `PATCH`, mesmo padrão de
      erro de T010.
- [ ] T031 [P] [US2] `front/lib/group/api.ts` (T016): `moveCandidate()`, `moveEvaluator()`.
- [ ] T032 [P] [US2] `front/lib/group/queries.ts` (T017): `useMoveCandidateMutation`,
      `useMoveEvaluatorMutation` (invalidam a query de grupos, exibem o `warning` quando
      presente — ex.: `sonner`/toast já usado em outras telas do painel).
- [ ] T033 [US2] `group-card.tsx` (T018/T025): controle simples (select de grupo destino +
      botão "mover") por candidato/avaliador listado, acionando as mutations de T032.

**Checkpoint**: todas as user stories completas e testáveis independentemente.

---

## Phase 6: Polish

- [ ] T034 [P] Rodar `npm run test --workspace=api`, `npm run test --workspace=shared`,
      `tsc --noEmit` em `shared`/`api`/`front`, `next build` em `front` — suíte completa
      precisa passar antes de considerar a feature pronta.
- [ ] T035 [P] Atualizar `task.md` (raiz) e `CONTEXT.md`: mover FEAT-0012 para "Concluído",
      atualizar o diagrama de dependência (012 feita → 013 liberada), registrar qualquer
      decisão tomada durante a implementação que não estava prevista no plan (mesmo padrão
      das features anteriores).
- [ ] T036 Validar manualmente os 9 cenários de `quickstart.md` via `wrangler dev` + `curl`
      quando `api/.dev.vars` com usuário admin estiver disponível no ambiente — documentar
      como pendência (não bloqueante) se não for possível, mesmo tratamento dado a T028 da
      FEAT-0010.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: sem dependências, paralelizável entre si.
- **Foundational (T004–T011)**: depende do Setup. Bloqueia todas as user stories. T006/T007
  são paralelizáveis entre si e com T004/T005; T008–T011 dependem de T004/T005.
- **US1 (T012–T021)**: depende do Foundational. T012/T013 (testes) antes de T014–T021 na
  prática, mas podem ser escritos em paralelo. Front (T016–T021) depende do contrato de
  T002/T003 e pode ser feito em paralelo ao backend uma vez que o contrato exista.
- **US3 (T022–T025)**: depende do Foundational **e** da forma final de `organizeGroups`
  entregue pela US1 (T014) — estende a mesma função, não é independente na implementação
  (ainda que independentemente testável). Fazer depois da US1.
- **US2 (T026–T033)**: depende do Foundational e de haver organização para mover (US1/US3
  já terem rodado pelo menos uma vez em ambiente de teste) — mas o código de US2 em si
  (repository/service/routes de `move*`) não modifica o algoritmo de organização e pode ser
  implementado em paralelo à US3 por outra pessoa/sessão.
- **Polish (T034–T036)**: depende de todas as user stories desejadas estarem completas.

## Parallel Example: Foundational

```bash
Task: "Criar api/src/core/errors/group-errors.ts"                     # T004
Task: "Criar group-organization.ts (algoritmo puro, só presencial)"   # T006
Task: "Criar group-organization.test.ts (unit, sem D1)"               # T007
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup → Foundational → US1.
2. **STOP e valide**: organizar grupos presenciais funciona ponta a ponta (candidatos online
   ficam de fora da organização até a US3 — aceitável como incremento, não é regressão).

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → organização presencial funcionando (MVP).
3. US3 → candidatos online passam a formar grupos próprios.
4. US2 → ajuste manual disponível sobre qualquer organização já existente.
5. Polish → suíte completa, documentação de estado atualizada.
