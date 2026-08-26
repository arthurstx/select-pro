# Feature Specification: Check-in de membros (avaliadores/hosts) e sinalização de sessão online

**Feature Branch**: `claude/feat-0010-checkin-membros-u259pj`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Check-in de membros (avaliadores/hosts) + sessão online para quem tem restrição de sábado (D7). Depende da FEAT-0009 (papel de host por edição), já implementada e mesclada em develop."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin faz check-in de quem vai avaliar no dia (Priority: P1)

No dia do processo seletivo, o admin abre uma lista de todos os avaliadores e hosts da edição corrente e marca, um a um, quem chegou. A lista mostra, para cada pessoa, o cargo dela na edição (avaliador ou host, definido na FEAT-0009) e se já fez check-in.

**Why this priority**: sem isso não existe check-in de membro nenhum — é a razão de a feature existir. É o equivalente, do lado de quem avalia, ao check-in de candidatos já existente (FEAT-0005).

**Independent Test**: com uma edição corrente e pessoas já atribuídas como avaliador/host (FEAT-0009), marcar o check-in de uma delas e confirmar que a lista reflete a mudança imediatamente, com horário registrado.

**Acceptance Scenarios**:

1. **Given** um avaliador da edição corrente sem check-in feito, **When** o admin marca o check-in dele, **Then** a lista passa a mostrar essa pessoa como presente, com o horário do check-in.
2. **Given** um avaliador já com check-in feito, **When** o admin desfaz o check-in, **Then** a pessoa volta a aparecer como ausente e o horário some da exibição atual — mas o evento de desfazer fica registrado no histórico (mesmo padrão de `checkin_events`, FEAT-0005).
3. **Given** hosts e avaliadores misturados na lista, **When** o admin abre a tela, **Then** vê ambos os cargos juntos, cada um identificado.
4. **Given** duas edições diferentes do processo seletivo, **When** o admin faz check-in de alguém na edição corrente, **Then** o check-in dela em uma edição anterior (se existiu) não é alterado.

---

### User Story 2 - Admin enxerga quantas pessoas já chegaram (Priority: P2)

Enquanto o check-in acontece, o admin quer saber rapidamente quantos avaliadores/hosts já chegaram do total esperado na edição, sem precisar contar a lista manualmente.

**Why this priority**: conveniência operacional sobre a US1 — o check-in já funciona sem isso, o contador só acelera o acompanhamento no dia do evento.

**Independent Test**: com uma lista de N pessoas e apenas algumas com check-in feito, abrir a tela e conferir que o contador mostra exatamente quantas fizeram check-in sobre o total.

**Acceptance Scenarios**:

1. **Given** uma edição com 10 avaliadores/hosts, dos quais 4 já fizeram check-in, **When** o admin abre a tela, **Then** vê um resumo indicando 4 de 10 presentes.
2. **Given** o admin marca mais um check-in, **When** a lista atualiza, **Then** o resumo passa a refletir o novo total sem precisar recarregar a página manualmente.

---

### User Story 3 - Admin distingue candidatos presentes online dos presenciais (Priority: P2)

Ao acompanhar o check-in de candidatos (tela já existente da FEAT-0005), o admin também precisa saber, dentre os candidatos já presentes, quantos participam remotamente ("online") por terem restrição de sábado — informação que hoje já existe na inscrição do candidato (`saturday_restriction`), mas não aparece separada na tela de check-in.

**Why this priority**: é a decisão travada D7 do backlog — necessária para o planejamento de salas/grupos da FEAT-0012, que precisa saber com antecedência quantos candidatos presentes participarão online. Não bloqueia a US1/US2 (check-in de membros), por isso fica como história independente.

**Independent Test**: com candidatos presentes misturando `saturday_restriction` verdadeiro e falso, abrir a tela de check-in de candidatos e confirmar que dá para diferenciar quem é "online" de quem é "presencial", sem nenhum campo novo de estado — só a restrição já cadastrada na inscrição.

**Acceptance Scenarios**:

1. **Given** um candidato com restrição de sábado que faz check-in, **When** o admin vê a lista de presentes, **Then** essa pessoa aparece identificada como "online".
2. **Given** um candidato sem restrição de sábado que faz check-in, **When** o admin vê a lista de presentes, **Then** essa pessoa aparece identificada como "presencial".
3. **Given** uma lista de candidatos presentes com os dois casos misturados, **When** o admin quer saber o total de cada um, **Then** consegue ver quantos presentes são online e quantos são presenciais.

---

### Edge Cases

- **Sem processo seletivo corrente** (nenhuma edição contém a data de hoje): a tela de check-in de membros não tem edição para operar — mesmo tratamento que outras telas do projeto já dão a essa ausência (aviso claro ao admin, não lista vazia sem explicação; ver FEAT-0009 FR-008).
- **Edição corrente sem nenhum avaliador/host atribuído ainda**: a lista aparece vazia, mas com uma mensagem explicando que ninguém foi atribuído como avaliador/host nessa edição (distinto do caso "sem processo corrente").
- **Alguém que não é admin tenta abrir a tela ou marcar check-in de outra pessoa**: acesso negado, mesmo padrão de controle de acesso da FEAT-0009.
- **Um mesmo membro é avaliador em várias edições**: o check-in de uma edição não interfere no de outra — cada check-in é sempre por edição, igual ao papel de host (FEAT-0009, FR-005).
- **Candidato sem check-in feito ainda**: não conta nem como "online" nem como "presencial" no resumo da US3 — só quem está presente entra nessa contagem.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um admin veja a lista de todos os avaliadores e hosts atribuídos à edição corrente do processo seletivo (mesma fonte de atribuição da FEAT-0009), com o cargo de cada um.
- **FR-002**: O sistema MUST permitir que um admin marque o check-in de um avaliador/host da edição corrente, registrando o horário.
- **FR-003**: O sistema MUST permitir que um admin desfaça o check-in de um avaliador/host da edição corrente.
- **FR-004**: O sistema MUST preservar um histórico append-only de cada marcação/desmarcação de check-in de membro (quem, quando, ação), no mesmo padrão já usado para candidatos (`checkin_events`, FEAT-0005) e para outras trilhas de auditoria do projeto (`candidate_export_events`, FEAT-0016).
- **FR-005**: O check-in de um avaliador/host MUST valer apenas para a edição corrente — check-in feito numa edição não altera nem cria check-in em outra edição para a mesma pessoa.
- **FR-006**: O sistema MUST mostrar, na tela de check-in de membros, um resumo de quantos avaliadores/hosts já fizeram check-in sobre o total esperado na edição corrente.
- **FR-007**: O sistema MUST restringir a visualização e a marcação de check-in de membros a usuários admin.
- **FR-008**: Quando não houver processo seletivo corrente, o sistema MUST informar isso claramente ao admin, em vez de mostrar uma lista vazia sem explicação.
- **FR-009**: Quando a edição corrente não tiver nenhum avaliador/host atribuído, o sistema MUST informar isso distintamente do caso "sem processo corrente".
- **FR-010**: O sistema MUST permitir diferenciar, entre os candidatos já presentes (check-in feito, FEAT-0005), quais participam online e quais participam presencialmente, derivando essa informação exclusivamente da restrição de sábado já registrada na inscrição do candidato (`saturday_restriction`) — sem introduzir nenhum campo novo de estado no candidato.
- **FR-011**: O sistema MUST mostrar, para os candidatos presentes, quantos são online e quantos são presenciais.

### Key Entities

- **Check-in de membro**: liga um avaliador/host a uma edição específica do processo seletivo e ao momento em que ele confirmou presença nela. Uma pessoa pode ter check-in feito (ou não) de forma independente em cada edição em que atua — nunca um estado global.
- **Evento de check-in de membro**: registro append-only de cada ação de marcar/desmarcar check-in de um avaliador/host, preservando histórico completo mesmo quando o estado atual muda.
- **Avaliador/host**: mesma entidade já definida na FEAT-0009 — membro com atribuição de cargo (avaliador ou host) na edição corrente. Esta feature não altera a atribuição de cargo, só adiciona presença a ela.
- **Sinalização online/presencial do candidato**: rótulo derivado, não persistido como campo novo — calculado a partir de `saturday_restriction` da inscrição do candidato já existente, aplicado apenas a candidatos presentes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue marcar o check-in de um avaliador/host e ver a lista refletir a mudança, com horário, imediatamente.
- **SC-002**: O resumo de presença de membros (X de Y) está sempre consistente com a contagem real de check-ins feitos na edição corrente — verificável comparando o resumo com a lista completa.
- **SC-003**: Desfazer um check-in nunca apaga o histórico da ação — verificável conferindo que o evento de desmarcação aparece no registro append-only mesmo depois do estado atual mudar.
- **SC-004**: Um usuário sem papel de admin não consegue ver nem marcar check-in de ninguém.
- **SC-005**: Um admin consegue distinguir, na lista de candidatos presentes, quem é online de quem é presencial, e ver o total de cada grupo, sem que isso exija nenhuma etapa extra de cadastro do candidato.

## Assumptions

- O check-in de membros usa o mesmo mecanismo de resolução de edição corrente já existente no projeto (`SelectionProcessRepository.resolveCurrent()`), reaproveitado sem alteração de contrato.
- Apenas admin pode ver e alterar o check-in de membros — mesmo escopo de acesso definido na FEAT-0009 para o painel de avaliadores. O próprio avaliador/host não confirma o próprio check-in pelo app; quem confirma é o admin, presencialmente no dia do evento (mesmo modelo operacional do check-in de candidatos, FEAT-0005).
- "Total esperado" no resumo (FR-006) é o total de avaliadores/hosts atribuídos à edição corrente (FEAT-0009), não um número cadastrado à parte.
- A sinalização online/presencial (US3/FR-010/FR-011) é exibida na tela de check-in de candidatos já existente (FEAT-0005) — não é uma tela nova, é um acréscimo à listagem e ao resumo que já existem lá.
- Um candidato com restrição de sábado é sempre "online" quando presente; um sem restrição é sempre "presencial" — não existe um terceiro estado nem exceção manual nesta feature (qualquer ajuste caso a caso fica fora de escopo).
- Fora de escopo: organização de grupos (FEAT-0012) e avaliação de candidatos (FEAT-0013) — esta feature só entrega check-in de membros e a sinalização online/presencial que a FEAT-0012 vai consumir depois.
