import {
    ALL_EDITIONS,
    COURSE_LABELS,
    ETHNICITY_LABELS,
    type ExportCandidatesQuery,
    EXPORT_CSV_COLUMNS,
    EXPORT_SENSITIVE_CSV_COLUMNS,
    GENDER_LABELS,
    type NewCandidateExportEvent,
    REFERRAL_SOURCE_LABELS,
    type SelectionProcessRow,
} from "shared";

import { type Either, left, right } from "../core/either";
import { NoActiveSelectionProcessError, SelectionProcessNotFoundError } from "../core/errors/checkin-errors";
import { toCsvRow } from "../lib/csv";
import { logger } from "../lib/logger";
import type { ExportCandidateRow, ExportsRepository } from "../repositories/exports.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type ScopeError = NoActiveSelectionProcessError | SelectionProcessNotFoundError;

/** Recorte já resolvido — mesma forma de `DashboardService`, não duplicando o vocabulário. */
type ResolvedScope = { kind: "edition"; process: SelectionProcessRow } | { kind: "all" };

export interface ExportResult {
    csv: string;
    rowCount: number;
    /** Para o nome do arquivo/cabeçalho `Content-Disposition` na rota. */
    scopeLabel: string;
}

/**
 * Exportação de candidatos em CSV (FEAT-0016).
 *
 * Duas decisões que espelham `DashboardService` de propósito (mesmo
 * domínio, mesmo vocabulário de recorte — FEAT-0007):
 *
 * - `include_sensitive` decide COLUNAS, tanto na consulta (repository)
 *   quanto no cabeçalho do CSV (aqui) — nunca lê e descarta depois.
 * - O registro de auditoria é gravado ANTES de devolver o CSV ao handler da
 *   rota (FR-009): se `recordExport` lançar, a exceção sobe sem ser
 *   capturada aqui — é falha técnica (INSERT falhou), não erro de domínio,
 *   então não vira `Either` (skill `error-handling`, "É uma falha
 *   TÉCNICA/INFRA? → throw"). O handler da rota nunca chega a escrever o
 *   corpo da resposta nesse caso.
 */
export class ExportsService {
    constructor(
        private readonly exports: ExportsRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    async export(
        query: ExportCandidatesQuery,
        actorId: string,
        now: Date = new Date(),
    ): Promise<Either<ScopeError, ExportResult>> {
        const scopeResult = await this.resolveScope(query.process_id, now);
        if (scopeResult.isLeft()) {
            return left(scopeResult.value);
        }
        const scope = scopeResult.value;

        const rows = await this.exports.listForExport({
            processId: scope.kind === "edition" ? scope.process.id : undefined,
            search: query.search,
            from: query.from,
            to: query.to,
            includeSensitive: query.include_sensitive,
        });

        const csv = this.toCsv(rows, query.include_sensitive);
        const scopeLabel = scope.kind === "edition" ? scope.process.label : "Todas as edições";

        const event: NewCandidateExportEvent = {
            id: crypto.randomUUID(),
            actor_id: actorId,
            process_id: scope.kind === "edition" ? scope.process.id : null,
            process_label: scopeLabel,
            included_sensitive_fields: query.include_sensitive ? 1 : 0,
            row_count: rows.length,
        };

        // Sem try/catch: falha aqui é infra (D1 fora do ar, constraint
        // inesperada) e deve derrubar a exportação inteira — o CSV nunca é
        // devolvido sem o registro correspondente (FR-009).
        await this.exports.recordExport(event);

        logger.info("exports.candidates.success", {
            actorId,
            scope: scopeLabel,
            includeSensitive: query.include_sensitive,
            rowCount: rows.length,
        });

        return right({ csv, rowCount: rows.length, scopeLabel });
    }

    private toCsv(rows: ExportCandidateRow[], includeSensitive: boolean): string {
        const columns: readonly string[] = includeSensitive
            ? [...EXPORT_CSV_COLUMNS, ...EXPORT_SENSITIVE_CSV_COLUMNS]
            : EXPORT_CSV_COLUMNS;

        let csv = toCsvRow(columns);

        for (const row of rows) {
            const baseFields = [
                row.id,
                row.name,
                row.email,
                row.phone,
                COURSE_LABELS[row.course],
                row.semester,
                row.process_label,
                row.created_at,
                row.referral_source ? REFERRAL_SOURCE_LABELS[row.referral_source] : "",
                row.referral_source_other,
                row.saturday_restriction ? "sim" : "não",
                row.special_needs ? "sim" : "não",
            ];

            const sensitiveFields = includeSensitive
                ? [row.gender ? GENDER_LABELS[row.gender] : "", row.ethnicity ? ETHNICITY_LABELS[row.ethnicity] : ""]
                : [];

            csv += toCsvRow([...baseFields, ...sensitiveFields]);
        }

        return csv;
    }

    /** Mesma lógica de `DashboardService.resolveScope` (FEAT-0007) — não duplicada por acidente, apenas não extraída para um lugar comum ainda. */
    private async resolveScope(processId: string | undefined, now: Date): Promise<Either<ScopeError, ResolvedScope>> {
        if (processId === ALL_EDITIONS) {
            return right({ kind: "all" });
        }

        if (processId) {
            const process = await this.processes.findById(processId);
            return process ? right({ kind: "edition", process }) : left(new SelectionProcessNotFoundError());
        }

        try {
            const process = await this.processes.resolveCurrent(now);
            return right({ kind: "edition", process });
        } catch (err) {
            logger.error("exports.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}
