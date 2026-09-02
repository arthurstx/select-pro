# Quickstart: validação ponta a ponta da 020

Pré-requisitos: `npm install`. Sem migration nova.

## Cenário 1 — grupos sempre 3-5 candidatos (US2, FR-003, SC-002)

Com sala(s) de capacidade suficiente e um número de candidatos presenciais presentes não
múltiplo exato de 5 (ex.: 13 candidatos): organizar e conferir que todo grupo formado tem 3,
4 ou 5 candidatos — nunca 1, 2, 6+.

## Cenário 2 — 2 avaliadores pra grupo de 4-5, 1 pra grupo de 3 (US3, FR-005/006, SC-003)

Com avaliadores presentes suficientes: todo grupo de 3 recebe 1 avaliador; todo grupo de 4-5
recebe 2. Com avaliadores insuficientes: grupos de 4-5 completam o segundo antes de qualquer
grupo de 3 ganhar um segundo (que nunca deveria ganhar, mas a prioridade vale se houver mais
de um grupo de 4-5 disputando avaliador escasso).

## Cenário 3 — host nunca é avaliador de grupo (US4, FR-007, SC-004)

Com hosts e avaliadores presentes: organizar e conferir que nenhum `group.evaluators` contém
um `userId` que seja host da edição.

## Cenário 4 — simulação não persiste nada (US1, FR-001)

Chamar `derivePresencialGroupCount`/`deriveEvaluatorTargetForGroupSize`/
`recommendRoomsForGroups` (funções puras, sem I/O) e confirmar que nenhuma chamada ao banco
acontece — são funções síncronas, testáveis isoladamente.

## Testes automatizados

```bash
npm run test --workspace=shared
npm run test --workspace=api
```

Cobre: `room.schema.test.ts` (funções novas), `group-organization.test.ts` (algoritmo real
com as regras novas), `group.service.test.ts` (D1 real).
