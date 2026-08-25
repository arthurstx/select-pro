---

description: "Task list for 011 — Cadastro de salas"
---

# Tasks: Cadastro de salas

**Input**: Design documents from `/specs/011-cadastro-de-salas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rooms.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

**Organization**: por user story, ordem `shared/` → `api/` → `front/` dentro
de cada fase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (contratos compartilhados)

- [X] T001 Criar `shared/src/schemas/room.schema.ts`: `deriveRoomCapacity(size)`, `CreateRoomSchema`, `UpdateRoomSchema`, `RoomSummarySchema`, `RoomListResponseSchema`, `RoomResponseSchema`, `RoomErrorCode` (shapes exatos em data-model.md)
- [X] T002 Exportar `room.schema.ts` em `shared/src/index.ts`

**Checkpoint**: `shared` builda sem erro de tipo.

---

## Phase 2: Foundational (bloqueante para as 3 user stories)

- [X] T003 Criar `api/migrations/0009-rooms-unique-name.sql` — `CREATE UNIQUE INDEX idx_rooms_name ON rooms(name)` (aditiva, sem `MAINTENANCE_MODE`). ⚠️ Numeração pressupõe merge da FEAT-0008 antes desta — nota preservada no arquivo da migration.
- [X] T004 Aplicar a migration localmente. Confirmado `rooms` vazia antes de aplicar (`SELECT COUNT(*)` = 0).
- [X] T005 [P] Criar `api/src/core/errors/room-errors.ts`: `RoomNotFoundError`, `RoomNameAlreadyExistsError`, `RoomHasGroupsError`
- [X] T006 [P] Criar `api/src/repositories/rooms.repository.ts`. Nota: `update()` usa tipo próprio `{id,name,size}` obrigatórios, não o `RoomUpdate` de `shared` (que é `Partial` — feito para PATCH; usá-lo aqui deixaria `undefined` virar `NULL` no bind de um PUT que sempre substitui os dois campos).
- [X] T007 Criar `api/src/services/rooms.service.ts` — mensagem de violação de FK confirmada empiricamente antes de escrever o parser: `wrangler d1 execute` local com uma linha em `groups` apontando pra uma sala e tentando excluir devolveu exatamente `"FOREIGN KEY constraint failed"` (sem nomear tabela/coluna, ao contrário da violação de UNIQUE)

**Checkpoint**: migration aplicada, repositório e service compilam. Nenhuma rota ainda expõe isso.

---

## Phase 3: User Story 1 - Admin cadastra as salas do dia (Priority: P1) 🎯 MVP

**Goal**: `POST /rooms` cria, `GET /rooms` lista com `hostCount`/`maxGroups` corretos por faixa.

**Independent Test**: cenários 1 e 2 do quickstart.md — 3 faixas + as 4 fronteiras exatas (50/51/80/81).

### Tests for User Story 1

- [X] T008 [P] [US1] `shared`: teste de `deriveRoomCapacity` cobrindo as 4 fronteiras exatas (50→1/2, 51→2/3, 80→2/3, 81→2/4) — `shared/src/schemas/room.schema.test.ts` (20/20 testes de `shared` passando)
- [X] T009 [P] [US1] `rooms.service.test.ts` — cobertura de `create`/`list`/`update`/`delete`, incluindo FR-005 (nome duplicado) e FR-009 (grupo vinculado via seed SQL direto). Nota: teste de `size < 1` movido para o nível de rota (T010) — o service recebe DTO já validado pelo Zod da rota, não faz sentido testar a validação nesse nível.
- [X] T010 [P] [US1] `rooms.routes.test.ts` — `POST`/`GET` com 401/403/201/400/409

### Implementation for User Story 1

- [X] T011 [US1] `rooms.service.ts`: `create(input)`/`list()`
- [X] T012 [US1] `api/src/routes/rooms.routes.ts`: `GET /` e `POST /`, `[requireAuth, requireRole(ROLES.ADMIN)]`
- [X] T013 [US1] `roomsRouter` montado em `api/src/index.ts` sob `/rooms`, CORS próprio (GET/POST/PUT/DELETE) e `maintenanceGuard`
- [X] T014 [US1] [P] `front/lib/rooms/rooms-api.ts` — `listRooms()`, `createRoom()`
- [X] T015 [US1] [P] `front/app/painel/salas/page.tsx` — tabela + `Sheet` com prévia ao vivo. `useWatch` em vez de `form.watch()` — mesmo padrão já usado em `inscricao/_components/*-step-form.tsx` (evita o warning do React Compiler sobre `watch()` não ser memoizável)

**Checkpoint**: US1 funcional e testável isoladamente.

---

## Phase 4: User Story 2 - Admin corrige nome ou capacidade (Priority: P2)

**Goal**: `PUT /rooms/:id` atualiza nome/capacidade, recalculando a faixa.

**Independent Test**: cenário 4 do quickstart.md — editar capacidade cruzando fronteira de faixa.

### Tests for User Story 2

- [X] T016 [P] [US2] `rooms.service.test.ts` — `update()` cobrindo recálculo de faixa, nome duplicado, id inexistente
- [X] T017 [P] [US2] `rooms.routes.test.ts` — `PUT /rooms/:id` com 401/403/200/404/409

### Implementation for User Story 2

- [X] T018 [US2] `rooms.service.ts`: `update(id, input)`
- [X] T019 [US2] `PUT /:id` em `rooms.routes.ts`
- [X] T020 [US2] [P] `updateRoom(id, input)` em `rooms-api.ts`
- [X] T021 [US2] Ação "editar" reabre o mesmo `Sheet` pré-preenchido (`useEffect` reseta o form quando `open`/`room` mudam — o Sheet não desmonta entre aberturas)

**Checkpoint**: US1 + US2 funcionam juntas e isoladamente.

---

## Phase 5: User Story 3 - Admin remove uma sala (Priority: P3)

**Goal**: `DELETE /rooms/:id` remove sala sem grupo vinculado; recusa com `ROOM_HAS_GROUPS` se houver.

**Independent Test**: cenário 5 do quickstart.md — inserir uma linha de `groups` apontando pra sala via SQL direto no teste (sem depender da feature 012, que ainda não existe) e confirmar o bloqueio.

### Tests for User Story 3

- [X] T022 [P] [US3] `rooms.service.test.ts` — `delete()` cobrindo remoção limpa, bloqueio por grupo vinculado (seed SQL direto, sem depender da feature 012), id inexistente
- [X] T023 [P] [US3] `rooms.routes.test.ts` — `DELETE /rooms/:id` com 401/403/204/404/409

### Implementation for User Story 3

- [X] T024 [US3] `rooms.service.ts`: `delete(id)`
- [X] T025 [US3] `DELETE /:id` em `rooms.routes.ts`

**Checkpoint de backend**: 240/240 testes da suíte `api` (13 arquivos), 20/20 de `shared` — inclui os 27 testes novos de `rooms.service.test.ts`/`rooms.routes.test.ts` e os 4 de `room.schema.test.ts`. `tsc --noEmit` limpo em `shared` e `api`.
- [X] T026 [US3] [P] `deleteRoom(id)` em `rooms-api.ts`
- [X] T027 [US3] Ação "excluir" com `window.confirm()` (sem `AlertDialog` — componente não instalado no design system, e um `confirm()` nativo é suficiente para uma ferramenta interna); mensagem específica de `ROOM_HAS_GROUPS`

**Checkpoint**: as 3 user stories funcionam de ponta a ponta, isoladamente e em conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Item "Salas" em `front/components/painel/painel-nav.tsx` (ícone `DoorOpenIcon`)
- [X] T029 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; `npm run build --workspace=front` gerou `/painel/salas` sem erro; 240/240 testes `api` + 20/20 `shared` (5 cenários do quickstart cobertos pelos testes automatizados, não por `curl` manual)
- [ ] T030 Aplicar `0009-rooms-unique-name.sql` em staging, depois produção (Princípio III — staging antes, sempre) — **pendente, ação de infraestrutura fora do escopo desta implementação**

**Checkpoint final**: as 30 tarefas de código (T001–T029) estão completas. T030 (deploy) fica para quando o usuário autorizar.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 é o MVP real desta feature** (ao contrário da 008): cadastrar e listar salas já entrega valor completo sozinho — admin vê a regra de faixas aplicada sem precisar editar ou excluir nada.
- US2 e US3 reaproveitam o mesmo arquivo de rotas/service/página criado em US1 — não há paralelismo de arquivo entre elas (T019 depende de T012 existir; T025 também). Diferente da estrutura de 008, aqui as 3 stories **compartilham arquivo**, então rodar em paralelo por agentes/worktrees não se aplica — é sequencial por natureza do CRUD.

## Implementation Strategy

### MVP First

1. Setup + Foundational
2. US1 → **já é o produto mínimo utilizável**: salas cadastradas, faixas corretas
3. US2, US3 → conveniência incremental (corrigir, remover)
4. Polish → nav, staging, produção
