# Feature Specification: Cadastro de salas

**Feature Branch**: `feat/cadastro-de-salas`

**Created**: 2026-08-24

**Status**: Draft

**Input**: Backlog organizado em 2026-08-24 (features 008–016). Decisão D5: faixas de hosts/grupos por capacidade de sala, já validadas com o usuário.

> ⚠️ **Superseded em parte pela FEAT-0023** (`specs/023-classificacao-de-salas/`): host e limite de grupos não vêm mais da capacidade em pessoas, e sim da classificação da sala (comum → 1 host / 2 grupos; anfiteatro → 2 hosts / 4 grupos). O campo de capacidade saiu do cadastro e do banco. Tudo o mais desta spec (CRUD, unicidade de nome, FR-009) continua valendo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin cadastra as salas do dia (Priority: P1)

Antes de organizar os grupos do processo seletivo, o admin precisa registrar quais salas estão disponíveis, com nome e capacidade. A partir da capacidade, o sistema mostra quantos hosts a sala comporta e o máximo de grupos que cabem nela — sem o admin precisar calcular ou memorizar a regra.

**Why this priority**: sem salas cadastradas, a organização automática de grupos (feature futura) não tem onde alocar ninguém. É o primeiro passo de uma cadeia maior, e funciona de forma independente e completa por si só.

**Independent Test**: cadastrar uma sala com nome e capacidade e confirmar que ela aparece na lista com o número de hosts e o limite de grupos corretos para aquela capacidade.

**Acceptance Scenarios**:

1. **Given** o admin no cadastro de salas, **When** ele informa nome e capacidade e salva, **Then** a sala aparece na lista com hosts e limite de grupos calculados a partir da capacidade informada.
2. **Given** uma sala com até 50 pessoas de capacidade, **When** o admin a visualiza, **Then** o sistema mostra 1 host e limite de 2 grupos.
3. **Given** uma sala com capacidade entre 51 e 80 pessoas, **When** o admin a visualiza, **Then** o sistema mostra 2 hosts e limite de 3 grupos.
4. **Given** uma sala com mais de 80 pessoas de capacidade, **When** o admin a visualiza, **Then** o sistema mostra 2 hosts e limite de 4 grupos.

---

### User Story 2 - Admin corrige nome ou capacidade de uma sala (Priority: P2)

Uma sala pode ter sido cadastrada com o nome errado, ou a capacidade real difere do que foi informado. O admin edita os dados e os valores calculados (hosts, limite de grupos) se atualizam automaticamente.

**Why this priority**: correção de dado é rotina, mas o cadastro (US1) já entrega valor sozinho mesmo sem edição — por isso a prioridade é menor.

**Independent Test**: editar a capacidade de uma sala já cadastrada, cruzando a fronteira de uma faixa (ex.: de 45 para 60 pessoas), e confirmar que hosts e limite de grupos mudam de acordo.

**Acceptance Scenarios**:

1. **Given** uma sala cadastrada, **When** o admin edita o nome, **Then** a mudança é salva e o restante dos dados permanece igual.
2. **Given** uma sala cadastrada, **When** o admin edita a capacidade para um valor em outra faixa, **Then** hosts e limite de grupos passam a refletir a nova faixa imediatamente.

---

### User Story 3 - Admin remove uma sala que não será usada (Priority: P3)

Uma sala cadastrada por engano, ou que não estará disponível na data do processo seletivo, pode ser removida da lista.

**Why this priority**: é a operação menos frequente das três, e a mais fácil de adiar sem travar o restante do fluxo.

**Independent Test**: excluir uma sala sem grupos vinculados a ela e confirmar que ela some da lista.

**Acceptance Scenarios**:

1. **Given** uma sala sem nenhum grupo vinculado a ela, **When** o admin a exclui, **Then** ela deixa de aparecer na lista.
2. **Given** uma sala com grupos já vinculados a ela (fora do escopo desta feature — depende da organização automática de grupos), **When** o admin tenta excluí-la, **Then** o sistema recusa a exclusão e explica o motivo.

---

### Edge Cases

- **Capacidade exatamente na fronteira de uma faixa** (50, 51, 80, 81 pessoas): 50 cai na faixa "até 50"; 51 já cai na faixa seguinte; mesma lógica para 80/81.
- **Nome de sala duplicado**: o sistema recusa salvar uma sala com o mesmo nome de outra já cadastrada, para não haver ambiguidade na hora de montar os grupos.
- **Capacidade zero ou negativa**: recusada — uma sala precisa comportar pelo menos uma pessoa.
- **Alguém que não é admin tenta cadastrar, editar ou excluir sala**: acesso negado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um admin cadastre uma sala informando nome e capacidade (número de pessoas).
- **FR-002**: O sistema MUST calcular a quantidade de hosts e o limite máximo de grupos de uma sala a partir da capacidade, nunca como valores digitados pelo admin.
- **FR-003**: O cálculo MUST seguir as faixas: até 50 pessoas → 1 host, máximo 2 grupos; de 51 a 80 pessoas → 2 hosts, máximo 3 grupos; mais de 80 pessoas → 2 hosts, máximo 4 grupos.
- **FR-004**: O sistema MUST recusar capacidade menor que 1.
- **FR-005**: O sistema MUST impedir duas salas com o mesmo nome.
- **FR-006**: O sistema MUST permitir que um admin liste todas as salas cadastradas, vendo nome, capacidade, hosts e limite de grupos de cada uma.
- **FR-007**: O sistema MUST permitir que um admin edite nome e/ou capacidade de uma sala existente, recalculando hosts e limite de grupos a partir do novo valor.
- **FR-008**: O sistema MUST permitir que um admin exclua uma sala sem grupos vinculados a ela.
- **FR-009**: O sistema MUST recusar a exclusão de uma sala que já tem grupos vinculados a ela, informando o motivo.
- **FR-010**: O sistema MUST restringir cadastro, edição, exclusão **e visualização** de salas a usuários admin. *(Escopo ampliado de "cadastro/edição/exclusão" para incluir "visualização" durante o `/speckit-plan` — sem essa explicitação, ficava ambíguo se listar salas era aberto a qualquer usuário autenticado; optou-se pelo padrão mais conservador, consistente com o restante da feature ser inteiramente admin.)*

### Key Entities

- **Sala**: espaço físico onde grupos do processo seletivo se reúnem. Tem nome (único), capacidade (número de pessoas). Hosts e limite de grupos não são atributos próprios — são derivados da capacidade, sempre que a sala é exibida ou consultada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin cadastra uma sala e vê hosts/limite de grupos corretos, sem precisar consultar a regra em lugar nenhum.
- **SC-002**: 100% das salas com a mesma capacidade mostram o mesmo número de hosts e o mesmo limite de grupos — o cálculo nunca diverge entre duas salas equivalentes.
- **SC-003**: Editar a capacidade de uma sala nunca deixa hosts/limite de grupos desatualizados em relação ao valor salvo.
- **SC-004**: Nenhuma sala é excluída enquanto tiver grupos vinculados a ela.

## Assumptions

- **Nome da sala é texto livre** (ex.: "2.2.1", "Auditório"), sem formato obrigatório — o padrão observado no backlog original mistura os dois estilos.
- **Capacidade é um número inteiro** de pessoas.
- **Sem paginação**: o número de salas de um processo seletivo é pequeno (dezenas, não centenas) — a listagem mostra todas de uma vez.
- **Fora de escopo**: a organização automática de grupos em si (feature 012, que consome os dados desta); qualquer noção de "sala ocupada" ou disponibilidade por data/horário — uma sala cadastrada está disponível até ser excluída.

## Dependências e impacto em outras features

- A feature de **organização automática de grupos** (012) consome as salas cadastradas aqui — o limite de grupos por sala e a quantidade de hosts calculados nesta feature são a restrição que aquela feature respeita ao distribuir candidatos e avaliadores.
- Esta feature é **independente** na cadeia do backlog: não depende de 008/009/010 para funcionar, e pode ser implementada e usada isoladamente.
