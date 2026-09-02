# Contrato: Avaliadores e hosts

Schemas em `shared/src/schemas/evaluator.schema.ts`.

## `GET /evaluators`

Query: `role` (`all` | `avaliador` | `host`, default `all`).

1. Resolve a edição corrente via `SelectionProcessRepository.resolveCurrent()`. Se não houver
   (FR-008), `409 NO_ACTIVE_SELECTION_PROCESS` (reaproveita `CheckinErrorCode`, R3).
2. Lista `users` com `role_id = 'avaliador'` e `deactivated_at IS NULL` (R5), com o cargo na
   edição corrente anotado via `LEFT JOIN edition_hosts` (host se existir linha, avaliador se não).
3. Filtra em memória pelo `role` pedido (R4).

`200` `EvaluatorListResponseSchema`.

## `PUT /evaluators/:userId/role`

Body `SetEvaluatorRoleSchema` (`{ role: "avaliador" | "host" }`).

1. Resolve a edição corrente (mesmo passo 1 acima).
2. `role: "host"` → `INSERT OR IGNORE INTO edition_hosts (id, process_id, user_id) VALUES (...)`.
3. `role: "avaliador"` → `DELETE FROM edition_hosts WHERE process_id = ? AND user_id = ?`.
4. Responde `200` com o `EvaluatorSummarySchema` atualizado daquela pessoa.

Idempotente nos dois sentidos — marcar host quem já é host, ou avaliador quem já é avaliador,
não é erro (FR-003 não distingue "trocar" de "confirmar o que já é").
