---
description: "Task list template for feature implementation"
---

# Tasks: Descrição de necessidades especiais

**Input**: Design documents from `/specs/014-necessidades-especiais-descricao/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/post-candidate.md, quickstart.md

**Tests**: Incluídos — Princípio V da constituição ("Backend Novo Vem Com Testes") exige
`<feature>.service.test.ts` e `<feature>.routes.test.ts` atualizados para toda mudança de
rota/service, mesmo quando a rota já existe.

**Organization**: Tarefas agrupadas por user story (spec.md). Ordem de implementação segue o
Princípio II: contrato compartilhado → `api/` → `front/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência entre si)
- **[Story]**: US1, US2, US3 — mapeiam para as user stories do spec.md

---

## Phase 1: Setup

Nenhuma tarefa de setup nova — o worktree já está inicializado (`npm install`,
`api/.dev.vars` copiado). A migration `0011` é tratada na Fase 2 (Foundational), não aqui,
porque é pré-requisito bloqueante do contrato, não infraestrutura genérica.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contrato compartilhado e schema de banco — bloqueiam toda user story, pois tanto
`api/` quanto `front/` importam de `shared/` e a coluna precisa existir antes de qualquer
INSERT/SELECT novo.

**⚠️ CRITICAL**: Nenhuma tarefa das Fases 3-5 pode começar antes desta fase.

- [ ] T001 Criar migration aditiva `api/migrations/0011-special-needs-description.sql` com
      `ALTER TABLE candidate_applications ADD COLUMN special_needs_description TEXT;`
      (ver data-model.md — sem CHECK, sem DEFAULT, nullable)
- [ ] T002 Aplicar a migration localmente com
      `npx wrangler d1 execute select-pro --local --file migrations/0011-special-needs-description.sql`
      (dentro de `api/`), confirmando antes o estado da tabela e depois que linhas
      existentes vieram com `special_needs_description = NULL` (quickstart.md, passo 1).
      **NUNCA aplicar em staging/produção.**
- [ ] T003 [P] Atualizar `CandidateApplicationRow` e `NewCandidateApplication` em
      `shared/src/schemas/database.schema.ts` com `special_needs_description: string | null`
- [ ] T004 [P] Em `shared/src/schemas/candidate.schema.ts`: extrair `AvailabilityStepFields`
      (objeto plano, sem efeitos) com o campo novo
      `specialNeedsDescription: z.string().trim().max(500, "Máximo de 500 caracteres").optional()`,
      criar a função `requireDescriptionWhenSpecialNeeds` (superRefine que exige o campo
      quando `specialNeeds === true`, path `["specialNeedsDescription"]`), redefinir
      `AvailabilityStepSchema = AvailabilityStepFields.superRefine(requireDescriptionWhenSpecialNeeds)`,
      e no `RegisterRequestSchema` trocar `.merge(AvailabilityStepSchema)` por
      `.merge(AvailabilityStepFields)` e encadear
      `.superRefine(requireDescriptionWhenSpecialNeeds)` junto do `requireOtherWhenOutros`
      já existente (data-model.md, seção "Contrato Zod — request")
- [ ] T005 [P] Em `shared/src/schemas/dashboard.schema.ts`: adicionar
      `specialNeedsDescription: z.string().nullable()` em `CandidateApplicationDetailSchema`
      (não mexer em `DashboardTotalsSchema`, `DashboardCandidateItemSchema` nem
      `CandidateCheckinItemSchema` — FR-008, FR-009, FR-010)
- [ ] T006 Rodar `npx tsc --noEmit --project shared/tsconfig.json` e confirmar que compila

**Checkpoint**: Contrato e schema de banco prontos — user stories podem começar.

---

## Phase 3: User Story 1 - Candidato descreve sua necessidade especial na inscrição (Priority: P1) 🎯 MVP

**Goal**: O candidato consegue descrever a necessidade especial no formulário de inscrição
quando marca "Sim", com validação de obrigatoriedade e limite de tamanho, e o dado é
persistido em `candidate_applications`.

**Independent Test**: Preencher o formulário de inscrição até a etapa de disponibilidade,
marcar "Sim" para necessidade especial, preencher a descrição e confirmar que o envio é
aceito e gravado; confirmar que "Sim" sem descrição é rejeitado; confirmar que "Não" nunca
persiste texto mesmo se enviado.

### Tests for User Story 1

- [ ] T007 [P] [US1] Em `api/test/candidates.service.test.ts`: adicionar casos —
      `specialNeeds: true` + descrição válida grava `special_needs_description`;
      `specialNeeds: false` com `specialNeedsDescription` enviado grava `null` (FR-004)
- [ ] T008 [P] [US1] Em `api/test/candidates.routes.test.ts`: adicionar caso — `POST
      /candidate/register` com `specialNeeds: true` e `specialNeedsDescription` ausente ou
      só espaços retorna `422` com issue em `specialNeedsDescription`; caso com descrição de
      501 caracteres também retorna `422`

### Implementation for User Story 1

- [ ] T009 [US1] Em `api/src/repositories/candidates.repository.ts`: adicionar
      `special_needs_description: string | null` em `CandidateWithApplicationRow`; incluir a
      coluna no `INSERT INTO candidate_applications` de `insertWithApplication` e no `SELECT`
      de `listAllWithApplication` (sync com planilha)
- [ ] T010 [US1] Em `api/src/services/candidates.service.ts`: montar
      `newApplication.special_needs_description` como
      `input.specialNeeds ? (input.specialNeedsDescription ?? null) : null` (mesmo padrão
      ternário de `referral_source_other`, ver data-model.md)
- [ ] T011 [US1] Em `api/src/services/sheet-sync.service.ts`: incluir a coluna
      `special_needs_description` (texto cru, sem `yesNo()` — é descrição, não boolean) na
      linha exportada para a planilha do Google Sheets, junto de `special_needs`. Decisão de
      escopo (Assumption, sem como confirmar com o Arthur em tempo real): a sync já exporta o
      boolean para a comissão preparar o evento; a descrição segue o mesmo caminho por
      coerência — é a mesma sensibilidade e o mesmo público (a comissão), então não faz
      sentido levar um e reter o outro. Revisar antes do merge se a planilha tiver um público
      mais amplo do que a comissão.
- [ ] T012 [P] [US1] Em `front/app/inscricao/_components/availability-step-form.tsx`:
      adicionar um `Textarea` controlado (`Controller` + `name="specialNeedsDescription"`)
      exibido condicionalmente logo abaixo do campo `specialNeeds` quando
      `field.value === true` (usar `useWatch({ control: form.control, name: "specialNeeds"
      })` — nunca `form.watch()`, conforme convenção do projeto); limpar o valor do campo
      (`form.setValue("specialNeedsDescription", undefined)`) quando o candidato muda de
      "Sim" para "Não", para não reenviar texto obsoleto (Acceptance Scenario 4)
- [ ] T013 [US1] Em `front/app/inscricao/_lib/wizard-guards.ts`: atualizar `isStepComplete`
      case 5 para exigir `specialNeedsDescription` preenchido quando `specialNeeds === true`,
      espelhando o padrão já usado no case 2 para `referralSourceOther`
- [ ] T014 [US1] Rodar `npm run test --workspace=api` e confirmar que os testes de T007/T008
      passam

**Checkpoint**: Inscrição com necessidade especial descrita funciona ponta a ponta
(front → contrato → persistência). MVP entregável.

---

## Phase 4: User Story 2 - Comissão vê a descrição ao consultar o detalhe de um candidato (Priority: P2)

**Goal**: Avaliador/host/admin veem a descrição de necessidade especial na tela de detalhe de
um candidato específico, com indicação clara quando o dado não foi informado (candidato
legado).

**Independent Test**: Abrir o detalhe de um candidato de teste com `specialNeeds = true` e
descrição cadastrada (via seed/fixture) e confirmar que o texto aparece; abrir o detalhe de
um candidato legado com `specialNeeds = true` e `special_needs_description = NULL` e
confirmar que aparece uma indicação de "não informado" sem quebrar a tela.

### Tests for User Story 2

- [ ] T015 [P] [US2] Em `api/test/dashboard.service.test.ts`: adicionar caso — `detail()`
      retorna `application.specialNeedsDescription` com o texto gravado; caso — candidato com
      `special_needs = 1` e `special_needs_description = null` retorna
      `specialNeedsDescription: null` sem erro (FR-007)
- [ ] T016 [P] [US2] Em `api/test/dashboard.routes.test.ts`: adicionar caso — `GET
      /dashboard/candidates/{id}` inclui `data.application.specialNeedsDescription` na
      resposta, para qualquer papel autenticado que já vê `application` hoje (avaliador,
      host, admin — sem gate de `role === ADMIN`, ver Assumption da spec)

### Implementation for User Story 2

- [ ] T017 [US2] Em `api/src/repositories/dashboard.repository.ts`: adicionar
      `special_needs_description: string | null` em `DashboardCandidateDetailRow` e incluir
      `a.special_needs_description` no `SELECT` de `findDetail` (não é condicional a
      `includeDemographics` — lido sempre, como `special_needs`)
- [ ] T018 [US2] Em `api/src/services/dashboard.service.ts`: mapear
      `row.special_needs_description` para `application.specialNeedsDescription` no retorno
      de `detail()`
- [ ] T019 [US2] Em `front/app/painel/_components/candidate-detail-sheet.tsx`: exibir a
      descrição logo abaixo do `Field` existente "Com necessidade especial", só quando
      `detail.application.specialNeeds` for `true`; se
      `detail.application.specialNeedsDescription` for `null`, mostrar um texto indicando
      "Não informado" em vez de campo vazio (mesmo estilo `whitespace-pre-line` usado em
      "Experiências"/"Motivação")
- [ ] T020 [US2] Rodar `npm run test --workspace=api` e confirmar que os testes de
      T015/T016 passam

**Checkpoint**: Comissão consegue ver a descrição no detalhe do candidato, inclusive para
candidatos legados sem quebrar a tela.

---

## Phase 5: User Story 3 - A descrição não vaza para telas que não deveriam exibi-la (Priority: P3)

**Goal**: Confirmar — com testes de regressão explícitos, não apenas "por construção" — que a
descrição nunca aparece na listagem paginada, no check-in nem no agregado do dashboard.

**Independent Test**: Inspecionar as respostas de listagem, check-in e métricas agregadas
para um candidato de teste com descrição cadastrada e confirmar ausência do campo em todas.

### Tests for User Story 3

- [ ] T021 [P] [US3] Em `api/test/dashboard.service.test.ts`: adicionar caso — `metrics()`
      retorna `totals.specialNeeds` como número, e o objeto `totals` não contém nenhuma
      chave com texto de descrição (regressão para FR-010)
- [ ] T022 [P] [US3] Em `api/test/dashboard.routes.test.ts`: adicionar caso — `GET
      /dashboard/candidates` (listagem) não inclui `specialNeedsDescription` nem
      `specialNeeds` em nenhum item retornado, mesmo para um candidato de teste com
      descrição cadastrada (regressão para FR-008)
- [ ] T023 [P] [US3] Em `api/test/checkin.routes.test.ts`: adicionar caso — a resposta de
      `GET /candidates` (rota de check-in, montada em `api/src/index.ts` via
      `checkinRouter`) não inclui `specialNeedsDescription` nem `specialNeeds` para nenhum
      candidato (regressão para FR-009)

### Implementation for User Story 3

Nenhuma implementação nova — a ausência do campo nessas três superfícies já é garantida por
construção nas Fases 2/4 (T005 não altera `DashboardTotalsSchema`,
`DashboardCandidateItemSchema` nem `CandidateCheckinItemSchema`; os repositories dessas rotas
não são tocados). Esta fase é puramente de verificação/regressão.

- [ ] T024 [US3] Rodar `npm run test --workspace=api` e confirmar que os testes de
      T021/T022/T023 passam

**Checkpoint**: Todas as três user stories funcionam de ponta a ponta e o dado sensível não
vaza para superfícies não autorizadas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Rodar `npx tsc --noEmit --project api/tsconfig.json` e
      `npx tsc --noEmit --project front/tsconfig.json`, corrigindo qualquer erro de tipo
      residual (ex. locais que constroem `CandidateApplicationRow`/`NewCandidateApplication`
      manualmente, como seeds/fixtures de teste)
- [ ] T026 Rodar `npm run build --workspace=front` e confirmar build limpo
- [ ] T027 Rodar a suíte completa (`npm run test --workspace=api`) uma última vez, todos os
      testes verdes
- [ ] T028 Executar a validação end-to-end via `curl` descrita em `quickstart.md` (passos
      4 e 5) contra `wrangler dev` local — sem abrir o Browser pane sem autorização explícita
- [ ] T029 Atualizar `api/scripts/seed-local.sql` com valores de exemplo para
      `special_needs_description` em ao menos uma linha de seed com `special_needs = 1`, para
      que o quickstart e testes manuais tenham dado de exemplo
- [ ] T030 Revisar `specs/014-necessidades-especiais-descricao/checklists/requirements.md`
      e confirmar que nenhum item ficou pendente após a implementação

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: sem dependências externas — mas T002 (aplicar migration)
  depende de T001; T004/T005 são independentes entre si e de T001-T003; T006 depende de
  T003, T004 e T005.
- **User Story 1 (Phase 3)**: depende de Phase 2 completa (precisa do contrato e da coluna
  existirem). Sem dependência de US2/US3.
- **User Story 2 (Phase 4)**: depende de Phase 2 completa. Não depende de US1 para os testes
  de leitura (pode usar fixtures/seed direto no banco), mas o cenário de ponta a ponta
  realista (candidato inscrito via US1 e depois consultado via US2) fica mais fácil de
  validar manualmente com US1 já pronta.
- **User Story 3 (Phase 5)**: depende de Phase 2 e Phase 4 (precisa que
  `CandidateApplicationDetailSchema` já tenha o campo para testar que as OUTRAS respostas
  não o replicam por engano).
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- T003, T004, T005 (Phase 2) — arquivos diferentes, podem rodar em paralelo.
- T007, T008 (Phase 3, testes) — arquivos diferentes.
- T012 (front) pode rodar em paralelo com T009-T011 (api) depois que T004 estiver pronto,
  já que ambos consomem o mesmo contrato mas não se tocam.
- T015, T016 (Phase 4, testes) — arquivos diferentes.
- T021, T022, T023 (Phase 5, testes) — arquivos diferentes.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 2 (Foundational) — contrato e migration.
2. Completar Phase 3 (User Story 1) — inscrição com descrição funciona ponta a ponta.
3. **PARAR e VALIDAR**: rodar `npm run test --workspace=api` e o `curl` de registro do
   quickstart.md.
4. Nesse ponto já existe valor entregável: candidatos passam a descrever a necessidade,
   mesmo que a comissão ainda não veja isso em nenhuma tela (US2 pendente).

### Incremental Delivery

1. Foundational → US1 (MVP: dado é coletado e persistido)
2. + US2 (comissão passa a ver o dado no detalhe do candidato)
3. + US3 (garantia de não vazamento, com testes de regressão)
4. Polish (tipos, build, seed, checklist)
