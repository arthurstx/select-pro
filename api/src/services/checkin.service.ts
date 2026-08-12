import type {
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
import { logger } from "../lib/logger";
import { selectionProcessWindowFor } from "../lib/selection-process-window";
import type { CandidateRepository } from "../repositories/candidates.repository";
import type { CheckinRepository } from "../repositories/checkin.repository";

type ListResult = {
    process: SelectionProcessSummary;
    items: CandidateCheckinItem[];
    pagination: PaginationMeta;
};

type CheckinResult = { candidateId: string; checkedInAt: string };

export class CheckinService {
    constructor(
        private readonly candidates: CandidateRepository,
        private readonly checkins: CheckinRepository,
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

        const { items, total } = await this.checkins.listCandidates({
            processId: process.id,
            startsAt: process.starts_at,
            endsAt: process.ends_at,
            search: query.search,
            status: query.status,
            page: query.page,
            perPage: query.per_page,
        });

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
            })),
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

        return right(undefined);
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
            const process = await this.checkins.resolveProcess(selectionProcessWindowFor(now));
            return right(process);
        } catch (err) {
            logger.error("checkin.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}
