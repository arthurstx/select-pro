# Feature Specification: Filtro por Curso nas Listagens de Candidatos

**Feature Branch**: `feat/filtro-por-curso`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Adicionar filtro por curso (`course`, enum fechado) nas telas que listam candidatos: check-in e dashboard. Investigar exatamente quais telas fazem sentido (o backlog original mencionava 'painel, check-in e dashboard' — pode ser que sejam a mesma tela). Objetivo: um único contrato de query param (course ou courses) e, se fizer sentido, um único componente de filtro reutilizado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filtrar candidatos por curso no check-in (Priority: P1)

Um avaliador no dia do evento presencial quer confirmar presença apenas dos candidatos de um curso específico (por exemplo, para organizar a fila por sala/curso), sem precisar rolar pela lista completa procurando pelo curso.

**Why this priority**: É a tela usada ao vivo, no evento, sob pressão de tempo — o ganho de produtividade é imediato e mensurável. Também é a tela que já tem o padrão visual de referência (chips de status) que o filtro de curso deve seguir.

**Independent Test**: Pode ser testado sozinho acessando `/painel/check-in`, aplicando o filtro de curso e conferindo que a lista mostra apenas candidatos daquele curso, com contagem e paginação recalculadas.

**Acceptance Scenarios**:

1. **Given** a lista de check-in carregada com candidatos de múltiplos cursos, **When** o avaliador seleciona um curso no filtro, **Then** a lista passa a mostrar apenas candidatos daquele curso, e a paginação reflete o total filtrado.
2. **Given** um filtro de curso aplicado, **When** o avaliador também digita um termo de busca por nome ou troca o filtro de status (presente/ausente), **Then** os três filtros combinam (E lógico) sobre o mesmo recorte de dados.
3. **Given** um filtro de curso aplicado, **When** o avaliador limpa o filtro (seleciona "Todos os cursos"), **Then** a lista volta a mostrar candidatos de todos os cursos, mantendo os demais filtros ativos.

---

### User Story 2 - Filtrar candidatos por curso no dashboard (Priority: P2)

Um administrador ou avaliador olhando o painel de inscrições quer ver a tabela de inscritos recortada por curso, para conferir perfis específicos de candidatos sem precisar cruzar informação manualmente com o gráfico de distribuição por curso.

**Why this priority**: É uma tela de análise, usada com menos urgência que o check-in, mas atendida pelo mesmo contrato de filtro — a prioridade menor reflete o caso de uso ser assíncrono, não a validade do requisito.

**Independent Test**: Pode ser testado sozinho acessando `/painel`, aplicando o filtro de curso na tabela de inscritos e conferindo que os itens listados, a paginação e a contagem batem com o curso selecionado — sem alterar os gráficos agregados (`MetricsPanel`), que continuam refletindo o recorte de edição, não o filtro de curso da tabela.

**Acceptance Scenarios**:

1. **Given** a tabela de inscritos do dashboard carregada, **When** o administrador seleciona um curso no filtro, **Then** a tabela mostra apenas candidatos daquele curso, com paginação recalculada, e os gráficos de métricas permanecem inalterados.
2. **Given** um filtro de curso aplicado no dashboard, **When** o usuário também aplica busca por nome, intervalo de datas ou muda a edição selecionada, **Then** todos os filtros combinam (E lógico) na mesma consulta.
3. **Given** um filtro de curso aplicado, **When** o usuário troca de página da tabela, **Then** o filtro de curso permanece ativo e a página muda dentro do recorte filtrado.

---

### Edge Cases

- O que acontece se o curso selecionado não tiver nenhum candidato correspondente no recorte atual (edição, busca, datas)? → A lista mostra o estado vazio já existente na tela ("nenhum candidato encontrado"), não um erro.
- O que acontece se um valor de curso inválido (fora do enum) for passado na URL/query string? → A API rejeita com erro de validação (400), do mesmo jeito que já faz hoje para outros parâmetros de filtro fora do domínio esperado.
- O que acontece ao trocar de curso enquanto uma página diferente de 1 está selecionada? → A paginação reseta para a página 1, seguindo o mesmo padrão já aplicado a outros filtros nestas duas telas (busca, status, intervalo de datas, edição).
- O que acontece se o filtro de curso for combinado com "todos os cursos" (nenhum filtro)? → Nenhuma condição de curso é aplicada na consulta; comportamento idêntico ao estado atual, sem filtro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir filtrar a listagem de candidatos da tela de check-in por curso, usando os valores do enum de curso já existente no domínio.
- **FR-002**: O sistema DEVE permitir filtrar a tabela de inscritos do dashboard por curso, usando os mesmos valores de enum.
- **FR-003**: O filtro de curso DEVE combinar por E lógico com os demais filtros já existentes em cada tela (busca por nome, status de presença no check-in; busca por nome, intervalo de datas e edição no dashboard).
- **FR-004**: A filtragem por curso DEVE ser resolvida na consulta ao banco de dados, nunca no cliente — a paginação e a contagem total exibidas DEVEM refletir apenas os itens que atendem ao filtro de curso.
- **FR-005**: O contrato de filtro de curso (nome e formato do parâmetro) DEVE ser o mesmo nas duas telas — a mesma forma de expressar "filtrar pelo curso X" no check-in e no dashboard.
- **FR-006**: O sistema DEVE suportar seleção de exatamente um curso por vez (ou nenhum, para "todos os cursos") — não é necessário suportar múltipla seleção simultânea de cursos nesta feature (ver Assumptions).
- **FR-007**: Um valor de curso fora do conjunto de cursos válidos DEVE ser rejeitado com erro de validação, sem alcançar a consulta ao banco.
- **FR-008**: Ao trocar o curso filtrado, a listagem afetada DEVE voltar para a primeira página.
- **FR-009**: O filtro de curso no dashboard DEVE afetar apenas a tabela de inscritos, não os gráficos/métricas agregadas da tela (que têm seus próprios controles de recorte, por edição).
- **FR-010**: A interface de seleção de curso DEVE seguir o padrão visual já estabelecido nas telas (mesma linguagem dos filtros existentes: chips/controles no mesmo estilo da barra de filtros do check-in), e DEVE ser implementada como um único componente compartilhado entre as duas telas, não duas variações divergentes.

### Key Entities

- **Curso (Course)**: Enum fechado de valores já existente no domínio do candidato (ex.: Engenharia de Computação, Engenharia Civil, etc.). Não é uma entidade nova — a feature apenas expõe um caminho de filtro sobre um atributo já presente em cada candidato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um avaliador consegue restringir a lista de check-in a um único curso em menos de 2 cliques/toques, a partir da tela já carregada.
- **SC-002**: A lista filtrada por curso (em qualquer das duas telas) reflete corretamente o total e a paginação do recorte filtrado, sem exigir que o usuário conte itens manualmente ou role a lista completa para confirmar.
- **SC-003**: O mesmo padrão de interação para filtrar por curso funciona identicamente nas duas telas (check-in e dashboard), permitindo que quem já aprendeu a usar em uma tela use a outra sem reaprendizado.
- **SC-004**: Combinar o filtro de curso com qualquer outro filtro já existente em cada tela produz sempre a interseção esperada (E lógico), sem exigir passos extras ou recarregamento manual.

## Assumptions

- **"Painel", "check-in" e "dashboard" são apenas DUAS telas, não três.** Investigação do código (`front/app/painel/page.tsx` renderiza `DashboardScreen` diretamente) confirma que "painel" e "dashboard" são o mesmo componente/tela. As únicas duas telas que listam candidatos no sistema são: (1) check-in (`/painel/check-in`) e (2) dashboard/painel de inscrições (`/painel`). As telas `/painel/salas` (CRUD de salas) e `/painel/solicitacoes` (fila de aprovação de cadastro de membros) não listam candidatos e ficam fora do escopo desta feature.
- **Seleção única, não múltipla.** O contrato de filtro usa um parâmetro de curso singular (um valor por vez, ou ausente para "todos"), não uma lista de cursos. Justificativa: nenhuma das duas telas hoje tem um caso de uso declarado que exija comparar/somar múltiplos cursos simultaneamente na mesma listagem (isso já existe, de forma agregada, nos gráficos de distribuição por curso do dashboard); seleção única mantém o componente de filtro simples e consistente com o padrão de chips de escolha única já usado para status de presença. Se uma necessidade real de múltipla seleção surgir depois, o contrato pode evoluir sem quebrar compatibilidade (parâmetro adicional ou repetição do mesmo nome).
- **Não há mudança de schema de banco.** A coluna `course` já existe em `candidates` e não muda de formato; a feature apenas adiciona um caminho de filtro `WHERE` nas consultas de listagem já existentes.
- **O filtro de curso no dashboard não altera as métricas agregadas.** Ele afeta somente a tabela paginada de inscritos (`GET /dashboard/candidates`), não os endpoints/gráficos de métricas (`GET /dashboard/metrics`), que continuam controlados apenas pelo seletor de edição.
- **Reutilização de componente é viável e desejável.** A avaliação do código existente (`filters-bar.tsx` do check-in usa chips de escolha única, sem scroll horizontal para poucas opções) mostra que um único componente de filtro de curso (com estilo de chips ou combobox, a decidir em `/speckit-plan`) pode ser compartilhado pelas duas telas, evitando duas implementações divergentes.
