# Feature Specification: Exportação de candidatos em planilha (CSV)

**Feature Branch**: `feat/exportacao-csv`

**Created**: 2026-08-25

**Status**: Draft

**Input**: Backlog organizado em 2026-08-24 (features 008–016), item FEAT-0016: "Exportação de
candidatos em planilha (CSV — não XLSX, orçamento de CPU), admin-only, com campos sensíveis
marcados e log de quem exportou. Independente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin exporta os candidatos de uma edição (Priority: P1)

O admin precisa levar a lista de candidatos de uma edição do processo seletivo para fora do
sistema — para montar planilhas de logística, cruzar com outra ferramenta, ou arquivar um
registro do processo. Ele pede a exportação e recebe um arquivo CSV com os candidatos daquela
edição (ou de todas, se escolher), pronto para abrir em qualquer planilha.

**Why this priority**: é o caso de uso central da feature — sem ele, nada mais nesta spec tem
razão de existir. Funciona sozinho: um CSV com os dados não sensíveis já entrega valor
completo para a maioria dos usos (logística, contagem, contato).

**Independent Test**: como admin, pedir a exportação de uma edição com candidatos cadastrados
e confirmar que o arquivo baixado é um CSV válido, com uma linha por candidato daquela edição
e as colunas documentadas nesta spec.

**Acceptance Scenarios**:

1. **Given** uma edição com candidatos inscritos, **When** o admin exporta essa edição, **Then**
   recebe um CSV com uma linha por candidato, contendo nome, email, telefone, curso, semestre,
   edição, data de inscrição, origem de divulgação, restrição de sábado e indicador de
   necessidades especiais.
2. **Given** o admin quer todos os candidatos de todas as edições, **When** ele exporta sem
   restringir a edição, **Then** recebe um CSV com os candidatos de todas as edições, cada linha
   identificando a qual edição pertence.
3. **Given** uma edição sem nenhum candidato inscrito, **When** o admin a exporta, **Then**
   recebe um CSV válido contendo apenas o cabeçalho (nenhuma linha de dado).

---

### User Story 2 - Admin inclui campos sensíveis de forma explícita (Priority: P2)

Em vez de ficar restrito aos dados básicos, o admin às vezes precisa dos campos que hoje já
são tratados como sensíveis no resto do sistema — gênero e etnia — por exemplo, para uma
prestação de contas de diversidade a um patrocinador. Ele pede a exportação marcando
explicitamente que quer incluir esses campos, e eles aparecem em colunas adicionais no CSV.

**Why this priority**: é um refinamento do caso principal — a exportação básica (US1) já é
útil sem isso. A permissão elevada existe porque esses campos já são tratados como sensíveis
em todo o resto do sistema (FEAT-0007, seção 9): sem um pedido explícito, a exportação não
pode ser o ponto que contorna essa decisão de privacidade já em vigor.

**Why the field boundary is drawn here**: `gender`/`ethnicity` já são omitidos de toda
listagem no sistema hoje, para qualquer papel (`DashboardCandidateItemSchema`,
`CandidateCheckinItemSchema`) — é a única decisão de privacidade já em vigor a respeitar.
`phone` não tem essa restrição em nenhuma tela existente (aparece em check-in e no dashboard
para admin e avaliador), então não é tratado como sensível aqui — ver seção "Assumptions"
sobre o que fica de fora do "sensível" desta spec e por quê.

**Independent Test**: pedir a exportação de uma edição sem marcar a inclusão de campos
sensíveis e confirmar que o CSV não tem colunas de gênero/etnia; repetir marcando a inclusão e
confirmar que as colunas aparecem, com os valores corretos.

**Acceptance Scenarios**:

1. **Given** o admin exporta sem pedir campos sensíveis, **When** o CSV é gerado, **Then** ele
   não contém as colunas de gênero e etnia — nem vazias, nem com valor "N/A": as colunas
   simplesmente não existem no arquivo.
2. **Given** o admin exporta pedindo explicitamente os campos sensíveis, **When** o CSV é
   gerado, **Then** ele contém as colunas de gênero e etnia, com o valor real de cada
   candidato.

---

### User Story 3 - Toda exportação fica registrada (Priority: P1)

Cada vez que alguém exporta candidatos, o sistema registra quem pediu a exportação, quando,
qual o recorte (uma edição ou todas) e se campos sensíveis foram incluídos. Esse registro é
permanente e não pode ser apagado por quem exportou — é a trilha que existe precisamente para
o caso de um dado sensível ter saído do sistema sem que devesse.

**Why this priority**: mesma prioridade do caso principal, não um "extra": uma exportação sem
rastro de quem a fez é a lacuna de compliance que esta feature existe para fechar (ver Input
acima). Não é opcional nem configurável.

**Independent Test**: exportar duas vezes (uma sem, outra com campos sensíveis) e confirmar
que existem dois registros de auditoria, cada um com o autor, o horário, o recorte de edição e
se aquela exportação específica incluiu campos sensíveis.

**Acceptance Scenarios**:

1. **Given** um admin exporta candidatos, **When** a exportação termina com sucesso, **Then**
   um registro é criado com quem exportou, quando, o recorte usado e se incluiu campos
   sensíveis.
2. **Given** o registro de auditoria não pôde ser gravado por falha técnica, **When** isso
   acontece, **Then** a exportação inteira falha — o arquivo não é entregue sem o registro
   correspondente existir.
3. **Given** um registro de auditoria já existente, **When** qualquer usuário (inclusive quem
   exportou) tenta alterá-lo ou removê-lo, **Then** o sistema não oferece nenhuma operação para
   isso — a tabela é somente-inserção, sem rota de escrita além da própria exportação.

---

### Edge Cases

- **Edição informada não existe**: a exportação recusa com erro claro, sem gerar arquivo vazio
  silenciosamente.
- **Ninguém além de admin tenta exportar**: acesso negado, nenhum arquivo gerado, nenhum
  registro de auditoria criado (a tentativa nem chega a ser uma exportação).
- **Nome, motivo ou qualquer texto livre do candidato contém vírgula, aspas ou quebra de
  linha**: o CSV precisa continuar válido — o valor é escapado segundo a regra padrão de CSV
  (RFC 4180: aspas duplas ao redor do campo, aspas internas duplicadas), nunca corrompendo a
  coluna seguinte.
- **Exportação de um recorte muito grande** (todas as edições, todo o histórico): não há
  paginação no arquivo — é um único CSV com todas as linhas do recorte pedido (mesma
  suposição de escala de FEAT-0011: dezenas/centenas de candidatos por edição, não milhões).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um admin exporte os candidatos de uma edição
  específica, ou de todas as edições, em formato CSV.
- **FR-002**: O sistema MUST restringir a exportação a usuários admin — nenhum outro papel tem
  acesso a esta operação.
- **FR-003**: O CSV MUST conter, por padrão (sem pedido explícito de campos sensíveis): nome,
  email, telefone, curso, semestre, edição, data de inscrição, origem de divulgação (e o texto
  livre quando a origem for "outros"), restrição de sábado e indicador de necessidades
  especiais.
- **FR-004**: O sistema MUST tratar gênero e etnia como campos sensíveis: eles só aparecem no
  CSV quando o admin pede explicitamente a inclusão, nunca por padrão.
- **FR-005**: O sistema MUST permitir filtrar a exportação por nome (busca) e por intervalo de
  data de inscrição, com o mesmo comportamento de filtro já usado no dashboard (FEAT-0007).
- **FR-006**: O sistema MUST registrar, para cada exportação concluída, quem a executou, quando,
  o recorte de edição usado, se campos sensíveis foram incluídos e quantas linhas o arquivo
  continha.
- **FR-007**: O registro de auditoria MUST ser append-only — o sistema não MUST oferecer
  nenhuma rota para editar ou apagar um registro já criado.
- **FR-008**: O sistema MUST recusar a exportação (sem gerar arquivo nem registro de auditoria)
  quando a edição pedida não existe.
- **FR-009**: O sistema MUST falhar a exportação inteira se o registro de auditoria não puder
  ser gravado — nunca entregar o arquivo sem o registro correspondente.
- **FR-010**: Os valores do CSV MUST seguir o escapamento padrão (RFC 4180) para não corromper
  o arquivo quando um campo contiver vírgula, aspas ou quebra de linha.

### Key Entities

- **Exportação (evento de auditoria)**: um registro permanente de que uma exportação
  aconteceu. Tem quem exportou, quando, o recorte de edição (uma edição específica ou "todas"),
  se campos sensíveis foram incluídos, e quantos candidatos entraram no arquivo. Não guarda o
  arquivo em si — só o fato de que ele foi gerado, por quem e com que escopo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue abrir o CSV exportado em qualquer editor de planilha comum sem
  erro de formatação, incluindo candidatos com nome ou texto livre contendo vírgula ou aspas.
- **SC-002**: 100% das exportações realizadas produzem um registro de auditoria correspondente
  — nunca existe um arquivo entregue sem o registro, nem um registro sem o arquivo ter sido
  gerado com sucesso.
- **SC-003**: Nenhum CSV gerado sem pedido explícito de campos sensíveis contém gênero ou
  etnia, em nenhuma coluna.
- **SC-004**: Nenhum papel além de admin consegue gerar um CSV de candidatos.

## Assumptions

- **"Campos sensíveis" desta feature = gênero e etnia.** É a única categoria que já tem uma
  decisão de privacidade em vigor no sistema hoje (omitidos de toda listagem, para qualquer
  papel — FEAT-0007, seção 9) — esta spec estende essa decisão ao CSV em vez de inventar um
  critério novo. **Telefone fica fora do conjunto "sensível"** desta feature: nenhuma tela
  existente o restringe por papel (aparece em check-in e no dashboard, para admin e
  avaliador), então incluí-lo no CSV por padrão é consistente com o que já existe, não uma
  exposição nova.
- **Necessidades especiais permanece o indicador booleano já existente**
  (`candidate_applications.special_needs`), exportado sem gate de "campo sensível" — mesmo
  tratamento que ele já recebe hoje em `CandidateApplicationDetailSchema`, visível a qualquer
  admin sem restrição adicional. Se uma feature paralela (FEAT-0014) adicionar uma
  **descrição textual livre** de necessidades especiais ao contrato de candidato, essa
  descrição NÃO está coberta por esta spec — ao ser mesclada, deve ser avaliada
  separadamente para decidir se entra no conjunto de campos sensíveis (um texto livre sobre
  condição de saúde/deficiência é mais identificável que um booleano). Na data desta spec,
  FEAT-0014 não está mesclada em `develop` e o schema de candidato não tem esse campo — nada
  aqui assume sua existência.
- **Textos longos (`experience`, `motivation`) ficam fora do CSV nesta versão.** Mesma lógica
  de custo/utilidade já aplicada em FEAT-0007 (excluídos da listagem paginada por serem texto
  longo sem uso tabular) — uma planilha de acompanhamento não é o formato natural para ler
  respostas discursivas. Fica como extensão futura fácil (mesma fonte de dado, só adicionar
  colunas), não uma limitação estrutural.
- **Sem paginação no arquivo**: mesma suposição de escala do resto do backlog (dezenas/centenas
  de candidatos por edição, não volume que justifique streaming ou exportação em lotes).
- **Fora de escopo**: agendar exportações recorrentes; exportar avaliações/grupos (esta spec é
  só sobre o cadastro do candidato e o questionário); qualquer tela de consulta ao histórico de
  exportações (o registro é gravado para existir quando precisar, não para ter uma UI própria
  nesta feature — mesmo padrão de `checkin_events`, que a FEAT-0005 gravou sem tela).

## Dependências e impacto em outras features

- Reaproveita o mesmo modelo de recorte de edição (`process_id` = uma edição específica ou
  "todas") e os mesmos filtros de busca/data já definidos pela FEAT-0007 (dashboard) — não
  introduz um segundo vocabulário de filtro.
- **Não depende de FEAT-0014** (descrição de necessidades especiais) nem de FEAT-0015 (filtro
  por curso) para funcionar — é independente na cadeia do backlog, como as demais 008–016.
- Se FEAT-0014 for mesclada primeiro, a descrição textual de necessidades especiais que ela
  adicionar **não é automaticamente exportada** por esta feature — ver Assumptions.
