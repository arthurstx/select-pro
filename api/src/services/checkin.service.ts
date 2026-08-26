import type {
    AttendanceSummary,
    CandidateCheckinItem,
    ListCandidatesQuery,
    PaginationMeta,
    SelectionProcessRow,
    SelectionProcessSummary,
} from "shared";

import { type Either, left, right } from "../core/either";
import {
    CandidateNotFoundError,
    CandidateNotInActiveProcessError,
    NoActiveSelectionProcessError,
} from "../core/errors/checkin-errors";
import { type CachedListParams, type CachedListResult, CheckinListCache } from "../lib/checkin-list-cache";
import { logger } from "../lib/logger";
import type { CandidateRepository } from "../repositories/candidates.repository";
import type { CheckinRepository } from "../repositories/checkin.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type ListResult = {
    process: SelectionProcessSummary;
    items: CandidateCheckinItem[];
    attendanceSummary: AttendanceSummary;
    /** Contador "X de Y presentes" do cabeçalho — nunca filtrado por status, ver checkin.repository.ts. */
    totalCandidates: number;
    pagination: PaginationMeta;
};

type CheckinResult = { candidateId: string; checkedInAt: string };

export class CheckinService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly checkins: CheckinRepository,
        private readonly processes: SelectionProcessRepository,
        /**
         * Opcional só para não obrigar todo teste/uso a passar um KV —
         * quando ausente, o service se comporta como se o cache estivesse
         * sempre frio (lê e escreve direto no D1, sem cache-aside nem
         * invalidação). Em produção `checkin.routes.ts` sempre injeta um.
         */
        private readonly listCache?: CheckinListCache,
    ) {}

    /** Busca, filtro e paginação resolvidos no banco — nunca no cliente (FEAT-0005, seção 4.2). */
    async listCandidates(
        query: ListCandidatesQuery,
        now: Date = new Date(),
    ): Promise<Either<NoActiveSelectionProcessError, ListResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) {
            return left(processResult.value);
        }
        const process = processResult.value;

        const cacheParams: CachedListParams = {
            page: query.page,
            perPage: query.per_page,
            status: query.status,
            search: query.search,
            course: query.course,
        };

        const cached = await this.listCache?.get(process.id, cacheParams);
        const { items, total, totalCandidates, attendance } = cached ?? (await this.fetchAndCacheList(process, cacheParams));

        return right({
            process: { id: process.id, label: process.label },
            items: items.map((row) => ({
                id: row.id,
                name: row.name,
                email: row.email,
                phone: row.phone,
                course: row.course,
                semester: row.semester,
                checkedInAt: row.checked_in_at,
                // FEAT-0010, US3 (D7): derivado, nunca persistido como campo novo do candidato.
                attendance: row.checked_in_at === null ? null : row.saturday_restriction === 1 ? "online" : "presencial",
            })),
            attendanceSummary: attendance,
            totalCandidates,
            pagination: {
                page: query.page,
                perPage: query.per_page,
                total,
                totalPages: Math.ceil(total / query.per_page),
            },
        });
    }

    /** Marcar presença. `PUT`: idempotente — E4 (já confirmada) não é erro, ver FEAT-0005 seção 4.3/5. */
    async markPresent(
        candidateId: string,
        actorId: string,
        now: Date = new Date(),
    ): Promise<
        Either<CandidateNotFoundError | NoActiveSelectionProcessError | CandidateNotInActiveProcessError, CheckinResult>
    > {
        const candidate = await this.candidates.findById(candidateId);
        if (!candidate) {
            return left(new CandidateNotFoundError());
        }

        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) {
            return left(processResult.value);
        }
        const process = processResult.value;

        if (candidate.created_at < process.starts_at || candidate.created_at > process.ends_at) {
            return left(new CandidateNotInActiveProcessError());
        }

        const checkin = await this.checkins.upsertCheckin({
            candidateId,
            processId: process.id,
            checkedInBy: actorId,
        });

        // Depois da escrita, nunca antes: invalidar cedo demais deixaria uma
        // leitura concorrente repopular o cache com o estado anterior.
        await this.listCache?.invalidate(process.id);

        return right({ candidateId, checkedInAt: checkin.checked_in_at });
    }

    /** Desmarcar presença. `DELETE`: idempotente — E5 (já ausente) não é erro, ver FEAT-0005 seção 4.4/5. */
    async unmarkPresent(
        candidateId: string,
        actorId: string,
        now: Date = new Date(),
    ): Promise<Either<CandidateNotFoundError | NoActiveSelectionProcessError, void>> {
        const candidate = await this.candidates.findById(candidateId);
        if (!candidate) {
            return left(new CandidateNotFoundError());
        }

        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) {
            return left(processResult.value);
        }
        const process = processResult.value;

        // Sem checagem de E3 aqui: desmarcar uma presença que nunca existiu
        // (candidato de outra edição, por exemplo) já é E5 — no-op, sem erro.
        await this.checkins.removeCheckin({ candidateId, processId: process.id, actorId });
        await this.listCache?.invalidate(process.id);

        return right(undefined);
    }

    /** Lê do D1 no cache-miss e povoa o cache antes de devolver — chamado no máximo uma vez por 15s por variante/processo. */
    private async fetchAndCacheList(
        process: SelectionProcessRow,
        params: CachedListParams,
    ): Promise<CachedListResult> {
        const result = await this.checkins.listCandidates({
            processId: process.id,
            startsAt: process.starts_at,
            endsAt: process.ends_at,
            search: params.search,
            status: params.status,
            course: params.course,
            page: params.page,
            perPage: params.perPage,
        });

        await this.listCache?.set(process.id, params, result);

        return result;
    }

    /**
     * Resolve a edição corrente traduzindo a falha técnica do repositório
     * (guarda de invariante — não deveria ser alcançável com a criação sob
     * demanda) em erro de domínio. FEAT-0005, seção 13: "E2 continua sendo
     * 409, e não 500, apesar de sinalizar defeito" — um código específico
     * poupa quem for diagnosticar de ir aos logs para descobrir o óbvio.
     */
    private async resolveCurrentProcess(
        now: Date,
    ): Promise<Either<NoActiveSelectionProcessError, SelectionProcessRow>> {
        try {
            const process = await this.processes.resolveCurrent(now);
            return right(process);
        } catch (err) {
            logger.error("checkin.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}
