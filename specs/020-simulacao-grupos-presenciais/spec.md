# Feature Specification: Simulação e regras reais de tamanho dos grupos presenciais

**Feature Branch**: `020-simulacao-grupos-presenciais`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "No botão de 'organizar presenciais' deve ser 'simular grupos'. Ao clicar, o sistema deve recomendar a quantidade de hosts, avaliadores e salas para a quantidade de candidatos presentes no prosel (só presencial por agora). Além disso: um grupo só pode ter 3-5 candidatos; 1-2 avaliadores por grupo (priorizar 2 avaliadores pra 4-5 candidatos); host faz parte da sala, não conta como avaliador na organização dos grupos — 1 host pra sala de 2 grupos, 2 hosts pra sala de 4 grupos." Confirmado com o usuário: 'Simular grupos' só recomenda, não grava nada — a organização real (que já existe) passa a seguir essas regras de fato."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin simula antes de organizar de verdade (Priority: P1)

Antes de organizar os grupos presenciais de verdade, o admin clica em "Simular grupos" e vê
quantas salas, hosts e avaliadores seriam necessários para os candidatos presenciais
presentes agora — sem gravar nada no sistema. Isso ajuda a decidir se há gente/sala
suficiente antes de comprometer a organização de verdade.

**Why this priority**: É o pedido central desta feature — dar ao admin uma visão prévia sem
efeito colateral, antes de uma ação que reorganiza tudo.

**Independent Test**: Com N candidatos presenciais presentes, clicar em "Simular grupos" e
conferir que aparece uma recomendação de quantidade de grupos/salas/hosts/avaliadores — e que
nenhum grupo foi criado/alterado no sistema depois do clique.

**Acceptance Scenarios**:

1. **Given** candidatos presenciais presentes, **When** o admin clica em "Simular grupos",
   **Then** o sistema mostra quantos grupos, salas, hosts e avaliadores seriam recomendados —
   sem alterar nenhum grupo já existente.
2. **Given** nenhum candidato presencial presente, **When** o admin clica em "Simular grupos",
   **Then** o sistema avisa que não há candidato presencial para simular, sem erro técnico.
3. **Given** uma simulação já mostrada, **When** o admin decide organizar de verdade,
   **Then** ele aciona a organização real (ação separada, já existente) normalmente.

---

### User Story 2 - Organização real de grupos presenciais respeita tamanho mínimo/máximo (Priority: P1)

Quando o admin organiza os grupos presenciais de verdade, cada grupo formado tem entre 3 e 5
candidatos — nunca menos, nunca mais (respeitado o quanto for possível dentro da capacidade
física das salas cadastradas).

**Why this priority**: É a regra de negócio real por trás de tudo — sem ela, a organização de
verdade pode continuar formando grupos pequenos demais ou grandes demais para uma boa
entrevista.

**Independent Test**: Organizar os grupos presenciais com um número de candidatos que não seja
múltiplo exato de 3-5 e conferir que todo grupo formado fica com 3, 4 ou 5 candidatos.

**Acceptance Scenarios**:

1. **Given** candidatos presenciais presentes e salas com capacidade suficiente, **When** o
   admin organiza os grupos, **Then** todo grupo formado tem entre 3 e 5 candidatos.
2. **Given** um número de candidatos que não fecha exatamente em grupos de 3-5 na capacidade
   das salas cadastradas, **When** o admin organiza os grupos, **Then** o sistema forma o
   máximo de grupos válidos possível, e reporta como não alocado quem não coube — mesmo
   comportamento de "capacidade insuficiente" já existente hoje.

---

### User Story 3 - Avaliadores por grupo seguem a prioridade de 2 para grupos maiores (Priority: P2)

Cada grupo formado recebe 1 avaliador se tiver 3 candidatos, ou 2 avaliadores se tiver 4 ou 5
candidatos — priorizando sempre colocar o segundo avaliador nos grupos maiores antes de
qualquer outra distribuição.

**Why this priority**: Refina a US2 — sem isso, os grupos já teriam o tamanho certo de
candidatos, mas a quantidade de avaliadores continuaria arbitrária.

**Independent Test**: Organizar grupos presenciais com avaliadores suficientes e conferir que
todo grupo de 3 tem exatamente 1 avaliador, e todo grupo de 4-5 tem exatamente 2 — nunca mais,
nunca menos, quando há avaliadores suficientes para isso.

**Acceptance Scenarios**:

1. **Given** avaliadores suficientes presentes, **When** os grupos são organizados, **Then**
   grupos de 3 recebem 1 avaliador e grupos de 4-5 recebem 2.
2. **Given** menos avaliadores presentes do que o ideal, **When** os grupos são organizados,
   **Then** o sistema distribui o que houver, priorizando completar o segundo avaliador dos
   grupos de 4-5 antes de dar um segundo a um grupo que já tem 1 — sem erro, sem bloqueio.

---

### User Story 4 - Host não é contado como avaliador de grupo (Priority: P2)

Quem tem o papel de host na edição não entra na distribuição de avaliadores por grupo — hosts
pertencem à sala (1 para sala de até 2 grupos, 2 para sala de até 4 grupos, regra já
existente), não a um grupo específico.

**Why this priority**: Corrige um comportamento que já existe hoje incorretamente — atualmente
hosts presentes entram no mesmo bolo de distribuição que avaliadores, o que não deveria
acontecer.

**Independent Test**: Organizar grupos presenciais com hosts e avaliadores presentes e conferir
que nenhum host aparece na lista de avaliadores de nenhum grupo.

**Acceptance Scenarios**:

1. **Given** hosts e avaliadores presentes, **When** os grupos são organizados, **Then**
   nenhum grupo lista um host como avaliador — só quem tem o papel de avaliador.

---

### Edge Cases

- Menos de 3 candidatos presenciais presentes no total: forma um único grupo com todos, mesmo
  abaixo do mínimo — não há como dividir em grupos válidos com tão pouca gente (mesmo espírito
  do edge case já tratado hoje para "único candidato presente").
- Simulação pedida sem nenhuma sala cadastrada ainda: a recomendação de salas serve justamente
  para informar quantas cadastrar — não é um erro, é o caso de uso principal da simulação.
- Escopo desta feature é só presencial — candidatos online não entram na simulação nem na
  regra de tamanho de grupo (que já não se aplica a online desde a FEAT-0018).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer uma ação "Simular grupos" que calcula e mostra uma
  recomendação de quantidade de grupos, salas, hosts e avaliadores necessários para os
  candidatos presenciais presentes — sem persistir nenhuma mudança.
- **FR-002**: A simulação DEVE considerar só candidatos presenciais presentes, ignorando
  candidatos online.
- **FR-003**: A organização real de grupos presenciais (ação já existente) DEVE formar grupos
  com no mínimo 3 e no máximo 5 candidatos cada, dentro do possível pela capacidade das salas
  cadastradas.
- **FR-004**: Quando a capacidade das salas não permitir formar só grupos de 3-5, o sistema
  DEVE alocar o máximo de candidatos possível em grupos válidos e reportar o restante como não
  alocado — sem quebrar nem bloquear a organização.
- **FR-005**: A organização real DEVE alocar 1 avaliador a cada grupo de 3 candidatos, e 2
  avaliadores a cada grupo de 4-5 candidatos, sempre que houver avaliadores presentes
  suficientes.
- **FR-006**: Quando não houver avaliadores presentes suficientes para o ideal, o sistema DEVE
  distribuir o que houver, priorizando completar o segundo avaliador de grupos de 4-5 antes de
  dar um segundo avaliador a outro grupo.
- **FR-007**: Quem tem o papel de host na edição NÃO DEVE ser contado nem alocado como
  avaliador de nenhum grupo durante a organização automática.
- **FR-008**: A recomendação de hosts/salas DEVE seguir a mesma correspondência já usada no
  cadastro de salas (até 2 grupos → 1 host; até 4 grupos → 2 hosts).

### Key Entities

- **Simulação (recomendação)**: não é uma entidade persistida — um resultado calculado sob
  demanda, descartado assim que a tela muda ou é fechada.
- **Grupo (presencial)**: entidade já existente (FEAT-0012); esta feature só corrige as regras
  de tamanho e de alocação de avaliador usadas para formá-lo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue ver uma recomendação de salas/hosts/avaliadores em menos de 5
  segundos a partir do clique em "Simular grupos", sem nenhuma mudança persistida.
- **SC-002**: 100% dos grupos formados por uma organização real (com capacidade suficiente)
  ficam com 3, 4 ou 5 candidatos.
- **SC-003**: 100% dos grupos de 4-5 candidatos recebem 2 avaliadores quando há avaliadores
  presentes suficientes; 100% dos grupos de 3 recebem exatamente 1.
- **SC-004**: 0% dos hosts aparecem como avaliador de algum grupo depois de uma organização.

## Assumptions

- A distribuição por gênero (D1 — nunca exatamente 1 mulher por grupo) continua tendo
  prioridade sobre o tamanho exato do grupo — em casos extremos de composição de gênero, o
  tamanho pode desviar ligeiramente de 3-5 para não violar D1 (mesmo trade-off que já existia
  antes desta feature).
- A recomendação de salas na simulação não depende de quais salas já estão cadastradas —
  calcula do zero, a partir só da quantidade de candidatos presentes, usando a mesma
  correspondência tamanho↔host↔grupos já existente (D5).
- Sem mudança na regra de capacidade física por sala (D5, `deriveRoomCapacity`) — esta feature
  soma uma regra nova (tamanho de grupo) à que já existia (grupos por sala), não substitui.
