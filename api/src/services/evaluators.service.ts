import type { EvaluatorRole, EvaluatorRoleFilter, EvaluatorSummary, MemberStatus, SelectionProcessRow } from "shared";

import { type Either, left, right } from "../core/either";
import { NoActiveSelectionProcessError } from "../core/errors/checkin-errors";
import { EvaluatorNotFoundError } from "../core/errors/evaluator-errors";
import { logger } from "../lib/logger";
import type { EvaluatorRow, EvaluatorsRepository } from "../repositories/evaluators.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

export type EvaluatorListError = NoActiveSelectionProcessError;
export type EvaluatorSetRoleError = NoActiveSelectionProcessError | EvaluatorNotFoundError;

export class EvaluatorsService {
    constructor(
        private readonly repository: EvaluatorsRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    async list(
        filter: EvaluatorRoleFilter = "all",
        now: Date = new Date(),
    ): Promise<Either<EvaluatorListError, EvaluatorSummary[]>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const rows = await this.repository.listWithRole(process.id);
        const summaries = rows.map(toSummary);

        // Filtro em memória (R4) — lista de dezenas de avaliadores, sem custo relevante.
        if (filter === "all") return right(summaries);
        return right(summaries.filter((evaluator) => evaluator.role === filter));
    }

    async setRole(
        userId: string,
        role: EvaluatorRole,
        now: Date = new Date(),
    ): Promise<Either<EvaluatorSetRoleError, EvaluatorSummary>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        // Checa antes de mexer em `edition_hosts` — a FK em `user_id` rejeitaria
        // um id inexistente, mas um admin/desativado passaria a FK e ficaria
        // marcado "host" sem nunca aparecer na listagem (R5 os exclui).
        const existing = await this.repository.findByUserId(process.id, userId);
        if (!existing) {
            logger.warn("evaluators.set_role.not_found", { userId });
            return left(new EvaluatorNotFoundError());
        }

        if (role === "host") {
            await this.repository.markHost(process.id, userId);
        } else {
            await this.repository.unmarkHost(process.id, userId);
        }

        const updated = await this.repository.findByUserId(process.id, userId);
        logger.info("evaluators.set_role.success", { userId, processId: process.id, role });
        return right(toSummary(updated!));
    }

    /** Mesmo padrão de `checkin.service.ts` — `resolveCurrent()` não deveria lançar, mas a guarda existe. */
    private async resolveCurrentProcess(
        now: Date,
    ): Promise<Either<NoActiveSelectionProcessError, SelectionProcessRow>> {
        try {
            const process = await this.processes.resolveCurrent(now);
            return right(process);
        } catch (err) {
            logger.error("evaluators.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}

function toSummary(row: EvaluatorRow): EvaluatorSummary {
    return {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        // Sem checagem: já passou por `isRecognizedMemberStatus` na criação da conta
        // (FEAT-0003/0008) — mesmo nível de confiança de signup-requests.service.ts:264.
        memberStatus: row.memberStatus as MemberStatus,
        role: row.role,
    };
}
