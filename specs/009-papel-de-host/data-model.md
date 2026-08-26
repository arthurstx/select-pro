# Data Model: Papel de host por edição

## Migration 0010 — `edition-hosts.sql` (aditiva, sem `MAINTENANCE_MODE`)

```sql
CREATE TABLE edition_hosts (
  id         TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  UNIQUE (process_id, user_id)
);

CREATE INDEX idx_edition_hosts_process ON edition_hosts(process_id);
CREATE INDEX idx_edition_hosts_user ON edition_hosts(user_id);
```

A existência da linha `(process_id, user_id)` **é** o fato de ser host naquela edição (R1) —
sem coluna de estado. Tabela nova, sem risco: nenhum código a referencia ainda.

## `shared/src/schemas/evaluator.schema.ts` (novo arquivo)

```ts
export const EvaluatorRoleSchema = z.enum(["avaliador", "host"]);
export type EvaluatorRole = z.infer<typeof EvaluatorRoleSchema>;

export const EvaluatorRoleFilterSchema = z.enum(["all", "avaliador", "host"]).default("all");

export const SetEvaluatorRoleSchema = z.object({
    role: EvaluatorRoleSchema,
});
export type SetEvaluatorRoleDTO = z.infer<typeof SetEvaluatorRoleSchema>;

export const EvaluatorSummarySchema = z.object({
    userId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    memberStatus: MemberStatusSchema, // de member.schema.ts — FR-002
    role: EvaluatorRoleSchema,
});
export type EvaluatorSummary = z.infer<typeof EvaluatorSummarySchema>;

export const EvaluatorListResponseSchema = z.object({
    data: z.array(EvaluatorSummarySchema),
});
```

Nenhum `EvaluatorErrorCode` próprio — reaproveita `CheckinErrorCode.NO_ACTIVE_SELECTION_PROCESS` (R3).

## Contrato HTTP

Router `evaluators.routes.ts`, montado em `/evaluators`, `[requireAuth,
requireRole(ROLES.ADMIN)]` em toda rota (FR-007).

| Rota | Request | Response |
|---|---|---|
| `GET /evaluators?role=all\|avaliador\|host` | — | `200` `EvaluatorListResponseSchema` / `409 NO_ACTIVE_SELECTION_PROCESS` (FR-008) |
| `PUT /evaluators/:userId/role` | `SetEvaluatorRoleSchema` | `200` `EvaluatorSummarySchema` atualizado / `409 NO_ACTIVE_SELECTION_PROCESS` |

`PUT .../role` com `{ role: "host" }` faz `INSERT OR IGNORE` em `edition_hosts` (idempotente —
marcar host quem já é host não é erro); com `{ role: "avaliador" }` faz `DELETE`.
