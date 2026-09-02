# Data Model: Recomendações e Simulação de Grupos (Presencial + Online)

Nenhuma tabela nova, nenhuma migration (Constituição III não se aplica — só `SELECT` adicional
sobre coluna já existente, `rooms.size`, presente desde a FEAT-0011).

## Entidades (todas derivadas/calculadas — nada persistido além do que já existe)

### `GroupSummary.room` (existente, campo novo)

| Campo | Tipo | Origem |
|---|---|---|
| `id` | `string` (uuid) | já existia |
| `name` | `string` | já existia |
| `size` | `number` (int) | **novo** — `rooms.size`, já gravado desde a FEAT-0011, só passa a ser exposto |

Afeta toda resposta que usa `GroupSummarySchema`: `GET /groups`,
`POST /groups/organize/presencial`, `POST /groups/organize/online`,
`POST /groups/preview/presencial`, `POST /groups/preview/online` (novo).

### Diagnóstico de organização presencial (calculado, não persistido — vive só na resposta/UI da prévia)

| Campo (conceitual) | Descrição |
|---|---|
| Classificação por grupo | `"ideal" \| "aceitavel" \| "fora_do_ideal"`, de `classifyPresencialGroup(candidateCount, evaluatorCount)` (nova, `shared`) |
| Conformidade por sala | comparação entre hosts alocados na sala e `deriveRoomCapacity(room.size).hostCount` |
| Déficit de host | `{ required, deficit }` de `calculateHostDeficit(roomSizesUsados, hostsPresentes)` (nova, `shared`) |
| Sugestão de promoção | lista de até `deficit` avaliadores (role `"avaliador"`) participando da simulação — seleção de UI, D4 em `research.md` |

Todo esse bloco é recalculado a cada nova prévia (mudou quem participa, promoveu/rebaixou
host) — nunca fica desatualizado em relação ao `localGroups`/`preview.data` exibido (mesmo
padrão de recálculo já usado desde a FEAT-0021/0022).

### Painel de cenários de referência (US3, calculado — não persistido)

Lista de linhas `{ candidateCount, idealGroups, idealRooms, idealHosts, minEvaluators,
maxEvaluators }`, uma por contagem de referência (poucos/médio/muitos) mais a situação atual —
cada linha é a mesma pipeline já usada no bloco "quantidade ideal" existente
(`derivePresencialGroupCount` → `recommendRoomsForGroups` → `deriveEvaluatorTargetForGroupSize`),
só aplicada a mais de uma entrada.

### `PreviewOnlineResponse` (novo contrato)

| Campo | Tipo | Descrição |
|---|---|---|
| `groups` | `GroupSummary[]` | candidatos já divididos, `id` gerado na hora (nunca existiu no banco — mesmo padrão de `PreviewPresencialResponse`), `evaluators: []` sempre (FR-015) |

Sem `unallocatedCandidateCount` (online sempre aloca todo mundo) nem `availableEvaluators`
(avaliador não entra no cálculo automático do online).
