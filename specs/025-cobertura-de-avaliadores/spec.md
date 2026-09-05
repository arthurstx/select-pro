# Feature Specification: Cobertura de avaliadores nos grupos presenciais

**Feature Branch**: `develop`

**Created**: 2026-09-05

**Status**: Proposta — aguardando aprovação

**Input**: Pedido do usuário em 2026-09-05, olhando a prévia de simulação presencial — "por que tem grupos que não possuem avaliadores? em hipótese alguma deve existir um grupo sem avaliador ou host, esse é a maior prioridade" e "o trainee teste que eu botei nem aparece como avaliador na divisão de grupos".

## Diagnóstico

Os dois sintomas são a mesma falha, nas duas pontas: **a quantidade de grupos é decidida sem olhar quantos avaliadores existem**, e a distribuição depois se vira com o que sobrar.

Em `derivePresencialGroupCount` (`shared/src/schemas/room.schema.ts`) o número de grupos sai de candidatos + capacidade da sala. Só depois `distributeEvaluatorsByTarget` (`api/src/services/group-organization.ts:226`) espalha os avaliadores nesses slots já fixos:

- **passada 1** — 1 avaliador por grupo não-vazio, em ordem de índice;
- **passada 2** — o 2º avaliador só nos grupos de 6-7 candidatos;
- as duas abortam com `if (cursor >= pool.length) return`, **sem sinalizar nada**.

Daí:

1. **Grupo sem avaliador** — se o pool acaba na passada 1, os grupos seguintes ficam com zero. Não é caso raro: é garantido sempre que houver mais grupos que avaliadores.
2. **Avaliador sem grupo** — o alvo máximo é 2 por grupo e não existe passada 3. Com 2 grupos de 6 candidatos o alvo total é 4; do 5º avaliador selecionado em diante, ninguém entra. Esses avaliadores abrem "Minhas Avaliações" e veem "você ainda não foi alocado a um grupo". **Não tem relação com `memberStatus`** — trainee não é filtrado em lugar nenhum do pool.

Host não tem a ver com isso: é recurso da **sala** (`distributeHostsToRooms`), e o mesmo host é colado em todos os grupos daquela sala de propósito.

Bug menor no mesmo fluxo: a linha "*X tem 1 grupo de N candidatos (aceitável…)*" da prévia é emitida **uma por grupo**, então repete dizendo "1 grupo" cada vez (`simulate-organize-modal.tsx:304`).

## Clarifications

### Session 2026-09-05

- Q: Na troca do FR-004, um avaliador de fora pode ser trocado por um host de dentro, rebaixando o host? → A: Não — troca só dentro do mesmo papel (avaliador ⟷ avaliador, host ⟷ host). Mudar papel continua sendo a ação "Promover a host", já existente e explícita.
- Q: A troca pode deixar um grupo sem nenhum avaliador? → A: Sim, permitido — o grupo é marcado como descoberto na hora e entra na contagem que exige confirmação ao aprovar. Bloquear seria incoerente com a D1, que já deixa a decisão com o operador.
- Q: A lista de "fora da organização" inclui os avaliadores que o operador desmarcou na seleção do topo? → A: Não — só os selecionados que não couberam. Desmarcar é decisão explícita do operador; para reverter, ele remarca no seletor, que re-simula.
- Q: Com zero avaliadores presentes, a organização roda criando tudo vermelho? → A: Não — recusa com erro próprio, espelhando o `NoCandidatesPresentError` que já existe. A D1 vale para cobertura parcial, não para entrada vazia.
- Q: Se um ajuste manual falhar depois de a organização já ter sido gravada, o que o operador vê? → A: Sucesso parcial explícito — confirma que os grupos foram organizados, nomeia os ajustes que não passaram e mantém o modal aberto para nova tentativa. Sem reversão.

## Decisões

- **D1 — Não bloquear nem encolher a divisão.** O algoritmo continua mirando 5 candidatos por grupo. Grupo sem avaliador vira **erro declarado e impossível de não ver** na prévia; aprovar mesmo assim é decisão consciente do operador, que assume o risco. Motivo: no dia do processo, travar a organização é pior que organizar com um grupo descoberto e o operador sabendo disso. **Vale para cobertura parcial, não para entrada vazia** — ver D4.
- **D2 — Host não cobre grupo.** A regra é "todo grupo precisa de pelo menos 1 avaliador próprio". Host é supervisão da sala, não substitui quem avalia.
- **D3 — Sobra continua sobrando, mas dá pra trocar.** O teto de 2 avaliadores por grupo fica. Quem sobrou aparece numa lista de "fora da organização", e o operador pode **trocar** um de fora por um de dentro. Troca preserva o tamanho dos grupos — mais previsível que adicionar avaliador solto.
- **D4 — Zero avaliadores é recusa, não risco assumido.** Organizar é destrutivo (`replaceOrganization` apaga a organização anterior), e uma edição inteira sem ninguém que possa avaliar não é uma decisão a ponderar, é entrada obviamente incompleta — tipicamente organizar antes do check-in dos membros. O projeto já tem o precedente: `NoCandidatesPresentError` recusa em vez de gravar zero grupos.

## Requisitos

### FR-001 — Grupo sem avaliador é erro visível
Na prévia, todo grupo com zero avaliadores de `role === "avaliador"` (host não conta, D2) recebe:
- badge própria de erro no card, distinta do "fora do ideal" atual;
- uma linha no resumo do topo nomeando o grupo;
- um alerta destacado com a contagem: "N grupo(s) sem avaliador".

### FR-002 — Aprovar com grupo descoberto exige confirmação
Com pelo menos um grupo sem avaliador, "Aprovar simulação e organizar grupos" abre uma confirmação que nomeia os grupos e exige aceite explícito. Nunca bloqueia (D1).

### FR-003 — Quem ficou de fora aparece
A prévia lista, com contagem, quem está presente e **participando** mas não entrou em nenhum grupo. Derivável no front: `availableEvaluators` (já devolvido por `previewPresencial`) menos quem aparece em `groups[].evaluators`.

"Participando" exclui quem o operador desmarcou no seletor do topo: o checkbox é uma declaração de intenção, e a troca opera dentro dela. Quem foi desmarcado não aparece na lista nem pode ser trazido por troca — o caminho para reverter é remarcar no seletor, que re-simula. Hosts nunca são desmarcáveis (entram sempre, research.md Decisão 4), então um host de fora é sempre um host excedente à capacidade das salas.

### FR-004 — Trocar de fora por de dentro
Cada avaliador alocado num grupo ganha uma ação "Trocar por…" listando quem está de fora. A troca é local na prévia (como os `moveEvaluatorLocal` de hoje) e só é persistida ao aprovar.

**A troca nunca cruza papéis**: avaliador só troca com avaliador, host só com host. A lista oferecida a um avaliador alocado contém apenas avaliadores de fora, e a de um host apenas hosts de fora. Mudar o papel de alguém continua sendo a ação "Promover a host" / "Rebaixar a avaliador", que já existe na mesma tela — assim a troca é realocação pura, sem efeito colateral em `evaluator_role` nem na contagem de hosts da sala.

Trocar o host de uma sala troca em todos os grupos dela, porque host é recurso da sala (`distributeHostsToRooms`).

**A troca nunca é bloqueada, nem quando descobre um grupo.** Tirar o último avaliador de um grupo é permitido; o grupo passa a exibir o erro do FR-001 imediatamente, no mesmo render, e entra na contagem que dispara a confirmação do FR-002. Bloquear seria incoerente com a D1 — se o operador pode aprovar uma organização descoberta, travá-lo de chegar nela por outro caminho é arbitrário. O que a ferramenta garante não é a invariante, é que ele não consegue não ver.

### FR-005 — Backend precisa aceitar avaliador sem grupo de origem
`GroupService.moveEvaluator` recusa hoje com `EvaluatorNotAllocatedError` quem não está em grupo nenhum (`group.service.ts:240`), e `GroupRepository.moveEvaluator` roda `UPDATE ... WHERE user_id = ?`, que não faz nada sem linha. Sem isto, a troca do FR-004 não persiste. Duas primitivas, hoje existentes só para online, passam a valer também para presencial:
- **atribuir** (upsert) — `assignEvaluatorToOnlineGroup` já resolve isso via `ON CONFLICT` no `UNIQUE(user_id)`; generalizar para as duas modalidades;
- **remover da organização** — hoje só existe `DELETE /groups/online/me` (self-service do avaliador). Falta um remover-por-admin que valha para presencial.

A troca do FR-004 é então: remover quem sai + atribuir quem entra, aplicado por `reconcileManualMoves` junto dos moves manuais que já existem.

Nota: `reconcileManualMoves` (`simulate-organize-modal.tsx:186`) hoje ignora silenciosamente quem não tem grupo real (`if (currentRealId && …)`) — precisa passar a atribuir nesse caso, em vez de pular.

### FR-006 — A tela de grupos reais também sinaliza
Depois de aprovar, `GroupCard` marca grupo sem avaliador com o mesmo destaque de erro. O problema não desaparece ao sair da prévia.

### FR-007 — Corrigir a duplicação do aviso
A linha de desvio "aceitável" passa a ser agregada por sala ("*2.1.2 tem 2 grupos de 6 candidatos*") em vez de uma por grupo dizendo "1 grupo".

### FR-008 — Zero avaliadores participando recusa a organização
Se nenhum avaliador está presente, ou o operador desmarcou todos, **a organização real** recusa com erro próprio (`NO_EVALUATORS_PRESENT`, 409, espelhando o `NO_CANDIDATES_PRESENT` de hoje), com mensagem apontando o check-in de membros. Nada é gravado — a organização anterior sobrevive. Host presente **não** satisfaz esta condição: a regra é a mesma do D2.

A **prévia continua respondendo normalmente** e o front desabilita "Aprovar", exibindo o motivo. Recusar também na prévia criaria uma armadilha: o seletor de avaliadores é montado a partir do `availableEvaluators` que vem na resposta da prévia, então um 409 ali faria os checkboxes sumirem — e o operador que desmarcou todos sem querer ficaria sem como remarcar (ver `research.md`, Decisão 6). O botão desabilitado é UX; a garantia é a recusa do servidor.

### FR-009 — Falha parcial ao aprovar é reportada como tal
Os ajustes manuais (moves e trocas) são aplicados **depois** de a organização já estar gravada, por chamadas HTTP independentes. Se alguma falhar:

- a mensagem confirma o que de fato aconteceu — "Grupos organizados, mas N ajuste(s) não foram aplicados" — e **nomeia** quem ficou fora do lugar pretendido;
- o modal **não fecha**: a prévia local sobrevive, para o operador tentar de novo ou corrigir;
- nada é revertido. A organização base está consistente (o algoritmo rodou inteiro no servidor); desfazer os ajustes já aplicados exigiria uma transação atravessando várias rotas HTTP, que o Worker não garante — e a reversão pode falhar pelo mesmo motivo da falha original.

Isso corrige um defeito atual: hoje um `Promise.all` rejeitado cai no `catch` de `handleApprove` e mostra "Não foi possível organizar os grupos", afirmação falsa — a organização foi gravada. O operador fecha o modal achando que nada aconteceu.

## Contrato (`shared/`)

- `room.schema.ts` — nova função pura distinguindo "sem avaliador" de "fora do ideal" (hoje `classifyPresencialGroup` funde os dois em `fora_do_ideal`). Consumida pela prévia, pelo card real e pelos testes, sem round-trip.
- `group.schema.ts` — novo código de erro para o FR-008, ao lado dos que já existem para organização presencial. Sem mudança de shape: `GroupSummary.evaluators` já traz `role`, e `availableEvaluators` já vem completo na prévia, então os FR-001/003 são deriváveis no front.

## Fora de escopo

- Reduzir a quantidade de grupos pela oferta de avaliadores (rejeitado em D1).
- Bloquear a organização (rejeitado em D1).
- Adicionar avaliador solto a um grupo sem tirar ninguém (só troca, D3).
- O self-service de grupo online continua inalcançável pela UI (`GET /groups` é admin-only) — backlog da spec 024.

## Verificação

- Testes de unidade em `api/src/services/group-organization.test.ts`: pool menor que a quantidade de grupos produz grupos descobertos identificáveis; pool maior que 2×grupos deixa gente de fora de forma determinística.
- Teste da nova função pura em `shared/src/schemas/room.schema.test.ts`.
- Teste de service + rota para o FR-008 (Princípio V da constituição): zero avaliadores participando devolve 409 no `organize` e **não** altera a organização existente; o `preview` continua 200 com `availableEvaluators` completo.
- Teste de rota para o FR-005: atribuir a um grupo presencial alguém sem grupo de origem passa a funcionar (hoje é `EvaluatorNotAllocatedError`).
- Manual: 12 candidatos + 2 salas + 1 avaliador → prévia acusa 1 grupo sem avaliador e exige confirmação; trocar o "teste" por um alocado e aprovar → o "teste" abre "Minhas Avaliações" e vê o grupo.
- Manual (FR-009): derrubar a rede entre o `organize` e os ajustes → mensagem de sucesso parcial nomeando o que faltou, modal aberto.
