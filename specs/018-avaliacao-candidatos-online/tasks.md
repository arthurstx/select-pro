---

description: "Task list for 018 — Prosel online independente (revisada)"
---

# Tasks: Prosel online — grupos e avaliação independentes do presencial

**Input**: Design documents from `/specs/018-avaliacao-candidatos-online/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/groups-online.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

**Nota de revisão**: esta é a segunda versão do `tasks.md` desta feature. A primeira
(round-robin combinado) foi implementada e depois **desfeita/reescrita** nesta lista — nada
chegou a ser commitado, então não há histórico de git para reverter, só o código local que
estas tarefas substituem.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (bloqueante — corrige o bug de escopo do `replaceOrganization`)

**Por que existe uma fase própria aqui, diferente da primeira versão**: `replaceOrganization`
apagar a edição inteira é um bug estrutural que TODAS as user stories dependem de corrigir
primeiro — organizar qualquer modalidade sem isso corrigido quebra a outra.

- [X] T001 `api/src/repositories/group.repository.ts`: `replaceOrganization(processId, groups)`
  vira `replaceOrganization(processId, modality, groups)` — o `DELETE FROM groups WHERE
  process_id = ?` vira `DELETE FROM groups WHERE process_id = ? AND modality = ?`. Todos os
  `groups` passados devem ser da mesma `modality` (quem chama garante isso).
- [X] T002 [P] `api/src/services/group-organization.ts`: dividir em duas funções
  independentes exportadas — `organizePresencialGroups(candidates, rooms, presentMembers)`
  (mesma lógica que já existia antes de qualquer tentativa de pool combinado — reverter para
  isso) e `organizeOnlineGroups(candidates, rooms)` (só `distributeByGender` + montagem dos
  `GroupToInsert` com `evaluatorUserIds: []` sempre, sem `presentMembers`). Remover qualquer
  função "organizeGroups" combinadora.
- [X] T003 [P] `group-organization.test.ts`: reescrever para as duas funções separadas —
  remover os testes de "pool único"/"balanceamento combinado" (não existem mais); manter os
  testes originais de D1, salas, round-robin presencial; manter os testes de "grupo online sem
  sala nem avaliador" (voltam a ser válidos como estavam antes).

**Checkpoint**: `group-organization.ts` compila, sem `organizeGroups` combinadora.

---

## Phase 2: User Story 1 - Admin organiza os grupos online, independente do presencial (Priority: P1) 🎯 MVP

**Goal**: `POST /groups/organize/presencial` e `POST /groups/organize/online` existem como
operações independentes; organizar uma nunca apaga grupos da outra.

**Independent Test**: cenários 1 e 2 do `quickstart.md`.

### Tests for User Story 1

- [X] T004 [P] [US1] `group.service.test.ts`: `organizePresencial()`/`organizeOnline()` —
  organizar online depois de presencial (ou vice-versa) preserva os grupos já existentes da
  outra modalidade; reorganizar a mesma modalidade duas vezes substitui só ela mesma
- [X] T005 [P] [US1] `group.routes.test.ts`: `POST /groups/organize/presencial` e
  `POST /groups/organize/online` — 401/403/200/409 (sem candidato presente); confirma que
  `GET /groups` depois de organizar as duas mostra ambas intactas

### Implementation for User Story 1

- [X] T006 [US1] `api/src/services/group.service.ts`: `organize()` vira
  `organizePresencial(now)` (mesma lógica de antes, chama `organizePresencialGroups`,
  `replaceOrganization(process.id, "presencial", groups)`) e `organizeOnline(now)` (chama
  `organizeOnlineGroups`, `replaceOrganization(process.id, "online", groups)`,
  `unallocatedCandidateCount` sempre `0`). `NoRoomsAvailableError` só se aplica ao caminho
  presencial.
- [X] T007 [US1] `api/src/routes/group.routes.ts`: `POST /organize` vira
  `POST /organize/presencial` e `POST /organize/online`, ambas `ADMIN_ONLY`, chamando o método
  correspondente do service
- [X] T008 [US1] `front/lib/group/queries.ts` (ou onde vive hoje): `useOrganizeQuery` vira dois
  hooks/mutations — `useOrganizePresencialMutation`/`useOrganizeOnlineMutation`

**Checkpoint**: US1 funcional e testável isoladamente — as duas operações não se pisam.

---

## Phase 3: User Story 2 - Avaliador escolhe entrar num grupo online (Priority: P1)

**Goal**: `POST /groups/online/{groupId}/join` (self-service) e `DELETE /groups/online/me`
(self-service) existem, restritas a `role: avaliador`.

**Independent Test**: cenários 3, 4 e 5 do `quickstart.md`.

### Tests for User Story 2

- [X] T009 [P] [US2] `group.service.test.ts`: `assignEvaluatorToOnlineGroup` — primeira
  entrada (sem grupo antes) funciona; entrar em outro grupo online move (não duplica,
  confirmado consultando `group_evaluators` direto); recusa (`GroupModalityMismatchError`) se
  o grupo de destino for presencial; `leaveOnlineGroup` — remove quem estava, e
  `EvaluatorNotAllocatedError` para quem não estava em nenhum grupo online
- [X] T010 [P] [US2] `group.routes.test.ts`: `POST /groups/online/{id}/join` —
  401/403 (admin não pode, só avaliador)/200/404/409; `DELETE /groups/online/me` —
  401/403/204/404

### Implementation for User Story 2

- [X] T011 [US2] `api/src/repositories/group.repository.ts`: `assignEvaluator(userId, groupId)`
  — `INSERT INTO group_evaluators (group_id, user_id) VALUES (?, ?) ON CONFLICT(user_id) DO
  UPDATE SET group_id = excluded.group_id`; `removeEvaluator(userId): Promise<boolean>` —
  `DELETE FROM group_evaluators WHERE user_id = ?`, devolve se apagou alguma linha
- [X] T012 [US2] `api/src/services/group.service.ts`:
  `assignEvaluatorToOnlineGroup(userId, groupId, now)` — resolve o processo corrente, busca o
  grupo de destino (`findGroupById`), recusa se não for `modality: "online"`
  (`GroupModalityMismatchError`) ou não existir (`GroupNotFoundError`), chama
  `repository.assignEvaluator`, devolve `buildSummary(groupId)`;
  `leaveOnlineGroup(userId, now)` — `findEvaluatorGroup`, recusa se não achar ou se o grupo
  encontrado não for online (`EvaluatorNotAllocatedError` — do ponto de vista desta rota, "não
  está em grupo online" é a mesma coisa de "não está alocado"), `repository.removeEvaluator`
- [X] T013 [US2] `api/src/routes/group.routes.ts`: `POST /online/{groupId}/join`
  (`[requireAuth, requireRole(ROLES.AVALIADOR)]` — não admin; `userId` = usuário autenticado,
  `c.get("user").id` ou equivalente já usado em `evaluation.routes.ts`) e
  `DELETE /online/me` (mesma auth)
- [X] T014 [US2] `api/src/index.ts`: CORS de `/groups/*` — confirmar `DELETE` em
  `allowMethods` (hoje só `GET, POST, PATCH`)
- [X] T015 [US2] [P] `front/lib/group/queries.ts`: `useJoinOnlineGroupMutation`/
  `useLeaveOnlineGroupMutation`
- [X] T016 [US2] [P] `front/app/painel/grupos/_components/group-card.tsx`: botão
  "Participar do grupo" no card online quando o avaliador logado ainda não está nele; "Sair do
  grupo" quando já está (precisa saber o `userId` do avaliador logado — mesmo padrão de sessão
  já usado em `minhas-avaliacoes`)

**Checkpoint**: US1 + US2 juntas já fecham o fluxo principal — candidato online passa a poder
ser avaliado, via alocação manual/self-service.

---

## Phase 4: User Story 3 - Gestão distribui avaliadores manualmente (Priority: P2)

**Goal**: `PUT /groups/online/{groupId}/evaluators/{userId}` (admin) existe, usando o mesmo
método de service da US2.

**Independent Test**: cenário 6 do `quickstart.md`.

### Tests for User Story 3

- [X] T017 [P] [US3] `group.routes.test.ts`: `PUT /groups/online/{groupId}/evaluators/{userId}`
  — 401/403 (só admin)/200/404/409

### Implementation for User Story 3

- [X] T018 [US3] `api/src/routes/group.routes.ts`: `PUT /online/{groupId}/evaluators/{userId}`
  (`ADMIN_ONLY`), chama o mesmo `GroupService.assignEvaluatorToOnlineGroup` com o `userId` do
  path — nenhum código novo de service, só a rota
- [X] T019 [US3] [P] front: botão/seletor na seção "Grupos Online" pra admin atribuir um
  avaliador diretamente (ex.: um `Select` de avaliadores presentes sem grupo, ao lado de cada
  card online)

**Checkpoint**: as 3 primeiras user stories cobrem os dois caminhos de alocação (self-service e
manual).

---

## Phase 5: User Story 4 - Tela de grupos separada por modalidade (Priority: P2)

**Goal**: `/painel/grupos` mostra "Grupos Online" e "Grupos Presenciais" como seções distintas.

**Independent Test**: cenário do `quickstart.md`/US4 do `spec.md` — abrir a tela com grupos
das duas modalidades e ver as duas seções.

### Implementation for User Story 4

- [X] T020 [US4] `front/app/painel/grupos/page.tsx`: dividir a lista única de `group.data.groups`
  em duas (`.filter(g => g.modality === "online" | "presencial")`), renderizar em duas
  `<section>` com título próprio, cada uma com o botão de organizar correspondente (T008)

**Checkpoint**: as 4 user stories funcionam de ponta a ponta, isoladamente e em conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] `api/src/repositories/group.repository.ts`: `listEvaluatorAllocations` e
  `listEvaluatorAllocationsForGroup` — a derivação de `role` (`CASE WHEN eh.user_id IS NOT
  NULL THEN 'host' ELSE 'avaliador' END`) ganha a condição `g.modality = 'presencial' AND
  eh.user_id IS NOT NULL` — para online, `role` é sempre `'avaliador'` (FR-007)
- [X] T022 [P] [US2] `group.service.test.ts`/`group.routes.test.ts`: caso — um usuário com
  linha em `edition_hosts` para a edição corrente entra num grupo online (join) e aparece com
  `role: "avaliador"` na leitura, nunca `"host"` (cobre o edge case do `spec.md`)
- [X] T023 [P] `evaluation.service.test.ts`/`evaluation.routes.test.ts`: reconfirmar (sem
  mudança de código) que um avaliador alocado a um grupo online via `join`/`assign` consegue
  avaliar os candidatos desse grupo — mesmo teste que a versão anterior desta spec já cobria,
  agora alocando via `assignEvaluatorToOnlineGroup` em vez de `organize()`
- [X] T024 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; suíte completa de `api`
  passando; `npm run build --workspace=front` sem erro
- [X] T025 Cenários do `quickstart.md` conferidos: 1/2 (organizar online não apaga presencial,
  só separa candidatos) — `group.routes.test.ts`/`group.service.test.ts` (US1); 3 (avaliador
  entra) — `group.routes.test.ts "200 avaliador se junta ao grupo online"`; 4 (mover em vez de
  duplicar) — `group.service.test.ts "entrar em outro grupo online move, não duplica"`; 5
  (sair) — `group.routes.test.ts "204 sai do grupo online com sucesso"`; 6 (atribuição manual)
  — `group.routes.test.ts "200 admin atribui avaliador diretamente"`; 7 (host não rotulado) —
  `group.service.test.ts "host da edição que entra num grupo online aparece como avaliador"`;
  8 (avaliador de grupo online avalia) — coberto pelos testes já existentes de
  `evaluation.service.test.ts`/`evaluation.routes.test.ts` (T023, sem mudança de código —
  elegibilidade é agnóstica de como o vínculo `group_evaluators` nasceu)

**Checkpoint final**: T001–T025 completos. Deploy fica fora deste `tasks.md` — sem migration.

---

## Dependencies & Execution Order

- **Foundational (Phase 1) bloqueia tudo** — sem o escopo por `modality` no
  `replaceOrganization`, nenhuma user story pode ser testada de forma confiável (organizar
  uma quebraria a outra no meio do teste da outra).
- **US1 é pré-requisito de US2/US3/US4 na prática**: precisa existir um grupo online (US1) para
  ter algo em que "participar" (US2) ou "atribuir" (US3) ou "ver na seção separada" (US4).
- US3 depende só da mesma função de service que a US2 já implementou (T012) — por isso não tem
  "Implementation" própria além da rota.
- US4 é só front — depende de US1 (T008, os dois botões de organizar) e faz mais sentido
  visualmente depois que US2/US3 já existem (o card tem o que mostrar), mas não tem
  dependência técnica dura além disso.

## Implementation Strategy

### MVP First

1. Foundational → corrige o bug de escopo, pré-requisito de tudo
2. US1 → organizar as duas modalidades sem uma apagar a outra
3. US2 → avaliador consegue entrar/sair de grupo online sozinho — já fecha o problema original
   (candidato online sem veredito)
4. US3 → caminho alternativo pra gestão, quando o self-service não for suficiente
5. US4 → separação visual, torna tudo isso visível/utilizável na prática
6. Polish → regra host/avaliador na leitura, verificação de build/testes, checklist do quickstart
