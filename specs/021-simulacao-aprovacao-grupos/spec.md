# Feature Specification: Simulação com aprovação, limpar organização e badges na tela de Grupos Presenciais

**Feature Branch**: `021-simulacao-aprovacao-grupos`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description (resumo): a tela de Grupos Presenciais ganha 1) um botão "Limpar
organização" (destrutivo, com confirmação, remove toda a organização presencial atual); 2) o
botão "Organizar grupos" deixa de existir sozinho — vira "Simular grupos", que abre um modal
onde a gestão escolhe quais avaliadores presentes participam, pode promover alguém a host
dentro do modal, vê uma prévia completa da distribuição (sala, candidatos, host, avaliadores,
quantidade) e só aplica de verdade ao clicar em "Aprovar simulação e organizar grupos" — abrir
o modal nunca persiste nada sozinho; 3) badge de sexo (masculino/feminino/outro, cores suaves)
ao lado do nome de cada candidato nas listagens da tela; 4) nome de membro Trainee em vermelho,
em toda listagem relevante, incluindo a prévia da simulação.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestão configura, simula, revisa e só então aprova a organização (Priority: P1)

A gestão clica em "Simular grupos" na tela de Grupos Presenciais. Um modal abre mostrando os
avaliadores presentes (com busca por nome), permitindo escolher quais participam desta
organização e promover algum deles a host ali mesmo. Abaixo, uma prévia mostra exatamente como
os grupos ficariam — sala por sala, com candidatos, host responsável, avaliadores e quantidade
de gente — sem que nada tenha sido gravado ainda. Só ao clicar em "Aprovar simulação e
organizar grupos" a distribuição mostrada é aplicada de verdade.

**Why this priority**: É o núcleo do pedido — dar à gestão controle e visibilidade antes de um
passo que hoje é tudo-ou-nada e irreversível sem "Limpar organização".

**Independent Test**: Abrir "Simular grupos", ajustar a seleção de avaliadores, conferir que a
prévia muda de acordo, fechar o modal sem aprovar e confirmar que `GET /groups` continua
exatamente como estava antes. Repetir e desta vez aprovar — `GET /groups` passa a refletir
exatamente a prévia que estava na tela.

**Acceptance Scenarios**:

1. **Given** candidatos e avaliadores presentes, **When** a gestão abre "Simular grupos",
   **Then** vê uma lista pesquisável de avaliadores presentes e uma prévia da organização —
   sem nenhuma mudança em `GET /groups`.
2. **Given** o modal de simulação aberto, **When** a gestão desmarca um avaliador da lista,
   **Then** a prévia é recalculada sem contar aquele avaliador.
3. **Given** o modal de simulação aberto, **When** a gestão promove um avaliador a host,
   **Then** essa pessoa passa a contar como host (não mais como avaliador de grupo) na prévia
   seguinte.
4. **Given** uma prévia sendo exibida, **When** a gestão fecha o modal sem clicar em aprovar,
   **Then** nenhuma organização é criada, alterada ou removida.
5. **Given** uma prévia sendo exibida, **When** a gestão clica em "Aprovar simulação e
   organizar grupos", **Then** a organização real passa a refletir exatamente a prévia (mesmos
   candidatos, hosts e avaliadores por sala), o modal fecha e a tela atualiza.

---

### User Story 2 - Gestão limpa a organização atual (Priority: P2)

A gestão clica em "Limpar organização" na tela de Grupos Presenciais. O sistema pede
confirmação antes de agir. Depois de confirmado, todos os candidatos presenciais voltam ao
estado de não organizados — sem grupo, sem sala, sem avaliador nem host associado.

**Why this priority**: Dá à gestão uma saída explícita e reversível-por-reorganização de um
estado de organização que não serve mais, sem precisar organizar de novo por cima (o que já
sobrescreve, mas não deixa claro visualmente que foi uma limpeza deliberada).

**Independent Test**: Com grupos presenciais já organizados, clicar em "Limpar organização",
confirmar, e verificar que `GET /groups` não mostra mais nenhum grupo presencial (os online
continuam intactos).

**Acceptance Scenarios**:

1. **Given** grupos presenciais organizados, **When** a gestão clica em "Limpar organização"
   e confirma, **Then** nenhum grupo presencial resta — candidatos, hosts e avaliadores
   perdem toda associação.
2. **Given** o mesmo cenário, **When** a gestão clica em "Limpar organização" mas cancela a
   confirmação, **Then** nada muda.
3. **Given** grupos online também organizados, **When** a gestão limpa a organização
   presencial, **Then** os grupos online continuam intactos (mesma independência da FEAT-0018).

---

### User Story 3 - Badge de sexo nos candidatos (Priority: P3)

Em qualquer listagem de candidatos na tela de Grupos Presenciais (grupos já organizados e
prévia da simulação), cada candidato mostra um badge discreto ao lado do nome indicando o sexo.

**Why this priority**: Ajuda a gestão a verificar visualmente a regra D1 (nunca exatamente 1
mulher por grupo) sem precisar abrir outra tela — conveniência sobre o núcleo funcional das
US1/US2.

**Independent Test**: Abrir a tela com grupos organizados e conferir o badge ao lado de cada
candidato; abrir a prévia da simulação e conferir o mesmo badge lá.

**Acceptance Scenarios**:

1. **Given** um grupo com candidatos de sexos variados, **When** a gestão olha a listagem,
   **Then** cada candidato mostra um badge discreto (cor suave) indicando masculino, feminino
   ou outro.

---

### User Story 4 - Nome de Trainee em destaque (Priority: P3)

Em qualquer listagem de avaliadores/hosts na tela de Grupos Presenciais (grupos organizados e
prévia da simulação), o nome de quem tem situação de membro "Trainee" aparece em vermelho.

**Why this priority**: Mesma motivação da US3 — sinalização visual de apoio, não bloqueia
nenhum fluxo.

**Independent Test**: Com um avaliador trainee alocado a um grupo, conferir que o nome dele
aparece em vermelho tanto no grupo já organizado quanto na prévia da simulação.

**Acceptance Scenarios**:

1. **Given** um avaliador com situação "Trainee" alocado a um grupo, **When** a gestão olha a
   listagem de avaliadores desse grupo, **Then** o nome aparece em vermelho — os demais
   (efetivado, pós-júnior) aparecem na cor padrão.

---

### Edge Cases

- Desmarcar todos os avaliadores no modal: a prévia mostra os grupos formados só por
  candidatos, sem avaliador nenhum — mesmo comportamento já aceito hoje pra "avaliadores
  insuficientes".
- Promover alguém a host dentro do modal é uma ação imediata (mesma ação já existente na tela
  de Avaliadores) — continua valendo mesmo que a simulação não seja aprovada depois.
- "Limpar organização" quando não há nenhum grupo presencial organizado: ação seria um no-op;
  o botão pode ficar desabilitado nesse estado, ou a ação simplesmente não encontra nada pra
  remover — sem erro.
- Aprovar uma simulação depois que o estado de presença mudou (alguém fez check-in ou saiu
  entre abrir o modal e aprovar): a organização aplicada reflete o estado de presença no
  momento da aprovação, não o do momento em que o modal abriu — mesmo tipo de janela de corrida
  que já existe em qualquer ação "ler depois agir" do sistema.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela de Grupos Presenciais DEVE oferecer uma ação "Limpar organização" que
  remove toda a organização presencial atual (grupos, associação de candidatos, hosts e
  avaliadores), pedindo confirmação explícita antes de executar.
- **FR-002**: A ação "Limpar organização" DEVE ser visualmente identificável como destrutiva.
- **FR-003**: "Limpar organização" NÃO DEVE afetar a organização de grupos online.
- **FR-004**: O botão "Organizar grupos" (ação direta e imediata) NÃO DEVE mais existir na
  tela de Grupos Presenciais.
- **FR-005**: DEVE existir uma ação "Simular grupos" que abre uma visão de configuração e
  prévia — sem persistir nada até aprovação explícita.
- **FR-006**: A simulação DEVE mostrar os avaliadores presentes, pesquisáveis por nome, com
  possibilidade de escolher quais participam da organização sendo simulada.
- **FR-007**: A simulação DEVE permitir promover um avaliador a host diretamente, refletindo
  essa mudança na prévia seguinte.
- **FR-008**: A prévia DEVE mostrar, por sala/grupo: identificação da sala, candidatos
  alocados, host responsável, avaliadores responsáveis e quantidade de gente na sala.
- **FR-009**: A simulação DEVE distinguir visualmente avaliador de host em qualquer listagem
  de pessoas.
- **FR-010**: Abrir ou recalcular a simulação NÃO DEVE alterar a organização real de nenhuma
  forma.
- **FR-011**: DEVE existir uma ação "Aprovar simulação e organizar grupos" que aplica de
  verdade — exatamente — a distribuição mostrada na prévia (mesmos candidatos, hosts e
  avaliadores por sala usados no cálculo mais recente da prévia).
- **FR-012**: Depois de aprovar, o modal DEVE fechar e a tela de grupos DEVE refletir a nova
  organização.
- **FR-013**: Toda listagem de candidatos na tela de Grupos Presenciais (grupos organizados e
  prévia) DEVE mostrar um badge de sexo (masculino/feminino/outro) discreto ao lado do nome.
- **FR-014**: Toda listagem de avaliadores/hosts na tela de Grupos Presenciais (grupos
  organizados e prévia) DEVE mostrar o nome em vermelho quando a pessoa tiver situação de
  membro "Trainee".

### Key Entities

- **Simulação/prévia**: não é uma entidade persistida — um cálculo sob demanda, descartado ao
  fechar o modal sem aprovar (mesmo espírito da FEAT-0020, agora com configuração e aprovação
  em vez de só visualização).
- **Host responsável pela sala**: conceito que passa a ser efetivamente calculado e exibido
  (antes, `hostCount` de uma sala era só um número de referência, sem pessoas reais associadas
  a uma sala específica). O vínculo nasce junto com a organização aprovada, do mesmo jeito que
  o vínculo avaliador↔grupo já existe hoje.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das aberturas do modal de simulação, sem aprovação, deixam a organização
  real exatamente como estava antes.
- **SC-002**: 100% das aprovações aplicam exatamente a distribuição (candidatos/hosts/
  avaliadores por sala) que estava na prévia no momento do clique.
- **SC-003**: "Limpar organização" sempre pede confirmação antes de remover qualquer dado.
- **SC-004**: Um avaliador trainee alocado a qualquer grupo aparece em vermelho em 100% das
  listagens relevantes da tela (organizada e prévia).

## Assumptions

- Promover um avaliador a host dentro do modal é uma ação real e imediata (mesma já existente
  na tela de Avaliadores, FEAT-0009) — não fica "em rascunho" esperando aprovação; só a
  organização de grupos em si (quem vai pra qual sala/grupo) fica pendente até aprovar.
- O badge de sexo se aplica só a candidatos — avaliadores/hosts não têm sexo registrado no
  sistema (não existe esse dado pra membros, só para candidatos inscritos).
- Mostrar o sexo do candidato nesta tela é seguro porque `/groups` já é inteiramente
  admin-only (diferente do check-in de candidatos, onde qualquer avaliador tem acesso e o dado
  continua propositalmente escondido) — não é uma reversão da postura de privacidade da
  FEAT-0005/0012, é uma exceção pontual e já dentro do mesmo nível de acesso.
- "Host responsável pela sala" é compartilhado por todos os grupos daquela sala (mesmo host
  aparece em todos os grupos da sala) — D5 já definia host como recurso da sala, não do grupo
  individual.
- A seleção de avaliadores no modal afeta só quem entra no cálculo de avaliador-por-grupo;
  hosts presentes continuam sendo usados automaticamente para preencher as salas (sem
  checkbox própria pra host — a única forma de mudar quem é host é promover alguém no modal).
