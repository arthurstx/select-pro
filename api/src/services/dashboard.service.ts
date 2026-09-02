import {
    ALL_EDITIONS,
    type CandidateDetail,
    CourseSchema,
    type DashboardCandidateItem,
    type DashboardCandidatesQuery,
    type DashboardMetrics,
    type DashboardMetricsQuery,
    type DashboardScope,
    type EditionCount,
    type PaginationMeta,
    ROLES,
    type SelectionProcessRow,
    type SelectionProcessSummary,
} from "shared";

import { type Either, left, right } from "../core/either";
import {
    CandidateNotFoundError,
    NoActiveSelectionProcessError,
    SelectionProcessNotFoundError,
} from "../core/errors/checkin-errors";
import type { DashboardCache } from "../lib/dashboard-cache";
import { logger } from "../lib/logger";
import type { DistributionRow } from "../repositories/dashboard.repository";
import type { DashboardRepository } from "../repositories/dashboard.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type ScopeError = NoActiveSelectionProcessError | SelectionProcessNotFoundError;

/** Recorte já resolvido: `process` presente identifica a edição; ausente é "todas". */
type ResolvedScope = { kind: "edition"; process: SelectionProcessRow } | { kind: "all" };

type ListResult = { items: DashboardCandidateItem[]; pagination: PaginationMeta };

type EditionsResult = { editions: SelectionProcessSummary[]; current: SelectionProcessSummary };

/** Item de distribuição antes de virar resposta — mesma forma, sem o schema por perto. */
type DistributionItem<K extends string | number = string | number> = {
    key: K;
    count: number;
    byEdition?: EditionCount[];
};

/**
 * Dashboard de inscrições (FEAT-0007).
 *
 * **O corte por papel vive aqui**, montando corpos diferentes para `admin` e
 * `avaliador` — não no front. Esconder o gráfico no cliente enquanto a API
 * entrega o dado a qualquer avaliador não é privacidade, é maquiagem: basta
 * abrir o DevTools para ler a etnia de todo mundo.
 *
 * Os campos restritos saem AUSENTES, nunca vazios nem nulos. Array vazio
 * significa "não há dado"; ausência significa "não é para você" — e é o que
 * permite a UI reagir à forma do payload sem conhecer papéis.
 */
export class DashboardService {
    constructor(
        private readonly dashboard: DashboardRepository,
        private readonly processes: SelectionProcessRepository,
        /** Opcional pelo mesmo motivo de `CheckinService`: sem KV, o service age como cache sempre frio. */
        private readonly cache?: DashboardCache,
    ) {}

    // ------------------------------------------------------------
    // Métricas
    // ------------------------------------------------------------

    async metrics(
        query: DashboardMetricsQuery,
        role: string,
        now: Date = new Date(),
    ): Promise<Either<ScopeError, DashboardMetrics>> {
        const scopeResult = await this.resolveScope(query.process_id, now);
        if (scopeResult.isLeft()) {
            return left(scopeResult.value);
        }
        const scope = scopeResult.value;

        const includeDemographics = role === ROLES.ADMIN;
        // `by_edition` só muda algo com "todas as edições": numa edição só, a
        // quebra por edição É a soma, e o parâmetro é ignorado.
        const byEdition = query.mode === "by_edition" && scope.kind === "all";

        const cacheKey = this.keyFor("metrics", role, [this.scopeKey(scope), byEdition ? "by_edition" : "sum"]);
        const cached = await this.cache?.get<DashboardMetrics>(cacheKey);
        if (cached) {
            return right(cached);
        }

        const rows = await this.dashboard.metrics(
            scope.kind === "edition" ? scope.process.id : undefined,
            includeDemographics,
        );

        // Só quando o comparativo pede: fora disso ninguém precisa dos rótulos das edições.
        const editions = byEdition ? await this.processes.listAll() : [];

        const metrics: DashboardMetrics = {
            scope: this.publicScope(scope),
            totals: {
                candidates: rows.totals.candidates,
                coursesRepresented: rows.totals.courses_represented,
                /** O denominador de "8 de 8" — o enum é a fonte, não uma constante solta. */
                coursesTotal: CourseSchema.options.length,
                specialNeeds: rows.totals.special_needs,
                saturdayRestriction: rows.totals.saturday_restriction,
            },
            byCourse: rollup(rows.byCourse, editions, byEdition),
            bySemester: rollup(rows.bySemester, editions, byEdition),
            byReferralSource: rollup(rows.byReferralSource, editions, byEdition),
            byDay: rollupDaily(rows.byDay, editions, byEdition),
            // Espalhados condicionalmente, e não atribuídos como `undefined`:
            // `{ byGender: undefined }` ainda TEM a chave, e só some no
            // `JSON.stringify` — a ausência ficaria por conta do serializador.
            // Aqui ela é real, e um teste de unidade consegue afirmá-la.
            //
            // E nunca `[]`: a UI desenharia um gráfico zerado, e ninguém
            // perceberia que a restrição quebrou.
            ...(rows.byGender ? { byGender: rollup(rows.byGender, editions, byEdition) } : {}),
            ...(rows.byEthnicity ? { byEthnicity: rollup(rows.byEthnicity, editions, byEdition) } : {}),
        };

        await this.cache?.set(cacheKey, metrics);

        return right(metrics);
    }

    // ------------------------------------------------------------
    // Listagem
    // ------------------------------------------------------------

    async listCandidates(
        query: DashboardCandidatesQuery,
        role: string,
        now: Date = new Date(),
    ): Promise<Either<ScopeError, ListResult>> {
        const scopeResult = await this.resolveScope(query.process_id, now);
        if (scopeResult.isLeft()) {
            return left(scopeResult.value);
        }
        const scope = scopeResult.value;

        const cacheKey = this.keyFor("candidates", role, [
            this.scopeKey(scope),
            String(query.page),
            String(query.per_page),
            query.search?.trim().toLowerCase() ?? "",
            query.from ?? "",
            query.to ?? "",
            query.sort,
            // FEAT-0015 — precisa estar na chave, senão cursos diferentes
            // reaproveitariam a mesma entrada de cache um do outro.
            query.course ?? "",
        ]);

        const cached = await this.cache?.get<ListResult>(cacheKey);
        if (cached) {
            return right(cached);
        }

        const { items, total } = await this.dashboard.listCandidates({
            processId: scope.kind === "edition" ? scope.process.id : undefined,
            search: query.search,
            from: query.from,
            to: query.to,
            page: query.page,
            perPage: query.per_page,
            sort: query.sort,
            course: query.course,
        });

        const result: ListResult = {
            items: items.map((row) => ({
                id: row.id,
                name: row.name,
                email: row.email,
                phone: row.phone,
                course: row.course,
                semester: row.semester,
                createdAt: row.created_at,
                process: { id: row.process_id, label: row.process_label },
            })),
            pagination: {
                page: query.page,
                perPage: query.per_page,
                total,
                totalPages: Math.ceil(total / query.per_page),
            },
        };

        await this.cache?.set(cacheKey, result);

        return right(result);
    }

    // ------------------------------------------------------------
    // Detalhe
    // ------------------------------------------------------------

    /**
     * Sem cache: é uma linha só, lida sob demanda quando alguém abre o painel
     * — cachear pagaria a complexidade da chave por leitura que já é barata.
     */
    async detail(id: string, role: string): Promise<Either<CandidateNotFoundError, CandidateDetail>> {
        const includeDemographics = role === ROLES.ADMIN;
        const row = await this.dashboard.findDetail(id, includeDemographics);

        if (!row) {
            return left(new CandidateNotFoundError());
        }

        if (row.referral_source === null || row.experience === null || row.motivation === null) {
            // Invariante: candidato e questionário são gravados no mesmo
            // `db.batch`. Chegar aqui é corrupção de dado, não erro do
            // cliente — 500 é a resposta honesta, e um 404 esconderia o
            // problema fingindo que a pessoa não existe.
            throw new Error(`Candidato ${id} sem inscrição associada`);
        }

        return right({
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            course: row.course,
            semester: row.semester,
            createdAt: row.created_at,
            process: { id: row.process_id, label: row.process_label },
            application: {
                referralSource: row.referral_source,
                referralSourceOther: row.referral_source_other,
                experience: row.experience,
                motivation: row.motivation,
                saturdayRestriction: row.saturday_restriction === 1,
                specialNeeds: row.special_needs === 1,
                // Defesa em profundidade (FR-004): mesmo que uma anomalia de dado deixe texto
                // gravado com o boolean em false, a leitura nunca expõe — a garantia não
                // depende só do caminho de escrita em `CandidateService.register`.
                specialNeedsDescription: row.special_needs === 1 ? row.special_needs_description : null,
            },
            // Ausente para `avaliador` — o repositório nem leu as colunas.
            ...(row.gender && row.ethnicity ? { demographics: { gender: row.gender, ethnicity: row.ethnicity } } : {}),
        });
    }

    // ------------------------------------------------------------
    // Catálogo de edições
    // ------------------------------------------------------------

    /**
     * Resolve a corrente ANTES de listar: `resolveCurrent` a cria sob demanda
     * (FEAT-0005, seção 4.1.1), então na ordem inversa o primeiro acesso de
     * cada semestre devolveria um seletor sem a edição em curso.
     */
    async editions(now: Date = new Date()): Promise<Either<NoActiveSelectionProcessError, EditionsResult>> {
        const currentResult = await this.resolveCurrentProcess(now);
        if (currentResult.isLeft()) {
            return left(currentResult.value);
        }
        const current = currentResult.value;
        const editions = await this.processes.listAll();

        return right({
            editions: editions.map(toSummary),
            current: toSummary(current),
        });
    }

    // ------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------

    private async resolveScope(
        processId: string | undefined,
        now: Date,
    ): Promise<Either<ScopeError, ResolvedScope>> {
        if (processId === ALL_EDITIONS) {
            return right({ kind: "all" });
        }

        if (processId) {
            const process = await this.processes.findById(processId);
            return process ? right({ kind: "edition", process }) : left(new SelectionProcessNotFoundError());
        }

        const currentResult = await this.resolveCurrentProcess(now);
        return currentResult.isLeft()
            ? left(currentResult.value)
            : right({ kind: "edition", process: currentResult.value });
    }

    /** Traduz a falha técnica do repositório em erro de domínio — igual a `CheckinService`. */
    private async resolveCurrentProcess(
        now: Date,
    ): Promise<Either<NoActiveSelectionProcessError, SelectionProcessRow>> {
        try {
            return right(await this.processes.resolveCurrent(now));
        } catch (err) {
            logger.error("dashboard.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }

    private publicScope(scope: ResolvedScope): DashboardScope {
        return scope.kind === "all" ? { kind: "all" } : { kind: "edition", process: toSummary(scope.process) };
    }

    private scopeKey(scope: ResolvedScope): string {
        // O id RESOLVIDO, nunca "current": na virada de semestre a chave
        // literal continuaria servindo os números da edição anterior.
        return scope.kind === "all" ? ALL_EDITIONS : scope.process.id;
    }

    /**
     * **O papel entra na chave.** Sem isso, um `avaliador` recebe a resposta
     * cacheada de um `admin` — com demografia. É o bug mais perigoso desta
     * feature, e o mais silencioso: nada na tela denuncia.
     *
     * Vale também para a listagem, cujo corpo hoje não depende do papel: o
     * custo é dobrar as chaves de um cache de 60s, e o benefício é que
     * acrescentar um campo restrito ali amanhã não vira vazamento.
     */
    private keyFor(resource: string, role: string, parts: string[]): string {
        return ["dashboard", resource, role, ...parts].join(":");
    }
}

function toSummary(process: SelectionProcessRow): SelectionProcessSummary {
    return { id: process.id, label: process.label };
}

/**
 * Soma as linhas `(valor, edição)` por valor, anexando a quebra por edição
 * quando o comparativo pede.
 *
 * **Ordenação:** chaves numéricas (semestre) sobem por valor — um eixo de
 * semestres ordenado por contagem é ilegível. As demais descem por contagem,
 * com desempate alfabético para a série não trocar de ordem entre duas
 * requisições com os mesmos números.
 */
function rollup<K extends string | number>(
    rows: DistributionRow[],
    editions: SelectionProcessRow[],
    byEdition: boolean,
): DistributionItem<K>[] {
    const editionById = new Map(editions.map((process, index) => [process.id, { process, index }]));
    const buckets = new Map<K, DistributionItem<K>>();

    for (const row of rows) {
        // O `key` vem cru do D1 como `string | number`; o tipo estreito é
        // afirmado, não verificado. A garantia está a montante: `course`,
        // `gender`, `ethnicity` e `referral_source` são validados por Zod na
        // inscrição, e todos menos `course` têm CHECK no banco. Mesma
        // premissa que `CandidateWithCheckinRow` já assume no check-in.
        const key = row.key as K;
        const bucket = buckets.get(key) ?? { key, count: 0, ...(byEdition ? { byEdition: [] } : {}) };
        bucket.count += row.count;

        if (byEdition) {
            const edition = editionById.get(row.process_id);
            if (edition) {
                bucket.byEdition?.push({ process: toSummary(edition.process), count: row.count });
            }
        }

        buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
        // `listAll` já vem da mais recente para a mais antiga — a legenda do
        // comparativo herda essa ordem em vez da ordem de chegada do GROUP BY.
        bucket.byEdition?.sort(
            (a, b) => (editionById.get(a.process.id)?.index ?? 0) - (editionById.get(b.process.id)?.index ?? 0),
        );
    }

    return [...buckets.values()].sort((a, b) => {
        if (typeof a.key === "number" && typeof b.key === "number") {
            return a.key - b.key;
        }
        return b.count - a.count || String(a.key).localeCompare(String(b.key));
    });
}

/**
 * `byDay` não passa por `rollup`: aqui a ordem é CRONOLÓGICA, não por
 * contagem, e os dias sem inscrição precisam aparecer com `count: 0` — sem
 * isso o gráfico de linha (FEAT-0007-UI, seção 5.1) mostraria só os dias com
 * dado, escondendo os intervalos parados como se não existissem.
 *
 * O intervalo preenchido vai do primeiro ao último dia com QUALQUER
 * inscrição no recorte, nunca até "hoje": numa edição encerrada isso
 * estenderia a linha com uma cauda de zeros sem significado.
 *
 * No comparativo, cada edição é zero-preenchida em CADA dia do intervalo —
 * diferente de `rollup`, que simplesmente omite a edição sem dado naquele
 * valor (uma barra ausente já lê como zero; um ponto ausente numa linha vira
 * um buraco no traçado, que é outra coisa).
 */
function rollupDaily(
    rows: DistributionRow[],
    editions: SelectionProcessRow[],
    byEdition: boolean,
): DistributionItem<string>[] {
    if (rows.length === 0) return [];

    const totalsByDay = new Map<string, number>();
    const perEditionByDay = new Map<string, Map<string, number>>();

    for (const row of rows) {
        const day = String(row.key);
        totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + row.count);

        if (byEdition) {
            const byProcess = perEditionByDay.get(day) ?? new Map<string, number>();
            byProcess.set(row.process_id, (byProcess.get(row.process_id) ?? 0) + row.count);
            perEditionByDay.set(day, byProcess);
        }
    }

    const daysWithData = [...totalsByDay.keys()].sort();
    const firstDay = daysWithData[0];
    const lastDay = daysWithData[daysWithData.length - 1];

    return daysBetween(firstDay, lastDay).map((day) => ({
        key: day,
        count: totalsByDay.get(day) ?? 0,
        ...(byEdition
            ? {
                  byEdition: editions.map((process) => ({
                      process: toSummary(process),
                      count: perEditionByDay.get(day)?.get(process.id) ?? 0,
                  })),
              }
            : {}),
    }));
}

/** Todas as datas entre `from` e `to`, inclusive — ambas em `AAAA-MM-DD`. */
function daysBetween(from: string, to: string): string[] {
    const days: string[] = [];
    let cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);

    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return days;
}
