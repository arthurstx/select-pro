# Contrato: organização e alocação independentes do prosel online

Schemas em `shared/src/schemas/group.schema.ts` (sem novo arquivo — mesmo domínio da
FEAT-0012). Router `group.routes.ts` continua montado em `/groups`,
`[requireAuth, requireRole(ROLES.ADMIN)]` nas rotas administrativas; as duas rotas novas de
self-service exigem só sessão autenticada com papel `avaliador` (`requireRole(ROLES.AVALIADOR)`).

## Rotas alteradas

### `POST /groups/organize` → dividida em duas

- **`POST /groups/organize/presencial`** (admin) — mesmo comportamento de hoje
  (`POST /groups/organize`), mas só afeta grupos `modality: "presencial"`. Response:
  `OrganizeResultResponseSchema`, `data.groups` contém **só os grupos presenciais** (não a
  edição inteira — um grupo online de uma organização independente não aparece aqui; ver
  `GET /groups` para o total).
- **`POST /groups/organize/online`** (admin) — só separa candidatos presentes online em
  grupos (D1), sem sala nem avaliador. Response: mesmo `OrganizeResultResponseSchema`,
  `data.groups` contém **só os grupos online**, `unallocatedCandidateCount` sempre `0`
  (online nunca tem limite de capacidade — já era assim antes).
  - `409 NO_CANDIDATES_PRESENT` — sem candidato online presente.
  - Sem `NO_ROOMS_AVAILABLE` — não se aplica a online.

### `PATCH /groups/{groupId}/evaluators/{userId}` — sem mudança

Continua exatamente como hoje: exige que o avaliador já esteja em algum grupo
(`404 EVALUATOR_NOT_ALLOCATED` se não estiver), devolve o par origem/destino
(`MoveResultResponseSchema`). Serve para mover alguém já alocado — presencial↔presencial, ou
online↔online quando o avaliador já entrou por conta própria e o admin corrige depois.

## Rotas novas

### `POST /groups/online/{groupId}/join` (self-service, avaliador)

Sem body. O avaliador autenticado se junta ao grupo `groupId` — se já estiver em outro grupo
(presencial ou online), é movido (FR-004, garantido pelo `UNIQUE(user_id)` de
`group_evaluators`, research.md Decisão 3). Recusa se `groupId` não for `modality: "online"`.

- `200` `{ data: GroupSummarySchema }` — só o grupo de destino (não um par — pode não ter
  existido grupo de origem).
- `401` sem sessão.
- `403` não é avaliador (nem admin — esta rota não é admin-only, é avaliador-only).
- `404` `GROUP_NOT_FOUND`.
- `409` `GROUP_MODALITY_MISMATCH` — grupo de destino não é online.

### `PUT /groups/online/{groupId}/evaluators/{userId}` (admin, US3 — atribuição manual)

Mesmo mecanismo do `join`, mas o admin escolhe o `userId` em vez de ser o próprio usuário
autenticado. Mesmas respostas do `join` (200 com um grupo só, 404, 409), mais `403` se quem
chama não for admin.

### `DELETE /groups/online/me` (self-service, avaliador)

Remove o avaliador autenticado do grupo online em que estiver (FR-005). Sem parâmetro — um
avaliador só pode estar em um grupo online por vez (FR-004), então não há ambiguidade de qual
grupo.

- `204` — saiu com sucesso.
- `401` sem sessão.
- `403` não é avaliador.
- `404` `EVALUATOR_NOT_ALLOCATED` — não estava em nenhum grupo online.

## Rotas sem mudança

`GET /groups`, `PATCH /groups/{groupId}/candidates/{candidateId}` — mesmo contrato de hoje.
`GET /evaluations`/`PUT /evaluations/{candidateId}` (FEAT-0013) — sem nenhuma mudança
(research.md, Decisão 6).
