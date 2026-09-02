# Research: Recomendações e Simulação de Grupos (Presencial + Online)

## D1 — Faixa ideal do online reaproveita `derivePresencialGroupCount`, sem função nova

**Decision**: `organizeOnlineGroups` passa a calcular a quantidade de grupos chamando
`derivePresencialGroupCount(candidates.length)` (sem `maxGroups`, que default para
`Infinity` — o online não tem teto de sala) em vez do atual
`Math.ceil(candidates.length / averageRoomGroupSize(rooms))`.

**Rationale**: Tracei `derivePresencialGroupCount` manualmente para N = 1..17 e o resultado já
bate exatamente com a faixa pedida para o online (FR-014): ideal 4-5, aceita 3 quando não dá
pra evitar, nunca deixa um grupo de 6+ quando redistribuir em grupos menores é possível
(N=6 → 2 grupos de 3; N=8 → 2 grupos de 4; N=9 → grupos de 4+5). A função já minimiza grupos
fora da faixa por construção (reduz a contagem de grupos enquanto a média não cair abaixo de
3). Escrever uma segunda função quase idêntica só pra ter um nome "online" duplicaria a lógica
e o teste sem ganho — o nome `derivePresencialGroupCount` fica formalmente impreciso (agora
serve às duas modalidades) mas renomear obrigaria atualizar todos os call sites e testes já
existentes (`group-organization.ts`, `simulate-organize-modal.tsx`, `room.schema.test.ts`) por
um ganho cosmético; o comentário na função já documenta o uso duplo.

**Alternatives considered**: (a) nova função `deriveOnlineGroupCount` — rejeitada, código
duplicado sem diferença de comportamento. (b) renomear a função existente para algo neutro —
rejeitada por enquanto (churn desnecessário nesta feature); pode virar um ajuste cosmético
futuro se incomodar.

## D2 — `room.size` entra no contrato de `GroupSummary` em vez de um endpoint de diagnóstico à parte

**Decision**: `GroupSummarySchema.room` ganha `size: z.number().int()` (ao lado de `id`/`name`
já existentes). Isso alimenta `GET /groups`, `POST /groups/organize/presencial`,
`POST /groups/organize/online`, `POST /groups/preview/presencial` e o novo
`POST /groups/preview/online` — todos reaproveitam o mesmo `GroupSummarySchema`.

**Rationale**: O front já importa e reaproveita direto do `shared` as funções puras de regra de
negócio (`deriveRoomCapacity`, `derivePresencialGroupCount`, `deriveEvaluatorTargetForGroupSize`,
`recommendRoomsForGroups`) desde a FEAT-0020/0021, sem round-trip — é o padrão já estabelecido
pra esse tipo de cálculo de exibição. Com `room.size` disponível, os diagnósticos de host e de
desvio do ideal (US1/US2) são só `deriveRoomCapacity(room.size)` aplicado no front sobre dados
que já chegam na resposta da prévia — sem inventar um segundo lugar (backend) que recalcula a
mesma fórmula e sem round-trip extra. Mantém a Constituição I (contrato único em `shared`) sem
criar um endpoint novo só pra diagnóstico.

**Alternatives considered**: computar os diagnósticos no `api/` e devolver um campo
`compliance`/`deviations` pronto — rejeitado: duplicaria `deriveRoomCapacity` em dois lugares
(ou exigiria importar lógica de exibição pro backend) pra um cálculo que é puramente derivado
de dados que já estão na resposta.

## D3 — Duas funções puras novas em `shared/src/schemas/room.schema.ts`

**Decision**: adicionar

```ts
export function classifyPresencialGroup(candidateCount: number, evaluatorCount: number): "ideal" | "aceitavel" | "fora_do_ideal"
export function calculateHostDeficit(roomSizesUsed: number[], hostsPresentCount: number): { required: number; deficit: number }
```

`classifyPresencialGroup` implementa FR-005 (4-5 candidatos + 2 avaliadores = ideal; 3 + 1 =
aceitável; qualquer outra combinação = fora do ideal — grupo vazio nunca chega aqui, o
algoritmo real nunca cria grupo vazio). `calculateHostDeficit` implementa FR-001/FR-002: soma
`deriveRoomCapacity(size).hostCount` para cada sala DISTINTA usada na prévia (não por grupo —
uma sala com 2 grupos conta uma vez) e compara com hosts presentes.

**Rationale**: são regras de negócio testáveis isoladamente (mesmo padrão de
`deriveRoomCapacity`/`derivePresencialGroupCount`, com testes em
`shared/test/room.schema.test.ts`), reaproveitadas por qualquer tela futura que precise do
mesmo cálculo — evita reimplementar a mesma conta como `if` solto dentro do componente React.

## D4 — Sugestão de quem promover é seleção pura de lista, sem função nova em `shared`

**Decision**: dado um déficit de N hosts, a sugestão de promoção pega os primeiros N avaliadores
(role `"avaliador"`) da lista de quem está participando da simulação no momento (mesma ordem já
devolvida por `availableEvaluators`), calculado direto no componente do modal.

**Rationale**: é seleção de UI (quais linhas destacar), não uma regra de negócio testável
isoladamente — não precisa virar função de `shared`. Fica determinístico (mesma ordem sempre)
sem exigir um critério de "melhor" avaliador pra promover, que a spec não pede.

## D5 — Painel de cenários (US3) é composição das funções já existentes, sem cálculo novo

**Decision**: o painel de exemplos roda a pipeline já existente
(`derivePresencialGroupCount` → `recommendRoomsForGroups` → `deriveEvaluatorTargetForGroupSize`)
contra um conjunto fixo de contagens de referência (ex.: poucos ≈ 5, médio ≈ 20, muitos ≈ 50)
mais os recursos realmente presentes (avaliadores/hosts/salas), para montar as linhas de "falta
X pra chegar no ideal". Nenhuma função nova em `shared` — é composição, calculada no
componente do modal.

**Rationale**: os números de referência são só para ilustrar a mesma fórmula já usada no
cálculo real da situação atual — não é um cálculo diferente, é o mesmo cálculo aplicado a mais
de uma entrada.

## D6 — Simulação online é um modal (mesmo padrão do presencial), não uma rota/aba de navegação nova

**Decision**: "aba de Simulação" do pedido original vira um botão "Simular grupos" + modal na
tela `/painel/grupos/online` (componente `SimulateOnlineOrganizeModal`), espelhando a estrutura
já usada em `simulate-organize-modal.tsx` (Dialog, seção de prévia, footer "Aprovar simulação e
organizar grupos") — SEM a seção de seleção/promoção de avaliadores, que não existe no online
(FR-015).

**Rationale**: introduzir um paradigma de abas de navegação só pra esta tela quebraria a
consistência com o padrão de modal já validado e testado no presencial (FEAT-0021) — e o pedido
descreve exatamente o mesmo fluxo de "revisar antes de aplicar" já implementado dessa forma.

## D7 — `organizeOnlineGroups` perde o parâmetro `rooms` e o código de tamanho médio de sala morre

**Decision**: `organizeOnlineGroups(candidates: PresentCandidateRow[]): GroupToInsert[]` — remove
o parâmetro `rooms: RoomRow[]`, e `averageRoomGroupSize`/`FALLBACK_ONLINE_GROUP_SIZE` são
apagados (deixam de ser chamados por qualquer coisa, D1 substitui o cálculo).

**Rationale**: sem D1, `rooms` só servia pra estimar um tamanho médio de grupo — com
`derivePresencialGroupCount(candidates.length)` isso deixa de fazer sentido (online nunca teve
sala de verdade, só usava a MÉDIA como referência de tamanho). Código morto não fica pra trás
("prefira deletar a manter render/branch morto").

## D8 — Novo `previewOnline()` + `POST /groups/preview/online`, resposta enxuta

**Decision**: `PreviewOnlineResponseSchema = { data: { groups: GroupSummary[] } }` — sem
`unallocatedCandidateCount` (o algoritmo online sempre aloca todo mundo, não há conceito de
capacidade de sala) e sem `availableEvaluators` (avaliador nunca entra no cálculo automático,
FR-015). O aviso de "avaliadores já atribuídos serão perdidos" (FR-016) é calculado no FRONT, a
partir dos grupos online REAIS já carregados por `useGroupsQuery()` na própria tela (conta
quantos avaliadores estão em grupos `modality: "online"` hoje) — sem precisar de campo novo no
backend pra isso, e sem round-trip extra.

**Rationale**: mantém a resposta do preview simétrica ao que o cálculo realmente produz (nada
de campos que sempre voltariam vazios/zero). O aviso de avaliadores em risco usa dado que a
tela já tem em cache, reduzindo a superfície de contrato nova ao mínimo necessário.

## D9 — Aprovar a simulação online reaproveita `POST /groups/organize/online`, sem mudança

**Decision**: nenhuma mudança de assinatura no endpoint de organizar online — ele já não recebe
corpo, e já é determinístico dado o mesmo estado de check-in (mesmo padrão de reprodução
exata que `organizePresencial(evaluatorUserIds)` tem com `previewPresencial`, só que aqui não
há parâmetro nenhum pra manter igual entre os dois).

**Rationale**: evita reabrir um contrato que já funciona; o único requisito novo (FR-013 — só
persistir na aprovação) já é satisfeito por este endpoint já ser a etapa que persiste, bastando
não chamá-lo automaticamente ao abrir o modal (mesma disciplina já usada no presencial).

## D10 — "Limpar organização" ganhou o par online, mesma mecânica do presencial

**Decision**: `GroupService.clearOnlineOrganization` + `DELETE /groups/online`, espelhando
`clearPresencialOrganization`/`DELETE /groups/presencial` (FEAT-0021) exatamente —
`replaceOrganization(process.id, "online", [])`. `ClearOrganizationButton` ganhou a prop
`modality` em vez de virar um componente novo duplicado.

**Rationale**: pedido posterior do usuário ("adicione opção de limpar grupos no online tbm")
— mesma mecânica já validada no presencial, sem ambiguidade de design; implementado direto,
sem reabrir o ciclo completo de spec-kit (tarefa pequena e simétrica a uma já existente).
