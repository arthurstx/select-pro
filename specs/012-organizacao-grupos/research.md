# Research — FEAT-0012 Organização automática de grupos

## D-tech1: `groups`/`group_evaluators`/`group_candidates` são recriadas (não `ALTER`)

**Decisão**: dropar e recriar as três tabelas numa única migration, em vez de `ALTER TABLE`.

**Rationale**: as três existem desde `0001-schema.sql`, vazias e sem nenhum código as
referenciando (CONTEXT.md, "janela que se fecha"). `groups` hoje não tem `process_id`
(bug de design pré-existente, apontado no backlog) e `room_id` é `NOT NULL`, incompatível
com grupo online (FR-007, sem sala). Reconstrução total é mais simples que uma sequência de
`ALTER` no SQLite/D1 (que não suporta `ADD CONSTRAINT`/`ADD COLUMN ... REFERENCES` em uma
única instrução para FK novas). Constitution Princípio III exige que o plano diga o que
acontece com os dados existentes: **nenhum** — as tabelas estão vazias em dev; a task de
implementação inclui um passo explícito de **confirmar que também estão vazias em staging e
produção antes de aplicar lá** (mesma cautela já registrada em CONTEXT.md). Sendo `DROP`
sobre tabela vazia e sem filhos com dados, dispensa o procedimento de cópia da migration
`0004` e dispensa `MAINTENANCE_MODE` (puramente aditivo em efeito, ainda que a migration em
si contenha `DROP`/`CREATE`).

**Alternatives considered**: `ALTER TABLE groups ADD COLUMN process_id` + `ADD COLUMN
modality` mantendo `room_id NOT NULL` com um valor sentinela para "sem sala" — rejeitado por
introduzir um valor mágico (`room_id = ''` ou similar) em vez de `NULL`, contrariando o
próprio modelo relacional e complicando toda query que já faz `JOIN rooms`.

## D-tech2: modalidade do grupo é coluna explícita, não apenas `room_id IS NULL`

**Decisão**: `groups` ganha `modality TEXT NOT NULL CHECK (modality IN ('presencial',
'online'))`, com `CHECK (modality = 'presencial' OR room_id IS NULL)` garantindo que grupo
online nunca tenha sala.

**Rationale**: `room_id IS NULL` sozinho já bastaria para distinguir, mas uma coluna
explícita deixa toda query de filtro (`WHERE modality = 'online'`) autoexplicativa, sem
depender de quem lê o SQL saber a convenção "NULL = online". Reaproveita o mesmo estilo já
usado em `evaluations.status` (CHECK de enum) e `member_checkins` (existência de linha como
fato) — nunca strings soltas fora de um CHECK.

## D-tech3: um candidato/avaliador só pode estar em um grupo por vez — `UNIQUE` na tabela de junção

**Decisão**: `group_candidates.candidate_id` e `group_evaluators.user_id` ganham `UNIQUE`
(além da chave composta já existente).

**Rationale**: FR-011 exige que reorganizar descarte a organização anterior por completo —
a rotina de "organizar" sempre faz `DELETE FROM groups WHERE process_id = ?` (cascade
apaga as duas tabelas de junção) antes de inserir os grupos novos, então o `UNIQUE` nunca
colide num fluxo correto. Ele existe como cinto de segurança contra bug de implementação
(inserir a mesma pessoa em dois grupos), não como regra de negócio nova.

## D-tech4: algoritmo de distribuição — separação em duas fases (D1 depois D5)

**Decisão**: o algoritmo de organização roda em duas fases independentes, uma por
modalidade (online e presencial, FR-003), cada uma assim:

1. **Determinar o número de grupos-alvo** dessa modalidade:
   - Presencial: percorre as salas cadastradas em ordem de cadastro (`created_at ASC`,
     mesma ordem que `RoomsRepository` já usa para listagem), acumulando salas uma a uma
     até que a soma das capacidades (`size`) cubra o total de candidatos presenciais
     presentes, ou até esgotar as salas cadastradas. O número de grupos-alvo é a soma de
     `deriveRoomCapacity(sala.size).maxGroups` (já implementado, `room.schema.ts`) das
     salas acumuladas. Isso implementa "usa só as salas necessárias" (edge case da spec)
     sem reintroduzir o "3º grupo em falta de sala" do D5 original — ver D-tech5.
   - Online: um único "pool" sem sala; o número de grupos-alvo é escolhido para manter os
     grupos com tamanho parecido ao das salas físicas — ver Assumptions do data-model.
2. **Separar por gênero e aplicar D1**: mulheres (`gender = 'feminino'`) são distribuídas
   primeiro, 2 por grupo, até o número de grupos-alvo; sobra ímpar de mulheres vira um
   trio num dos grupos já formados (nunca um grupo isolado só para a sobra). Se o total de
   mulheres não preencher todos os grupos-alvo com pelo menos 2, os grupos restantes ficam
   com 0 mulheres.
3. **Preencher o resto**: candidatos que não são mulheres (`masculino`/`outro` — D1 é
   especificamente sobre não isolar mulher, os outros gêneros não têm essa restrição, ver
   data-model Assumptions) são distribuídos em round-robin sobre todos os grupos-alvo já
   existentes (inclusive os que não receberam mulher), equilibrando o tamanho final.
4. **Mapear grupo → sala** (só presencial): os grupos formados são atribuídos às salas
   acumuladas no passo 1, na ordem, preenchendo o `maxGroups` de cada sala antes de passar
   para a próxima.
5. **Alocar avaliadores/hosts** (só presencial, FR-006): avaliadores/hosts com check-in de
   membro feito (FEAT-0010) são distribuídos em round-robin entre os grupos da mesma sala a
   que pertencem — sem tentativa de balanceamento por carga/histórico (Assumption já travada
   na spec).

**Rationale**: separar "quantos grupos" de "quem entra em cada grupo" torna o D1
verificável isoladamente (é só contagem de mulheres por grupo) e mantém o algoritmo
determinístico e testável sem heurística de otimização combinatória — não há necessidade de
um bin-packing sofisticado para o volume desta feature (dezenas de pessoas por edição, não
milhares, mesmo racional já usado na FEAT-0010 para dispensar paginação).

**Alternatives considered**: otimizar por afinidade/histórico entre avaliador e candidato —
explicitamente fora de escopo (Assumptions da spec). Um único pool global misturando online
e presencial com "flag" por pessoa — rejeitado porque contraria FR-003 (nunca misturar
modalidade no mesmo grupo), que é regra rígida, não preferência.

## D-tech5: "3 grupos se faltar sala" (D5 original) não é reimplementado como regra dinâmica

**Decisão**: o número de grupos por sala usa exclusivamente `deriveRoomCapacity` (já
implementado e testado na FEAT-0011), sem a regra adicional "vira 3 grupos se faltar sala"
mencionada na formulação original de D5 no backlog.

**Rationale**: `deriveRoomCapacity` é hoje a única fonte da verdade sobre grupos-por-sala,
consumida pelo front da FEAT-0011 (prévia ao vivo no formulário de sala) — criar uma segunda
regra que a sobrescreve em certas condições duplicaria a lógica e criaria dois lugares para
manter sincronizados. O cenário que a frase original endereçava (mais candidatos do que as
salas cadastradas comportam) já tem tratamento na spec desta feature: FR-012/FR-013 (avisar
o admin e alocar só o que couber) em vez de inflar `maxGroups` de uma sala além do que ela
foi cadastrada para comportar.

## D-tech6: contrato HTTP — 4 rotas, todas admin-only

**Decisão**:
- `POST /groups/organize` — roda o algoritmo completo para a edição corrente, substitui
  qualquer organização anterior (FR-001, FR-011), devolve a organização resultante.
- `GET /groups` — lista a organização atual da edição corrente, para visualização (FR-008).
- `PATCH /groups/:groupId/candidates/:candidateId` — move um candidato para `groupId`
  (FR-009). Bloqueia (erro) mover entre modalidades diferentes (FR-003 é invariante rígida);
  avisa mas permite quando o resultado viola D1 (FR-010, aviso não-bloqueante retornado no
  corpo da resposta).
- `PATCH /groups/:groupId/evaluators/:userId` — move um avaliador/host para `groupId`
  (FR-009), mesma restrição de modalidade.

**Rationale**: espelha o padrão HTTP já usado em `member-checkin.routes.ts` (verbos por
ação de domínio, não CRUD genérico) e em `evaluators.routes.ts` (`PUT .../role` para mudança
pontual de atribuição). `organize` é `POST` (efeito colateral amplo, não idempotente da
mesma forma que um `PUT` de recurso único) — mesma escolha de verbo que outras ações de
"disparar processo" no projeto (nenhuma ainda existia, mas é o padrão REST convencional que
o resto do projeto já segue implicitamente).
