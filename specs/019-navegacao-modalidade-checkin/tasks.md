---

description: "Task list for 019 — Navegação por modalidade + check-in dividido"
---

# Tasks: Navegação por modalidade + check-in dividido

**Input**: Design documents from `/specs/019-navegacao-modalidade-checkin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/checkin-attendance-filter.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (contrato compartilhado)

- [X] T001 `shared/src/schemas/checkin.schema.ts`: `ListCandidatesQuerySchema` ganha
  `attendance: AttendanceSchema.optional()`

**Checkpoint**: `shared` builda sem erro de tipo.

---

## Phase 2: User Story 1 - Admin faz check-in só dos candidatos de uma modalidade (Priority: P1) 🎯 MVP

**Goal**: `GET /candidates?attendance=online|presencial` filtra items/total/totalCandidates/
attendanceSummary; cache não mistura modalidades.

**Independent Test**: cenários 1 e 2 do `quickstart.md`.

### Tests for User Story 1

- [X] T002 [P] [US1] `checkin.service.test.ts` — `listCandidates` com `attendance` filtra
  `items`, `pagination.total` e `totalCandidates`; sem `attendance`, comportamento igual a hoje
  (nenhuma regressão)
- [X] T003 [P] [US1] `checkin.routes.test.ts` — `GET /candidates?attendance=presencial` e
  `?attendance=online` — 200, `items` só da modalidade pedida

### Implementation for User Story 1

- [X] T004 [US1] `api/src/repositories/checkin.repository.ts`: `ListCandidatesParams` ganha
  `attendance?: Attendance`; `listCandidates` adiciona `COALESCE(a.saturday_restriction, 0) = ?`
  a `baseConditions` quando informado (1 = online, 0 = presencial)
- [X] T005 [US1] `api/src/lib/checkin-list-cache.ts`: `CachedListParams` ganha `attendance?:
  Attendance`; `keyFor` inclui no template da chave (research.md, Decisão 2 — sem isso as duas
  telas cacheiam cruzado)
- [X] T006 [US1] `api/src/services/checkin.service.ts`: `listCandidates`/`fetchAndCacheList`
  repassam `query.attendance`/`params.attendance` para `cacheParams` e para
  `CheckinRepository.listCandidates`

**Checkpoint**: US1 funcional e testável isoladamente via `curl`/testes — o filtro já funciona
na API, mesmo sem nenhuma tela nova ainda.

---

## Phase 3: User Story 2 - Navegação organizada por modalidade (Priority: P2)

**Goal**: `/painel/check-in/presencial` e `/painel/check-in/online` existem; `/painel/check-in`
redireciona; a sidebar mostra "Presencial"/"Online" como grupos.

**Independent Test**: cenários 3, 4 e 5 do `quickstart.md`.

### Implementation for User Story 2

- [X] T007 [US2] Extrair `front/app/painel/check-in/_components/checkin-screen.tsx` do
  `page.tsx` atual — mesmo corpo (filtros, `CandidateList`, debounce de busca), recebendo
  `attendance: Attendance` como prop fixa, passada para `useCandidatesQuery`
- [X] T008 [US2] [P] `front/app/painel/check-in/presencial/page.tsx` — NOVO,
  `<CheckInScreen attendance="presencial" />`
- [X] T009 [US2] [P] `front/app/painel/check-in/online/page.tsx` — NOVO,
  `<CheckInScreen attendance="online" />`
- [X] T010 [US2] `front/app/painel/check-in/page.tsx` — vira `redirect("/painel/check-in/presencial")`
  (mesmo padrão de `front/app/painel/grupos/page.tsx`, FEAT-0018)
- [X] T011 [US2] `front/components/painel/painel-nav.tsx` — remove o grupo "Grupos" e o item
  solto "Check-in"; adiciona `PainelNavGroup` "Presencial" (`Grupos Presenciais` +
  `Check-in Presencial`) e "Online" (`Grupos Online` + `Check-in Online`)

**Checkpoint**: as duas user stories funcionam de ponta a ponta — filtro na API (US1) e telas/
navegação alcançando ele (US2).

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T012 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; suíte completa de `api`
  passando; `npm run build --workspace=front` gera as duas rotas novas sem erro
- [X] T013 Cenários do `quickstart.md` conferidos: 1/2 (filtro + isolamento de cache) — `checkin.service.test.ts`/`checkin.routes.test.ts`; 3/4/5 (telas, redirect, nav) — verificados por leitura de código (build gerou as rotas; `redirect()` mesmo padrão já usado em `/painel/grupos`); sem verificação visual em navegador (não pedida)

**Checkpoint final**: T001–T013 completos. Deploy fica fora deste `tasks.md` — sem migration.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **US1** → **US2**: US2 (telas/nav) depende do filtro já existir na API
  (US1) pra ter o que consumir — não são de fato independentes apesar da numeração de user
  story, a ordem P1→P2 aqui é também a ordem de dependência real.

## Implementation Strategy

### MVP First

1. Setup + US1 → filtro funcional na API, testável por `curl`
2. US2 → telas e navegação alcançando o filtro
3. Polish → build/testes, checklist do quickstart
