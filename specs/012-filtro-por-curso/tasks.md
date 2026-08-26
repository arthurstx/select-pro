# Tasks: Filtro por Curso nas Listagens de Candidatos

**Input**: Design documents from `specs/012-filtro-por-curso/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/course-filter.md, quickstart.md

**Tests**: Incluídos — Princípio V da constitution ("Backend Novo Vem Com Testes") exige teste de service e de rota para qualquer mudança de contrato de rota existente, o que se aplica aqui mesmo sem rota nova.

**Organization**: US1 = check-in (P1, MVP), US2 = dashboard (P2). Ambas dependem da Fase 2 (contrato compartilhado).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 (check-in) ou US2 (dashboard)

## Phase 1: Setup

Nenhuma tarefa de setup de infraestrutura — a stack, os workspaces e as ferramentas de lint/test já existem no monorepo e não mudam nesta feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contrato compartilhado (`shared/`) do qual US1 e US2 dependem. Constitution Princípio I: nenhuma implementação em `api/`/`front/` antes do schema existir.

**⚠️ CRITICAL**: Nenhuma tarefa de US1/US2 pode começar antes de T001 e T002 estarem prontos.

- [x] T001 [P] Adicionar `course: CourseSchema.optional()` a `ListCandidatesQuerySchema` em `shared/src/schemas/checkin.schema.ts`
- [x] T002 [P] Adicionar `course: CourseSchema.optional()` a `DashboardCandidatesQuerySchema` em `shared/src/schemas/dashboard.schema.ts`
- [x] T003 `npx tsc --noEmit --project shared/tsconfig.json` para confirmar que os dois schemas compilam antes de seguir para `api/`/`front/`

**Checkpoint**: Contrato em `shared/` pronto — US1 e US2 podem prosseguir em paralelo.

---

## Phase 3: User Story 1 - Filtrar candidatos por curso no check-in (Priority: P1) 🎯 MVP

**Goal**: Um avaliador consegue restringir a lista de check-in a um curso específico, combinando com busca e status já existentes.

**Independent Test**: `GET /candidates?course=eng-computacao` retorna só candidatos daquele curso, com paginação recalculada; `/painel/check-in` reflete isso na UI sem afetar os demais filtros.

### Tests for User Story 1 ⚠️

> Escrever estes casos ANTES da implementação e confirmar que falham (o campo `course` ainda não existe no filtro/repositório).

- [x] T004 [P] [US1] Adicionar casos de teste em `api/test/checkin.service.test.ts`: filtro por `course` retorna só itens do curso pedido; combinação de `course` + `status` + `search` aplica E lógico; `course` ausente mantém comportamento atual
- [x] T005 [P] [US1] Adicionar caso de teste em `api/test/checkin.routes.test.ts`: `GET /candidates?course=<inválido>` retorna `400` com `code: "VALIDATION_ERROR"` e `field: "course"`

### Implementation for User Story 1

- [x] T006 [US1] Adicionar `course?: Course` a `ListCandidatesParams` em `api/src/repositories/checkin.repository.ts`; incluir `AND c.course = ?` em `conditions`/`bindings` dentro de `listCandidates` quando presente (depende de T001)
- [x] T007 [US1] Adicionar `course?: Course` a `CachedListParams` em `api/src/lib/checkin-list-cache.ts` **E** incluir `params.course ?? ""` na string template de `keyFor` (linha `` `checkin:list:${processId}:${generation}:${params.page}:${params.perPage}:${params.status}:${search}` ``) — `keyFor` interpola campo a campo, não deriva a chave do objeto inteiro; só estender a interface sem tocar o template deixaria a chave de cache igual entre cursos diferentes e serviria lista errada (achado E1 do `/speckit-analyze`) (depende de T001)
- [x] T008 [US1] Repassar `query.course` de `CheckinService.listCandidates` (`api/src/services/checkin.service.ts`) para `CachedListParams` e para `CheckinRepository.listCandidates` (depende de T006, T007)
- [x] T009 [US1] Rodar `npm run test --workspace=api -- checkin` e confirmar que T004/T005 passam
- [x] T010 [P] [US1] Criar `CourseFilter` em `front/components/painel/course-filter.tsx`: `<select>`/combobox (componentes `front/components/ui/`) com opção "Todos os cursos" + os 8 valores de `COURSE_LABELS` (de `shared`), no padrão visual de `role="group"`/rótulo acessível já usado em `filters-bar.tsx`
- [x] T011 [US1] Integrar `CourseFilter` em `front/app/painel/check-in/_components/filters-bar.tsx` (nova prop `course`/`onCourseChange`) e em `front/app/painel/check-in/page.tsx` (novo campo `course` no estado `Filters`, resetando `page` para 1 ao mudar, e repassando para `useCandidatesQuery`) (depende de T010)
- [x] T012 [US1] `npx tsc --noEmit --project front/tsconfig.json` e `npx tsc --noEmit --project api/tsconfig.json` para confirmar tipos ponta a ponta de US1

**Checkpoint**: Check-in filtra por curso de ponta a ponta — testável isoladamente, entregável como MVP.

---

## Phase 4: User Story 2 - Filtrar candidatos por curso no dashboard (Priority: P2)

**Goal**: A tabela de inscritos do dashboard filtra por curso, sem afetar os gráficos de métricas.

**Independent Test**: `GET /dashboard/candidates?course=arquitetura` retorna só aquele curso; `GET /dashboard/metrics` continua inalterado; `/painel` reflete o filtro só na tabela.

### Tests for User Story 2 ⚠️

- [x] T013 [P] [US2] Adicionar casos de teste em `api/test/dashboard.service.test.ts`: filtro por `course` na listagem; combinação com `process_id`/`search`/`from`/`to`/`sort`; confirmar que `metrics()` não aceita nem é afetado por `course`
- [x] T014 [P] [US2] Adicionar caso de teste em `api/test/dashboard.routes.test.ts`: `GET /dashboard/candidates?course=<inválido>` retorna `400`

### Implementation for User Story 2

- [x] T015 [US2] Adicionar `course?: Course` a `ListCandidatesFilters` em `api/src/repositories/dashboard.repository.ts`; incluir a condição de `course` em `listCandidates` junto de `processId`/`search`/`from`/`to` (depende de T002)
- [x] T016 [US2] Repassar `query.course` de `DashboardService.listCandidates` (`api/src/services/dashboard.service.ts`) para `DashboardRepository.listCandidates` e incluir `query.course ?? ""` no array de `keyFor("candidates", role, [...])` (depende de T015)
- [x] T017 [US2] Rodar `npm run test --workspace=api -- dashboard` e confirmar que T013/T014 passam
- [x] T018 [US2] Integrar o mesmo `CourseFilter` (`front/components/painel/course-filter.tsx`, de T010) em `front/app/painel/dashboard-screen.tsx`: novo campo `course` em `Filters`, resetando `page` para 1 ao mudar, repassado só para `useDashboardCandidatesQuery` — nunca para `useDashboardMetricsQuery` (depende de T010). Também ajustado `front/lib/dashboard/queries.ts` (comparação de `sameFilter` do `placeholderData`) e `front/lib/dashboard/api.ts` (`candidatesQueryString`) para incluir `course` — não estavam listados nominalmente em T018, mas são o mesmo padrão já aplicado a `search`/`from`/`to`/`sort` e ficariam quebrados sem o ajuste.
- [x] T019 [US2] `npx tsc --noEmit --project front/tsconfig.json` para confirmar tipos de US2

**Checkpoint**: Ambas as telas filtram por curso, com o mesmo componente e o mesmo contrato de query param.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verificação de ponta a ponta e fechamento do ciclo SDD.

- [ ] T020 Rodar `npm run test --workspace=api` completo (suíte inteira, não só os arquivos tocados) e confirmar 0 falhas
- [ ] T021 [P] Rodar `npx tsc --noEmit --project shared/tsconfig.json`, `npx tsc --noEmit --project api/tsconfig.json`, `npx tsc --noEmit --project front/tsconfig.json`
- [ ] T022 Rodar `npm run build --workspace=front` e confirmar build limpo
- [ ] T023 Validar manualmente os comandos `curl` de `specs/012-filtro-por-curso/quickstart.md` contra `wrangler dev` local (sem abrir o Browser pane sem autorização prévia)
- [ ] T024 Revisar `specs/012-filtro-por-curso/spec.md`/`plan.md` contra o código final — confirmar que nenhuma Assumption documentada foi invalidada pela implementação

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Sem dependências externas — schemas em `shared/`. BLOQUEIA US1 e US2.
- **US1 (Phase 3)**: Depende só da Fase 2. Pode ser entregue sozinha como MVP.
- **US2 (Phase 4)**: Depende só da Fase 2. Reutiliza o componente `CourseFilter` criado em T010 (US1) — por isso T018 depende de T010, mas o restante de US2 (backend) é independente de US1.
- **Polish (Phase 5)**: Depende de US1 e US2 completas.

### Parallel Opportunities

- T001/T002 em paralelo (arquivos `shared/` diferentes).
- T004/T005 em paralelo entre si; T013/T014 em paralelo entre si.
- Depois da Fase 2, o backend de US1 (T006-T009) e o backend de US2 (T015-T017) podem avançar em paralelo por pessoas diferentes — só o front de US2 (T018) espera o componente de T010.
- T021 (tsc dos três workspaces) roda em paralelo internamente.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 2 (Foundational).
2. Completar Fase 3 (US1 — check-in).
3. Parar e validar: `GET /candidates?course=...` e a tela de check-in funcionando isoladamente.
4. US2 (dashboard) pode esperar um ciclo de revisão sem bloquear a entrega do check-in.

### Incremental Delivery

1. Fase 2 → contrato pronto.
2. US1 → check-in filtra por curso → validar → (opcionalmente) demo/merge.
3. US2 → dashboard filtra por curso, reaproveitando o componente de US1 → validar.
4. Fase 5 → verificação completa antes de considerar a feature pronta para revisão humana.
