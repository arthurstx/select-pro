import type { Course, Ethnicity, Gender, ReferralSource } from "shared";

/**
 * Leitura agregada de `candidates` + `candidate_applications` para o
 * dashboard de inscrições (FEAT-0007). Nenhuma escrita, nenhuma tabela nova.
 *
 * Duas notas de custo, ambas do plano Free do Worker:
 *
 * - As agregações são vários `GROUP BY` sobre a mesma base, disparados num
 *   `db.batch` só. O tempo é I/O do D1, que não conta contra o teto de 10ms
 *   de CPU.
 * - O que elas consomem é a cota de LINHAS LIDAS do D1. Daí o cache de 60s
 *   na camada de cima (`dashboard-cache.ts`): sem ele, cada F5 revarre a base.
 */

/** Uma linha por (valor, edição). O rollup para "soma" acontece no service. */
export interface DistributionRow {
    key: string | number;
    process_id: string;
    count: number;
}

export interface DashboardTotalsRow {
    candidates: number;
    courses_represented: number;
    special_needs: number;
    saturday_restriction: number;
}

export interface DashboardMetricsRows {
    totals: DashboardTotalsRow;
    byCourse: DistributionRow[];
    bySemester: DistributionRow[];
    byReferralSource: DistributionRow[];
    /** `key` é a data (`AAAA-MM-DD`) — não é dado demográfico, então vai para todo papel. */
    byDay: DistributionRow[];
    /** Ausentes quando o papel não é `admin` — as consultas nem chegam a ser enviadas. */
    byGender?: DistributionRow[];
    byEthnicity?: DistributionRow[];
}

/** Linha da listagem — sem demografia e sem os textos longos (FEAT-0007, seção 8.1). */
export interface DashboardCandidateRow {
    id: string;
    name: string;
    email: string;
    phone: string;
    course: Course;
    semester: number;
    created_at: string;
    process_id: string;
    process_label: string;
}

export interface DashboardCandidateDetailRow extends DashboardCandidateRow {
    /** `null` só em dado corrompido: a inscrição é gravada no mesmo `db.batch` do candidato. */
    referral_source: ReferralSource | null;
    referral_source_other: string | null;
    experience: string | null;
    motivation: string | null;
    /** O D1 devolve booleano como `0`/`1`. */
    saturday_restriction: number | null;
    special_needs: number | null;
    /**
     * `null` quando `special_needs = 0`, ou quando `1` mas o candidato é anterior à FEAT-0014
     * (legado, sem descrição gravada). Lida sempre — não é condicional a
     * `includeDemographics`, que só governa `gender`/`ethnicity` abaixo.
     */
    special_needs_description: string | null;
    /** Presentes apenas quando `includeDemographics` — ver `findDetail`. */
    gender?: Gender;
    ethnicity?: Ethnicity;
}

export interface ListCandidatesFilters {
    /** `undefined` = todas as edições (`process_id=all`). */
    processId?: string;
    search?: string;
    /** `AAAA-MM-DD`, inclusive. */
    from?: string;
    /** `AAAA-MM-DD`, inclusive até o fim do dia. */
    to?: string;
    page: number;
    perPage: number;
    /** `recent` = mais nova primeiro (default de sempre); `oldest` inverte. */
    sort: "recent" | "oldest";
}

/** Escapa `%`/`_` antes de envolver o termo em wildcards — sem isso, buscar por "50%" vira "tudo". */
function escapeLikeTerm(term: string): string {
    return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class DashboardRepository {
    constructor(private readonly db: D1Database) {}

    // ------------------------------------------------------------
    // Métricas (FEAT-0007, seção 4.2)
    // ------------------------------------------------------------

    /**
     * Totais e distribuições num `db.batch` só.
     *
     * `includeDemographics === false` não filtra o resultado: as duas
     * consultas simplesmente não entram no batch. O dado restrito não chega a
     * ser lido, então não há de onde vazar — nem por log, nem por um `map`
     * distraído lá na frente.
     *
     * Todas as distribuições agrupam TAMBÉM por `process_id`, inclusive no
     * modo `sum`. Isso dá as duas formas de resposta a partir de uma consulta
     * só; somar por chave no service é trivial, e um segundo caminho de SQL
     * seria mais uma chance de os dois divergirem.
     */
    async metrics(processId: string | undefined, includeDemographics: boolean): Promise<DashboardMetricsRows> {
        const scope = processId ? { clause: "WHERE c.process_id = ?", bindings: [processId] } : { clause: "", bindings: [] };

        // `LEFT JOIN` de propósito: um candidato sem questionário ainda é um
        // inscrito, e um `INNER JOIN` faria o número do topo da tela mentir
        // para menos sem que ninguém percebesse.
        const totalsStatement = this.db
            .prepare(
                `SELECT COUNT(*) AS candidates,
                        COUNT(DISTINCT c.course) AS courses_represented,
                        COALESCE(SUM(CASE WHEN a.special_needs = 1 THEN 1 ELSE 0 END), 0) AS special_needs,
                        COALESCE(SUM(CASE WHEN a.saturday_restriction = 1 THEN 1 ELSE 0 END), 0) AS saturday_restriction
                   FROM candidates c
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                   ${scope.clause}`,
            )
            .bind(...scope.bindings);

        const statements = [
            totalsStatement,
            this.distributionStatement("c.course", scope),
            this.distributionStatement("c.semester", scope),
            // `INNER JOIN` aqui, ao contrário dos totais: candidato sem
            // questionário não tem origem de divulgação para distribuir.
            this.distributionStatement("a.referral_source", scope, {
                join: "INNER JOIN candidate_applications a ON a.candidate_id = c.id",
            }),
            // `SUBSTR` em vez de `date(...)`: `created_at` já é
            // `"AAAA-MM-DD HH:MM:SS"` (CURRENT_TIMESTAMP do D1), então cortar
            // os 10 primeiros caracteres é mais barato que fazer o SQLite
            // reanalisar a string como data.
            this.distributionStatement("SUBSTR(c.created_at, 1, 10)", scope),
        ];

        if (includeDemographics) {
            statements.push(this.distributionStatement("c.gender", scope), this.distributionStatement("c.ethnicity", scope));
        }

        const results = await this.db.batch<unknown>(statements);
        const rowsAt = (index: number) => (results[index]?.results ?? []) as DistributionRow[];

        return {
            totals: ((results[0]?.results?.[0] as DashboardTotalsRow | undefined) ?? {
                candidates: 0,
                courses_represented: 0,
                special_needs: 0,
                saturday_restriction: 0,
            }),
            byCourse: rowsAt(1),
            bySemester: rowsAt(2),
            byReferralSource: rowsAt(3),
            byDay: rowsAt(4),
            byGender: includeDemographics ? rowsAt(5) : undefined,
            byEthnicity: includeDemographics ? rowsAt(6) : undefined,
        };
    }

    /**
     * `column` NUNCA vem do cliente — são as seis constantes literais acima.
     * Interpolar aqui é seguro por isso, e não abre exceção à regra de sempre
     * usar `.bind()` para valores (`api/.agents/architecture/SKILL.md`).
     */
    private distributionStatement(
        column: string,
        scope: { clause: string; bindings: unknown[] },
        options: { join?: string } = {},
    ): D1PreparedStatement {
        return this.db
            .prepare(
                `SELECT ${column} AS key, c.process_id AS process_id, COUNT(*) AS count
                   FROM candidates c
                   ${options.join ?? ""}
                   ${scope.clause}
                  GROUP BY ${column}, c.process_id`,
            )
            .bind(...scope.bindings);
    }

    // ------------------------------------------------------------
    // Listagem (FEAT-0007, seção 4.3)
    // ------------------------------------------------------------

    /**
     * Busca, intervalo de data e paginação na MESMA consulta — filtrar depois,
     * sobre uma página já recortada, faria `total` mentir.
     *
     * `ORDER BY c.created_at DESC` (o default, `sort: "recent"`) é o inverso
     * do check-in, que ordena `ASC`. Mesma coluna, perguntas opostas: lá é a
     * fila de quem chegou, aqui é o que aconteceu por último — `sort:
     * "oldest"` inverte isso sob pedido da UI. O `id` desempata sempre `ASC`,
     * nas duas direções: só precisa ser consistente para a paginação não
     * repetir linha quando dois cadastros caem no mesmo segundo, não
     * precisa acompanhar a direção da data.
     */
    async listCandidates(filters: ListCandidatesFilters): Promise<{ items: DashboardCandidateRow[]; total: number }> {
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

        // `created_at` é `"AAAA-MM-DD HH:MM:SS"` (CURRENT_TIMESTAMP do D1, sem
        // fração de segundo), então a comparação de string ordena igual à
        // data. O `23:59:59` é o que torna `to` inclusive — sem ele, filtrar
        // "de 12/08 a 12/08" não devolveria nada.
        if (filters.from) {
            conditions.push("c.created_at >= ?");
            bindings.push(`${filters.from} 00:00:00`);
        }

        if (filters.to) {
            conditions.push("c.created_at <= ?");
            bindings.push(`${filters.to} 23:59:59`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const fromClause = `FROM candidates c
                            INNER JOIN selection_processes p ON p.id = c.process_id`;

        // `filters.sort` chega tipado (`"recent" | "oldest"`), já validado pelo
        // Zod na rota — nunca uma string arbitrária do cliente. Interpolar
        // aqui é seguro pela mesma razão de `distributionStatement` acima.
        const direction = filters.sort === "oldest" ? "ASC" : "DESC";

        const listStatement = this.db
            .prepare(
                `SELECT c.id, c.name, c.email, c.phone, c.course, c.semester, c.created_at,
                        p.id AS process_id, p.label AS process_label
                   ${fromClause}
                   ${whereClause}
                  ORDER BY c.created_at ${direction}, c.id ASC
                  LIMIT ? OFFSET ?`,
            )
            .bind(...bindings, filters.perPage, (filters.page - 1) * filters.perPage);

        const countStatement = this.db
            .prepare(`SELECT COUNT(*) AS total ${fromClause} ${whereClause}`)
            .bind(...bindings);

        const [listResult, countResult] = await this.db.batch<DashboardCandidateRow | { total: number }>([
            listStatement,
            countStatement,
        ]);

        return {
            items: (listResult.results ?? []) as DashboardCandidateRow[],
            total: (countResult.results?.[0] as { total: number } | undefined)?.total ?? 0,
        };
    }

    // ------------------------------------------------------------
    // Detalhe (FEAT-0007, seção 4.4)
    // ------------------------------------------------------------

    /**
     * Sem recorte de edição: um id identifica uma inscrição específica, e a
     * edição dela vem no corpo. Abrir alguém de 2026.1 com a tela em 2026.2 é
     * legítimo, e acontece na visão "todas as edições".
     *
     * `includeDemographics` decide as COLUNAS lidas, não o que é filtrado
     * depois — mesma postura da agregação acima.
     */
    async findDetail(id: string, includeDemographics: boolean): Promise<DashboardCandidateDetailRow | null> {
        const demographicColumns = includeDemographics ? "c.gender, c.ethnicity," : "";

        return this.db
            .prepare(
                `SELECT c.id, c.name, c.email, c.phone, c.course, c.semester, c.created_at,
                        ${demographicColumns}
                        p.id AS process_id, p.label AS process_label,
                        a.referral_source, a.referral_source_other, a.experience, a.motivation,
                        a.saturday_restriction, a.special_needs, a.special_needs_description
                   FROM candidates c
                   INNER JOIN selection_processes p ON p.id = c.process_id
                   LEFT JOIN candidate_applications a ON a.candidate_id = c.id
                  WHERE c.id = ?`,
            )
            .bind(id)
            .first<DashboardCandidateDetailRow>();
    }
}
