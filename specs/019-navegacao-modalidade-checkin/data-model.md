# Data Model: Navegação por modalidade + check-in dividido

Nenhuma tabela nova, nenhuma coluna nova, nenhuma migration. `attendance` já é totalmente
derivado (`candidate_applications.saturday_restriction`, D7) — esta feature só passa a usá-lo
também como condição de `WHERE`, além de campo de exibição.

## Contrato alterado: `ListCandidatesQuerySchema`

| Campo | Antes | Depois |
|---|---|---|
| `attendance` | não existe | `AttendanceSchema.optional()` — `"online"` \| `"presencial"` \| ausente (= todos, comportamento atual preservado) |

Resposta (`ListCandidatesResponseSchema`) sem mudança de shape — `totalCandidates` e
`attendanceSummary` continuam existindo, só passam a refletir o recorte quando `attendance`
é informado.

## Cache (`CachedListParams`, `api/src/lib/checkin-list-cache.ts`)

| Campo | Antes | Depois |
|---|---|---|
| `attendance` | não existe | `Attendance \| undefined` — entra na chave do KV (research.md, Decisão 2) |
