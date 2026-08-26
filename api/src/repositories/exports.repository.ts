import type { Course, Ethnicity, Gender, NewCandidateExportEvent, ReferralSource } from "shared";

/**
 * Filtros do recorte de exportação — mesmo vocabulário de
 * `DashboardRepository.listCandidates` (FEAT-0007), sem paginação: a
 * exportação sempre devolve o recorte inteiro.
 */
export interface ExportFilters {
    /** `undefined` = todas as edições. */
    processId?: string;
    search?: string;
    /** `AAAA-MM-DD`, inclusive. */
    from?: string;
    /** `AAAA-MM-DD`, inclusive até o fim do dia. */
    to?: string;
    /** Decide se `gender`/`ethnicity` entram na consulta — não filtra depois de ler (mesma postura de `dashboard.repository.metrics`). */
    includeSensitive: boolean;
}

export interface ExportCandidateRow {
    id: string;
    name: string;
    email: string;
    phone: string;
    course: Course;
    semester: number;
    created_at: string;
    process_label: string;
    referral_source: ReferralSource | null;
    referral_source_other: string | null;
    saturday_restriction: number | null;
    special_needs: number | null;
    /** Presente só quando `filters.includeSensitive`. */
    gender?: Gender;
    /** Presente só quando `filters.includeSensitive`. */
    ethnicity?: Ethnicity;
}

/** Escapa `%`/`_` antes de envolver o termo em wildcards — mesmo motivo de `dashboard.repository.ts`. */
function escapeLikeTerm(term: string): string {
    return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class ExportsRepository {
    constructor(private readonly db: D1Database) {}

    /**
     * Lê candidatos + questionário para exportação, sem `LIMIT`/`OFFSET` —
     * diferente de `dashboard.repository.listCandidates`, esta consulta
     * devolve o recorte inteiro de uma vez (spec, "Assumptions": sem
     * paginação no arquivo).
     */
    async listForExport(filters: ExportFilters): Promise<ExportCandidateRow[]> {
        const conditions: string[] = [];
        const bindings: unknown[] = [];

        if (filters.processId) {
            conditions.push("c.process_id = ?");
            bindings.push(filters.processId);
        }

        if (filters.search) {
            conditions.push("LOWER(c.name) LIKE ? ESCAPE '\\'");
            bindings.push(`%${escapeLikeTerm(filters.search.toLowerCase())}%`);
        }

        if (filters.from) {
            conditions.push("c.created_at >= ?");
            bindings.push(`${filters.from} 00:00:00`);
        }

        if (filters.to) {
            conditions.push("c.created_at <= ?");
            bindings.push(`${filters.to} 23:59:59`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Colunas sensíveis só entram na projeção quando pedidas — não são
        // lidas para depois serem descartadas (mesma postura de
        // `dashboard.repository.metrics`, `includeDemographics`).
        const sensitiveColumns = filters.includeSensitive ? "c.gender, c.ethnicity," : "";

        const { results } = await this.db
            .prepare(
                `SELECT c.id, c.name, c.email, c.phone, c.course, c.semester, c.created_at,
                        ${sensitiveColumns}
                        p.label AS process_label,
                        a.referral_source, a.referral_source_other,
                        a.saturday_restriction, a.special_needs
                   FROM candidates c
                   INNER JOIN selection_processes p ON p.id = c.process_id
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                   ${whereClause}
                  ORDER BY c.created_at ASC, c.id ASC`,
            )
            .bind(...bindings)
            .all<ExportCandidateRow>();

        return results ?? [];
    }

    /** `INSERT` simples — sem `ON CONFLICT`, não há conflito possível (id novo a cada chamada). */
    async recordExport(event: NewCandidateExportEvent): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO candidate_export_events
                    (id, actor_id, process_id, process_label, included_sensitive_fields, row_count)
                 VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                event.id,
                event.actor_id,
                event.process_id,
                event.process_label,
                event.included_sensitive_fields,
                event.row_count,
            )
            .run();
    }
}
