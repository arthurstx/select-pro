# Data Model: Exportação de candidatos em planilha (CSV)

## Migration 0012 — `candidate-export-events.sql` (aditiva, sem `MAINTENANCE_MODE`)

```sql
-- Nenhuma tabela existente é tocada — só CREATE TABLE + índices, mesma
-- classe de segurança da 0006 (checkin_events).

CREATE TABLE candidate_export_events (
  id                        TEXT PRIMARY KEY,
  actor_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- NULL = recorte "todas as edições". RESTRICT, não CASCADE: apagar uma
  -- edição não pode apagar em silêncio o registro de que ela foi exportada
  -- (mesma postura de candidate_checkins.checked_in_by, não de
  -- checkin_events.candidate_id — isto é trilha de compliance, não log de
  -- operação, e não há hoje nenhuma rota que apague selection_processes).
  process_id                TEXT REFERENCES selection_processes(id) ON DELETE RESTRICT,
  -- Snapshot do rótulo no momento da exportação ("2026.2" ou "Todas as
  -- edições") — o registro precisa continuar legível mesmo que o rótulo da
  -- edição mude depois.
  process_label             TEXT NOT NULL,
  included_sensitive_fields INTEGER NOT NULL CHECK (included_sensitive_fields IN (0, 1)),
  row_count                 INTEGER NOT NULL CHECK (row_count >= 0),
  created_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_candidate_export_events_actor      ON candidate_export_events(actor_id);
CREATE INDEX idx_candidate_export_events_created_at ON candidate_export_events(created_at);
```

Sem coluna de update — a tabela é append-only por construção: nenhum service, rota ou índice
desta feature expõe UPDATE/DELETE sobre ela (FR-007).

## `shared/src/schemas/database.schema.ts` (adições)

```ts
export interface CandidateExportEventRow {
    id: string;
    actor_id: string;
    process_id: string | null;
    process_label: string;
    included_sensitive_fields: number; // D1 devolve booleano como 0/1
    row_count: number;
    created_at: string;
}

export type NewCandidateExportEvent = Omit<CandidateExportEventRow, "created_at"> & {
    created_at?: string;
};
```

E adicionar `candidate_export_events: CandidateExportEventRow;` a `DatabaseSchema`.

## `shared/src/schemas/export.schema.ts` (novo arquivo)

```ts
import { z } from "zod";

import { ALL_EDITIONS, ProcessScopeSchema, isInvertedDateRange } from "./dashboard.schema";

/**
 * Mesmo vocabulário de recorte/filtro do dashboard (FEAT-0007): `process_id`
 * ausente = edição corrente, `all` = todas, `search`/`from`/`to` idênticos.
 * Sem paginação — a exportação sempre devolve o recorte inteiro (spec,
 * "Assumptions").
 */
export const ExportCandidatesQuerySchema = z
    .object({
        process_id: ProcessScopeSchema.optional(),
        search: z.string().trim().min(1).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD").optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD").optional(),
        /**
         * Opt-in explícito para gênero/etnia (spec, US2). Default `false`:
         * ausência do parâmetro nunca inclui campo sensível por acidente.
         */
        include_sensitive: z
            .enum(["true", "false"])
            .default("false")
            .transform((value) => value === "true"),
    })
    .superRefine((query, ctx) => {
        if (isInvertedDateRange(query)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["to"],
                message: "A data final não pode ser anterior à inicial",
            });
        }
    });
export type ExportCandidatesQuery = z.infer<typeof ExportCandidatesQuerySchema>;

export const ExportErrorCode = {
    SELECTION_PROCESS_NOT_FOUND: "SELECTION_PROCESS_NOT_FOUND",
} as const;
export type ExportErrorCode = (typeof ExportErrorCode)[keyof typeof ExportErrorCode];

/**
 * Colunas do CSV, em ordem — o contrato "de fato" desta feature (a resposta
 * é `text/csv`, não JSON validável por Zod). Cabeçalho em português, mesma
 * convenção de rótulo de `COURSE_LABELS`/`GENDER_LABELS` em
 * `candidate.schema.ts`.
 */
export const EXPORT_CSV_COLUMNS = [
    "id",
    "nome",
    "email",
    "telefone",
    "curso",
    "semestre",
    "edicao",
    "data_inscricao",
    "origem_divulgacao",
    "origem_divulgacao_outro",
    "restricao_sabado",
    "necessidades_especiais",
] as const;

/** Só entram no arquivo quando `include_sensitive=true` (spec, US2/FR-004). */
export const EXPORT_SENSITIVE_CSV_COLUMNS = ["genero", "etnia"] as const;
```

`ALL_EDITIONS`/`ProcessScopeSchema`/`isInvertedDateRange` já existem em `dashboard.schema.ts` e
são importados, não duplicados (Princípio I).

## `api/src/core/errors/export-errors.ts`

Vazio de erro próprio: `SELECTION_PROCESS_NOT_FOUND` (FR-008) já é
`SelectionProcessNotFoundError` em `api/src/core/errors/checkin-errors.ts` (FEAT-0007) — a rota
de export reaproveita a mesma classe, o mesmo `code`, em vez de uma segunda classe para o mesmo
erro de domínio.

## Contrato HTTP

| Rota | Auth | Query | Response |
|---|---|---|---|
| `GET /exports/candidates` | admin | `ExportCandidatesQuerySchema` | `200 text/csv` (`Content-Disposition: attachment`) / `404 SELECTION_PROCESS_NOT_FOUND` / `401`/`403` |

Detalhe em `contracts/export.md`.
