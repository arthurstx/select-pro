# Research: Simulação e regras reais de tamanho dos grupos presenciais

## Decisão 1: Cálculo de tamanho/quantidade de grupo é função pura em `shared`, reaproveitada pelos dois lados

**Decision**: `derivePresencialGroupCount(candidateCount, maxGroups?)` e
`deriveEvaluatorTargetForGroupSize(size)` entram em `shared/src/schemas/room.schema.ts`
(mesmo arquivo de `deriveRoomCapacity`, mesmo domínio de capacidade/D5). O algoritmo real
(`api/src/services/group-organization.ts`) e a simulação do front usam as MESMAS funções.

**Rationale**: Princípio I (contrato como fonte da verdade) — se a simulação e a organização
real calculassem separadamente "quantos grupos pra N candidatos", divergiriam com o tempo. É
exatamente o padrão já usado por `deriveRoomCapacity` (FEAT-0011): uma função pura em
`shared`, consumida pela API (grava/aplica) e pelo front (mostra prévia sem round-trip).

**Alternatives considered**: Endpoint novo (`GET /groups/simulate/presencial`) calculando no
backend — rejeitado: é matemática pura sobre um número (quantidade de candidatos presentes,
já disponível no front via `GET /candidates?attendance=presencial&status=presentes`), não
precisa de I/O nem de autorização adicional; um endpoint a mais só pra isso duplicaria o
resultado que a função pura já dá de graça nos dois lados.

## Decisão 2: `derivePresencialGroupCount` — menor número de grupos que mantém 3-5 por grupo

**Decision**:

```
função derivePresencialGroupCount(candidateCount, maxGroups = Infinity):
  se candidateCount <= 0: devolve 0
  se candidateCount <= 5: devolve 1  # grupo único, mesmo abaixo de 3 (edge case)
  grupos = min(maxGroups, ceil(candidateCount / 5))
  enquanto grupos > 1 E candidateCount / grupos < 3: grupos -= 1
  devolve max(1, grupos)
```

**Rationale**: Começa do MENOR número de grupos que garante que ninguém passa de 5 (FR-003),
depois reduz até a média bater 3 por grupo (evita grupos de 1-2). `maxGroups` (capacidade
física da(s) sala(s), D5) sempre vence como teto — nunca recomenda mais grupos do que a sala
comporta fisicamente.

**Alternatives considered**: Maximizar o número de grupos (mais grupos menores) — rejeitado,
o pedido é claramente "no mínimo 3, no máximo 5", e menos grupos maiores é a leitura mais
natural de "priorizar 2 avaliadores pra 4-5" (grupos maiores, não menores).

## Decisão 3: Avaliador por tamanho de grupo — 1 para 3, 2 para 4-5; host nunca entra no pool

**Decision**: `deriveEvaluatorTargetForGroupSize(size) = size >= 4 ? 2 : 1`. Em
`api/src/services/group-organization.ts`, a distribuição de avaliadores para grupos
presenciais passa a: 1) filtrar `presentMembers` para só `role === "avaliador"` (hosts NUNCA
entram, FR-007); 2) distribuir por PRIORIDADE de alvo — primeiro garante 1 avaliador em cada
grupo (menor prioridade primeiro), depois completa o segundo avaliador dos grupos de 4-5 antes
de qualquer outra coisa (FR-006), até os avaliadores presentes acabarem.

**Rationale**: `distributeEvaluatorsAcrossNonEmptySlots` (a função de balanceamento por menor
grupo já existente) não sabe de "alvo por grupo" — só balanceia igual. Precisa de uma função
NOVA orientada a alvo (`distributeEvaluatorsByTarget`), não uma extensão da antiga: a regra
mudou de "equilibrar" para "priorizar completar os grupos maiores primeiro" — semântica
diferente o bastante pra merecer nome próprio, não um parâmetro a mais na função velha.

**Alternatives considered**: Continuar usando o balanceamento por menor grupo, só limitando a
2 por grupo — rejeitado, não implementa a priorização pedida (grupo de 4-5 tem prioridade
sobre grupo de 3 pro segundo avaliador); balancear "igual" pode deixar um grupo de 3 com 2
avaliadores enquanto um grupo de 5 fica só com 1, o oposto do que foi pedido.

## Decisão 4: Recomendação de salas/hosts — maior faixa primeiro (D5), sem depender de salas já cadastradas

**Decision**: `recommendRoomsForGroups(totalGroups)` distribui os grupos pela maior faixa de
D5 primeiro (`>80` → 4 grupos/2 hosts por sala), sobra vai pra menor faixa suficiente:

```
faixas (maior primeiro): {maxGroups: 4, hostCount: 2}, {maxGroups: 3, hostCount: 2}, {maxGroups: 2, hostCount: 1}
restante = totalGroups
salasGrandes = floor(restante / 4); restante -= salasGrandes * 4
se restante > 0: escolhe a menor faixa que ainda comporta o restante (ou a maior, se nada comportar sozinho)
```

**Rationale**: Recomendação "do zero" (Assumptions do spec.md) — não lê `rooms` cadastradas,
só devolve uma sugestão de configuração mínima de salas pra abrigar `totalGroups`, priorizando
menos salas físicas (mais eficiente pra quem vai alugar/reservar espaço).

**Alternatives considered**: Cruzar com salas já cadastradas e recomendar só a diferença —
mais útil na prática, mas fora do que foi pedido ("recomendar a quantidade... para a
quantidade de candidatos presentes", sem menção a salas existentes) — fica como possível
iteração futura, não nesta feature.

## Decisão 5: "Simular grupos" é ação nova e separada, não substitui o botão real de organizar

**Decision**: A tela de grupos presenciais ganha um botão "Simular grupos" (novo, sem
persistência) ao lado do botão real "Organizar grupos presenciais" (`OrganizeButton` já
existente, FEAT-0018 — sem mudança de posição/fluxo, só o algoritmo por trás dele muda,
Decisões 2/3).

**Rationale**: O usuário confirmou que "simular" só recomenda, sem gravar nada — logo a ação
de organizar de verdade precisa continuar existindo em algum lugar. Manter as duas ações
visíveis e distintas é mais simples e menos arriscado do que remover a organização real e
reintroduzi-la depois; o nome "simular" já deixa claro que é preview.

**Alternatives considered**: Fluxo em 2 passos (simular → só depois aparece "confirmar
organização") — mais próximo da leitura literal de "no botão de organizar... deve ser
simular", mas adiciona um estado de UI a mais (resultado da simulação precisa "lembrar" antes
do confirmar) sem necessidade real — o admin já pode simular, ver o número, e clicar em
organizar sempre que quiser, sem exigir que uma ação preceda a outra na mesma sessão de tela.
