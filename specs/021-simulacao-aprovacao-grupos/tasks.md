---

description: "Task list for 021 — Simulação com aprovação, limpar organização e badges"
---

# Tasks: Simulação com aprovação, limpar organização e badges

**Input**: Design documents from `/specs/021-simulacao-aprovacao-grupos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/preview-approve-clear.md, quickstart.md

**Tests**: não opcionais — Princípio V da constitution.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (contrato + dados de origem, bloqueante)

- [X] T001 `shared/src/schemas/group.schema.ts`: `GroupCandidateSchema` += `gender:
  GenderSchema` (import de `candidate.schema.ts`); `GroupEvaluatorSchema` += `memberStatus:
  MemberStatusSchema` (import de `member.schema.ts`)
- [X] T002 [P] `shared/src/schemas/group.schema.ts`: `AvailableEvaluatorSchema` (`{userId,
  name, memberStatus, role}`), `PreviewPresencialResponseSchema`, `OrganizePresencialBodySchema`
  (`{evaluatorUserIds: z.array(z.string().uuid()).optional()}`)
- [X] T003 `api/src/repositories/group.repository.ts`: `listPresentMembers` — `SELECT` ganha
  `p.status AS memberStatus` via `INNER JOIN member_profiles p ON p.user_id = u.id` (mesmo
  padrão de `EvaluatorsRepository.listWithRole`); `PresentMemberRow` += `memberStatus: string`
- [X] T004 [P] `api/src/repositories/group.repository.ts`: `listPresentCandidates` — conferir
  que `PresentCandidateRow`/a query já devolvem `gender` (já usado internamente por
  `distributeByGender`); se só estiver no tipo interno, expor no retorno também

**Checkpoint**: `shared`/`api` buildam limpo; dado de origem (memberStatus/gender) disponível
pra US1/US3/US4.

---

## Phase 2: User Story 1 - Gestão configura, simula, revisa e só então aprova (Priority: P1) 🎯 MVP

**Goal**: `POST /groups/preview/presencial` (novo) e `POST /groups/organize/presencial`
(estendido) aceitam `evaluatorUserIds?`; host passa a ser atribuído de verdade por sala.

**Independent Test**: cenários 1, 2 e 3 do `quickstart.md`.

### Tests for User Story 1

- [X] T005 [P] [US1] `group-organization.test.ts`: `distributeHostsToRooms` — sala de D5
  ≤50 (1 host) recebe 1 host; sala 51-80/>80 (2 hosts) recebe até 2; host presente insuficiente
  não quebra (sala fica com menos hosts, sem erro); o(s) mesmo(s) host(s) aparecem em TODOS os
  grupos da mesma sala
- [X] T006 [P] [US1] `group-organization.test.ts`: `organizePresencialGroups` com `avaliadores`
  e `hosts` separados — avaliador nunca conta pro alvo de host da sala e vice-versa; um host
  presente nunca aparece como avaliador de nenhum grupo (mantém FR-007 da FEAT-0020)
- [X] T007 [P] [US1] `group.service.test.ts`: `previewPresencial` — mesmo resultado de
  `organizePresencial` dado o mesmo `evaluatorUserIds`, MAS sem gravar nada (`GET /groups`
  antes/depois do preview idêntico); `availableEvaluators` lista avaliadores E hosts presentes
- [X] T008 [P] [US1] `group.routes.test.ts`: `POST /groups/preview/presencial` —
  401/403/200/409 (sem candidato); `POST /groups/organize/presencial` com body
  `{evaluatorUserIds}` — só os avaliadores listados entram na organização real

### Implementation for User Story 1

- [X] T009 [US1] `api/src/services/group-organization.ts`: `distributeHostsToRooms(hosts,
  roomAssignments)` — NOVO (research.md, Decisão 2); `organizePresencialGroups` recebe
  `avaliadores`/`hosts` separados (não mais um `presentMembers` misto) e monta
  `evaluatorUserIds = [...avaliadoresDoGrupo, ...hostsDaSala]`
- [X] T010 [US1] `api/src/services/group.service.ts`: `organizePresencial(evaluatorUserIds?,
  now?)` — filtra `presentMembers` (role avaliador) por `evaluatorUserIds` quando informado
  antes de passar pro algoritmo; hosts presentes sempre completos (Assumption do spec.md)
- [X] T011 [US1] `api/src/services/group.service.ts`: `previewPresencial(evaluatorUserIds?,
  now?)` — NOVO, mesmo cálculo de `organizePresencial` sem chamar `replaceOrganization`;
  devolve `groups` (ids ephemeral) + `availableEvaluators` (todos os presentes, avaliador e host)
- [X] T012 [US1] `api/src/routes/group.routes.ts`: `POST /organize/presencial` passa a validar
  body opcional (`OrganizePresencialBodySchema`); `POST /preview/presencial` NOVO, mesmo body,
  `PreviewPresencialResponseSchema`
- [X] T013 [US1] [P] `front/components/ui/dialog.tsx` — instalar via shadcn CLI (`npx shadcn
  add dialog -c front`)
- [X] T014 [US1] [P] `front/lib/group/api.ts`/`queries.ts`: `previewPresencial(evaluatorUserIds?)`,
  `organizePresencial(evaluatorUserIds?)` (assinatura estendida)
- [X] T015 [US1] `front/app/painel/grupos/_components/simulate-organize-modal.tsx` — NOVO,
  substitui `simulate-button.tsx`: `Dialog` com (a) lista pesquisável de avaliadores/hosts
  presentes (checkbox de participação, ação "promover a host" — reaproveita `setEvaluatorRole`
  já existente em `lib/evaluators/evaluators-api.ts`), (b) prévia por sala (reaproveita
  `GroupCard` ou uma variante), (c) botão "Aprovar simulação e organizar grupos" no rodapé —
  chama `organizePresencial` com a MESMA seleção do preview mais recente, fecha o modal,
  invalida a query de grupos
- [X] T016 [US1] `front/app/painel/grupos/_components/groups-view.tsx`: remove
  `<OrganizeButton modality="presencial">` e `<SimulateButton>`; adiciona
  `<SimulateOrganizeModal />` (só presencial — online mantém `OrganizeButton` normalmente)

**Checkpoint**: US1 funcional de ponta a ponta — configurar, prever, aprovar.

---

## Phase 3: User Story 2 - Gestão limpa a organização atual (Priority: P2)

**Goal**: `DELETE /groups/presencial` remove só a organização presencial, com confirmação no
front.

**Independent Test**: cenário 4 do `quickstart.md`.

### Tests for User Story 2

- [X] T017 [P] [US2] `group.service.test.ts`: `clearPresencialOrganization` — remove todos os
  grupos presenciais (candidatos/avaliadores/hosts perdem associação); grupos online
  intocados
- [X] T018 [P] [US2] `group.routes.test.ts`: `DELETE /groups/presencial` — 401/403/204;
  idempotente (chamar sem nenhum grupo presencial também devolve 204)

### Implementation for User Story 2

- [X] T019 [US2] `api/src/services/group.service.ts`: `clearPresencialOrganization(now?)` —
  `replaceOrganization(process.id, "presencial", [])` (research.md, Decisão 6)
- [X] T020 [US2] `api/src/routes/group.routes.ts`: `DELETE /presencial` NOVO, `ADMIN_ONLY`, `204`
- [X] T021 [US2] [P] `front/lib/group/api.ts`/`queries.ts`: `clearPresencialOrganization()` +
  `useClearPresencialOrganizationMutation`
- [X] T022 [US2] [P] `front/app/painel/grupos/_components/clear-organization-button.tsx` —
  NOVO: `variant="destructive"`, `window.confirm()` antes de chamar (mesmo padrão da exclusão
  de sala, FEAT-0011)
- [X] T023 [US2] `groups-view.tsx`: `<ClearOrganizationButton />` ao lado do
  `<SimulateOrganizeModal />`, só na tela presencial

**Checkpoint**: US1 + US2 cobrem o ciclo completo (organizar via aprovação, limpar).

---

## Phase 4: User Story 3 - Badge de sexo nos candidatos (Priority: P3)

**Goal**: badge discreto de sexo ao lado de cada candidato, nos grupos organizados e na prévia.

**Independent Test**: cenário 5 do `quickstart.md` (campo `gender` no shape) + inspeção visual.

### Implementation for User Story 3

- [X] T024 [US3] `front/app/painel/grupos/_components/gender-badge.tsx` — NOVO, componente
  pequeno: masculino → azul translúcido, feminino → vermelho translúcido, outro → cinza
  translúcido, baixo contraste
- [X] T025 [US3] `group-card.tsx`: `<GenderBadge gender={candidate.gender} />` ao lado do nome
  de cada candidato (a mesma prévia do modal reaproveita `GroupCard`/o mesmo badge, T015)

**Checkpoint**: badge visível nos grupos já organizados e na prévia.

---

## Phase 5: User Story 4 - Nome de Trainee em destaque (Priority: P3)

**Goal**: nome de avaliador/host trainee em vermelho, nos grupos organizados e na prévia.

**Independent Test**: inspeção visual com um avaliador trainee alocado.

### Implementation for User Story 4

- [X] T026 [US4] `group-card.tsx` (e a prévia do modal, T015): nome do avaliador/host ganha
  `className` condicional (`text-red-600`/equivalente do design system) quando
  `evaluator.memberStatus === "trainee"`

**Checkpoint**: as 4 user stories funcionam de ponta a ponta.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T027 [P] `tsc --noEmit` limpo em `shared`/`api`/`front`; suíte completa de `api`
  passando; `npm run build --workspace=front` sem erro
- [X] T028 Cenários do `quickstart.md` conferidos: 1/2 (preview não persiste, aprovar reproduz a prévia) — `group.service.test.ts`; 3 (host em todos os grupos da sala) — `group-organization.test.ts`; 4 (limpar organização) — `group.service.test.ts`/`group.routes.test.ts`; 5 (gender/memberStatus no shape) — cobertos pelos schemas Zod e pelos testes de rota; sem verificação visual em navegador (não pedida)

**Checkpoint final**: T001–T028 completos. Deploy fica fora deste `tasks.md` — sem migration.

---

## Dependencies & Execution Order

- **Foundational (Phase 1) bloqueia tudo** — `gender`/`memberStatus` são consumidos por US1
  (prévia com nomes reais) e US3/US4 (badges).
- **US1 é o MVP real** — sem ela, "Simular grupos" nem existe como fluxo configure→prévia→
  aprovar. US2 é independente de US1 (limpar não depende de simular). US3/US4 são polimento
  visual sobre o que US1/US2 já expõem — dependem delas existirem na tela, não no dado (o dado
  já vem pronto da Foundational).

## Implementation Strategy

### MVP First

1. Foundational → contrato e dados de origem prontos
2. US1 → fluxo configure→simular→aprovar substitui o organizar direto
3. US2 → limpar organização
4. US3/US4 → badges de sexo e trainee
5. Polish → build/testes, checklist do quickstart
