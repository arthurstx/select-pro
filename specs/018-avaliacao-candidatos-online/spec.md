# Feature Specification: Prosel online — grupos e avaliação independentes do presencial

**Feature Branch**: `018-avaliacao-candidatos-online`

**Created**: 2026-09-01

**Revised**: 2026-09-01 — reformulação completa antes de qualquer commit. A primeira versão
desta spec assumia que presencial e online aconteciam no mesmo evento, com o mesmo pool de
avaliadores, alocados automaticamente por round-robin. O usuário corrigiu essa premissa: são
processos **operacionalmente distintos** (dias diferentes, pessoas diferentes), e a versão
anterior foi descartada antes de qualquer implementação chegar a ser commitada. Este documento
substitui a versão anterior por completo.

**Status**: Draft

**Input**: User description: "Prosel online acontece em dia diferente do presencial. Avaliadores do online normalmente não são os mesmos do presencial — não reutilizar grupos/equipes/alocações. Prosel online não precisa de separação de Avaliadores/Hosts ou salas como no presencial — só separação de candidatos. Demanda do online é baixa, gestão distribui avaliadores manualmente. Avaliador só entra num grupo online clicando em 'participar do grupo' ele mesmo — não existe host no online, só avaliador. Lógica do online deve ser mais simples e independente da estrutura do presencial. Tela de grupos ganha seção separada: Grupos Online / Grupos Presenciais."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin organiza os grupos online, independente do presencial (Priority: P1)

Num dia diferente do dia presencial, o admin aciona "organizar grupos online" para a edição
corrente. O sistema separa só os candidatos presentes online em grupos (respeitando D1 —
nunca exatamente 1 mulher por grupo). Essa ação não toca em nenhum grupo presencial já
formado — mesmo que o presencial já tenha sido organizado antes (em outro dia) ou seja
organizado depois.

**Why this priority**: É a correção do bug mais grave da versão anterior desta spec — hoje
(antes desta feature) rodar a organização de grupos apaga TODOS os grupos da edição, então
organizar num dia apagaria o que foi organizado no outro.

**Independent Test**: Organizar os grupos presenciais um dia, depois organizar os grupos
online outro dia (datas diferentes, mesma edição) — os grupos presenciais continuam intactos
depois da segunda operação.

**Acceptance Scenarios**:

1. **Given** grupos presenciais já organizados para a edição corrente, **When** o admin
   organiza os grupos online, **Then** os grupos presenciais existentes permanecem
   inalterados — mesmos candidatos, mesmos avaliadores, mesma sala.
2. **Given** candidatos presentes online (e nenhum candidato presencial presente ainda),
   **When** o admin organiza os grupos online, **Then** o sistema forma grupos só com esses
   candidatos, respeitando D1, sem sala e sem avaliador/host alocado.
3. **Given** grupos online já existem de uma organização anterior, **When** o admin organiza
   os grupos online de novo, **Then** a organização anterior é descartada e substituída (nova
   distribuição de candidatos, sem avaliador) — mesmo comportamento que "organizar grupos
   presenciais" já tem hoje para presencial, mas agora escopado só a online.

---

### User Story 2 - Avaliador escolhe entrar num grupo online (Priority: P1)

Um avaliador (não host — host não existe no contexto online) vê a lista de grupos online já
formados e clica em "Participar do grupo" num deles. Ele passa a fazer parte desse grupo e
consegue avaliar os candidatos dele. Ninguém é alocado a um grupo online sem essa ação
própria — ao contrário do presencial, onde a organização automática já aloca avaliador/host.

**Why this priority**: É o mecanismo inteiro de alocação do online — sem ele, os grupos
online formados na US1 nunca têm quem avalie.

**Independent Test**: Com grupos online formados e um avaliador autenticado, clicar em
"Participar" num grupo e confirmar que ele passa a aparecer na lista de avaliadores desse
grupo, e que os candidatos desse grupo aparecem na tela de avaliação dele.

**Acceptance Scenarios**:

1. **Given** um grupo online formado, sem nenhum avaliador ainda, **When** um avaliador clica
   em "Participar do grupo", **Then** ele passa a integrar esse grupo, e os candidatos dele
   ficam disponíveis para avaliação.
2. **Given** um avaliador já está num grupo online A, **When** ele clica em "Participar" do
   grupo online B, **Then** ele é movido de A para B — nunca fica nos dois ao mesmo tempo, e o
   sistema não duplica a entrada.
3. **Given** um avaliador quer sair de um grupo online sem entrar em outro, **When** ele aciona
   essa opção, **Then** ele deixa de constar em qualquer grupo online.

---

### User Story 3 - Gestão distribui avaliadores manualmente quando necessário (Priority: P2)

Como a demanda do online é baixa, a gestão (admin) também pode atribuir um avaliador
diretamente a um grupo online, sem depender do avaliador clicar em nada — por exemplo, para
casos combinados por fora (WhatsApp, e-mail).

**Why this priority**: É um caminho alternativo ao self-service da US2 — tem valor por si só
(cobre o caso "avaliador não conseguiu entrar sozinho, gestão resolve"), mas o sistema já
funciona sem ele, contanto que o self-service exista.

**Independent Test**: Com um grupo online formado e um avaliador ainda sem grupo, a gestão
atribui esse avaliador ao grupo diretamente pela tela de administração — sem o avaliador
precisar fazer nada.

**Acceptance Scenarios**:

1. **Given** um avaliador não está em nenhum grupo online, **When** a gestão o atribui
   diretamente a um grupo online, **Then** ele passa a constar nesse grupo, do mesmo jeito que
   se tivesse clicado em "Participar" ele mesmo.

---

### User Story 4 - Tela de grupos separada por modalidade (Priority: P2)

Na tela de gestão de grupos, o admin vê duas seções claramente separadas: "Grupos Online" e
"Grupos Presenciais" — não uma lista única misturando os dois, como é hoje.

**Why this priority**: Sem isso, fica difícil de enxergar a separação operacional real (dias
diferentes, pessoas diferentes) que esta feature inteira existe para refletir.

**Independent Test**: Com grupos de ambas as modalidades organizados, abrir a tela e confirmar
que aparecem em duas seções distintas, cada uma com o botão de organizar correspondente.

**Acceptance Scenarios**:

1. **Given** grupos presenciais e online organizados, **When** o admin abre a tela de grupos,
   **Then** vê duas seções: "Grupos Online" (com os grupos online e a ação de organizar/
   atribuir avaliador) e "Grupos Presenciais" (como já existe hoje).

---

### Edge Cases

- Um avaliador que É host (papel de host na edição, FEAT-0009) participa de um grupo online:
  ele entra normalmente, mas o sistema não o rotula como "host" nesse contexto — o conceito de
  host simplesmente não existe para grupos online (aparece como avaliador ali, mesmo sendo
  host no presencial).
- Reorganizar os grupos online quando já existem avaliadores alocados neles: a reorganização
  descarta os grupos (e portanto os vínculos de avaliador) e forma tudo de novo do zero — os
  avaliadores precisam entrar de novo depois.
- Mover um candidato ou avaliador entre um grupo online e um presencial continua bloqueado
  (regra já existente, sem mudança).
- Um avaliador tenta "participar" de um grupo que na verdade é presencial: o sistema recusa —
  o self-service só vale para grupos online.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir organizar os grupos online (separar candidatos
  presentes online em grupos, respeitando D1) como uma ação **independente** de organizar os
  grupos presenciais — uma não pode afetar os grupos já existentes da outra.
- **FR-002**: A organização de grupos online NÃO DEVE alocar sala, avaliador ou host
  automaticamente — grupos online nascem só com candidatos.
- **FR-003**: Um avaliador autenticado DEVE conseguir se juntar a um grupo online por conta
  própria (ação própria, sem depender de admin).
- **FR-004**: Um avaliador NUNCA DEVE pertencer a mais de um grupo online ao mesmo tempo —
  juntar-se a outro grupo online move a alocação, não duplica.
- **FR-005**: Um avaliador DEVE conseguir sair de um grupo online sem precisar entrar em outro.
- **FR-006**: A gestão (admin) DEVE conseguir atribuir manualmente um avaliador a um grupo
  online, como alternativa ao avaliador se juntar por conta própria.
- **FR-007**: Grupos online NUNCA DEVEM exibir ou tratar um avaliador como "host" — a
  distinção host/avaliador só existe no contexto presencial.
- **FR-008**: A tela de gestão de grupos DEVE apresentar grupos online e presenciais em seções
  visualmente separadas, cada uma com sua própria ação de organizar.
- **FR-009**: Um avaliador alocado (por si mesmo ou pela gestão) a um grupo online DEVE
  conseguir avaliar os candidatos desse grupo, com o mesmo mecanismo já usado para candidatos
  presenciais (sem mudança na elegibilidade de avaliação em si).
- **FR-010**: O bloqueio de mover candidato/avaliador entre um grupo presencial e um online
  DEVE continuar valendo, sem alteração.

### Key Entities

- **Grupo (online)**: já existe (FEAT-0012). Passa a ser gerido por uma operação de
  organização própria, independente da presencial, e o vínculo com avaliador passa a ser
  sempre iniciado por ação humana (self-service ou atribuição manual), nunca por algoritmo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizar os grupos online em um dia não altera nenhum grupo presencial já
  organizado em outro dia, e vice-versa.
- **SC-002**: Um avaliador consegue entrar num grupo online e começar a avaliar candidatos
  dele em menos de 3 cliques a partir da tela de grupos.
- **SC-003**: Nenhum avaliador aparece em mais de um grupo online ao mesmo tempo, em nenhum
  momento do fluxo (self-service ou atribuição manual).
- **SC-004**: Um candidato presente online, uma vez avaliado por 2+ avaliadores sem nota
  vermelha, recebe veredito — deixando de ficar permanentemente pendente (mesmo objetivo da
  versão anterior desta spec, agora com o mecanismo de alocação corrigido).

## Assumptions

- D1 (nunca exatamente 1 mulher por grupo) continua se aplicando à distribuição de candidatos
  online — só a parte de avaliador/host muda de mecanismo.
- Um avaliador que é host no presencial (FEAT-0009) pode participar de grupos online
  normalmente — só não é rotulado como host nesse contexto (FR-007).
- Entrar num grupo online não exige check-in de membro prévio (FEAT-0010) — o próprio clique
  em "Participar" já é o sinal de disponibilidade; diferente do presencial, onde a alocação
  automática depende de quem fez check-in.
- Sem registro de canal de entrevista (link de videochamada etc.) — combinado fora do sistema,
  como já valia na versão anterior desta spec.
- Sem mudança na regra de elegibilidade de avaliação (FEAT-0013) nem no formulário de
  avaliação em si — só em como o vínculo avaliador↔grupo online é criado.
