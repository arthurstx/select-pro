# Feature Specification: Recomendações e Simulação de Grupos (Presencial + Online)

**Feature Branch**: `022-recomendacoes-simulacao-grupos`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Melhorar as recomendações de organização (presencial) com mais cenários de exemplo, diagnóstico de déficit de host com sugestão de quem promover, diagnóstico de desvio do ideal por grupo/sala na prévia presencial, e trazer o mesmo conceito de simulação-antes-de-aplicar para o processo online (com regra própria de faixa ideal de tamanho de grupo e sem distribuição automática de avaliador, que continua manual)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber se falta host antes de organizar (Priority: P1)

Quem administra o processo abre "Simular grupos" (presencial) e, antes de aprovar, quer saber se a quantidade de hosts presentes é suficiente para a organização que está sendo montada — e, se não for, quem entre os avaliadores presentes poderia virar host para cobrir a falta.

**Why this priority**: Hoje descobrir a falta de host só acontece depois de aprovar (grupos ficam sem host responsável) ou por tentativa e erro. É o problema mais concreto e citado primeiro pelo usuário, e a base de dados (quantos hosts a estrutura atual exige) já é derivável de regras existentes.

**Independent Test**: Numa edição com mais grupos/salas do que hosts presentes suportam, abrir "Simular grupos" e conferir que aparece um aviso "faltam N host(s)" com nomes sugeridos para promoção — sem precisar de nenhuma das outras user stories.

**Acceptance Scenarios**:

1. **Given** uma simulação presencial cuja estrutura de salas precisa de mais hosts do que os presentes atualmente têm, **When** a gestão abre o modal de simulação, **Then** o sistema mostra quantos hosts estão faltando e destaca, entre os avaliadores participantes, sugestões de quem promover.
2. **Given** uma simulação presencial cuja quantidade de hosts presentes já é suficiente para a estrutura calculada, **When** a gestão abre o modal, **Then** nenhum aviso de déficit de host aparece.
3. **Given** um aviso de déficit de host com sugestão de promoção, **When** a gestão promove manualmente um dos avaliadores sugeridos (ação já existente), **Then** o aviso é recalculado e reflete a nova contagem de hosts.

---

### User Story 2 - Ver o que está fora do ideal antes de aprovar (Priority: P2)

Na mesma prévia de simulação presencial, quem administra quer ver, grupo a grupo e sala a sala, se a organização calculada segue a configuração recomendada (tamanho de grupo, quantidade de avaliadores, quantidade de host por sala) ou se algum ponto ficou fora do ideal — sem precisar contar candidatos manualmente em cada cartão.

**Why this priority**: Depende só da prévia que já existe (FEAT-0021); é um enriquecimento direto da mesma tela usada pela US1, sem escopo novo de dados além do necessário para calcular o ideal por sala.

**Independent Test**: Rodar uma simulação com pelo menos um grupo fora da faixa ideal (por exemplo, um grupo de 3) e conferir que ele aparece sinalizado de forma diferente de um grupo de 4-5, e que um resumo no topo do modal lista os pontos fora da recomendação.

**Acceptance Scenarios**:

1. **Given** uma prévia com grupos de tamanhos variados, **When** a gestão revisa a lista, **Then** cada grupo mostra se está no ideal (4-5 candidatos, 2 avaliadores), aceitável (3 candidatos, 1 avaliador) ou fora do recomendado.
2. **Given** uma sala cuja quantidade de host não bate com o recomendado para o tamanho dela, **When** a gestão revisa a prévia, **Then** essa sala aparece sinalizada com o desvio.
3. **Given** uma organização que segue o ideal em todos os grupos e salas, **When** a gestão abre a prévia, **Then** o resumo do topo indica que a organização está de acordo com a recomendação, sem listar desvios.

---

### User Story 3 - Entender a lógica por trás da recomendação (Priority: P3)

Quem administra quer, dentro do modal de simulação presencial, ver exemplos de referência de como a recomendação funciona em diferentes cenários (poucos candidatos, muitos candidatos, poucas ou muitas salas, falta ou sobra de avaliador/host) — não só o número calculado para a situação atual — para entender por que o sistema está recomendando o que está recomendando, especialmente quando os recursos disponíveis não bastam para o cenário ideal.

**Why this priority**: É um ganho educativo/de confiança sobre a recomendação já existente (calculada desde a FEAT-0021), não uma capacidade nova de cálculo — pode ser adicionado depois que o diagnóstico (US1/US2) já está no ar.

**Independent Test**: Abrir o modal de simulação presencial e conferir que, além do número ideal para a situação atual, existe uma referência com mais de um cenário de exemplo (ex.: "poucos candidatos", "muitos candidatos", "poucas salas"), e que quando os recursos presentes não bastam para o ideal, existe uma explicação textual do motivo.

**Acceptance Scenarios**:

1. **Given** o modal de simulação presencial aberto, **When** a gestão consulta a área de recomendação, **Then** vê mais de um cenário de referência (não só o total de candidatos presentes no momento).
2. **Given** uma situação em que avaliadores/hosts/salas presentes não bastam para a configuração ideal, **When** a gestão consulta a recomendação, **Then** o sistema explica por que o ideal não é alcançável e aponta a distribuição mais próxima possível.

---

### User Story 4 - Simular a organização online antes de aplicar (Priority: P4)

Assim como já acontece no presencial, quem administra quer poder simular a divisão dos candidatos online em grupos, revisar essa divisão, e só então aprovar — em vez de a organização já acontecer de forma definitiva ao clicar em "Organizar online" como é hoje.

**Why this priority**: É a maior peça nova (prévia, modal de revisão, regra de tamanho de grupo própria do online) e não bloqueia nem é bloqueada pelas melhorias no presencial (US1-US3) — pode ser entregue de forma independente, inclusive depois.

**Independent Test**: Na tela de Grupos Online, acionar "Simular grupos", revisar a prévia calculada (sem que nada mude na organização real ainda) e só depois aprovar — conferindo que a organização real só é criada/atualizada nesse momento.

**Acceptance Scenarios**:

1. **Given** candidatos online presentes ainda sem organização, **When** a gestão abre a simulação online, **Then** vê uma prévia dos grupos que seriam formados (candidatos por grupo), sem que nenhum grupo real seja criado ainda.
2. **Given** uma prévia online calculada, **When** a gestão fecha o modal sem aprovar, **Then** nenhuma organização real foi alterada.
3. **Given** uma prévia online revisada, **When** a gestão aprova a simulação, **Then** os grupos reais são criados/substituídos exatamente como mostrado na prévia.
4. **Given** avaliadores já atribuídos a grupos online existentes (por entrada própria ou atribuição manual), **When** a gestão aprova uma nova simulação que substitui esses grupos, **Then** o sistema avisa claramente, antes da aprovação, que essas atribuições de avaliador serão perdidas e precisarão ser refeitas.
5. **Given** uma simulação online aprovada, **When** um avaliador ou a gestão vai atribuir avaliadores aos novos grupos, **Then** isso continua acontecendo do jeito manual já existente (entrada própria do avaliador ou atribuição pelo admin) — a simulação não atribui avaliador nenhum sozinha.

---

### Edge Cases

- Quando não há avaliadores suficientes entre os presentes para cobrir o déficit de host sugerido (US1), o sistema deve deixar claro que a sugestão de promoção também é insuficiente, em vez de sugerir promover mais gente do que existe disponível.
- Quando não há nenhuma sala cadastrada (presencial) ou nenhum candidato online presente, as áreas de recomendação/diagnóstico não devem quebrar — devem indicar que não há o que calcular.
- Um grupo presencial vazio (edge case já tratado pelo algoritmo real, que nunca cria grupo vazio) não deve aparecer como "fora do ideal" porque simplesmente não existe na prévia.
- Ao reabrir/recalcular a simulação presencial (mudar quem participa, promover/rebaixar host), os diagnósticos de déficit e de desvio devem recalcular junto — nunca mostrar um diagnóstico desatualizado em relação à prévia exibida.
- Na simulação online, se a quantidade de candidatos não permite nenhuma divisão dentro da faixa 3-5 (por exemplo, 1 ou 2 candidatos só), o sistema forma o melhor grupo possível dentro do que existe, sem tentar forçar um mínimo inatingível.
- Aprovar uma simulação online quando já existem avaliadores atribuídos aos grupos antigos precisa de uma confirmação explícita da gestão (mesmo padrão de aviso já usado em ações que descartam algo, como "Limpar organização" no presencial).

## Requirements *(mandatory)*

### Functional Requirements

**Diagnóstico de host (US1)**

- **FR-001**: O sistema MUST calcular, a partir da estrutura de salas efetivamente usada pela prévia presencial atual, quantos hosts são necessários para segui-la integralmente.
- **FR-002**: O sistema MUST comparar essa necessidade com a quantidade de hosts presentes hoje e, havendo déficit, MUST exibir quantos hosts estão faltando.
- **FR-003**: Quando houver déficit de host, o sistema MUST destacar, entre os avaliadores presentes participando da simulação, sugestões de quem poderia ser promovido para cobrir a falta — sem promover ninguém automaticamente.
- **FR-004**: A promoção continua sendo uma ação manual e individual da gestão (capacidade já existente); o diagnóstico de déficit MUST recalcular após qualquer promoção/rebaixamento ou mudança em quem participa da simulação.

**Diagnóstico de desvio (US2)**

- **FR-005**: O sistema MUST classificar cada grupo da prévia presencial em: dentro do ideal (4-5 candidatos com 2 avaliadores), aceitável (3 candidatos com 1 avaliador), ou fora do recomendado (qualquer outra combinação).
- **FR-006**: O sistema MUST indicar, por sala usada na prévia, se a quantidade de host está de acordo com a recomendação para o tamanho daquela sala.
- **FR-007**: O sistema MUST apresentar um resumo, no topo da prévia, indicando se a organização segue o ideal ou listando os pontos fora da recomendação.
- **FR-008**: Este diagnóstico é somente leitura sobre a prévia já calculada — MUST NOT alterar a forma como o algoritmo real distribui candidatos, avaliadores ou hosts.

**Painel de recomendação com cenários (US3)**

- **FR-009**: O sistema MUST apresentar, dentro da simulação presencial, referências de configuração ideal para mais de uma faixa de cenário (poucos candidatos, quantidade média, muitos candidatos; poucas salas; muitas salas; falta ou sobra de avaliador/host) — não só o cálculo referente à situação presente no momento.
- **FR-010**: Quando os recursos presentes (avaliadores, hosts, salas) não permitirem alcançar a configuração ideal, o sistema MUST explicar o motivo e apresentar a distribuição mais próxima possível como alternativa.

**Simulação online (US4)**

- **FR-011**: O sistema MUST permitir calcular uma prévia da organização de grupos online (divisão de candidatos) sem persistir nenhuma alteração na organização real.
- **FR-012**: A gestão MUST poder revisar a prévia online (candidatos por grupo, quantidade por grupo) antes de decidir aplicá-la.
- **FR-013**: A organização real online só MUST ser criada/substituída no momento em que a gestão aprova explicitamente a simulação — abrir ou recalcular a simulação MUST NOT alterar a organização real.
- **FR-014**: A divisão automática de candidatos online MUST priorizar grupos de 4-5 candidatos como ideal, aceitar 3 como mínimo quando necessário, evitar grupos de 1-2, e evitar grupos de 6 ou mais quando for possível redistribuir — minimizando a quantidade de grupos fora dessa faixa quando uma divisão perfeita não for possível.
- **FR-015**: A simulação online MUST NOT atribuir avaliadores automaticamente a nenhum grupo — a atribuição continua exclusivamente manual (entrada própria do avaliador ou atribuição pela gestão), exatamente como funciona hoje.
- **FR-016**: Quando aprovar uma simulação online for substituir grupos que já têm avaliadores atribuídos, o sistema MUST avisar claramente, antes da aprovação, que essas atribuições serão perdidas.

### Key Entities *(include if feature involves data)*

- **Diagnóstico de organização (presencial)**: resultado derivado da prévia já calculada — não é armazenado; existe só na resposta da simulação, contendo o déficit de host (quantidade e sugestões de quem promover) e a classificação de cada grupo/sala frente ao ideal.
- **Prévia de organização online**: mesmo conceito já existente para o presencial (FEAT-0021), aplicado ao online — uma divisão de candidatos em grupos calculada sob demanda, nunca persistida até a aprovação explícita.
- **Configuração ideal de referência**: os parâmetros de tamanho de grupo, quantidade de avaliador e quantidade de host por porte de sala (já existentes desde a FEAT-0020 para o presencial) mais a nova faixa de tamanho ideal de grupo específica do online (4-5 ideal, 3 mínimo aceitável, evitar 1-2 e 6+).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao abrir a simulação presencial numa edição com déficit de host, a gestão identifica quantos hosts faltam e quem promover sem precisar contar manualmente ou testar por tentativa e erro.
- **SC-002**: Ao revisar a prévia presencial, a gestão consegue apontar, em menos de 30 segundos, se algum grupo ou sala está fora do recomendado, sem abrir cada cartão individualmente.
- **SC-003**: A gestão consegue explicar, usando só a tela de simulação, por que a organização atual não segue 100% o cenário ideal, quando for o caso.
- **SC-004**: A gestão consegue simular, revisar e só então aplicar a organização online, com a mesma confiança de "nada muda até eu aprovar" que já existe hoje no presencial.
- **SC-005**: Nenhuma simulação (presencial ou online) altera a organização real enquanto não for explicitamente aprovada.

## Assumptions

- O algoritmo real de organização presencial (quem vai em qual grupo, quantos avaliadores/hosts por grupo/sala) não muda nesta feature — só a camada de recomendação e diagnóstico sobre o que já é calculado.
- A promoção de avaliador a host continua manual e individual; esta feature só melhora a indicação de quem promover, sem promover automaticamente nem em lote.
- A nova simulação online convive com o self-service já existente (avaliador entrando/saindo de grupo online sozinho) e com a atribuição manual do admin — nenhum dos dois é substituído por esta feature.
- Ao aprovar uma simulação online que substitui uma organização com avaliadores já atribuídos, é aceitável que essas atribuições se percam (com aviso explícito antes de confirmar) — refazer a atribuição depois é responsabilidade manual da gestão/avaliadores, como já é hoje.
- O diagnóstico de déficit de host e de desvio do ideal são informativos — não bloqueiam a aprovação da simulação presencial mesmo quando apontam problemas; a gestão decide se aprova mesmo assim.
