# Feature Specification: Avaliação dos candidatos

**Feature Branch**: `claude/feat-0013-avaliacao-candidatos`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Avaliação dos candidatos — avaliador/host preenche 5 critérios ponderados (0-5) + uma cor geral (D2: qualquer vermelho reprova) + comentário opcional, para candidatos do próprio grupo (FEAT-0012). D6: mínimo 2 avaliações para sair de pendente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Avaliador/host avalia um candidato do seu grupo (Priority: P1)

Durante o processo seletivo, um avaliador ou host abre a lista de candidatos do grupo presencial ao qual foi alocado (FEAT-0012) e avalia um deles: dá uma nota de 0 a 5 em cada um dos 5 critérios (raciocínio lógico, trabalho em equipe, liderança, proatividade, comunicação), escolhe uma cor geral para a avaliação (vermelho, amarelo ou verde) e, opcionalmente, escreve um comentário.

**Why this priority**: é a ação que gera todo o resto — sem avaliação registrada não existe veredito nem nada para o admin consultar.

**Independent Test**: com um avaliador alocado a um grupo com candidatos, abrir a lista desse grupo, preencher as 5 notas e a cor de um candidato, salvar, e confirmar que a avaliação aparece registrada para aquele avaliador e aquele candidato.

**Acceptance Scenarios**:

1. **Given** um avaliador alocado a um grupo presencial com candidatos, **When** ele abre a tela de avaliação, **Then** vê a lista dos candidatos do próprio grupo, cada um indicando se ele já os avaliou ou não.
2. **Given** um candidato do grupo ainda não avaliado por ele, **When** o avaliador preenche as 5 notas (0 a 5) e escolhe uma cor geral, **Then** a avaliação é salva e o candidato passa a aparecer como avaliado por ele.
3. **Given** um candidato que o avaliador já avaliou antes, **When** ele abre a avaliação de novo e muda uma nota ou a cor, **Then** a avaliação existente é atualizada — não é criada uma segunda avaliação dele para o mesmo candidato.
4. **Given** um candidato que não está no grupo do avaliador, **When** ele tenta avaliar esse candidato (ex.: manipulando a URL), **Then** o sistema recusa — só quem está no mesmo grupo do candidato pode avaliá-lo.
5. **Given** uma avaliação já salva por um avaliador, **When** outro avaliador do mesmo grupo abre a tela de avaliação, **Then** ele não vê as notas/cor/comentário que o primeiro avaliador deu — só o fato de que aquele candidato já tem X avaliações, sem detalhe de quem disse o quê.

---

### User Story 2 - Admin acompanha o veredito de cada candidato (Priority: P1)

O admin abre uma tela com todos os candidatos presentes e, para cada um, vê quantas avaliações já recebeu e o veredito atual: pendente (menos de 2 avaliações e nenhuma vermelha), aprovado (2 ou mais avaliações, nenhuma vermelha) ou reprovado (qualquer avaliação vermelha, não importa quantas no total). Pode abrir o detalhe de um candidato e ver cada avaliação individual (notas por critério, cor, comentário, quem avaliou).

**Why this priority**: é o motivo de existir a coleta de avaliações — sem essa visão, ter as notas no banco não ajuda ninguém a decidir nada. Mesma prioridade da US1 porque as duas juntas são o mínimo que faz a feature valer a pena.

**Independent Test**: com candidatos em diferentes situações (nenhuma avaliação, 1 avaliação verde, 2 avaliações verdes, 1 avaliação vermelha entre outras verdes), abrir a tela do admin e conferir que cada um mostra o veredito correto.

**Acceptance Scenarios**:

1. **Given** um candidato sem nenhuma avaliação, **When** o admin vê a lista, **Then** o veredito aparece como pendente, com contagem 0.
2. **Given** um candidato com 1 avaliação verde, **When** o admin vê a lista, **Then** o veredito ainda é pendente (D6: mínimo 2).
3. **Given** um candidato com 2 avaliações, nenhuma vermelha, **When** o admin vê a lista, **Then** o veredito é aprovado.
4. **Given** um candidato com 1 avaliação vermelha entre 3 recebidas, **When** o admin vê a lista, **Then** o veredito é reprovado — mesmo tendo atingido o mínimo de avaliações, e mesmo que as outras sejam verdes (D2, veto direto).
5. **Given** um candidato com só 1 avaliação e ela é vermelha, **When** o admin vê a lista, **Then** o veredito já é reprovado — D2 (veto) não espera D6 (mínimo de 2) ser atingido.
6. **Given** o admin abre o detalhe de um candidato, **When** a tela carrega, **Then** vê cada avaliação separadamente: as 5 notas, a cor escolhida, o comentário (se houver) e quem avaliou.

---

### Edge Cases

- **Candidato presente num grupo ONLINE**: fora de escopo desta versão — a FEAT-0012 não aloca avaliador a grupos online, então não há quem avalie. O candidato permanece sem avaliação possível até uma iteração futura decidir o modelo de avaliação remota.
- **Grupo presencial sem nenhum avaliador/host alocado**: os candidatos desse grupo não têm quem os avalie; ficam pendentes indefinidamente. Não é um erro do sistema, é reflexo de uma organização de grupos incompleta (FEAT-0012, edge case já coberto lá).
- **Grupo presencial com só 1 avaliador/host alocado**: os candidatos desse grupo nunca saem de pendente (não há como atingir o mínimo de 2, D6), a menos que a avaliação única já seja vermelha (D2 reprova de qualquer forma).
- **Avaliador removido do grupo depois de já ter avaliado** (movido para outro grupo, US2 da FEAT-0012): a avaliação já registrada continua contando para o veredito do candidato — mover alguém de grupo não apaga avaliação já feita.
- **Candidato movido para outro grupo depois de já ter sido avaliado**: mesma lógica — avaliações já feitas continuam valendo, independente de o candidato estar hoje em outro grupo.
- **Sem processo seletivo corrente**: mesma resposta padronizada das demais telas do painel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um avaliador/host veja a lista de candidatos do grupo presencial ao qual está alocado na edição corrente (FEAT-0012), indicando quais ele já avaliou.
- **FR-002**: O sistema MUST permitir que um avaliador/host registre uma avaliação de um candidato do seu próprio grupo, composta por: uma nota de 0 a 5 em cada um dos 5 critérios (raciocínio lógico e resolução de problemas, trabalho em equipe, liderança, proatividade, comunicação e argumentação), uma cor geral (vermelho, amarelo ou verde) e um comentário opcional.
- **FR-003**: O sistema MUST impedir que um avaliador/host avalie um candidato que não esteja no mesmo grupo presencial que ele.
- **FR-004**: O sistema MUST permitir no máximo uma avaliação por par avaliador/candidato — reenviar atualiza a avaliação existente, nunca cria uma segunda.
- **FR-005**: O sistema MUST impedir que um avaliador/host veja o conteúdo (notas, cor, comentário) da avaliação de outra pessoa sobre o mesmo candidato — só o admin vê o detalhe de todas.
- **FR-006**: O sistema MUST calcular o veredito de um candidato como: **reprovado** se ao menos uma avaliação recebida tiver cor vermelha (D2, veto — vale a qualquer momento, mesmo com só 1 avaliação recebida); senão **pendente** se tiver menos de 2 avaliações recebidas (D6); senão **aprovado**.
- **FR-007**: O sistema MUST permitir que um admin veja, para cada candidato presente, quantas avaliações já recebeu e o veredito atual.
- **FR-008**: O sistema MUST permitir que um admin veja o detalhe de cada avaliação individual de um candidato: as 5 notas por critério, a cor geral, o comentário (quando houver) e quem avaliou.
- **FR-012**: O sistema MUST calcular, para cada avaliação, uma pontuação ponderada (0 a 5) a partir das 5 notas e dos pesos fixos dos critérios, e exibi-la ao admin junto do detalhe da avaliação e da lista de candidatos — como referência de comparação entre candidatos, nunca como o que decide o veredito (que segue exclusivamente D2/D6, FR-006).
- **FR-009**: O sistema MUST restringir o registro de avaliação a avaliadores/hosts autenticados, sobre candidatos do próprio grupo; e a visão agregada/detalhada de veredito a usuários admin.
- **FR-010**: Quando não houver processo seletivo corrente, o sistema MUST informar isso claramente, em vez de mostrar uma tela vazia sem explicação.
- **FR-011**: Uma avaliação já registrada MUST continuar valendo para o veredito do candidato mesmo que o avaliador ou o candidato sejam movidos para outro grupo depois (FEAT-0012, US2).

### Key Entities

- **Avaliação**: liga um avaliador/host a um candidato do mesmo grupo, com 5 notas (0-5), uma cor geral e um comentário opcional. No máximo uma por par avaliador/candidato — reenviar substitui a existente, não duplica.
- **Critério de avaliação**: um dos 5 eixos fixos e ponderados (raciocínio lógico 25%, trabalho em equipe 25%, liderança 20%, proatividade 15%, comunicação 15%) usados em toda avaliação. Peso e lista são fixos nesta versão, não configuráveis por edição.
- **Veredito do candidato**: pendente, aprovado ou reprovado — não é uma escolha de ninguém, é calculado a partir das avaliações recebidas (D2 + D6).
- **Pontuação ponderada**: número de 0 a 5 calculado a partir das 5 notas de uma avaliação e do peso de cada critério. Existe por avaliação (e, agregada, por candidato — média das avaliações que recebeu) só como referência de comparação para o admin; nunca influencia o veredito.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um avaliador consegue avaliar um candidato do seu grupo (5 notas + cor) numa única ação, sem precisar navegar para fora da lista do próprio grupo.
- **SC-002**: O veredito de um candidato está sempre consistente com D2 e D6 — verificável comparando o veredito exibido com as avaliações realmente registradas para ele, em qualquer combinação de cor e contagem.
- **SC-003**: Um avaliador nunca consegue ver o conteúdo da avaliação de outra pessoa sobre o mesmo candidato, nem avaliar um candidato fora do seu grupo.
- **SC-004**: Um admin consegue, a partir de uma única tela, identificar todos os candidatos ainda pendentes de veredito e por quê (poucas avaliações vs. nenhuma ainda).
- **SC-005**: Reenviar uma avaliação já feita nunca duplica o registro — o total de avaliações de um candidato reflete o número de pessoas distintas que o avaliaram, não o número de envios.

## Assumptions

- A composição operacional planejada de avaliadores por grupo (1 host + 1-2 avaliadores, D6 mínimo 2 / máximo 3) é responsabilidade da organização de grupos (FEAT-0012), não desta feature — a FEAT-0012 não garante essa composição exata ao formar grupos. Esta feature não bloqueia nem corrige isso: avalia quem estiver de fato alocado ao grupo, sejam quantos forem.
- Avaliação de candidatos em grupos online está fora de escopo desta versão (a FEAT-0012 não aloca avaliador a esses grupos ainda).
- Os 5 critérios e seus pesos são fixos no código desta versão, não editáveis por um admin — mudar critérios/pesos é uma decisão de produto que, se vier, é uma spec própria.
- O comentário por avaliação é sempre opcional; não há um mínimo de caracteres nem obrigatoriedade condicionada à cor escolhida.
- "Grupo presencial" aqui é sempre o mais recente formado pela organização de grupos corrente (FEAT-0012) — não existe histórico de "qual grupo o candidato estava quando foi avaliado" além do que já está implícito no momento em que a avaliação foi salva.
- A pontuação ponderada (FR-012) é exibida como referência para o admin comparar candidatos, mas fora de escopo desta versão: um ranking ordenado/exportável a partir dela, ou qualquer regra que a use para desempatar/decidir veredito — o veredito continua sendo exclusivamente D2 (veto vermelho) + D6 (mínimo de 2).
