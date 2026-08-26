# Research: Papel de host por edição

## R1 — Modelo de dados: tabela de hosts, não de "papéis"

**Decision**: `edition_hosts(id, process_id, user_id, created_at)`, `UNIQUE (process_id,
user_id)`. A existência da linha **é** o fato de ser host naquela edição — não há coluna
`role`. Marcar host = `INSERT`; voltar a avaliador = `DELETE`. Ausência de linha = avaliador
(FR-004), sem precisar de valor default nem de upsert.

**Rationale**: mesmo princípio de design já usado em `candidate_checkins` (FEAT-0005):
"a existência da linha É a presença; não há coluna de estado, e desmarcar apaga a linha." Um
enum `role` exigiria decidir o que fazer com uma linha `role='avaliador'` (ela existiria só
para não existir?) — a tabela-de-fatos evita a pergunta.

**Alternatives considered**: coluna `role` numa tabela `edition_roles` com uma linha por
pessoa por edição sempre — rejeitada por criar um estado (`role='avaliador'` gravado) que não
carrega informação nova além de "esta linha existe".

## R2 — FR-005 (histórico preservado) é grátis pelo desenho

**Decision**: nenhuma lógica extra. Cada linha de `edition_hosts` é escopada por
`process_id`; alternar cargo na edição corrente só toca linhas com aquele `process_id`.

**Rationale**: o requisito "edição anterior não muda" é uma consequência direta do
`WHERE process_id = ?` em toda operação — não precisa de proteção adicional.

## R3 — Reaproveitar `NoActiveSelectionProcessError`, não criar um novo

**Decision**: reusa `NoActiveSelectionProcessError`/`CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS`
(`api/src/core/errors/checkin-errors.ts`) para o edge case "sem processo corrente" (FR-008),
e `SelectionProcessRepository.resolveCurrent()` (já existe, usado por `checkin.service.ts` e
`dashboard.service.ts`) para resolver a edição corrente.

**Rationale**: é o mesmo conceito de domínio ("não há edição cuja janela contenha hoje"), já
nomeado e usado em dois lugares. Criar `EVALUATORS_NO_ACTIVE_PROCESS` seria o tipo de
duplicação que o próprio `checkin.schema.ts` já documenta ter evitado para um caso vizinho.

## R4 — Onde a rota mora, e como o filtro (US2) é aplicado

**Decision**: prefixo novo `/evaluators`, router `evaluators.routes.ts` próprio.
`GET /evaluators?role=all|avaliador|host` devolve a lista já anotada com o cargo; o filtro é
aplicado no **service**, em memória — mesma decisão de "sem paginação" da feature 011 (Rooms):
a lista de avaliadores de uma edição é dezenas de pessoas, não milhares. `PUT
/evaluators/:userId/role` faz a troca (`INSERT`/`DELETE` em `edition_hosts` conforme R1).

**Rationale**: evita uma query com `CASE`/`HAVING` para um dataset pequeno onde filtrar em
memória é igualmente correto e mais simples de testar.

## R5 — Contas desativadas não aparecem na lista

**Decision**: a listagem exclui `users.deactivated_at IS NOT NULL`.

**Rationale**: não estava explícito na spec, mas é a leitura natural de "gerenciar quem
avalia/hospeda nesta edição" — uma conta desativada não pode ser escalada para nada. Mesmo
padrão que `auth.service.ts` já aplica (conta desativada nunca aparece como opção válida em
nenhum fluxo existente).
