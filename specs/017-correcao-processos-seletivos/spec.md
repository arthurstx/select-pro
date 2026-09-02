# Feature Specification: Correção de processos seletivos

**Feature Branch**: `017-correcao-processos-seletivos`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "CRUD de processos seletivos (correção pontual). Hoje `selection_processes` é criado automaticamente sob demanda por `SelectionProcessRepository.resolveCurrent()`, seguindo uma janela semestral fixa em código (jan-jul = AAAA.1, ago-dez = AAAA.2). Não existe nenhuma rota HTTP para editar um processo já criado — se uma edição nasce com `label`/`starts_at`/`ends_at` errado, a única correção hoje é SQL direto no banco. Escopo: dar ao admin uma forma de CORRIGIR pontualmente um processo seletivo já existente — editar `label`, `starts_at`, `ends_at` de um processo pelo `id`. NÃO inclui: criar processos manualmente fora da regra automática, mudar a regra semestral em si, nem conceito de processo ativo/arquivado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin corrige uma edição com dados errados (Priority: P1)

Um admin percebe que uma edição do processo seletivo (ex: "2026.2") foi criada com a data de
início ou fim erradas — por exemplo, por causa de um erro de fuso horário bem na virada do
semestre, ou um rótulo digitado errado em algum momento anterior. Hoje a única forma de
corrigir isso é pedir para alguém rodar SQL direto no banco de produção. Esta história dá ao
admin uma tela onde ele lista as edições existentes e corrige `label`/`starts_at`/`ends_at`
diretamente pela interface.

**Why this priority**: É o motivo inteiro da feature — sem isso, o admin continua dependente
de acesso direto ao banco para corrigir um erro que hoje não tem nenhuma outra saída.

**Independent Test**: Pode ser testado sozinho: criar/possuir uma edição existente, abrir a
tela de processos seletivos, editar `label`/`starts_at`/`ends_at`, salvar, e confirmar que a
listagem (e qualquer feature que dependa dessa edição, como o check-in) reflete o valor novo.

**Acceptance Scenarios**:

1. **Given** uma edição existente com `label` "2026.2" e `starts_at` errado, **When** o admin
   abre a tela de processos seletivos, edita `starts_at` para a data correta e salva, **Then**
   a listagem mostra o valor corrigido e nenhuma outra edição é afetada.
2. **Given** uma edição existente, **When** o admin tenta salvar com `starts_at` posterior a
   `ends_at`, **Then** o sistema recusa a alteração com uma mensagem clara, sem gravar nada.
3. **Given** uma edição existente com `label` "2026.2", **When** o admin tenta salvar um
   `label` que já pertence a outra edição, **Then** o sistema recusa a alteração (o `label` é
   único) com uma mensagem clara.

---

### User Story 2 - Admin visualiza todas as edições existentes (Priority: P2)

O admin precisa ver a lista completa de processos seletivos já criados (mesmo os antigos, sem
candidatos ativos) para localizar qual edição precisa de correção antes de editar.

**Why this priority**: Pré-requisito de navegação para a US1, mas tem valor próprio — hoje o
único jeito de ver todas as edições é uma query SQL manual; o dashboard (FEAT-0007) já lista
edições no seletor, mas não numa tela dedicada de administração.

**Independent Test**: Pode ser testado sozinho: abrir a tela e conferir que todas as edições
gravadas no banco aparecem, com `label`, `starts_at` e `ends_at` visíveis, sem exigir nenhuma
ação de edição.

**Acceptance Scenarios**:

1. **Given** existem 3 edições cadastradas (passadas e a corrente), **When** o admin abre a
   tela de processos seletivos, **Then** as 3 aparecem listadas, ordenadas da mais recente
   para a mais antiga.

---

### Edge Cases

- O que acontece se o admin editar `starts_at`/`ends_at` de uma edição que já tem candidatos,
  check-ins, grupos ou avaliações vinculados a ela? A correção deve seguir em frente — o
  `id` da edição não muda, só os metadados de calendário, então nenhum vínculo existente
  quebra. O sistema não precisa (e não deve) impedir a edição por causa disso.
- O que acontece se dois admins editarem a mesma edição ao mesmo tempo? A última escrita
  vence (mesmo padrão dos outros formulários de edição do projeto, ex. `rooms`); não há
  bloqueio otimista nesta versão.
- O que acontece se o admin tentar editar uma edição cujo `id` não existe (ex: já foi
  removida por outra sessão)? O sistema responde com um erro claro de "não encontrado", sem
  quebrar a tela.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir que um usuário com papel `admin` liste todos os
  processos seletivos já criados, ordenados do mais recente para o mais antigo por
  `starts_at`.
- **FR-002**: O sistema DEVE permitir que um usuário com papel `admin` edite `label`,
  `starts_at` e `ends_at` de um processo seletivo existente, identificado pelo seu `id`.
- **FR-003**: O sistema DEVE rejeitar uma edição em que `starts_at` seja posterior ou igual a
  `ends_at`, sem gravar a alteração.
- **FR-004**: O sistema DEVE rejeitar uma edição cujo `label` já pertença a outro processo
  seletivo (a unicidade de `label` já existe hoje na tabela e deve continuar valendo).
- **FR-005**: O sistema DEVE responder com um erro claro quando o `id` informado não
  corresponder a nenhum processo seletivo existente.
- **FR-006**: Usuários que não sejam `admin` NÃO DEVEM conseguir listar ou editar processos
  seletivos por esta funcionalidade.
- **FR-007**: O sistema NÃO DEVE oferecer criação manual de processos seletivos nem exclusão
  nesta versão — a criação continua exclusivamente automática, pela regra de janela semestral
  já existente.
- **FR-008**: A edição de `label`/`starts_at`/`ends_at` de um processo seletivo NÃO DEVE
  afetar nenhum dado já vinculado a esse processo (candidatos, check-ins, grupos, avaliações
  etc.) — o `id` do processo é o único vínculo estável.

### Key Entities

- **Processo seletivo (edição)**: já existe no sistema (ex.: "2026.2"). Representa um
  semestre de seleção, com um rótulo (`label`) e uma janela de datas (`starts_at`/`ends_at`).
  Esta feature não cria uma nova entidade — apenas passa a permitir a correção dos atributos
  de uma edição já existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue corrigir o rótulo ou a janela de datas de uma edição existente
  sem precisar de acesso direto ao banco de dados.
- **SC-002**: 100% das tentativas de corrigir uma edição com data de início posterior à data de
  fim, ou com rótulo duplicado, são recusadas com uma mensagem de erro compreensível, sem
  gravar dado inconsistente.
- **SC-003**: Um admin consegue localizar e corrigir uma edição em menos de 1 minuto a partir
  do momento em que abre a tela de processos seletivos.

## Assumptions

- A criação automática de processos seletivos (regra semestral fixa em código) permanece
  intocada — esta feature é só correção do que já existe, conforme confirmado com o usuário
  (motivo real: corrigir erros pontuais, não flexibilizar a regra de calendário).
- Não existe conceito de "processo ativo/arquivado" nesta versão — todas as edições
  cadastradas continuam aparecendo igualmente na listagem, sem distinção de estado.
- Segue o mesmo padrão de autorização já usado em `/rooms/*` e `/exports/*`: rota inteiramente
  restrita a `admin`.
- Não há exclusão de processo seletivo nesta versão — remover uma edição com dados vinculados
  é uma operação de risco (mesma categoria da reconstrução de tabelas já documentada no
  projeto) e fica fora de escopo até haver um pedido real por isso.
