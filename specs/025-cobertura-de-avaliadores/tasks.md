---

description: "Task list for feature 025 — Cobertura de avaliadores nos grupos presenciais"
---

# Tasks: Cobertura de avaliadores nos grupos presenciais

**Input**: Design documents from `/specs/025-cobertura-de-avaliadores/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

> [!IMPORTANT]
> **STAND-BY desde 2026-09-05.** Nada desta lista foi implementado — o trabalho foi pausado por decisão do usuário para atender outra demanda. Os artefatos (spec, plan, research, data-model, contracts, quickstart, tasks) estão completos e revisados.
>
> **Ao retomar, resolver antes de codar** — três achados do `/speckit-analyze` que ainda não foram aplicados:
> 1. **CRÍTICO (Princípio V)** — T021 e T022 criam rotas sem tarefa de teste de rota. Faltam duas tarefas na Fase 4.
> 2. **ALTO** — o T031 aplica a troca como "remover depois atribuir"; se o atribuir falhar (cenário do FR-009), o grupo fica **sem o avaliador antigo e sem o novo**. Inverter a ordem: atribuir primeiro, remover depois.
> 3. **ALTO** — o path e o método das rotas do T021 e T022 não estão decididos: `contracts/` aponta para o `tasks` e o `tasks` aponta de volta para o `contracts`.
>
> Menores, não bloqueantes: cabeçalho da spec diz `Feature Branch: develop` (deveria ser `025-...`); o FR-008 precede o FR-002 e isso não está escrito; o T005 sozinho faz a feature parecer entregue sem fazer nada.

**Tests**: obrigatórios, não opcionais — o Princípio V da constituição exige que toda rota ou service novo/alterado no `api/` entregue `<feature>.service.test.ts` e `<feature>.routes.test.ts` junto.

**Organization**: agrupadas por história de usuário. As histórias saem dos requisitos da spec, na prioridade que o próprio pedido estabeleceu ("em hipótese alguma deve existir um grupo sem avaliador — essa é a maior prioridade").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1, US2, US3
- Caminho de arquivo exato em toda tarefa

## Path Conventions

Monorepo npm workspaces: `shared/src/`, `api/src/`, `api/test/`, `front/app/`, `front/lib/`.

## Histórias

| Story | Prioridade | Frase | Requisitos |
|---|---|---|---|
| **US1** | **P1** | "Nenhum grupo fica sem avaliador sem que eu saiba e aceite" | FR-001, FR-002, FR-006, FR-008 |
| **US2** | P2 | "Vejo quem ficou de fora e consigo trocar por quem está dentro" | FR-003, FR-004, FR-005 |
| **US3** | P3 | "A tela me diz a verdade sobre o que aconteceu" | FR-007, FR-009 |

---

## Phase 1: Setup

**Purpose**: preparar a branch. Nenhuma dependência nova, nenhuma migration.

- [ ] T001 Criar a branch `025-cobertura-de-avaliadores` a partir de `develop` (a constituição exige que branches de feature nasçam de `develop`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contratos em `shared/` primeiro (Princípio II). O estado novo `sem_avaliador` é o que faz o compilador apontar cada ponto do front que precisa mudar — sem ele, as histórias seguintes trabalham no escuro.

**⚠️ CRÍTICO**: nenhuma história começa antes desta fase fechar.

- [ ] T002 [P] Ampliar o retorno de `classifyPresencialGroup` para `"sem_avaliador" | "ideal" | "aceitavel" | "fora_do_ideal"` em `shared/src/schemas/room.schema.ts`, checando cobertura **antes** de tamanho (host não conta — D2)
- [ ] T003 [P] Adicionar `NO_EVALUATORS_PRESENT` ao `GroupErrorCode` em `shared/src/schemas/group.schema.ts`, com docstring no padrão dos vizinhos `NO_CANDIDATES_PRESENT`/`NO_ROOMS_AVAILABLE`
- [ ] T004 Cobrir o estado novo em `shared/src/schemas/room.schema.test.ts`: grupo de 6 candidatos com 0 avaliadores devolve `sem_avaliador`, não `fora_do_ideal` (hoje os dois colidem)
- [ ] T005 Restaurar a compilação nos dois chamadores que o T002 quebra — `front/app/painel/grupos/_components/simulate-organize-modal.tsx` e `front/app/painel/grupos/_components/group-card.tsx` — tratando `sem_avaliador` provisoriamente como o visual atual de "fora do ideal". O visual próprio é da US1.

**Checkpoint**: `npm test --workspace=shared` e `npx tsc --noEmit` no `front/` passam.

---

## Phase 3: US1 — Nenhum grupo fica sem avaliador sem que eu saiba (P1) 🎯 MVP

**Goal**: o operador nunca mais aprova uma organização com grupo descoberto por distração, e organizar sem nenhum avaliador deixa de ser possível.

**Independent test**: com ~12 candidatos presenciais, 2 salas e **1 único avaliador**, a prévia acusa o grupo descoberto por três caminhos (badge, resumo, alerta) e a aprovação exige confirmação nomeada. Com zero avaliadores, o `POST /groups/organize/presencial` devolve 409 e a organização anterior sobrevive. Cenários C1 e C6 do [quickstart.md](quickstart.md).

### Backend

- [ ] T006 [US1] Criar `NoEvaluatorsPresentError` em `api/src/core/errors/group-errors.ts`, com `code = GroupErrorCode.NO_EVALUATORS_PRESENT` e mensagem apontando o check-in de membros
- [ ] T007 [US1] Recusar em `GroupService.organizePresencial` (`api/src/services/group.service.ts`) quando o pool de avaliadores participando estiver vazio, **antes** de qualquer `replaceOrganization` — host presente não satisfaz a condição (D2); adicionar o erro ao tipo `OrganizePresencialError`
- [ ] T008 [US1] Mapear `NO_EVALUATORS_PRESENT` para 409 e declarar a resposta no `organizePresencialRoute` em `api/src/routes/group.routes.ts`
- [ ] T009 [US1] **Não** replicar a recusa em `previewPresencial` — confirmar que ele segue 200 com `availableEvaluators` completo (`research.md`, Decisão 6). Deixar comentário no service explicando por quê, para ninguém "consertar" isso depois

### Testes de backend (Princípio V)

- [ ] T010 [P] [US1] Em `api/test/group.service.test.ts`: `organizePresencial` com zero avaliadores devolve `left(NoEvaluatorsPresentError)` **e não altera** a organização existente; `previewPresencial` no mesmo cenário devolve `right` com `availableEvaluators` preenchido
- [ ] T011 [P] [US1] Em `api/test/group.routes.test.ts`: `POST /groups/organize/presencial` com lista vazia devolve 409 e o envelope `{ error: { code: "NO_EVALUATORS_PRESENT" } }`
- [ ] T012 [P] [US1] Em `api/test/group-organization.test.ts`: pool menor que a quantidade de grupos produz grupos com `evaluatorUserIds` vazio de forma determinística — trava de regressão do comportamento que a D1 decidiu manter

### Frontend

- [ ] T013 [US1] Dar visual próprio a `sem_avaliador` no card da prévia em `front/app/painel/grupos/_components/simulate-organize-modal.tsx`, distinto do "fora do ideal" (substitui o provisório do T005)
- [ ] T014 [US1] Emitir a linha de desvio nomeando o grupo descoberto e o alerta agregado "N grupo(s) sem avaliador" no `organizationDiagnostics` do mesmo arquivo
- [ ] T015 [US1] Exigir confirmação nomeada em `handleApprove` quando houver grupo descoberto — nunca bloquear (D1)
- [ ] T016 [US1] Desabilitar "Aprovar simulação e organizar grupos" com o motivo visível quando zero avaliadores estiverem participando, e tratar o 409 `NO_EVALUATORS_PRESENT` em `front/app/painel/grupos/_components/group-error-message.ts`
- [ ] T017 [P] [US1] Aplicar o mesmo destaque de erro ao grupo descoberto em `front/app/painel/grupos/_components/group-card.tsx` (FR-006) — o alerta não pode sumir ao fechar o modal

**Checkpoint**: US1 é entregável sozinha. As três suítes passam e os cenários C1, C6 e C9 do quickstart reproduzem.

---

## Phase 4: US2 — Vejo quem ficou de fora e consigo trocar (P2)

**Goal**: avaliador presente e participando nunca fica invisível, e o operador consegue realocá-lo sem refazer a simulação.

**Independent test**: com 6 avaliadores presentes para um alvo de 4, os 2 excedentes aparecem na lista "fora da organização"; trocar um por um alocado e aprovar faz o que entrou ver o grupo em `/painel/minhas-avaliacoes`. Cenários C2, C3 e C4 do [quickstart.md](quickstart.md).

**Dependência**: Fase 2. Independente da US1 — pode ser feita em paralelo por outra pessoa.

### Backend

- [ ] T018 [US2] Criar `GroupRepository.replaceRoomHost(roomId, outUserId, inUserId)` em `api/src/repositories/group.repository.ts`: num único `db.batch`, apaga as linhas de `outUserId` nos grupos da sala e insere `inUserId` em **cada** grupo dela. **Não** reusar `assignEvaluator`, que colapsaria o host num grupo só (`research.md`, Decisão 2)
- [ ] T019 [US2] Generalizar `assignEvaluatorToOnlineGroup` para `assignEvaluator` em `api/src/services/group.service.ts`, removendo a checagem `modality !== "online"` e o `GroupModalityMismatchError` que ela produzia
- [ ] T020 [US2] Mover a rota de `PUT /groups/online/{groupId}/evaluators/{userId}` para `PUT /groups/{groupId}/evaluators/{userId}` em `api/src/routes/group.routes.ts`, mantendo `ADMIN_ONLY`. Conviver com o `PATCH` de mesmo path: `PATCH` = mover (exige origem), `PUT` = atribuir (idempotente)
- [ ] T021 [US2] Expor a remoção por admin em `api/src/routes/group.routes.ts` sobre o `GroupRepository.removeEvaluator` que já existe — válida para as duas modalidades, idempotente (remover quem já não está alocado não é erro)
- [ ] T022 [US2] Expor a troca de host sobre o `replaceRoomHost` do T018 (rota dedicada ou modo da rota do T020 — ver `contracts/groups-evaluators.md`, seção 3)

### Testes de backend (Princípio V)

- [ ] T023 [P] [US2] Em `api/test/group.routes.test.ts`: `PUT /groups/{groupId}/evaluators/{userId}` atribui alguém **sem grupo de origem** (hoje `EVALUATOR_NOT_ALLOCATED`) e funciona em grupo **presencial**
- [ ] T024 [P] [US2] Em `api/test/group.service.test.ts`: trocar o host de uma sala com 2 grupos deixa o host que entrou nos **dois** grupos e o que saiu em nenhum — a asserção que pega o uso da primitiva errada
- [ ] T025 [P] [US2] Em `api/test/group-organization.test.ts`: pool maior que 2×grupos deixa os excedentes fora, de forma determinística

### Frontend

- [ ] T026 [US2] Derivar os conjuntos *Alocados* / *Participando* / *De fora* em `front/app/painel/grupos/_components/simulate-organize-modal.tsx`, conforme [data-model.md](data-model.md). Desmarcado no seletor **não** entra em *Participando* (FR-003)
- [ ] T027 [US2] Renderizar a lista "fora da organização" com contagem, no mesmo modal
- [ ] T028 [US2] Adicionar a ação "Trocar por…" em cada avaliador/host alocado, oferecendo **só o mesmo papel** — avaliador com avaliador, host com host (FR-004). Troca é local, como os `moveEvaluatorLocal` de hoje
- [ ] T029 [US2] Garantir que a troca **nunca** é bloqueada: descobrir um grupo é permitido e reflete no diagnóstico da US1 no mesmo render (FR-004, D1)
- [ ] T030 [P] [US2] Adicionar as funções de atribuir/remover/trocar-host em `front/lib/group/api.ts`, ajustando `assignEvaluatorOnline` para o path novo do T020
- [ ] T031 [US2] Fazer `reconcileManualMoves` **atribuir** em vez de pular quando a pessoa não tem grupo real (`if (currentRealId && …)` na linha ~186 do modal), e aplicar as trocas como remover-quem-sai + atribuir-quem-entra

**Checkpoint**: C2, C3 e C4 do quickstart reproduzem. O "teste" do relato original entra num grupo e enxerga a tela de avaliação.

---

## Phase 5: US3 — A tela me diz a verdade (P3)

**Goal**: parar de reportar errado o que aconteceu.

**Independent test**: cenários C7 e C8 do [quickstart.md](quickstart.md).

**Dependência**: Fase 2. O T033 mexe no mesmo `handleApprove` do T015 e do T031 — sequenciar se as histórias forem paralelizadas.

- [ ] T032 [P] [US3] Agregar a linha de desvio "aceitável" por sala em `front/app/painel/grupos/_components/simulate-organize-modal.tsx` ("2.1.2 tem 2 grupos de 6 candidatos") em vez de uma por grupo dizendo "1 grupo" (FR-007)
- [ ] T033 [US3] Trocar `Promise.all` por `Promise.allSettled` em `reconcileManualMoves`, carregando o nome de quem cada promessa ajusta, e reportar sucesso parcial em `handleApprove`: confirma que os grupos foram organizados, **nomeia** os ajustes que falharam e **não fecha o modal** (FR-009). Sem reversão

**Checkpoint**: bloquear as requisições de ajuste no DevTools e aprovar produz mensagem honesta, não "Não foi possível organizar os grupos".

---

## Phase 6: Polish & Cross-Cutting

- [ ] T034 Rodar as três suítes (`npm test` nos workspaces `shared`, `api`, `front`), `npx tsc --noEmit` e `npx eslint app components lib` no `front/`
- [ ] T035 Percorrer os 9 cenários manuais do [quickstart.md](quickstart.md), com atenção ao C3 — é o único que pega o bug silencioso de host
- [ ] T036 [P] Marcar a spec como `Status: Implementada` em `specs/025-cobertura-de-avaliadores/spec.md`
- [ ] T037 [P] Registrar em `CONTEXT.md` que a rota de atribuição de avaliador mudou de path e passou a valer para presencial

---

## Dependencies

```text
Phase 1 (T001)
   └─> Phase 2 — Foundational (T002-T005)   ⚠️ bloqueia tudo
          ├─> Phase 3 — US1 (T006-T017)   [P1, MVP]
          ├─> Phase 4 — US2 (T018-T031)   [P2]
          └─> Phase 5 — US3 (T032-T033)   [P3]
                 └─> Phase 6 — Polish (T034-T037)
```

As três histórias são independentes entre si depois da Fase 2. Único acoplamento real: **T015, T031 e T033 tocam o mesmo `handleApprove`** — se US1, US2 e US3 forem paralelizadas entre pessoas, essas três precisam ser sequenciadas ou resolvidas num merge.

Dentro do backend, a ordem do Princípio II vale sempre: `shared/` → `api/` → `front/`.

## Parallel Execution Examples

**Fase 2** — T002 e T003 são arquivos diferentes do `shared`, rodam juntas; T004 depende do T002; T005 depende do T002.

**US1** — os três testes (T010, T011, T012) rodam em paralelo assim que T006-T008 fecham. T017 (`group-card.tsx`) é arquivo diferente do modal e não espera T013-T016.

**US2** — T023, T024 e T025 em paralelo depois de T018-T022. T030 (`front/lib/group/api.ts`) é independente do trabalho no modal.

**Polish** — T036 e T037 são arquivos diferentes, rodam juntas.

## Implementation Strategy

**MVP = US1 sozinha.** Ela resolve o que o pedido chamou de maior prioridade: nenhum grupo passa descoberto sem o operador saber, e organizar sem avaliador nenhum deixa de ser possível. É entregável e mergeável sem a US2 e sem a US3.

**Incremento 2 = US2.** Resolve o outro lado (avaliador invisível) e é o único bloco que mexe em rota e repositório — merece revisão à parte, principalmente o T018/T024, onde o erro possível é silencioso em produção.

**Incremento 3 = US3.** Duas correções de honestidade da interface, baratas e independentes. Se o tempo apertar, o T033 vale mais que o T032: ele corrige uma mensagem que hoje **mente** sobre o estado do banco.
