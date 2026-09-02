# Research: Prosel online — grupos e avaliação independentes do presencial

**Revisado em 2026-09-01** — substitui integralmente as decisões da versão anterior (pool
único de round-robin), descartadas antes de qualquer commit.

## Decisão 1: `replaceOrganization` passa a ser escopado por `modality`

**Decision**: `GroupRepository.replaceOrganization(processId, groups)` vira
`replaceOrganization(processId, modality, groups)`, e o `DELETE` interno vira
`DELETE FROM groups WHERE process_id = ? AND modality = ?` em vez de `WHERE process_id = ?`.

**Rationale**: É o bug estrutural que a reformulação existe pra resolver. Hoje, organizar
qualquer modalidade apaga a edição inteira (`api/src/repositories/group.repository.ts:127`).
Como presencial e online acontecem em dias diferentes (FR-001), organizar um não pode nunca
apagar o outro — escopar o `DELETE` por `modality` resolve isso na raiz, sem precisar de
nenhuma outra guarda.

**Alternatives considered**: Marcar grupos com uma "geração"/timestamp de organização e
filtrar na leitura — rejeitado, complexidade desnecessária; escopar por `modality` já é
suficiente porque cada modalidade só é organizada pela sua própria operação.

## Decisão 2: `organizeGroups` (função pura) se divide em duas funções independentes

**Decision**: `organizePresencialGroups(candidates, rooms, presentMembers)` (o que já existia
antes da tentativa de pool único) e `organizeOnlineGroups(candidates, rooms)` — cada uma
exportada e chamada separadamente pelo service, sem nenhum ponto de junção entre as duas.
`organizeOnlineGroups` nunca recebe `presentMembers` — não tem por que, já que não aloca
avaliador (FR-002).

**Rationale**: A ideia de "pool único" (research.md da versão anterior) só fazia sentido se as
duas operações rodassem juntas, no mesmo instante, com o mesmo conjunto de avaliadores
presentes. Como isso não é verdade (dias diferentes, pessoas diferentes — Input do usuário),
a junção não faz sentido nenhum; a separação total é mais simples E mais correta.

**Alternatives considered**: Manter uma função `organizeGroups` só, com um parâmetro
`scope: "presencial" | "online"` — rejeitado por não trazer benefício sobre duas funções
nomeadas simples, e por arriscar reintroduzir acoplamento acidental entre os dois caminhos no
futuro.

## Decisão 3: Vínculo avaliador↔grupo online nasce só por ação humana — dois caminhos, um método de service, resposta de UM grupo só

**Decision**: Dois pontos de entrada (self-service do avaliador, atribuição manual do admin)
convergem para o mesmo método de service, `GroupService.assignEvaluatorToOnlineGroup(userId, groupId, now)`:
- `INSERT INTO group_evaluators (group_id, user_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET group_id = excluded.group_id`
  — o `UNIQUE(user_id)` já existente na tabela (migration `0014`, "uma pessoa, um grupo por
  vez") faz o `ON CONFLICT` cobrir tanto "entrar pela primeira vez" quanto "mover de outro
  grupo" (presencial OU online) na mesma instrução, sem precisar checar `fromGroup` antes
  (FR-004 sai de graça da constraint do banco, não precisa de lógica de aplicação replicando).
- Recusa (`GroupModalityMismatchError`) se o grupo de destino não for `modality: "online"`.

Rotas: `POST /groups/online/{groupId}/join` (self-service — `userId` = usuário autenticado) e
`PUT /groups/online/{groupId}/evaluators/{userId}` (admin, US3 — `userId` explícito). As DUAS
devolvem só o grupo de destino (`{ data: GroupSummary }`), não um par como o `PATCH
.../evaluators/{userId}` existente — não faz sentido devolver "grupo de origem" quando pode não
ter existido nenhum.

O `PATCH /groups/{groupId}/evaluators/{userId}` (admin, já existente, resposta de DOIS grupos)
fica **sem nenhuma mudança** — continua exigindo que o avaliador já esteja em algum grupo
(`EvaluatorNotAllocatedError` se não estiver), e serve para mover alguém que já está alocado
(presencial↔presencial, ou online↔online já dentro do sistema) entre dois grupos existentes.

**Rationale**: Misturar a semântica "assign sem origem" dentro do contrato de `moveEvaluator`
(que sempre devolve DOIS grupos) obrigaria inventar um grupo de origem fictício ou mudar o
shape da resposta condicionalmente — pior do que ter uma rota própria, mais simples, com
resposta de um grupo só. E usar `ON CONFLICT` em vez de checar `fromGroup` manualmente elimina
uma consulta e uma janela de corrida.

**Alternatives considered**: Estender `moveEvaluator`/`PATCH .../evaluators/{userId}` para
aceitar "sem origem" quando o destino é online — rejeitado pela mudança de shape de resposta
condicional, mais confusa do que duas rotas simples. Checar `findEvaluatorGroup` antes do
`INSERT`/`UPDATE` manualmente — rejeitado, o `UNIQUE(user_id)` já existente faz exatamente
isso de forma atômica.

## Decisão 4: "Sem host no online" é regra de leitura, não de escrita

**Decision**: `group_evaluators` continua sem coluna de `role` (role já é derivado de
`edition_hosts` na leitura, `group.repository.ts:196` `listEvaluatorAllocations`). A query de
leitura passa a só aplicar essa derivação quando `g.modality = 'presencial'` — para grupos
online, `role` é sempre `"avaliador"`, mesmo que a pessoa tenha uma linha em `edition_hosts`
para a edição.

**Rationale**: Simplicidade (FR-007) — não precisa impedir um host de entrar num grupo online
(Assumptions do spec.md), só não pode aparecer rotulado como host lá. Resolver isso na query
de leitura é mais simples do que impedir a escrita, e não exige nenhuma coluna nova.

**Alternatives considered**: Bloquear hosts de entrar em grupos online — rejeitado, não há
pedido nesse sentido, e adicionaria uma restrição sem necessidade real (Assumption do spec.md
confirma que host pode participar, só não é rotulado).

## Decisão 5: Sem elegibilidade extra para o self-service (sem exigir check-in prévio)

**Decision**: `POST /groups/online/{groupId}/join` não checa `member_checkins` — só exige
sessão autenticada com `role: "avaliador"` e que o grupo de destino pertença ao processo
corrente e seja `modality: "online"`.

**Rationale**: O clique em "Participar" já é o próprio sinal de disponibilidade — diferente do
presencial, onde `presentMembers` (quem fez check-in) é a única forma de saber quem está
disponível para o round-robin automático. Aqui não há round-robin, então não há por que exigir
o mesmo sinal.

**Alternatives considered**: Exigir check-in de membro antes de poder entrar — rejeitado,
adicionaria um passo a mais sem necessidade (o próprio join já prova disponibilidade), e o
Input do usuário não pediu isso.

## Decisão 6: Elegibilidade de avaliação (FEAT-0013) continua sem nenhuma mudança

**Decision**: Igual à versão anterior desta spec — `findEvaluatorGroup`/`findCandidateGroup` e
`evaluation.service.ts` não mudam nenhuma linha.

**Rationale**: A elegibilidade já é "avaliador e candidato no mesmo grupo", sem distinção de
modalidade nem de como o vínculo nasceu (round-robin, self-service, ou atribuição manual) — o
mecanismo já é agnóstico disso.

**Alternatives considered**: Nenhuma — não há o que mudar.

## Decisão 7: Front — duas seções, dois botões de organizar, botão de "Participar" no card online

**Decision**: `/painel/grupos` passa a ter duas seções (`<section>` separadas com título
próprio) — "Grupos Online" e "Grupos Presenciais" — cada uma com seu próprio botão de
organizar (`POST /groups/organize/online` / `POST /groups/organize/presencial`). O card de
grupo online ganha um botão "Participar do grupo" (chama o join) quando o avaliador logado
ainda não está nesse grupo, e "Sair do grupo" quando já está.

**Rationale**: Atende FR-008 (seções separadas) e FR-003/FR-005 (entrar/sair) diretamente.

**Alternatives considered**: Nenhuma — é a leitura direta do pedido do usuário, incluindo o
exemplo de estrutura de tela que ele forneceu.
