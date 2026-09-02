# Contrato: prévia, aprovação e limpeza da organização presencial

Schemas em `shared/src/schemas/group.schema.ts`. Router `group.routes.ts`, `/groups`,
`ADMIN_ONLY` em toda rota desta feature.

## `POST /groups/organize/presencial` — corpo novo (opcional), comportamento estendido

Body opcional: `OrganizePresencialBodySchema` — `{ evaluatorUserIds?: string[] }`. Ausente =
todos os avaliadores presentes (comportamento de hoje). Quando informado, só os avaliadores
listados entram no cálculo de avaliador-por-grupo — hosts presentes continuam sendo usados
automaticamente pra preencher as salas (research.md, Decisão 4).

Response sem mudança de shape (`OrganizeResultResponseSchema`), mas `data.groups[].evaluators`
agora pode incluir hosts (um por sala, replicado nos grupos dela — research.md, Decisão 1/2) —
antes só avaliadores apareciam aí desde a FEAT-0020.

## `POST /groups/preview/presencial` (NOVO)

Mesmo body de `.../organize/presencial`. NÃO persiste nada.

- `200` `PreviewPresencialResponseSchema` — `{ data: { groups: GroupSummary[],
  unallocatedCandidateCount, availableEvaluators: AvailableEvaluator[] } }`. `groups[].id` é
  gerado na hora (não existe no banco) — só serve pra `key` de lista no front.
- `401`/`403` — mesmo padrão das demais rotas admin-only.
- `409 NO_CANDIDATES_PRESENT` — sem candidato presencial presente.

## `DELETE /groups/presencial` (NOVO)

Sem body. Remove toda a organização presencial da edição corrente (candidatos, avaliadores e
hosts perdem a associação) — nunca afeta grupos online.

- `204` — limpo com sucesso, mesmo se já não havia nada pra limpar (idempotente).
- `401`/`403` — mesmo padrão.
- `409 NO_ACTIVE_SELECTION_PROCESS` — sem processo corrente.

## Sem mudança

`GET /groups`, `POST /groups/organize/online`, `PATCH .../candidates/{id}`, `PATCH
.../evaluators/{id}`, `POST /groups/online/{id}/join`, `DELETE /groups/online/me`, `PUT
/groups/online/{id}/evaluators/{userId}` — nenhuma dessas rotas muda.
