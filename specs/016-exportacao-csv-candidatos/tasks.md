---

description: "Task list for 012 — Exportação de candidatos em planilha (CSV)"
---

# Tasks: Exportação de candidatos em planilha (CSV)

**Input**: Design documents from `/specs/012-exportacao-csv-candidatos/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/export.md

**Tests**: não opcionais — Princípio V da constitution.

**Organization**: por user story, ordem `shared/` → `api/` dentro de cada fase. Sem fase de
`front/` nesta rodada (ver "Structure Decision" em plan.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (contratos compartilhados)

- [X] T001 Criar `shared/src/schemas/export.schema.ts`: `ExportCandidatesQuerySchema`,
  `ExportErrorCode`, `EXPORT_CSV_COLUMNS`, `EXPORT_SENSITIVE_CSV_COLUMNS` (shapes exatos em
  data-model.md)
- [X] T002 Adicionar `CandidateExportEventRow`/`NewCandidateExportEvent` a
  `database.schema.ts` e `candidate_export_events` a `DatabaseSchema`
- [X] T003 Exportar `export.schema.ts` em `shared/src/index.ts`

**Checkpoint**: `shared` builda sem erro de tipo.

---

## Phase 2: Foundational (bloqueante para as 3 user stories)

- [X] T004 Criar `api/migrations/0012-candidate-export-events.sql` — `CREATE TABLE
  candidate_export_events` + 2 índices (aditiva, sem `MAINTENANCE_MODE`). Número `0012`
  reservado deliberadamente: `0010`/`0011` pertencem a FEAT-0009/FEAT-0014, ainda não
  mescladas em `develop` no momento desta implementação.
- [X] T005 Aplicar a migration localmente (`wrangler d1 execute --local`), confirmando antes
  que `candidate_export_events` não existe
- [X] T006 [P] Criar `api/src/lib/csv.ts` — `toCsvField(value)`/`toCsvRow(fields)` (RFC 4180:
  aspas ao redor quando o campo contém `,`/`"`/`\r`/`\n`, aspas internas duplicadas)
- [X] T007 [P] Criar `api/src/repositories/exports.repository.ts` — `listForExport(filters)`
  (reaproveita o mesmo `WHERE`/`JOIN` de `dashboard.repository.listCandidates`, sem
  paginação) e `recordExport(event)`
- [X] T008 Criar `api/src/services/exports.service.ts` — resolve o recorte de edição
  (reaproveita `SelectionProcessRepository`/`SelectionProcessNotFoundError` de
  `checkin-errors.ts`, sem duplicar), monta as linhas do CSV com `toCsvRow`, grava o evento
  de auditoria

**Checkpoint**: migration aplicada, `csv.ts`/repository/service compilam e têm teste unitário
de escapamento. Nenhuma rota ainda expõe isso.

---

## Phase 3: User Story 1 - Admin exporta os candidatos de uma edição (Priority: P1) 🎯 MVP

**Goal**: `GET /exports/candidates` devolve CSV com as colunas não-sensíveis, filtrável por
edição/busca/data.

**Independent Test**: exportar uma edição com candidatos e confirmar CSV válido com 1 linha por
candidato + cabeçalho; exportar edição vazia e confirmar CSV só com cabeçalho.

### Tests for User Story 1

- [X] T009 [P] [US1] `api/test/lib/csv.test.ts` — escapamento RFC 4180 (vírgula, aspas, quebra
  de linha, campo vazio, campo já sem caractere especial)
- [X] T010 [P] [US1] `exports.service.test.ts` — recorte por edição específica, recorte "todas",
  filtro de busca/data, edição vazia (CSV só com cabeçalho), edição inexistente
  (`SelectionProcessNotFoundError`)
- [X] T011 [P] [US1] `exports.routes.test.ts` — `GET /exports/candidates` com 401/403/200
  (`Content-Type: text/csv`, `Content-Disposition`)/404/400 (data inválida)

### Implementation for User Story 1

- [X] T012 [US1] `exports.service.ts`: `export(query, actorId)` — sem `include_sensitive` ainda
  (US2)
- [X] T013 [US1] `api/src/routes/exports.routes.ts`: `GET /candidates`,
  `[requireAuth, requireRole(ROLES.ADMIN)]`
- [X] T014 [US1] `exportsRouter` montado em `api/src/index.ts` sob `/exports`, CORS próprio
  (GET only) e `maintenanceGuard`

**Checkpoint**: US1 funcional e testável isoladamente — CSV básico, admin-only.

---

## Phase 4: User Story 2 - Admin inclui campos sensíveis de forma explícita (Priority: P2)

**Goal**: `include_sensitive=true` acrescenta `genero`/`etnia` ao final das colunas; ausente ou
`false` nunca as inclui.

**Independent Test**: exportar a mesma edição com e sem `include_sensitive=true` e comparar as
colunas do CSV resultante.

### Tests for User Story 2

- [X] T015 [P] [US2] `exports.service.test.ts` — `include_sensitive=true` acrescenta
  `genero`/`etnia` com valores corretos; `false`/ausente nunca inclui as colunas (nem vazias)
- [X] T016 [P] [US2] `exports.routes.test.ts` — `include_sensitive=true` reflete no CSV
  devolvido pela rota

### Implementation for User Story 2

- [X] T017 [US2] `exports.repository.ts`: `listForExport` lê `gender`/`ethnicity` só quando
  pedido (mesma postura de `dashboard.repository.metrics` — a coluna sensível não entra na
  consulta quando não é para sair, não é filtrada depois de lida)
- [X] T018 [US2] `exports.service.ts`: acrescenta as colunas sensíveis ao cabeçalho e às linhas
  só quando `query.include_sensitive`

**Checkpoint**: US1 + US2 funcionam juntas e isoladamente.

---

## Phase 5: User Story 3 - Toda exportação fica registrada (Priority: P1)

**Goal**: toda resposta `200` grava um `candidate_export_events` antes de devolver o corpo;
falha ao gravar derruba a exportação inteira.

**Independent Test**: exportar duas vezes (uma sem, outra com `include_sensitive=true`) e
consultar `candidate_export_events` diretamente, confirmando os dois registros com os campos
corretos.

### Tests for User Story 3

- [X] T019 [P] [US3] `exports.service.test.ts` — cada exportação bem-sucedida grava exatamente
  um evento, com `actor_id`, `process_id`/`process_label`, `included_sensitive_fields`,
  `row_count` corretos; falha do repositório ao gravar o evento propaga erro (não `Either`,
  falha técnica) e nenhum CSV é devolvido
- [X] T020 [P] [US3] `exports.routes.test.ts` — após uma chamada `200`, o evento existe no
  banco de teste

### Implementation for User Story 3

- [X] T021 [US3] `exports.repository.ts`: `recordExport(event)` — `INSERT` simples, sem
  `ON CONFLICT` (não há conflito possível: id novo a cada chamada)
- [X] T022 [US3] `exports.service.ts`: grava o evento ANTES de devolver as linhas do CSV ao
  handler da rota; propaga exceção do repositório sem capturar (vira `500` pelo
  `app.onError` global, não um `Either` — é falha técnica, não erro de domínio, conforme
  `error-handling` skill)

**Checkpoint**: as 3 user stories funcionam de ponta a ponta, isoladamente e em conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 `tsc --noEmit` limpo em `shared`/`api`; `npm run test --workspace=api` e
  `npm run test --workspace=shared` (se houver) passando
- [ ] T024 Aplicar `0012-candidate-export-events.sql` em staging, depois produção (Princípio
  III — staging antes, sempre) — **pendente, ação de infraestrutura fora do escopo desta
  implementação, e bloqueada por depender de `0010`/`0011` (FEAT-0009/0014) serem aplicadas
  primeiro, na ordem correta**

**Checkpoint final**: T001–T023 completas. T024 (deploy) fica para quando o Arthur autorizar —
e depois que `0010`/`0011` estiverem em staging/produção, na ordem.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 é o MVP real**: exportação básica já entrega o valor central da feature.
- **US3 tem a mesma prioridade de US1** (P1) mas depende do service de US1 existir — por isso
  vem depois na ordem de implementação, apesar de não ser "menos importante". A spec já
  registra isso: sem o registro de auditoria, a US1 sozinha não satisfaria FR-009.
- US2 e US3 tocam o mesmo `exports.service.ts`/`exports.repository.ts` criados em US1 — sem
  paralelismo de arquivo entre elas, mesma situação da 011.

## Implementation Strategy

### MVP First

1. Setup + Foundational (inclui `csv.ts`, testado isoladamente)
2. US1 → CSV básico, admin-only, filtrável
3. US3 → fecha o requisito de compliance que motivou a feature (P1, mas depende de US1 existir)
4. US2 → campos sensíveis opt-in
5. Polish → staging/produção (após 0010/0011)
