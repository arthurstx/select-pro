# Data Model: Simulação e regras reais de tamanho dos grupos presenciais

Nenhuma tabela nova, nenhuma coluna nova, nenhuma migration. "Simulação" não é uma entidade
persistida (spec.md, Key Entities) — um cálculo sob demanda, descartado ao sair da tela.

## Funções puras novas (`shared/src/schemas/room.schema.ts`)

| Função | Entrada | Saída | Uso |
|---|---|---|---|
| `derivePresencialGroupCount` | `candidateCount: number`, `maxGroups?: number` | `number` (quantidade de grupos) | Organização real (`group-organization.ts`) e simulação (front) |
| `deriveEvaluatorTargetForGroupSize` | `size: number` | `1 \| 2` | Idem |
| `recommendRoomsForGroups` | `totalGroups: number` | `{ maxGroups: number; hostCount: number; roomsNeeded: number }[]` | Só simulação (front) |

## Mudança de comportamento em `group_evaluators` (via `organizePresencialGroups`)

| Antes | Depois |
|---|---|
| `presentMembers` inteiro (avaliadores + hosts) distribuído por menor grupo | Só `role === "avaliador"` distribuído, por prioridade de alvo (1 pra grupo de 3, 2 pra grupo de 4-5) |
| Grupos podiam sair com qualquer tamanho (limitado só por `maxGroups` da sala) | Grupos sempre 3-5, dentro do possível pela capacidade física da sala |

Sem mudança de schema — `group_evaluators`/`groups` continuam exatamente como estão
(migration `0014`); só o algoritmo que decide QUEM entra em cada um muda.
