# Feature Specification: Papel de host por edição e painel de avaliadores

**Feature Branch**: `feat/papel-host`

**Created**: 2026-08-24

**Status**: Draft

**Input**: Backlog organizado em 2026-08-24 (features 008–016). Decisão D4: host é atribuição por edição do processo seletivo, já validada com o usuário.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin define quem é host na edição corrente (Priority: P1)

O admin abre o painel de avaliadores e vê a lista de todo mundo que pode avaliar. Para cada pessoa, ele pode alternar entre "avaliador" e "host" — essa escolha vale só para a edição do processo seletivo que está em andamento agora.

**Why this priority**: sem essa atribuição, não existe host em lugar nenhum do sistema — é a única razão de a feature existir.

**Independent Test**: alternar um membro para host, confirmar que a mudança aparece na lista, e confirmar que uma edição diferente (anterior) não é afetada.

**Acceptance Scenarios**:

1. **Given** um avaliador sem atribuição na edição corrente, **When** o admin o marca como host, **Then** ele passa a aparecer como host nessa edição.
2. **Given** um membro marcado como host na edição corrente, **When** o admin o marca de volta como avaliador, **Then** ele volta a aparecer como avaliador.
3. **Given** um membro que foi host numa edição anterior já encerrada, **When** a edição corrente começa, **Then** ele aparece como avaliador comum na edição corrente até o admin decidir de novo — a atribuição não atravessa edições sozinha.
4. **Given** duas edições diferentes, **When** o admin altera o cargo de alguém na edição corrente, **Then** o registro histórico de qual cargo essa pessoa teve em edições passadas não muda.

---

### User Story 2 - Admin filtra a lista por cargo (Priority: P2)

Com a lista de avaliadores podendo crescer, o admin filtra para ver só quem é host ou só quem é avaliador comum na edição corrente.

**Why this priority**: conveniência sobre a US1 — a atribuição já funciona sem o filtro, o filtro só facilita encontrar quem se procura numa lista maior.

**Independent Test**: com hosts e avaliadores misturados na lista, aplicar o filtro de cada cargo e conferir que só as pessoas certas aparecem.

**Acceptance Scenarios**:

1. **Given** uma lista com avaliadores e hosts misturados, **When** o admin filtra por "host", **Then** só quem está marcado como host na edição corrente aparece.
2. **Given** o mesmo cenário, **When** o admin filtra por "avaliador", **Then** só quem não é host aparece.
3. **Given** nenhum filtro aplicado, **When** o admin abre a lista, **Then** vê todo mundo, independente do cargo.

---

### Edge Cases

- **Sem processo seletivo corrente** (nenhuma edição contém a data de hoje): o painel não tem edição para atribuir cargo — mesmo tratamento que outras telas do projeto já dão a essa ausência (não é erro de configuração, é um estado que precisa de aviso claro ao admin).
- **Membro nunca avaliado antes** (sem nenhuma atribuição em nenhuma edição): aparece como avaliador comum por padrão — "host" é sempre uma escolha explícita do admin, nunca o estado inicial.
- **Alguém que não é admin tenta abrir o painel ou alternar o cargo**: acesso negado.
- **Situação do membro na empresa muda depois de virar host**: fora do escopo — a atribuição de host não é revogada automaticamente por isso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um admin veja a lista de avaliadores da edição corrente do processo seletivo.
- **FR-002**: A lista MUST mostrar, para cada avaliador, seu cargo na edição corrente (avaliador ou host) e a situação dele na empresa (efetivado, pós-júnior ou trainee).
- **FR-003**: O sistema MUST permitir que um admin altere o cargo de um avaliador entre "avaliador" e "host", valendo apenas para a edição corrente.
- **FR-004**: Um avaliador sem atribuição registrada na edição corrente MUST aparecer como avaliador comum por padrão.
- **FR-005**: O sistema MUST preservar o histórico de qual cargo alguém teve em edições anteriores — alterar o cargo na edição corrente não MUST reescrever nem apagar o registro de outra edição.
- **FR-006**: O sistema MUST permitir que um admin filtre a lista por cargo (avaliador ou host) na edição corrente.
- **FR-007**: O sistema MUST restringir a visualização e a alteração de cargo a usuários admin.
- **FR-008**: Quando não houver processo seletivo corrente, o sistema MUST informar isso claramente ao admin, em vez de mostrar uma lista vazia sem explicação.

### Key Entities

- **Atribuição de cargo**: liga um avaliador a uma edição específica do processo seletivo e diz qual cargo ele tem nela (avaliador ou host). Uma pessoa pode ter atribuições diferentes em edições diferentes, todas preservadas.
- **Avaliador**: membro com conta na plataforma habilitada a avaliar candidatos — já existe (FEAT-0003/0008). Esta feature não cria avaliadores, só atribui cargo a quem já existe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue promover um avaliador a host e ver a mudança refletida imediatamente na lista.
- **SC-002**: Alterar o cargo de alguém na edição corrente nunca altera o cargo registrado dele em outra edição — verificável comparando os dois antes e depois da mudança.
- **SC-003**: O filtro por cargo mostra exatamente quem tem aquele cargo na edição corrente, sem falsos positivos nem negativos.
- **SC-004**: Um usuário sem papel de admin não consegue ver nem alterar cargo de ninguém.

## Assumptions

- **Só quem já tem conta como avaliador aparece na lista** — solicitações pendentes de aprovação (FEAT-0008) não entram aqui; essa tela cuida de cargo, não de admissão.
- **Admins não aparecem na própria lista de avaliadores** — a tela gerencia quem avalia/hospeda, não gerencia outros admins.
- **"Edição corrente" usa a mesma regra do resto do sistema**: a edição cuja janela de datas contém hoje (FEAT-0005). Se essa noção não existir no momento, a tela avisa em vez de falhar silenciosamente (FR-008).
- **Fora de escopo**: qualquer limite de quantos hosts uma sala comporta ou quantos grupos existem (feature 012, que consome esta); revogação automática de host por mudança de situação do membro; visualização/edição de cargos em edições passadas (só a corrente é editável nesta feature).

## Dependências e impacto em outras features

- A feature de **organização automática de grupos** (012) consome o cargo definido aqui: precisa saber quem é host para distribuir pessoas nas salas, e precisa da regra "trainee não pode ser o único avaliador de um grupo" (FEAT-0008, `isEligibleToAnchorTrainee`) combinada com quem é host.
- A feature de **check-in de membros** (010) depende desta: só faz sentido fazer check-in de quem já está na lista de avaliadores/hosts da edição corrente.
- Depende da FEAT-0008 (feita) para a situação do membro (efetivado/pós-júnior/trainee) exibida na lista.
