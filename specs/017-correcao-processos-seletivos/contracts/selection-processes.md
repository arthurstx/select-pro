# Contrato: Correção de processos seletivos

Schemas novos em `shared/src/schemas/selection-process-admin.schema.ts`. Router
`selection-process.routes.ts` montado em `/selection-processes`,
`[requireAuth, requireRole(ROLES.ADMIN)]` em toda rota (FR-006 — só admin).

Nome do arquivo/rota com sufixo `-admin` no schema (não no path) para não colidir com
`SelectionProcessSummarySchema` já existente em `checkin.schema.ts` (`{id, label}`, usada no
seletor de edição do dashboard) — esta feature precisa de um shape mais completo
(`starts_at`/`ends_at` inclusos), então ganha nome próprio em vez de estender o existente e
arriscar quebrar quem já consome o schema antigo.

## `GET /selection-processes`

Lista todos os processos seletivos já criados, sem paginação (mesma classe de volume que
`rooms` — dezenas, não centenas), ordenados por `starts_at DESC` (FR-001, já é o
comportamento de `SelectionProcessRepository.listAll()`).

- `200` `SelectionProcessAdminListResponseSchema` — `{ data: SelectionProcessAdminSummary[] }`,
  cada item com `id`, `label`, `starts_at`, `ends_at`.
- `401` sem sessão
- `403` não é admin

## `PUT /selection-processes/{id}`

Body `UpdateSelectionProcessAdminSchema` — `label`, `starts_at`, `ends_at`, os três
obrigatórios e substituídos juntos (research.md, Decisão 2). `starts_at < ends_at` validado
no próprio schema via `.superRefine` (FR-003, research.md Decisão 3) — falha aqui nunca chega
ao service.

- `200` `SelectionProcessAdminResponseSchema` — `{ data: SelectionProcessAdminSummary }`
- `400` payload inválido (campo ausente, `starts_at >= ends_at`) — Zod barra antes do banco
- `401` sem sessão
- `403` não é admin
- `404` `SELECTION_PROCESS_NOT_FOUND` (FR-005)
- `409` `SELECTION_PROCESS_LABEL_ALREADY_EXISTS` (FR-004 — outro processo já usa o `label`
  pedido; research.md Decisão 4)
