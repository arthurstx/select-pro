# Research: Simulação com aprovação, limpar organização e badges

## Decisão 1: "Host responsável pela sala" reaproveita `group_evaluators`, sem tabela nova

**Decision**: Hosts voltam a entrar em `group_evaluators` — mas agora por SALA, não por
candidato: o(s) host(s) escolhido(s) para uma sala são inseridos em TODOS os grupos daquela
sala (replicados). A leitura já deriva `role: "host"` via `edition_hosts` (FEAT-0012/0020) —
nenhuma mudança de schema. "Host da sala" na prévia/organização = filtrar
`group.evaluators` por `role === "host"` (é o mesmo em todos os grupos da mesma sala).

**Rationale**: A FEAT-0020 excluiu host do pool de AVALIADOR por grupo (1-2 por grupo, D5) —
regra que continua valendo. O que faltava era um host de verdade associado a uma sala (antes,
`hostCount` de `deriveRoomCapacity` era só um número de referência, nunca uma pessoa real
atribuída). Reaproveitar `group_evaluators` — já filtrável por `role` — evita criar
`room_hosts`/`group_hosts` só pra isso.

**Alternatives considered**: Tabela nova `room_hosts(room_id, process_id, user_id)` —
rejeitada: exigiria migration, e o problema já é resolvido pela tabela existente, que já
suporta múltiplas linhas por grupo e já deriva `role` corretamente.

## Decisão 2: Distribuição de hosts por sala é passo novo, separado da distribuição de avaliadores por grupo

**Decision**: `distributeHostsToRooms(hosts, roomAssignments)` — função pura nova em
`group-organization.ts` — recebe os hosts presentes (role `"host"`, já filtrados) e a lista de
salas usadas (com `hostCount` de `deriveRoomCapacity`), distribui até `hostCount` hosts por
sala (balanceamento simples por sala com menos gente), e devolve um `Map<roomId, string[]>`.
Ao montar cada `GroupToInsert`, `evaluatorUserIds` passa a ser
`[...avaliadoresDoGrupo, ...hostsDaSala]`.

**Rationale**: Hosts são um recurso da SALA (compartilhado por todos os grupos dela), não do
grupo individual — mistura-los na mesma passada que `distributeEvaluatorsByTarget` (que decide
1-2 por GRUPO) confundiria as duas unidades de alocação.

**Alternatives considered**: Nenhuma — é a leitura direta do requisito ("host responsável pela
sala", não "por grupo").

## Decisão 3: Simulação vira endpoint de verdade (`POST /groups/preview/presencial`), não só cálculo client-side

**Decision**: Ao contrário da FEAT-0020 (onde a simulação era só matemática pura no front, sem
round-trip), esta versão precisa de I/O real — candidatos presentes, avaliadores/hosts
presentes, salas cadastradas, tudo com nomes e `memberStatus`/`gender` reais, não só uma
contagem. `GroupService.previewPresencial(evaluatorUserIds?, now?)` roda exatamente o mesmo
algoritmo de `organizePresencial`, SEM chamar `replaceOrganization` — devolve o mesmo formato
de `GET /groups`, mais a lista de avaliadores/hosts presentes disponíveis pra seleção.

**Rationale**: O pedido explicitamente quer nomes reais, busca por nome, promoção a host
dentro do modal — não dá pra fazer isso com números agregados; precisa dos dados de verdade.

**Alternatives considered**: Calcular no front a partir de dados já carregados — rejeitado, o
front não tem (e não deveria ter) acesso a quem fez check-in de membro sem uma rota própria; e
duplicar a lógica de distribuição no cliente violaria o Princípio I do jeito que a FEAT-0011/
FEAT-0020 evitaram para a matemática pura, mas aqui a "prévia" não é só matemática — é dado
real (nomes, ids) que só existe no banco.

## Decisão 4: `organizePresencial`/`previewPresencial` aceitam `evaluatorUserIds?` opcional — mesmo parâmetro nos dois

**Decision**: Corpo opcional `{ evaluatorUserIds?: string[] }` em `POST /groups/organize/
presencial` (existente) e no novo `POST /groups/preview/presencial`. Quando informado, filtra
`presentMembers` (role `avaliador`) para só esses ids antes de distribuir; hosts continuam
sempre todos os presentes (Assumption do spec.md — sem checkbox própria pra host). Ausente =
todos os avaliadores presentes (comportamento de hoje, sem mudança de compatibilidade).

**Rationale**: FR-011 exige que "aprovar" aplique EXATAMENTE a prévia mostrada — se a prévia
usou um subconjunto de avaliadores (porque a gestão desmarcou alguém), o `organize` de
aprovação precisa do mesmo subconjunto, não recalcular do zero com todo mundo presente de
novo.

**Alternatives considered**: Persistir a seleção do lado do servidor entre preview e approve
(um "rascunho" com id) — rejeitado, complexidade desnecessária; o front já tem a seleção em
mãos no momento de aprovar (é o mesmo estado do modal), só precisa reenviar.

## Decisão 5: `gender` entra em `GroupCandidateSchema`; `memberStatus` entra em `GroupEvaluatorSchema`

**Decision**: Os dois campos passam a existir nos schemas de resposta de `/groups` (contrato
compartilhado, Princípio I) — não são exclusivos da prévia, aparecem também nos grupos já
organizados (`GET /groups`), já que a US3/US4 pedem isso "em toda listagem relevante".

**Rationale**: `/groups` é inteiramente `requireRole(ADMIN)` (FEAT-0012) — o mesmo nível de
acesso que já expõe email/telefone de candidato em outras telas admin-only (dashboard,
FEAT-0007). Expor `gender` aqui não é a mesma situação da FEAT-0005 (check-in, acessível a
qualquer avaliador) nem da FEAT-0012 original (`GroupCandidateSchema` foi desenhado por
analogia ao check-in, não por uma razão própria de `/groups` ser admin-only). `memberStatus`
já é exposto para avaliadores em `/evaluators` (mesmo nível de acesso).

**Alternatives considered**: Endpoint separado só pra prévia com esses campos, mantendo `GET
/groups` como está — rejeitado, US3/US4 pedem os badges nos grupos JÁ organizados também, não
só na prévia; um schema por rota pra mesma entidade violaria o Princípio I.

## Decisão 6: "Limpar organização" é `DELETE /groups/presencial`, reaproveitando `replaceOrganization` com lista vazia

**Decision**: `GroupService.clearPresencialOrganization(now?)` chama
`this.repository.replaceOrganization(process.id, "presencial", [])` — mesmo método já usado
por `organizePresencial`, só que sem nenhum grupo novo pra inserir. `DELETE
/groups/presencial` (admin-only), `204` no sucesso.

**Rationale**: `replaceOrganization` já é "apaga tudo desta modalidade, insere o que vier" —
"limpar" é literalmente esse método com uma lista vazia. Nenhum código novo de repositório.

**Alternatives considered**: Nenhuma — reaproveitamento direto.

## Decisão 7: Modal precisa de um componente `Dialog` novo (shadcn) — `Sheet` não serve mais

**Decision**: Instalar `dialog` (shadcn/radix) — a simulação da FEAT-0020 usava `Sheet`
(painel lateral, conteúdo curto); agora precisa de uma área central maior (lista de
avaliadores + busca + prévia completa por sala). Confirmação de "Limpar organização" continua
usando `window.confirm()` nativo — mesmo padrão já usado pra excluir sala (FEAT-0011,
`AlertDialog` não instalado, e um `confirm()` nativo já foi considerado suficiente pra
ferramenta interna).

**Rationale**: Consistência com decisão já tomada na FEAT-0011 sobre `AlertDialog` vs
`confirm()` para uma ação destrutiva simples de admin; `Dialog` é necessário à parte por ser
conteúdo rico (formulário + lista + prévia), não uma pergunta sim/não.

**Alternatives considered**: Continuar com `Sheet` — rejeitado, painel lateral estreito não
comporta bem uma prévia de várias salas lado a lado com listas de candidatos.
