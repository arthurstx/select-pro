# Data Model: Simulação com aprovação, limpar organização e badges

Nenhuma tabela nova, nenhuma coluna nova. `group_evaluators` passa a receber também hosts (por
sala, research.md Decisão 1/2).

> **Emenda (2026-09-05):** esta seção afirmava originalmente "nenhuma migration" — errado. O
> `UNIQUE(user_id)` de `group_evaluators` (migration `0014`, pensado só para o self-service do
> avaliador ONLINE) bloqueava exatamente o padrão desta feature: o mesmo host em várias linhas
> (uma por grupo da sala). Toda sala com 2+ grupos e host quebrava `POST /groups/organize/
> presencial` com `SQLITE_CONSTRAINT_UNIQUE` → 500. Corrigido pela migration `0017-group-
> evaluators-drop-unique-user.sql`, que remove a constraint do schema; a invariante "uma
> pessoa, um grupo online por vez" passou a ser garantida pela aplicação
> (`GroupRepository.assignEvaluator`, `DELETE` + `INSERT` em vez de `ON CONFLICT`).

## Contratos alterados (`shared/src/schemas/group.schema.ts`)

| Schema | Campo novo | Fonte |
|---|---|---|
| `GroupCandidateSchema` | `gender: GenderSchema` | já existe em `candidates.gender`, só não era exposto aqui |
| `GroupEvaluatorSchema` | `memberStatus: MemberStatusSchema` | já existe em `member_profiles.status`, mesmo padrão de `EvaluatorSummarySchema` |

## Contratos novos

| Schema | Uso |
|---|---|
| `AvailableEvaluatorSchema` — `{ userId, name, memberStatus, role }` | Lista de avaliadores/hosts presentes, devolvida por `POST /groups/preview/presencial` |
| `PreviewPresencialResponseSchema` — `{ data: { groups: GroupSummary[], unallocatedCandidateCount, availableEvaluators: AvailableEvaluator[] } }` | Resposta da prévia |
| `OrganizePresencialBodySchema` — `{ evaluatorUserIds?: string[] }` | Request de `POST /groups/organize/presencial` (estendido) e `POST /groups/preview/presencial` |

## Relação nova: host↔sala (via `group_evaluators`, sem coluna nova)

| Antes | Depois |
|---|---|
| Host nunca aparecia em `group_evaluators` (FEAT-0020) | Host aparece em TODOS os grupos da mesma sala, com `role` derivado normalmente (`edition_hosts` JOIN, já existente) |
| `hostCount` de `deriveRoomCapacity` era só um número de referência | Continua sendo o TETO de quantos hosts uma sala recebe; a atribuição real de pessoas é nova (`distributeHostsToRooms`) |

## Sem mudança de state machine

Simulação/prévia não é persistida (spec.md, Key Entities) — puro cálculo por requisição, sem
rascunho salvo entre `preview` e `organize`.
