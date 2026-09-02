# Research — FEAT-0013 Avaliação dos candidatos

## D-tech1: `evaluations`/`metrics` são recriadas, não alteradas

**Decisão**: dropar `evaluations` e `metrics` (ambas vazias e órfãs desde `0001-schema.sql`,
confirmado por busca — nenhum código de produção referencia `MetricRow`/`metrics_id`/
`FROM metrics`) e criar duas tabelas novas: `evaluations` (uma linha por par
avaliador/candidato) e `evaluation_scores` (uma linha por critério de uma avaliação).
`metrics` não é recriada — não sobra nenhum uso para ela: os 5 critérios são fixos no
código (research.md D-tech2), não uma tabela de configuração.

**Rationale**: o design original de `evaluations` (repetia cor/observação por linha,
`metrics_id` apontando para uma tabela de "tipo de métrica" solta) não serve ao requisito
real — uma avaliação tem UMA cor geral e CINCO notas por critério, não uma cor por
critério. Reconstrução total é mais simples que adaptar um design que já está errado.
Constitution Princípio III: nenhum dado existente é afetado (tabelas vazias em todo
ambiente conhecido); a task de implementação inclui confirmar isso antes de aplicar em
staging/produção, mesmo procedimento já seguido pela FEAT-0012 (migration `0014`).

## D-tech2: critérios são um enum fixo no código, com pesos hardcoded em `shared`

**Decisão**: `EvaluationCriterionSchema` (enum de 5 valores) e uma função pura
`CRITERION_WEIGHTS`/`deriveWeightedScore(scores)` em
`shared/src/schemas/evaluation.schema.ts`, mesmo padrão de `deriveRoomCapacity`
(`room.schema.ts`) — lógica de domínio pura, sem I/O, reaproveitada por `api` (persistência)
e potencialmente pelo front (prévia ao vivo, se um dia o formulário quiser mostrar a
pontuação enquanto o avaliador ainda está preenchendo).

**Rationale**: a spec já trava que os 5 critérios/pesos não são editáveis nesta versão
(Assumptions) — uma tabela de configuração para algo que não muda seria complexidade sem
uso. `CHECK (criterion IN (...))` na coluna do banco, mesmo estilo de outros enums fixos do
projeto (`course`, `gender`, `checkin_events.action`).

## D-tech3: elegibilidade para avaliar é checada contra `group_evaluators`/`group_candidates` (FEAT-0012)

**Decisão**: antes de aceitar uma avaliação, o service confirma que `candidateId` está em
`group_candidates` de algum grupo presencial cuja `group_evaluators` contenha o
`userId` autenticado, ambos na edição corrente. Reaproveita
`GroupRepository.findEvaluatorGroup`/`findCandidateGroup` (já existentes, FEAT-0012) — só
adiciona a comparação `fromGroup.id === toGroup.id` (mesmo grupo).

**Rationale**: é literalmente a regra de negócio da spec (FR-003) — nenhuma tabela nova
necessária, o vínculo avaliador↔candidato já existe via grupo. Evita duplicar a noção de
"quem pode avaliar quem" numa tabela própria que precisaria ser mantida sincronizada com
`group_evaluators`/`group_candidates`.

## D-tech4: veredito é calculado na leitura, nunca persistido

**Decisão**: `EvaluationService.verdictFor(candidateId)` lê todas as `evaluations` do
candidato e aplica D2 (qualquer `RED` → `reprovado`) então D6 (`< 2` avaliações →
`pendente`, senão `aprovado`) a cada chamada — sem coluna `verdict` em `candidates` nem em
tabela própria.

**Rationale**: mesmo padrão já usado no projeto para dados derivados (`attendance` do
candidato, FEAT-0010; `unallocatedCandidateCount`, FEAT-0012) — evita um cache que pode
dessincronizar da fonte real (as avaliações) e simplifica: nenhuma migração de dado quando
uma avaliação nova chega ou é editada, o veredito só "acontece" na próxima leitura. Volume
por edição (dezenas de candidatos, poucas avaliações cada) não justifica pré-computar.

## D-tech5: contrato HTTP — namespace `/evaluations`, 4 rotas

**Decisão**:
- `GET /evaluations/my-group` — candidatos do grupo do avaliador logado, com indicação de
  "já avaliei"/"não avaliei" (FR-001). Papel `avaliador`/`host` (qualquer um alocado a
  grupo pode avaliar, FEAT-0012 não distingue os dois para isso).
- `PUT /evaluations/candidates/{candidateId}` — cria ou atualiza a avaliação do avaliador
  logado sobre aquele candidato (FR-002/FR-004). Corpo: 5 notas + cor + comentário opcional.
- `GET /evaluations/admin/candidates` — lista de candidatos presentes com contagem de
  avaliações e veredito (FR-007), admin-only.
- `GET /evaluations/admin/candidates/{candidateId}` — detalhe: todas as avaliações daquele
  candidato, com notas/cor/comentário/autor (FR-008), admin-only.

**Rationale**: separa claramente o namespace do avaliador (vê só o próprio grupo, escreve
só a própria avaliação) do namespace do admin (lê tudo, agregado e detalhado) — reflete a
FR-005/FR-009 (isolamento de visão) diretamente na rota, em vez de um único endpoint com
lógica de visibilidade condicional ao papel por dentro. `PUT` em vez de `POST`/`PATCH`: a
operação é idempotente por natureza (reenviar substitui, FR-004), mesmo raciocínio já usado
em `PUT /candidates/{id}/checkin`.

## D-tech6: `evaluations.user_id` guarda quem avaliou; front nunca expõe isso a outro avaliador

**Decisão**: a coluna existe (é preciso saber quem avaliou para o admin, FR-008, e para o
`UNIQUE (user_id, candidate_id)` do D-tech1 funcionar), mas `GET /evaluations/my-group`
(visão do avaliador) nunca devolve o `userId`/nome de quem fez outra avaliação do mesmo
candidato — só um contador. O isolamento (FR-005) é aplicado na resposta HTTP da rota do
avaliador, não removendo o dado do banco.

**Rationale**: mesma técnica já usada para `gender` no contrato de grupos (FEAT-0012) —
o dado existe onde é preciso (banco, resposta do admin), mas nunca vaza na resposta que não
deveria carregá-lo.
