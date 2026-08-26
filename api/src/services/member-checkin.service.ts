import type { MemberCheckinItem, MemberCheckinSummary, SelectionProcessRow, SelectionProcessSummary } from "shared";

import { type Either, left, right } from "../core/either";
import { NoActiveSelectionProcessError } from "../core/errors/checkin-errors";
import { EvaluatorNotFoundError } from "../core/errors/evaluator-errors";
import { NoEvaluatorsInEditionError } from "../core/errors/member-checkin-errors";
import { logger } from "../lib/logger";
import type { MemberCheckinRepository } from "../repositories/member-checkin.repository";
import type { SelectionProcessRepository } from "../repositories/selection-process.repository";

type ListResult = {
    process: SelectionProcessSummary;
    items: MemberCheckinItem[];
    summary: MemberCheckinSummary;
};

type CheckinResult = { userId: string; checkedInAt: string };

export type MemberCheckinListError = NoActiveSelectionProcessError | NoEvaluatorsInEditionError;
export type MemberCheckinSetError = NoActiveSelectionProcessError | EvaluatorNotFoundError;

/** Espelha `CheckinService` (candidatos, FEAT-0005) e `EvaluatorsService` (FEAT-0009), para avaliador/host. */
export class MemberCheckinService {
    constructor(
        private readonly repository: MemberCheckinRepository,
        private readonly processes: SelectionProcessRepository,
    ) {}

    /** FR-001/FR-006. FR-009: distingue "sem elegíveis" de "sem processo corrente" (FR-008). */
    async list(now: Date = new Date()): Promise<Either<MemberCheckinListError, ListResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        const rows = await this.repository.listWithCheckin(process.id);
        if (rows.length === 0) {
            return left(new NoEvaluatorsInEditionError());
        }

        const items: MemberCheckinItem[] = rows.map((row) => ({
            userId: row.user_id,
            name: row.name,
            email: row.email,
            role: row.role,
            checkedInAt: row.checked_in_at,
        }));

        const checkedIn = items.filter((item) => item.checkedInAt !== null).length;

        return right({
            process: { id: process.id, label: process.label },
            items,
            summary: { total: items.length, checkedIn },
        });
    }

    /** `PUT`: idempotente — marcar quem já está presente não é erro, devolve o `checkedInAt` original. */
    async markPresent(userId: string, actorId: string, now: Date = new Date()): Promise<Either<MemberCheckinSetError, CheckinResult>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        if (!(await this.repository.isEligible(process.id, userId))) {
            logger.warn("member_checkin.mark.not_eligible", { userId });
            return left(new EvaluatorNotFoundError());
        }

        const checkin = await this.repository.upsertCheckin({ userId, processId: process.id, checkedInBy: actorId });

        return right({ userId, checkedInAt: checkin.checked_in_at });
    }

    /** `DELETE`: idempotente — desmarcar quem já está ausente não é erro. */
    async unmarkPresent(userId: string, actorId: string, now: Date = new Date()): Promise<Either<MemberCheckinSetError, void>> {
        const processResult = await this.resolveCurrentProcess(now);
        if (processResult.isLeft()) return left(processResult.value);
        const process = processResult.value;

        if (!(await this.repository.isEligible(process.id, userId))) {
            logger.warn("member_checkin.unmark.not_eligible", { userId });
            return left(new EvaluatorNotFoundError());
        }

        await this.repository.removeCheckin({ userId, processId: process.id, actorId });

        return right(undefined);
    }

    /** Mesmo padrão de `checkin.service.ts`/`evaluators.service.ts` — `resolveCurrent()` não deveria lançar, mas a guarda existe. */
    private async resolveCurrentProcess(now: Date): Promise<Either<NoActiveSelectionProcessError, SelectionProcessRow>> {
        try {
            const process = await this.processes.resolveCurrent(now);
            return right(process);
        } catch (err) {
            logger.error("member_checkin.resolve_process.failed", {
                error: err instanceof Error ? err.message : String(err),
            });
            return left(new NoActiveSelectionProcessError());
        }
    }
}
