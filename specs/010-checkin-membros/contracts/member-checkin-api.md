# Contract: API de check-in de membros

Roteador novo `member-checkin.routes.ts`, montado em paralelo a `checkinRouter`
(candidatos) — mesmo `AuthEnv`, mesmo padrão `createRoute` + `@hono/zod-openapi`.
Autorização: `requireAuth` + `requireRole(ROLES.ADMIN)` (mais restrito que o check-in de
candidato — ver research.md D5).

## `GET /member-checkins`

Lista avaliadores/hosts da edição corrente com estado de presença. Sem paginação nem query
params (escala de dezenas — ver Technical Context do plan.md).

**200**
```json
{
  "data": {
    "process": { "id": "uuid", "label": "2026.2" },
    "items": [
      {
        "userId": "uuid",
        "name": "Fulana Silva",
        "email": "fulana@exemplo.com",
        "role": "avaliador",
        "checkedInAt": null
      },
      {
        "userId": "uuid",
        "name": "Beltrano Souza",
        "email": "beltrano@exemplo.com",
        "role": "host",
        "checkedInAt": "2026-08-29T13:05:00.000Z"
      }
    ],
    "summary": { "total": 2, "checkedIn": 1 }
  }
}
```

**409** `NO_ACTIVE_SELECTION_PROCESS` — sem edição corrente (FR-008).
**409** `NO_EVALUATORS_IN_EDITION` — edição corrente sem nenhum avaliador/host atribuído
(FR-009; distinto do erro acima, conforme Edge Cases da spec).
**401/403** — mesmo padrão de erro de autenticação/autorização já usado em `checkin.routes.ts`.

## `PUT /member-checkins/{userId}/checkin`

Marca presença. Idempotente: marcar duas vezes não gera segundo evento nem erro (mesma
garantia de `PUT /candidates/{id}/checkin`).

**200**
```json
{ "data": { "userId": "uuid", "checkedInAt": "2026-08-29T13:05:00.000Z" } }
```

**400** `id` (path) não é UUID válido.
**404** `EVALUATOR_NOT_FOUND` — `userId` não corresponde a avaliador/host com conta ativa na
edição corrente (mesmo código já usado pela FEAT-0009 em `EvaluatorErrorCode`).
**409** `NO_ACTIVE_SELECTION_PROCESS`.

## `DELETE /member-checkins/{userId}/checkin`

Desmarca presença. Idempotente: desmarcar quem já está ausente é no-op, `204` de qualquer
forma (mesma garantia de `DELETE /candidates/{id}/checkin`).

**204** — presença desmarcada (ou já estava).
**400** `id` (path) não é UUID válido.
**404** `EVALUATOR_NOT_FOUND`.
**409** `NO_ACTIVE_SELECTION_PROCESS`.

---

# Contract: alteração em `GET /candidates` (check-in de candidatos)

Sem mudança de rota — só o shape do item da listagem ganha um campo (US3/FR-010/FR-011).

## Antes → depois de `CandidateCheckinItem`

```diff
 {
   "id": "uuid",
   "name": "...",
   "email": "...",
   "phone": "...",
   "course": "...",
   "semester": 3,
-  "checkedInAt": "2026-08-29T13:00:00.000Z"
+  "checkedInAt": "2026-08-29T13:00:00.000Z",
+  "attendance": "online"
 }
```

`attendance`: `"online" | "presencial" | null`. `null` sempre que `checkedInAt` também for
`null` (candidato ausente não tem modalidade — Edge Cases da spec). Regra: `saturday_restriction
= true` → `"online"`; caso contrário → `"presencial"`.

## `ListCandidatesResponse.data` ganha resumo agregado

```diff
 {
   "process": { ... },
   "items": [ ... ],
+  "attendanceSummary": { "online": 3, "presencial": 12 },
   "pagination": { ... }
 }
```

`attendanceSummary` soma sobre **todo o conjunto filtrado** (busca/status/curso aplicados),
não só a página atual — mesma semântica de `pagination.total`, que já é calculado por uma
query de `COUNT(*)` separada da página (`CheckinRepository.listCandidates`). Consistente com
FR-011 ("mostrar, para os candidatos presentes, quantos são online e quantos são
presenciais").
