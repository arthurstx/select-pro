---

description: "Task list for 020 — Simulação e regras reais de tamanho dos grupos presenciais"
---

# Tasks: Simulação e regras reais de tamanho dos grupos presenciais

**Input**: Design documents from `/specs/020-simulacao-grupos-presenciais/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/no-new-endpoint.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

**Organização**: US2/US3/US4 (grupo 3-5, avaliador por alvo, host excluído) são implementadas
juntas — as três regras vivem na mesma reescrita de `organizePresencialGroups`, então
compartilham uma fase de implementação, com testes separados por regra. US1 (simular) é só
front, independente do resto.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (funções puras em `shared`, bloqueante)

- [X] T001 `shared/src/schemas/room.schema.ts`: `derivePresencialGroupCount(candidateCount, maxGroups?)`
  (research.md, Decisão 2)
- [X] T002 [P] `shared/src/schemas/room.schema.ts`: `deriveEvaluatorTargetForGroupSize(size)` →
  `1 | 2` (research.md, Decisão 3)
- [X] T003 [P] `shared/src/schemas/room.schema.ts`: `recommendRoomsForGroups(totalGroups)` →
  lista de `{ maxGroups, hostCount, roomsNeeded }` (research.md, Decisão 4)
- [X] T004 [P] `shared/src/schemas/room.schema.test.ts`: casos para as 3 funções — fronteiras
  exatas de `derivePresencialGroupCount` (3, 5, 6, 13, 25 candidatos), `deriveEvaluatorTargetForGroupSize`
  (3→1, 4→2, 5→2), `recommendRoomsForGroups` (1, 4, 5, 8, 10 grupos)

**Checkpoint**: `shared` builda e testa limpo — as duas user stories seguintes consomem essas
funções sem precisar recalcular nada.

---

## Phase 2: User Story 2+3+4 - Organização real respeita tamanho, prioridade de avaliador e exclui host (Priority: P1/P2) 🎯 MVP

**Goal**: `organizePresencialGroups` forma grupos de 3-5 candidatos, aloca 1-2 avaliadores por
prioridade (2 pra 4-5 primeiro), nunca aloca host como avaliador.

**Independent Test**: cenários 1, 2 e 3 do `quickstart.md`.

### Tests

- [X] T005 [P] `group-organization.test.ts`: `organizePresencialGroups` — grupos sempre 3-5
  candidatos (13, 17, 23 candidatos, salas de sobra); capacidade insuficiente ainda reporta
  `unallocatedCandidateCount` corretamente (sem quebrar FR-004)
- [X] T006 [P] `group-organization.test.ts`: avaliadores — grupo de 3 recebe 1, grupo de 4-5
  recebe 2 (avaliadores suficientes); com avaliadores escassos, grupos de 4-5 completam o
  segundo antes de qualquer grupo ganhar um terceiro-que-não-existe (teste de prioridade)
- [X] T007 [P] `group-organization.test.ts`: host presente nunca aparece em `evaluatorUserIds`
  de nenhum grupo, mesmo com avaliadores insuficientes (hosts não viram avaliador de reserva)
- [X] T008 [P] `group.service.test.ts`: caso com D1 real cobrindo as três regras juntas
  (tamanho, prioridade, exclusão de host) via `organizePresencial()`

### Implementation

- [X] T009 Reescrever `api/src/services/group-organization.ts` `organizePresencialGroups`:
  `slotRoomIds`/quantidade de slots por sala passa a usar `derivePresencialGroupCount(candidatosNaSala, maxGroupsDaSala)`
  em vez de sempre usar `maxGroups` inteiro da sala como número de slots
- [X] T010 Nova função `distributeEvaluatorsByTarget(members, groupSizes)` em
  `group-organization.ts`: filtra `members` para `role === "avaliador"` antes de distribuir
  (FR-007); calcula `target = deriveEvaluatorTargetForGroupSize(size)` por grupo; primeira
  passada garante 1 por grupo nunca-vazio (ordem = índice do grupo), segunda passada completa
  o 2º avaliador só dos grupos com `target === 2`, para quando os avaliadores acabarem
  (research.md, Decisão 3) — substitui `distributeEvaluatorsAcrossNonEmptySlots` no caminho
  presencial (a função antiga continua existindo só se algo mais a usar; caso contrário, remover)

**Checkpoint**: organização real de presencial respeita as 3 regras, testada com D1 real.

---

## Phase 3: User Story 1 - Admin simula antes de organizar de verdade (Priority: P1)

**Goal**: botão "Simular grupos" mostra a recomendação sem persistir nada.

**Independent Test**: cenário 4 do `quickstart.md` — chamada de UI que só lê `GET /candidates`
(já existente) e calcula localmente.

### Implementation

- [X] T011 [US1] `front/app/painel/grupos/_components/simulate-button.tsx` — NOVO: botão
  "Simular grupos"; ao clicar, busca `totalCandidates` via `GET /candidates?attendance=presencial&status=presentes&per_page=1`
  (reaproveita `listCandidates` de `lib/checkin/api.ts`) e calcula
  `derivePresencialGroupCount`/`deriveEvaluatorTargetForGroupSize`/`recommendRoomsForGroups`
  (de `shared`) — mostra o resultado num `Sheet`/card (grupos, avaliadores mín/máx, salas por
  faixa, hosts totais); nenhuma chamada de escrita
- [X] T012 [US1] `front/app/painel/grupos/_components/groups-view.tsx`: `<SimulateButton />`
  ao lado do `<OrganizeButton modality="presencial" />`, só quando `modality === "presencial"`
  (US1/FR-002 — simulação é só presencial)

**Checkpoint**: as 4 user stories funcionam de ponta a ponta.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T013 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; suíte completa de `api` e
  `shared` passando; `npm run build --workspace=front` sem erro
- [X] T014 Cenários 1-3 do `quickstart.md` conferidos via testes automatizados (`group-organization.test.ts`/`group.service.test.ts`); cenário 4 (simulação sem I/O de escrita) confirmado por leitura de código — `SimulateButton` só chama `listCandidates` (GET) e funções puras de `shared`, nenhuma mutação

**Checkpoint final**: T001–T014 completos. Deploy fica fora deste `tasks.md` — sem migration.

---

## Dependencies & Execution Order

- **Foundational (Phase 1) bloqueia tudo** — as duas fases seguintes consomem as funções puras.
- **Fase 2 (backend) e Fase 3 (front, US1) são independentes entre si** — a simulação não lê
  nada que a organização real escreve; podem ser feitas em qualquer ordem depois do
  Foundational. A ordem aqui (backend primeiro) é só porque é o MVP real da spec (US2/3/4 são
  P1/P2, mais perto do problema original do que a simulação isolada).

## Implementation Strategy

### MVP First

1. Foundational → funções puras testadas isoladamente
2. Backend (US2+US3+US4) → organização real já corrige o comportamento errado de hoje
3. Front (US1) → simulação visível pro admin
4. Polish → build/testes, checklist do quickstart
