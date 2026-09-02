---

description: "Task list for Recomendações e Simulação de Grupos (Presencial + Online)"
---

# Tasks: Recomendações e Simulação de Grupos (Presencial + Online)

**Input**: Design documents from `/specs/022-recomendacoes-simulacao-grupos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Backend novo (rota + service) SEMPRE vem com teste (Constituição V, não-negociável) —
`group.routes.test.ts` + `group.service.test.ts` para US4, `group-organization.test.ts` para o
algoritmo reescrito, `room.schema.test.ts` para as funções puras novas. Não há suíte de UI
automatizada no `front/` — verificação manual via `quickstart.md`.

**Organization**: Tarefas agrupadas por user story para permitir implementação e teste
independentes de cada uma.

## Phase 1: Foundational — contrato `room.size` (BLOQUEIA US1 e US2)

**Purpose**: Expor `rooms.size` até `GroupSummary.room` (research.md D2) — pré-requisito de
US1 (déficit de host) e US2 (desvio do ideal por sala), que precisam de `deriveRoomCapacity`
com o tamanho real da sala no front. US3 e US4 não dependem desta fase (US3 é só composição de
funções já existentes; US4 nunca usa `room` no online, que é sempre `null`).

**⚠️ CRITICAL**: US1 e US2 só podem começar depois desta fase.

- [X] T001 Adicionar `size: z.number().int()` a `GroupSummarySchema.room` em `shared/src/schemas/group.schema.ts` (contrato único, Constituição I)
- [X] T002 [P] Adicionar `room_size: number | null` a `GroupRow` em `api/src/repositories/group.repository.ts`
- [X] T003 [P] Adicionar `r.size AS room_size` às 5 queries que já fazem `LEFT JOIN rooms r ON r.id = g.room_id` em `api/src/repositories/group.repository.ts` (`listGroups`, `getGroupRow`, `findGroupById`, `findCandidateGroup`, `findEvaluatorGroup`)
- [X] T004 Atualizar `toSummary` em `api/src/services/group.service.ts` para incluir `size: group.room_size` no objeto `room` (depende de T002/T003)
- [X] T005 Atualizar `toPreviewSummary` em `api/src/services/group.service.ts` para incluir `size: room.size` (já disponível em `roomById`, sem depender do banco) (depende de T001)
- [X] T006 Rodar `npm run test --workspace=api` e `npx tsc --noEmit -p api/tsconfig.json` para confirmar que a suíte existente segue passando com o campo novo (nenhuma asserção de forma exata sobre `room` hoje, conferido em `group.service.test.ts`/`group.routes.test.ts`)

**Checkpoint**: `room.size` chega em toda resposta que usa `GroupSummary` — US1 e US2 podem começar.

---

## Phase 2: User Story 1 - Saber se falta host antes de organizar (Priority: P1) 🎯 MVP

**Goal**: No modal de simulação presencial, mostrar quantos hosts faltam pra estrutura calculada e sugerir quem promover.

**Independent Test**: Numa edição com mais salas/grupos do que hosts presentes suportam, abrir "Simular grupos" e ver o aviso de déficit com nomes sugeridos.

### Tests for User Story 1

- [X] T007 [P] [US1] Teste de `calculateHostDeficit` em `shared/test/room.schema.test.ts`: sem déficit, com déficit, lista de salas vazia, hosts suficientes exatos no limite

### Implementation for User Story 1

- [X] T008 [US1] Implementar `calculateHostDeficit(roomSizesUsed: number[], hostsPresentCount: number): { required: number; deficit: number }` em `shared/src/schemas/room.schema.ts` (soma `deriveRoomCapacity(size).hostCount` por sala DISTINTA) — depende de T007 falhando antes
- [X] T009 [US1] No `SimulateOrganizeModal` (`front/app/painel/grupos/_components/simulate-organize-modal.tsx`), derivar a lista de tamanhos de sala DISTINTOS usados por `localGroups`/`preview.data.groups` (agora com `room.size`, T005) e chamar `calculateHostDeficit` contra `evaluatorCounts.hostCount` (depende de T008, T005)
- [X] T010 [US1] Renderizar o aviso "É necessário mais N host(s) para seguir a configuração recomendada" quando `deficit > 0`, e nenhum aviso quando `deficit === 0` (depende de T009)
- [X] T011 [US1] Destacar, na lista de avaliadores do modal (`EvaluatorRow`), os primeiros `deficit` avaliadores (role `"avaliador"`, participando da simulação) como sugestão de promoção — selo visual, sem alterar o botão "Promover a host" já existente (research.md D4) (depende de T010)
- [X] T012 [US1] Confirmar que o diagnóstico recalcula ao promover/rebaixar host ou trocar quem participa (já é automático — `useMemo`/estado derivado de `preview.data`/`localGroups`, sem estado próprio para o déficit)

**Checkpoint**: US1 funcional e testável isoladamente — pode ser demonstrada sem US2/US3/US4.

---

## Phase 3: User Story 2 - Ver o que está fora do ideal antes de aprovar (Priority: P2)

**Goal**: Classificar cada grupo (ideal/aceitável/fora do ideal) e cada sala (host compatível ou não) na prévia presencial, com um resumo no topo do modal.

**Independent Test**: Rodar uma simulação com grupo de 3 e grupo de 4-5 juntos e ver os dois sinalizados de forma diferente, mais o resumo de desvios no topo.

### Tests for User Story 2

- [X] T013 [P] [US2] Teste de `classifyPresencialGroup` em `shared/test/room.schema.test.ts`: 4 e 5 candidatos com 2 avaliadores → `"ideal"`; 3 candidatos com 1 avaliador → `"aceitavel"`; qualquer outra combinação → `"fora_do_ideal"`

### Implementation for User Story 2

- [X] T014 [US2] Implementar `classifyPresencialGroup(candidateCount: number, evaluatorCount: number): "ideal" | "aceitavel" | "fora_do_ideal"` em `shared/src/schemas/room.schema.ts` — depende de T013 falhando antes
- [X] T015 [US2] Em `PreviewGroupCard` (`simulate-organize-modal.tsx`), aplicar `classifyPresencialGroup` a cada grupo (candidatos × avaliadores role `"avaliador"`, sem contar host) e exibir um selo de classificação (depende de T014)
- [X] T016 [US2] Por sala usada na prévia, comparar hosts alocados (distintos, já que host se repete por grupo da sala) com `deriveRoomCapacity(room.size).hostCount` e sinalizar divergência (depende de T005 da Fase 1)
- [X] T017 [US2] Resumo no topo do modal: "organização segue o ideal" quando todos os grupos são `"ideal"`/`"aceitavel"` e todas as salas batem com `deriveRoomCapacity`, ou lista curta dos pontos fora (ex.: "Sala X tem 1 grupo de 3 candidatos", "Sala Y está sem host suficiente") (depende de T015, T016)

**Checkpoint**: US1 + US2 funcionam juntas e independentemente — diagnóstico completo da prévia presencial.

---

## Phase 4: User Story 3 - Entender a lógica por trás da recomendação (Priority: P3)

**Goal**: Painel de cenários de referência dentro do modal de simulação presencial (não só o total atual de candidatos).

**Independent Test**: Abrir o modal e ver mais de um cenário de exemplo, mais uma explicação textual quando os recursos presentes não bastam pro ideal.

### Implementation for User Story 3

*(Sem tarefa de teste dedicada — é composição de funções puras já cobertas por teste em `room.schema.test.ts`; a lógica nova aqui é só de exibição.)*

- [X] T018 [P] [US3] Definir o conjunto fixo de contagens de referência (poucos ≈ 5, médio ≈ 20, muitos ≈ 50 candidatos) e, para cada uma, rodar `derivePresencialGroupCount` → `recommendRoomsForGroups` → `deriveEvaluatorTargetForGroupSize` (mesma pipeline do bloco "quantidade ideal" já existente) em `simulate-organize-modal.tsx`
- [X] T019 [US3] Renderizar o painel de cenários (tabela/lista com as linhas de T018) acima ou ao lado do bloco "quantidade ideal" já existente
- [X] T020 [US3] Quando os recursos presentes (avaliadores/hosts/salas) não bastarem pro cenário ideal da situação ATUAL (não dos exemplos fixos), mostrar uma frase explicando o motivo e a distribuição mais próxima alcançável — reaproveita os dados já calculados no bloco "quantidade ideal" existente e o resultado real da prévia (depende de T018)

**Checkpoint**: US1, US2 e US3 juntas cobrem toda a melhoria de recomendação/diagnóstico presencial.

---

## Phase 5: User Story 4 - Simular a organização online antes de aplicar (Priority: P4)

**Goal**: Mesmo conceito de simular-antes-de-aplicar do presencial, agora no online — sem distribuição automática de avaliador.

**Independent Test**: Na tela de Grupos Online, "Simular grupos" → revisar prévia sem alterar nada real → aprovar → grupos reais criados exatamente como a prévia mostrou.

### Tests for User Story 4

- [X] T021 [P] [US4] Reescrever os testes de `organizeOnlineGroups` em `api/test/group-organization.test.ts` para a nova assinatura `(candidates)` (sem `rooms`) e a nova faixa ideal (4-5 ideal, 3 mínimo aceitável, evita 1-2 e 6+ quando possível redistribuir) — cobrir N pequeno (1-2), N médio com divisão perfeita (8, 9, 10) e N que força grupo de 3 (11, 13)
- [X] T022 [P] [US4] Teste de `GroupService.previewOnline` em `api/test/group.service.test.ts`: calcula sem persistir (nenhuma chamada a `replaceOrganization`), `evaluators: []` em todo grupo, erro `NoActiveSelectionProcessError`/`NoCandidatesPresentError` nos mesmos casos de `organizeOnline`
- [X] T023 [P] [US4] Teste de rota `POST /groups/preview/online` em `api/test/group.routes.test.ts`: 200 com `data.groups`, 404/409 nos mesmos casos de `POST /groups/organize/online`, nada persistido (confirmar via `GET /groups` depois da chamada)

### Implementation for User Story 4

- [X] T024 [US4] Reescrever `organizeOnlineGroups` em `api/src/services/group-organization.ts`: assinatura `(candidates: PresentCandidateRow[]): GroupToInsert[]`, tamanho de grupo via `derivePresencialGroupCount(candidates.length)` (sem `maxGroups`, research.md D1); remover `averageRoomGroupSize` e `FALLBACK_ONLINE_GROUP_SIZE` (código morto, research.md D7) — depende de T021 falhando antes
- [X] T025 [US4] Atualizar `GroupService.organizeOnline` em `api/src/services/group.service.ts` para chamar `organizeOnlineGroups(candidates)` sem `rooms` (depende de T024)
- [X] T026 [US4] Adicionar `PreviewOnlineResponseSchema` (`{ data: { groups: GroupSummary[] } }`) em `shared/src/schemas/group.schema.ts` (contracts/preview-online.md)
- [X] T027 [US4] Implementar `GroupService.previewOnline(now?)` em `api/src/services/group.service.ts`: busca candidatos online presentes, chama `organizeOnlineGroups`, monta `GroupSummary[]` em memória via `toPreviewSummary` (sem `room`/host, já que online não usa sala), NUNCA chama `replaceOrganization` — depende de T024, T022 falhando antes
- [X] T028 [US4] Adicionar rota `POST /groups/preview/online` em `api/src/routes/group.routes.ts`, resposta validada por `PreviewOnlineResponseSchema` — depende de T026, T027, T023 falhando antes
- [X] T029 [US4] Adicionar `previewOnline(): Promise<PreviewOnlineResponse["data"]>` em `front/lib/group/api.ts` (mesmo padrão de `previewPresencial`) — depende de T028
- [X] T030 [US4] Adicionar `usePreviewOnlineMutation()` em `front/lib/group/queries.ts` (não invalida `GROUPS_KEY`, mesmo padrão de `usePreviewPresencialMutation`) — depende de T029
- [X] T031 [US4] Criar `front/app/painel/grupos/_components/simulate-online-organize-modal.tsx`: mesmo shell do `simulate-organize-modal.tsx` (Dialog, prévia, footer "Aprovar simulação e organizar grupos"), SEM seção de avaliador/promoção (FR-015) — abre chamando `previewOnline`, aprova chamando `organizeOnline` já existente (research.md D9) — depende de T030
- [X] T032 [US4] No mesmo modal, calcular a partir dos grupos online REAIS já carregados por `useGroupsQuery()` (não um campo novo do backend, research.md D8) quantos avaliadores estão atribuídos hoje; se > 0, mostrar aviso antes de aprovar que essas atribuições serão perdidas, com confirmação explícita (mesmo padrão de `window.confirm` do `ClearOrganizationButton`) — depende de T031
- [X] T033 [US4] Em `front/app/painel/grupos/_components/groups-view.tsx`, trocar `<OrganizeButton modality="online">` por `<SimulateOnlineOrganizeModal />` quando `modality === "online"` (mesmo padrão já usado pro presencial) — depende de T031

**Checkpoint**: Todas as 4 user stories funcionam de forma independente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificação final cruzando as 4 stories.

- [X] T034 [P] Rodar `npm run test --workspace=shared` (funções novas + `derivePresencialGroupCount` sem `maxGroups`)
- [X] T035 [P] Rodar `npm run test --workspace=api` (suíte completa, incluindo os testes novos de US4 e a regressão de US1/US2)
- [X] T036 Rodar `npx tsc --noEmit -p shared/tsconfig.json`, `-p api/tsconfig.json`, `-p front/tsconfig.json`
- [X] T037 Rodar `npm run build --workspace=front` e `npx eslint` nos arquivos alterados do front
- [ ] T038 Validar manualmente os 4 roteiros de `quickstart.md` (déficit de host, desvio do ideal, painel de cenários, simulação online)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: sem dependências — pode começar imediatamente. BLOQUEIA US1 e US2 (Phases 2-3).
- **US1 (Phase 2)**: depende só da Foundational.
- **US2 (Phase 3)**: depende só da Foundational — pode rodar em paralelo com US1 (arquivos diferentes dentro de `room.schema.ts`/`simulate-organize-modal.tsx`, mas funções e seções de UI distintas; ordem sequencial evita conflito de merge no mesmo arquivo).
- **US3 (Phase 4)**: NÃO depende da Foundational nem de US1/US2 — só de funções já existentes antes desta feature. Pode ser feita a qualquer momento, inclusive primeiro.
- **US4 (Phase 5)**: independente das outras três (arquivos praticamente não sobrepostos: `group-organization.ts`, rota nova, modal novo). Só toca `group.schema.ts` (schema novo, sem conflito com o `size` da Foundational) e `groups-view.tsx` (import novo, sem conflito).
- **Polish (Phase 6)**: depende de todas as stories desejadas estarem completas.

### Parallel Opportunities

- T002/T003 (mesmo arquivo, mas edições independentes — pode ficar sequencial se for uma pessoa só)
- T007 e T013 (arquivos de teste de funções puras diferentes, embora no mesmo arquivo `room.schema.test.ts` — cuidado com merge se paralelizado por pessoas diferentes)
- T021/T022/T023 (três arquivos de teste diferentes)
- US3 inteira pode ser feita em paralelo com Foundational/US1/US2 (sem dependência)
- US4 inteira pode ser feita em paralelo com Foundational/US1/US2/US3 (sem dependência de arquivo compartilhado, exceto a linha de import em `groups-view.tsx`)

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1 (Foundational — `room.size`)
2. Completar Phase 2 (US1 — déficit de host)
3. Validar isoladamente com o roteiro US1 de `quickstart.md`
4. Demonstrar/entregar se for o caso

### Entrega Incremental

1. Foundational → US1 (déficit de host, MVP) → US2 (desvio do ideal) → US3 (painel de cenários) → US4 (simulação online)
2. Cada etapa soma valor sem quebrar a anterior — US4 pode inclusive ser adiada para uma entrega separada sem impacto nas outras três (research.md documenta isso explicitamente).
