---
description: "Task list template for feature implementation"
---

# Tasks: Avaliação dos candidatos

**Input**: Design documents from `/specs/013-avaliacao-candidatos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/evaluation-api.md, quickstart.md

**Tests**: incluídos — Princípio V da constitution não é opcional.

**Organization**: por user story (US1 avaliador, US2 admin — as duas P1).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Criar migration `api/migrations/0015-candidate-evaluation.sql`: dropar `metrics`
      (sem substituta) e recriar `evaluations` (`user_id`, `candidate_id`, `overall_color`
      CHECK RED/YELLOW/GREEN, `feedback`, `UNIQUE (user_id, candidate_id)`) +
      `evaluation_scores` (`evaluation_id`, `criterion` CHECK dos 5 valores fixos, `score`
      CHECK 0-5) — schema exato em `data-model.md`. Comentário no topo confirmando
      staging/produção vazias antes de aplicar lá (mesmo padrão da migration `0014`).
- [X] T002 [P] Criar `shared/src/schemas/evaluation.schema.ts`: `EvaluationCriterionSchema`
      (5 valores fixos), `CRITERION_WEIGHTS`, `deriveWeightedScore(scores)`,
      `EvaluationColorSchema` (RED/YELLOW/GREEN — reaproveitar se já existir algo
      equivalente), `SubmitEvaluationSchema`, `MyGroupCandidateSchema`,
      `MyGroupResponseSchema`, `AdminCandidateSummarySchema`,
      `AdminCandidatesListResponseSchema`, `AdminCandidateDetailResponseSchema`,
      `EvaluationErrorCode` (`NOT_IN_ANY_GROUP`, `CANDIDATE_NOT_IN_EVALUATOR_GROUP`,
      `CANDIDATE_NOT_FOUND`) — shapes exatos em `contracts/evaluation-api.md`.
- [X] T003 [P] Exportar `evaluation.schema` em `shared/src/index.ts`.

**Checkpoint**: contratos existem; `tsc --noEmit` limpo em `shared`.

---

## Phase 2: Foundational (bloqueia todas as user stories)

- [X] T004 Criar `api/src/core/errors/evaluation-errors.ts`: `NotInAnyGroupError`,
      `CandidateNotInEvaluatorGroupError`, `CandidateNotFoundError` (reaproveitar se já
      existir um erro genérico de candidato não encontrado em outro módulo — conferir
      `checkin-errors.ts` antes de duplicar).
- [X] T005 Criar `api/src/repositories/evaluation.repository.ts`: `findByEvaluatorAndCandidate`,
      `upsert` (transacional — `evaluations` + `evaluation_scores`, `db.batch`, delete+insert
      das 5 notas), `listForCandidate` (todas as avaliações + notas + nome do avaliador,
      para o detalhe do admin), `countForCandidate`, `listVerdictInputsForProcess` (todas as
      cores por candidato presente na edição, para calcular veredito em lote na listagem do
      admin sem N+1 queries).
- [X] T006 [P] Criar `api/src/services/evaluation-verdict.ts`: função pura
      `computeVerdict(colors: EvaluationColor[]): "pendente" | "aprovado" | "reprovado"`
      (D2 antes de D6, research.md D-tech4) — sem I/O, testável isolada.
- [X] T007 [P] `api/test/evaluation-verdict.test.ts`: testes unitários de `computeVerdict` —
      0 avaliações, 1 verde, 2 verdes, 1 vermelha isolada, 1 vermelha entre várias verdes,
      3 avaliações sem vermelha.
- [X] T008 Criar `api/src/services/evaluation.service.ts`: `submit(userId, candidateId, ...)`
      (checa elegibilidade via `GroupRepository.findEvaluatorGroup`/`findCandidateGroup`,
      já existentes da FEAT-0012, compara `group.id`, então `upsert`), `myGroup(userId)`
      (lista candidatos do grupo do avaliador + `evaluationCount` + `myEvaluation`),
      `adminList()`, `adminDetail(candidateId)`.
- [X] T009 Criar `api/src/routes/evaluation.routes.ts`: as 4 rotas de
      `contracts/evaluation-api.md` — `GET /evaluations/my-group` e
      `PUT /evaluations/candidates/{candidateId}` com `requireRole(ROLES.AVALIADOR)`
      (host também tem `role_id = 'avaliador'`, sem distinção aqui); as duas `admin/*` com
      `requireRole(ROLES.ADMIN)`.
- [X] T010 Registrar `app.route("/evaluations", evaluationRouter)` em `api/src/index.ts` **e**
      adicionar `/evaluations/*` aos blocos de `cors()` e `maintenanceGuard()` no mesmo
      arquivo — não repetir o esquecimento da FEAT-0010/primeira versão da FEAT-0012 (ver
      plan.md, nota de lição aprendida). `allowMethods`: GET, PUT, OPTIONS.

**Checkpoint**: as 4 rotas existem e respondem (mesmo que só os casos felizes ainda não
tenham UI) — base pronta para as user stories.

---

## Phase 3: User Story 1 - Avaliador/host avalia um candidato do seu grupo (Priority: P1) 🎯 MVP

**Goal**: avaliador abre a lista do próprio grupo e registra/edita avaliações.

**Independent Test**: avaliador alocado a um grupo com candidatos → `GET /evaluations/my-group`
lista os candidatos; `PUT .../candidates/{id}` salva; reenviar edita, não duplica; tentar
avaliar candidato de outro grupo é bloqueado.

### Tests

- [X] T011 [P] [US1] `api/test/evaluation.service.test.ts`: `submit`/`myGroup` com D1 real
      — fluxo feliz (registra, aparece em `myGroup`), reenvio edita (não duplica, `UNIQUE`
      não estoura), `NOT_IN_ANY_GROUP` (avaliador sem grupo), `CANDIDATE_NOT_IN_EVALUATOR_GROUP`
      (candidato de outro grupo), `evaluationCount` soma avaliações de outros avaliadores
      sem expor o conteúdo delas (FR-005).
- [X] T012 [P] [US1] `api/test/evaluation.routes.test.ts`: `GET /evaluations/my-group` e
      `PUT /evaluations/candidates/{id}` — 200 nos casos válidos, 401/403 fora de
      avaliador/host, 409 nos erros de domínio, 400 para `scores` incompleto ou fora de 0-5
      (validação Zod).

### Implementation

- [ ] T013 [P] [US1] Criar `front/lib/evaluation/api.ts`: `getMyGroup()`,
      `submitEvaluation(candidateId, payload)` (mesmo padrão `authFetch` + `toApiError`).
- [ ] T014 [P] [US1] Criar `front/lib/evaluation/queries.ts`: `useMyGroupQuery`,
      `useSubmitEvaluationMutation` (invalida a query em `onSuccess`).
- [ ] T015 [US1] Criar `front/app/painel/minhas-avaliacoes/_components/evaluation-form.tsx`:
      5 campos de nota (0-5, `react-hook-form` + `zodResolver(SubmitEvaluationSchema)`),
      seletor de cor geral, campo de comentário opcional.
- [ ] T016 [US1] Criar `front/app/painel/minhas-avaliacoes/_components/candidate-evaluation-card.tsx`:
      nome do candidato, `evaluationCount`, abre `evaluation-form.tsx` pré-preenchido quando
      `myEvaluation` já existe.
- [ ] T017 [US1] Criar `front/app/painel/minhas-avaliacoes/page.tsx`: lista via
      `useMyGroupQuery`, trata `NOT_IN_ANY_GROUP` e `NO_ACTIVE_SELECTION_PROCESS` com
      `StateMessage`.
- [ ] T018 [US1] Adicionar item de navegação "Minhas Avaliações" em
      `front/components/painel/painel-nav.tsx`.

**Checkpoint**: US1 completa e testável de forma independente.

---

## Phase 4: User Story 2 - Admin acompanha o veredito de cada candidato (Priority: P1)

**Goal**: admin vê lista agregada (contagem + veredito) e detalhe por candidato.

**Independent Test**: candidatos em diferentes situações (0, 1 verde, 2 verdes, 1 vermelha
entre várias) → `GET /evaluations/admin/candidates` mostra o veredito correto para cada um;
`GET .../admin/candidates/{id}` mostra o detalhe de cada avaliação com autor.

### Tests

- [X] T019 [P] [US2] `api/test/evaluation.service.test.ts` (T011 revisitado): `adminList`/
      `adminDetail` — veredito por D2/D6 nos 6 cenários dos Acceptance Scenarios da US2,
      `weightedScore` calculado corretamente, detalhe traz `evaluatorName` de cada avaliação.
- [X] T020 [P] [US2] `api/test/evaluation.routes.test.ts` (T012 revisitado):
      `GET /evaluations/admin/candidates` e `.../admin/candidates/{id}` — 200, 401/403 fora
      de admin, 404 para candidato inexistente no detalhe.

### Implementation

- [ ] T021 [P] [US2] `front/lib/evaluation/api.ts` (T013): `getAdminCandidates()`,
      `getAdminCandidateDetail(candidateId)`.
- [ ] T022 [P] [US2] `front/lib/evaluation/queries.ts` (T014): `useAdminCandidatesQuery`,
      `useAdminCandidateDetailQuery`.
- [ ] T023 [US2] Criar `front/app/painel/avaliacoes/_components/verdict-badge.tsx`: badge
      colorido por veredito (pendente/aprovado/reprovado).
- [ ] T024 [US2] Criar `front/app/painel/avaliacoes/_components/evaluation-detail-sheet.tsx`:
      painel lateral (shadcn `Sheet`) com as avaliações de um candidato — notas, cor,
      comentário, autor, pontuação ponderada.
- [ ] T025 [US2] Criar `front/app/painel/avaliacoes/page.tsx`: tabela de candidatos
      (`Table`, mesmo padrão de `/painel/rooms`/`avaliadores`) com contagem, veredito
      (`verdict-badge.tsx`) e pontuação; clique abre `evaluation-detail-sheet.tsx`.
- [ ] T026 [US2] Adicionar item de navegação "Avaliações" em
      `front/components/painel/painel-nav.tsx`.

**Checkpoint**: US1 + US2 completas — feature ponta a ponta.

---

## Phase 5: Polish

- [ ] T027 [P] Rodar suíte completa (`api`, `shared`), `tsc --noEmit`/`next build` em
      `shared`/`api`/`front` — precisa passar antes de considerar a feature pronta.
- [ ] T028 [P] Atualizar `task.md`/`CONTEXT.md`: mover FEAT-0013 para "Concluído", registrar
      decisões tomadas durante a implementação que não estavam previstas no plan.
- [ ] T029 Validar manualmente os 9 cenários de `quickstart.md` via `wrangler dev` + `curl`
      quando `api/.dev.vars`/usuário admin estiverem disponíveis — mesma pendência já
      documentada nas FEAT-0010/0012 se não for possível neste ambiente.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: sem dependências.
- **Foundational (T004–T010)**: depende do Setup. Bloqueia as user stories. T006/T007
  paralelizáveis com o resto.
- **US1 (T011–T018)**: depende do Foundational. Front (T013–T018) depende do contrato
  (T002/T003), pode ser feito em paralelo ao backend depois que o contrato existir.
- **US2 (T019–T026)**: depende do Foundational. Não depende de US1 no código (rotas e
  telas diferentes), mas compartilha `evaluation.service.ts`/`.repository.ts` — na prática,
  mais simples de sequenciar depois de US1 para reaproveitar os testes já escritos no mesmo
  arquivo (`evaluation.service.test.ts`/`evaluation.routes.test.ts`).
- **Polish (T027–T029)**: depende de US1 e US2 completas.

## Parallel Example: Foundational

```bash
Task: "Criar api/src/core/errors/evaluation-errors.ts"                    # T004
Task: "Criar evaluation-verdict.ts (função pura D2/D6)"                   # T006
Task: "Criar evaluation-verdict.test.ts (unit, sem D1)"                   # T007
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup → Foundational → US1.
2. **STOP e valide**: avaliador consegue avaliar candidatos do próprio grupo ponta a ponta.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → avaliação funcionando (MVP).
3. US2 → admin acompanha veredito.
4. Polish → suíte completa, documentação de estado atualizada.
