# Feature Specification: Organização automática de grupos

**Feature Branch**: `claude/feat-0012-organizacao-grupos`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Organização automática de grupos — distribuir candidatos presentes em grupos, alocados em salas e avaliadores, respeitando D1 (nunca 1 mulher isolada) e D5 (hosts/grupos por capacidade de sala). Depende da FEAT-0009 (host por edição), FEAT-0010 (check-in de membros + sinalização online/presencial) e FEAT-0011 (cadastro de salas), todas já implementadas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin organiza os grupos presenciais do dia (Priority: P1)

No dia do processo seletivo, depois que candidatos e avaliadores/hosts já fizeram check-in, o admin aciona "organizar grupos" para a edição corrente. O sistema distribui automaticamente os candidatos presentes **presenciais** entre as salas cadastradas, formando um grupo por sala/subdivisão de sala conforme a capacidade (D5), sem nunca deixar uma mulher sozinha num grupo (D1), e aloca a cada grupo os avaliadores/hosts presentes disponíveis.

**Why this priority**: é a razão de existir da feature — sem isso, a formação de grupos continua manual e sujeita a erro (esquecer a regra de gênero, exceder a capacidade da sala). É o que a FEAT-0013 (avaliação) vai consumir depois.

**Independent Test**: com um conjunto de candidatos presenciais presentes (mistura de gêneros) e ao menos uma sala cadastrada com avaliadores/hosts presentes, acionar "organizar grupos" e conferir que todo candidato presencial presente foi alocado a exatamente um grupo, nenhum grupo tem exatamente uma mulher, e nenhum grupo excede a capacidade prevista pela sala/D5.

**Acceptance Scenarios**:

1. **Given** candidatos presenciais presentes e salas cadastradas com avaliadores/hosts presentes, **When** o admin aciona "organizar grupos", **Then** o sistema cria grupos vinculados a salas, com candidatos e avaliadores/hosts alocados, e nenhum candidato presencial presente fica de fora.
2. **Given** uma sobra ímpar de mulheres que resultaria em uma mulher sozinha num grupo, **When** os grupos são formados, **Then** essa sobra é agrupada com outro grupo (formando um trio) em vez de ficar isolada (D1).
3. **Given** uma sala de até 50 pessoas, **When** os grupos dessa sala são formados, **Then** o sistema forma 1 host e 2 grupos para ela (3 grupos se não houver sala suficiente para o total de presentes) — mesma lógica escalando para 51–80 (2 hosts/3 grupos) e acima de 80 (2 hosts/4 grupos), conforme D5.
4. **Given** grupos já organizados para a edição corrente, **When** o admin aciona "organizar grupos" novamente antes de qualquer avaliação começar, **Then** a organização anterior é descartada e uma nova é criada do zero, refletindo o check-in mais atual de candidatos e membros.

---

### User Story 2 - Admin ajusta manualmente um grupo antes de confirmar (Priority: P2)

Depois que o sistema organiza os grupos automaticamente, o admin revisa a distribuição e pode mover um candidato ou um avaliador de um grupo para outro, para corrigir uma exceção que o algoritmo não previu (ex.: dupla de amigos que não pode ficar junta, avaliador com histórico com um candidato específico).

**Why this priority**: a organização automática (US1) já entrega valor sozinha; o ajuste manual é um refinamento sobre ela, necessário para casos reais que fogem das regras D1/D5, mas não bloqueia o uso básico da feature.

**Independent Test**: com grupos já organizados pela US1, mover um candidato do grupo A para o grupo B e confirmar que o grupo A perde essa pessoa e o grupo B ganha, sem afetar os demais grupos.

**Acceptance Scenarios**:

1. **Given** grupos presenciais já organizados, **When** o admin move um candidato de um grupo para outro, **Then** a alocação é atualizada imediatamente e refletida na visualização dos dois grupos afetados.
2. **Given** um ajuste manual que resultaria em um grupo com exatamente uma mulher, **When** o admin tenta confirmar o movimento, **Then** o sistema avisa que a regra D1 seria violada, mas permite ao admin prosseguir mesmo assim (o ajuste manual é uma decisão humana deliberada, não outra rodada do algoritmo).
3. **Given** grupos já organizados, **When** o admin move um avaliador/host de um grupo para outro, **Then** a alocação de avaliadores é atualizada da mesma forma.

---

### User Story 3 - Candidatos online formam seus próprios grupos, separados dos presenciais (Priority: P2)

Candidatos presentes que participam remotamente (sinalização "online" da FEAT-0010, D7) não podem ser agrupados fisicamente com quem está na sala — por isso formam grupos próprios, separados dos presenciais, aplicando a mesma regra de gênero (D1: nunca uma mulher sozinha). Esses grupos não são vinculados a nenhuma sala nem recebem avaliador/host alocado automaticamente nesta versão — a alocação de quem avalia os grupos online fica fora de escopo aqui.

**Why this priority**: consome diretamente a sinalização online/presencial que a FEAT-0010 introduziu sem uso — sem esta história, o dado "online" continua sendo só exibido, nunca usado. Prioridade P2 porque a formação de grupos presenciais (US1) é o caso mais comum e mais urgente; a separação de online é um requisito real do backlog, mas menor em volume.

**Independent Test**: com uma mistura de candidatos presentes online e presenciais, acionar "organizar grupos" e confirmar que nenhum grupo mistura os dois modos, que os grupos online seguem a regra D1, e que grupos online não referenciam nenhuma sala.

**Acceptance Scenarios**:

1. **Given** candidatos presentes online e presenciais misturados, **When** o admin organiza os grupos, **Then** os grupos formados nunca misturam os dois modos — um grupo é inteiramente online ou inteiramente presencial.
2. **Given** uma sobra ímpar de mulheres entre os candidatos online, **When** os grupos online são formados, **Then** a mesma regra D1 se aplica (nunca uma mulher isolada; sobra vira trio).
3. **Given** grupos online formados, **When** o admin visualiza a organização, **Then** esses grupos aparecem claramente identificados como online, sem sala nem avaliador/host associado.

---

### Edge Cases

- **Sem processo seletivo corrente**: mesma resposta já padronizada nas demais telas do painel (aviso claro, não lista vazia sem explicação).
- **Nenhum candidato presente (sem check-in)**: "organizar grupos" não tem o que distribuir — o sistema informa isso e não cria nenhum grupo.
- **Nenhuma sala cadastrada, mas há candidatos presenciais presentes**: o sistema não consegue formar grupos presenciais e informa isso claramente ao admin, sem tentar adivinhar uma sala.
- **Nenhum avaliador/host com check-in feito**: grupos presenciais ainda são formados (candidatos alocados a salas), mas ficam sem avaliador/host atribuído — o admin é avisado de que precisa completar essa alocação manualmente (US2) antes da avaliação.
- **Menos candidatos presenciais presentes do que salas cadastradas comportam**: o sistema usa apenas as salas necessárias, sem criar grupos vazios.
- **Mais candidatos presenciais presentes do que a capacidade total das salas cadastradas comporta**: o sistema aloca o que couber e informa claramente ao admin quantos candidatos ficaram sem grupo, em vez de estourar a capacidade de uma sala ou falhar silenciosamente.
- **"Organizar grupos" acionado de novo depois de ajustes manuais (US2) já terem sido feitos**: os ajustes manuais são descartados junto com a organização anterior — mesmo comportamento do Acceptance Scenario 4 da US1.
- **Um único candidato online presente, mulher**: como não há como formar um grupo de 2+ sem violar D1 nem deixá-la sozinha, ela fica em um grupo de 1 mesmo assim — regra D1 é sobre evitar isolar quando há como formar par/trio; com um único presente, não há alternativa. Mesma lógica vale para presenciais.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um admin acione a organização automática de grupos para a edição corrente do processo seletivo.
- **FR-002**: A organização MUST considerar apenas candidatos com check-in feito (presentes, FEAT-0005) — quem não fez check-in não é alocado a nenhum grupo.
- **FR-003**: A organização MUST separar candidatos presentes em dois conjuntos independentes antes de formar grupos — **presenciais** e **online** (sinalização da FEAT-0010/D7) — e nunca misturar os dois modos dentro de um mesmo grupo.
- **FR-004**: Para candidatos presenciais, o sistema MUST distribuí-los entre as salas cadastradas (FEAT-0011), respeitando o número de grupos por sala derivado da capacidade (D5: ≤50 → 1 host/2 grupos, 3 se faltar sala; 51–80 → 2 hosts/3 grupos; >80 → 2 hosts/4 grupos).
- **FR-005**: Todo grupo (presencial ou online) MUST ter 0 ou 2 ou mais mulheres — nunca exatamente 1 (D1). Quando a distribuição base resultaria numa mulher isolada, o sistema MUST juntar essa sobra a outro grupo, formando um trio, em vez de deixá-la sozinha.
- **FR-006**: Para candidatos presenciais, o sistema MUST alocar a cada grupo formado os avaliadores/hosts (FEAT-0009) que fizeram check-in de membro (FEAT-0010) e estejam disponíveis na edição corrente.
- **FR-007**: Grupos online MUST NOT ser vinculados a nenhuma sala e MUST NOT receber alocação automática de avaliador/host nesta versão.
- **FR-008**: O sistema MUST permitir que um admin visualize a organização de grupos formada — quais candidatos e avaliadores/hosts estão em cada grupo, e a qual sala (quando presencial) o grupo está vinculado.
- **FR-009**: O sistema MUST permitir que um admin mova manualmente um candidato ou um avaliador/host de um grupo para outro depois da organização automática, antes de qualquer avaliação começar.
- **FR-010**: Um ajuste manual (FR-009) que resultaria em violação da regra D1 MUST gerar um aviso ao admin, mas MUST permitir que ele prossiga mesmo assim — a validação automática (FR-005) só se aplica à organização automática, não ao ajuste manual.
- **FR-011**: Quando o admin aciona a organização automática novamente para a mesma edição, o sistema MUST descartar a organização anterior (incluindo ajustes manuais feitos sobre ela) e formar os grupos do zero a partir do estado atual de check-ins.
- **FR-012**: Quando não houver nenhuma sala cadastrada e existirem candidatos presenciais presentes para alocar, o sistema MUST informar isso claramente ao admin, sem formar grupos presenciais parciais ou incorretos.
- **FR-013**: Quando a capacidade total das salas cadastradas for menor que o total de candidatos presenciais presentes, o sistema MUST alocar o que couber respeitando D5/D1 e informar ao admin quantos candidatos ficaram sem grupo.
- **FR-014**: O sistema MUST restringir a organização automática e o ajuste manual de grupos a usuários admin.
- **FR-015**: Quando não houver processo seletivo corrente, o sistema MUST informar isso claramente ao admin, em vez de mostrar uma tela vazia sem explicação.

### Key Entities

- **Grupo**: conjunto de candidatos presentes reunidos para uma etapa de avaliação, escopado à edição corrente do processo seletivo. É presencial (vinculado a uma sala, com avaliadores/hosts alocados) ou online (sem sala, sem alocação automática de avaliador/host) — nunca as duas coisas. Existe apenas depois que o admin aciona a organização automática, e é substituído integralmente a cada nova organização.
- **Alocação de candidato**: liga um candidato presente a um grupo. Um candidato está em no máximo um grupo por vez.
- **Alocação de avaliador/host**: liga um avaliador/host presente (com check-in de membro feito) a um grupo presencial. Não existe para grupos online nesta versão.
- **Sala**: entidade já existente (FEAT-0011) que define a capacidade usada para calcular quantos grupos presenciais cabem nela (D5).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue organizar os grupos da edição corrente com uma única ação, sem precisar calcular manualmente distribuição por sala ou regra de gênero.
- **SC-002**: Depois de qualquer organização automática, nenhum grupo (presencial ou online) tem exatamente uma mulher — verificável conferindo a composição de todos os grupos formados.
- **SC-003**: Depois de qualquer organização automática, todo candidato presente (check-in feito) está em exatamente um grupo, e nenhum candidato ausente está em algum grupo.
- **SC-004**: Grupos presenciais nunca excedem a capacidade de grupos prevista pela sala (D5) — verificável comparando o número de grupos por sala com a tabela de capacidade.
- **SC-005**: Um admin consegue mover manualmente um candidato ou avaliador/host entre grupos e ver o resultado refletido imediatamente nos dois grupos afetados.
- **SC-006**: Reorganizar os grupos de uma edição sempre produz um resultado consistente com o check-in mais recente — nenhum candidato ausente permanece alocado depois de uma nova organização.

## Assumptions

- A organização automática de grupos é uma ação explícita do admin (não roda sozinha em background nem por gatilho de check-in) — o admin decide o momento, tipicamente quando o check-in do dia já está avançado o suficiente.
- "Grupo" nesta feature é sempre recriado do zero a cada acionamento (FR-011): não existe um modo incremental que só adiciona quem chegou depois. Isso é aceitável porque, na prática, a organização acontece uma vez por edição, próximo do início da avaliação.
- A alocação de avaliadores/hosts aos grupos presenciais (FR-006) não tenta balancear carga entre avaliadores nem considerar histórico/afinidade — é distribuição simples entre os grupos formados na mesma sala. Refinamentos desse tipo ficam fora de escopo.
- Grupos online (US3) não recebem avaliador/host alocado nesta versão porque o modelo de avaliação remota (quem avalia, por qual canal) ainda não foi decidido — fica para uma iteração futura, fora desta spec.
- O ajuste manual (US2/FR-009/FR-010) não tem limite de quantas vezes pode ser feito antes da avaliação começar, nem um estado de "confirmado" separado — a organização vale como está no momento em que a FEAT-0013 (avaliação) começar a consumi-la.
- Fora de escopo: a avaliação em si dos candidatos dentro do grupo (FEAT-0013, spec seguinte) e qualquer notificação automática a avaliadores/hosts sobre a qual grupo foram alocados.
