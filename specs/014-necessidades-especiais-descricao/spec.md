# Feature Specification: Descrição de necessidades especiais

**Feature Branch**: `feat/necessidades-especiais-descricao`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Descrição textual condicional às necessidades especiais no cadastro de candidatos. Candidatos.special_needs já existe como boolean. Adicionar um texto descritivo, condicional ao boolean: quando special_needs = true, o candidato pode (ou deve) descrever a necessidade. Toca o formulário de inscrição, o contrato de POST /candidate, e a exibição nas telas de check-in/dashboard que já mostram special_needs. Tratar como dado de saúde sensível."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Candidato descreve sua necessidade especial na inscrição (Priority: P1)

Ao preencher o formulário de inscrição, o candidato indica que possui uma necessidade especial (campo já existente, "Sim"/"Não"). Ao marcar "Sim", um campo de texto livre aparece para que ele descreva a necessidade, permitindo à organização do processo seletivo se preparar (acessibilidade física, tempo adicional, intérprete de libras, etc.).

**Why this priority**: É o ponto de entrada do dado — sem isso, não existe informação nova a proteger ou exibir. Sem esta etapa, a comissão continua sem saber que tipo de acomodação preparar, mesmo sabendo que o candidato marcou "Sim".

**Independent Test**: Pode ser testado isoladamente preenchendo o formulário de inscrição até a etapa de disponibilidade, marcando "Sim" para necessidade especial, preenchendo a descrição e confirmando que o envio é aceito e persistido.

**Acceptance Scenarios**:

1. **Given** o candidato está na etapa do formulário que pergunta sobre necessidade especial, **When** ele seleciona "Não", **Then** nenhum campo de descrição é exibido e ele pode prosseguir normalmente.
2. **Given** o candidato seleciona "Sim" para necessidade especial, **When** o campo de descrição aparece, **Then** ele consegue digitar um texto livre (até 500 caracteres) descrevendo a necessidade.
3. **Given** o candidato selecionou "Sim" e não preencheu a descrição, **When** ele tenta avançar/enviar a inscrição, **Then** o sistema exibe um erro pedindo que a descrição seja preenchida antes de prosseguir.
4. **Given** o candidato muda a resposta de "Sim" para "Não" depois de ter escrito uma descrição, **When** ele confirma a mudança, **Then** o campo de descrição é ocultado e seu conteúdo não é enviado como parte da inscrição.

---

### User Story 2 - Comissão vê a descrição ao consultar o detalhe de um candidato (Priority: P2)

Um membro autorizado da comissão (avaliador/host/admin) abre o painel de detalhe de um candidato específico e, se esse candidato indicou ter necessidade especial, vê também o texto descritivo que ele escreveu — permitindo à comissão se preparar para o dia do evento (ex.: reservar sala acessível, avisar um host específico).

**Why this priority**: Sem exibição, o dado coletado na P1 fica inerte — a comissão continua sem conseguir agir sobre a necessidade relatada. É a segunda peça mínima para a feature ter valor de ponta a ponta, mas depende da P1 existir primeiro.

**Independent Test**: Pode ser testado abrindo o detalhe de um candidato de teste que tenha `specialNeeds = true` e uma descrição já cadastrada (via seed/fixture) e confirmando que o texto aparece na tela de detalhe.

**Acceptance Scenarios**:

1. **Given** um candidato tem necessidade especial marcada como "Sim" e uma descrição cadastrada, **When** um membro da comissão abre o detalhe desse candidato, **Then** a descrição é exibida junto à indicação "Sim" já existente.
2. **Given** um candidato tem necessidade especial marcada como "Não", **When** um membro da comissão abre o detalhe desse candidato, **Then** nenhum campo de descrição é exibido (nem vazio, nem com placeholder).
3. **Given** um candidato tem necessidade especial "Sim" mas foi cadastrado antes desta feature existir (sem descrição), **When** um membro da comissão abre o detalhe, **Then** o sistema indica que a descrição não foi informada, sem quebrar a tela.

---

### User Story 3 - A descrição não vaza para telas que não deveriam exibi-la (Priority: P3)

A descrição de necessidade especial, por ser dado de saúde, não deve aparecer em superfícies que hoje já evitam expor dados sensíveis por design (a lista/tabela paginada de candidatos e a tela de check-in usada em celular na porta do evento) nem no contador agregado do dashboard (que soma quantos candidatos marcaram "Sim", sem carregar texto de ninguém).

**Why this priority**: É uma garantia de proteção de dado sensível, não uma funcionalidade nova percebida pelo usuário final — importante, mas só faz sentido validar depois que a descrição existe (P1) e é exibida em algum lugar (P2), para confirmar que ela aparece SÓ onde deveria.

**Independent Test**: Pode ser testado inspecionando as respostas de listagem de candidatos, do card agregado do dashboard e da tela de check-in para um candidato com descrição cadastrada, e confirmando que o texto não está presente em nenhuma delas.

**Acceptance Scenarios**:

1. **Given** um candidato tem uma descrição de necessidade especial cadastrada, **When** a comissão consulta a listagem paginada de candidatos, **Then** a descrição não aparece em nenhuma coluna ou tooltip dessa listagem.
2. **Given** um candidato tem uma descrição cadastrada, **When** a comissão consulta o contador agregado do dashboard (quantos candidatos marcaram necessidade especial), **Then** a resposta contém apenas o número, nunca o texto de nenhum candidato.
3. **Given** um candidato tem uma descrição cadastrada, **When** um host faz o check-in desse candidato no dia do evento, **Then** a tela de check-in não exibe a descrição (mantém o comportamento atual de não expor dado sensível nessa superfície).

### Edge Cases

- O que acontece se o candidato marcar "Sim" e escrever uma descrição muito longa (acima de 500 caracteres)? O sistema rejeita o envio e pede para resumir o texto.
- O que acontece se o candidato marcar "Sim", escrever a descrição, depois voltar e marcar "Não"? A descrição deixa de ser exigida e não é enviada (ver Acceptance Scenario 4 da User Story 1).
- Como o sistema trata candidatos já cadastrados antes desta feature (com `special_needs = true` e sem nenhuma descrição, pois o campo não existia)? Ver Acceptance Scenario 3 da User Story 2 — trata como "não informado", não como erro.
- O que acontece se a descrição vier preenchida mas o boolean for "Não" (payload inconsistente, ex. manipulação direta da requisição)? O sistema deve ignorar/rejeitar essa combinação — a descrição só é uma informação válida quando o boolean é "Sim".
- O que acontece se o texto vier só com espaços em branco? É tratado como não preenchido (mesma regra do Acceptance Scenario 3 da User Story 1: exige preenchimento real).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST exibir um campo de texto livre para descrever a necessidade especial sempre que o candidato indicar "Sim" na pergunta existente sobre necessidade especial, e MUST ocultar esse campo quando a resposta for "Não".
- **FR-002**: O sistema MUST exigir o preenchimento da descrição (texto não vazio, sem contar espaços em branco) antes de aceitar a inscrição quando o candidato indicar "Sim" para necessidade especial.
- **FR-003**: O sistema MUST limitar a descrição a 500 caracteres e informar o candidato claramente quando esse limite for excedido.
- **FR-004**: O sistema MUST rejeitar/ignorar a descrição de necessidade especial quando o boolean correspondente for "Não", garantindo que texto nunca fique associado a uma inscrição que declarou não ter necessidade especial.
- **FR-005**: O sistema MUST persistir a descrição junto ao restante da inscrição do candidato, de forma vinculada e recuperável junto com o boolean existente.
- **FR-006**: O sistema MUST exibir a descrição de necessidade especial na tela de detalhe de um candidato individual, para papéis já autorizados a ver o restante do questionário de inscrição desse candidato.
- **FR-007**: O sistema MUST indicar de forma clara, na tela de detalhe, quando um candidato tem necessidade especial marcada como "Sim" mas nenhuma descrição foi informada (candidatos anteriores à feature), sem tratar isso como erro.
- **FR-008**: O sistema MUST NOT incluir a descrição de necessidade especial na listagem paginada de candidatos.
- **FR-009**: O sistema MUST NOT incluir a descrição de necessidade especial na tela de check-in.
- **FR-010**: O sistema MUST NOT incluir a descrição de necessidade especial no contador agregado do dashboard (que soma quantos candidatos indicaram necessidade especial) — esse contador permanece apenas numérico.
- **FR-011**: O sistema MUST tratar a descrição de necessidade especial com o mesmo nível de controle de acesso hoje aplicado ao boolean `special_needs` no detalhe do candidato — isto é, qualquer papel autorizado a ver o questionário de inscrição de um candidato específico (avaliador, host, admin) também pode ver a descrição associada, sem uma camada adicional de restrição por papel (ver Assumption sobre nível de sensibilidade).

### Key Entities

- **Inscrição do candidato (Application)**: entidade existente que já registra se o candidato tem necessidade especial (boolean). Passa a registrar também a descrição textual dessa necessidade, presente apenas quando o boolean é verdadeiro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das inscrições que indicam ter necessidade especial e são enviadas com sucesso possuem uma descrição não vazia associada (nenhuma inscrição nova fica com "Sim" e descrição ausente).
- **SC-002**: A comissão consegue localizar a descrição de necessidade especial de qualquer candidato específico em até 2 cliques a partir da tela de detalhe já existente, sem precisar consultar outra fonte de dados.
- **SC-003**: Nenhuma superfície de listagem, check-in ou agregado (dashboard) expõe texto de descrição de necessidade especial em nenhum momento — verificável por inspeção das respostas dessas telas para candidatos de teste com descrição cadastrada.
- **SC-004**: Candidatos cadastrados antes da feature (com "Sim" e sem descrição) continuam aparecendo normalmente em todas as telas, sem erros ou quebras visuais.

## Assumptions

- **Obrigatoriedade da descrição**: quando o candidato marca "Sim" para necessidade especial, a descrição passa a ser **obrigatória** (não apenas opcional) para o envio da inscrição. Justificativa: um "Sim" sem descrição não dá à comissão nenhuma ação concreta a tomar; forçar a descrição maximiza a utilidade do dado coletado. Trade-off aceito: um pequeno atrito a mais no formulário para quem marca "Sim".
- **Nível de sensibilidade / controle de acesso**: a descrição segue o **mesmo** nível de visibilidade hoje aplicado ao boolean `special_needs` no detalhe de um candidato (visível a qualquer papel autenticado que já acessa aquele detalhe — avaliador, host, admin), e **não** o nível mais restrito usado para `gender`/`ethnicity` (que ficam ausentes do payload para papéis não-admin). Justificativa: a necessidade especial é operacional (acomodação logística do evento), relevante para host e avaliador tomarem decisões no dia, diferente de dado puramente demográfico usado para métricas. Ainda assim, a descrição continua tratada como dado sensível no sentido de nunca aparecer em listagens, check-in ou agregados (FR-008 a FR-010) — a restrição adotada é "nunca em superfícies amplas", não "só para admin". Esta é uma decisão registrada por não haver como confirmar com o responsável do produto em tempo real; pode ser revista.
- **Candidatos existentes**: candidatos já cadastrados antes desta feature, com `special_needs = true`, não terão descrição retroativamente — é aceitável e esperado que apareçam como "não informado" (FR-007), sem exigir migração de dados históricos.
- **Limite de tamanho**: 500 caracteres é suficiente para descrever a necessidade em texto livre sem virar um campo de redação longa; segue a ordem de grandeza de campos de texto livre já existentes no formulário (ex. campo de "outros" da fonte de indicação).
- **Fora de escopo**: um sistema genérico e configurável de "campos sensíveis" (aplicável a outros campos além deste) é tratado por outra iniciativa do backlog e não é antecipado aqui. Mudanças nos campos `gender`/`ethnicity` existentes (regras, exibição, obrigatoriedade) também estão fora de escopo desta feature.
